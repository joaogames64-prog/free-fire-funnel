/**
 * Webhook Handler - Masterfy Pagamentos
 *
 * Recebe os eventos de pagamento da Masterfy e dispara o tracking para o LowTrack.
 *
 * Configure no painel da Masterfy (Configuracoes > Webhooks):
 *   URL: https://recompensasff.vercel.app/api/webhook-masterfy
 *   Tipo: Payments
 */
const { sendToLowtrack } = require('./lowtrack');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Signature');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    try {
        let body = req.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
        body = body || {};

        console.log('[Webhook Masterfy] Recebido. ID:', body.id || 'N/A', '| Status:', body.status || 'N/A');

        // Mapear status Masterfy -> formato do lowtrack.js
        const statusMap = {
            'PENDING':     'PENDING',
            'PROCESSING':  'PROCESSING',
            'PAID':        'PAID',
            'REFUSED':     'REFUSED',
            'REFUNDED':    'REFUNDED',
            'MED':         'REFUNDED',
            'CHARGEDBACK': 'REFUNDED'
        };

        // Descontar taxas (6.99% + R$ 1,99) para enviar valor líquido
        let netAmount = body.amount || 0;
        if (netAmount > 0) {
            const fee = (netAmount * 0.0699) + 199;
            netAmount = Math.max(0, Math.round(netAmount - fee));
        }

        const chargeData = {
            id: body.id || '',
            externalId: body.externalRef || '',
            paymentStatus: statusMap[body.status] || body.status || 'PENDING',
            total: netAmount,
            customer: {
                name:  body.payer ? body.payer.name  : '',
                email: body.payer ? body.payer.email : '',
                phone: body.payer ? body.payer.phone : '',
                taxId: body.payer ? body.payer.taxId : ''
            }
        };

        // ─── RECUPERAR UTM E PRODUTO DO EXTERNAL_REF ───
        // Em create-pix.js codificamos: externalRef = `ff_${Date.now()}_K${plano}_C${utm_campaign}`
        const extId = chargeData.externalId || '';
        const matchK = extId.match(/_K([0-9a-zA-Z]+)/);
        const matchC = extId.match(/_C([0-9a-zA-Z]*)/);

        const diamondKey = matchK ? matchK[1] : null;
        const utmCampaign = matchC ? matchC[1] : '';

        // Produto vem do description ou items da Masterfy
        const productName = body.description || 
            (body.items && body.items[0] ? body.items[0].name : 'Diamantes Free Fire');

        const extraMeta = {
            productName,
            customerName:  chargeData.customer.name,
            customerEmail: chargeData.customer.email,
            customerPhone: chargeData.customer.phone,
            customerDoc:   chargeData.customer.taxId
        };

        if (utmCampaign) {
            extraMeta.utms = { utm_campaign: utmCampaign };
        }

        await sendToLowtrack(chargeData, extraMeta);

        res.status(200).json({ received: true });

    } catch (err) {
        console.error('[Webhook Masterfy] Erro:', err.message);
        res.status(200).json({ received: true, error: err.message });
    }
};
