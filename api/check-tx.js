const XTECH_API_KEY = process.env.XTECH_API_KEY || 'gh_test_GW7OV-1e6K-flWuWfRa66vKND6CKQaaX';
const XTECH_BASE   = 'https://app.xtechpay.com.br/api/public/v1';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    try {
        const { hash, txid } = req.query;
        const targetHash = hash || txid;

        if (!targetHash) {
            res.status(400).json({ error: 'Hash query parameter required' });
            return;
        }

        const resp = await fetch(`${XTECH_BASE}/payments/${targetHash}`, {
            method: 'GET',
            headers: {
                'Accept':        'application/json',
                'Authorization': `Bearer ${XTECH_API_KEY}`
            }
        });

        const responseData = await resp.json();

        // XTech retorna: { data: { id, status, ... } }
        const payment       = responseData.data || responseData;
        const paymentStatus = (payment.status || '').toLowerCase();
        let normalizedStatus = 'pending';

        if (paymentStatus === 'approved' || paymentStatus === 'paid') {
            normalizedStatus = 'paid';
        } else if (paymentStatus === 'expired' || paymentStatus === 'cancelled' || paymentStatus === 'failed') {
            normalizedStatus = 'expired';
        } else if (paymentStatus === 'refunded') {
            normalizedStatus = 'refunded';
        }

        res.status(resp.status < 500 ? resp.status : 500).json({
            ...responseData,
            status:         normalizedStatus,
            payment_status: normalizedStatus
        });

    } catch (err) {
        console.error('[check-tx] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
