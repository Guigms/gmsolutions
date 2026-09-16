import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import csv
import io
import logging
import secrets
from calendar import monthrange
from datetime import datetime, timezone, timedelta, date
from typing import Annotated, List, Optional

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field, BeforeValidator, EmailStr
from starlette.middleware.cors import CORSMiddleware

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
PyObjectId = Annotated[str, BeforeValidator(str)]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ---------- Base document ----------
class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)
    id: PyObjectId = Field(alias="_id")

    def to_mongo(self) -> dict:
        return self.model_dump(by_alias=True, exclude={"id"})

    @classmethod
    def from_mongo(cls, doc: dict):
        return cls(**doc)


class ClientDoc(BaseDocument):
    user_id: str
    name: str
    monthly_value: float
    due_day: int
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True
    created_at: datetime


class PaymentDoc(BaseDocument):
    user_id: str
    client_id: str
    year: int
    month: int
    amount: float
    paid_at: datetime


# ---------- Auth helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=60), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie("access_token", access_token, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Tipo de token inválido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


def public_user(user: dict) -> dict:
    return {"id": str(user["_id"]), "name": user.get("name", ""), "email": user["email"], "role": user.get("role", "user")}


# ---------- Auth models ----------
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


# ---------- Auth routes ----------
@api_router.post("/auth/register")
async def register(data: RegisterInput, response: Response):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    doc = {"name": data.name, "email": email, "password_hash": hash_password(data.password),
           "role": "user", "created_at": datetime.now(timezone.utc)}
    result = await db.users.insert_one(doc)
    access = create_access_token(str(result.inserted_id), email)
    refresh = create_refresh_token(str(result.inserted_id))
    set_auth_cookies(response, access, refresh)
    doc["_id"] = str(result.inserted_id)
    return {"user": public_user(doc), "access_token": access}


@api_router.post("/auth/login")
async def login(data: LoginInput, request: Request, response: Response):
    email = data.email.lower()
    identifier = f"{request.client.host}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("locked_until") and attempt["locked_until"] > datetime.now(timezone.utc):
        raise HTTPException(status_code=429, detail="Muitas tentativas. Tente novamente em 15 minutos.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$setOnInsert": {"identifier": identifier}},
            upsert=True,
        )
        updated = await db.login_attempts.find_one({"identifier": identifier})
        if updated.get("count", 0) >= 5:
            await db.login_attempts.update_one(
                {"identifier": identifier},
                {"$set": {"locked_until": datetime.now(timezone.utc) + timedelta(minutes=15), "count": 0}},
            )
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    await db.login_attempts.delete_one({"identifier": identifier})
    uid = str(user["_id"])
    access = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(user), "access_token": access}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Sessão encerrada"}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Sem refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Tipo de token inválido")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Refresh token inválido")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    access = create_access_token(str(user["_id"]), user["email"])
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    return {"access_token": access}


@api_router.post("/auth/forgot-password")
async def forgot_password(data: dict):
    email = (data.get("email") or "").lower()
    user = await db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token, "user_id": str(user["_id"]), "used": False,
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        })
        logger.info(f"Reset link para {email}: /reset-password?token={token}")
    return {"message": "Se o e-mail existir, um link de redefinição foi gerado."}


@api_router.post("/auth/reset-password")
async def reset_password(data: dict):
    token = data.get("token", "")
    new_password = data.get("password", "")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter ao menos 6 caracteres")
    record = await db.password_reset_tokens.find_one({"token": token})
    if not record or record.get("used") or record["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token inválido ou expirado")
    await db.users.update_one({"_id": ObjectId(record["user_id"])}, {"$set": {"password_hash": hash_password(new_password)}})
    await db.password_reset_tokens.update_one({"token": token}, {"$set": {"used": True}})
    return {"message": "Senha redefinida com sucesso"}


# ---------- Client models ----------
class ClientInput(BaseModel):
    name: str = Field(min_length=1)
    monthly_value: float = Field(gt=0)
    due_day: int = Field(ge=1, le=31)
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True


