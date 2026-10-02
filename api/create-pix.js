const https = require('https');
const { sendToLowtrack } = require('./lowtrack');

const MASTERFY_API_KEY = process.env.MASTERFY_API_KEY || 'RCVLPJq4NcyslJZIGiI-b5FXwgHySnLvWiuUF5wPoD8';
const MASTERFY_BASE = 'https://api.masterfypagamentos.com/v1';

// ─── Catálogo de Produtos Hura Pay ───────────────────────────────────────────
const CATALOG = {
    diamonds_1060:         'prod_qm7aes45iq2lenwalhx9ox7h',
    diamonds_2180:         'prod_g533h01qhxo136rinn2lxaas',
    diamonds_5600:         'prod_qjiko49osnct35fsj7ezq16x',
    diamonds_22400:        'prod_gnt1r4qpr2ht46g28u8q6709',
    assinatura_semanal:    'prod_q20di0s48br8k1ti0257bp3g',
    assinatura_mensal:     'prod_mnsv76o37xi1hlu1qk0tj9tz',
    passe_booyah:          'prod_gifouivikanw2lgjk08v8nqr',
    verificacao_seguranca: 'prod_ksn0ul1jxyol9o745kz5rdtv',
    calca_angelical:       'prod_gw30q4x416qcd4mdjhnu6hts',
    conjunto_naruto:       'prod_t0u4cxszzajuyve6ywcby8wy',
    conjunto_sasuke:       'prod_o1osnjdq9jtya62gw3xeso4u',
    conjunto_kakashi:      'prod_s42oj13aakw3yhannexcqcd7',
    mascara_velho:         'prod_lrq4fqa6ucqpf9nsk8zdv9q8'
};

const DIAMOND_CATALOG_KEY = {
    '1060': 'diamonds_1060', '2180': 'diamonds_2180',
    '5600': 'diamonds_5600', '22400': 'diamonds_22400'
};

const BUMP_CATALOG_KEY = {
    'assinatura semanal': 'assinatura_semanal',
    'assinatura mensal':  'assinatura_mensal',
    'passe booyah':       'passe_booyah',
    'passe booyah premium': 'passe_booyah',
    'passe booyah premium plus': 'passe_booyah',
    'calça angelical azul': 'calca_angelical',
    'calca angelical azul': 'calca_angelical',
    'conjunto naruto': 'conjunto_naruto',
    'conjunto sasuke': 'conjunto_sasuke',
    'conjunto kakashi': 'conjunto_kakashi',
    'máscara antiga barba do velho': 'mascara_velho',
    'mascara antiga barba do velho': 'mascara_velho'
};

function generateCPF() {
    const d = [];
    for (let i = 0; i < 9; i++) d.push(Math.floor(Math.random() * 9) + (i === 0 ? 1 : 0));
    if (d.every(x => x === d[0])) d[8] = (d[0] + 1) % 10;
    let s1 = 0; for (let i = 0; i < 9; i++) s1 += d[i] * (10 - i);
    let v1 = 11 - (s1 % 11); if (v1 >= 10) v1 = 0; d.push(v1);
    let s2 = 0; for (let i = 0; i < 10; i++) s2 += d[i] * (11 - i);
    let v2 = 11 - (s2 % 11); if (v2 >= 10) v2 = 0; d.push(v2);
    return d.join('');
}

