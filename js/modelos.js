// Modelos de nota disponíveis. "layout" diz qual formulário o modelo usa: 'pedido' (planilha de malhas) ou
// 'orcamento' (cabeçalho preto, descrição / quantidade / valor). Um modelo novo que reaproveite um layout existente
// só precisa ser cadastrado aqui e em CONTADORES (server.js e local-api.js). Layout novo: trate-o também em
// folha.js (tela e formulário) e pdf.js (PDF).
window.MODELOS = {
  pedido: {
    layout: 'pedido',
    arquivo: 'Pedido',
    nome: 'Nota de pedido',
    rotulo: 'Pedido',
    titulo: 'Pedido de Malhas',
    descricao: 'Malha, cor, rolos, peso, frete e desconto.',
  },
  orcamento: {
    layout: 'orcamento',
    tituloDoc: 'ORÇAMENTO',
    arquivo: 'Orcamento',
    exemploItem: 'Ex.: Camisa polo',
    nome: 'Orçamento',
    rotulo: 'Orçamento',
    titulo: 'Orçamento',
    descricao: 'Descrição, quantidade e valor unitário, com total.',
  },
  servico: {
    layout: 'orcamento',
    tituloDoc: 'NOTA DE SERVIÇO',
    arquivo: 'Nota-de-Servico',
    exemploItem: 'Ex.: Instalação elétrica',
    nome: 'Nota de serviço',
    rotulo: 'Nota de serviço',
    titulo: 'Nota de Serviço',
    descricao: 'Descrição do serviço, quantidade e valor unitário, com total.',
  },
};

// Modelo de uma nota (notas antigas não têm "tipo": são pedidos).
window.modeloDe = (nota) => window.MODELOS[nota && nota.tipo] || window.MODELOS.pedido;
