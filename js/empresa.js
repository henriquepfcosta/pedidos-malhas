// Dados da empresa impressos no orçamento (CNPJ do cabeçalho e texto do rodapé), editados em Configurações.
//  - Modo offline: guardados no próprio aparelho (localStorage).
//  - Modo servidor: guardados no servidor (data/config.json), iguais para todos.
(function () {
  const offline = window.MODO === 'offline';
  const CHAVE = 'pedidos-malhas:empresa';
  let promessa = null;

  const limpar = (e) => ({ cnpj: String(e?.cnpj ?? '').trim().slice(0, 60), rodape: String(e?.rodape ?? '').trim().slice(0, 300) });

  async function lerDoServidor() {
    try {
      const r = await fetch('api/empresa', { cache: 'no-store' });
      return r.ok ? limpar(await r.json()) : limpar();
    } catch { return limpar(); }
  }

  function lerLocal() {
    try { return limpar(JSON.parse(localStorage.getItem(CHAVE))); } catch { return limpar(); }
  }

  // Devolve { cnpj, rodape } (textos vazios quando não preenchidos).
  function carregar() {
    if (!promessa) promessa = Promise.resolve(offline ? lerLocal() : lerDoServidor());
    return promessa;
  }

  async function salvar(dados) {
    const e = limpar(dados);
    if (offline) {
      try { localStorage.setItem(CHAVE, JSON.stringify(e)); } catch { throw new Error('Não há espaço no aparelho para guardar os dados.'); }
    } else {
      const r = await api('/api/empresa', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) });
      if (r.status === 404) throw new Error('O servidor está desatualizado. Pare-o (Ctrl+C no terminal) e inicie de novo com "node server.js".');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Não foi possível salvar os dados.');
    }
    promessa = Promise.resolve(e);
  }

  window.empresaStore = { carregar, salvar };
})();
