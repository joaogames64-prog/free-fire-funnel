const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ============ CONFIG ============
const PORT = process.env.PORT || 8080;
const IRONPAY_TOKEN = process.env.IRONPAY_TOKEN || 'Z9DAYrt7sWMHnbN8gUvwBjeS8A6HcvJRChZ621XV1v54vegMWzQHmzlVgIfs';
const IRONPAY_BASE = 'https://api.ironpayapp.com.br/api/public/v1';
const STATIC_DIR = __dirname;
// ================================

const MIME = {
    '.html':'text/html','.css':'text/css','.js':'application/javascript',
    '.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
    '.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml',
    '.mp4':'video/mp4','.webm':'video/webm','.ico':'image/x-icon',
    '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'
};

function serveStatic(req, res) {
    let filePath = path.join(STATIC_DIR, url.parse(req.url).pathname);
    if (filePath.endsWith('/')) filePath += 'index.html';
    
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, {'Content-Type':'text/plain'});
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, {'Content-Type': contentType});
        res.end(data);
    });
}

function ironpayRequest(method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const separator = endpoint.includes('?') ? '&' : '?';
        const fullUrl = `${IRONPAY_BASE}${endpoint}${separator}api_token=${IRONPAY_TOKEN}`;
        const parsed = url.parse(fullUrl);

        const options = {
            hostname: parsed.hostname,
            port: 443,
            path: parsed.path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (resp) => {
            let data = '';
            resp.on('data', chunk => data += chunk);
            resp.on('end', () => {
                try {
                    resolve({ status: resp.statusCode, data: JSON.parse(data) });
                } catch(e) {
                    resolve({ status: resp.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function readBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch(e) { resolve({}); }
        });
    });
}

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API: Create PIX Transaction
    if (req.method === 'POST' && req.url === '/api/create-pix') {
        try {
            const body = await readBody(req);

            // Amount in centavos (cents)
            const amountCents = Math.round(parseFloat(body.amount || '0') * 100);

            const txPayload = {
                amount: amountCents,
                payment_method: 'pix',
                customer: {
                    name: body.nome || 'Cliente',
                    email: body.email || 'cliente@email.com',
                    phone_number: (body.telefone || '').replace(/\D/g, '') || '11999999999',
                    document: body.cpf || '00000000000',
                    street_name: 'Rua Exemplo',
                    number: '100',
                    complement: '',
                    neighborhood: 'Centro',
                    city: 'São Paulo',
                    state: 'SP',
                    zip_code: '01001000'
                },
                cart: [{
                    title: body.product_title || 'Diamantes Free Fire',
                    price: amountCents,
                    quantity: 1,
                    operation_type: 1,
                    tangible: false
                }],
                expire_in_days: 1,
                transaction_origin: 'api'
            };

            // Add offer_hash if provided
            if (body.offer_hash) {
                txPayload.offer_hash = body.offer_hash;
                txPayload.cart[0].product_hash = body.product_hash || '';
            }

            // Add tracking/UTM data if provided
            if (body.utm_source || body.utm_medium || body.utm_campaign) {
                txPayload.tracking = {
                    src: body.src || '',
                    utm_source: body.utm_source || '',
                    utm_medium: body.utm_medium || '',
                    utm_campaign: body.utm_campaign || '',
                    utm_term: body.utm_term || '',
                    utm_content: body.utm_content || ''
                };
            }

            // Add postback URL if provided
            if (body.postback_url) {
                txPayload.postback_url = body.postback_url;
            }

            console.log(`[PIX] Creating transaction: R$ ${(amountCents/100).toFixed(2)} for ${txPayload.customer.name}`);

            const result = await ironpayRequest('POST', '/transactions', txPayload);

            console.log(`[PIX] Response status: ${result.status}`);

            res.writeHead(result.status, {'Content-Type':'application/json'});
            res.end(JSON.stringify(result.data));

        } catch(err) {
            console.error('[PIX] Error:', err.message);
            res.writeHead(500, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // API: Check Transaction Status
    if (req.method === 'GET' && req.url.startsWith('/api/check-tx/')) {
        try {
            const hash = req.url.split('/api/check-tx/')[1];
            const result = await ironpayRequest('GET', `/transactions/${hash}`);
            res.writeHead(result.status, {'Content-Type':'application/json'});
            res.end(JSON.stringify(result.data));
        } catch(err) {
            res.writeHead(500, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Serve static files
    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`\n🎮 Free Fire Funnel Server running on http://localhost:${PORT}`);
    console.log(`📦 Serving static files from: ${STATIC_DIR}`);
    console.log(`💳 IronPay API connected\n`);
});
