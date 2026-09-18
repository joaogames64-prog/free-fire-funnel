const https = require('https');

const HURAPAY_KEY = process.env.HURAPAY_KEY || 'cpk_live_w0pgtthu91vsvym5m43685cn';
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
    res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    // ── GET: buscar detalhes de uma cobrança existente ──────────────────────
    if (req.method === 'GET') {
        try {
            const { hash } = req.query;
            if (!hash) { res.status(400).json({ error: 'hash required' }); return; }

            const result = await hurapayRequest('GET', `/charge/${hash}`);
            const responseData = result.data || {};
            const chargeData = responseData.data || responseData;

            const amountCents = chargeData.total || chargeData.amount || 0;
            const payStatus   = (chargeData.paymentStatus || '').toUpperCase();

            res.status(200).json({
                amount:         amountCents,
                amount_display: (amountCents / 100).toFixed(2),
                status:         payStatus === 'PAID' ? 'paid' : payStatus.toLowerCase(),
                customer_name:  chargeData.customer ? chargeData.customer.name : '',
                original_hash:  hash
            });
        } catch (err) {
            console.error('[retry-pix GET] Error:', err.message);
            res.status(500).json({ error: err.message });
        }
        return;
    }

    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    // ── POST: duplicar cobrança (gerar novo PIX para o mesmo valor) ─────────
    try {
        let body = req.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e){} }
        body = body || {};

        const originalId = body.hash;
        if (!originalId) { res.status(400).json({ error: 'Original charge ID required' }); return; }

        // 1. Busca cobrança original para pegar o valor
        console.log('[retry-pix] Fetching original charge:', originalId);
        const original = await hurapayRequest('GET', `/charge/${originalId}`);
        const origData = (original.data || {}).data || original.data || {};
        const origAmount = origData.total || origData.amount || 0;

        if (!origAmount || origAmount <= 0) {
            res.status(400).json({ error: 'Nao foi possivel recuperar o valor original' });
            return;
        }

        // 2. Cria novo PIX com o mesmo valor
        const payload = {
            amount:    origAmount,
            expiresIn: 1800,
            externalId: `ff_retry_${Date.now()}`
        };

        if (origData.customer) {
            payload.customer = {
                taxId: origData.customer.taxId || generateCPF(),
                name:  origData.customer.name  || undefined,
                email: origData.customer.email || undefined,
                phone: origData.customer.phone || undefined
            };
        }

        console.log(`[retry-pix] Creating retry PIX: R$ ${(origAmount/100).toFixed(2)}`);
        const result = await hurapayRequest('POST', '/charge/pix', payload);
        const newCharge = result.data || {};

        const normalized = {
            ...newCharge,
            hash: newCharge.id || '',
            pix: {
                pix_qr_code: newCharge.brCode || '',
                qrcode:      newCharge.brCode || '',
                qr_code_url: newCharge.brCodeBase64 || ''
            },
            original_amount:  origAmount,
            original_hash:    originalId
        };

        console.log('[retry-pix] New charge ID:', newCharge.id);
        res.status(result.status < 400 ? result.status : 400).json(normalized);
    } catch (err) {
        console.error('[retry-pix] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
