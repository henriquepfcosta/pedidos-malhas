// Lista / gestão de pedidos (tabela no computador, cartões no celular)
(function () {
  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataBR = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso || '');
  const rotulo = { rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', cancelado: 'Cancelado' };
  const numeroFmt = (n) => String(n).padStart(4, '0');
  const semCliente = '<span class="muted">(sem razão social)</span>';
  const tipoDe = (p) => (MODELOS[p.tipo] ? p.tipo : 'pedido');
  const rotuloTipo = (p) => MODELOS[tipoDe(p)].rotulo;
  let pedidos = [];

  async function carregar() {
    const r = await api('/api/pedidos');
    pedidos = await r.json();
    desenhar();
  }

  // Uma linha por "negócio": um orçamento e a nota de serviço gerada dele aparecem juntos, na linha da nota de
  // serviço (a etapa mais avançada). O orçamento só tem linha própria enquanto não gerou nenhuma nota.
  function linhasDaLista() {
    const porId = new Map(pedidos.map((p) => [p.id, p]));
    const comServico = new Set(pedidos.filter((p) => tipoDe(p) === 'servico' && porId.has(p.origemId)).map((p) => p.origemId));
    return pedidos
      .filter((p) => !comServico.has(p.id))
      .map((p) => ({ p, orc: tipoDe(p) === 'servico' ? porId.get(p.origemId) || null : null }));
  }

  // Etiqueta(s) do modelo: na linha unificada, "Orçamento 0005 → Nota de serviço", cada uma abrindo o seu documento.
  function etiquetas({ p, orc }) {
    if (!orc) return `<span class="tipo ${tipoDe(p)}">${rotuloTipo(p)}</span>`;
    return `<span class="tipo-par">
      <a class="tipo orcamento" data-abrir="${orc.id}" title="Abrir o orçamento">Orçamento ${numeroFmt(orc.numero)}</a>
      <span class="seta" aria-hidden="true">→</span>
      <a class="tipo servico" data-abrir="${p.id}" title="Abrir a nota de serviço">${rotuloTipo(p)}</a>
    </span>`;
  }

  function desenhar() {
    const q = document.getElementById('busca').value.trim().toLowerCase();
    const st = document.getElementById('filtroStatus').value;
    const tp = document.getElementById('filtroTipo').value;
    const lista = linhasDaLista().filter(({ p, orc }) =>
      (!st || p.status === st) && (!tp || tipoDe(p) === tp || (orc && tipoDe(orc) === tp)) &&
      (!q || [numeroFmt(p.numero), rotuloTipo(p), orc ? `${rotuloTipo(orc)} ${numeroFmt(orc.numero)}` : '', p.cliente, p.cidade, p.uf, p.vendedor].join(' ').toLowerCase().includes(q)));

    // Os totais contam cada linha uma vez (o par orçamento + nota de serviço não soma duas vezes).
    const todas = linhasDaLista().map((l) => l.p);
    const soma = (arr) => arr.reduce((s, p) => s + p.total, 0);
    const aprovados = todas.filter((p) => p.status === 'aprovado');
    document.getElementById('cards').innerHTML = `
      <div class="card"><small>Notas</small><strong>${todas.length}</strong></div>
      <div class="card"><small>Em aberto</small><strong>${todas.filter((p) => p.status === 'rascunho' || p.status === 'enviado').length}</strong></div>
      <div class="card"><small>Aprovados</small><strong>${aprovados.length}</strong></div>
      <div class="card"><small>Valor aprovado</small><strong>${moeda.format(soma(aprovados))}</strong></div>`;

    document.getElementById('vazio').hidden = lista.length > 0;

    document.getElementById('linhas').innerHTML = lista.map((l) => { const p = l.p; return `
      <tr data-id="${p.id}">
        <td><strong>${numeroFmt(p.numero)}</strong></td>
        <td>${etiquetas(l)}</td>
        <td>${esc(dataBR(p.data))}</td>
        <td>${esc(p.cliente) || semCliente}</td>
        <td>${esc([p.cidade, p.uf].filter(Boolean).join(' / '))}</td>
        <td>${esc(p.vendedor)}</td>
        <td><span class="status ${p.status}">${rotulo[p.status] || p.status}</span></td>
        <td class="num">${moeda.format(p.total)}</td>
        <td class="num">
          <button class="btn claro pequeno" data-acao="duplicar">Duplicar</button>
          <button class="btn claro pequeno perigo" data-acao="excluir">Excluir</button>
        </td>
      </tr>`; }).join('');

    document.getElementById('listaCards').innerHTML = lista.map((l) => { const p = l.p; return `
      <article class="pedido-card" data-id="${p.id}">
        <div class="pc-topo">
          ${l.orc ? `<span class="pc-num">${etiquetas(l)} Nº ${numeroFmt(p.numero)}</span>` : `<span class="pc-num">${rotuloTipo(p)} Nº ${numeroFmt(p.numero)}</span>`}
          <span class="status ${p.status}">${rotulo[p.status] || p.status}</span>
        </div>
        <div class="pc-cliente">${esc(p.cliente) || semCliente}</div>
        <div class="pc-info">${esc([dataBR(p.data), [p.cidade, p.uf].filter(Boolean).join('/'), p.vendedor].filter(Boolean).join(' · '))}</div>
        <div class="pc-rodape">
          <strong class="pc-total">${moeda.format(p.total)}</strong>
          <span>
            <button class="link-acao" data-acao="duplicar">Duplicar</button>
            <button class="link-acao perigo" data-acao="excluir">Excluir</button>
          </span>
        </div>
      </article>`; }).join('');
  }

  async function aoClicar(e) {
    const el = e.target.closest('[data-id]');
    if (!el) return;
    const chip = e.target.closest('[data-abrir]');
    if (chip) { // etiqueta do orçamento / da nota de serviço
      e.preventDefault();
      location.href = `pedido.html?id=${chip.dataset.abrir}`;
      return;
    }
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    const p = pedidos.find((x) => x.id === el.dataset.id);
    if (acao === 'excluir') {
      if (!confirm(`Excluir ${rotuloTipo(p).toLowerCase()} Nº ${numeroFmt(p.numero)}? Esta ação não pode ser desfeita.`)) return;
      await api(`/api/pedidos/${p.id}`, { method: 'DELETE' });
      toast('Nota excluída');
      return carregar();
    }
    if (acao === 'duplicar') {
      const r = await api(`/api/pedidos/${p.id}/duplicar`, { method: 'POST' });
      location.href = `pedido.html?id=${(await r.json()).id}`;
      return;
    }
    location.href = `pedido.html?id=${p.id}`;
  }

  document.getElementById('linhas').addEventListener('click', aoClicar);
  document.getElementById('listaCards').addEventListener('click', aoClicar);

  // ---------- Nova nota: escolha do modelo ----------
  const sheetModelo = document.getElementById('sheetModelo');
  document.getElementById('modeloLista').innerHTML = Object.entries(MODELOS).map(([tipo, m]) => `
    <button type="button" class="modelo-opcao" data-modelo="${tipo}">
      <span class="modelo-ico ${tipo}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg></span>
      <span class="modelo-txt"><strong>${esc(m.nome)}</strong><small>${esc(m.descricao)}</small></span>
    </button>`).join('');
  document.getElementById('filtroTipo').insertAdjacentHTML('beforeend',
    Object.entries(MODELOS).map(([tipo, m]) => `<option value="${tipo}">${esc(m.rotulo)}</option>`).join(''));

  document.querySelectorAll('[data-novo]').forEach((b) => b.addEventListener('click', () => sheetModelo.showModal()));
  sheetModelo.addEventListener('click', async (e) => {
    if (e.target === sheetModelo || e.target.closest('[data-fechar-modelo]')) return sheetModelo.close();
    const op = e.target.closest('[data-modelo]');
    if (!op) return;
    sheetModelo.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try {
      const r = await api('/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: op.dataset.modelo }) });
      const nova = await r.json();
      // Servidor iniciado antes de um modelo existir não o reconhece e cria um pedido comum: desfaz e avisa.
      if (!r.ok || (nova.tipo || 'pedido') !== op.dataset.modelo) {
        if (r.ok && nova.id) await api(`/api/pedidos/${nova.id}`, { method: 'DELETE' });
        throw new Error('desatualizado');
      }
      location.href = `pedido.html?id=${nova.id}`;
    } catch (e) {
      sheetModelo.querySelectorAll('button').forEach((x) => { x.disabled = false; });
      if (e.message === 'desatualizado') alert('O servidor está desatualizado e não criou a nota certa. Pare-o (Ctrl+C no terminal), inicie de novo com "node server.js" e tente outra vez.');
      else toast('Não foi possível criar a nota');
    }
  });
  // Voltar para a lista pelo botão do navegador não deve deixar o modal travado.
  window.addEventListener('pageshow', () => { if (sheetModelo.open) sheetModelo.close(); sheetModelo.querySelectorAll('button').forEach((x) => { x.disabled = false; }); });
  document.getElementById('sair').addEventListener('click', () => { if (confirm('Sair do sistema?')) sair(); });

  // ---------- Menus ----------
  document.querySelectorAll('.menu > [data-abrir-menu]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    b.parentElement.classList.toggle('aberto');
  }));
  document.addEventListener('click', () => document.querySelectorAll('.menu.aberto').forEach((m) => m.classList.remove('aberto')));
  document.querySelectorAll('[data-fechar-aviso]').forEach((b) => b.addEventListener('click', () => {
    document.getElementById(b.dataset.fecharAviso).hidden = true;
    try { localStorage.setItem(`pedidos-malhas:${b.dataset.fecharAviso}`, '1'); } catch {}
  }));

  // ---------- Backup (versão offline: os pedidos ficam só no aparelho) ----------
  const CHAVE_BACKUP = 'pedidos-malhas:ultimoBackup';
  const lerLocal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

  function avisos() {
    if (window.MODO !== 'offline') return;
    document.getElementById('avisoInstalar').hidden = !precisaInstalarIos() || Boolean(lerLocal('pedidos-malhas:avisoInstalar'));
    const qtd = localDb.quantidade();
    const ultimo = lerLocal(CHAVE_BACKUP);
    const dias = ultimo ? Math.floor((Date.now() - new Date(ultimo)) / 864e5) : null;
    document.getElementById('avisoBackup').hidden = !qtd || (dias != null && dias < 7);
    document.getElementById('avisoBackupTexto').textContent = dias == null
      ? 'Os pedidos ficam só neste aparelho. Salve uma cópia no iCloud Drive ou envie para você mesmo.'
      : `Último backup há ${dias} dias. Os pedidos ficam só neste aparelho.`;
  }

  async function exportarBackup() {
    const dados = localDb.exportar();
    const d = new Date();
    const hoje = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const r = await compartilharArquivo(blob, `backup-pedidos-${hoje}.json`, 'Backup dos pedidos');
    if (r === 'cancelado') return;
    try { localStorage.setItem(CHAVE_BACKUP, new Date().toISOString()); } catch {}
    toast(r === 'baixado' ? `Backup salvo (${dados.pedidos.length} pedidos)` : `Backup de ${dados.pedidos.length} pedidos enviado`);
    avisos();
  }

  const arquivo = document.getElementById('arquivoBackup');
  arquivo.addEventListener('change', async () => {
    const f = arquivo.files[0];
    arquivo.value = '';
    if (!f) return;
    try {
      const dados = JSON.parse(await f.text());
      const n = Array.isArray(dados.pedidos) ? dados.pedidos.length : 0;
      if (!confirm(`Importar ${n} pedido(s) deste backup?\n\nPedidos que já existem neste aparelho só são substituídos se a versão do backup for mais recente. Nada é apagado.`)) return;
      const { novos, atualizados, logo } = localDb.importar(dados);
      toast(`${novos} novo(s), ${atualizados} atualizado(s)${logo ? ', logo restaurada' : ''}`);
      carregar();
      avisos();
    } catch (e) {
      alert(e.message.includes('backup') ? e.message : 'Não foi possível ler o arquivo. Escolha um backup .json exportado pelo app.');
    }
  });

  document.querySelectorAll('[data-backup]').forEach((b) => b.addEventListener('click', () => {
    const acao = b.dataset.backup;
    if (acao === 'exportar') exportarBackup();
    else if (acao === 'importar') arquivo.click();
    else alert('Para instalar no iPhone:\n\n1. Abra este endereço no Safari.\n2. Toque em Compartilhar (quadrado com a seta para cima).\n3. Escolha "Adicionar à Tela de Início".\n\nDepois de instalado, o app funciona sem internet. Os pedidos ficam guardados só neste aparelho — use "Exportar backup" com frequência.');
  }));
  avisos();

  // ---------- Configurações: logo da empresa ----------
  const cfg = document.getElementById('sheetConfig');
  const logoImg = document.getElementById('logoImg');
  const logoVazio = document.getElementById('logoVazio');
  const logoErro = document.getElementById('logoErro');
  const logoArquivo = document.getElementById('logoArquivo');
  const $ = (id) => document.getElementById(id);
  let logoSalva = null; // a que está valendo
  let logoNova = null;  // escolhida, aguardando confirmação

  function mostrarLogo(src) {
    logoImg.hidden = !src;
    logoVazio.hidden = Boolean(src);
    if (src) logoImg.src = src;
  }

  function modoConfig(confirmando) {
    $('logoAcoes').hidden = confirmando;
    $('logoConfirma').hidden = !confirmando;
    $('logoEscolher').textContent = logoSalva ? 'Trocar logo' : 'Incluir logo';
    $('logoRemover').hidden = !logoSalva;
    mostrarLogo(confirmando ? logoNova : logoSalva);
  }

  function erroLogo(msg) {
    logoErro.textContent = msg || '';
    logoErro.hidden = !msg;
  }

  document.querySelectorAll('[data-config]').forEach((b) => b.addEventListener('click', async () => {
    logoSalva = await logoStore.carregar();
    const emp = await empresaStore.carregar();
    $('empCnpj').value = emp.cnpj;
    $('empRodape').value = emp.rodape;
    logoNova = null;
    erroLogo('');
    modoConfig(false);
    cfg.showModal();
  }));
  cfg.addEventListener('click', (e) => { if (e.target === cfg || e.target.closest('[data-fechar-config]')) cfg.close(); });

  const escolherArquivo = () => logoArquivo.click();
  $('logoEscolher').addEventListener('click', escolherArquivo);
  $('logoOutra').addEventListener('click', escolherArquivo);
  logoArquivo.addEventListener('change', async () => {
    const f = logoArquivo.files[0];
    logoArquivo.value = '';
    if (!f) return;
    erroLogo('');
    try {
      logoNova = await logoStore.preparar(f);
      modoConfig(true);
    } catch (e) {
      erroLogo(e.message);
    }
  });
  $('logoCancelar').addEventListener('click', () => { logoNova = null; erroLogo(''); modoConfig(false); });
  $('logoUsar').addEventListener('click', async () => {
    try {
      await logoStore.salvar(logoNova);
      logoSalva = logoNova;
      logoNova = null;
      erroLogo('');
      modoConfig(false);
      toast('Logo salva');
    } catch (e) {
      erroLogo(e.message);
    }
  });
  $('logoRemover').addEventListener('click', async () => {
    if (!confirm('Remover a logo? Os pedidos passam a sair sem logo.')) return;
    try {
      await logoStore.remover();
      logoSalva = null;
      erroLogo('');
      modoConfig(false);
      toast('Logo removida');
    } catch (e) {
      erroLogo(e.message);
    }
  });

  $('empSalvar').addEventListener('click', async () => {
    try {
      await empresaStore.salvar({ cnpj: $('empCnpj').value, rodape: $('empRodape').value });
      toast('Dados da empresa salvos');
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('busca').addEventListener('input', desenhar);
  document.getElementById('filtroTipo').addEventListener('change', desenhar);
  document.getElementById('filtroStatus').addEventListener('change', desenhar);
  // Ao voltar para a lista (botão voltar do celular), recarrega os totais.
  window.addEventListener('pageshow', (e) => { if (e.persisted) carregar(); });

  carregar();
})();