def compute_status(client_doc: dict, year: int, month: int, paid: bool, today: date) -> str:
    if paid:
        return "pago"
    last_day = monthrange(year, month)[1]
    due = date(year, month, min(int(client_doc["due_day"]), last_day))
    if (year, month) > (today.year, today.month):
        return "previsto"
    return "atrasado" if today > due else "pendente"


async def get_payment_map(user_id: str, year: int, month: int) -> dict:
    payments = await db.payments.find({"user_id": user_id, "year": year, "month": month}).to_list(5000)
    return {p["client_id"]: p for p in payments}


# ---------- Client routes ----------
@api_router.get("/clients")
async def list_clients(year: int, month: int, search: Optional[str] = None, status: Optional[str] = None,
                       due_day: Optional[int] = None, user: dict = Depends(get_current_user)):
    query = {"user_id": user["_id"]}
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    if due_day:
        query["due_day"] = due_day
    docs = await db.clients.find(query).sort("name", 1).to_list(5000)
    payment_map = await get_payment_map(user["_id"], year, month)
    today = datetime.now(timezone.utc).date()
    result = []
    for d in docs:
        cid = str(d["_id"])
        payment = payment_map.get(cid)
        st = compute_status(d, year, month, payment is not None, today)
        if status and st != status:
            continue
        result.append({
            "id": cid, "name": d["name"], "monthly_value": d["monthly_value"], "due_day": d["due_day"],
            "phone": d.get("phone"), "email": d.get("email"), "notes": d.get("notes"),
            "active": d.get("active", True), "status": st,
            "paid_at": payment["paid_at"].isoformat() if payment else None,
            "paid_amount": payment["amount"] if payment else None,
        })
    return result


@api_router.post("/clients")
async def create_client(data: ClientInput, user: dict = Depends(get_current_user)):
    doc = ClientDoc(_id=ObjectId(), user_id=user["_id"], created_at=datetime.now(timezone.utc), **data.model_dump())
    await db.clients.insert_one(doc.to_mongo() | {"_id": ObjectId(doc.id)})
    return {"id": doc.id}


