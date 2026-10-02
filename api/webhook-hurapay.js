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

        // ─── RECUPERAR UTM E PRODUTO DO EXTERNAL_ID ───
        // Em create-pix.js codificamos: externalId = `ff_${Date.now()}_K${dKey}_C${utmC}`
        const extId = chargeData.externalId || '';
        const matchK = extId.match(/_K([0-9a-zA-Z]+)/);
        const matchC = extId.match(/_C([0-9a-zA-Z]*)/);
        
        const diamondKey = matchK ? matchK[1] : null;
        const utmCampaign = matchC ? matchC[1] : '';

        // Tabela de catálogo (mesma do create-pix)
        const CATALOG = {
            '1060': 'pd_1t928859032',
            '2180': 'pd_2k417768143',
            '5600': 'pd_5m839947254',
            '22400': 'pd_22n74856365',
            'semanal': 'pd_sm394857261',
            'mensal': 'pd_mn827463510',
            'booyah': 'pd_by102938475'
        };

        const extraMeta = {};
        if (diamondKey && CATALOG[diamondKey]) {
            extraMeta.productId = CATALOG[diamondKey];
            extraMeta.productName = 'Diamantes Free Fire'; // O nome não importa tanto se o productId bater, LowTrack mescla.
        } else {
            extraMeta.productId = 'default_ff';
            extraMeta.productName = 'Diamantes Free Fire';
        }

        if (utmCampaign) {
            extraMeta.utms = { utm_campaign: utmCampaign };
        }

        // Enviar para o LowTrack passando os metadados recuperados
        await sendToLowtrack(chargeData, extraMeta);

        // Sempre responder 200 para a Hura Pay não fazer retry
        res.status(200).json({ received: true, event: eventType });

    } catch (err) {
        console.error('[Webhook HuraPay] Erro interno:', err.message);
        // Mesmo em erro interno, devolvemos 200 para evitar retentativas desnecessárias da Hura Pay
        res.status(200).json({ received: true, error: err.message });
    }
};
