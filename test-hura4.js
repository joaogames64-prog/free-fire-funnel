const https = require('https');
const txPayload = {
    total: 1290,
    expiresIn: 1800,
    customer: { name: 'Test', email: 'test@test.com', phone: '11999999999', taxId: '12345678909' }
};
const req = https.request('https://api.hurapay.com.br/v1/pix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h' }
}, (res) => {
    let data = ''; res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('/v1/pix -> Status:', res.statusCode, 'Body:', data));
});
req.write(JSON.stringify(txPayload)); req.end();
