const { sendToLowtrack } = require('./lowtrack');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    try {
        let body = req.body || {};
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e){} }

        const amountCents = Math.round(parseFloat(body.amount || '0') * 100);
        // Descontar taxas da plataforma para envio líquido
        const fee = (amountCents * 0.0699) + 199;
        const netAmountCents = Math.max(0, Math.round(amountCents - fee));

        const rawIp = req.headers['x-forwarded-for'] || '';

        await sendToLowtrack(
            {
                id: body.txid,
                externalId: `ff_${Date.now()}_K1060_C${(body.utms || {}).utm_campaign || ''}`, // Dummy para não dar erro
                paymentStatus: 'PROCESSING',
                total: netAmountCents,
                items: [{ product: { name: body.productTitle || 'Diamantes Free Fire' } }],
                customer: { name: body.nome || 'Cliente', email: body.email || '', phone: body.telefone || '' }
            },
            {
                utms: body.utms || {},
                productName: body.productTitle || 'Diamantes Free Fire',
                customerName: body.nome || '',
                customerEmail: body.email || '',
                customerPhone: body.telefone || '',
                userIp: rawIp,
                userAgent: req.headers['user-agent'] || ''
            }
        );

        res.status(200).json({ success: true });
    } catch (err) {
        console.error('[track-pending] Erro:', err.message);
        res.status(500).json({ error: err.message });
    }
};
