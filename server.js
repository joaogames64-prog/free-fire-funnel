const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { sendToLowtrack } = require('./api/lowtrack');

// ============ CONFIG ============
const PORT = process.env.PORT || 8080;
const HURAPAY_API_KEY = process.env.HURAPAY_API_KEY || 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h';
const HURAPAY_BASE = 'https://api.hurapay.com.br/v1';
const STATIC_DIR = __dirname;
// ================================

// ─── Catálogo de Produtos Hura Pay ───────────────────────────────────────────
const CATALOG = {
    diamonds_1060:         'prod_qm7aes45iq2lenwalhx9ox7h',
    diamonds_2180:         'prod_g533h01qhxo136rinn2lxaas',
    diamonds_5600:         'prod_qjiko49osnct35fsj7ezq16x',
    diamonds_22400:        'prod_gnt1r4qpr2ht46g28u8q6709',
    assinatura_semanal:    'prod_q20di0s48br8k1ti0257bp3g',
    assinatura_mensal:     'prod_mnsv76o37xi1hlu1qk0tj9tz',
    passe_booyah:          'prod_gifouivikanw2lgjk08v8nqr',
    verificacao_seguranca: 'prod_ksn0ul1jxyol9o745kz5rdtv',
    calca_angelical:       'prod_gw30q4x416qcd4mdjhnu6hts',
    conjunto_naruto:       'prod_t0u4cxszzajuyve6ywcby8wy',
    conjunto_sasuke:       'prod_o1osnjdq9jtya62gw3xeso4u',
    conjunto_kakashi:      'prod_s42oj13aakw3yhannexcqcd7',
    mascara_velho:         'prod_lrq4fqa6ucqpf9nsk8zdv9q8'
};

const DIAMOND_CATALOG_KEY = {
    '1060': 'diamonds_1060', '2180': 'diamonds_2180',
    '5600': 'diamonds_5600', '22400': 'diamonds_22400'
};

const BUMP_CATALOG_KEY = {
    'assinatura semanal': 'assinatura_semanal',
    'assinatura mensal':  'assinatura_mensal',
    'passe booyah':       'passe_booyah',
    'passe booyah premium': 'passe_booyah',
    'passe booyah premium plus': 'passe_booyah',
    'calça angelical azul': 'calca_angelical',
    'calca angelical azul': 'calca_angelical',
    'conjunto naruto': 'conjunto_naruto',
    'conjunto sasuke': 'conjunto_sasuke',
    'conjunto kakashi': 'conjunto_kakashi',
    'máscara antiga barba do velho': 'mascara_velho',
    'mascara antiga barba do velho': 'mascara_velho'
};

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
        if (err) { res.writeHead(404, {'Content-Type':'text/plain'}); res.end('404 Not Found'); return; }
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
    let d1 = 11 - (sum1 % 11); if (d1 >= 10) d1 = 0; digits.push(d1);
    let sum2 = 0;
    for (let i = 0; i < 10; i++) sum2 += digits[i] * (11 - i);
    let d2 = 11 - (sum2 % 11); if (d2 >= 10) d2 = 0; digits.push(d2);
    return digits.join('');
}

