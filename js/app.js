// Utilitários compartilhados por todas as telas.
(function () {
  const offline = window.MODO === 'offline';
  document.documentElement.classList.add(offline ? 'modo-offline' : 'modo-servidor');

  if ('serviceWorker' in navigator) {
    // A cada abertura, confere se há versão nova publicada (sem internet, simplesmente não acha).
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {}));
  }

  if (offline) {
    // Versão offline: as rotas /api são respondidas pelo armazenamento do aparelho (js/local-api.js).
    window.api = (url, opts) => window.localApi(url, opts);
  } else {
    // fetch que leva para a tela de login quando a sessão expira.
    window.api = async function (url, opts = {}) {
      const r = await fetch(url, { credentials: 'same-origin', ...opts });
      if (r.status === 401) {
        location.href = `login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
        throw new Error('Sessão expirada');
      }
      return r;
    };
  }

  window.toast = function (msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('visivel');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('visivel'), 2600);
  };

  // Botão "Instalar app" (Chrome/Edge/Android). No iPhone: Compartilhar → Adicionar à Tela de Início.
  let pedidoInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pedidoInstalar = e;
    document.querySelectorAll('[data-instalar]').forEach((b) => (b.hidden = false));
  });
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-instalar]') || !pedidoInstalar) return;
    pedidoInstalar.prompt();
    await pedidoInstalar.userChoice;
    pedidoInstalar = null;
    document.querySelectorAll('[data-instalar]').forEach((b) => (b.hidden = true));
  });

  // iPhone/iPad no Safari, ainda não instalado na tela inicial.
  window.precisaInstalarIos = function () {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const instalado = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    return ios && !instalado;
  };

  window.sair = async function () {
    await fetch('api/logout', { method: 'POST' });
    location.href = 'login.html';
  };
})();
