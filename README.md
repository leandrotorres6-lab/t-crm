# T-CRM — Sistema de Gestão de Leads

CRM estilo SaaS completo para corretoras de seguros, com Kanban, Chat integrado, Dashboard e Agendamentos.

---

## 🚀 Como executar

### Pré-requisitos
- Node.js 18+
- npm

---

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

Roda em: **http://localhost:3001**

---

### 2. Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Roda em: **http://localhost:3000**

---

### 3. Acesse

Abra **http://localhost:3000** no navegador.

---

## 🎯 Funcionalidades

| Módulo | Descrição |
|--------|-----------|
| **CRM Kanban** | 8 colunas com lazy load, drag & drop, 3 colunas visíveis |
| **Chat** | 38% da tela, histórico sob demanda, envio de mensagens |
| **Dashboard** | Gráficos de evolução, pipeline e taxa de conversão |
| **Contatos** | Lista com busca em tempo real e lazy loading |
| **Agendamento** | Calendário de visitas, alertas de horário, filtros |
| **Tema** | Dark/Light mode com toggle |
| **Usuários** | Supervisor (vê tudo) e Vendedor (vê apenas seus leads) |

---

## 🔗 Estrutura da API

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/kanban/columns` | GET | Lista colunas com contagem |
| `/api/kanban/:column` | GET | Leads da coluna (paginado) |
| `/api/kanban/:id/move` | PATCH | Move lead para coluna |
| `/api/kanban/:id/schedule` | PATCH | Agenda lead |
| `/api/messages/:leadId` | GET | Mensagens (paginado) |
| `/api/messages/:leadId` | POST | Envia mensagem |
| `/api/contacts` | GET | Lista contatos (busca + paginação) |
| `/api/dashboard` | GET | Dados do dashboard |
| `/api/chatwoot/webhook` | POST | Webhook para integração Chatwoot |

---

## 🔌 Integração Chatwoot (preparada)

O endpoint `/api/chatwoot/webhook` está pronto para receber eventos do Chatwoot. Para integrar:

1. No painel Chatwoot, vá em Settings → Integrations → Webhooks
2. Adicione: `http://seu-servidor:3001/api/chatwoot/webhook`
3. Selecione os eventos: `message_created`, `conversation_updated`
4. Edite `backend/server.js` na seção `[Chatwoot Webhook]` para processar os eventos

---

## 🏗️ Estrutura do projeto

```
t-crm/
├── backend/
│   ├── data/
│   │   └── mockData.js         # Dados simulados (leads, mensagens)
│   ├── server.js               # Express API
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── crm/page.js         # Página CRM (Kanban + Chat)
│   │   ├── dashboard/page.js   # Dashboard com gráficos
│   │   ├── contatos/page.js    # Lista de contatos
│   │   ├── agendamento/page.js # Agendamentos
│   │   ├── layout.js           # Root layout
│   │   └── globals.css         # Estilos globais + Tailwind
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.js      # Menu lateral colapsável
│   │   │   └── MainLayout.js   # Layout principal
│   │   ├── crm/
│   │   │   ├── KanbanBoard.js  # Board com lazy loading horizontal
│   │   │   ├── KanbanColumn.js # Coluna com lazy loading vertical
│   │   │   ├── KanbanCard.js   # Card draggable
│   │   │   ├── ChatPanel.js    # Chat 38% da tela
│   │   │   └── ScheduleModal.js # Modal de agendamento
│   │   └── dashboard/
│   │       └── StatsCard.js    # Card de estatística
│   ├── contexts/
│   │   ├── ThemeContext.js     # Dark/light mode
│   │   └── AppContext.js       # Estado global
│   ├── lib/
│   │   └── api.js              # Chamadas à API
│   └── package.json
└── README.md
```
