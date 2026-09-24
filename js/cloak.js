/**
 * cloak.js — Sistema de proteção com TOKEN OBRIGATÓRIO
 *
 * COMO FUNCIONA:
 *  - O link do seu anúncio DEVE ter ?tk=SEU_TOKEN_SECRETO
 *  - Sem o token → qualquer um vê a safe page
 *  - Com o token → token é salvo em sessionStorage, todas as páginas do funil funcionam
 *  - Bot/revisor Meta → safe page (por UA, IP, referrer)
 *  - Clone em outro domínio → página em branco
 *
 * SEU LINK DE ANÚNCIO DEVE SER:
 *   https://recompensasff.vercel.app/?tk=FF2024NARUTO
 *
 * TROQUE O TOKEN ABAIXO PARA ALGO ÚNICO SEU (sem espaços, só letras e números)
 */

(function () {
  'use strict';

  // ── CONFIG — TROQUE AQUI ──────────────────────────────────────────────────
  var SECRET_TOKEN  = 'FF2024NARUTO';       // Token secreto — mude para algo único
  var ALLOWED_HOSTS = [
    'recompensasff.vercel.app',
    'localhost',
    '127.0.0.1',
  ];
  var SAFE_PAGE     = '/safe.html';
  var TOKEN_KEY     = '_atok';              // Chave no sessionStorage
  // ─────────────────────────────────────────────────────────────────────────

  function goSafe() {
    try { document.documentElement.innerHTML = ''; } catch (e) {}
    window.location.replace(SAFE_PAGE);
  }

  // ── 1. ANTI-CLONE: verifica domínio ──────────────────────────────────────
  var host = window.location.hostname;
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

  // ── 2. TOKEN DE ACESSO ────────────────────────────────────────────────────
  // Verifica se o token está na URL ou já foi salvo na sessão
  var params   = new URLSearchParams(window.location.search);
  var urlToken = params.get('tk') || '';
  var sesToken = '';
  try { sesToken = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) {}

  if (urlToken === SECRET_TOKEN) {
    // Token correto na URL → salva na sessão para as próximas páginas do funil
    try { sessionStorage.setItem(TOKEN_KEY, SECRET_TOKEN); } catch (e) {}
  } else if (sesToken !== SECRET_TOKEN) {
    // Nem URL nem sessão têm o token → vai para safe page
    goSafe();
    return;
  }

  // ── 3. DETECÇÃO CLIENT-SIDE de referrers / contextos suspeitos ───────────
  var ref = (document.referrer || '').toLowerCase();
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

  // ── 5. DETECÇÃO de User-Agent client-side ────────────────────────────────
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
    var threshold  = 160;
    var widthDiff  = window.outerWidth  - window.innerWidth  > threshold;
    var heightDiff = window.outerHeight - window.innerHeight > threshold;
    if (widthDiff || heightDiff) {
      try { console.clear(); } catch (e) {}
    }
  }, 2000);

  // Desabilita clique direito
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Desabilita Ctrl+U e Ctrl+S
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && (e.key === 'u' || e.key === 's' || e.key === 'U' || e.key === 'S')) {
      e.preventDefault();
    }
  });

})();
