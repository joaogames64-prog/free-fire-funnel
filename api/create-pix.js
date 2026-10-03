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

        // Montar objeto de UTMs para a Masterfy
        const utms = body.utms || {};
        const utmPayload = {};
        if (utms.utm_source)   utmPayload.utm_source   = String(utms.utm_source);
        if (utms.utm_medium)   utmPayload.utm_medium   = String(utms.utm_medium);
        if (utms.utm_campaign) utmPayload.utm_campaign = String(utms.utm_campaign);
        if (utms.utm_content)  utmPayload.utm_content  = String(utms.utm_content);
        if (utms.utm_term)     utmPayload.utm_term     = String(utms.utm_term);
        if (utms.src)          utmPayload.src          = String(utms.src);
        if (utms.fbc)          utmPayload.fbc          = String(utms.fbc);
        if (utms.fbp)          utmPayload.fbp          = String(utms.fbp);

        const qs = new URLSearchParams(utmPayload).toString();
        const extRef = qs ? `ff_${Date.now()}?${qs}` : `ff_${Date.now()}`;

        const txPayload = {
            amount: amountCents,
            currency: 'BRL',
            method: 'PIX',
            description: body.product_title || 'Diamantes Free Fire',
            externalRef: extRef,
            ...(clientIp && { ip: clientIp }),
            payer: {
                name:  body.nome  || 'Cliente',
                email: body.email || 'cliente@email.com',
                phone,
                taxId: generateCPF()
            },
            items: [{ quantity: 1, name: body.product_title || 'Diamantes Free Fire', price: amountCents, type: 'DIGITAL' }]
        };

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
        res.status(201).json({
            ...rd,
            hash: rd.id || '',
            pix: { pix_qr_code: copypaste },
            pix_qrcode: copypaste
        });

    } catch (err) {
        console.error('[create-pix] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
