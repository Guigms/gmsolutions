const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const { v4: uuid } = require("uuid");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 8000);
const jwtSecret = process.env.JWT_SECRET || "development-secret-change-me";
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
const allowedOrigins = frontendUrl.split(",").map((origin) => origin.trim()).filter(Boolean);
const now = () => new Date();
const poolOptions = (() => {
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL.replace(/^mysql\+[^:]+:/, "mysql:"));
    return { host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), ssl: process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: false } : undefined };
  }
  return { host: process.env.MYSQL_HOST || "localhost", port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER || "root", password: process.env.MYSQL_PASSWORD || "", database: process.env.MYSQL_DATABASE || "mensalipay", ssl: process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: false } : undefined };
})();
const pool = mysql.createPool({ ...poolOptions, waitForConnections: true, connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10), dateStrings: false });

app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin) || origin === "http://localhost:3000"), credentials: true }));
app.use(express.json());
app.use(cookieParser());

async function query(sql, params = []) { const [rows] = await pool.execute(sql, params); return rows; }
async function one(sql, params = []) { return (await query(sql, params))[0] || null; }
function publicUser(u) { return { id: u.id, name: u.name || "", email: u.email, role: u.role || "user" }; }
function token(id, email, type, seconds) { return jwt.sign({ sub: id, email, type }, jwtSecret, { expiresIn: seconds }); }
function setCookies(res, access, refresh) {
  const secure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  const options = { httpOnly: true, secure, sameSite: secure ? "none" : "lax", path: "/" };
  res.cookie("access_token", access, { ...options, maxAge: 3600000 });
  if (refresh) res.cookie("refresh_token", refresh, { ...options, maxAge: 604800000 });
}
function bad(res, status, detail) { return res.status(status).json({ detail }); }
function auth(req, res, next) {
  const value = req.cookies.access_token || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!value) return bad(res, 401, "Não autenticado");
  try {
    const p = jwt.verify(value, jwtSecret);
    if (p.type !== "access") return bad(res, 401, "Tipo de token inválido");
    one("SELECT * FROM users WHERE id=?", [p.sub]).then(u => { if (!u) return bad(res, 401, "Usuário não encontrado"); req.user = u; next(); }).catch(next);
  } catch (e) { return bad(res, 401, e.name === "TokenExpiredError" ? "Token expirado" : "Token inválido"); }
}
function validClient(body) {
  return body && typeof body.name === "string" && body.name.length > 0 && Number(body.monthly_value) > 0 && Number.isInteger(Number(body.due_day)) && Number(body.due_day) >= 1 && Number(body.due_day) <= 31;
}
function monthShift(year, month, delta) { const d = new Date(Date.UTC(year, month - 1 + delta, 1)); return [d.getUTCFullYear(), d.getUTCMonth() + 1]; }

// ====== STATUS ATUALIZADO ======
function status(client, year, month, paid) {
  if (paid) return "pago";

  const createdDate = new Date(client.created_at || new Date());
  let firstYear = createdDate.getFullYear();
  let firstMonth = createdDate.getMonth() + 1;

  if (createdDate.getDate() >= client.due_day) {
    firstMonth += 1;
    if (firstMonth > 12) {
      firstMonth = 1;
      firstYear += 1;
    }
  }

  // Ignora o cliente em meses anteriores à sua primeira cobrança
  if (year < firstYear || (year === firstYear && month < firstMonth)) {
    return "inativo";
  }

  const due = new Date(year, month - 1, Math.min(client.due_day, new Date(year, month, 0).getDate()));
  const today = new Date();
  
  if (year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth() + 1)) return "previsto";
  return today > due ? "atrasado" : "pendente";
}

