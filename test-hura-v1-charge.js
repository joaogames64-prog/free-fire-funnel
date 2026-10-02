const https = require('https');
function post(path, body) {
    return new Promise((resolve) => {
        const str = JSON.stringify(body);
        const req = https.request({
            hostname: 'api.hurapay.com.br', port: 443, path, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-KEY': 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h', 'Content-Length': Buffer.byteLength(str) }
        }, (res) => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => resolve({ status: res.statusCode, body: d }));
        });
        req.write(str); req.end();
    });
}
async function main() {
    const payload = {
        amount: 1590,
        paymentMethod: 'PIX',
        customer: { name: 'Test', email: 'test@test.com', phone: '11999999999', taxId: '12345678909' },
        items: [
            { productId: "prod_qm7aes45iq2lenwalhx9ox7h", title: "Test Product", unitPrice: 1590, quantity: 1, tangible: false }
        ],
        metadata: { custom_id: "test_123" }
    };
    const r = await post('/v1/charge', payload);
    console.log(`Status: ${r.status}`);
    console.log(`Body: ${r.body}`);
}
main();
