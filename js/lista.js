// Lista / gestão de pedidos (tabela no computador, cartões no celular)
(function () {
  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataBR = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso || '');
  const rotulo = { rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', cancelado: 'Cancelado' };
  const numeroFmt = (n) => String(n).padStart(4, '0');
  const semCliente = '<span class="muted">(sem razão social)</span>';
  let pedidos = [];

  async function carregar() {
    const r = await api('/api/pedidos');
    pedidos = await r.json();
    desenhar();
  }

  function desenhar() {
    const q = document.getElementById('busca').value.trim().toLowerCase();
    const st = document.getElementById('filtroStatus').value;
    const lista = pedidos.filter((p) =>
      (!st || p.status === st) &&
      (!q || [numeroFmt(p.numero), p.cliente, p.cidade, p.uf, p.vendedor].join(' ').toLowerCase().includes(q)));

    const soma = (arr) => arr.reduce((s, p) => s + p.total, 0);
    const aprovados = pedidos.filter((p) => p.status === 'aprovado');
    document.getElementById('cards').innerHTML = `
      <div class="card"><small>Pedidos</small><strong>${pedidos.length}</strong></div>
      <div class="card"><small>Em aberto</small><strong>${pedidos.filter((p) => p.status === 'rascunho' || p.status === 'enviado').length}</strong></div>
      <div class="card"><small>Aprovados</small><strong>${aprovados.length}</strong></div>
      <div class="card"><small>Valor aprovado</small><strong>${moeda.format(soma(aprovados))}</strong></div>`;

    document.getElementById('vazio').hidden = lista.length > 0;

    document.getElementById('linhas').innerHTML = lista.map((p) => `
      <tr data-id="${p.id}">
        <td><strong>${numeroFmt(p.numero)}</strong></td>
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
      </tr>`).join('');

    document.getElementById('listaCards').innerHTML = lista.map((p) => `
      <article class="pedido-card" data-id="${p.id}">
        <div class="pc-topo">
          <span class="pc-num">Nº ${numeroFmt(p.numero)}</span>
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
      </article>`).join('');
  }

  async function aoClicar(e) {
    const el = e.target.closest('[data-id]');
    if (!el) return;
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    const p = pedidos.find((x) => x.id === el.dataset.id);
    if (acao === 'excluir') {
      if (!confirm(`Excluir o pedido Nº ${numeroFmt(p.numero)}? Esta ação não pode ser desfeita.`)) return;
      await api(`/api/pedidos/${p.id}`, { method: 'DELETE' });
      toast('Pedido excluído');
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

  document.querySelectorAll('[data-novo]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const r = await api('/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    location.href = `pedido.html?id=${(await r.json()).id}`;
  }));
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

  document.getElementById('busca').addEventListener('input', desenhar);
  document.getElementById('filtroStatus').addEventListener('change', desenhar);
  // Ao voltar para a lista (botão voltar do celular), recarrega os totais.
  window.addEventListener('pageshow', (e) => { if (e.persisted) carregar(); });

  carregar();
})();
