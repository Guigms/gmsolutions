# Auth Testing Playbook

## Credenciais
Ver /app/memory/test_credentials.md (admin: gmssaldanham@gmail.com / Mensali@2026).

## Step 1: MongoDB Verification
```
mongosh
use test_database
db.users.find({role: "admin"}).pretty()
```
Verificar: hash bcrypt começa com `$2b$`, índice único em users.email, índices em login_attempts.identifier e password_reset_tokens.expires_at (TTL).

## Step 2: API Testing
```
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
curl -c cookies.txt -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d '{"email":"gmssaldanham@gmail.com","password":"Mensali@2026"}'
curl -b cookies.txt "$API_URL/api/auth/me"
```
Login deve retornar o usuário + `access_token` e setar cookies httpOnly. `/me` deve retornar o mesmo usuário via cookie ou via header `Authorization: Bearer <access_token>`.

## Step 3: Fluxo de negócio
- POST /api/clients {name, monthly_value, due_day} com Bearer token
- GET /api/clients?year=YYYY&month=M
- POST /api/clients/{id}/payment {year, month} alterna pago/estornado
- GET /api/dashboard?year=&month= retorna KPIs
- GET /api/reports?year=&month= retorna séries mensais e previsão
- GET /api/reports/export?year=&month= retorna CSV
