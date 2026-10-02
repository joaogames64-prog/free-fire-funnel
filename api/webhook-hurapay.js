/**
 * Webhook Handler - Hura Pay
 * 
 * Recebe os eventos de pagamento da Hura Pay e dispara o tracking para o LowTrack.
 * 
 * Configure no painel da Hura Pay:
 *   URL: https://SEU_DOMINIO/api/webhook-hurapay
 *   Eventos: charge.paid, charge.expired, charge.refunded
 */
const { sendToLowtrack } = require('./lowtrack');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch(e) {}
        }
        body = body || {};

        console.log('[Webhook HuraPay] Evento recebido:', body.event || body.type || 'sem tipo', '| ID:', (body.data && body.data.id) || body.id || 'N/A');

        // O evento da Hura Pay tem formato { event: "charge.paid", data: { ...chargeData } }
        const eventType = body.event || body.type || '';
        const chargeData = body.data || body;

        // Enviar para o LowTrack
        // NÃO enviamos "productName" fallback aqui. Como a HuraPay não envia os itens no webhook,
        // omitir os produtos forçará o LowTrack a mesclar com a venda pendente baseada apenas no transaction_id,
        // herdando os produtos corretos e as UTMs.
        await sendToLowtrack(chargeData);

        // Sempre responder 200 para a Hura Pay não fazer retry
        res.status(200).json({ received: true, event: eventType });

    } catch (err) {
        console.error('[Webhook HuraPay] Erro interno:', err.message);
        // Mesmo em erro interno, devolvemos 200 para evitar retentativas desnecessárias da Hura Pay
        res.status(200).json({ received: true, error: err.message });
    }
};