@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, data: ClientInput, user: dict = Depends(get_current_user)):
    result = await db.clients.update_one(
        {"_id": ObjectId(client_id), "user_id": user["_id"]}, {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return {"message": "Cliente atualizado"}


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(get_current_user)):
    result = await db.clients.delete_one({"_id": ObjectId(client_id), "user_id": user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    await db.payments.delete_many({"client_id": client_id, "user_id": user["_id"]})
    return {"message": "Cliente excluído"}


@api_router.post("/clients/{client_id}/payment")
async def toggle_payment(client_id: str, data: dict, user: dict = Depends(get_current_user)):
    year, month = int(data["year"]), int(data["month"])
    client_doc = await db.clients.find_one({"_id": ObjectId(client_id), "user_id": user["_id"]})
    if not client_doc:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    existing = await db.payments.find_one({"client_id": client_id, "user_id": user["_id"], "year": year, "month": month})
    if existing:
        await db.payments.delete_one({"_id": existing["_id"]})
        return {"status": "estornado"}
    payment = PaymentDoc(_id=ObjectId(), user_id=user["_id"], client_id=client_id, year=year, month=month,
                         amount=float(client_doc["monthly_value"]), paid_at=datetime.now(timezone.utc))
    await db.payments.insert_one(payment.to_mongo() | {"_id": ObjectId(payment.id)})
    return {"status": "pago"}


@api_router.get("/clients/{client_id}/payments")
async def client_payments(client_id: str, user: dict = Depends(get_current_user)):
    client_doc = await db.clients.find_one({"_id": ObjectId(client_id), "user_id": user["_id"]})
    if not client_doc:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    payments = await db.payments.find({"client_id": client_id, "user_id": user["_id"]}).sort([("year", -1), ("month", -1)]).to_list(1000)
    return [{
        "id": str(p["_id"]), "year": p["year"], "month": p["month"],
        "amount": p["amount"], "paid_at": p["paid_at"].isoformat(),
    } for p in payments]


# ---------- Dashboard / Reports ----------
def shift_month(year: int, month: int, delta: int):
    total = year * 12 + (month - 1) + delta
    return total // 12, total % 12 + 1


@api_router.get("/dashboard")
async def dashboard(year: int, month: int, user: dict = Depends(get_current_user)):
    clients = await db.clients.find({"user_id": user["_id"], "active": True}).to_list(5000)
    payment_map = await get_payment_map(user["_id"], year, month)
    today = datetime.now(timezone.utc).date()
    received = pendente = atrasado_valor = 0.0
    counts = {"pago": 0, "pendente": 0, "atrasado": 0, "previsto": 0}
    overdue_list = []
    for c in clients:
        cid = str(c["_id"])
        payment = payment_map.get(cid)
        st = compute_status(c, year, month, payment is not None, today)
        counts[st] += 1
        if payment:
            received += payment["amount"]
        elif st == "atrasado":
            atrasado_valor += c["monthly_value"]
            overdue_list.append({"id": cid, "name": c["name"], "monthly_value": c["monthly_value"], "due_day": c["due_day"]})
        else:
            pendente += c["monthly_value"]
    total = len(clients)
    punctuality = round((counts["pago"] / total) * 100, 1) if total else 0.0
    return {
        "received": received, "pending": pendente, "overdue": atrasado_valor,
        "active_clients": total, "punctuality": punctuality, "status_counts": counts,
        "overdue_list": sorted(overdue_list, key=lambda x: x["due_day"]),
    }


@api_router.get("/reports")
async def reports(year: int, month: int, user: dict = Depends(get_current_user)):
    clients = await db.clients.find({"user_id": user["_id"], "active": True}).to_list(5000)
    expected = sum(c["monthly_value"] for c in clients)
    all_payments = await db.payments.find({"user_id": user["_id"]}).to_list(50000)
    by_month = {}
    for p in all_payments:
        by_month[(p["year"], p["month"])] = by_month.get((p["year"], p["month"]), 0.0) + p["amount"]
    monthly = []
    for delta in range(-5, 1):
        y, m = shift_month(year, month, delta)
        rec = by_month.get((y, m), 0.0)
        monthly.append({"year": y, "month": m, "received": rec, "pending": max(expected - rec, 0.0)})
    forecast = []
    for delta in range(1, 7):
        y, m = shift_month(year, month, delta)
        forecast.append({"year": y, "month": m, "expected": expected})
    return {"monthly": monthly, "forecast": forecast, "expected": expected}


@api_router.get("/reports/export")
async def export_csv(year: int, month: int, user: dict = Depends(get_current_user)):
    clients = await db.clients.find({"user_id": user["_id"]}).sort("name", 1).to_list(5000)
    payment_map = await get_payment_map(user["_id"], year, month)
    today = datetime.now(timezone.utc).date()
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["Cliente", "Valor Mensalidade (R$)", "Dia Vencimento", "Status", "Data Pagamento", "Telefone", "E-mail"])
    labels = {"pago": "Pago", "pendente": "Pendente", "atrasado": "Em atraso", "previsto": "A vencer"}
    for c in clients:
        cid = str(c["_id"])
        payment = payment_map.get(cid)
        st = compute_status(c, year, month, payment is not None, today)
        writer.writerow([
            c["name"], f"{c['monthly_value']:.2f}".replace(".", ","), c["due_day"], labels[st],
            payment["paid_at"].strftime("%d/%m/%Y %H:%M") if payment else "",
            c.get("phone") or "", c.get("email") or "",
        ])
    buffer.seek(0)
    filename = f"mensalidades_{year}_{month:02d}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


app.include_router(api_router)

frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def seed_admin():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "name": "Administrador", "email": admin_email, "password_hash": hash_password(admin_password),
            "role": "admin", "created_at": datetime.now(timezone.utc),
        })
        logger.info(f"Admin criado: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
        logger.info(f"Senha do admin atualizada: {admin_email}")


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    await db.clients.create_index([("user_id", 1), ("name", 1)])
    await db.payments.create_index([("client_id", 1), ("year", 1), ("month", 1)], unique=True)
    await seed_admin()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
