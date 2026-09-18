const https = require('https');

const HURAPAY_KEY = process.env.HURAPAY_KEY || 'cpk_live_w0pgtthu91vsvym5m43685cn';
const HURAPAY_BASE = 'https://api.hurapay.com.br/v1';

function hurapayRequest(method, endpoint) {
    return new Promise((resolve, reject) => {
        const urlParsed = new URL(HURAPAY_BASE + endpoint);

        const options = {
            hostname: urlParsed.hostname,
            port: 443,
            path: urlParsed.pathname + urlParsed.search,
            method: method,
            headers: {
                'X-API-KEY': HURAPAY_KEY,
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
        req.end();
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    try {
        const { hash, txid } = req.query;
        const chargeId = hash || txid;

        if (!chargeId) {
            res.status(400).json({ error: 'Charge ID required' });
            return;
        }

        const result = await hurapayRequest('GET', `/charge/${chargeId}`);
        const responseData = result.data || {};

        // HuraPay wraps data inside .data
        const chargeData = responseData.data || responseData;
        const paymentStatus = (chargeData.paymentStatus || '').toUpperCase();
        const isPaid = paymentStatus === 'PAID';

        // Normalize so frontend polling works:
        // Frontend checks: data.status === 'paid' OR data.payment_status === 'paid'
        const normalized = {
            ...chargeData,
            status:         isPaid ? 'paid' : paymentStatus.toLowerCase(),
            payment_status: isPaid ? 'paid' : paymentStatus.toLowerCase()
        };

        res.status(result.status < 400 ? result.status : 200).json(normalized);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
