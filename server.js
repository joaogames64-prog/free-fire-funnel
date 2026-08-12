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

            txPayload.tracking = {
                src: body.src || '',
                utm_source: body.utm_source || '',
                utm_medium: body.utm_medium || '',
                utm_campaign: body.utm_campaign || '',
                utm_term: body.utm_term || '',
                utm_content: body.utm_content || ''
            };
            txPayload.src = body.src || '';
            txPayload.utm_source = body.utm_source || '';
            txPayload.utm_medium = body.utm_medium || '';
            txPayload.utm_campaign = body.utm_campaign || '';
            txPayload.utm_term = body.utm_term || '';
            txPayload.utm_content = body.utm_content || '';

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

    // API: Check Transaction Status (path or query param)
    if (req.method === 'GET' && req.url.startsWith('/api/check-tx')) {
        try {
            const parsed = url.parse(req.url, true);
            let hash = parsed.query.hash || parsed.query.txid || '';
            if (!hash) { const parts = parsed.pathname.split('/api/check-tx/'); if (parts[1]) hash = parts[1]; }
            if (!hash) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'hash required'})); return; }
            const result = await ironpayRequest('GET', `/transactions/${hash}`);
            res.writeHead(result.status, {'Content-Type':'application/json'});
            res.end(JSON.stringify(result.data));
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
                const result = await ironpayRequest('GET', `/transactions/${hash}`);
                const tx = result.data || {};
                const txData = tx.data || tx;
                const amount = txData.amount || tx.amount || 0;
                const productTitle = (txData.cart && txData.cart[0] && txData.cart[0].title) || (tx.cart && tx.cart[0] && tx.cart[0].title) || 'Diamantes Free Fire';
                res.writeHead(200, {'Content-Type':'application/json'});
                res.end(JSON.stringify({ amount, amount_display: (amount/100).toFixed(2), status: txData.status||tx.status||'unknown', product_title: productTitle, customer_name: (txData.customer||tx.customer||{}).name||'', original_hash: hash }));
            } catch(err) { res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:err.message})); }
            return;
        }

        // POST: Create new PIX from original transaction
        if (req.method === 'POST') {
            try {
                const body = await readBody(req);
                const origHash = body.hash;
                if (!origHash) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'hash required'})); return; }

                // Fetch original from IronPay (SOURCE OF TRUTH)
                const orig = await ironpayRequest('GET', `/transactions/${origHash}`);
                const origTx = orig.data || {};
                const origData = origTx.data || origTx;
                const origAmount = origData.amount || origTx.amount;
                if (!origAmount) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Could not recover amount'})); return; }

                const origCustomer = origData.customer || origTx.customer || {};
                const origCart = origData.cart || origTx.cart || [];

                const txPayload = {
                    amount: origAmount, payment_method: 'pix',
                    customer: { name: origCustomer.name||'Cliente', email: origCustomer.email||'cliente@email.com', phone_number: (origCustomer.phone_number||'').replace(/\D/g,'')||'11999999999', document: body.cpf||'00000000000', street_name:'Rua Exemplo', number:'100', complement:'', neighborhood:'Centro', city:'São Paulo', state:'SP', zip_code:'01001000' },
                    cart: origCart.length > 0 ? origCart.map(function(i){ return { title:i.title||'Diamantes Free Fire', price:i.price||origAmount, quantity:i.quantity||1, operation_type:1, tangible:false, product_hash:i.product_hash||'' }; }) : [{ title:'Diamantes Free Fire', price:origAmount, quantity:1, operation_type:1, tangible:false }],
                    offer_hash: origData.offer_hash || origTx.offer_hash || 'off_4nfa96t3k8',
                    expire_in_days: 1, transaction_origin: 'api'
                };
                txPayload.tracking = { src:body.src||'', utm_source:body.utm_source||'', utm_medium:body.utm_medium||'', utm_campaign:body.utm_campaign||'', utm_term:body.utm_term||'', utm_content:body.utm_content||'' };

                console.log(`[RETRY-PIX] Creating retry: R$ ${(origAmount/100).toFixed(2)}`);
                const result = await ironpayRequest('POST', '/transactions', txPayload);
                const rd = result.data || {};
                if (!rd.hash) { rd.hash = rd.id || rd.transaction_hash || rd.tid || ''; if (!rd.hash && rd.data) rd.hash = rd.data.hash || rd.data.id || ''; }
                rd.original_amount = origAmount;
                rd.original_amount_display = (origAmount/100).toFixed(2);
                res.writeHead(result.status, {'Content-Type':'application/json'});
                res.end(JSON.stringify(rd));
            } catch(err) { console.error('[RETRY-PIX] Error:', err.message); res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:err.message})); }
            return;
        }
    }

    // Serve static files
    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`\n🎮 Free Fire Funnel Server running on http://localhost:${PORT}`);
    console.log(`📦 Serving static files from: ${STATIC_DIR}`);
    console.log(`💳 IronPay API connected\n`);
});
