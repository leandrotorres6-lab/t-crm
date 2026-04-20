const columns = [
  'leads','negociacao','aguardando_cotacao','agendado','lancar_venda','aguardando_pagamento','pago','sem_retorno'
]

// Equipe PV Corretora — espelha os agentes reais do Chatwoot
const users = [
  { id: 'u1', name: 'Leandro Torres', email: 'leandro@pvcorretora.com.br', role: 'supervisor', status: 'online', avatar: 'LT' },
  { id: 'u2', name: 'Daniel Baptista', email: 'daniel@pvcorretora.com.br', role: 'supervisor', status: 'online', avatar: 'DB' },
  { id: 'u3', name: 'Safira Admin', email: 'safira@pvcorretora.com.br', role: 'supervisor', status: 'online', avatar: 'SA' },
  { id: 'u4', name: 'Wellington Silva', email: 'wellington@pvcorretora.com.br', role: 'vendedor', status: 'online', avatar: 'WS' },
  { id: 'u5', name: 'Nilson Costa', email: 'nilson@pvcorretora.com.br', role: 'vendedor', status: 'online', avatar: 'NC' },
]

const leads = [
  // LEADS
  { id: 'l001', name: 'João Silva', phone: '(21) 99123-4567', email: 'joao@email.com', column: 'leads', assignedTo: 'u4', lastMessage: 'Olá, gostaria de informações sobre seguro de vida', createdAt: '2024-01-15', avatar: 'JS', product: 'Seguro de Vida' },
  { id: 'l002', name: 'Maria Santos', phone: '(21) 98765-4321', email: 'maria@email.com', column: 'leads', assignedTo: 'u4', lastMessage: 'Vi seu anúncio no Instagram, quero um plano de saúde', createdAt: '2024-01-16', avatar: 'MS', product: 'Plano de Saúde' },
  { id: 'l003', name: 'Pedro Oliveira', phone: '(21) 97654-3210', email: 'pedro@email.com', column: 'leads', assignedTo: 'u5', lastMessage: 'Preciso de seguro para meu carro novo', createdAt: '2024-01-17', avatar: 'PO', product: 'Seguro Auto' },
  { id: 'l004', name: 'Fernanda Lima', phone: '(21) 96543-2109', email: 'fernanda@email.com', column: 'leads', assignedTo: 'u5', lastMessage: 'Boa tarde! Tenho interesse em seguro residencial', createdAt: '2024-01-17', avatar: 'FL', product: 'Seguro Residencial' },
  { id: 'l005', name: 'Roberto Costa', phone: '(21) 95432-1098', email: 'roberto@email.com', column: 'leads', assignedTo: 'u4', lastMessage: 'Quero informações sobre seguro empresarial', createdAt: '2024-01-18', avatar: 'RC', product: 'Seguro Empresarial' },
  { id: 'l006', name: 'Juliana Ferreira', phone: '(21) 94321-0987', email: 'juliana@email.com', column: 'leads', assignedTo: 'u4', lastMessage: 'Oi, minha mãe indicou vocês para seguro de vida', createdAt: '2024-01-18', avatar: 'JF', product: 'Seguro de Vida' },
  { id: 'l007', name: 'Marcos Souza', phone: '(21) 93210-9876', email: 'marcos@email.com', column: 'leads', assignedTo: 'u5', lastMessage: 'Preciso comparar planos de saúde para minha empresa', createdAt: '2024-01-19', avatar: 'MZ', product: 'Plano de Saúde' },

  // NEGOCIACAO
  { id: 'l008', name: 'Carla Rodrigues', phone: '(21) 92109-8765', email: 'carla@email.com', column: 'negociacao', assignedTo: 'u4', lastMessage: 'Gostei do plano, mas o valor está um pouco alto', createdAt: '2024-01-10', avatar: 'CR', product: 'Plano de Saúde' },
  { id: 'l009', name: 'Bruno Alves', phone: '(21) 91098-7654', email: 'bruno@email.com', column: 'negociacao', assignedTo: 'u5', lastMessage: 'Pode me explicar melhor as coberturas?', createdAt: '2024-01-11', avatar: 'BA', product: 'Seguro Auto' },
  { id: 'l010', name: 'Tatiana Nunes', phone: '(21) 90987-6543', email: 'tatiana@email.com', column: 'negociacao', assignedTo: 'u4', lastMessage: 'Tenho interesse no plano intermediário', createdAt: '2024-01-12', avatar: 'TN', product: 'Seguro de Vida' },
  { id: 'l011', name: 'Alexandre Pinto', phone: '(21) 89876-5432', email: 'alex@email.com', column: 'negociacao', assignedTo: 'u5', lastMessage: 'Quero adicionar minha família no plano', createdAt: '2024-01-12', avatar: 'AP', product: 'Plano de Saúde' },
  { id: 'l012', name: 'Priscila Castro', phone: '(21) 88765-4321', email: 'priscila@email.com', column: 'negociacao', assignedTo: 'u4', lastMessage: 'Preciso de um prazo para decidir', createdAt: '2024-01-13', avatar: 'PC', product: 'Seguro Residencial' },
  { id: 'l013', name: 'Diego Martins', phone: '(21) 87654-3210', email: 'diego@email.com', column: 'negociacao', assignedTo: 'u5', lastMessage: 'Estou comparando com outra corretora', createdAt: '2024-01-13', avatar: 'DM', product: 'Seguro Auto' },

  // AGUARDANDO_COTACAO
  { id: 'l014', name: 'Lúcia Barbosa', phone: '(21) 86543-2109', email: 'lucia@email.com', column: 'aguardando_cotacao', assignedTo: 'u4', lastMessage: 'Aguardo a cotação para decidir', createdAt: '2024-01-08', avatar: 'LB', product: 'Seguro de Vida' },
  { id: 'l015', name: 'Paulo Mendes', phone: '(21) 85432-1098', email: 'paulo@email.com', column: 'aguardando_cotacao', assignedTo: 'u5', lastMessage: 'Me envia a cotação por WhatsApp', createdAt: '2024-01-09', avatar: 'PM', product: 'Plano de Saúde' },
  { id: 'l016', name: 'Sandra Torres', phone: '(21) 84321-0987', email: 'sandra@email.com', column: 'aguardando_cotacao', assignedTo: 'u4', lastMessage: 'Preciso de 3 opções de planos', createdAt: '2024-01-09', avatar: 'ST', product: 'Seguro Auto' },
  { id: 'l017', name: 'Gustavo Ramos', phone: '(21) 83210-9876', email: 'gustavo@email.com', column: 'aguardando_cotacao', assignedTo: 'u5', lastMessage: 'Qual o prazo para receber a cotação?', createdAt: '2024-01-10', avatar: 'GR', product: 'Seguro Empresarial' },
  { id: 'l018', name: 'Vanessa Cruz', phone: '(21) 82109-8765', email: 'vanessa@email.com', column: 'aguardando_cotacao', assignedTo: 'u4', lastMessage: 'Certo, aguardando!', createdAt: '2024-01-10', avatar: 'VC', product: 'Seguro Residencial' },

  // AGENDADO
  { id: 'l019', name: 'Henrique Lima', phone: '(21) 81098-7654', email: 'henrique@email.com', column: 'agendado', assignedTo: 'u4', lastMessage: 'Confirmado para amanhã às 14h', createdAt: '2024-01-05', avatar: 'HL', product: 'Plano de Saúde', scheduledAt: '2024-01-20T14:00:00' },
  { id: 'l020', name: 'Mônica Freitas', phone: '(21) 80987-6543', email: 'monica@email.com', column: 'agendado', assignedTo: 'u5', lastMessage: 'Ok, estarei disponível na sexta', createdAt: '2024-01-06', avatar: 'MF', product: 'Seguro de Vida', scheduledAt: '2024-01-19T10:00:00' },
  { id: 'l021', name: 'Renato Dias', phone: '(21) 79876-5432', email: 'renato@email.com', column: 'agendado', assignedTo: 'u4', lastMessage: 'Perfeito, até quinta então', createdAt: '2024-01-06', avatar: 'RD', product: 'Seguro Auto', scheduledAt: '2024-01-18T15:30:00' },
  { id: 'l022', name: 'Isabela Santos', phone: '(21) 78765-4321', email: 'isabela@email.com', column: 'agendado', assignedTo: 'u5', lastMessage: 'Ótimo, já marquei na agenda', createdAt: '2024-01-07', avatar: 'IS', product: 'Seguro Residencial', scheduledAt: '2024-01-21T09:00:00' },

  // LANCAR_VENDA
  { id: 'l023', name: 'Felipe Carvalho', phone: '(21) 77654-3210', email: 'felipe@email.com', column: 'lancar_venda', assignedTo: 'u4', lastMessage: 'Vamos fechar! Qual o próximo passo?', createdAt: '2024-01-03', avatar: 'FC', product: 'Plano de Saúde' },
  { id: 'l024', name: 'Camila Rocha', phone: '(21) 76543-2109', email: 'camila@email.com', column: 'lancar_venda', assignedTo: 'u5', lastMessage: 'Aprovado pela seguradora, aguardando documentos', createdAt: '2024-01-04', avatar: 'CR', product: 'Seguro de Vida' },
  { id: 'l025', name: 'Thiago Pereira', phone: '(21) 75432-1098', email: 'thiago@email.com', column: 'lancar_venda', assignedTo: 'u4', lastMessage: 'Enviei os documentos, quando sai a apólice?', createdAt: '2024-01-04', avatar: 'TP', product: 'Seguro Auto' },

  // AGUARDANDO_PAGAMENTO
  { id: 'l026', name: 'Natália Gomes', phone: '(21) 74321-0987', email: 'natalia@email.com', column: 'aguardando_pagamento', assignedTo: 'u4', lastMessage: 'Vou pagar hoje à tarde no banco', createdAt: '2024-01-01', avatar: 'NG', product: 'Seguro Residencial' },
  { id: 'l027', name: 'Rodrigo Melo', phone: '(21) 73210-9876', email: 'rodrigo@email.com', column: 'aguardando_pagamento', assignedTo: 'u5', lastMessage: 'Boleto já está no meu email, vou pagar agora', createdAt: '2024-01-02', avatar: 'RM', product: 'Plano de Saúde' },
  { id: 'l028', name: 'Letícia Cardoso', phone: '(21) 72109-8765', email: 'leticia@email.com', column: 'aguardando_pagamento', assignedTo: 'u4', lastMessage: 'Pix ou boleto, qual é melhor?', createdAt: '2024-01-02', avatar: 'LC', product: 'Seguro de Vida' },

  // PAGO
  { id: 'l029', name: 'Wellington Costa', phone: '(21) 71098-7654', email: 'wellington@email.com', column: 'pago', assignedTo: 'u4', lastMessage: '✅ Pagamento confirmado, obrigado!', createdAt: '2023-12-28', avatar: 'WC', product: 'Plano de Saúde' },
  { id: 'l030', name: 'Simone Vieira', phone: '(21) 70987-6543', email: 'simone@email.com', column: 'pago', assignedTo: 'u5', lastMessage: 'Apólice recebida, muito obrigada!', createdAt: '2023-12-29', avatar: 'SV', product: 'Seguro Auto' },
  { id: 'l031', name: 'Fábio Nascimento', phone: '(21) 69876-5432', email: 'fabio@email.com', column: 'pago', assignedTo: 'u4', lastMessage: 'Pago e confirmado. Excelente atendimento!', createdAt: '2023-12-30', avatar: 'FN', product: 'Seguro de Vida' },

  // SEM_RETORNO
  { id: 'l032', name: 'Patrícia Azevedo', phone: '(21) 68765-4321', email: 'patricia@email.com', column: 'sem_retorno', assignedTo: 'u5', lastMessage: 'Última mensagem sem resposta há 5 dias', createdAt: '2023-12-20', avatar: 'PA', product: 'Seguro Residencial' },
  { id: 'l033', name: 'Leandro Borges', phone: '(21) 67654-3210', email: 'leandro@email.com', column: 'sem_retorno', assignedTo: 'u4', lastMessage: 'Sem resposta desde o último contato', createdAt: '2023-12-22', avatar: 'LB', product: 'Plano de Saúde' },
  { id: 'l034', name: 'Cristina Moura', phone: '(21) 66543-2109', email: 'cristina@email.com', column: 'sem_retorno', assignedTo: 'u5', lastMessage: 'Não respondeu as últimas 3 mensagens', createdAt: '2023-12-23', avatar: 'CM', product: 'Seguro Auto' },
]

