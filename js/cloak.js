/**
 * cloak.js — Script de proteção client-side
 *
 * Camadas de proteção:
 *  1. Anti-clone: bloqueia se não for o domínio autorizado
 *  2. Chama a API server-side /api/cloak para verificação de UA/IP/Referrer
 *  3. Detecção client-side extra: Ad Library iframe, referrers suspeitos
 *  4. Se qualquer check falhar → redireciona para /safe.html
 *
 * USO: Adicionar no <head> de cada HTML (antes de qualquer outro script):
 *   <script src="/js/cloak.js"></script>
 */

(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────────────────
  var ALLOWED_HOSTS = [
    'recompensasff.vercel.app',
    'localhost',
    '127.0.0.1',
  ];
  var SAFE_PAGE = '/safe.html';
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
    // Apaga todo o conteúdo e para a execução
    document.documentElement.innerHTML =
      '<body style="background:#000;color:#000;font-size:1px;"> </body>';
    // Sobrescreve histórico para dificultar análise
    try { history.replaceState(null, '', '/'); } catch (e) {}
    // Impede fetch/XHR de funcionar (destrói globais)
    try { window.fetch = function () { return Promise.reject(); }; } catch (e) {}
    throw new Error(''); // Interrompe execução de scripts subsequentes
  }

  // ── 2. DETECÇÃO CLIENT-SIDE de referrers / contextos suspeitos ───────────
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

  // ── 3. DETECÇÃO de iframe da Ad Library ──────────────────────────────────
  try {
    if (window.self !== window.top) {
      var parentHref = '';
      try { parentHref = window.parent.location.href.toLowerCase(); } catch (e) {
        // Se não consegue acessar parent (cross-origin), é suspeito
        goSafe(); return;
      }
      if (parentHref.indexOf('facebook.com') !== -1 ||
          parentHref.indexOf('instagram.com') !== -1) {
        goSafe(); return;
      }
    }
  } catch (e) { /* ignore */ }

  // ── 4. DETECÇÃO de User-Agent client-side (segunda camada) ───────────────
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

  // ── 5. VERIFICAÇÃO SERVER-SIDE via /api/cloak ─────────────────────────────
  // Faz a verificação de IP e UA no servidor
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/cloak', true);
  xhr.timeout = 3000; // 3s timeout — se falhar, deixa passar (não bloqueia usuário real)
  xhr.onload = function () {
    try {
      var data = JSON.parse(xhr.responseText);
      if (data && data.safe === true) { goSafe(); }
    } catch (e) { /* parse error — deixa passar */ }
  };
  xhr.onerror = function () { /* erro de rede — deixa passar */ };
  xhr.ontimeout = function () { /* timeout — deixa passar */ };
  xhr.send();

  // ── 6. ANTI-DEVTOOLS (dificulta análise do código) ────────────────────────
  // Detecta se DevTools está aberto (técnica de timing)
  var devtoolsCheck = function () {
    var threshold = 160;
    var widthDiff  = window.outerWidth  - window.innerWidth  > threshold;
    var heightDiff = window.outerHeight - window.innerHeight > threshold;
    if (widthDiff || heightDiff) {
      // DevTools aberto — não bloqueamos (falso positivo alto), mas limpamos console
      try { console.clear(); } catch (e) {}
    }
  };
  setInterval(devtoolsCheck, 2000);

  // Desabilita clique direito para dificultar cópia
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Desabilita Ctrl+U (ver código fonte) e Ctrl+S (salvar)
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && (e.key === 'u' || e.key === 's' || e.key === 'U' || e.key === 'S')) {
      e.preventDefault();
    }
  });

})();
