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
  // Modelos de nota: 'pedido', 'orcamento' e 'servico' (mesmo formulário do orçamento). Cada modelo tem a sua numeração.
  const CONTADORES = { pedido: 'seq', orcamento: 'seqOrcamento', servico: 'seqServico' };
  const tipoValido = (t) => (CONTADORES[t] ? t : 'pedido');
  function proximoNumero(db, tipo) {
    const campo = CONTADORES[tipoValido(tipo)];
    db[campo] = (db[campo] || 0) + 1;
    return db[campo];
  }

  function novoPedido(numero, tipo) {
    const agora = new Date().toISOString();
    tipo = tipoValido(tipo);
    return {
      id: uuid(), tipo, numero, status: 'rascunho', criadoEm: agora, atualizadoEm: agora,
      data: hojeLocal(), vendedor: '', contato: '',
      cliente: {
        razaoSocial: '', endereco: '', numero: '', bairro: '', cidade: '', uf: '',
        fone: '', email: '', cnpj: '', inscEstadual: '', frete: 'CIF', formaPagamento: '', descontoPct: 0,
      },
      itens: [], linhas: tipo === 'pedido' ? 18 : 12, mostrarComissao: false, dadosAdicionais: '', freteValor: 0, outrasDespesas: 0, aprovadoPor: '', dataAprovacao: '',
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

  // Pedido: preço × peso (kg). Orçamento e serviço: valor unitário × quantidade (guardada em "rolos").
  const valorItem = (p, i) => (i.preco || 0) * (tipoValido(p.tipo) === 'pedido' ? i.peso || 0 : i.rolos || 0);

  function totais(p) {
    const produtos = p.itens.reduce((s, i) => s + valorItem(p, i), 0);
    if (tipoValido(p.tipo) !== 'pedido') return { produtos, desconto: 0, total: produtos };
    const desconto = ((p.cliente.descontoPct || 0) * produtos) / 100;
    return { produtos, desconto, total: produtos - desconto + (p.freteValor || 0) + (p.outrasDespesas || 0) };
  }

  const resumo = (p) => ({
    id: p.id, tipo: tipoValido(p.tipo), origemId: p.origem ? p.origem.id : null, numero: p.numero, status: p.status, data: p.data, vendedor: p.vendedor,
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
      const { tipo, ...dados } = body;
      const t = tipoValido(tipo);
      const novo = { ...novoPedido(proximoNumero(db, t), t), ...(Object.keys(dados).length ? sanitize(dados) : {}) };
      db.pedidos.push(novo);
      gravar(db);
      return resposta(201, novo);
    }

    const idx = db.pedidos.findIndex((x) => x.id === id);
    if (idx === -1) return resposta(404, { erro: 'Pedido não encontrado' });

    if (p[2] === 'duplicar' && metodo === 'POST') {
      const copia = { ...novoPedido(proximoNumero(db, db.pedidos[idx].tipo), db.pedidos[idx].tipo), ...sanitize(db.pedidos[idx]), status: 'rascunho', aprovadoPor: '', dataAprovacao: '' };
      copia.data = hojeLocal();
      db.pedidos.push(copia);
      gravar(db);
      return resposta(201, copia);
    }
    // Orçamento aprovado → nota de serviço: cria uma nota nova com os dados copiados e guarda a origem; o orçamento continua como está.
    if (p[2] === 'gerar-servico' && metodo === 'POST') {
      const orig = db.pedidos[idx];
      if (tipoValido(orig.tipo) !== 'orcamento') return resposta(400, { erro: 'Só um orçamento pode gerar uma nota de serviço.' });
      const nova = {
        ...novoPedido(proximoNumero(db, 'servico'), 'servico'), ...sanitize(orig),
        status: 'rascunho', aprovadoPor: '', dataAprovacao: '', origem: { id: orig.id, numero: orig.numero, tipo: 'orcamento' },
      };
      nova.data = hojeLocal();
      db.pedidos.push(nova);
      gravar(db);
      return resposta(201, nova);
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
  const CHAVE_EMPRESA = 'pedidos-malhas:empresa';
  const lerEmpresa = () => { try { return JSON.parse(localStorage.getItem(CHAVE_EMPRESA)); } catch { return null; } };

  function exportar() {
    const db = ler();
    const logo = lerLogo();
    const empresa = lerEmpresa();
    return {
      app: BACKUP_APP, versao: 3, exportadoEm: new Date().toISOString(), seq: db.seq, seqOrcamento: db.seqOrcamento || 0, seqServico: db.seqServico || 0, pedidos: db.pedidos,
      ...(logo ? { logo } : {}), ...(empresa ? { empresa } : {}),
    };
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
        ...novoPedido(Number(bruto.numero) || 0, bruto.tipo), ...sanitize(bruto),
        id: String(bruto.id), numero: Number(bruto.numero) || 0,
        ...(bruto.origem && bruto.origem.id ? { origem: { id: String(bruto.origem.id), numero: Number(bruto.origem.numero) || 0, tipo: 'orcamento' } } : {}),
        criadoEm: bruto.criadoEm || new Date().toISOString(), atualizadoEm: bruto.atualizadoEm || new Date().toISOString(),
      };
      const i = db.pedidos.findIndex((x) => x.id === p.id);
      if (i === -1) { db.pedidos.push(p); novos += 1; }
      else if (p.atualizadoEm > db.pedidos[i].atualizadoEm) { db.pedidos[i] = p; atualizados += 1; }
    }
    const maior = (tipo) => Math.max(...db.pedidos.filter((x) => tipoValido(x.tipo) === tipo).map((x) => x.numero), 0);
    db.seq = Math.max(db.seq, Number(dados.seq) || 0, maior('pedido'));
    db.seqOrcamento = Math.max(db.seqOrcamento || 0, Number(dados.seqOrcamento) || 0, maior('orcamento'));
    db.seqServico = Math.max(db.seqServico || 0, Number(dados.seqServico) || 0, maior('servico'));
    gravar(db);
    // A logo do backup só é usada se o aparelho ainda não tiver uma (nunca troca a atual).
    let logo = false;
    const l = dados.logo;
    if (typeof l === 'string' && l.length <= 700000 && LOGO_VALIDA.test(l) && !lerLogo()) {
      try { localStorage.setItem(CHAVE_LOGO, l); logo = true; } catch {}
    }
    // Idem para os dados da empresa.
    const e = dados.empresa;
    if (e && typeof e === 'object' && !lerEmpresa()) {
      try { localStorage.setItem(CHAVE_EMPRESA, JSON.stringify({ cnpj: String(e.cnpj ?? '').slice(0, 60), rodape: String(e.rodape ?? '').slice(0, 300) })); } catch {}
    }
    return { novos, atualizados, logo };
  }

  window.localApi = localApi;
  window.localDb = { exportar, importar, quantidade: () => ler().pedidos.length };

  // Pede ao navegador para não apagar os dados quando faltar espaço.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
