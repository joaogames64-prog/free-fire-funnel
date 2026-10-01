/**
 * Script para criar os produtos restantes (que deram rate limit).
 * Execute: node setup-products-remaining.js
 */

const https = require('https');
const url = require('url');

const HURAPAY_API_KEY = process.env.HURAPAY_API_KEY || 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h';

function hurapayRequest(method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const fullUrl = `https://api.hurapay.com.br/v1${endpoint}`;
        const parsed = url.parse(fullUrl);
        const bodyStr = body ? JSON.stringify(body) : null;

        const options = {
            hostname: parsed.hostname,
            port: 443,
            path: parsed.path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-KEY': HURAPAY_API_KEY,
                ...(bodyStr && { 'Content-Length': Buffer.byteLength(bodyStr) })
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
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

const remaining = [
    {
        key: 'diamonds_22400',
        name: '22.400 Diamantes Free Fire + 2.240 Bônus',
        description: 'Mega Pacote: 22.400 diamantes + 2.240 de bonus. Credito imediato apos confirmacao do PIX.',
        price: 4990,
        type: 'ONE_TIME',
        needShipping: false
    },
    {
        key: 'assinatura_semanal',
        name: 'Assinatura Semanal Free Fire',
        description: 'Assinatura semanal com beneficios exclusivos e recompensas diarias.',
        price: 890,
        type: 'ONE_TIME',
        needShipping: false
    },
    {
        key: 'assinatura_mensal',
        name: 'Assinatura Mensal Free Fire',
        description: 'Assinatura mensal com beneficios Premium, skins exclusivas e recompensas diarias.',
        price: 1990,
        type: 'ONE_TIME',
        needShipping: false
    },
    {
        key: 'passe_booyah',
        name: 'Passe Booyah Premium Plus Free Fire',
        description: 'Acesso ao Passe Booyah Premium Plus com skins exclusivas do evento FF x Naruto.',
        price: 1290,
        type: 'ONE_TIME',
        needShipping: false
    },
    {
        key: 'verificacao_seguranca',
        name: 'Verificacao de Seguranca - FF x Naruto',
        description: 'Taxa de verificacao de seguranca para processamento do pedido. Reembolsavel.',
        price: 1290,
        type: 'ONE_TIME',
        needShipping: false
    }
];

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('\n🎮 Criando produtos restantes na Hura Pay...\n');
    const catalog = {
        diamonds_1060: 'prod_qm7aes45iq2lenwalhx9ox7h',
        diamonds_2180: 'prod_g533h01qhxo136rinn2lxaas',
        diamonds_5600: 'prod_qjiko49osnct35fsj7ezq16x'
    };

    for (const prod of remaining) {
        console.log(`  ⏳ Criando: ${prod.name}...`);
        await sleep(5000); // Esperar 5s antes de cada chamada
        
        const payload = {
            name: prod.name,
            description: prod.description,
            price: prod.price,
            type: prod.type,
            needShipping: prod.needShipping
        };

        try {
            const result = await hurapayRequest('POST', '/product', payload);

            if (result.status === 201 || result.status === 200) {
                const prodId = result.data.id || (result.data.data && result.data.data.id) || '';
                catalog[prod.key] = prodId;
                console.log(`  ✅ ${prod.name}`);
                console.log(`     ID: ${prodId} | Preço: R$ ${(prod.price/100).toFixed(2)}\n`);
            } else {
                console.log(`  ⚠️  ${prod.name}`);
                console.log(`     Status: ${result.status}`, JSON.stringify(result.data).substring(0, 300), '\n');
            }
        } catch (err) {
            console.log(`  ❌ ${prod.name} — Erro: ${err.message}\n`);
        }
    }

    console.log('\n════════════════════════════════════════');
    console.log('📋 CATALOG COMPLETO (cole em create-pix.js e server.js):');
    console.log('════════════════════════════════════════');
    console.log(JSON.stringify(catalog, null, 2));
    console.log('════════════════════════════════════════\n');
}

run();
