"""Backend tests for MensaliPay."""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://payment-reports-5.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "gmssaldanham@gmail.com"
ADMIN_PASSWORD = "Mensali@2026"

NOW = datetime.now(timezone.utc)
YEAR, MONTH = NOW.year, NOW.month


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token")
    assert token, "No access_token in login response"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ---------- Auth ----------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data and "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong-xxxx"})
        assert r.status_code == 401
        assert "detail" in r.json()

    def test_register_and_me(self):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={"name": "Test", "email": email, "password": "abcdef1"})
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["email"] == email

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={"name": "Admin", "email": ADMIN_EMAIL, "password": "abcdef1"})
        assert r.status_code == 400

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------- Clients CRUD ----------
class TestClients:
    def test_list_clients(self, admin_session):
        r = admin_session.get(f"{API}/clients", params={"year": YEAR, "month": MONTH})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_client_crud_and_payment_toggle(self, admin_session):
        # create
        payload = {"name": "TEST_Cliente", "monthly_value": 123.45, "due_day": 15}
        r = admin_session.post(f"{API}/clients", json=payload)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        # verify in list
        r = admin_session.get(f"{API}/clients", params={"year": YEAR, "month": MONTH})
        assert any(c["id"] == cid and c["name"] == "TEST_Cliente" for c in r.json())

        # toggle payment -> pago
        r = admin_session.post(f"{API}/clients/{cid}/payment", json={"year": YEAR, "month": MONTH})
        assert r.status_code == 200
        assert r.json()["status"] == "pago"

        # verify status changed
        r = admin_session.get(f"{API}/clients", params={"year": YEAR, "month": MONTH})
        client = next(c for c in r.json() if c["id"] == cid)
        assert client["status"] == "pago"

        # payments history
        r = admin_session.get(f"{API}/clients/{cid}/payments")
        assert r.status_code == 200
        assert len(r.json()) == 1

        # toggle again -> estornado
        r = admin_session.post(f"{API}/clients/{cid}/payment", json={"year": YEAR, "month": MONTH})
        assert r.json()["status"] == "estornado"

        # update
        r = admin_session.put(f"{API}/clients/{cid}", json={"name": "TEST_Cliente2", "monthly_value": 200.0, "due_day": 20})
        assert r.status_code == 200

        # verify update
        r = admin_session.get(f"{API}/clients", params={"year": YEAR, "month": MONTH})
        client = next(c for c in r.json() if c["id"] == cid)
        assert client["name"] == "TEST_Cliente2"
        assert client["monthly_value"] == 200.0
        assert client["due_day"] == 20

        # delete
        r = admin_session.delete(f"{API}/clients/{cid}")
        assert r.status_code == 200

        # verify deletion
        r = admin_session.get(f"{API}/clients", params={"year": YEAR, "month": MONTH})
        assert not any(c["id"] == cid for c in r.json())

    def test_create_client_validation(self, admin_session):
        r = admin_session.post(f"{API}/clients", json={"name": "", "monthly_value": -10, "due_day": 40})
        assert r.status_code == 422

    def test_clients_unauthenticated(self):
        r = requests.get(f"{API}/clients", params={"year": YEAR, "month": MONTH})
        assert r.status_code == 401


# ---------- Dashboard / Reports ----------
class TestDashboardReports:
    def test_dashboard(self, admin_session):
        r = admin_session.get(f"{API}/dashboard", params={"year": YEAR, "month": MONTH})
        assert r.status_code == 200
        data = r.json()
        for k in ["received", "pending", "overdue", "active_clients", "status_counts", "overdue_list"]:
            assert k in data

    def test_reports(self, admin_session):
        r = admin_session.get(f"{API}/reports", params={"year": YEAR, "month": MONTH})
        assert r.status_code == 200
        data = r.json()
        assert "monthly" in data and "forecast" in data and "expected" in data
        assert len(data["monthly"]) == 6
        assert len(data["forecast"]) == 6

    def test_export_csv(self, admin_session):
        r = admin_session.get(f"{API}/reports/export", params={"year": YEAR, "month": MONTH})
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "Cliente" in r.text
