/**
 * Módulo LowTrack - Adapter de Tracking
 * 
 * MULTI-LOJISTA: Em produção, substitua LOWTRACK_TOKEN por uma busca
 * dinâmica no banco de dados, usando o companyId do webhook recebido
 * para encontrar o token do lojista correto.
 *    Ex: const LOWTRACK_TOKEN = await db.getTokenByCompanyId(companyId);
 */
const LOWTRACK_TOKEN = process.env.LOWTRACK_TOKEN || 'lt_cc5793ee738797e0d74bc17d753582eba4bdbca445771445';
const LOWTRACK_ENDPOINT = 'https://lowtrack.com.br/api/webhook';

/**
 * Mapeia o paymentStatus da Hura Pay para o evento esperado pelo LowTrack.
 * Regra crítica: NUNCA enviar tudo como sale.approved.
 */
function mapStatusToLowtrackEvent(paymentStatus) {
    const status = (paymentStatus || '').toUpperCase();
    
    // Pagamento confirmado → sale.approved (CAPI Purchase)
    if (['PAID', 'APPROVED', 'COMPLETED', 'SUCCEEDED', 'CONFIRMED'].includes(status)) {
        return 'sale.approved';
    }
    
    // PIX gerado, aguardando pagamento → sale.pending
    if (['OPEN', 'PROCESSING', 'PENDING', 'WAITING_PAYMENT', 'PIX_GENERATED'].includes(status)) {
        return 'sale.pending';
    }
    
    // Reembolso ou chargeback → sale.refunded
    if (['REFUNDED', 'CHARGEBACK', 'REVERSED', 'DISPUTED'].includes(status)) {
        return 'sale.refunded';
    }
    
    // Expirado, recusado, cancelado sem pagamento → IGNORAR
    return null;
}

/**
 * Dispara um evento de venda para o LowTrack.
 * 
 * @param {object} chargeData - Dados da cobrança da Hura Pay (pode ser o obj inteiro do webhook)
 * @param {object} extraMeta - Dados extras opcionais: { utms, userIp, userAgent, productName }
 * @returns {Promise<boolean>} true se enviado com sucesso, false em caso de erro ou evento ignorado
 */
async function sendToLowtrack(chargeData, extraMeta = {}) {
    try {
        // 1. Extração da fonte de dados (normaliza diferentes formatos do webhook da Hura Pay)
        const charge = chargeData.data || chargeData;
        
        // 2. Mapeamento do status para evento LowTrack
        const paymentStatus = charge.paymentStatus || charge.status || 'PENDING';
        const ltEvent = mapStatusToLowtrackEvent(paymentStatus);
        
        // Se o evento deve ser ignorado (ex: expirado sem pagamento, recusado), retorna sem chamar o LowTrack
        if (!ltEvent) {
            console.log(`[LowTrack] Evento ignorado para status: ${paymentStatus}`);
            return false;
        }
        
        // 3. ID da transação (DEVE ser o mesmo em pending e approved para o mesmo pedido)
        const transactionId = charge.id || charge.externalId || '';
        
        // 4. Valor em BRL (Hura Pay envia "total" em centavos)
        const amountCents = charge.total || charge.amount || 0;
        const amountBRL = Number((amountCents / 100).toFixed(2));
        
        // 5. Método de pagamento (Hura Pay foca em PIX, normalizar outros se necessário)
        let rawMethod = (charge.paymentMethod || charge.payment_method || 'pix').toLowerCase();
        let paymentMethod = 'pix';
        if (rawMethod.includes('credit') || rawMethod.includes('cartao'))  paymentMethod = 'credit_card';
        else if (rawMethod.includes('debit'))                               paymentMethod = 'debit_card';
        else if (rawMethod.includes('boleto') || rawMethod.includes('billet')) paymentMethod = 'boleto';
        else if (rawMethod.includes('paypal'))                              paymentMethod = 'paypal';
        
        // 6. Montagem de Produtos (produto principal + order bumps)
        const products = [];
        if (charge.items && Array.isArray(charge.items) && charge.items.length > 0) {
            charge.items.forEach(function(item) {
                const prod = item.product || {};
                products.push({
                    id: item.productId || prod.id || 'default',
                    name: prod.name || item.title || 'Produto Free Fire'
                });
            });
        }
        
        // Fallback: produto inferido via extraMeta (enviado no momento da criação do PIX)
        if (products.length === 0 && extraMeta.productName) {
            products.push({ id: extraMeta.productId || 'default_ff', name: extraMeta.productName });
        }
        
        // 7. Dados do cliente (Hura Pay mascara o email/phone nos webhooks)
        const customer = charge.customer || {};
        const fullName = customer.name || extraMeta.customerName || '';
        const nameParts = fullName.trim().split(' ');
        
        // 8. Tracking (UTMs salvas no momento da geração do PIX, passadas via extraMeta)
        const utms = extraMeta.utms || {};
        
        // 9. Montagem do payload final para o LowTrack
        const ltPayload = {
            event: ltEvent,
            transaction_id: transactionId,
            amount: amountBRL,
            currency: 'BRL',
            payment_method: paymentMethod,
            
            // Se tivermos os produtos (ex: no create-pix), enviamos.
            // Se não tivermos (ex: no webhook-hurapay), OMITIMOS para que o LowTrack mescle 
            // automaticamente usando apenas o transaction_id.
            ...(products.length > 0 && { product: products[0] }),
            ...(products.length > 0 && { products: products }),
            
            customer: {
                name:       fullName,
                first_name: nameParts[0] || '',
                last_name:  nameParts.slice(1).join(' ') || '',
                email:      customer.email || extraMeta.customerEmail || '',
                // Telefone: normalizar para formato 55DDNNNNNNNNN
                phone:      (customer.phone || extraMeta.customerPhone || '').replace(/\D/g, ''),
                document:   (customer.taxId || extraMeta.customerDoc || '').replace(/\D/g, ''),
                country:    'br'
            },
            
            tracking: {
                utm_source:   utms.utm_source   || '',
                utm_medium:   utms.utm_medium   || '',
                utm_campaign: utms.utm_campaign || '',
                utm_content:  utms.utm_content  || '',
                utm_term:     utms.utm_term     || '',
                src:          utms.src          || ''
            },
            
            // IP e User-Agent para melhor EMQ no Facebook (se disponíveis no handler)
            ...(extraMeta.userIp    && { user_ip:    extraMeta.userIp }),
            ...(extraMeta.userAgent && { user_agent: extraMeta.userAgent }),
            
            metadata: { platform: 'hurapay' }
        };
        
        // 10. Disparo para o LowTrack
        const response = await fetch(LOWTRACK_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LOWTRACK_TOKEN}`
            },
            body: JSON.stringify(ltPayload)
        });
        
        const responseText = await response.text();
        
        if (!response.ok) {
            console.error(`[LowTrack] Erro HTTP ${response.status}:`, responseText.substring(0, 200));
            return false;
        }
        
        console.log(`[LowTrack] ✅ Evento ${ltEvent} enviado | Tx: ${transactionId} | R$ ${amountBRL}`);
        return true;
        
    } catch (err) {
        // NÃO bloquear o fluxo de venda em caso de falha no tracking
        console.error('[LowTrack] ❌ Exceção ao enviar evento:', err.message);
        return false;
    }
}

module.exports = { sendToLowtrack };
