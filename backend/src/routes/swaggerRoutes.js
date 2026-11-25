const express = require('express');
const path = require('path');
const swaggerUiDist = require('swagger-ui-dist');

const router = express.Router();

// Swagger UI is served from the installed package, not a CDN: no third-party scripts and
// no CSP exceptions. The page uses only same-origin files (no inline script).
router.use('/assets', express.static(swaggerUiDist.getAbsoluteFSPath(), { index: false }));

router.get('/docs.css', (req, res) => {
    res.type('text/css').send(`
html { box-sizing: border-box; }
*, *:before, *:after { box-sizing: inherit; }
body { margin: 0; background: #1a1a1a; }
.swagger-ui { filter: invert(0.9) hue-rotate(180deg); }
.swagger-ui .topbar { display: none; }
`);
});

router.get('/init.js', (req, res) => {
    res.type('application/javascript').send(`
window.onload = function () {
    window.ui = SwaggerUIBundle({
        url: '/api-docs/json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'BaseLayout'
    });
};
`);
});

router.get('/', (req, res) => {
    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>DocShield API Documentation</title>
    <link rel="stylesheet" href="/api-docs/assets/swagger-ui.css">
    <link rel="stylesheet" href="/api-docs/docs.css">
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="/api-docs/assets/swagger-ui-bundle.js"></script>
    <script src="/api-docs/assets/swagger-ui-standalone-preset.js"></script>
    <script src="/api-docs/init.js"></script>
</body>
</html>`);
});

// Raw OpenAPI document (kept in sync with the routes by tests/openapi.test.js)
router.get('/json', (req, res) => {
    res.sendFile(path.join(__dirname, '../docs/openapi.json'));
});

module.exports = router;
