const https = require('https');

// Tentar o endpoint /charge/pix diretamente
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
        total: 1290,
        expiresIn: 1800,
        customer: { name: 'Test', email: 'test@test.com', phone: '11999999999', taxId: '12345678909' }
    };
    // Tentativas de endpoints PIX
    const paths = ['/v1/charge/pix', '/v1/pix/charge', '/v1/charges/pix'];
    for (const p of paths) {
        const r = await post(p, payload);
        console.log(`${p} -> ${r.status}: ${r.body.substring(0, 150)}`);
    }
    
    // Checar se o GET de um charge retorna brCode
    const getReq = https.request({
        hostname: 'api.hurapay.com.br', port: 443,
        path: '/v1/charge/charge_et118drr762trydfdw9j52dq',
        method: 'GET',
        headers: { 'X-API-KEY': 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h' }
    }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => console.log('GET charge full:', d));
    });
    getReq.end();
}
main();
