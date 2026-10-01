const https = require('https');
const url = require('url');

const HURAPAY_API_KEY = process.env.HURAPAY_API_KEY || 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h';
const HURAPAY_BASE = 'https://api.hurapay.com.br/v1';

// Generate a valid, unique CPF for each transaction
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
        const cpf = generateCPF();
        const phone = (body.telefone || '').replace(/\D/g, '') || '11999999999';

        const txPayload = {
            amount: amountCents,
            expiresIn: 1800, // 30 minutes
            customer: {
                name: body.nome || 'Cliente',
                email: body.email || 'cliente@email.com',
                phone: phone,
                taxId: cpf
            }
        };

        const result = await hurapayRequest('POST', '/charge/pix', txPayload);
        const responseData = result.data || {};

        console.log('[create-pix] HuraPay response keys:', JSON.stringify(Object.keys(responseData)));
        console.log('[create-pix] Full response:', JSON.stringify(responseData).substring(0, 500));

        // Normalização: mapear a resposta da Hura Pay para o formato antigo da Iron Pay
        // O front-end espera "hash" e "pix.pix_qr_code" ou similar
        
        let normalizedResponse = {
            ...responseData,
            hash: responseData.id || '',
            pix: {
                pix_qr_code: responseData.brCode || '',
                pix_qr_code_base64: responseData.brCodeBase64 || ''
            },
            pix_qrcode: responseData.brCode || ''
        };

        console.log('[create-pix] Normalized hash:', normalizedResponse.hash);
        res.status(result.status).json(normalizedResponse);
    } catch (err) {
        console.error('[create-pix] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
