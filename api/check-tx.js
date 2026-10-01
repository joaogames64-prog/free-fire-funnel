const https = require('https');
const url = require('url');

const HURAPAY_API_KEY = process.env.HURAPAY_API_KEY || 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h';
const HURAPAY_BASE = 'https://api.hurapay.com.br/v1';

function hurapayRequest(method, endpoint) {
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

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { hash, txid } = req.query;
        const targetHash = hash || txid;
        
        if (!targetHash) {
            res.status(400).json({ error: 'Hash query parameter required' });
            return;
        }

        // A chamada na Hura Pay é /charge/{id}
        const result = await hurapayRequest('GET', `/charge/${targetHash}`);
        const responseData = result.data || {};
        
        // Normalização do status para o padrão que o frontend FF já espera
        // Hura Pay usa "paymentStatus": "PAID" (ou PENDING, EXPIRED)
        let normalizedStatus = 'pending';
        let paymentStatus = '';

        if (responseData && responseData.data) {
            // A API de check da Hura Pay retorna os dados dentro de `data`
            paymentStatus = (responseData.data.paymentStatus || '').toLowerCase();
        } else if (responseData && responseData.paymentStatus) {
            paymentStatus = (responseData.paymentStatus || '').toLowerCase();
        }

        if (paymentStatus === 'paid' || paymentStatus === 'approved') {
            normalizedStatus = 'paid';
        } else if (paymentStatus === 'expired') {
            normalizedStatus = 'expired';
        } else if (paymentStatus === 'refunded') {
            normalizedStatus = 'refunded';
        }

        const normalizedResponse = {
            ...responseData,
            status: normalizedStatus,           // Para cair na validação do front
            payment_status: normalizedStatus,   // Fallback extra
        };

        res.status(result.status).json(normalizedResponse);
    } catch (err) {
        console.error('[check-tx] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
