const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:5000/api';

async function runTests() {
    console.log('--- STARTING SECURITY VERIFICATION TESTS ---');

    // 1. Verify Helmet Headers on /api/health
    try {
        console.log('\n[1] Checking Helmet Security headers...');
        const healthRes = await fetch(`${API_URL}/health`);
        const headers = healthRes.headers;

        console.log('- x-powered-by header in response:', headers.get('x-powered-by') || 'NOT FOUND (SECURE)');
        console.log('- content-security-policy:', headers.get('content-security-policy') ? 'FOUND (SECURE)' : 'NOT FOUND');
    } catch (err) {
        console.error('Error during Helmet test:', err.message);
    }

    // 2. Verify Rate Limiter by making 6 rapid login requests
    console.log('\n[2] Checking auth/login Rate Limiter...');
    let hitRateLimit = false;
    for (let i = 1; i <= 6; i++) {
        try {
            console.log(`Sending login attempt #${i}...`);
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'invalid@compliance.com',
                    password: 'wrongpassword'
                })
            });

            if (res.status === 429) {
                hitRateLimit = true;
                console.log(`- Request #${i} blocked! Status: 429 Too Many Requests (SECURE)`);
                const json = await res.json();
                console.log('  Response:', JSON.stringify(json));
                break;
            } else {
                console.log(`- Request #${i} response status: ${res.status}`);
            }
        } catch (err) {
            console.log(`- Request #${i} failed: ${err.message}`);
        }
    }
    if (!hitRateLimit) {
        console.warn('⚠️ WARNING: Rate limiter did not block 6 login attempts!');
    }

    // 3. Verify Magic Bytes PDF Validation
    console.log('\n[3] Checking Magic Bytes Upload Validation...');
    try {
        // Create a fake PDF file (plain text content, but saved as fake.pdf)
        const fakePdfPath = path.resolve('fake.pdf');
        fs.writeFileSync(fakePdfPath, 'Hello compliance tracker, this is normal text.');

        // Log in to get token
        console.log('Logging in as admin...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@compliance.com',
                password: 'adminpassword'
            })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;

        // Construct raw multipart body manually to avoid external libraries
        const boundary = '----WebKitFormBoundaryE7n5LzE2yQYvU6t8';
        const fileContent = fs.readFileSync(fakePdfPath);

        const bodyParts = [
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fake.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
            fileContent,
            `\r\n--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nIntruder Document\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\nPERMIT\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="issueDate"\r\n\r\n2026-07-20\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="expiryDate"\r\n\r\n2027-07-20\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="notifyEmail"\r\n\r\nadmin@compliance.com\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="description"\r\n\r\nSpoof file check\r\n`,
            `--${boundary}--\r\n`
        ];

        // Combine parts into single buffer
        let totalLength = 0;
        const mappedParts = bodyParts.map(part => {
            const buf = typeof part === 'string' ? Buffer.from(part) : part;
            totalLength += buf.length;
            return buf;
        });
        const requestBody = Buffer.concat(mappedParts, totalLength);

        console.log('Attempting spoofed upload call...');
        const uploadRes = await fetch(`${API_URL}/documents`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': requestBody.length
            },
            body: requestBody
        });

        if (uploadRes.status === 400) {
            console.log('- Raw text file was successfully rejected with Status: 400 Bad Request (SECURE)');
            const errorJson = await uploadRes.json();
            console.log('  Response:', JSON.stringify(errorJson));
        } else {
            console.error(`⚠️ WARNING: Upload status was ${uploadRes.status}. Expected 400.`);
            const text = await uploadRes.text();
            console.log('  Response:', text);
        }
    } catch (err) {
        console.error('Error during upload test:', err.message);
    } finally {
        if (fs.existsSync('fake.pdf')) {
            fs.unlinkSync('fake.pdf');
        }
    }
}

// Wait briefly for server startup, then run tests
setTimeout(runTests, 1000);
