// Keeps src/docs/openapi.json and the Express routes in sync, in both directions.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused:unused@localhost:5432/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const spec = require('../src/docs/openapi.json');
const { createApp } = require('../src/app');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const IGNORED_PREFIXES = ['/api-docs'];

// Turns the regexp Express builds for a mounted router back into its path prefix.
const mountPath = (layer) => {
    const src = layer.regexp.source
        .replace('\\/?(?=\\/|$)', '')
        .replace(/^\^/, '')
        .replace(/\\\//g, '/');
    return src === '' || src === '(?:\\/(?=$))?' ? '' : src.replace(/\(\?:\/\(\?=\$\)\)\?$/, '');
};

const collectRoutes = (stack, prefix = '') => {
    const routes = [];
    for (const layer of stack) {
        if (layer.route) {
            for (const method of Object.keys(layer.route.methods)) {
                routes.push({ method, path: prefix + layer.route.path });
            }
        } else if (layer.name === 'router' && layer.handle.stack) {
            routes.push(...collectRoutes(layer.handle.stack, prefix + mountPath(layer)));
        }
    }
    return routes;
};

const toOpenApiPath = (p) => (p.replace(/\/$/, '') || '/').replace(/:(\w+)/g, '{$1}');

const appRoutes = () =>
    collectRoutes(createApp()._router.stack)
        .map((r) => ({ method: r.method, path: toOpenApiPath(r.path) }))
        .filter((r) => !IGNORED_PREFIXES.some((p) => r.path.startsWith(p)));

const specOperations = () =>
    Object.entries(spec.paths).flatMap(([p, item]) =>
        HTTP_METHODS.filter((m) => item[m]).map((method) => ({ method, path: p })));

const label = (r) => `${r.method.toUpperCase()} ${r.path}`;

test('route walker finds the API', () => {
    assert.ok(appRoutes().length >= 14, `only found: ${appRoutes().map(label).join(', ')}`);
});

test('every Express route is documented', () => {
    const documented = new Set(specOperations().map(label));
    const missing = appRoutes().map(label).filter((l) => !documented.has(l));
    assert.deepEqual(missing, [], `Undocumented routes: ${missing.join(', ')}`);
});

test('every documented operation exists', () => {
    const real = new Set(appRoutes().map(label));
    const stale = specOperations().map(label).filter((l) => !real.has(l));
    assert.deepEqual(stale, [], `Documented but missing: ${stale.join(', ')}`);
});

test('operations have responses and valid security and schema references', () => {
    const schemes = Object.keys(spec.components.securitySchemes);
    const refs = [];
    JSON.stringify(spec, (k, v) => { if (k === '$ref') refs.push(v); return v; });
    for (const ref of refs) {
        const name = ref.replace('#/components/schemas/', '');
        assert.ok(spec.components.schemas[name], `Dangling $ref ${ref}`);
    }
    for (const op of specOperations()) {
        const o = spec.paths[op.path][op.method];
        assert.ok(o.summary, `${label(op)} needs a summary`);
        assert.ok(Object.keys(o.responses || {}).length > 0, `${label(op)} needs responses`);
        for (const req of o.security || []) {
            for (const name of Object.keys(req)) assert.ok(schemes.includes(name), `${label(op)} uses unknown scheme ${name}`);
        }
    }
});

test('/api-docs serves the page and spec with no third-party scripts', async () => {
    const app = createApp();
    const page = await request(app).get('/api-docs');
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.text, /unpkg|https?:\/\//);
    assert.doesNotMatch(page.text, /<script>/); // no inline script, so the CSP can stay strict
    assert.equal((await request(app).get('/api-docs/assets/swagger-ui-bundle.js')).status, 200);
    assert.equal((await request(app).get('/api-docs/init.js')).status, 200);
    const json = await request(app).get('/api-docs/json');
    assert.equal(json.status, 200);
    assert.equal(json.body.openapi, spec.openapi);
    assert.doesNotMatch(page.headers['content-security-policy'], /unsafe-inline.*script-src|script-src[^;]*unsafe-inline/);
});