async function paymentMap(userId, year, month) {
  const rows = await query("SELECT * FROM payments WHERE user_id=? AND year=? AND month=?", [userId, year, month]);
  return Object.fromEntries(rows.map(p => [p.client_id, p]));
}
async function clientsFor(userId, activeOnly = false) { return query(`SELECT * FROM clients WHERE user_id=? ${activeOnly ? "AND active=1" : ""} ORDER BY name`, [userId]); }

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {}; if (!name || !email || !password || password.length < 6) return bad(res, 422, "Dados inválidos");
    const normalized = email.toLowerCase(); if (await one("SELECT id FROM users WHERE email=?", [normalized])) return bad(res, 400, "E-mail já cadastrado");
    const id = uuid(); await query("INSERT INTO users (id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)", [id, name, normalized, await bcrypt.hash(password, 10), "user", now()]);
    const access = token(id, normalized, "access", "60m"); setCookies(res, access, token(id, normalized, "refresh", "7d")); res.json({ user: { id, name, email: normalized, role: "user" }, access_token: access });
  } catch (e) { next(e); }
});
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {}; const normalized = String(email || "").toLowerCase();
    const identifier = `${req.ip}:${normalized}`;
    const attempt = await one("SELECT * FROM login_attempts WHERE identifier=?", [identifier]);
    if (attempt?.locked_until && new Date(attempt.locked_until) > now()) return bad(res, 429, "Muitas tentativas. Tente novamente em 15 minutos.");
    const u = await one("SELECT * FROM users WHERE email=?", [normalized]);
    if (!u || !(await bcrypt.compare(password || "", u.password_hash))) {
      await query("INSERT INTO login_attempts (identifier,count) VALUES (?,1) ON DUPLICATE KEY UPDATE count=count+1", [identifier]);
      const updated = await one("SELECT count FROM login_attempts WHERE identifier=?", [identifier]);
      if (updated && updated.count >= 5) await query("UPDATE login_attempts SET count=0,locked_until=? WHERE identifier=?", [new Date(Date.now() + 900000), identifier]);
      return bad(res, 401, "E-mail ou senha incorretos");
    }
    await query("DELETE FROM login_attempts WHERE identifier=?", [identifier]);
    const access = token(u.id, u.email, "access", "60m"); setCookies(res, access, token(u.id, u.email, "refresh", "7d")); res.json({ user: publicUser(u), access_token: access });
  } catch (e) { next(e); }
});
app.post("/api/auth/logout", (req, res) => { res.clearCookie("access_token", { path: "/" }); res.clearCookie("refresh_token", { path: "/" }); res.json({ message: "Sessão encerrada" }); });
app.get("/api/auth/me", auth, (req, res) => res.json(publicUser(req.user)));
app.post("/api/auth/refresh", async (req, res) => {
  try { const p = jwt.verify(req.cookies.refresh_token || "", jwtSecret); if (p.type !== "refresh") throw Error(); const u = await one("SELECT * FROM users WHERE id=?", [p.sub]); if (!u) return bad(res, 401, "Usuário não encontrado"); const access = token(u.id, u.email, "access", "60m"); setCookies(res, access); res.json({ access_token: access }); } catch (_) { bad(res, 401, "Refresh token inválido"); }
});
app.post("/api/auth/forgot-password", async (req, res, next) => { try { const u = await one("SELECT id FROM users WHERE email=?", [String(req.body?.email || "").toLowerCase()]); if (u) { const t = require("crypto").randomBytes(24).toString("base64url"); await query("INSERT INTO password_reset_tokens(token,user_id,used,expires_at) VALUES (?,?,0,?)", [t, u.id, new Date(Date.now() + 3600000)]); console.log(`Reset link: /reset-password?token=${t}`); } res.json({ message: "Se o e-mail existir, um link de redefinição foi gerado." }); } catch (e) { next(e); } });
app.post("/api/auth/reset-password", async (req, res, next) => { try { const { token: t, password } = req.body || {}; if (!password || password.length < 6) return bad(res, 400, "Senha deve ter ao menos 6 caracteres"); const r = await one("SELECT * FROM password_reset_tokens WHERE token=? AND used=0 AND expires_at>NOW()", [t]); if (!r) return bad(res, 400, "Token inválido ou expirado"); await query("UPDATE users SET password_hash=? WHERE id=?", [await bcrypt.hash(password, 10), r.user_id]); await query("UPDATE password_reset_tokens SET used=1 WHERE token=?", [t]); res.json({ message: "Senha redefinida com sucesso" }); } catch (e) { next(e); } });

// ====== ROTAS CORRIGIDAS COM FILTRO ======
app.get("/api/clients", auth, async (req, res, next) => { 
  try { 
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const map = await paymentMap(req.user.id, year, month); 
    let rows = await clientsFor(req.user.id); 
    
    if (req.query.search) rows = rows.filter(c => c.name.toLowerCase().includes(String(req.query.search).toLowerCase())); 
    if (req.query.due_day) rows = rows.filter(c => c.due_day === Number(req.query.due_day)); 
    
    res.json(rows.map(c => {
      const s = status(c, year, month, !!map[c.id]);
      return { id: c.id, name: c.name, monthly_value: Number(c.monthly_value), due_day: c.due_day, phone: c.phone, email: c.email, notes: c.notes, active: !!c.active, status: s, paid_at: map[c.id]?.paid_at?.toISOString?.() || null, paid_amount: map[c.id] ? Number(map[c.id].amount) : null };
    }).filter(c => c.status !== "inativo" && (!req.query.status || c.status === req.query.status))); 
  } catch (e) { next(e); } 
});

