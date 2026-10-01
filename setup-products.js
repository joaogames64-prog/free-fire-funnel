/**
 * Script de Setup — Criar Produtos na Hura Pay
 * 
 * Execute UMA VEZ para criar os produtos no painel da Hura Pay:
 *   node setup-products.js
 * 
 * Guarde os IDs retornados e substitua em create-pix.js no CATALOG.
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

// Catálogo de produtos para criar na Hura Pay
const products = [
    // ─── Pacotes de Diamantes ───────────────────────────────────────────────
    {
        key: 'diamonds_1060',
        name: '1.060 Diamantes Free Fire + 106 Bônus',
        description: 'Pacote de 1.060 diamantes + 106 de bônus. Crédito imediato após confirmação do PIX.',
        price: 1290,   // R$ 12,90 em centavos
        type: 'ONE_TIME',
        needShipping: false
    },
    {
        key: 'diamonds_2180',
        name: '2.180 Diamantes Free Fire + 218 Bônus',
        description: 'Pacote de 2.180 diamantes + 218 de bônus. Crédito imediato após confirmação do PIX.',
        price: 1790,   // R$ 17,90 em centavos
        type: 'ONE_TIME',
        needShipping: false
    },
    {
        key: 'diamonds_5600',
        name: '5.600 Diamantes Free Fire + 560 Bônus',
        description: 'Pacote MAIS POPULAR: 5.600 diamantes + 560 de bônus. Crédito imediato após confirmação do PIX.',
        price: 1990,   // R$ 19,90 em centavos
        type: 'ONE_TIME',
        needShipping: false
    },
    {
        key: 'diamonds_22400',
        name: '22.400 Diamantes Free Fire + 2.240 Bônus',
        description: 'Mega Pacote: 22.400 diamantes + 2.240 de bônus. Crédito imediato após confirmação do PIX.',
        price: 4990,   // R$ 49,90 em centavos
        type: 'ONE_TIME',
        needShipping: false
    },
    // ─── Order Bumps / Ofertas Especiais ────────────────────────────────────
    {
        key: 'assinatura_semanal',
        name: 'Assinatura Semanal Free Fire',
        description: 'Assinatura semanal com benefícios exclusivos e recompensas diárias.',
        price: 890,    // R$ 8,90 em centavos
        type: 'ONE_TIME',
        needShipping: false
    },
    {
        key: 'assinatura_mensal',
        name: 'Assinatura Mensal Free Fire',
        description: 'Assinatura mensal com benefícios Premium, skins exclusivas e recompensas diárias.',
        price: 1990,   // R$ 19,90 em centavos
        type: 'ONE_TIME',
        needShipping: false
    },
    {
        key: 'passe_booyah',
        name: 'Passe Booyah Premium Plus Free Fire',
        description: 'Acesso ao Passe Booyah Premium Plus com skins exclusivas do evento FF × Naruto Shippuden.',
        price: 1290,   // R$ 12,90 em centavos
        type: 'ONE_TIME',
        needShipping: false
    },
    // ─── Upsell ─────────────────────────────────────────────────────────────
    {
        key: 'verificacao_seguranca',
        name: 'Verificação de Segurança - FF × Naruto',
        description: 'Taxa de verificação de segurança para processamento do pedido. Reembolsável.',
        price: 1290,   // R$ 12,90 em centavos
        type: 'ONE_TIME',
        needShipping: false
    }
];

async function createAllProducts() {
    console.log('\n🎮 Criando produtos na Hura Pay...\n');
    const catalog = {};

    for (const prod of products) {
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
                console.log(`     Status: ${result.status} | Resposta:`, JSON.stringify(result.data).substring(0, 200), '\n');
            }
        } catch (err) {
            console.log(`  ❌ ${prod.name} — Erro: ${err.message}\n`);
        }
        
        // Aguardar 4s entre chamadas para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 4000));
    }

    console.log('\n════════════════════════════════════════');
    console.log('📋 CATALOG (cole em create-pix.js):');
    console.log('════════════════════════════════════════');
    console.log('const CATALOG = ' + JSON.stringify(catalog, null, 2) + ';');
    console.log('════════════════════════════════════════\n');
}

createAllProducts();
