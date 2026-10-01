const https = require('https');
const url = require('url');

const HURAPAY_API_KEY = process.env.HURAPAY_API_KEY || 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h';

function hurapayRequest(method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const fullUrl = `https://api.hurapay.com.br/v1${endpoint}`;
        const parsed = url.parse(fullUrl);
        const bodyStr = body ? JSON.stringify(body) : null;
        const options = {
            hostname: parsed.hostname, port: 443, path: parsed.path, method: method,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-API-KEY': HURAPAY_API_KEY, ...(bodyStr && { 'Content-Length': Buffer.byteLength(bodyStr) }) }
        };
        const req = https.request(options, (resp) => {
            let data = ''; resp.on('data', chunk => data += chunk);
            resp.on('end', () => { try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); } catch(e) { resolve({ status: resp.statusCode, data: data }); } });
        });
        req.on('error', reject); if (bodyStr) req.write(bodyStr); req.end();
    });
}

const products = [
    { key: 'calca_angelical_azul', name: 'Calça Angelical Azul', description: 'Item exclusivo.', price: 954, type: 'ONE_TIME', needShipping: false },
    { key: 'conjunto_naruto', name: 'Conjunto Naruto', description: 'Skin Naruto.', price: 1490, type: 'ONE_TIME', needShipping: false },
    { key: 'conjunto_sasuke', name: 'Conjunto Sasuke', description: 'Skin Sasuke.', price: 1290, type: 'ONE_TIME', needShipping: false },
    { key: 'conjunto_kakashi', name: 'Conjunto Kakashi', description: 'Skin Kakashi.', price: 1290, type: 'ONE_TIME', needShipping: false },
    { key: 'mascara_barba_velho', name: 'Máscara Antiga Barba do Velho', description: 'Item clássico.', price: 990, type: 'ONE_TIME', needShipping: false }
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    console.log('\n🎮 Criando produtos (skins/order bumps) na Hura Pay...\n');
    const catalog = {};

    for (const prod of products) {
        console.log(`  ⏳ Criando: ${prod.name}...`);
        await sleep(4000);
        
        try {
            const result = await hurapayRequest('POST', '/product', prod);
            if (result.status === 201 || result.status === 200) {
                const prodId = result.data.id || (result.data.data && result.data.data.id) || '';
                catalog[prod.key] = prodId;
                console.log(`  ✅ ID: ${prodId}\n`);
            } else {
                console.log(`  ⚠️ Status: ${result.status} | Resposta:`, JSON.stringify(result.data).substring(0, 300), '\n');
            }
        } catch (err) {
            console.log(`  ❌ Erro: ${err.message}\n`);
        }
    }

    console.log('\n📋 CATALOG (Skins):');
    console.log(JSON.stringify(catalog, null, 2));
}

run();
