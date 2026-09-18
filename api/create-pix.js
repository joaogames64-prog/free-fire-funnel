const https = require('https');

const HURAPAY_KEY  = process.env.HURAPAY_KEY  || 'cpk_live_w0pgtthu91vsvym5m43685cn';
const HURAPAY_BASE = 'https://api.hurapay.com.br/v1';

// Produtos criados na HuraPay (nomes obfuscados)
const PRODUCT_MAIN   = 'prod_fdgy58zaw78tzn8gwjbgq79f'; // Recarga Digital Premium (diamantes)
const PRODUCT_UPSELL = 'prod_kv32clzlsjqcz6xpvimdrvit'; // Pacote Expansao Especial (upsell)

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
        const bodyStr = body ? JSON.stringify(body) : null;
        const urlParsed = new URL(HURAPAY_BASE + endpoint);

        const options = {
            hostname: urlParsed.hostname,
            port: 443,
            path: urlParsed.pathname + urlParsed.search,
            method: method,
            headers: {
                'X-API-KEY': HURAPAY_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    try {
        let body = req.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e){} }
        body = body || {};

        const amountCents = Math.round(parseFloat(body.amount || '0') * 100);
        if (amountCents < 500) {
            res.status(400).json({ error: 'Valor mínimo: R$ 5,00' });
            return;
        }

        const payload = {
            amount: amountCents,
            expiresIn: 1800,
            externalId: `ff_${Date.now()}`
        };

        // Seleciona produto pela offer_hash enviada pelo frontend
        const isUpsell = (body.offer_hash || '').includes('w1zdcnwb4c') ||
                         (body.product_title || '').toLowerCase().includes('ninja') ||
                         (body.product_title || '').toLowerCase().includes('naruto');
        const productRef = isUpsell ? PRODUCT_UPSELL : PRODUCT_MAIN;
        payload.externalId = `${productRef}_${Date.now()}`;

        // Customer data (optional in HuraPay unless customer object is present, then taxId is required)
        if (body.nome || body.telefone || body.email) {
            payload.customer = {
                taxId: generateCPF()
            };
            if (body.nome)     payload.customer.name  = body.nome;
            if (body.email)    payload.customer.email = body.email;
            if (body.telefone) payload.customer.phone = (body.telefone || '').replace(/\D/g, '');
        }

        console.log('[create-pix] HuraPay charge:', amountCents, 'centavos');
        const result = await hurapayRequest('POST', '/charge/pix', payload);
        const data = result.data || {};

        console.log('[create-pix] HuraPay ID:', data.id, '| status HTTP:', result.status);

        // Normalize response so the frontend works without changes:
        // Frontend expects: data.hash, data.pix.pix_qr_code
        const normalized = {
            ...data,
            hash: data.id || '',
            pix: {
                pix_qr_code: data.brCode || '',
                qrcode:      data.brCode || '',
                qr_code_url: data.brCodeBase64 || ''
            }
        };

        res.status(result.status < 400 ? result.status : 400).json(normalized);
    } catch (err) {
        console.error('[create-pix] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