app.post("/api/clients", auth, async (req, res, next) => { try { if (!validClient(req.body)) return bad(res, 422, "Dados inválidos"); const id = uuid(), b = req.body; await query("INSERT INTO clients (id,user_id,name,monthly_value,due_day,phone,email,notes,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [id, req.user.id, b.name, b.monthly_value, b.due_day, b.phone || null, b.email || null, b.notes || null, b.active === false ? 0 : 1, now()]); res.json({ id }); } catch (e) { next(e); } });
app.put("/api/clients/:id", auth, async (req, res, next) => { try { if (!validClient(req.body)) return bad(res, 422, "Dados inválidos"); const b = req.body; const r = await query("UPDATE clients SET name=?,monthly_value=?,due_day=?,phone=?,email=?,notes=?,active=? WHERE id=? AND user_id=?", [b.name, b.monthly_value, b.due_day, b.phone || null, b.email || null, b.notes || null, b.active === false ? 0 : 1, req.params.id, req.user.id]); if (!r.affectedRows) return bad(res, 404, "Cliente não encontrado"); res.json({ message: "Cliente atualizado" }); } catch (e) { next(e); } });
app.delete("/api/clients/:id", auth, async (req, res, next) => { try { const r = await query("DELETE FROM clients WHERE id=? AND user_id=?", [req.params.id, req.user.id]); await query("DELETE FROM payments WHERE client_id=? AND user_id=?", [req.params.id, req.user.id]); if (!r.affectedRows) return bad(res, 404, "Cliente não encontrado"); res.json({ message: "Cliente excluído" }); } catch (e) { next(e); } });
app.post("/api/clients/:id/payment", auth, async (req, res, next) => { try { const { year, month } = req.body || {}, c = await one("SELECT * FROM clients WHERE id=? AND user_id=?", [req.params.id, req.user.id]); if (!c) return bad(res, 404, "Cliente não encontrado"); const p = await one("SELECT id FROM payments WHERE client_id=? AND user_id=? AND year=? AND month=?", [req.params.id, req.user.id, year, month]); if (p) { await query("DELETE FROM payments WHERE id=?", [p.id]); return res.json({ status: "estornado" }); } await query("INSERT INTO payments (id,user_id,client_id,year,month,amount,paid_at) VALUES (?,?,?,?,?,?,?)", [uuid(), req.user.id, req.params.id, year, month, c.monthly_value, now()]); res.json({ status: "pago" }); } catch (e) { next(e); } });
app.get("/api/clients/:id/payments", auth, async (req, res, next) => { try { if (!await one("SELECT id FROM clients WHERE id=? AND user_id=?", [req.params.id, req.user.id])) return bad(res, 404, "Cliente não encontrado"); const rows = await query("SELECT * FROM payments WHERE client_id=? AND user_id=? ORDER BY year DESC, month DESC", [req.params.id, req.user.id]); res.json(rows.map(p => ({ id: p.id, year: p.year, month: p.month, amount: Number(p.amount), paid_at: p.paid_at.toISOString() }))); } catch (e) { next(e); } });

app.get("/api/dashboard", auth, async (req, res, next) => { 
  try { 
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const rows = await clientsFor(req.user.id, true); 
    const map = await paymentMap(req.user.id, year, month); 
    const counts = { pago: 0, pendente: 0, atrasado: 0, previsto: 0 }; 
    let received = 0, pending = 0, overdue = 0; 
    const overdueList = []; 
    
    rows.forEach(c => { 
      const s = status(c, year, month, !!map[c.id]); 
      if (s === "inativo") return; // Ignora o cliente para esse mês!

      counts[s]++; 
      if (map[c.id]) received += Number(map[c.id].amount); 
      else if (s === "atrasado") { 
        overdue += Number(c.monthly_value); 
        overdueList.push({ id: c.id, name: c.name, monthly_value: Number(c.monthly_value), due_day: c.due_day }); 
      } else pending += Number(c.monthly_value); 
    }); 
    
    const active_clients = counts.pago + counts.pendente + counts.atrasado + counts.previsto;
    const punctuality = active_clients ? Math.round(counts.pago / active_clients * 1000) / 10 : 0;
    
    res.json({ received, pending, overdue, active_clients, punctuality, status_counts: counts, overdue_list: overdueList.sort((a, b) => a.due_day - b.due_day) }); 
  } catch (e) { next(e); } 
});

app.get("/api/reports", auth, async (req, res, next) => { 
  try { 
    const y = Number(req.query.year) || new Date().getFullYear();
    const m = Number(req.query.month) || new Date().getMonth() + 1;
    const rows = await clientsFor(req.user.id, true); 
    
    const ps = await query("SELECT year,month,SUM(amount) amount FROM payments WHERE user_id=? GROUP BY year,month", [req.user.id]);
    const map = Object.fromEntries(ps.map(p => [`${p.year}-${p.month}`, Number(p.amount)])); 
    
    const monthly = [], forecast = []; 
    for (let d = -5; d <= 0; d++) { 
      const [yy, mm] = monthShift(y, m, d), received = map[`${yy}-${mm}`] || 0; 
      let monthExpected = 0;
      rows.forEach(c => { if (status(c, yy, mm, false) !== "inativo") monthExpected += Number(c.monthly_value); });
      monthly.push({ year: yy, month: mm, received, pending: Math.max(monthExpected - received, 0) }); 
    } 
    for (let d = 1; d <= 6; d++) { 
      const [yy, mm] = monthShift(y, m, d); 
      let monthExpected = 0;
      rows.forEach(c => { if (status(c, yy, mm, false) !== "inativo") monthExpected += Number(c.monthly_value); });
      forecast.push({ year: yy, month: mm, expected: monthExpected }); 
    } 
    
    let currentExpected = 0;
    rows.forEach(c => { if (status(c, y, m, false) !== "inativo") currentExpected += Number(c.monthly_value); });

    res.json({ monthly, forecast, expected: currentExpected }); 
  } catch (e) { next(e); } 
});

app.get("/api/reports/export", auth, async (req, res, next) => { 
  try { 
    const y = Number(req.query.year) || new Date().getFullYear();
    const m = Number(req.query.month) || new Date().getMonth() + 1;
    const rows = await clientsFor(req.user.id); 
    const map = await paymentMap(req.user.id, y, m); 
    const labels = { pago: "Pago", pendente: "Pendente", atrasado: "Em atraso", previsto: "A vencer", inativo: "Inativo" }; 
    let csv = "Cliente;Valor Mensalidade (R$);Dia Vencimento;Status;Data Pagamento;Telefone;E-mail\n"; 
    
    rows.forEach(c => { 
      const p = map[c.id], s = status(c, y, m, !!p); 
      if (s === "inativo") return; // Não exporta clientes que ainda não eram clientes neste mês
      const date = p ? new Date(p.paid_at).toLocaleString("pt-BR", { timeZone: "UTC" }) : ""; 
      csv += [c.name, Number(c.monthly_value).toFixed(2).replace(".", ","), c.due_day, labels[s], date, c.phone || "", c.email || ""].map(v => `"${String(v).replace(/"/g, '""')}"`).join(";") + "\n"; 
    }); 
    res.type("text/csv").attachment(`mensalidades_${y}_${String(m).padStart(2, "0")}.csv`).send(csv); 
  } catch (e) { next(e); } 
});

async function init() {
  await query("CREATE TABLE IF NOT EXISTS users (id VARCHAR(36) PRIMARY KEY,name VARCHAR(120) NOT NULL,email VARCHAR(320) NOT NULL UNIQUE,password_hash VARCHAR(255) NOT NULL,role VARCHAR(30) NOT NULL DEFAULT 'user',created_at DATETIME NOT NULL)");
  await query("CREATE TABLE IF NOT EXISTS login_attempts (identifier VARCHAR(400) PRIMARY KEY,count INT NOT NULL DEFAULT 0,locked_until DATETIME NULL)");
  await query("CREATE TABLE IF NOT EXISTS password_reset_tokens (token VARCHAR(255) PRIMARY KEY,user_id VARCHAR(36) NOT NULL,used BOOLEAN NOT NULL DEFAULT 0,expires_at DATETIME NOT NULL)");
  await query("CREATE TABLE IF NOT EXISTS clients (id VARCHAR(36) PRIMARY KEY,user_id VARCHAR(36) NOT NULL,name VARCHAR(160) NOT NULL,monthly_value DECIMAL(12,2) NOT NULL,due_day INT NOT NULL,phone VARCHAR(50),email VARCHAR(320),notes VARCHAR(1000),active BOOLEAN NOT NULL DEFAULT 1,created_at DATETIME NOT NULL)");
  await query("CREATE TABLE IF NOT EXISTS payments (id VARCHAR(36) PRIMARY KEY,user_id VARCHAR(36) NOT NULL,client_id VARCHAR(36) NOT NULL,year INT NOT NULL,month INT NOT NULL,amount DECIMAL(12,2) NOT NULL,paid_at DATETIME NOT NULL,UNIQUE KEY uq_payment_client_month (client_id,year,month))");
  const email = (process.env.ADMIN_EMAIL || "gmssaldanham@gmail.com").toLowerCase(), password = process.env.ADMIN_PASSWORD || "Mensali@2026"; const u = await one("SELECT * FROM users WHERE email=?", [email]); if (!u) await query("INSERT INTO users VALUES (?,?,?,?,?,?)", [uuid(), "Administrador", email, await bcrypt.hash(password, 10), "admin", now()]);
}
app.use((err, req, res, next) => { console.error(err); if (!res.headersSent) res.status(500).json({ detail: "Erro interno do servidor" }); });
if (require.main === module) init().then(() => app.listen(port, () => console.log(`Backend listening on ${port}`))).catch(e => { console.error("Database initialization failed", e); process.exit(1); });
module.exports = { app, init, pool };