# Auth Testing Playbook

The API uses MySQL and creates its schema automatically. Configure
`DATABASE_URL` (or the `MYSQL_*` variables), start the backend, then:

```powershell
curl.exe -c cookies.txt -X POST http://localhost:8000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"gmssaldanham@gmail.com","password":"Mensali@2026"}'
curl.exe -b cookies.txt http://localhost:8000/api/auth/me
```

Login returns the user and `access_token`, and sets httpOnly access and refresh
cookies. All protected endpoints also accept `Authorization: Bearer <token>`.
The client, payment, dashboard, report, and CSV endpoints retain the existing
`/api` paths and response shapes.
