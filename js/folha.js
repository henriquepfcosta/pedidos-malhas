// Tela do pedido. Duas visões dos mesmos dados:
//  - #folha: réplica de TABELA MALHA.xlsx (Planilha1, A1:K43), usada no computador e na impressão;
//  - #app-form: formulário em cartões, usado no celular.
// Os campos das duas visões têm os mesmos atributos (data-campo / data-item + data-k) e ficam sincronizados.
(function () {
  const LINHAS_PADRAO = 18; // linhas 17 a 34 da planilha: tamanho inicial da tabela (cada pedido guarda o seu)
  // Larguras das colunas A..K (unidades do Excel); B e C usam a largura padrão 8,43.
  // Os campos de preenchimento do cabeçalho (D+E e I+J+K) têm exatamente a mesma largura.
  const LARGURAS = [13, 14, 13, 36.43, 15, 8, 10, 11.7, 10.29, 12.57, 28.57];
  // Com a coluna de comissão (entre PESO e PREÇO): as demais colunas encolhem na mesma proporção.
  const LARGURAS_COM = [13, 14, 13, 36.43, 15, 8, 10, 11.7, 14, 10.29, 12.57, 28.57];

  const params = new URLSearchParams(location.search);
  const token = params.get('t');
  const somenteLeitura = Boolean(token);
  const id = params.get('id');

  let pedido = null;
  let timerSalvar = null;
  let pendente = false;
  let salvando = Promise.resolve();
  let logoAtual = null; // logo escolhida em Configurações (data URL), ou null

  // ---------- Formatação pt-BR ----------
  const nf = (min, max) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
  const fmtMoeda = (v) => (Math.abs(v) < 0.005 ? '-' : nf(2, 2).format(v)); // formato contábil: zero vira "-"
  const fmtNum = (v) => (v ? nf(0, 3).format(v) : '');
  const fmtPreco = (v) => (v ? nf(2, 2).format(v) : '');
  const fmtValor = (v, tipo) => (tipo === 'num' ? fmtNum(v) : tipo === 'preco' ? fmtPreco(v) : v ?? '');
  function parseNum(s) {
    s = String(s ?? '').replace(/[R$\s]/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numeroFmt = (n) => String(n).padStart(4, '0');
  const dataBR = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso || '');
  // forcarLeitura: usado só enquanto se monta a planilha da prévia (campos não editáveis).
  let forcarLeitura = false;
  const leitura = () => somenteLeitura || forcarLeitura;
  const ro = () => (leitura() ? ' readonly tabindex="-1"' : '');
  const itemVazio = () => ({ malha: '', cor: '', rolos: 0, peso: 0, preco: 0, comissao: 0 });
  const itemPreenchido = (i) => i && (i.malha || i.cor || i.rolos || i.peso || i.preco);

  // ---------- Acesso a campos por caminho ("cliente.cidade") ----------
  const getPath = (obj, p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  function setPath(obj, p, v) {
    const ks = p.split('.');
    const last = ks.pop();
    ks.reduce((o, k) => (o[k] ??= {}), obj)[last] = v;
  }

  // Campo do pedido. tipo: texto | num | preco | data
  function campo(caminho, tipo = 'texto', extra = '') {
    const valor = fmtValor(getPath(pedido, caminho), tipo);
    const t = tipo === 'data' ? 'date' : 'text';
    const im = tipo === 'num' || tipo === 'preco' ? ' inputmode="decimal"' : '';
    const vazio = tipo === 'data' && !valor ? ' data-vazio' : '';
    return `<input type="${t}" data-campo="${caminho}" data-tipo="${tipo}" value="${esc(valor)}"${im}${vazio} enterkeyhint="next" ${extra}${ro()}>`;
  }

  // Campo de um item (linha da tabela / cartão).
  function campoItem(i, k, tipo, extra = '') {
    const it = pedido.itens[i] || {};
    const im = tipo !== 'texto' ? ' inputmode="decimal"' : '';
    return `<input data-item="${i}" data-k="${k}" data-tipo="${tipo}" value="${esc(fmtValor(it[k], tipo))}"${im} enterkeyhint="next" ${extra}${ro()}>`;
  }

  function radioFrete(op, nome, cls) {
    return `<label class="${cls}">
      <input type="radio" name="${nome}" value="${op}" data-campo="cliente.frete" ${pedido.cliente.frete === op ? 'checked' : ''} ${leitura() ? 'disabled' : ''}>
      <span>${op}</span><span class="marca" data-marca="${op}"></span></label>`;
  }

  // =====================================================================
  // Visão planilha
  // =====================================================================
  function linhaFolha(i) {
    const it = pedido.itens[i] || {};
    // O X (remover linha) fica só na ÚLTIMA linha; a primeira linha é fixa e nunca tem X.
    const ultima = Math.max(pedido.linhas, pedido.itens.length) - 1;
    const podeRemover = !leitura() && i === ultima && ultima >= 1;
    const comissao = pedido.mostrarComissao
      ? `<td class="b">${campoCom(i)}</td>` : '';
    return `<tr class="item">
      <td class="b" colspan="3">${campoItem(i, 'malha', 'texto', 'class="c"')}</td>
      <td class="b">${campoItem(i, 'cor', 'texto')}</td>
      <td class="b" colspan="2">${campoItem(i, 'rolos', 'num', 'class="c"')}</td>
      <td class="b" colspan="2">${campoItem(i, 'peso', 'num', 'class="c"')}</td>
      ${comissao}
      <td class="b" colspan="2"><div class="campo-moeda"><span>R$</span>${campoItem(i, 'preco', 'preco')}</div></td>
      <td class="b moeda total-linha">
        <div class="campo-moeda"><span>R$</span><span style="flex:1" data-total="${i}"></span></div>
        ${podeRemover ? `<button type="button" class="btn-x no-print" title="Remover esta linha" aria-label="Remover esta linha" data-remover="${i}">×</button>` : ''}
      </td>
    </tr>`;
  }

  // Comissão (%) do item: o "%" só aparece quando há valor.
  const campoCom = (i) => `<div class="campo-moeda pct-cel">${campoItem(i, 'comissao', 'num', 'class="c" placeholder=" "')}<span>%</span></div>`;

  const moedaCel = (attr) => `<div class="campo-moeda"><span>R$</span><span style="flex:1;text-align:right" ${attr}></span></div>`;

  // HTML da planilha. leitura = true gera a versão só para ver (prévia); nomeRadio evita misturar
  // os botões CIF/FOB da prévia com os da planilha editável.
  function htmlFolha(leituraForcada = false, nomeRadio = 'frete-folha') {
    forcarLeitura = leituraForcada;
    try { return montarFolha(nomeRadio); } finally { forcarLeitura = false; }
  }

  function renderFolha() {
    document.getElementById('folha').innerHTML = htmlFolha(false);
  }

  // Com a comissão ligada a grade ganha uma coluna, entre PESO (H) e PREÇO (I). As linhas abaixo são descritas
  // pelas colunas ORIGINAIS (0 = A … 10 = K) e sp(c1, c2) calcula o colspan já considerando a coluna nova:
  // uma célula que termina em H (ou passa por ela) cobre também a coluna nova, para não deixar buraco.
  function montarFolha(nomeRadio) {
    const k = pedido.mostrarComissao ? 1 : 0;
    const sp = (c1, c2) => `colspan="${(c2 >= 7 ? c2 + k : c2) - (c1 > 7 ? c1 + k : c1) + 1}"`;
    const rot = (c1, c2, texto) => `<td ${sp(c1, c2)} class="rot b">${texto}</td>`;
    const cab = (c1, c2, texto) => `<td ${sp(c1, c2)} class="cab">${texto}</td>`;
    const val = (c1, c2, html) => `<td ${sp(c1, c2)} class="b">${html}</td>`;
    const nLinhas = Math.max(pedido.linhas, pedido.itens.length);
    const larg = k ? LARGURAS_COM : LARGURAS;
    const soma = larg.reduce((a, b) => a + b, 0);
    const cols = larg.map((w) => `<col style="width:${((w / soma) * 100).toFixed(3)}%">`).join('');
    const logo = logoAtual ? `<img src="${logoAtual}" alt="Logo">` : '<span class="sem-logo no-print">Logo</span>';
    const frete = `<div class="frete-par">${radioFrete('CIF', nomeRadio, 'frete-opcao')}${radioFrete('FOB', nomeRadio, 'frete-opcao')}</div>`;

    return `
    <table class="planilha">
      <colgroup>${cols}</colgroup>
      <tr><td ${sp(0, 10)} class="faixa">PEDIDO Nº ${numeroFmt(pedido.numero)}</td></tr>
      <tr><td ${sp(0, 10)} class="lat"></td></tr>
      <tr>
        <td ${sp(0, 1)} rowspan="3" class="logo">${logo}</td>
        ${cab(2, 2, 'Data')}${val(3, 4, campo('data', 'data', 'class="c"'))}
        ${cab(5, 7, 'Vendedor')}${val(8, 10, campo('vendedor', 'texto', 'class="c"'))}
      </tr>
      <tr>
        ${cab(2, 2, 'Contato')}${val(3, 4, campo('contato', 'texto', 'class="c"'))}
        ${cab(5, 7, 'Forma de pagamento')}${val(8, 10, campo('cliente.formaPagamento', 'texto', 'class="c"'))}
      </tr>
      <tr>
        ${cab(2, 2, 'Frete')}${val(3, 4, frete)}
        ${cab(5, 7, 'Desconto')}${val(8, 10, `<div class="campo-moeda pct-fixo">${campo('cliente.descontoPct', 'num', 'class="c"')}<span>%</span></div>`)}
      </tr>
      <tr><td ${sp(0, 10)} class="lat"></td></tr>
      <tr>${cab(0, 10, 'Cliente')}</tr>
      <tr>
        ${rot(0, 1, 'Razão Social:')}${val(2, 3, campo('cliente.razaoSocial'))}
        ${rot(4, 4, 'CNPJ:')}${val(5, 7, campo('cliente.cnpj', 'texto', 'class="c"'))}
        ${rot(8, 9, 'Insc. Estadual:')}${val(10, 10, campo('cliente.inscEstadual', 'texto', 'class="c"'))}
      </tr>
      <tr>
        ${rot(0, 1, 'Endereço:')}${val(2, 6, campo('cliente.endereco'))}
        ${rot(7, 7, 'Nº:')}${val(8, 8, campo('cliente.numero', 'texto', 'class="c"'))}
        ${rot(9, 9, 'Bairro:')}${val(10, 10, campo('cliente.bairro'))}
      </tr>
      <tr>
        ${rot(0, 1, 'Cidade:')}${val(2, 3, campo('cliente.cidade', 'texto', 'class="c"'))}
        ${rot(4, 4, 'UF:')}${val(5, 5, campo('cliente.uf', 'texto', 'class="c" maxlength="2" style="text-transform:uppercase"'))}
        ${rot(6, 6, 'Fone:')}${val(7, 8, campo('cliente.fone', 'texto', 'class="c" inputmode="tel"'))}
        ${rot(9, 9, 'E-mail:')}${val(10, 10, campo('cliente.email', 'texto', 'inputmode="email"'))}
      </tr>
      <tr><td ${sp(0, 10)} style="height:12px"></td></tr>
      <tr>
        <td colspan="3" class="cab">MALHA / CÓDIGO</td><td class="cab">COR / CÓDIGO</td>
        <td colspan="2" class="cab">ROLOS (APROX 20KG)</td><td colspan="2" class="cab">PESO</td>${k ? '<td class="cab">COMISSÃO (%)</td>' : ''}
        <td colspan="2" class="cab">PREÇO</td><td class="cab">TOTAL</td>
      </tr>
      <tbody>${Array.from({ length: nLinhas }, (_, i) => linhaFolha(i)).join('')}</tbody>
      ${leitura() ? '' : `<tr class="no-print"><td ${sp(0, 10)} style="padding:6px 0"><button type="button" class="btn claro pequeno" data-add-linha>+ Adicionar linha</button></td></tr>`}
      <tr>
        ${cab(0, 7, 'Dados Adicionais')}
        <td colspan="2" class="rot" style="text-align:left">Valor Total Produtos</td>
        <td class="b moeda forte">${moedaCel('data-t="produtos"')}</td>
      </tr>
      <tr>
        <td ${sp(0, 7)} rowspan="5" class="b" style="vertical-align:top;padding:0">
          <textarea data-campo="dadosAdicionais"${ro()}>${esc(pedido.dadosAdicionais)}</textarea>
        </td>
        <td colspan="2" class="rot">Desconto (<span data-t="pct"></span>%)</td>
        <td class="b moeda">${moedaCel('data-t="desconto"')}</td>
      </tr>
      <tr><td colspan="2" class="rot">Frete</td><td class="b moeda"><div class="campo-moeda"><span>R$</span>${campo('freteValor', 'preco', 'class="r" placeholder="-"')}</div></td></tr>
      <tr><td colspan="2" class="rot">Outras Despesas</td><td class="b moeda"><div class="campo-moeda"><span>R$</span>${campo('outrasDespesas', 'preco', 'class="r" placeholder="-"')}</div></td></tr>
      <tr><td colspan="3" style="height:10px"></td></tr>
      <tr><td colspan="2" class="totalgeral">Valor Total Pedido</td><td class="moeda forte" style="border-bottom:2px solid #000">${moedaCel('data-t="total"')}</td></tr>
      <tr><td ${sp(0, 10)} style="height:16px"></td></tr>
      <tr><td colspan="2"></td>${cab(2, 3, 'Aprovado por')}<td ${sp(4, 7)}></td><td colspan="3" class="cab">Data</td></tr>
      <tr>
        <td colspan="2"></td>${val(2, 3, campo('aprovadoPor', 'texto', 'class="c"'))}
        <td ${sp(4, 7)}></td><td colspan="3" class="b">${campo('dataAprovacao', 'data', 'class="c"')}</td>
      </tr>
    </table>`;
  }

  // =====================================================================
  // Visão celular (formulário em cartões)
  // =====================================================================
  const fld = (rotulo, html, cls = '') => `<label class="fld ${cls}"><span>${rotulo}</span>${html}</label>`;

  // Resumo do item: "preto · 1 rolo · 19 kg × R$ 28,50/kg"
  function detalheItem(it) {
    const partes = [];
    if (it.cor) partes.push(esc(it.cor));
    if (it.rolos) partes.push(`${fmtNum(it.rolos)} ${it.rolos === 1 ? 'rolo' : 'rolos'}`);
    if (it.peso || it.preco) partes.push(`${fmtNum(it.peso) || '0'} kg × R$ ${fmtPreco(it.preco) || '0,00'}`);
    if (pedido.mostrarComissao && it.comissao) partes.push(`${fmtNum(it.comissao)}% comissão`);
    return partes.join(' · ');
  }

  // Linha compacta da lista de itens; tocar abre o modal de edição.
  function linhaItemApp(i) {
    const it = pedido.itens[i];
    const tag = somenteLeitura ? 'div' : 'button type="button"';
    return `<${tag} class="item-linha" data-editar-item="${i}">
      <span class="il-info">
        <strong>${esc(it.malha) || '<span class="muted">(sem nome)</span>'}</strong>
        <small>${detalheItem(it)}</small>
      </span>
      <span class="il-total">R$ <span data-total="${i}"></span></span>
      ${somenteLeitura ? '' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>'}
    </${somenteLeitura ? 'div' : 'button'}>`;
  }

  function renderApp() {
    const indices = pedido.itens.map((_, i) => i).filter((i) => itemPreenchido(pedido.itens[i]));
    const preenchidos = indices.length;

    document.getElementById('app-form').innerHTML = `
      <section class="secao">
        <h2>Pedido</h2>
        <div class="grade2">${fld('Data', campo('data', 'data'))}${fld('Vendedor', campo('vendedor'))}</div>
        ${fld('Contato', campo('contato', 'texto', 'inputmode="tel"'))}
      </section>

      <section class="secao">
        <h2>Cliente</h2>
        ${fld('Razão social', campo('cliente.razaoSocial'))}
        <div class="grade2">${fld('CNPJ', campo('cliente.cnpj', 'texto', 'inputmode="numeric"'))}${fld('Insc. estadual', campo('cliente.inscEstadual'))}</div>
        <div class="grade-fim">${fld('Endereço', campo('cliente.endereco'))}${fld('Nº', campo('cliente.numero'))}</div>
        ${fld('Bairro', campo('cliente.bairro'))}
        <div class="grade-fim">${fld('Cidade', campo('cliente.cidade'))}${fld('UF', campo('cliente.uf', 'texto', 'maxlength="2" autocapitalize="characters" style="text-transform:uppercase"'))}</div>
        ${fld('Fone', campo('cliente.fone', 'texto', 'inputmode="tel"'))}
        ${fld('E-mail', campo('cliente.email', 'texto', 'inputmode="email" autocapitalize="none"'))}
      </section>

      <section class="secao">
        <h2>Condições</h2>
        <div class="fld"><span>Frete</span><div class="segmentado">${radioFrete('CIF', 'frete-app', 'seg')}${radioFrete('FOB', 'frete-app', 'seg')}</div></div>
        <div class="grade-fim">${fld('Forma de pagamento', campo('cliente.formaPagamento'))}${fld('Desconto %', campo('cliente.descontoPct', 'num'))}</div>
      </section>

      <section class="secao">
        <h2>Itens <span class="contador">${preenchidos}</span>${somenteLeitura ? '' : `<label class="chave chave-mini"><input type="checkbox" data-comissao${pedido.mostrarComissao ? ' checked' : ''}><span class="trilho"></span><span>Comissão</span></label>`}</h2>
        <div class="itens-lista">${indices.map(linhaItemApp).join('') || '<p class="itens-vazio">Nenhum item incluído ainda.</p>'}</div>
        ${somenteLeitura ? '' : '<button type="button" class="btn-add" data-add-item>+ Incluir item</button>'}
      </section>

      <section class="secao">
        <h2>Totais</h2>
        <div class="linha-total"><span>Valor total produtos</span><span>R$ <span data-t="produtos"></span></span></div>
        <div class="linha-total"><span>Desconto (<span data-t="pct"></span>%)</span><span>− R$ <span data-t="desconto"></span></span></div>
        <div class="grade2">${fld('Frete (R$)', campo('freteValor', 'preco', 'placeholder="0,00"'))}${fld('Outras despesas (R$)', campo('outrasDespesas', 'preco', 'placeholder="0,00"'))}</div>
        <div class="linha-total grande"><span>Valor total do pedido</span><strong>R$ <span data-t="total"></span></strong></div>
      </section>

      <section class="secao">
        <h2>Dados adicionais</h2>
        <textarea data-campo="dadosAdicionais" rows="4" placeholder="Observações, prazo de entrega…"${ro()}>${esc(pedido.dadosAdicionais)}</textarea>
      </section>

      <section class="secao">
        <h2>Aprovação</h2>
        <div class="grade2">${fld('Aprovado por', campo('aprovadoPor'))}${fld('Data', campo('dataAprovacao', 'data'))}</div>
      </section>`;
  }

  function renderTudo() {
    renderFolha();
    renderApp();
    recalcular();
  }

  // ---------- Fórmulas (mesmas da planilha) ----------
  // K17:K34 = I*G | K35 = SOMA(K17:K34) | K36 = (F14*K35)/100 | K40 = K35-K36+K37+K38
  function recalcular() {
    let produtos = 0;
    pedido.itens.forEach((it) => { produtos += (it.preco || 0) * (it.peso || 0); });
    document.querySelectorAll('[data-total]').forEach((el) => {
      const it = pedido.itens[+el.dataset.total] || {};
      el.textContent = fmtMoeda((it.preco || 0) * (it.peso || 0));
    });
    const desconto = ((pedido.cliente.descontoPct || 0) * produtos) / 100;
    const total = produtos - desconto + (pedido.freteValor || 0) + (pedido.outrasDespesas || 0);
    const set = (k, v) => document.querySelectorAll(`[data-t="${k}"]`).forEach((el) => (el.textContent = v));
    set('produtos', fmtMoeda(produtos));
    set('desconto', fmtMoeda(desconto));
    set('total', fmtMoeda(total));
    set('pct', fmtNum(pedido.cliente.descontoPct) || '0');
    document.querySelectorAll('[data-marca]').forEach((m) => {
      m.textContent = pedido.cliente.frete === m.dataset.marca ? '( X )' : '(   )';
    });
    const cont = document.querySelector('#app-form .contador');
    if (cont) cont.textContent = pedido.itens.filter(itemPreenchido).length;
    pedido._total = total;
  }

  // Copia o valor de um campo para o campo equivalente da outra visão.
  function sincronizar(el) {
    const sel = el.dataset.campo
      ? `[data-campo="${el.dataset.campo}"]`
      : `[data-item="${el.dataset.item}"][data-k="${el.dataset.k}"]`;
    document.querySelectorAll(sel).forEach((o) => {
      if (o === el) return;
      if (o.type === 'radio') o.checked = o.value === el.value;
      else {
        o.value = el.value;
        if (o.dataset.tipo === 'data') o.toggleAttribute('data-vazio', !o.value);
      }
    });
  }

  // ---------- Peso automático: cada rolo tem cerca de 20 kg ----------
  const KG_POR_ROLO = 20;
  const pesoDosRolos = (rolos) => (rolos > 0 ? Math.round(rolos * KG_POR_ROLO * 1000) / 1000 : 0);
  // Atualiza o texto de um campo de item nas telas (a planilha e, se existir, o formulário).
  function definirCampoItem(i, k, texto) {
    document.querySelectorAll(`[data-item="${i}"][data-k="${k}"]`).forEach((o) => { o.value = texto; });
  }

  // ---------- Edição ----------
  function aoEditar(e) {
    const el = e.target;
    if (el.type === 'radio' && !el.checked) return;
    const tipo = el.dataset.tipo;
    let valor = tipo === 'num' || tipo === 'preco' ? parseNum(el.value) : el.value;
    if (el.dataset.campo === 'cliente.uf') valor = String(valor).toUpperCase();
    const qtdAntes = pedido.itens.length;
    if (tipo === 'data') el.toggleAttribute('data-vazio', !el.value);
    if (el.dataset.campo) {
      setPath(pedido, el.dataset.campo, valor);
    } else if (el.dataset.item != null) {
      const i = +el.dataset.item;
      while (pedido.itens.length <= i) pedido.itens.push(itemVazio());
      const it = pedido.itens[i];
      if (el.dataset.k === 'rolos') {
        // Peso automático: rolos × 20 kg, enquanto o peso estiver vazio ou for o calculado (não digitado à mão).
        const pesoAutomatico = !it.peso || Math.abs(it.peso - (it.rolos || 0) * 20) < 0.0005;
        it.rolos = valor;
        if (pesoAutomatico) { it.peso = pesoDosRolos(valor); definirCampoItem(i, 'peso', fmtNum(it.peso)); }
      } else {
        it[el.dataset.k] = valor;
      }
    } else return;
    sincronizar(el);
    // A planilha pode criar itens em linhas vazias: atualiza os cartões (que estão ocultos nesse caso).
    if (pedido.itens.length !== qtdAntes && el.closest('#folha')) renderApp();
    recalcular();
    agendarSalvar();
  }

  function aoSair(e) {
    const el = e.target;
    const tipo = el.dataset.tipo;
    if (tipo !== 'num' && tipo !== 'preco') return;
    el.value = tipo === 'num' ? fmtNum(parseNum(el.value)) : fmtPreco(parseNum(el.value));
    sincronizar(el);
    // Peso apagado: volta ao automático (rolos × 20 kg).
    if (el.dataset.item != null && el.dataset.k === 'peso' && !parseNum(el.value)) {
      const it = pedido.itens[+el.dataset.item];
      if (it && it.rolos > 0) {
        it.peso = pesoDosRolos(it.rolos);
        el.value = fmtNum(it.peso);
        sincronizar(el);
        recalcular();
        agendarSalvar();
      }
    }
  }

  // Enter: na planilha desce para a linha seguinte (como no Excel); no celular vai para o próximo campo.
  function aoTeclar(e) {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    const el = e.target;
    const visao = el.closest('#folha, #app-form');
    if (!visao) return;
    if (visao.id === 'folha' && el.dataset.item != null) {
      const prox = visao.querySelector(`[data-item="${+el.dataset.item + 1}"][data-k="${el.dataset.k}"]`);
      if (prox) return prox.focus(), prox.select();
    }
    const todos = [...visao.querySelectorAll('input:not([type=radio]), textarea')];
    const prox = todos[todos.indexOf(el) + 1];
    if (prox) prox.focus(); else el.blur();
  }

  function aoClicar(e) {
    const alvo = e.target.closest('[data-remover], [data-add-item], [data-editar-item], [data-add-linha]');
    if (!alvo) return;
    if (alvo.hasAttribute('data-add-linha')) {
      pedido.linhas = Math.min(200, Math.max(pedido.linhas, pedido.itens.length) + 1);
      renderFolha();
      recalcular();
      agendarSalvar();
      document.querySelector(`#folha [data-item="${pedido.linhas - 1}"][data-k="malha"]`)?.focus();
    } else if (alvo.hasAttribute('data-add-item')) {
      modalItem.abrir(null);
    } else if (alvo.hasAttribute('data-editar-item')) {
      modalItem.abrir(+alvo.dataset.editarItem);
    } else {
      // Remove a última linha: apaga o item dela (se houver) e a linha some da tabela.
      // A linha anterior passa a ser a última, e ganha o X. A primeira linha nunca é removida.
      const i = +alvo.dataset.remover;
      const total = Math.max(pedido.linhas, pedido.itens.length);
      if (i !== total - 1 || total <= 1) return;
      if (itemPreenchido(pedido.itens[i]) && !confirm('Remover esta linha e os dados dela?')) return;
      if (i < pedido.itens.length) pedido.itens.splice(i, 1);
      pedido.linhas = Math.max(1, total - 1);
      renderTudo();
      agendarSalvar();
    }
  }

  // =====================================================================
  // Modal de item (celular): incluir / editar / excluir
  // =====================================================================
  const modalItem = (() => {
    let dlg = null;
    let indice = null; // null = incluindo um item novo

    function criar() {
      dlg = document.createElement('dialog');
      dlg.className = 'sheet';
      dlg.innerHTML = `
        <form method="dialog" class="sheet-corpo" novalidate>
          <div class="sheet-alca" aria-hidden="true"></div>
          <div class="sheet-topo">
            <h3 data-m="titulo">Incluir item</h3>
            <button type="button" class="sheet-fechar" data-m="fechar" aria-label="Fechar">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <label class="fld"><span>Malha / Código *</span>
            <input name="malha" list="sug-malha" autocomplete="off" enterkeyhint="next" placeholder="Ex.: microfibra poliéster / MF-120"></label>
          <label class="fld"><span>Cor / Código</span>
            <input name="cor" list="sug-cor" autocomplete="off" enterkeyhint="next" placeholder="Ex.: preto"></label>
          <div class="grade3">
            <label class="fld"><span>Rolos</span><input name="rolos" inputmode="decimal" enterkeyhint="next"></label>
            <label class="fld"><span>Peso (kg)</span><input name="peso" inputmode="decimal" enterkeyhint="next"></label>
            <label class="fld"><span>Preço/kg</span><input name="preco" inputmode="decimal" enterkeyhint="done" placeholder="0,00"></label>
          </div>
          <label class="fld fld-metade" data-m="comissaoCampo" hidden><span>Comissão (%)</span>
            <input name="comissao" inputmode="decimal" enterkeyhint="done" placeholder="Ex.: 5"></label>
          <p class="sheet-dica">O peso já vem como rolos × 20 kg. Se o peso real for diferente, é só editar.</p>
          <p class="sheet-erro" data-m="erro" hidden></p>
          <p class="sheet-ok" data-m="ok" hidden></p>
          <div class="sheet-total"><span>Total do item</span><strong>R$ <span data-m="total">-</span></strong></div>
          <div class="sheet-acoes">
            <button type="button" class="btn-sec perigo" data-m="excluir">Excluir</button>
            <button type="button" class="btn-sec" data-m="outro">Salvar e incluir outro</button>
            <button type="submit" class="btn-pri" data-m="salvar">Incluir</button>
          </div>
        </form>
        <datalist id="sug-malha"></datalist>
        <datalist id="sug-cor"></datalist>`;
      document.body.appendChild(dlg);

      const f = dlg.querySelector('form');
      const m = (k) => dlg.querySelector(`[data-m="${k}"]`);
      const atualizarTotal = () => {
        m('total').textContent = fmtMoeda(parseNum(f.peso.value) * parseNum(f.preco.value));
      };
      // Peso automático: rolos × 20 kg, até o usuário digitar outro peso. Apagar o peso volta ao automático.
      const pesoDosRolosTexto = () => { const r = parseNum(f.rolos.value); return r > 0 ? fmtNum(Math.round(r * 20 * 1000) / 1000) : ''; };
      f.addEventListener('input', (e) => {
        m('erro').hidden = true; m('ok').hidden = true;
        if (e.target.name === 'peso') {
          dlg._pesoManual = f.peso.value.trim() !== '';
        } else if (e.target.name === 'rolos' && !dlg._pesoManual) {
          f.peso.value = pesoDosRolosTexto();
        }
        atualizarTotal();
      });
      f.addEventListener('focusout', (e) => {
        const el = e.target;
        if (el.name === 'preco') el.value = fmtPreco(parseNum(el.value));
        if (el.name === 'rolos' || el.name === 'peso' || el.name === 'comissao') el.value = fmtNum(parseNum(el.value));
        // Peso apagado: ao sair do campo volta ao automático (rolos × 20 kg).
        if (el.name === 'peso' && !parseNum(el.value)) { dlg._pesoManual = false; el.value = pesoDosRolosTexto(); atualizarTotal(); }
      });
      // Enter avança para o próximo campo; no último, salva.
      f.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
        e.preventDefault();
        const campos = [...f.querySelectorAll('input')].filter((c) => c.offsetParent !== null);
        const prox = campos[campos.indexOf(e.target) + 1];
        if (prox) prox.focus(); else salvar(false);
      });
      f.addEventListener('submit', (e) => { e.preventDefault(); salvar(false); });
      m('outro').addEventListener('click', () => salvar(true));
      m('fechar').addEventListener('click', () => dlg.close());
      m('excluir').addEventListener('click', excluir);
      // Toque fora da janela fecha.
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener('close', () => document.body.classList.remove('modal-aberto'));
      dlg._atualizarTotal = atualizarTotal;
    }

    function sugestoes() {
      const unicos = (k) => [...new Set(pedido.itens.map((i) => (i[k] || '').trim()).filter(Boolean))];
      dlg.querySelector('#sug-malha').innerHTML = unicos('malha').map((v) => `<option value="${esc(v)}">`).join('');
      dlg.querySelector('#sug-cor').innerHTML = unicos('cor').map((v) => `<option value="${esc(v)}">`).join('');
    }

    function preencher(it) {
      const f = dlg.querySelector('form');
      f.malha.value = it.malha || '';
      f.cor.value = it.cor || '';
      f.rolos.value = fmtNum(it.rolos);
      f.peso.value = fmtNum(it.peso);
      // Peso diferente de rolos × 20 = foi digitado à mão: não é recalculado ao mudar os rolos.
      dlg._pesoManual = Boolean(it.peso) && Math.abs(it.peso - (it.rolos || 0) * 20) > 0.0005;
      f.preco.value = fmtPreco(it.preco);
      f.comissao.value = fmtNum(it.comissao);
      dlg._atualizarTotal();
    }

    function abrir(i) {
      if (!dlg) criar();
      indice = i;
      const editando = i != null;
      const m = (k) => dlg.querySelector(`[data-m="${k}"]`);
      m('titulo').textContent = editando ? 'Editar item' : 'Incluir item';
      m('salvar').textContent = editando ? 'Salvar' : 'Incluir';
      m('excluir').hidden = !editando;
      m('outro').hidden = editando;
      m('comissaoCampo').hidden = !pedido.mostrarComissao;
      m('erro').hidden = true;
      m('ok').hidden = true;
      sugestoes();
      // Item novo já vem com a malha e o preço do último item (é comum mudar só a cor).
      const ultimo = [...pedido.itens].reverse().find(itemPreenchido);
      preencher(editando ? pedido.itens[i] : { malha: ultimo?.malha, preco: ultimo?.preco, comissao: ultimo?.comissao, rolos: 1, peso: 20 });
      document.body.classList.add('modal-aberto');
      dlg.showModal();
      const f = dlg.querySelector('form');
      (editando || !f.malha.value ? f.malha : f.cor).focus();
    }

    function salvar(outro) {
      const f = dlg.querySelector('form');
      const m = (k) => dlg.querySelector(`[data-m="${k}"]`);
      const it = {
        malha: f.malha.value.trim(), cor: f.cor.value.trim(),
        rolos: parseNum(f.rolos.value), peso: parseNum(f.peso.value), preco: parseNum(f.preco.value),
        // Com a coluna desligada o valor já digitado é mantido (só fica escondido).
        comissao: pedido.mostrarComissao
          ? Math.min(100, Math.max(0, parseNum(f.comissao.value)))
          : (indice != null ? pedido.itens[indice].comissao || 0 : 0),
      };
      if (!it.malha) {
        m('erro').textContent = 'Informe a malha / código.';
        m('erro').hidden = false;
        return f.malha.focus();
      }
      if (indice != null) {
        pedido.itens[indice] = it;
      } else {
        // Descarta linhas vazias do fim antes de incluir.
        while (pedido.itens.length && !itemPreenchido(pedido.itens[pedido.itens.length - 1])) pedido.itens.pop();
        pedido.itens.push(it);
      }
      renderTudo();
      agendarSalvar();
      if (outro) {
        // Mantém malha e preço; limpa cor, rolos e peso para o próximo.
        sugestoes();
        preencher({ malha: it.malha, preco: it.preco, comissao: it.comissao, rolos: 1, peso: 20 });
        m('ok').textContent = `✓ ${it.malha}${it.cor ? ` (${it.cor})` : ''} incluído. Informe o próximo.`;
        m('ok').hidden = false;
        f.cor.focus();
      } else {
        dlg.close();
        toast(indice != null ? 'Item atualizado' : 'Item incluído');
      }
    }

    function excluir() {
      if (indice == null || !confirm('Excluir este item do pedido?')) return;
      pedido.itens.splice(indice, 1);
      renderTudo();
      agendarSalvar();
      dlg.close();
      toast('Item excluído');
    }

    return { abrir };
  })();

  // ---------- Salvamento ----------
  function estado(txt, erro) {
    document.querySelectorAll('[data-estado]').forEach((el) => {
      el.textContent = txt;
      el.classList.toggle('erro', Boolean(erro));
    });
  }

  function agendarSalvar() {
    pendente = true;
    estado('Editando…');
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(salvar, 700);
  }

  function salvar() {
    clearTimeout(timerSalvar);
    pendente = false;
    salvando = salvando.then(async () => {
      estado('Salvando…');
      try {
        const corpo = { ...pedido, itens: pedido.itens.filter(itemPreenchido) };
        const r = await api(`/api/pedidos/${pedido.id}`, {
          method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
        });
        if (!r.ok) throw new Error((await r.json()).erro || r.statusText);
        pedido.atualizadoEm = (await r.json()).atualizadoEm;
        estado('✓ Salvo');
      } catch (err) {
        pendente = true;
        estado('Não salvo — verifique a conexão', true);
        console.error(err);
      }
    });
    return salvando;
  }

  // ---------- Compartilhar / imprimir ----------
  const linkPublico = () => `${location.origin}/ver.html?t=${pedido.shareToken}`;
  function textoResumo() {
    return `Pedido de Malhas Nº ${numeroFmt(pedido.numero)}` +
      (pedido.cliente.razaoSocial ? ` — ${pedido.cliente.razaoSocial}` : '') +
      `\nData: ${dataBR(pedido.data)}\nValor total: R$ ${nf(2, 2).format(pedido._total || 0)}`;
  }

  async function compartilhar(modo) {
    if (modo === 'pdf') {
      // Gera o PDF na hora, sem esperar o salvamento: o iPhone só abre o menu de compartilhar
      // se for logo após o toque.
      if (!somenteLeitura && pendente) salvar();
      const r = await pdfPedido.compartilhar({ ...pedido, itens: pedido.itens.filter(itemPreenchido) });
      if (r === 'baixado') toast('PDF salvo em Downloads');
      return;
    }
    if (!somenteLeitura && pendente) await salvar();
    // No modo offline não existe link público: compartilha só o resumo (o PDF vai pela opção "PDF").
    const link = window.MODO === 'offline' ? '' : somenteLeitura ? location.href : linkPublico();
    const texto = textoResumo();
    if (modo === 'nativo' && navigator.share) {
      try { await navigator.share({ title: `Pedido ${numeroFmt(pedido.numero)}`, text: texto, ...(link ? { url: link } : {}) }); } catch {}
    } else if (modo === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(link ? `${texto}\n${link}` : texto)}`, '_blank');
    } else if (modo === 'email') {
      const corpo = link ? `${texto}\n\nVisualizar / imprimir: ${link}` : texto;
      location.href = `mailto:${encodeURIComponent(pedido.cliente.email || '')}?subject=${encodeURIComponent(`Pedido de Malhas Nº ${numeroFmt(pedido.numero)}`)}&body=${encodeURIComponent(corpo)}`;
    } else {
      try { await navigator.clipboard.writeText(link); toast('Link copiado'); } catch { prompt('Copie o link:', link); }
    }
  }

  // =====================================================================
  // Comissão: liga/desliga a coluna (informativa) neste pedido
  // =====================================================================
  const definirChaves = () => document.querySelectorAll('[data-comissao]').forEach((c) => { c.checked = Boolean(pedido.mostrarComissao); });

  function alternarComissao(ligada) {
    pedido.mostrarComissao = ligada;
    renderTudo();
    definirChaves();
    if (previa.aberta()) previa.render();
    agendarSalvar();
    toast(ligada ? 'Comissão ligada' : 'Comissão desligada');
  }

  async function imprimir() {
    if (!somenteLeitura && pendente) await salvar();
    window.print();
  }

  // =====================================================================
  // Visualizar: o documento como será impresso / enviado
  // =====================================================================
  const previa = (() => {
    let dlg = null;
    const m = (k) => dlg.querySelector(`[data-p="${k}"]`);

    function criar() {
      dlg = document.createElement('dialog');
      dlg.className = 'previa';
      dlg.innerHTML = `
        <div class="previa-topo">
          <button type="button" class="previa-fechar" data-p="fechar" aria-label="Fechar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <strong>Visualizar documento</strong>
          ${somenteLeitura ? '' : '<label class="chave chave-barra"><input type="checkbox" data-comissao><span class="trilho"></span><span>Comissão</span></label>'}
        </div>
        <div class="previa-corpo" data-p="corpo"><div data-p="caixa"><div class="previa-folha" data-p="folha"></div></div></div>
        <div class="previa-rodape">
          <button type="button" class="btn-sec" data-p="imprimir">Imprimir</button>
          <button type="button" class="btn-pri" data-p="pdf">Compartilhar PDF</button>
        </div>`;
      document.body.appendChild(dlg);
      m('fechar').addEventListener('click', () => dlg.close());
      m('pdf').addEventListener('click', () => compartilhar('pdf'));
      m('imprimir').addEventListener('click', async () => { dlg.close(); await imprimir(); });
      dlg.addEventListener('close', () => document.body.classList.remove('modal-aberto'));
      window.addEventListener('resize', () => { if (dlg.open) ajustar(); });
    }

    // A página inteira cabe na largura da tela; para ler os detalhes, use o gesto de pinça (zoom).
    function ajustar() {
      const folha = m('folha');
      const caixa = m('caixa');
      const escala = Math.min(1, (m('corpo').clientWidth - 16) / folha.offsetWidth);
      folha.style.transform = `scale(${escala})`;
      caixa.style.width = `${folha.offsetWidth * escala}px`;
      caixa.style.height = `${folha.offsetHeight * escala}px`;
    }

    function render() {
      m('folha').innerHTML = htmlFolha(true, 'frete-previa');
      recalcular();
      ajustar();
    }

    function abrir() {
      if (!dlg) criar();
      document.body.classList.add('modal-aberto');
      dlg.showModal();
      definirChaves();
      render();
    }

    return { abrir, render, aberta: () => Boolean(dlg && dlg.open) };
  })();

  function ligarBarra() {
    document.querySelectorAll('.menu > [data-abrir-menu]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const m = b.parentElement;
        const abrir = !m.classList.contains('aberto');
        document.querySelectorAll('.menu.aberto').forEach((x) => x.classList.remove('aberto'));
        m.classList.toggle('aberto', abrir);
      }));
    document.addEventListener('click', () => document.querySelectorAll('.menu.aberto').forEach((m) => m.classList.remove('aberto')));
    document.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', () => compartilhar(b.dataset.share)));
    if (!navigator.share) document.querySelectorAll('[data-share="nativo"]').forEach((b) => b.remove());
    document.querySelectorAll('[data-acao="imprimir"]').forEach((b) => b.addEventListener('click', imprimir));
    document.querySelectorAll('[data-acao="visualizar"]').forEach((b) => b.addEventListener('click', () => previa.abrir()));

    // Janela de ações (menu inferior no celular): fecha ao escolher uma ação ou tocar fora.
    document.querySelectorAll('[data-abrir-sheet]').forEach((b) => b.addEventListener('click', () => {
      definirChaves();
      document.getElementById(b.dataset.abrirSheet).showModal();
    }));
    document.querySelectorAll('dialog.sheet-menu').forEach((d) => d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-fechar-sheet], button[data-acao], button[data-share]')) d.close();
    }));

    if (somenteLeitura) return;
    // Interruptores de comissão (barra do computador, janela de ações, prévia e seção Itens do celular).
    definirChaves();
    document.addEventListener('change', (e) => { if (e.target.matches('[data-comissao]')) alternarComissao(e.target.checked); });
    const st = document.getElementById('status');
    st.value = pedido.status;
    st.dataset.status = pedido.status;
    st.addEventListener('change', () => { pedido.status = st.value; st.dataset.status = st.value; salvar(); });
    document.querySelectorAll('[data-acao="salvar"]').forEach((b) => b.addEventListener('click', () => salvar().then(() => toast('Pedido salvo'))));
    document.querySelectorAll('[data-acao="duplicar"]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Criar um novo pedido copiando este?')) return;
      await salvar();
      const r = await api(`/api/pedidos/${pedido.id}/duplicar`, { method: 'POST' });
      location.href = `pedido.html?id=${(await r.json()).id}`;
    }));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salvar().then(() => toast('Pedido salvo')); }
    });
    // Ao sair da tela / minimizar o app, salva o que estiver pendente.
    window.addEventListener('pagehide', () => { if (pendente) salvar(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pendente) salvar(); });
  }

  function ligarEdicao() {
    if (somenteLeitura) return;
    const raiz = document.getElementById('pedido');
    raiz.addEventListener('input', (e) => { if (e.target.type !== 'radio' && e.target.type !== 'date') aoEditar(e); });
    raiz.addEventListener('change', (e) => { if (e.target.type === 'radio' || e.target.type === 'date') aoEditar(e); });
    raiz.addEventListener('focusout', aoSair);
    raiz.addEventListener('keydown', aoTeclar);
    raiz.addEventListener('click', aoClicar);
  }

  async function iniciar() {
    const url = somenteLeitura ? `/api/compartilhado/${encodeURIComponent(token)}` : `/api/pedidos/${encodeURIComponent(id || '')}`;
    const r = await (somenteLeitura ? fetch(url) : api(url));
    if (!r.ok) {
      document.getElementById('pedido').innerHTML = '<div class="vazio">Pedido não encontrado.</div>';
      return;
    }
    pedido = await r.json();
    pedido.linhas = Math.min(200, Math.max(1, Math.round(Number(pedido.linhas)) || LINHAS_PADRAO));
    if (window.logoStore) logoAtual = await logoStore.carregar();
    document.title = `Pedido ${numeroFmt(pedido.numero)} — Malhas`;
    document.querySelectorAll('[data-titulo]').forEach((t) => (t.textContent = `Pedido Nº ${numeroFmt(pedido.numero)}`));
    if (somenteLeitura) document.body.classList.add('somente-leitura');
    renderTudo();
    ligarEdicao();
    ligarBarra();
    const rod = document.getElementById('atualizado');
    if (rod && pedido.atualizadoEm) rod.textContent = `Última alteração: ${new Date(pedido.atualizadoEm).toLocaleString('pt-BR')}`;
  }

  iniciar();
})();
