const https = require('https');
const url = require('url');
const { sendToLowtrack } = require('./lowtrack');

const HURAPAY_API_KEY = process.env.HURAPAY_API_KEY || 'cpk_live_wjx2ss5gdm8xkj0icknwsh5h';
const HURAPAY_BASE = 'https://api.hurapay.com.br/v1';

// ─── Catálogo de Produtos Hura Pay ───────────────────────────────────────────
// Gerado por setup-products.js — NÃO alterar manualmente
const CATALOG = {
    diamonds_1060:         'prod_qm7aes45iq2lenwalhx9ox7h',
    diamonds_2180:         'prod_g533h01qhxo136rinn2lxaas',
    diamonds_5600:         'prod_qjiko49osnct35fsj7ezq16x',
    diamonds_22400:        'prod_gnt1r4qpr2ht46g28u8q6709',
    assinatura_semanal:    'prod_q20di0s48br8k1ti0257bp3g',
    assinatura_mensal:     'prod_mnsv76o37xi1hlu1qk0tj9tz',
    passe_booyah:          'prod_gifouivikanw2lgjk08v8nqr',
    verificacao_seguranca: 'prod_ksn0ul1jxyol9o745kz5rdtv'
};

// ─── Mapeamento de diamantes → chave do catálogo ─────────────────────────────
const DIAMOND_CATALOG_KEY = {
    '1060':  'diamonds_1060',
    '2180':  'diamonds_2180',
    '5600':  'diamonds_5600',
    '22400': 'diamonds_22400'
};

// ─── Mapeamento de order bumps → chave do catálogo ───────────────────────────
const BUMP_CATALOG_KEY = {
    'assinatura semanal':    'assinatura_semanal',
    'assinatura mensal':     'assinatura_mensal',
    'passe booyah':          'passe_booyah',
    'passe booyah premium':  'passe_booyah',
    'passe booyah premium plus': 'passe_booyah'
};

// Gera CPF matematicamente válido para uso na Hura Pay
function generateCPF() {
    const digits = [];
    for (let i = 0; i < 9; i++) digits.push(Math.floor(Math.random() * 9) + (i === 0 ? 1 : 0));
    if (digits.every(d => d === digits[0])) digits[8] = (digits[0] + 1) % 10;
    let sum1 = 0;
    for (let i = 0; i < 9; i++) sum1 += digits[i] * (10 - i);
    let d1 = 11 - (sum1 % 11); if (d1 >= 10) d1 = 0; digits.push(d1);
    let sum2 = 0;
    for (let i = 0; i < 10; i++) sum2 += digits[i] * (11 - i);
    let d2 = 11 - (sum2 % 11); if (d2 >= 10) d2 = 0; digits.push(d2);
    return digits.join('');
}

function hurapayRequest(method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const fullUrl = `${HURAPAY_BASE}${endpoint}`;
        const parsed = url.parse(fullUrl);
        const bodyStr = body ? JSON.stringify(body) : null;
        const options = {
            hostname: parsed.hostname, port: 443, path: parsed.path, method: method,
            headers: {
                'Content-Type': 'application/json', 'Accept': 'application/json',
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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    try {
        let body = req.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e){} }
        body = body || {};

        const amountCents = Math.round(parseFloat(body.amount || '0') * 100);
        const phone = (body.telefone || '').replace(/\D/g, '') || '11999999999';

        // ─── Montar items do pedido (produto principal + order bumps) ─────────
        const items = [];

        // Produto principal: identificado por diamonds (plano) ou product_title
        const diamondKey = DIAMOND_CATALOG_KEY[String(body.plano || '').replace(/\./g, '')];
        
        if (diamondKey && CATALOG[diamondKey]) {
            items.push({ productId: CATALOG[diamondKey], quantity: 1 });
        }

        // Order bumps (chegam como array ou como campos separados)
        const bumps = Array.isArray(body.bumps) ? body.bumps : [];
        bumps.forEach(bump => {
            const bumpName = (bump.name || '').toLowerCase().trim();
            const bumpKey = BUMP_CATALOG_KEY[bumpName];
            if (bumpKey && CATALOG[bumpKey]) {
                items.push({ productId: CATALOG[bumpKey], quantity: 1 });
            }
        });

        // ─── Payload para a Hura Pay ─────────────────────────────────────────
        const txPayload = {
            total: amountCents,
            expiresIn: 1800,
            customer: {
                name:  body.nome  || 'Cliente',
                email: body.email || 'cliente@email.com',
                phone: phone,
                taxId: generateCPF()
            },
            ...(items.length > 0 && { items }),
            // externalId permite rastreio no painel da Hura Pay
            externalId: `ff_${Date.now()}_${phone.slice(-4)}`
        };

        const result = await hurapayRequest('POST', '/charge/payment-link', txPayload);
        const responseData = result.data || {};

        console.log('[create-pix] HuraPay response status:', result.status);
        console.log('[create-pix] Response preview:', JSON.stringify(responseData).substring(0, 400));

        // ─── Normalização da resposta para o frontend (mantém compatibilidade) ─
        const normalizedResponse = {
            ...responseData,
            hash:      responseData.id || '',
            pix: {
                pix_qr_code:        responseData.brCode      || '',
                pix_qr_code_base64: responseData.brCodeBase64 || ''
            },
            pix_qrcode: responseData.brCode || ''
        };

        // ─── Disparar sale.pending no LowTrack (PIX gerado, aguardando pagamento) ─
        // Não aguardar (fire-and-forget) para não atrasar a resposta ao cliente
        const utms = body.utms || {};
        sendToLowtrack(
            {
                id:            normalizedResponse.hash,
                externalId:    txPayload.externalId,
                paymentStatus: 'PROCESSING',
                total:         amountCents,
                items:         items.map((item, i) => ({
                    productId: item.productId,
                    product:   { name: i === 0 ? (body.product_title || 'Diamantes Free Fire') : (bumps[i - 1]?.name || 'Order Bump') }
                })),
                customer: {
                    name:  body.nome  || 'Cliente',
                    email: body.email || '',
                    phone: phone
                }
            },
            {
                utms,
                productName:   body.product_title || 'Diamantes Free Fire',
                customerName:  body.nome  || '',
                customerEmail: body.email || '',
                customerPhone: phone,
                userIp:    req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
                userAgent: req.headers['user-agent'] || ''
            }
        ).catch(err => console.error('[LowTrack] Falha no sale.pending:', err.message));

        res.status(result.status).json(normalizedResponse);
    } catch (err) {
        console.error('[create-pix] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
