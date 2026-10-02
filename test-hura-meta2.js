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
        amount: 1590, expiresIn: 1800,
        customer: { name: 'Test', email: 'test@test.com', phone: '11999999999', taxId: '12345678909' },
        custom_data: { test: 1 },
        customData: { test: 1 },
        tags: ["test"],
        custom: "test",
        postbackUrl: "https://example.com?mydata=123",
        webhookUrl: "https://example.com?mydata=123",
        tracking: { test: 1 }
    };
    const r = await post('/v1/charge/pix', payload);
    const obj = JSON.parse(r.body);
    console.log(`Charge ID: ${obj.id}`);
    const req = https.request({
        hostname: 'api.hurapay.com.br', port: 443, path: `/v1/charge/${obj.id}`, method: 'GET',
        headers: { 'X-API-KEY': 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h' }
    }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => console.log('GET Body:', d));
    });
    req.end();
}
main();
