const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ============ CONFIG ============
const PORT = process.env.PORT || 8080;
const HURAPAY_API_KEY = process.env.HURAPAY_API_KEY || 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h';
const HURAPAY_BASE = 'https://api.hurapay.com.br/v1';
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

function generateCPF() {
    const digits = [];
    for (let i = 0; i < 9; i++) digits.push(Math.floor(Math.random() * 9) + (i === 0 ? 1 : 0));
    if (digits.every(d => d === digits[0])) digits[8] = (digits[0] + 1) % 10;
    let sum1 = 0;
    for (let i = 0; i < 9; i++) sum1 += digits[i] * (10 - i);
    let d1 = 11 - (sum1 % 11);
    if (d1 >= 10) d1 = 0;
    digits.push(d1);
    let sum2 = 0;
    for (let i = 0; i < 10; i++) sum2 += digits[i] * (11 - i);
    let d2 = 11 - (sum2 % 11);
    if (d2 >= 10) d2 = 0;
    digits.push(d2);
    return digits.join('');
}

function hurapayRequest(method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const fullUrl = `${HURAPAY_BASE}${endpoint}`;
        const parsed = url.parse(fullUrl);

        const options = {
            hostname: parsed.hostname,
            port: 443,
            path: parsed.path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-KEY': HURAPAY_API_KEY
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
            const amountCents = Math.round(parseFloat(body.amount || '0') * 100);

            const txPayload = {
                amount: amountCents,
                expiresIn: 1800,
                customer: {
                    name: body.nome || 'Cliente',
                    email: body.email || 'cliente@email.com',
                    phone: (body.telefone || '').replace(/\D/g, '') || '11999999999',
                    taxId: generateCPF()
                }
            };

            console.log(`[PIX] Creating transaction: R$ ${(amountCents/100).toFixed(2)} for ${txPayload.customer.name}`);

            const result = await hurapayRequest('POST', '/charge/pix', txPayload);
            const responseData = result.data || {};

            let normalizedResponse = {
                ...responseData,
                hash: responseData.id || '',
                pix: {
                    pix_qr_code: responseData.brCode || '',
                    pix_qr_code_base64: responseData.brCodeBase64 || ''
                },
                pix_qrcode: responseData.brCode || ''
            };

            console.log(`[PIX] Response status: ${result.status}`);

            res.writeHead(result.status, {'Content-Type':'application/json'});
            res.end(JSON.stringify(normalizedResponse));

        } catch(err) {
            console.error('[PIX] Error:', err.message);
            res.writeHead(500, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // API: Check Transaction Status (path or query param)
    if (req.method === 'GET' && req.url.startsWith('/api/check-tx')) {
        try {
            const parsed = url.parse(req.url, true);
            let hash = parsed.query.hash || parsed.query.txid || '';
            if (!hash) { const parts = parsed.pathname.split('/api/check-tx/'); if (parts[1]) hash = parts[1]; }
            if (!hash) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'hash required'})); return; }
            
            const result = await hurapayRequest('GET', `/charge/${hash}`);
            const responseData = result.data || {};
            
            let normalizedStatus = 'pending';
            let paymentStatus = '';
            
            if (responseData && responseData.data) {
                paymentStatus = (responseData.data.paymentStatus || '').toLowerCase();
            } else if (responseData && responseData.paymentStatus) {
                paymentStatus = (responseData.paymentStatus || '').toLowerCase();
            }

            if (paymentStatus === 'paid' || paymentStatus === 'approved') normalizedStatus = 'paid';
            else if (paymentStatus === 'expired') normalizedStatus = 'expired';
            else if (paymentStatus === 'refunded') normalizedStatus = 'refunded';

            const normalizedResponse = {
                ...responseData,
                status: normalizedStatus,
                payment_status: normalizedStatus
            };

            res.writeHead(result.status, {'Content-Type':'application/json'});
            res.end(JSON.stringify(normalizedResponse));
        } catch(err) {
            res.writeHead(500, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // API: Retry PIX - GET (fetch order details) & POST (create new charge)
    if (req.url.startsWith('/api/retry-pix')) {
        const parsed = url.parse(req.url, true);

        // GET: Return original order details
        if (req.method === 'GET') {
            try {
                const hash = parsed.query.hash;
                if (!hash) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'hash required'})); return; }
                const result = await hurapayRequest('GET', `/charge/${hash}`);
                
                const tx = result.data || {};
                const txData = tx.data || tx;
                const amount = txData.total || txData.amount || tx.total || tx.amount || 0;
                
                const paymentStatus = (txData.paymentStatus || tx.paymentStatus || 'unknown').toLowerCase();
                let status = 'pending';
                if (paymentStatus === 'paid' || paymentStatus === 'approved') status = 'paid';
                if (paymentStatus === 'expired') status = 'expired';
                
                const productTitle = (txData.items && txData.items[0] && txData.items[0].product && txData.items[0].product.name) || 'Diamantes Free Fire';
                const customerName = (txData.customer && txData.customer.name) || (tx.customer && tx.customer.name) || '';
                
                res.writeHead(200, {'Content-Type':'application/json'});
                res.end(JSON.stringify({ 
                    amount, amount_display: (amount/100).toFixed(2), 
                    status, product_title: productTitle, 
                    customer_name: customerName, original_hash: hash 
                }));
            } catch(err) { 
                res.writeHead(500, {'Content-Type':'application/json'}); 
                res.end(JSON.stringify({error:err.message})); 
            }
            return;
        }

        // POST: Create new PIX from original transaction
        if (req.method === 'POST') {
            try {
                const body = await readBody(req);
                const origHash = body.hash;
                if (!origHash) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'hash required'})); return; }

                const orig = await hurapayRequest('GET', `/charge/${origHash}`);
                const origTx = orig.data || {};
                const origData = origTx.data || origTx;
                const origAmount = origData.total || origData.amount || origTx.total || origTx.amount;
                
                if (!origAmount) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Could not recover amount'})); return; }

                const origCustomer = origData.customer || origTx.customer || {};

                const txPayload = {
                    amount: origAmount,
                    expiresIn: 1800,
                    customer: { 
                        name: origCustomer.name || 'Cliente', 
                        email: origCustomer.email || 'cliente@email.com', 
                        phone: (origCustomer.phone || '').replace(/\D/g,'') || '11999999999', 
                        taxId: generateCPF()
                    }
                };

                console.log(`[RETRY-PIX] Creating retry: R$ ${(origAmount/100).toFixed(2)}`);
                const result = await hurapayRequest('POST', '/charge/pix', txPayload);
                const responseData = result.data || {};
                
                let normalizedResponse = {
                    ...responseData,
                    hash: responseData.id || '',
                    pix: {
                        pix_qr_code: responseData.brCode || '',
                        pix_qr_code_base64: responseData.brCodeBase64 || ''
                    },
                    pix_qrcode: responseData.brCode || '',
                    original_amount: origAmount,
                    original_amount_display: (origAmount / 100).toFixed(2),
                    original_product_title: 'Diamantes Free Fire',
                    retry_of: origHash
                };

                res.writeHead(result.status, {'Content-Type':'application/json'});
                res.end(JSON.stringify(normalizedResponse));
            } catch(err) { 
                console.error('[RETRY-PIX] Error:', err.message); 
                res.writeHead(500, {'Content-Type':'application/json'}); 
                res.end(JSON.stringify({error:err.message})); 
            }
            return;
        }
    }

    // Serve static files
    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`\n🎮 Free Fire Funnel Server running on http://localhost:${PORT}`);
    console.log(`📦 Serving static files from: ${STATIC_DIR}`);
    console.log(`💳 Hura Pay API connected\n`);
});
