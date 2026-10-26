// Logo da empresa, escolhida pelo usuário em Configurações.
//  - Modo offline: guardada no próprio aparelho (localStorage).
//  - Modo servidor: guardada no servidor (data/config.json), igual para todos.
// Sempre circula como "data URL" (data:image/png ou data:image/jpeg;base64,…).
(function () {
  const offline = window.MODO === 'offline';
  const CHAVE = 'pedidos-malhas:logo';
  const VALIDA = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
  const LIMITE = 700000;      // caracteres aceitos ao salvar
  const ALVO = 300000;        // tamanho buscado ao reduzir a imagem
  let promessa = null;

  const valida = (s) => typeof s === 'string' && s.length <= LIMITE && VALIDA.test(s);

  async function lerDoServidor() {
    try {
      const r = await fetch('api/logo', { cache: 'no-store' });
      if (!r.ok) return null;
      const blob = await r.blob();
      return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ok(null); fr.readAsDataURL(blob); });
    } catch { return null; }
  }

  function lerLocal() {
    try { const s = localStorage.getItem(CHAVE); return valida(s) ? s : null; } catch { return null; }
  }

  // Devolve a logo atual (data URL) ou null. O resultado fica em memória durante a vida da página.
  function carregar() {
    if (!promessa) promessa = Promise.resolve(offline ? lerLocal() : lerDoServidor());
    return promessa;
  }

  // Servidor iniciado antes desta função existir: não conhece a rota e responde 404.
  const SERVIDOR_ANTIGO = 'O servidor está desatualizado. Pare-o (Ctrl+C no terminal) e inicie de novo com "node server.js".';

  async function salvar(dados) {
    if (!valida(dados)) throw new Error('Imagem inválida.');
    if (offline) {
      try { localStorage.setItem(CHAVE, dados); } catch { throw new Error('Não há espaço no aparelho para guardar a logo. Exporte um backup e libere espaço.'); }
    } else {
      const r = await api('/api/logo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo: dados }) });
      if (r.status === 404) throw new Error(SERVIDOR_ANTIGO);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Não foi possível salvar a logo.');
    }
    promessa = Promise.resolve(dados);
  }

  async function remover() {
    if (offline) {
      try { localStorage.removeItem(CHAVE); } catch {}
    } else {
      const r = await api('/api/logo', { method: 'DELETE' });
      if (r.status === 404) throw new Error(SERVIDOR_ANTIGO);
      if (!r.ok) throw new Error('Não foi possível remover a logo.');
    }
    promessa = Promise.resolve(null);
  }

  function temTransparencia(ctx, w, h) {
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  }

  // Abre a imagem escolhida e a reduz (máx. 720 px no maior lado). Fundo transparente continua em PNG;
  // as demais viram JPEG. Se ficar grande demais, reduz mais. Lança Error com mensagem para o usuário.
  async function preparar(arquivo) {
    if (!arquivo || !(arquivo.type || '').startsWith('image/')) throw new Error('Escolha um arquivo de imagem (JPG ou PNG).');
    if (arquivo.size > 20 * 1024 * 1024) throw new Error('A imagem é muito grande. Escolha uma com menos de 20 MB.');
    const url = URL.createObjectURL(arquivo);
    try {
      const img = new Image();
      img.src = url;
      try { await img.decode(); } catch { throw new Error('Não foi possível abrir esta imagem. Use um arquivo JPG ou PNG.'); }
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('Não foi possível abrir esta imagem. Use um arquivo JPG ou PNG.');
      let lado = 720;
      for (let tentativa = 0; tentativa < 6; tentativa += 1) {
        const esc = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * esc));
        const h = Math.max(1, Math.round(img.naturalHeight * esc));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const dados = temTransparencia(ctx, w, h) ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88);
        if (valida(dados) && dados.length <= ALVO) return dados;
        lado = Math.round(lado * 0.75);
      }
      throw new Error('Não foi possível reduzir esta imagem. Escolha outra.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  window.logoStore = { carregar, salvar, remover, preparar, valida };
})();
