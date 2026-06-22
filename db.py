"""Capa de acceso a datos (PostgreSQL vía SQLAlchemy + psycopg)."""
import os
import threading
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

_engine = None
_engine_lock = threading.Lock()


def normalize_db_url(raw: str) -> str:
    """Normaliza la URL al dialecto postgresql+psycopg://."""
    if not raw:
        raise ValueError(
            "DATABASE_URL no está definida. Crea un .env con "
            "DATABASE_URL=postgresql+psycopg://usuario:password@host:5432/db"
        )
    if raw.startswith("postgresql+psycopg://"):
        return raw
    if raw.startswith("postgresql://"):
        return "postgresql+psycopg://" + raw[len("postgresql://"):]
    if raw.startswith("postgres://"):
        return "postgresql+psycopg://" + raw[len("postgres://"):]
    return raw


def get_engine():
    """Devuelve un engine singleton (lazy, thread-safe)."""
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                url = normalize_db_url(os.environ.get("DATABASE_URL", ""))
                _engine = create_engine(url, pool_pre_ping=True, future=True)
    return _engine


def read_df(sql: str, params: dict | None = None) -> pd.DataFrame:
    return pd.read_sql_query(text(sql), get_engine(), params=params or {})


def execute(sql: str, params: dict | None = None) -> None:
    with get_engine().begin() as conn:
        conn.execute(text(sql), params or {})


def execute_returning(sql: str, params: dict | None = None):
    with get_engine().begin() as conn:
        row = conn.execute(text(sql), params or {}).first()
    return row[0] if row is not None else None


def fetchone(sql: str, params: dict | None = None):
    with get_engine().connect() as conn:
        row = conn.execute(text(sql), params or {}).first()
    return tuple(row) if row is not None else None


def fetchall(sql: str, params: dict | None = None):
    with get_engine().connect() as conn:
        rows = conn.execute(text(sql), params or {}).all()
    return [tuple(r) for r in rows]


def build_pregunta_update(materia, contenido, nivel, pregunta, a, b, c, d, e,
                          correcta, explicacion, compartida, pregunta_id,
                          user_id, imagenes: dict):
    """Construye (sql, params) del UPDATE de una pregunta.

    `imagenes` es un dict {nombre_columna: valor}; sólo se incluyen las
    columnas cuyo valor no sea None. Las columnas A–E e imagen_* van
    entre comillas dobles para preservar el case en Postgres.
    """
    sets = [
        "materia=:materia", "contenido=:contenido", "nivel=:nivel",
        "pregunta=:pregunta", '"A"=:a', '"B"=:b', '"C"=:c', '"D"=:d',
        '"E"=:e', "correcta=:correcta", "explicacion=:explicacion",
        "compartida=:compartida",
    ]
    params = {
        "materia": materia, "contenido": contenido, "nivel": nivel,
        "pregunta": pregunta, "a": a, "b": b, "c": c, "d": d, "e": e,
        "correcta": correcta, "explicacion": explicacion,
        "compartida": int(compartida), "pid": pregunta_id, "uid": user_id,
    }
    for col, val in imagenes.items():
        if val is not None:
            sets.append(f'"{col}"=:{col}')
            params[col] = val
    sql = ("UPDATE preguntas SET " + ", ".join(sets) +
           " WHERE id=:pid AND user_id=:uid")
    return sql, params


def init_db() -> None:
    """Crea las tablas (idempotente) en sintaxis PostgreSQL."""
    ddl = [
        """
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nombre TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS preguntas (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            asignatura TEXT NOT NULL,
            materia TEXT,
            contenido TEXT,
            nivel TEXT,
            pregunta TEXT NOT NULL,
            "A" TEXT, "B" TEXT, "C" TEXT, "D" TEXT, "E" TEXT,
            correcta TEXT,
            explicacion TEXT,
            compartida INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES usuarios(id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS textos (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            asignatura TEXT NOT NULL,
            titulo TEXT NOT NULL,
            contenido TEXT NOT NULL,
            compartida INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES usuarios(id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS colaboraciones (
            from_user_id INTEGER NOT NULL,
            to_user_id INTEGER NOT NULL,
            PRIMARY KEY (from_user_id, to_user_id),
            FOREIGN KEY (from_user_id) REFERENCES usuarios(id),
            FOREIGN KEY (to_user_id) REFERENCES usuarios(id)
        )
        """,
    ]
    migraciones = [
        'ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS nivel TEXT',
        'ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS "imagen_pregunta" TEXT',
        'ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS "imagen_A" TEXT',
        'ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS "imagen_B" TEXT',
        'ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS "imagen_C" TEXT',
        'ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS "imagen_D" TEXT',
        'ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS "imagen_E" TEXT',
        "ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'seleccion_multiple'",
        'ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS texto_id INTEGER',
    ]
    with get_engine().begin() as conn:
        for stmt in ddl:
            conn.execute(text(stmt))
        for stmt in migraciones:
            conn.execute(text(stmt))
