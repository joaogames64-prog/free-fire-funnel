const { sendToLowtrack } = require('./lowtrack');

const MASTERFY_API_KEY = process.env.MASTERFY_API_KEY || 'RCVLPJq4NcyslJZIGiI-b5FXwgHySnLvWiuUF5wPoD8';
const MASTERFY_BASE = 'https://api.masterfypagamentos.com/v1';

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

        const amountCents = Math.round(parseFloat(body.amount || '0') * 100);
        const phone = (body.telefone || '').replace(/\D/g, '') || '11999999999';
        const rawIp = req.headers['x-forwarded-for'] || '';
        const clientIp = rawIp.split(',')[0].trim() || undefined;
        const utms = body.utms || {};

        // Taxas da plataforma (6.99% + R$ 1,99)
        const fee = (amountCents * 0.0699) + 199;
        const netAmountCents = Math.max(0, Math.round(amountCents - fee));

        const txPayload = {
            amount: amountCents,
            currency: 'BRL',
            method: 'PIX',
            description: String(body.product_title || 'Diamantes Free Fire').substring(0, 200),
            externalRef: `ff_${Date.now()}`,
            ...(clientIp && { ip: clientIp }),
            payer: {
                name:  body.nome  || 'Cliente',
                email: body.email || 'cliente@email.com',
                phone,
                taxId: generateCPF()
            },
            items: [{ quantity: 1, name: body.product_title || 'Diamantes Free Fire', price: amountCents, type: 'DIGITAL' }]
        };

        // ── Chamar Masterfy ──────────────────────────────────────────────
        const resp = await fetch(`${MASTERFY_BASE}/payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${MASTERFY_API_KEY}`
            },
            body: JSON.stringify(txPayload)
        });

        let rd;
        try { rd = await resp.json(); } catch(e) { rd = {}; }

        if (resp.status !== 201 && resp.status !== 200) {
            throw new Error(`Masterfy ${resp.status}: ${JSON.stringify(rd.message || rd.error || rd)}`);
        }

        const copypaste = (rd.data && rd.data.copypaste) ? rd.data.copypaste : '';
        const transactionId = rd.id || '';

        // ── Enviar sale.pending pro LowTrack ANTES de responder ──────────
        // Usa timeout de 3s pra não travar demais (Vercel mata o processo após res.json)
        try {
            const ltTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000));
            await Promise.race([
                sendToLowtrack(
                    {
                        id: transactionId,
                        externalId: txPayload.externalRef,
                        paymentStatus: 'PROCESSING',
                        total: netAmountCents,
                        items: [{ product: { name: body.product_title || 'Diamantes Free Fire' } }],
                        customer: { name: body.nome || 'Cliente', email: body.email || '', phone }
                    },
                    {
                        utms,
                        productName: body.product_title || 'Diamantes Free Fire',
                        customerName: body.nome || '',
                        customerEmail: body.email || '',
                        customerPhone: phone,
                        userIp: rawIp,
                        userAgent: req.headers['user-agent'] || ''
                    }
                ),
                ltTimeout
            ]);
        } catch(ltErr) {
            console.error('[LowTrack] sale.pending:', ltErr.message);
        }

        // ── Responder o PIX pro frontend ─────────────────────────────────
        res.status(201).json({
            ...rd,
            hash: transactionId,
            pix: { pix_qr_code: copypaste },
            pix_qrcode: copypaste
        });

    } catch (err) {
        console.error('[create-pix] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
