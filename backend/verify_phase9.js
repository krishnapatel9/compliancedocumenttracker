const fs = require('fs');
const path = require('path');
const http = require('http');

const API_PORT = 5000;
const BASE_URL = `http://localhost:${API_PORT}`;

// Helper utility to make HTTP requests
const makeRequest = (urlPath, options = {}) => {
    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}${urlPath}`;
        const parsedUrl = new URL(url);

        const reqOpts = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const req = http.request(reqOpts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = data;
                try {
                    parsed = JSON.parse(data);
                } catch (e) { }
                resolve({ status: res.statusCode, body: parsed });
            });
        });

        req.on('error', err => reject(err));
        if (options.body) {
            req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }
        req.end();
    });
};

const runTests = async () => {
    console.log('===================================================');
    console.log('🚀 Phase 9 Compliance Suite Verification Script');
    console.log('===================================================\n');

    let token = '';
    let testDocId = '';

    try {
        // 1. Authenticate Admin
        console.log('[1] Logging in as Admin...');
        const loginRes = await makeRequest('/api/auth/login', {
            method: 'POST',
            body: { email: 'admin@compliance.com', password: 'adminpassword' }
        });

        if (loginRes.status !== 200 || !loginRes.body.token) {
            throw new Error(`Authentication failed. Status: ${loginRes.status}, Body: ${JSON.stringify(loginRes.body)}`);
        }

        token = loginRes.body.token;
        console.log('✔ Authenticated successfully!\n');

        // 2. Create a mock document for validation mapping
        console.log('[2] Uploading a mock PDF document...');

        // Multi-part form-data helper manual construct
        const boundary = '----TestBoundary' + Math.random().toString(36).substring(2);

        // Magic Byte PDF content: %PDF-1.4 followed by random bytes
        const pdfContent = Buffer.from('%PDF-1.4 mock compliance cert details and keys content files');

        // Set expiry date to 7 days from now at noon local time to avoid timezone offset mismatches
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 7);
        expDate.setHours(12, 0, 0, 0);
        const expiryDateString = expDate.toISOString();

        const payloadParts = [
            `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nPhase 9 Test ISO Certificate\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\ncertificate\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="issueDate"\r\n\r\n2025-01-01\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="expiryDate"\r\n\r\n${expiryDateString}\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="notifyEmail"\r\n\r\nauditor@docs.com\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="description"\r\n\r\nTest model mapping descriptor notes\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="iso_cert.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
        ];

        let reqBody = Buffer.alloc(0);
        for (const part of payloadParts) {
            reqBody = Buffer.concat([reqBody, Buffer.from(part)]);
        }
        reqBody = Buffer.concat([reqBody, pdfContent, Buffer.from(`\r\n--${boundary}--\r\n`)]);

        // POST upload request
        const createRes = await new Promise((resolve, reject) => {
            const req = http.request({
                hostname: 'localhost',
                port: API_PORT,
                path: '/api/documents',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': reqBody.length,
                    'Authorization': `Bearer ${token}`
                }
            }, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data) });
                    } catch (e) {
                        resolve({ status: res.statusCode, body: data });
                    }
                });
            });
            req.on('error', reject);
            req.write(reqBody);
            req.end();
        });

        if (createRes.status !== 201) {
            throw new Error(`Upload failed. Status: ${createRes.status}, Body: ${JSON.stringify(createRes.body)}`);
        }

        testDocId = createRes.body.document.id;
        console.log(`✔ Uploaded test PDF! Document ID: ${testDocId}\n`);

        // 3. Link document to a compliance control
        console.log('[3] Linking document to ISO 27001 control A.12.4.1...');
        const linkRes = await makeRequest('/api/frameworks/link', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: {
                framework: 'ISO27001',
                controlCode: 'A.12.4.1',
                documentId: testDocId
            }
        });

        if (linkRes.status !== 200) {
            throw new Error(`Link mapping failed. Status: ${linkRes.status}, Body: ${JSON.stringify(linkRes.body)}`);
        }
        console.log('✔ Linked successfully!\n');

        // 4. Fetch frameworks mapping list to verify
        console.log('[4] Verifying control mapping exists on endpoint...');
        const listRes = await makeRequest('/api/frameworks', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (listRes.status !== 200) {
            throw new Error(`Fetch frameworks failed. Status: ${listRes.status}`);
        }

        const controlEntry = listRes.body.find(c => c.framework === 'ISO27001' && c.controlCode === 'A.12.4.1');
        if (!controlEntry || !controlEntry.document || controlEntry.document.id !== testDocId) {
            throw new Error(`Control CC1.1 mapping audit failed. Entry content: ${JSON.stringify(controlEntry)}`);
        }
        console.log(`✔ Control mapping verified! (Title: "${controlEntry.document.title}", Status: "${controlEntry.document.status}")\n`);

        // 5. Trigger manual cron check to write warnings log
        console.log('[5] Triggering background cron alert check to send warnings...');
        const cronRes = await makeRequest('/api/services/cron/trigger', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (cronRes.status !== 200) {
            throw new Error(`Cron trigger failed. Status: ${cronRes.status}, Body: ${JSON.stringify(cronRes.body)}`);
        }
        console.log(`✔ Cron audit completed. Mailers sent: ${cronRes.body.sentCount}\n`);

        // 6. Fetch notification alerts log to verify warnings log inclusion
        console.log('[6] Verifying warnings database log table has entries...');
        const alertsRes = await makeRequest('/api/notifications', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (alertsRes.status !== 200) {
            throw new Error(`Fetch notifications logs failed. Status: ${alertsRes.status}`);
        }

        const linkedAlert = alertsRes.body.find(a => a.document && a.document.id === testDocId);
        if (!linkedAlert) {
            throw new Error(`Warning log matching test document was not written to notifications table.`);
        }
        console.log(`✔ Warning ledger log verified! (Sent alert matching "${linkedAlert.document.title}" on DaysBefore: ${linkedAlert.daysBefore})\n`);

        // 7. Verify expanded dashboard analytics metrics
        console.log('[7] Auditing expanded dashboard analytics metrics keys...');
        const dashRes = await makeRequest('/api/dashboard', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (dashRes.status !== 200) {
            throw new Error(`Dashboard fetch failed. Status: ${dashRes.status}`);
        }

        const keys = Object.keys(dashRes.body);
        const requiredKeys = ['healthRate', 'warningsCount', 'monthlyUploads', 'expiring60d', 'expiring90d'];
        for (const k of requiredKeys) {
            if (!keys.includes(k)) {
                throw new Error(`Dashboard response missing analytics key: ${k}`);
            }
        }
        console.log(`✔ Analytics dashboard verified! (Rating: ${dashRes.body.healthRate}%, WarnCounts: ${dashRes.body.warningsCount}, UploadGraphSegments: ${dashRes.body.monthlyUploads.length})\n`);

        // 8. Unlink document mapping
        console.log('[8] Testing unlinking mapping option...');
        const unlinkRes = await makeRequest('/api/frameworks/link', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: {
                framework: 'ISO27001',
                controlCode: 'A.12.4.1',
                documentId: null
            }
        });

        if (unlinkRes.status !== 200 || unlinkRes.body.documentId !== null) {
            throw new Error(`Unlinking failed. Body: ${JSON.stringify(unlinkRes.body)}`);
        }
        console.log('✔ Unlinked document mapping successfully!\n');

        // Cleanup: delete mock document
        console.log('[9] Cleaning up local database test document...');
        const delRes = await makeRequest(`/api/documents/${testDocId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (delRes.status !== 200) {
            throw new Error(`Deletion cleanup failed. Status: ${delRes.status}`);
        }
        console.log('✔ Deletion cleanup success!\n');

        console.log('===================================================');
        console.log('🎉 PHASE 9 SECURITY & FEATURES INTEGRATIONS VERIFIED SUCCESSFULLY');
        console.log('===================================================');
        process.exit(0);

    } catch (error) {
        console.error('❌ Integration Verification Failed:', error);

        // Cleanup if necessary
        if (testDocId) {
            await makeRequest(`/api/documents/${testDocId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            }).catch(() => { });
        }
        process.exit(1);
    }
};

runTests();
