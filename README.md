# MensaliPay

MensaliPay uses a React frontend and a Node.js/Express API backed by MySQL.

## Backend

```powershell
cd backend
npm install
$env:DATABASE_URL="mysql://user:password@localhost:3306/mensalipay"
$env:JWT_SECRET="replace-with-a-long-random-secret"
npm start
```

`DATABASE_URL` is optional. It can be replaced by `MYSQL_HOST`, `MYSQL_PORT`,
`MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE`. Tables are created and the
administrator is seeded on startup. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to
override the development defaults.

The API is mounted at `/api` and supports cookie or `Authorization: Bearer
<token>` JWT authentication. `FRONTEND_URL` controls the CORS origin.

## Deploy na Vercel

Use dois projetos Vercel apontando para este mesmo repositório:

1. Backend: Root Directory `backend`, framework `Other` e sem build command.
2. Frontend: Root Directory `frontend`, framework `Create React App`.

No projeto do backend, configure `DATABASE_URL` apontando para um MySQL gerenciado,
`MYSQL_SSL=true`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `FRONTEND_URL`
com a URL final do frontend. O Vercel não fornece o banco MySQL, então ele precisa
estar em um provedor externo acessível pela internet.

No projeto do frontend, configure `REACT_APP_BACKEND_URL` com a URL final do
backend. Os modelos estão em `backend/prisma/schema.prisma`; a API atual cria as
tabelas automaticamente na inicialização com MySQL.

Os arquivos `.env.example` de cada aplicação listam as variáveis esperadas. Nunca
publique os arquivos `.env` reais nem reutilize a senha de desenvolvimento em produção.

## Validation

```powershell
cd backend
npm run check
```
