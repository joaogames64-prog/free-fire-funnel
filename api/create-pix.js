const https = require('https');
const url = require('url');

const IRONPAY_TOKEN = process.env.IRONPAY_TOKEN || 'Z9DAYrt7sWMHnbN8gUvwBjeS8A6HcvJRChZ621XV1v54vegMWzQHmzlVgIfs';
const IRONPAY_BASE = 'https://api.ironpayapp.com.br/api/public/v1';

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

        if (body.offer_hash) {
            txPayload.offer_hash = body.offer_hash;
            txPayload.cart[0].product_hash = body.product_hash || '';
        }

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
