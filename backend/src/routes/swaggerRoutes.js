const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Render Swagger UI Page using unpkg CDN bundles
router.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>DocShield UI OpenAPI Documentations</title>
    <!-- Styles required for Swagger UI -->
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
    <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.11.0/favicon-32x32.png" sizes="32x32" />
    <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.11.0/favicon-16x16.png" sizes="16x16" />
    <style>
        html { box-sizing: border-box; overflow: -grow-y; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin: 0; background: #1a1a1a; }
        /* Dark-mode enhancements for Swagger Header */
        .swagger-ui .topbar { background-color: #111111; border-bottom: 2px solid #3b82f6; }
        .swagger-ui .info .title { color: #f3f4f6; }
        .swagger-ui .scheme-container { background: #262626; box-shadow: none; border-bottom: 1px solid #404040; }
        .swagger-ui .scheme-container select { background: #333333; color: white; border: 1px solid #555555; }
        .swagger-ui { filter: invert(0.9) hue-rotate(180deg); } /* Dark theme trick for clean Swagger page */
        .swagger-ui .topbar img { filter: invert(1) hue-rotate(180deg); }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            // Build Swagger UI engine pointing back to our local JSON route
            window.ui = SwaggerUIBundle({
                url: '/api-docs/json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "BaseLayout"
            });
        };
    </script>
</body>
</html>
    `);
});

// Serve raw OpenAPI OpenAPI specifications JSON
router.get('/json', (req, res) => {
    const specPath = path.join(__dirname, '../docs/openapi.json');
    if (!fs.existsSync(specPath)) {
        return res.status(404).json({ error: 'Swagger schema manifest file not found' });
    }
    const json = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    return res.status(200).json(json);
});

module.exports = router;
