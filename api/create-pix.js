const https = require('https');
const url = require('url');

const IRONPAY_TOKEN = process.env.IRONPAY_TOKEN || 'Z9DAYrt7sWMHnbN8gUvwBjeS8A6HcvJRChZ621XV1v54vegMWzQHmzlVgIfs';
const IRONPAY_BASE = 'https://api.ironpayapp.com.br/api/public/v1';

// Generate a valid, unique CPF for each transaction
function generateCPF() {
    const digits = [];
    for (let i = 0; i < 9; i++) digits.push(Math.floor(Math.random() * 9) + (i === 0 ? 1 : 0));
    // Avoid all-same-digit CPFs (e.g. 111.111.111-xx)
    if (digits.every(d => d === digits[0])) digits[8] = (digits[0] + 1) % 10;
    // First check digit
    let sum1 = 0;
    for (let i = 0; i < 9; i++) sum1 += digits[i] * (10 - i);
    let d1 = 11 - (sum1 % 11);
    if (d1 >= 10) d1 = 0;
    digits.push(d1);
    // Second check digit
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
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch(e){}
        }
        body = body || {};

        const amountCents = Math.round(parseFloat(body.amount || '0') * 100);

        const txPayload = {
            amount: amountCents,
            payment_method: 'pix',
            customer: {
                name: body.nome || 'Cliente',
                email: body.email || 'cliente@email.com',
                phone_number: (body.telefone || '').replace(/\D/g, '') || '11999999999',
                document: generateCPF(),
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

        // offer_hash is always required by IronPay
        txPayload.offer_hash = body.offer_hash || 'off_4nfa96t3k8';
        txPayload.cart[0].product_hash = body.product_hash || 'ykhbyvhkny';

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

        const result = await ironpayRequest('POST', '/transactions', txPayload);
        res.status(result.status).json(result.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
