import os
import pytest
import db


# ── normalize_db_url (puro) ──────────────────────────────
def test_normalize_postgres_scheme():
    assert db.normalize_db_url("postgres://u:p@h:5432/x") == \
        "postgresql+psycopg://u:p@h:5432/x"

def test_normalize_postgresql_scheme():
    assert db.normalize_db_url("postgresql://u:p@h:5432/x") == \
        "postgresql+psycopg://u:p@h:5432/x"

def test_normalize_already_psycopg():
    url = "postgresql+psycopg://u:p@h:5432/x"
    assert db.normalize_db_url(url) == url

def test_normalize_empty_raises():
    with pytest.raises(ValueError):
        db.normalize_db_url("")


# ── build_pregunta_update (puro) ─────────────────────────
def test_build_update_sin_imagenes():
    sql, params = db.build_pregunta_update(
        "Mat", "Cont", "N1", "Preg?", "a", "b", "c", "d", "e",
        "A", "Expl", 1, 10, 20, imagenes={},
    )
    assert sql.startswith("UPDATE preguntas SET ")
    assert '"A"=:a' in sql and '"E"=:e' in sql
    assert "WHERE id=:pid AND user_id=:uid" in sql
    assert "imagen" not in sql            # ninguna imagen provista
    assert params["compartida"] == 1
    assert params["pid"] == 10 and params["uid"] == 20

def test_build_update_con_una_imagen():
    sql, params = db.build_pregunta_update(
        "Mat", "Cont", "N1", "Preg?", "a", "b", "c", "d", "e",
        "A", "Expl", 0, 10, 20,
        imagenes={"imagen_pregunta": "x.png", "imagen_A": None},
    )
    assert '"imagen_pregunta"=:imagen_pregunta' in sql
    assert "imagen_A" not in sql          # valor None se omite
    assert params["imagen_pregunta"] == "x.png"


# ── Integración (requiere DATABASE_URL) ──────────────────
needs_db = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL no definida; se omite test de integración",
)

@needs_db
def test_init_db_y_roundtrip():
    db.init_db()
    email = "pytest_roundtrip@example.com"
    db.execute("DELETE FROM usuarios WHERE email=:e", {"e": email})
    new_id = db.execute_returning(
        "INSERT INTO usuarios (nombre, email, password_hash) "
        "VALUES (:n, :e, :h) RETURNING id",
        {"n": "Test", "e": email, "h": "x"},
    )
    assert isinstance(new_id, int)
    row = db.fetchone(
        "SELECT id, nombre FROM usuarios WHERE email=:e", {"e": email})
    assert row == (new_id, "Test")
    df = db.read_df(
        "SELECT * FROM usuarios WHERE email=:e", {"e": email})
    assert len(df) == 1
    db.execute("DELETE FROM usuarios WHERE email=:e", {"e": email})
