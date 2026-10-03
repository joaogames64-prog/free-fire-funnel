/**
 * Webhook Handler - Masterfy Pagamentos
 *
 * Recebe os eventos de pagamento da Masterfy e dispara o tracking para o LowTrack.
 *
 * Configure no painel da Masterfy (Configuracoes > Webhooks):
 *   URL: https://SEU_DOMINIO/api/webhook-masterfy
 *   Tipo: Payments
 */
const { sendToLowtrack } = require('./lowtrack');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Signature');

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

        // Masterfy envia o objeto de pagamento diretamente na raiz (sem envelope event/data)
        console.log('[Webhook Masterfy] Recebido. ID:', body.id || 'N/A', '| Status:', body.status || 'N/A');

        const chargeData = body;

        // --- RECUPERAR UTM E PRODUTO DO EXTERNAL_REF ---
        // Em create-pix.js codificamos: externalRef = `ff_${Date.now()}_K${dKey}_C${utmC}`
        const extId = chargeData.externalRef || '';
        const matchK = extId.match(/_K([0-9a-zA-Z]+)/);
        const matchC = extId.match(/_C([0-9a-zA-Z]*)/);

        const diamondKey = matchK ? matchK[1] : null;
        const utmCampaign = matchC ? matchC[1] : '';

        // Tabela de catalogo (mesma do create-pix)
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
            extraMeta.productName = 'Diamantes Free Fire';
        } else {
            extraMeta.productId = 'default_ff';
            extraMeta.productName = 'Diamantes Free Fire';
        }

        if (utmCampaign) {
            extraMeta.utms = { utm_campaign: utmCampaign };
        }

        // Adaptar: externalRef -> externalId para o lowtrack.js reconhecer
        chargeData.externalId = chargeData.externalRef;

        // Mapear status Masterfy -> formato do lowtrack.js
        // Masterfy: PENDING | PROCESSING | PAID | REFUSED | REFUNDED | MED | CHARGEDBACK
        const statusMap = {
            'PENDING':     'PENDING',
            'PROCESSING':  'PROCESSING',
            'PAID':        'PAID',
            'REFUSED':     'REFUSED',
            'REFUNDED':    'REFUNDED',
            'MED':         'REFUNDED',
            'CHARGEDBACK': 'REFUNDED'
        };
        chargeData.paymentStatus = statusMap[chargeData.status] || chargeData.status;

        // Descontar taxas da plataforma (6.99% + R$ 1,99) para enviar o valor líquido
        if (chargeData.amount) {
            const taxFixed = 199; // centavos
            const taxPercent = 0.0699;
            const fee = (chargeData.amount * taxPercent) + taxFixed;
            chargeData.amount = Math.max(0, Math.round(chargeData.amount - fee));
        }

        // Enviar para o LowTrack com metadados recuperados do externalRef
        await sendToLowtrack(chargeData, extraMeta);

        // Sempre responder 200 para a Masterfy nao fazer retry
        res.status(200).json({ received: true });

    } catch (err) {
        console.error('[Webhook Masterfy] Erro interno:', err.message);
        // Devolver 200 para evitar retentativas desnecessarias
        res.status(200).json({ received: true, error: err.message });
    }
};