function masterfyRequest(method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const fullUrl = `${MASTERFY_BASE}${endpoint}`;
        const parsed = new URL(fullUrl);
        const bodyStr = body ? JSON.stringify(body) : null;
        const options = {
            hostname: parsed.hostname, port: 443, path: parsed.pathname, method,
            headers: {
                'Content-Type': 'application/json', 'Accept': 'application/json',
                'Authorization': `Bearer ${MASTERFY_API_KEY}`,
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

        // amount em centavos (campo exigido pelo /v1/charge/pix)
        const amountCents = Math.round(parseFloat(body.amount || '0') * 100);
        const phone = (body.telefone || '').replace(/\D/g, '') || '11999999999';

        // Montar lista de itens para tracking (não enviamos ao /charge/pix porque ele não suporta items)
        const bumpsList = Array.isArray(body.bumps) ? body.bumps : [];
        const trackItems = [];
        const diamondKey = DIAMOND_CATALOG_KEY[String(body.plano || '').replace(/\./g, '')];
        if (diamondKey && CATALOG[diamondKey]) {
            // Usar product_title completo (ex: "1166 Diamantes Free Fire") como nome do produto principal
            trackItems.push({ productId: CATALOG[diamondKey], product: { name: body.product_title || 'Diamantes Free Fire' } });
        }
        bumpsList.forEach(b => {
            const bk = BUMP_CATALOG_KEY[(b.name || '').toLowerCase().trim()];
            if (bk && CATALOG[bk]) trackItems.push({ productId: CATALOG[bk], product: { name: b.name } });
        });

        // ─── Payload para Masterfy ────────────────────────────────────
        // Encode utm_campaign and product info into externalId to recover them in the webhook
        const utmC = (body.utms && body.utms.utm_campaign) ? String(body.utms.utm_campaign).replace(/[^a-zA-Z0-9]/g, '').substring(0, 15) : '';
        const dKey = diamondKey || '1060';
        const externalIdVal = `ff_${Date.now()}_K${dKey}_C${utmC}`;

        const txPayload = {
            amount: amountCents,
            currency: "BRL",
            method: "PIX",
            description: body.product_title || "Diamantes Free Fire",
            externalRef: externalIdVal,
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
            payer: {
                name:  body.nome  || 'Cliente',
                email: body.email || 'cliente@email.com',
                phone: phone,
                taxId: generateCPF()
            },
            // Um unico item com valor total para garantir que items[].price * qty == amount
            items: [{ quantity: 1, name: body.product_title || "Diamantes Free Fire", price: amountCents, type: "DIGITAL" }]
        };

        console.log(`[create-pix] Criando PIX na Masterfy: R$ ${(amountCents / 100).toFixed(2)} para ${txPayload.payer.name}`);

        const result = await masterfyRequest('POST', '/payment', txPayload);
        const rd = result.data || {};

        console.log('[create-pix] Status Masterfy:', result.status, '| Resposta:', JSON.stringify(rd).substring(0, 300));

        if (result.status !== 201 && result.status !== 200) {
            throw new Error(`Masterfy ${result.status}: ` + JSON.stringify(rd.message || rd.error || rd));
        }


        // ─── Normalização para manter compatibilidade com o frontend ────────
        // Masterfy returns data.copypaste for PIX string
        const copypaste = (rd.data && rd.data.copypaste) ? rd.data.copypaste : '';
        const normalizedResponse = {
            ...rd,
            hash: rd.id || '',
            pix: {
                pix_qr_code:        copypaste,
                pix_qr_code_base64: '' 
            },
            pix_qrcode: copypaste
        };

        // ─── Disparar sale.pending no LowTrack (AGORA COM AWAIT PARA VERCEL) ─────────
        const utms = body.utms || {};
        try {
            await sendToLowtrack(
                {
                    id: normalizedResponse.hash, externalId: txPayload.externalRef,
                    paymentStatus: 'PROCESSING', total: amountCents,
                    items: trackItems,
                    customer: { name: body.nome || 'Cliente', email: body.email || '', phone }
                },
                {
                    // product_title já tem o nome completo com bônus (ex: "1166 Diamantes Free Fire")
                    utms,
                    productName: body.product_title || 'Diamantes Free Fire',
                    customerName: body.nome || '', customerEmail: body.email || '', customerPhone: phone,
                    userIp: req.headers['x-forwarded-for'] || '',
                    userAgent: req.headers['user-agent'] || ''
                }
            );
        } catch(err) {
            console.error('[LowTrack] Falha sale.pending:', err.message);
        }

        res.status(201).json(normalizedResponse);
    } catch (err) {
        console.error('[create-pix] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
