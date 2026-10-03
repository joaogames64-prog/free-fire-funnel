const MASTERFY_API_KEY = process.env.MASTERFY_API_KEY || 'RCVLPJq4NcyslJZIGiI-b5FXwgHySnLvWiuUF5wPoD8';
const MASTERFY_BASE = 'https://api.masterfypagamentos.com/v1';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { hash, txid } = req.query;
        const targetHash = hash || txid;
        
        if (!targetHash) {
            res.status(400).json({ error: 'Hash query parameter required' });
            return;
        }

        const resp = await fetch(`${MASTERFY_BASE}/payment/${targetHash}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${MASTERFY_API_KEY}`
            }
        });

        const responseData = await resp.json();
        
        let normalizedStatus = 'pending';
        // Masterfy retorna o status na RAIZ do JSON (responseData.status)
        // responseData.data contém apenas os dados do PIX (copypaste), NÃO o status
        const paymentStatus = (responseData.status || '').toUpperCase();

        if (paymentStatus === 'APPROVED' || paymentStatus === 'PAID') {
            normalizedStatus = 'paid';
        } else if (paymentStatus === 'EXPIRED' || paymentStatus === 'CANCELLED' || paymentStatus === 'REFUSED') {
            normalizedStatus = 'expired';
        } else if (paymentStatus === 'REFUNDED') {
            normalizedStatus = 'refunded';
        }

        const normalizedResponse = {
            ...responseData,
            status: normalizedStatus,
            payment_status: normalizedStatus,
        };

        res.status(resp.status).json(normalizedResponse);
    } catch (err) {
        console.error('[check-tx] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