function hurapayRequest(method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const fullUrl = `${HURAPAY_BASE}${endpoint}`;
        const parsed = url.parse(fullUrl);
        const bodyStr = body ? JSON.stringify(body) : null;
        const options = {
            hostname: parsed.hostname, port: 443, path: parsed.path, method: method,
            headers: {
                'Content-Type': 'application/json', 'Accept': 'application/json',
                'X-API-KEY': HURAPAY_API_KEY,
                ...(bodyStr && { 'Content-Length': Buffer.byteLength(bodyStr) })
            }
        };
        const req = https.request(options, (resp) => {
            let data = '';
            resp.on('data', chunk => data += chunk);
            resp.on('end', () => {
                try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
                catch(e) { resolve({ status: resp.statusCode, data: data }); }
            });
        });
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

function readBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({}); } });
    });
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    // ── POST /api/create-pix ─────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/create-pix') {
        try {
            const body = await readBody(req);
            const amountCents = Math.round(parseFloat(body.amount || '0') * 100);
            const phone = (body.telefone || '').replace(/\D/g, '') || '11999999999';

            // Montar items do pedido
            const items = [];
            const diamondKey = DIAMOND_CATALOG_KEY[String(body.plano || '').replace(/\./g, '')];
            if (diamondKey && CATALOG[diamondKey]) {
                items.push({ productId: CATALOG[diamondKey], quantity: 1 });
            }
            const bumps = Array.isArray(body.bumps) ? body.bumps : [];
            bumps.forEach(bump => {
                const bumpKey = BUMP_CATALOG_KEY[(bump.name || '').toLowerCase().trim()];
                if (bumpKey && CATALOG[bumpKey]) items.push({ productId: CATALOG[bumpKey], quantity: 1 });
            });

            const txPayload = {
                total: amountCents,
                expiresIn: 1800,
                customer: {
                    name: body.nome || 'Cliente', email: body.email || 'cliente@email.com',
                    phone: phone, taxId: generateCPF()
                },
                ...(items.length > 0 && { items }),
                externalId: `ff_${Date.now()}_${phone.slice(-4)}`
            };

            console.log(`[PIX] Criando cobrança: R$ ${(amountCents/100).toFixed(2)} para ${txPayload.customer.name}`);
            const result = await hurapayRequest('POST', '/charge/payment-link', txPayload);
            const responseData = result.data || {};

            const normalizedResponse = {
                ...responseData,
                hash: responseData.id || '',
                pix: { pix_qr_code: responseData.brCode || '', pix_qr_code_base64: responseData.brCodeBase64 || '' },
                pix_qrcode: responseData.brCode || ''
            };

            // Disparar sale.pending no LowTrack (fire-and-forget)
            const utms = body.utms || {};
            sendToLowtrack(
                { id: normalizedResponse.hash, paymentStatus: 'PROCESSING', total: amountCents,
                  items: items.map((item, i) => ({ productId: item.productId, product: { name: i === 0 ? (body.product_title || 'Diamantes Free Fire') : (bumps[i-1]?.name || 'Order Bump') } })),
                  customer: { name: body.nome || 'Cliente', email: body.email || '', phone: phone }
                },
                { utms, productName: body.product_title || 'Diamantes Free Fire',
                  customerName: body.nome || '', customerEmail: body.email || '', customerPhone: phone,
                  userIp: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
                  userAgent: req.headers['user-agent'] || '' }
            ).catch(err => console.error('[LowTrack] Falha sale.pending:', err.message));

            res.writeHead(result.status, {'Content-Type':'application/json'});
            res.end(JSON.stringify(normalizedResponse));
        } catch(err) {
            console.error('[PIX] Error:', err.message);
            res.writeHead(500, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ── GET /api/check-tx ────────────────────────────────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/check-tx')) {
        try {
            const parsed = url.parse(req.url, true);
            let hash = parsed.query.hash || parsed.query.txid || '';
            if (!hash) { const parts = parsed.pathname.split('/api/check-tx/'); if (parts[1]) hash = parts[1]; }
            if (!hash) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'hash required'})); return; }

            const result = await hurapayRequest('GET', `/charge/${hash}`);
            const responseData = result.data || {};

            let normalizedStatus = 'pending';
            const paymentStatus = ((responseData.data && responseData.data.paymentStatus) || responseData.paymentStatus || '').toLowerCase();
            if (['paid','approved'].includes(paymentStatus)) normalizedStatus = 'paid';
            else if (paymentStatus === 'expired') normalizedStatus = 'expired';
            else if (paymentStatus === 'refunded') normalizedStatus = 'refunded';

            res.writeHead(result.status, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ ...responseData, status: normalizedStatus, payment_status: normalizedStatus }));
        } catch(err) {
            res.writeHead(500, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ── /api/retry-pix ───────────────────────────────────────────────────────
    if (req.url.startsWith('/api/retry-pix')) {
        const parsed = url.parse(req.url, true);

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
                if (['paid','approved'].includes(paymentStatus)) status = 'paid';
                if (paymentStatus === 'expired') status = 'expired';
                res.writeHead(200, {'Content-Type':'application/json'});
                res.end(JSON.stringify({ amount, amount_display: (amount/100).toFixed(2), status, original_hash: hash }));
            } catch(err) { res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:err.message})); }
            return;
        }

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
                    total: origAmount, expiresIn: 1800,
                    customer: { name: origCustomer.name || 'Cliente', email: origCustomer.email || 'cliente@email.com',
                        phone: (origCustomer.phone || '').replace(/\D/g,'') || '11999999999', taxId: generateCPF() }
                };

                const result = await hurapayRequest('POST', '/charge/payment-link', txPayload);
                const rd = result.data || {};
                const normalizedResponse = {
                    ...rd, hash: rd.id || '',
                    pix: { pix_qr_code: rd.brCode || '', pix_qr_code_base64: rd.brCodeBase64 || '' },
                    pix_qrcode: rd.brCode || '',
                    original_amount: origAmount, original_amount_display: (origAmount/100).toFixed(2), retry_of: origHash
                };
                res.writeHead(result.status, {'Content-Type':'application/json'});
                res.end(JSON.stringify(normalizedResponse));
            } catch(err) { res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:err.message})); }
            return;
        }
    }

    // ── POST /api/webhook-hurapay ────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/webhook-hurapay') {
        try {
            const body = await readBody(req);
            console.log('[Webhook HuraPay] Evento:', body.event || 'N/A', '| ID:', (body.data && body.data.id) || 'N/A');
            const chargeData = body.data || body;
            await sendToLowtrack(chargeData, { productName: chargeData.product_title || 'Diamantes Free Fire' });
            res.writeHead(200, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ received: true }));
        } catch(err) {
            console.error('[Webhook] Erro:', err.message);
            res.writeHead(200, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ received: true, error: err.message }));
        }
        return;
    }

    // Serve static files
    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`\n🎮 Free Fire Funnel Server rodando em http://localhost:${PORT}`);
    console.log(`📦 Arquivos estáticos: ${STATIC_DIR}`);
    console.log(`💳 Hura Pay conectada | 🎯 LowTrack ativo\n`);
});
