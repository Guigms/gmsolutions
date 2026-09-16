# PRD — MensaliPay (Sistema de Controle de Mensalidades)

## Problem statement original
"desenvolva um sistema de controle de mensalidade, onde eu cadastre um cliente, o valor da mensalidade, o dia de vencimento e ele me de relatorios, o sistema deve ter autenticação para realizar o login"

## Escolhas do usuário
- Autenticação: JWT (email + senha)
- Relatórios: completos (KPIs, gráficos recebido vs pendente, previsão, status)
- Pagamentos: confirmação manual mês a mês ("dar OK no mês")
- Extras: editar/excluir clientes, histórico de pagamentos, exportar CSV
- Idioma: Português (BR)

## Arquitetura
- Backend: FastAPI + MongoDB (Motor), JWT com bcrypt, cookies httpOnly + Bearer token, proteção contra brute force (5 tentativas = 15min lockout), seed idempotente de admin
- Frontend: React 19 + Tailwind + Shadcn/UI + Recharts + Sonner, React Router v7, axios com refresh automático de token
- Multi-tenant: dados de clientes/pagamentos isolados por user_id

## Personas
- Dono de negócio (admin): cadastra clientes, confirma pagamentos, acompanha relatórios financeiros

## Requisitos core
1. Login/registro com autenticação JWT
2. CRUD de clientes (nome, valor mensalidade, dia vencimento, telefone, email, observações)
3. Confirmação/estorno de pagamento mensal por cliente
4. Status automático: Pago / Pendente / Em atraso / A vencer
5. Dashboard com KPIs e gráficos
6. Relatórios com gráficos + exportação CSV
7. Histórico de pagamentos por cliente

## Implementado (Jun/2026)
- Auth completa: register, login, logout, me, refresh, forgot/reset password, lockout brute force
- Admin seed: gmssaldanham@gmail.com (credenciais em /app/memory/test_credentials.md)
- Clientes: listar (busca, filtro status/dia), criar, editar, excluir (com confirmação)
- Pagamentos: toggle "Dar OK" / estorno, histórico com estorno por mês
- Dashboard: 4 KPIs, gráfico recebido vs pendente (6 meses), donut de status, lista de atrasados com ação rápida
- Relatórios: resumo financeiro, gráfico composto, previsão 6 meses, tabela resumo, export CSV (separador ';' pt-BR)
- Seletor global mês/ano no header, tema claro/escuro, layout responsivo (mobile drawer)
- Testes: 12/12 backend pytest + E2E frontend 100% (iteração 1)

## Backlog priorizado
- P1: Notificações/lembretes de vencimento (email/WhatsApp)
- P1: Exportar PDF de relatórios
- P2: Valor de mensalidade variável por mês (ajuste no histórico)
- P2: Inativação de cliente sem excluir (soft delete)
- P2: Cobranças recorrentes automáticas (geração mensal de faturas)
- P3: Integração de pagamento online (Stripe/Pix)

## Próximas tarefas
- Validar com o usuário o fluxo de "Dar OK" e os relatórios
- Avaliar necessidade de lembretes automáticos
