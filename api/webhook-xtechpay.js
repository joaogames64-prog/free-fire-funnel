/**
 * Webhook Handler - XTech Pay
 *
 * Recebe eventos de pagamento da XTech Pay e dispara o tracking para o LowTrack.
 *
 * Configure no painel da XTech Pay (Integrações > API > Notificações):
 *   URL: https://recompensasff.vercel.app/api/webhook-xtechpay
 *   Eventos: payment.approved, payment.expired, payment.refunded
 */
const { sendToLowtrack } = require('./lowtrack');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, GetHub-Signature');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return; }

    try {
        let body = req.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
        body = body || {};

        // XTech envia: { id: "evt_...", type: "payment.approved", data: { id, external_id, status, amount, ... } }
        const eventType = body.type || '';
        const data      = body.data || body; // fallback se vier flat

        console.log('[Webhook XTech] Evento:', eventType, '| Payment ID:', data.id || 'N/A', '| Status:', data.status || 'N/A');

        // Aceitamos pagamentos aprovados e criados (pendentes)
        if (eventType !== 'payment.approved' && data.status !== 'approved' && eventType !== 'payment.created' && data.status !== 'pending') {
            return res.status(200).json({ received: true, ignored: eventType || data.status });
        }

        // ── Recuperar plano e campanha do external_id ──────────────────
        // Em create-pix.js codificamos: external_id = `ff_${Date.now()}_K${plano}_C${utm_campaign}`
        const extId    = data.external_id || '';
        const matchK   = extId.match(/_K([0-9a-zA-Z_]+?)_C/);
        const matchC   = extId.match(/_C([^&\s]*)/);
        const plano        = matchK ? matchK[1] : null;
        const utmCampaign  = matchC ? matchC[1] : '';

        // Produto
        const PRODUCT_NAMES = {
            '1060':   '1060 + 106',
            '2180':   '2180 + 218',
            '5600':   '5600 + 560',
            '22400':  '22400 + 2240',
            'semanal':'Assinatura Semanal',
            'mensal': 'Assinatura Mensal',
            'booyah': 'Passe Booyah Premium Plus',
            'verificacao_seguranca': 'Verificação de Segurança',
            'vip_entrega': 'Fura-Fila VIP',
        };
        const productName = (plano && PRODUCT_NAMES[plano]) || data.description || 'Diamantes Free Fire';

        // ── Mapear para o formato do LowTrack ─────────────────────────
        // XTech retorna amount em BRL (float) → converter para centavos
        const amountBRL   = data.amount || 0;
        const amountCents = Math.round(amountBRL * 100);

        let finalStatus = 'PENDING';
        if (eventType === 'payment.approved' || data.status === 'approved') {
            finalStatus = 'PAID';
        }

        const chargeData = {
            id:            data.id   || '',
            externalId:    extId,
            paymentStatus: finalStatus,
            total:         amountCents,
            customer: {
                name:  (data.customer && data.customer.name)  || '',
                email: (data.customer && data.customer.email) || '',
                phone: (data.customer && data.customer.phone) || '',
                taxId: (data.customer && data.customer.document) || ''
            }
        };

        const extraMeta = {
            productName,
            customerName:  chargeData.customer.name,
            customerEmail: chargeData.customer.email,
            customerPhone: chargeData.customer.phone,
            customerDoc:   chargeData.customer.taxId
            // NÃO enviamos UTMs aqui. O LowTrack mescla com o sale.pending
            // que já foi enviado pelo frontend com 100% das UTMs e FBC.
        };

        await sendToLowtrack(chargeData, extraMeta);

        res.status(200).json({ received: true });

    } catch (err) {
        console.error('[Webhook XTech] Erro:', err.message);
        res.status(200).json({ received: true, error: err.message });
    }
};
