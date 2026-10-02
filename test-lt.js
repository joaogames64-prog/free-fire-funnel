const { sendToLowtrack } = require('./api/lowtrack.js');
async function run() {
    const charge = { id: 'test_123', paymentStatus: 'PROCESSING', total: 1500, customer: { name: 'Test', email: 'test@test.com', phone: '11999999999' } };
    const meta = { utms: { utm_source: 'test' }, productName: 'Test Product' };
    const res = await sendToLowtrack(charge, meta);
    console.log('Result:', res);
}
run().catch(console.error);
