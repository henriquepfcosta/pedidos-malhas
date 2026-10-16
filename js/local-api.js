// Versão offline: guarda os pedidos no próprio aparelho (localStorage) e responde às mesmas
// rotas /api/pedidos do servidor, para que as telas funcionem igual nos dois modos.
(function () {
  if (window.MODO !== 'offline') return;

  const CHAVE = 'pedidos-malhas:db';
  // Data de hoje no fuso do aparelho (toISOString usa UTC: após as 21h no Brasil já seria amanhã).
  const hojeLocal = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

  function ler() {
    try {
      const s = localStorage.getItem(CHAVE);
      if (s) return JSON.parse(s);
    } catch {}
    return { seq: 0, pedidos: [] };
  }

  function gravar(db) {
    localStorage.setItem(CHAVE, JSON.stringify(db)); // lança erro se faltar espaço → a tela mostra "Não salvo"
  }

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    }));

  // ---------- Mesmas regras do server.js ----------
  function novoPedido(numero) {
    const agora = new Date().toISOString();
    return {
      id: uuid(), numero, status: 'rascunho', criadoEm: agora, atualizadoEm: agora,
      data: hojeLocal(), vendedor: '', contato: '',
      cliente: {
        razaoSocial: '', endereco: '', numero: '', bairro: '', cidade: '', uf: '',
        fone: '', email: '', cnpj: '', inscEstadual: '', frete: 'CIF', formaPagamento: '', descontoPct: 0,
      },
      itens: [], linhas: 18, mostrarComissao: false, dadosAdicionais: '', freteValor: 0, outrasDespesas: 0, aprovadoPor: '', dataAprovacao: '',
    };
  }

  function sanitize(body) {
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const str = (v) => (v == null ? '' : String(v).slice(0, 2000));
    const c = body.cliente || {};
    return {
      status: ['rascunho', 'enviado', 'aprovado', 'cancelado'].includes(body.status) ? body.status : 'rascunho',
      data: str(body.data), vendedor: str(body.vendedor), contato: str(body.contato),
      cliente: {
        razaoSocial: str(c.razaoSocial), endereco: str(c.endereco), numero: str(c.numero),
        bairro: str(c.bairro), cidade: str(c.cidade), uf: str(c.uf).toUpperCase().slice(0, 2),
        fone: str(c.fone), email: str(c.email), cnpj: str(c.cnpj), inscEstadual: str(c.inscEstadual),
        frete: c.frete === 'FOB' ? 'FOB' : 'CIF', formaPagamento: str(c.formaPagamento), descontoPct: num(c.descontoPct),
      },
      itens: (Array.isArray(body.itens) ? body.itens : []).slice(0, 200).map((i) => ({
        malha: str(i.malha), cor: str(i.cor), rolos: num(i.rolos), peso: num(i.peso), preco: num(i.preco),
        comissao: Math.min(100, Math.max(0, num(i.comissao))),
      })),
      linhas: Math.min(200, Math.max(1, Math.round(num(body.linhas)) || 18)),
      mostrarComissao: body.mostrarComissao === true,
      dadosAdicionais: str(body.dadosAdicionais), freteValor: num(body.freteValor), outrasDespesas: num(body.outrasDespesas),
      aprovadoPor: str(body.aprovadoPor), dataAprovacao: str(body.dataAprovacao),
    };
  }

  function totais(p) {
    const produtos = p.itens.reduce((s, i) => s + (i.preco || 0) * (i.peso || 0), 0);
    const desconto = ((p.cliente.descontoPct || 0) * produtos) / 100;
    return { produtos, desconto, total: produtos - desconto + (p.freteValor || 0) + (p.outrasDespesas || 0) };
  }

  const resumo = (p) => ({
    id: p.id, numero: p.numero, status: p.status, data: p.data, vendedor: p.vendedor,
    cliente: p.cliente.razaoSocial, cidade: p.cliente.cidade, uf: p.cliente.uf,
    total: totais(p).total, atualizadoEm: p.atualizadoEm,
  });

  const resposta = (status, body) => new Response(status === 204 ? null : JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });

  // ---------- Rotas ----------
  async function localApi(url, opts = {}) {
    const caminho = new URL(url, location.href).pathname.split('/').filter(Boolean);
    const p = caminho.slice(caminho.indexOf('api') + 1); // ['pedidos', id?, 'duplicar'?]
    const metodo = (opts.method || 'GET').toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : {};
    if (p[0] !== 'pedidos') return resposta(404, { erro: 'Rota não encontrada' });

    const db = ler();
    const id = p[1];

    if (!id && metodo === 'GET') return resposta(200, db.pedidos.map(resumo).sort((a, b) => b.numero - a.numero));
    if (!id && metodo === 'POST') {
      db.seq += 1;
      const novo = { ...novoPedido(db.seq), ...(Object.keys(body).length ? sanitize(body) : {}) };
      db.pedidos.push(novo);
      gravar(db);
      return resposta(201, novo);
    }

    const idx = db.pedidos.findIndex((x) => x.id === id);
    if (idx === -1) return resposta(404, { erro: 'Pedido não encontrado' });

    if (p[2] === 'duplicar' && metodo === 'POST') {
      db.seq += 1;
      const copia = { ...novoPedido(db.seq), ...sanitize(db.pedidos[idx]), status: 'rascunho', aprovadoPor: '', dataAprovacao: '' };
      copia.data = hojeLocal();
      db.pedidos.push(copia);
      gravar(db);
      return resposta(201, copia);
    }
    if (metodo === 'GET') return resposta(200, db.pedidos[idx]);
    if (metodo === 'PUT') {
      db.pedidos[idx] = { ...db.pedidos[idx], ...sanitize(body), atualizadoEm: new Date().toISOString() };
      gravar(db);
      return resposta(200, db.pedidos[idx]);
    }
    if (metodo === 'DELETE') {
      db.pedidos.splice(idx, 1);
      gravar(db);
      return resposta(204);
    }
    return resposta(405, { erro: 'Método não permitido' });
  }

  // ---------- Backup ----------
  const BACKUP_APP = 'pedidos-malhas';
  const CHAVE_LOGO = 'pedidos-malhas:logo';
  const LOGO_VALIDA = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
  const lerLogo = () => { try { return localStorage.getItem(CHAVE_LOGO); } catch { return null; } };

  function exportar() {
    const db = ler();
    const logo = lerLogo();
    return { app: BACKUP_APP, versao: 2, exportadoEm: new Date().toISOString(), seq: db.seq, pedidos: db.pedidos, ...(logo ? { logo } : {}) };
  }

  // Mescla um backup com os pedidos do aparelho. Pedido com o mesmo id: fica a versão alterada por último.
  function importar(dados) {
    if (!dados || dados.app !== BACKUP_APP || !Array.isArray(dados.pedidos)) {
      throw new Error('Este arquivo não é um backup do Pedidos de Malhas.');
    }
    const db = ler();
    let novos = 0;
    let atualizados = 0;
    for (const bruto of dados.pedidos) {
      if (!bruto || !bruto.id) continue;
      const p = {
        ...novoPedido(Number(bruto.numero) || 0), ...sanitize(bruto),
        id: String(bruto.id), numero: Number(bruto.numero) || 0,
        criadoEm: bruto.criadoEm || new Date().toISOString(), atualizadoEm: bruto.atualizadoEm || new Date().toISOString(),
      };
      const i = db.pedidos.findIndex((x) => x.id === p.id);
      if (i === -1) { db.pedidos.push(p); novos += 1; }
      else if (p.atualizadoEm > db.pedidos[i].atualizadoEm) { db.pedidos[i] = p; atualizados += 1; }
    }
    db.seq = Math.max(db.seq, Number(dados.seq) || 0, ...db.pedidos.map((x) => x.numero));
    gravar(db);
    // A logo do backup só é usada se o aparelho ainda não tiver uma (nunca troca a atual).
    let logo = false;
    const l = dados.logo;
    if (typeof l === 'string' && l.length <= 700000 && LOGO_VALIDA.test(l) && !lerLogo()) {
      try { localStorage.setItem(CHAVE_LOGO, l); logo = true; } catch {}
    }
    return { novos, atualizados, logo };
  }

  window.localApi = localApi;
  window.localDb = { exportar, importar, quantidade: () => ler().pedidos.length };

  // Pede ao navegador para não apagar os dados quando faltar espaço.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
