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

## Validation

```powershell
cd backend
npm run check
```
