// Gera o PDF do pedido (A4 retrato) no layout da planilha TABELA MALHA.xlsx, direto no aparelho.
// Depende de vendor/jspdf.umd.min.js.
(function () {
  const LARGURAS = [13, 14, 13, 36.43, 15, 8, 10, 11.7, 10.29, 12.57, 28.57]; // colunas A..K
  // Com a coluna de comissão (entre PESO e PREÇO): ela as demais colunas encolhem na mesma proporção.
  const LARGURAS_COM = [13, 14, 13, 36.43, 15, 8, 10, 11.7, 14, 10.29, 12.57, 28.57];
  const AZUL = [47, 85, 151];
  const CINZA = [127, 127, 127];
  const BRANCO = [255, 255, 255];
  const PRETO = [0, 0, 0];
  const MARGEM = 10;
  const LARGURA = 190; // A4 (210 mm) menos as margens

  // Logo escolhida em Configurações: carregada uma vez e desenhada no PDF (sem logo, a caixa fica vazia).
  let LOGO = null;
  if (window.logoStore) {
    logoStore.carregar()
      .then((dados) => dados && new Promise((ok) => {
        const im = new Image();
        im.onload = () => ok({ dados, formato: dados.startsWith('data:image/png') ? 'PNG' : 'JPEG', larg: im.naturalWidth, alt: im.naturalHeight });
        im.onerror = () => ok(null);
        im.src = dados;
      }))
      .then((l) => { LOGO = l || null; })
      .catch(() => {});
  }

  const nf = (min, max) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
  const fmtMoeda = (v) => (Math.abs(v || 0) < 0.005 ? '-' : nf(2, 2).format(v));
  const fmtNum = (v) => (v ? nf(0, 3).format(v) : '');
  const fmtPreco = (v) => (v ? nf(2, 2).format(v) : '');
  const dataBR = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso || '');
  const numeroFmt = (n) => String(n).padStart(4, '0');
  const preenchido = (i) => i && (i.malha || i.cor || i.rolos || i.peso || i.preco);

  function gerar(pedido) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const COM = Boolean(pedido.mostrarComissao);
    const k = COM ? 1 : 0;
    const larg = COM ? LARGURAS_COM : LARGURAS;
    const soma = larg.reduce((a, b) => a + b, 0);
    const X = [MARGEM];
    larg.forEach((w) => X.push(X[X.length - 1] + (w / soma) * LARGURA));

    // Célula pelas colunas lógicas c1..c2 da grade (já com a coluna de comissão, se houver).
    function celL(c1, c2, y, h, texto, o = {}) {
      const x = X[c1];
      const w = X[c2 + 1] - x;
      if (o.fundo) { doc.setFillColor(...o.fundo); doc.rect(x, y, w, h, 'F'); }
      if (o.borda !== false) { doc.setDrawColor(0); doc.setLineWidth(o.espessura || 0.2); doc.rect(x, y, w, h); }
      if (texto == null || texto === '') return;
      doc.setFont('helvetica', o.negrito ? 'bold' : 'normal');
      let tam = o.tam || 8;
      doc.setFontSize(tam);
      doc.setTextColor(...(o.cor || PRETO));
      const pad = 1.2;
      const alinh = o.alinh || 'left';
      const tx = alinh === 'center' ? x + w / 2 : alinh === 'right' ? x + w - pad : x + pad;
      const str = String(texto);
      if (o.multilinha) {
        doc.text(doc.splitTextToSize(str, w - 2 * pad), tx, y + pad + 2.4, { align: alinh, baseline: 'alphabetic', lineHeightFactor: 1.25 });
      } else if (o.quebra) {
        // Cabeçalho em até duas linhas, centralizado na altura da célula.
        const linhas = doc.splitTextToSize(str, w - 2 * pad);
        const lh = tam * 0.3528 * 1.15;
        linhas.forEach((l, k) => doc.text(l, tx, y + h / 2 + (k - (linhas.length - 1) / 2) * lh, { align: alinh, baseline: 'middle' }));
      } else {
        // Diminui a fonte até caber; se ainda assim não couber, corta.
        while (tam > 5 && doc.getTextWidth(str) > w - 2 * pad) doc.setFontSize((tam -= 0.25));
        const cabe = doc.getTextWidth(str) <= w - 2 * pad;
        doc.text(cabe ? str : doc.splitTextToSize(str, w - 2 * pad)[0], tx, y + h / 2, { align: alinh, baseline: 'middle' });
      }
    }

    // Mesma numeração de colunas da planilha original (0 = A … 10 = K); a coluna de comissão fica entre H (PESO) e I (PREÇO).
    // Uma célula que termina em H (ou passa por ela) cobre também a coluna nova, para não deixar buraco.
    const cel = (c1, c2, ...resto) => celL(c1 > 7 ? c1 + k : c1, c2 >= 7 ? c2 + k : c2, ...resto);

    // Valor em reais: "R$" à esquerda e o número à direita, como no formato contábil do Excel.
    function moeda(c1, c2, y, h, valor, o = {}) {
      cel(c1, c2, y, h, 'R$', { ...o, alinh: 'left' });
      cel(c1, c2, y, h, valor, { ...o, alinh: 'right', borda: false });
    }

    const rot = { negrito: true, alinh: 'center' };
    const cab = { fundo: AZUL, cor: BRANCO, negrito: true, alinh: 'center' };
    const c = pedido.cliente || {};
    const itens = (pedido.itens || []).filter(preenchido);
    const produtos = itens.reduce((s, i) => s + (i.preco || 0) * (i.peso || 0), 0);
    const desconto = ((c.descontoPct || 0) * produtos) / 100;
    const total = produtos - desconto + (pedido.freteValor || 0) + (pedido.outrasDespesas || 0);
    const H = 6;
    let y = MARGEM;

    // Faixa do título
    cel(0, 10, y, 8, `PEDIDO Nº ${numeroFmt(pedido.numero)}`, { fundo: AZUL, cor: BRANCO, negrito: true, tam: 11, borda: false });
    y += 8;
    // Linhas de espaço: só as laterais fechadas, para a caixa dos dados "flutuar" dentro da moldura
    const ESP = 3;
    const lateral = (yy) => {
      doc.setDrawColor(0); doc.setLineWidth(0.2);
      doc.line(X[0], yy, X[0], yy + ESP); doc.line(X[11 + k], yy, X[11 + k], yy + ESP);
    };
    lateral(y); y += ESP;
    // Logo e dados do pedido (3 linhas de 8 mm: a caixa da logo mantém os 24 mm de altura)
    const HH = 8;
    // A logo preenche a caixa inteira (escala "cobrir"; o excedente é recortado), e a moldura vem por cima.
    if (LOGO) {
      const bx = X[0];
      const bw = X[2] - X[0];
      const bh = HH * 3;
      const esc = Math.max(bw / LOGO.larg, bh / LOGO.alt);
      const w = LOGO.larg * esc;
      const h = LOGO.alt * esc;
      doc.saveGraphicsState();
      doc.rect(bx, y, bw, bh, null);
      doc.clip();
      doc.discardPath();
      doc.addImage(LOGO.dados, LOGO.formato, bx + (bw - w) / 2, y + (bh - h) / 2, w, h);
      doc.restoreGraphicsState();
    }
    cel(0, 1, y, HH * 3, '');
    const centro = { alinh: 'center' };
    cel(2, 2, y, HH, 'Data', cab); cel(3, 4, y, HH, dataBR(pedido.data), centro);
    cel(5, 7, y, HH, 'Vendedor', cab); cel(8, 10, y, HH, pedido.vendedor, centro);
    cel(2, 2, y + HH, HH, 'Contato', cab); cel(3, 4, y + HH, HH, pedido.contato, centro);
    cel(5, 7, y + HH, HH, 'Forma de pagamento', cab); cel(8, 10, y + HH, HH, c.formaPagamento, centro);
    cel(2, 2, y + HH * 2, HH, 'Frete', cab);
    cel(3, 4, y + HH * 2, HH, `CIF ${c.frete === 'CIF' ? '( X )' : '(   )'}   FOB ${c.frete === 'FOB' ? '( X )' : '(   )'}`, centro);
    cel(5, 7, y + HH * 2, HH, 'Desconto', cab); cel(8, 10, y + HH * 2, HH, `${fmtNum(c.descontoPct) || '0'} %`, centro);
    y += HH * 3;
    lateral(y); y += ESP;
    // Cliente (3 linhas)
    cel(0, 10, y, H, 'Cliente', cab); y += H;
    cel(0, 1, y, H, 'Razão Social:', rot); cel(2, 3, y, H, c.razaoSocial);
    cel(4, 4, y, H, 'CNPJ:', rot); cel(5, 7, y, H, c.cnpj, centro);
    cel(8, 9, y, H, 'Insc. Estadual:', rot); cel(10, 10, y, H, c.inscEstadual, centro); y += H;
    cel(0, 1, y, H, 'Endereço:', rot); cel(2, 6, y, H, c.endereco);
    cel(7, 7, y, H, 'Nº:', rot); cel(8, 8, y, H, c.numero, centro);
    cel(9, 9, y, H, 'Bairro:', rot); cel(10, 10, y, H, c.bairro); y += H;
    cel(0, 1, y, H, 'Cidade:', rot); cel(2, 3, y, H, c.cidade, centro);
    cel(4, 4, y, H, 'UF:', rot); cel(5, 5, y, H, String(c.uf || '').toUpperCase(), centro);
    cel(6, 6, y, H, 'Fone:', rot); cel(7, 8, y, H, c.fone, centro);
    cel(9, 9, y, H, 'E-mail:', rot); cel(10, 10, y, H, c.email); y += H;
    // Linha 15 (espaço) e 16 (cabeçalho dos itens)
    y += 4;
    const HC = 8;
    cel(0, 2, y, HC, 'MALHA / CÓDIGO', cab);
    cel(3, 3, y, HC, 'COR / CÓDIGO', cab);
    cel(4, 5, y, HC, 'ROLOS (APROX 20KG)', { ...cab, tam: 7, quebra: true }); celL(6, 7, y, HC, 'PESO', cab);
    if (COM) celL(8, 8, y, HC, 'COMISSÃO (%)', { ...cab, tam: 6, quebra: true });
    cel(8, 9, y, HC, 'PREÇO', cab); cel(10, 10, y, HC, 'TOTAL', cab);
    y += HC;

    // Itens: a quantidade de linhas é a da tabela do pedido (18 por padrão). Com muitos itens, as linhas encolhem para caber na página.
    const nLinhas = Math.max(Math.round(Number(pedido.linhas)) || 18, itens.length);
    const espacoItens = 297 - MARGEM - y - 6 * 5.5 - 22;
    const HI = Math.max(3.2, Math.min(6, espacoItens / nLinhas));
    const tamItem = HI < 4.5 ? 6.5 : 8;
    for (let i = 0; i < nLinhas; i += 1) {
      const it = itens[i] || {};
      const o = { tam: tamItem };
      cel(0, 2, y, HI, it.malha, { ...o, alinh: 'center' });
      cel(3, 3, y, HI, it.cor, o);
      cel(4, 5, y, HI, fmtNum(it.rolos), { ...o, alinh: 'center' });
      celL(6, 7, y, HI, fmtNum(it.peso), { ...o, alinh: 'center' });
      if (COM) celL(8, 8, y, HI, it.comissao ? `${fmtNum(it.comissao)} %` : '', { ...o, alinh: 'center' });
      moeda(8, 9, y, HI, fmtPreco(it.preco), o);
      moeda(10, 10, y, HI, fmtMoeda((it.preco || 0) * (it.peso || 0)), o);
      y += HI;
    }

    // Linhas 35-40: dados adicionais e totais
    const HT = 5.5;
    cel(0, 7, y, HT, 'Dados Adicionais', cab);
    cel(8, 9, y, HT, 'Valor Total Produtos', { negrito: true, borda: false });
    moeda(10, 10, y, HT, fmtMoeda(produtos), { negrito: true, tam: 9 });
    cel(0, 7, y + HT, HT * 5, pedido.dadosAdicionais, { multilinha: true });
    cel(8, 9, y + HT, HT, `Desconto (${fmtNum(c.descontoPct) || '0'}%)`, { ...rot, borda: false });
    moeda(10, 10, y + HT, HT, fmtMoeda(desconto));
    cel(8, 9, y + HT * 2, HT, 'Frete', { ...rot, borda: false });
    moeda(10, 10, y + HT * 2, HT, fmtMoeda(pedido.freteValor));
    cel(8, 9, y + HT * 3, HT, 'Outras Despesas', { ...rot, borda: false });
    moeda(10, 10, y + HT * 3, HT, fmtMoeda(pedido.outrasDespesas));
    cel(8, 9, y + HT * 5, HT, 'Valor Total Pedido', { fundo: CINZA, negrito: true, alinh: 'center' });
    moeda(10, 10, y + HT * 5, HT, fmtMoeda(total), { negrito: true, tam: 10, borda: false });
    doc.setLineWidth(0.6); doc.line(X[10 + k], y + HT * 6, X[11 + k], y + HT * 6);
    y += HT * 6 + 6;

    // Linhas 42-43: aprovação
    cel(2, 3, y, H, 'Aprovado por', cab); cel(8, 10, y, H, 'Data', cab);
    cel(2, 3, y + H, H, pedido.aprovadoPor, { alinh: 'center' });
    cel(8, 10, y + H, H, dataBR(pedido.dataAprovacao), { alinh: 'center' });

    doc.setProperties({ title: `Pedido ${numeroFmt(pedido.numero)}`, subject: 'Pedido de Malhas' });
    return doc;
  }

  function nomeArquivo(pedido) {
    const cliente = (pedido.cliente?.razaoSocial || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return `Pedido-${numeroFmt(pedido.numero)}${cliente ? `-${cliente}` : ''}.pdf`;
  }

  // Compartilha um arquivo pelo menu do aparelho (WhatsApp, e-mail, Arquivos…); sem suporte, baixa o arquivo.
  window.compartilharArquivo = async function (blob, nome, titulo) {
    const arquivo = new File([blob], nome, { type: blob.type });
    const celular = matchMedia('(pointer: coarse)').matches;
    if (celular && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: titulo });
        return 'compartilhado';
      } catch (e) {
        if (e.name === 'AbortError') return 'cancelado';
      }
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'baixado';
  };

  window.pdfPedido = {
    gerar,
    nomeArquivo,
    compartilhar(pedido) {
      const blob = gerar(pedido).output('blob');
      return window.compartilharArquivo(blob, nomeArquivo(pedido), `Pedido ${numeroFmt(pedido.numero)}`);
    },
  };
})();
