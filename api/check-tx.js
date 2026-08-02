const https = require('https');
const url = require('url');

const IRONPAY_TOKEN = process.env.IRONPAY_TOKEN || 'Z9DAYrt7sWMHnbN8gUvwBjeS8A6HcvJRChZ621XV1v54vegMWzQHmzlVgIfs';
const IRONPAY_BASE = 'https://api.ironpayapp.com.br/api/public/v1';

function ironpayRequest(method, endpoint) {
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
        const result = await ironpayRequest('GET', `/transactions/${targetHash}`);
        res.status(result.status).json(result.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
