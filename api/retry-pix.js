const https = require('https');
const url = require('url');

const IRONPAY_TOKEN = process.env.IRONPAY_TOKEN || 'Z9DAYrt7sWMHnbN8gUvwBjeS8A6HcvJRChZ621XV1v54vegMWzQHmzlVgIfs';
const IRONPAY_BASE = 'https://api.ironpayapp.com.br/api/public/v1';

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

function ironpayRequest(method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const separator = endpoint.includes('?') ? '&' : '?';
        const fullUrl = `${IRONPAY_BASE}${endpoint}${separator}api_token=${IRONPAY_TOKEN}`;
        const parsed = url.parse(fullUrl);
        const options = {
            hostname: parsed.hostname, port: 443, path: parsed.path, method: method,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
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

            const result = await ironpayRequest('GET', `/transactions/${hash}`);
            const tx = result.data || {};
            const txData = tx.data || tx;

            // Extract amount (cents)
            const amount = txData.amount || tx.amount || 0;
            const status = txData.status || tx.status || 'unknown';
            const customerName = (txData.customer && txData.customer.name) || (tx.customer && tx.customer.name) || '';
            const productTitle = (txData.cart && txData.cart[0] && txData.cart[0].title) || (tx.cart && tx.cart[0] && tx.cart[0].title) || 'Diamantes Free Fire';
            const offerHash = txData.offer_hash || tx.offer_hash || '';
            const productHash = (txData.cart && txData.cart[0] && txData.cart[0].product_hash) || (tx.cart && tx.cart[0] && tx.cart[0].product_hash) || '';

            res.status(200).json({
                amount: amount,
                amount_display: (amount / 100).toFixed(2),
                status: status,
                customer_name: customerName,
                product_title: productTitle,
                offer_hash: offerHash,
                product_hash: productHash,
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

        // 1. Fetch original transaction from IronPay (SOURCE OF TRUTH)
        console.log('[retry-pix] Fetching original transaction:', originalHash);
        const original = await ironpayRequest('GET', `/transactions/${originalHash}`);
        const origTx = original.data || {};
        const origData = origTx.data || origTx;

        const origAmount = origData.amount || origTx.amount;
        if (!origAmount || origAmount <= 0) {
            res.status(400).json({ error: 'Could not recover original transaction amount' });
            return;
        }

        // 2. Extract original customer & cart from IronPay (NOT from frontend)
        const origCustomer = origData.customer || origTx.customer || {};
        const origCart = origData.cart || origTx.cart || [];
        const origOfferHash = origData.offer_hash || origTx.offer_hash || 'off_4nfa96t3k8';
        const origProductHash = (origCart[0] && origCart[0].product_hash) || 'ykhbyvhkny';

        // 3. Build new transaction with VALIDATED data from backend
        const txPayload = {
            amount: origAmount,
            payment_method: 'pix',
            customer: {
                name: origCustomer.name || 'Cliente',
                email: origCustomer.email || 'cliente@email.com',
                phone_number: (origCustomer.phone_number || '').replace(/\D/g, '') || '11999999999',
                document: generateCPF(),
                street_name: origCustomer.street_name || 'Rua Exemplo',
                number: origCustomer.number || '100',
                complement: origCustomer.complement || '',
                neighborhood: origCustomer.neighborhood || 'Centro',
                city: origCustomer.city || 'São Paulo',
                state: origCustomer.state || 'SP',
                zip_code: origCustomer.zip_code || '01001000'
            },
            cart: origCart.length > 0 ? origCart.map(item => ({
                title: item.title || 'Diamantes Free Fire',
                price: item.price || origAmount,
                quantity: item.quantity || 1,
                operation_type: item.operation_type || 1,
                tangible: false,
                product_hash: item.product_hash || origProductHash
            })) : [{
                title: 'Diamantes Free Fire',
                price: origAmount,
                quantity: 1,
                operation_type: 1,
                tangible: false,
                product_hash: origProductHash
            }],
            offer_hash: origOfferHash,
            expire_in_days: 1,
            transaction_origin: 'api'
        };

        // Preserve tracking/UTM data if provided by frontend
        txPayload.tracking = {
            src: body.src || '', utm_source: body.utm_source || '',
            utm_medium: body.utm_medium || '', utm_campaign: body.utm_campaign || '',
            utm_term: body.utm_term || '', utm_content: body.utm_content || ''
        };
        txPayload.src = body.src || '';
        txPayload.utm_source = body.utm_source || '';
        txPayload.utm_medium = body.utm_medium || '';
        txPayload.utm_campaign = body.utm_campaign || '';

        // 4. Create new PIX charge
        console.log(`[retry-pix] Creating retry PIX: R$ ${(origAmount/100).toFixed(2)} for ${txPayload.customer.name}`);
        const result = await ironpayRequest('POST', '/transactions', txPayload);
        const responseData = result.data || {};

        // Normalize hash
        if (!responseData.hash) {
            responseData.hash = responseData.id || responseData.transaction_hash || responseData.tid || responseData.uuid || '';
            if (!responseData.hash && responseData.data) {
                responseData.hash = responseData.data.hash || responseData.data.id || '';
            }
        }

        console.log('[retry-pix] New PIX created, hash:', responseData.hash);

        // 5. Return new PIX data + original order details
        res.status(result.status).json({
            ...responseData,
            original_amount: origAmount,
            original_amount_display: (origAmount / 100).toFixed(2),
            original_product_title: (origCart[0] && origCart[0].title) || 'Diamantes Free Fire',
            retry_of: originalHash
        });
    } catch (err) {
        console.error('[retry-pix POST] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