function generateMessages(leadId, leadName) {
  const conversations = {
    'l001': [
      { id: `${leadId}-1`, sender: 'lead', content: 'Olá, boa tarde! Vi o anúncio de vocês e gostaria de informações sobre seguro de vida.', timestamp: '2024-01-15T09:00:00' },
      { id: `${leadId}-2`, sender: 'agent', content: 'Olá João! Boa tarde, tudo bem? Que ótimo que entrou em contato. Temos excelentes opções de seguro de vida. Posso te fazer algumas perguntas para entender melhor sua necessidade?', timestamp: '2024-01-15T09:05:00' },
      { id: `${leadId}-3`, sender: 'lead', content: 'Claro, pode perguntar!', timestamp: '2024-01-15T09:07:00' },
      { id: `${leadId}-4`, sender: 'agent', content: 'Você tem dependentes? Cônjuge, filhos?', timestamp: '2024-01-15T09:08:00' },
      { id: `${leadId}-5`, sender: 'lead', content: 'Sim, tenho esposa e dois filhos de 8 e 10 anos.', timestamp: '2024-01-15T09:10:00' },
      { id: `${leadId}-6`, sender: 'agent', content: 'Perfeito! Para proteger sua família, recomendo o plano Premium com cobertura de R$ 500.000. Inclui invalidez, doenças graves e morte. A parcela fica em torno de R$ 180/mês.', timestamp: '2024-01-15T09:15:00' },
      { id: `${leadId}-7`, sender: 'lead', content: 'Hmm, parece interessante. Mas esse valor cobre tudo?', timestamp: '2024-01-15T09:18:00' },
      { id: `${leadId}-8`, sender: 'agent', content: 'Sim! Cobre morte por qualquer causa, invalidez permanente total ou parcial, e 12 doenças graves incluindo câncer e infarto. Quer que eu envie a proposta completa?', timestamp: '2024-01-15T09:20:00' },
    ],
    'l002': [
      { id: `${leadId}-1`, sender: 'lead', content: 'Vi seu anúncio no Instagram, quero um plano de saúde para minha família.', timestamp: '2024-01-16T10:00:00' },
      { id: `${leadId}-2`, sender: 'agent', content: 'Olá Maria! Seja bem-vinda! Quantas pessoas precisa incluir no plano?', timestamp: '2024-01-16T10:03:00' },
      { id: `${leadId}-3`, sender: 'lead', content: 'Eu, meu marido e minha filha de 5 anos.', timestamp: '2024-01-16T10:05:00' },
      { id: `${leadId}-4`, sender: 'agent', content: 'Ótimo! Para família de 3 pessoas, tenho opções a partir de R$ 850/mês com cobertura completa. Quer conhecer as opções?', timestamp: '2024-01-16T10:08:00' },
    ],
  }

  if (conversations[leadId]) return conversations[leadId]

  return [
    { id: `${leadId}-1`, sender: 'lead', content: `Olá, tenho interesse em seguros. Podem me ajudar?`, timestamp: '2024-01-15T09:00:00' },
    { id: `${leadId}-2`, sender: 'agent', content: `Olá ${leadName}! Claro, com prazer! Qual tipo de seguro está buscando?`, timestamp: '2024-01-15T09:05:00' },
    { id: `${leadId}-3`, sender: 'lead', content: 'Quero entender as opções disponíveis.', timestamp: '2024-01-15T09:07:00' },
    { id: `${leadId}-4`, sender: 'agent', content: 'Temos seguro de vida, auto, saúde, residencial e empresarial. Qual deles tem mais interesse?', timestamp: '2024-01-15T09:10:00' },
    { id: `${leadId}-5`, sender: 'lead', content: 'Me interessa mais o plano de saúde e seguro de vida.', timestamp: '2024-01-15T09:15:00' },
    { id: `${leadId}-6`, sender: 'agent', content: 'Perfeito! Vou preparar uma apresentação personalizada para você. Posso ligar amanhã para detalhar melhor?', timestamp: '2024-01-15T09:18:00' },
    { id: `${leadId}-7`, sender: 'lead', content: `${leads.find(l => l.id === leadId)?.lastMessage || 'Pode ligar sim, estou disponível.'}`, timestamp: '2024-01-15T09:20:00' },
  ]
}

module.exports = { columns, users, leads, generateMessages }
