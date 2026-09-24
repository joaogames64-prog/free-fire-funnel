/**
 * cloak.js — Cloacker com fbclid (Facebook Click ID)
 *
 * COMO FUNCIONA:
 *  - Quando alguém clica num anúncio do Facebook/Instagram, o próprio FB
 *    adiciona automaticamente ?fbclid=XXXXX na URL. Sem isso → safe page.
 *  - A biblioteca de anúncios NÃO adiciona o fbclid, então revisores e
 *    concorrentes que copiam a URL veem a safe page.
 *  - Uma vez que o lead entrou com fbclid válido, o sessionStorage guarda
 *    o acesso e todo o funil funciona normalmente.
 *
 * LINK DO ANÚNCIO: apenas coloque sua URL normal, sem nada extra.
 *   https://recompensasff.vercel.app/
 *   O Facebook adiciona o fbclid automaticamente no clique.
 *
 * PARA TESTAR VOCÊ MESMO:
 *   https://recompensasff.vercel.app/?preview=SUA_SENHA_PREVIEW
 */

(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────────────────
  var ALLOWED_HOSTS    = [
    'recompensasff.vercel.app',
    'localhost',
    '127.0.0.1',
  ];
  var PREVIEW_PASSWORD = 'ffnaruto2024admin'; // Senha pra você testar sem fbclid
  var SAFE_PAGE        = '/safe.html';
  var SESSION_KEY      = '_fba';             // Chave do sessionStorage
  // ─────────────────────────────────────────────────────────────────────────

  function goSafe() {
    try { document.documentElement.innerHTML = ''; } catch (e) {}
    window.location.replace(SAFE_PAGE);
  }

  function setAccess() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
  }

  function hasAccess() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }

  // ── 1. ANTI-CLONE: verifica domínio ──────────────────────────────────────
  var host    = window.location.hostname;
  var allowed = ALLOWED_HOSTS.some(function (h) {
    return host === h || host.endsWith('.' + h);
  });
  if (!allowed) {
    document.documentElement.innerHTML =
      '<body style="background:#fff;color:#fff;font-size:1px;"> </body>';
    try { history.replaceState(null, '', '/'); } catch (e) {}
    try { window.fetch = function () { return Promise.reject(); }; } catch (e) {}
    throw new Error('');
  }

  // ── 2. GATE PRINCIPAL: fbclid / parâmetros de clique ─────────────────────
  var params  = new URLSearchParams(window.location.search);

  // Facebook adiciona fbclid em cliques de anúncio
  var fbclid  = params.get('fbclid') || '';
  // Instagram adiciona igshid em alguns casos
  var igshid  = params.get('igshid') || '';
  // TikTok adiciona ttclid
  var ttclid  = params.get('ttclid') || '';
  // Preview password para você testar sem fbclid
  var preview = params.get('preview') || '';

  var isRealClick  = fbclid.length > 5 || igshid.length > 3 || ttclid.length > 3;
  var isPreview    = preview === PREVIEW_PASSWORD;
  var alreadyIn    = hasAccess();

  // Referrers legítimos de clique em anúncio
  var ref     = (document.referrer || '').toLowerCase();
  var goodRefs = [
    'l.facebook.com',
    'lm.facebook.com',
    'm.facebook.com',
    'l.instagram.com',
    'www.instagram.com',
    'fb.com',
  ];
  var isGoodRef = goodRefs.some(function (g) { return ref.indexOf(g) !== -1; });

  if (isRealClick || isPreview || isGoodRef || alreadyIn) {
    // Acesso liberado → salva na sessão para as próximas páginas do funil
    setAccess();
  } else {
    // Sem fbclid nem sessão válida → safe page
    goSafe();
    return;
  }

  // ── 3. DETECÇÃO de referrers suspeitos (biblioteca de anúncios) ───────────
  var badRefs = [
    'facebook.com/ads/library',
    'adslibrary',
    'business.facebook.com',
    'adsmanager.facebook.com',
    'web.facebook.com',
    'instagram.com/ads',
    'ads.google.com',
  ];
  for (var i = 0; i < badRefs.length; i++) {
    if (ref.indexOf(badRefs[i]) !== -1) { goSafe(); return; }
  }

  // ── 4. DETECÇÃO de iframe da Ad Library ──────────────────────────────────
  try {
    if (window.self !== window.top) {
      var parentHref = '';
      try { parentHref = window.parent.location.href.toLowerCase(); } catch (e) {
        goSafe(); return;
      }
      if (parentHref.indexOf('facebook.com') !== -1 ||
          parentHref.indexOf('instagram.com') !== -1) {
        goSafe(); return;
      }
    }
  } catch (e) {}

  // ── 5. DETECÇÃO de User-Agent suspeito ───────────────────────────────────
  var ua = (navigator.userAgent || '').toLowerCase();
  var badUA = [
    'facebookexternalhit', 'facebot', 'meta-externalagent',
    'googlebot', 'bingbot', 'yandexbot',
    'headlesschrome', 'phantomjs', 'selenium', 'puppeteer', 'playwright',
    'python-requests', 'python-urllib', 'curl/', 'wget/',
  ];
  for (var j = 0; j < badUA.length; j++) {
    if (ua.indexOf(badUA[j]) !== -1) { goSafe(); return; }
  }

  // ── 6. VERIFICAÇÃO SERVER-SIDE via /api/cloak ─────────────────────────────
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/cloak', true);
  xhr.timeout = 3000;
  xhr.onload = function () {
    try {
      var data = JSON.parse(xhr.responseText);
      if (data && data.safe === true) { goSafe(); }
    } catch (e) {}
  };
  xhr.onerror   = function () {};
  xhr.ontimeout = function () {};
  xhr.send();

  // ── 7. ANTI-DEVTOOLS ──────────────────────────────────────────────────────
  setInterval(function () {
    var t = 160;
    if (window.outerWidth - window.innerWidth > t ||
        window.outerHeight - window.innerHeight > t) {
      try { console.clear(); } catch (e) {}
    }
  }, 2000);

  // Desabilita clique direito e atalhos de código fonte
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && (e.key === 'u' || e.key === 's' || e.key === 'U' || e.key === 'S')) {
      e.preventDefault();
    }
  });

})();
