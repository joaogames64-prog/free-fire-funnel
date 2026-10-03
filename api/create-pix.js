const XTECH_API_KEY = process.env.XTECH_API_KEY || 'gh_test_GW7OV-1e6K-flWuWfRa66vKND6CKQaaX';
const XTECH_BASE   = 'https://app.xtechpay.com.br/api/public/v1';

// Mapa de plano → nome do produto cadastrado na XTech
const PRODUCT_NAMES = {
    '1060':              '1060 + 106 Diamantes Free Fire',
    '2180':              '2180 + 218 Diamantes Free Fire',
    '5600':              '5600 + 560 Diamantes Free Fire',
    '22400':             '22400 + 2240 Diamantes Free Fire',
    'semanal':           'Passe Semanal Free Fire',
    'mensal':            'Passe Mensal Free Fire',
    'booyah':            'Passe Booyah Free Fire',
    'verificacao_seguranca': 'Verificacao de Seguranca Free Fire',
    'vip_entrega':       'Fura-Fila VIP - Entrega Expressa FF',
};

function generateCPF() {
    const d = Array.from({length: 9}, () => Math.floor(Math.random() * 10));
    if (d.every(x => x === d[0])) d[8] = (d[8] + 1) % 10;
    let d1 = d.reduce((a, v, i) => a + (10 - i) * v, 0);
    d1 = 11 - (d1 % 11); if (d1 >= 10) d1 = 0; d.push(d1);
    let d2 = d.reduce((a, v, i) => a + (11 - i) * v, 0);
    d2 = 11 - (d2 % 11); if (d2 >= 10) d2 = 0; d.push(d2);
    return d.join('');
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

        // XTech aceita valor em BRL (float), não centavos
        const amount  = parseFloat(body.amount || '0');
        const plano   = body.plano || '1060';
        const utms    = body.utms  || {};
        const phone   = (body.telefone || '').replace(/\D/g, '') || '11999999999';
        const phoneFormatted = '+55' + phone;

        const productTitle = body.product_title
            || PRODUCT_NAMES[plano]
            || 'Diamantes Free Fire';

        // external_id: codifica plano e campanha para o webhook recuperar depois
        const externalId = `ff_${Date.now()}_K${plano}_C${utms.utm_campaign || ''}`.substring(0, 255);
        // Idempotency-Key única por tentativa
        const idempotencyKey = externalId;

        const txPayload = {
            external_id:    externalId,
            amount:         amount,
            payment_method: 'pix',
            description:    productTitle.substring(0, 200),
            customer: {
                name:     body.nome  || 'Cliente',
                email:    body.email || 'cliente@email.com',
                phone:    phoneFormatted,
                document: generateCPF()
            },
            items: [{
                title:      productTitle,
                quantity:   1,
                unit_price: amount
            }],
            metadata: {
                plano,
                utm_campaign: utms.utm_campaign || '',
                utm_source:   utms.utm_source   || '',
                utm_medium:   utms.utm_medium   || ''
            }
        };

        // ── Chamar XTech Pay ────────────────────────────────────────────
        const resp = await fetch(`${XTECH_BASE}/payments`, {
            method: 'POST',
            headers: {
                'Content-Type':    'application/json',
                'Accept':          'application/json',
                'Authorization':   `Bearer ${XTECH_API_KEY}`,
                'Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify(txPayload)
        });

        let rd;
        try { rd = await resp.json(); } catch(e) { rd = {}; }

        if (resp.status !== 201 && resp.status !== 200) {
            throw new Error(`XTech ${resp.status}: ${JSON.stringify(rd.error || rd)}`);
        }

        // XTech retorna: { data: { id, pix: { copy_paste }, status } }
        const payment      = rd.data || rd;
        const copypaste    = payment.pix ? payment.pix.copy_paste : '';
        const transactionId = payment.id || rd.id || '';

        // ── Responder o PIX pro frontend imediatamente ───────────────────
        res.status(201).json({
            ...rd,
            hash:        transactionId,
            pix:         { pix_qr_code: copypaste },
            pix_qrcode:  copypaste
        });

    } catch (err) {
        console.error('[create-pix] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
