const https = require('https');
const HURAPAY_API_KEY = process.env.HURAPAY_API_KEY || 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h';

const txPayload = {
    total: 1500,
    expiresIn: 1800,
    customer: {
        name: 'Test',
        email: 'test@test.com',
        phone: '11999999999',
        taxId: '12345678909'
    },
    items: [
        { productId: 'prod_fakexyz123', quantity: 1 }
    ],
    externalId: 'test_123'
};

const req = https.request('https://api.hurapay.com.br/v1/charge/payment-link', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': HURAPAY_API_KEY
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
});
req.write(JSON.stringify(txPayload));
req.end();
