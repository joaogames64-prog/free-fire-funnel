const https = require('https');
const url = require('url');

const HURAPAY_API_KEY = process.env.HURAPAY_API_KEY || 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h';
const HURAPAY_BASE = 'https://api.hurapay.com.br/v1';

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
            hostname: parsed.hostname, port: 443, path: parsed.path, method: method,
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
                try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
                catch(e) { resolve({ status: resp.statusCode, data: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    // ── GET: Fetch original order details ──
    if (req.method === 'GET') {
        try {
            const hash = req.query.hash;
            if (!hash) { res.status(400).json({ error: 'hash required' }); return; }

            const result = await hurapayRequest('GET', `/charge/${hash}`);
            const tx = result.data || {};
            const txData = tx.data || tx;

            const amount = txData.total || txData.amount || tx.total || tx.amount || 0;
            const paymentStatus = (txData.paymentStatus || tx.paymentStatus || 'unknown').toLowerCase();
            
            // Map payment status for the frontend
            let status = 'pending';
            if (paymentStatus === 'paid' || paymentStatus === 'approved') status = 'paid';
            if (paymentStatus === 'expired') status = 'expired';
            
            const customerName = (txData.customer && txData.customer.name) || (tx.customer && tx.customer.name) || '';
            const productTitle = (txData.items && txData.items[0] && txData.items[0].product && txData.items[0].product.name) || 'Diamantes Free Fire';

            res.status(200).json({
                amount: amount,
                amount_display: (amount / 100).toFixed(2),
                status: status,
                customer_name: customerName,
                product_title: productTitle,
                original_hash: hash
            });
        } catch (err) {
            console.error('[retry-pix GET] Error:', err.message);
            res.status(500).json({ error: err.message });
        }
        return;
    }

    // ── POST: Create new PIX from original order ──
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    try {
        let body = req.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e){} }
        body = body || {};

        const originalHash = body.hash;
        if (!originalHash) { res.status(400).json({ error: 'Original transaction hash required' }); return; }

        console.log('[retry-pix] Fetching original transaction:', originalHash);
        const original = await hurapayRequest('GET', `/charge/${originalHash}`);
        const origTx = original.data || {};
        const origData = origTx.data || origTx;

        const origAmount = origData.total || origData.amount || origTx.total || origTx.amount;
        if (!origAmount || origAmount <= 0) {
            res.status(400).json({ error: 'Could not recover original transaction amount' });
            return;
        }

        const origCustomer = origData.customer || origTx.customer || {};

        const txPayload = {
            amount: origAmount,
            expiresIn: 1800,
            customer: {
                name: origCustomer.name || 'Cliente',
                email: origCustomer.email || 'cliente@email.com',
                phone: (origCustomer.phone || '').replace(/\D/g, '') || '11999999999',
                taxId: generateCPF()
            }
        };

        console.log(`[retry-pix] Creating retry PIX: R$ ${(origAmount/100).toFixed(2)} for ${txPayload.customer.name}`);
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
            retry_of: originalHash
        };

        console.log('[retry-pix] New PIX created, hash:', normalizedResponse.hash);
        res.status(result.status).json(normalizedResponse);
    } catch (err) {
        console.error('[retry-pix POST] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
