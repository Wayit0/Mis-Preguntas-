# Migración SQLite → PostgreSQL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que toda la app de Streamlit funcione con PostgreSQL en lugar de SQLite, sin cambiar la UI ni la lógica de negocio.

**Architecture:** Toda la conexión a BD se centraliza en un módulo nuevo `db.py` (engine SQLAlchemy + `psycopg` v3, helpers con parámetros nombrados `:param`). `app.py` deja de usar `sqlite3` y pasa a llamar a esos helpers. La configuración se lee de `DATABASE_URL` (vía `.env`/variable de entorno). Se incluye un script reutilizable para volcar un `banco.db` a Postgres.

**Tech Stack:** Python 3.12, Streamlit, pandas 3.0, SQLAlchemy 2.x, psycopg 3 (`psycopg[binary]`), python-dotenv.

## Global Constraints

- Python 3.12 (no cambiar `runtime.txt` / `.python-version`).
- Driver: `psycopg` (v3) a través de SQLAlchemy; dialecto `postgresql+psycopg://`.
- Paramstyle uniforme: parámetros **nombrados** `:param` en todo el código (NO `?` ni `%s`).
- Columnas con mayúsculas (`A`,`B`,`C`,`D`,`E`,`imagen_A`,`imagen_B`,`imagen_C`,`imagen_D`,`imagen_E`) **siempre entre comillas dobles** en DDL/INSERT/UPDATE para preservar el case en Postgres. El resto de columnas van en minúscula sin comillas.
- No tocar `uploads/` (almacenamiento de imágenes en disco) — fuera de alcance.
- `.env` NO se commitea (ya está en `.gitignore`).
- No introducir dependencia de Streamlit dentro de `db.py` (debe servir también a scripts/tests).

---

## File Structure

- **Create `db.py`** — capa de acceso a datos: normalización de `DATABASE_URL`, engine cacheado (singleton de módulo), helpers (`read_df`, `execute`, `execute_returning`, `fetchone`, `fetchall`), `init_db()` (esquema Postgres), y `build_pregunta_update()` (constructor puro del UPDATE dinámico).
- **Modify `app.py`** — quitar `import sqlite3`, `DB`, `get_conn()`, `init_db()`; importar helpers de `db.py`; reescribir ~26 call sites.
- **Create `scripts/migrate_sqlite_to_postgres.py`** — script one-off para migrar datos de un `banco.db` a Postgres.
- **Create `tests/test_db.py`** — tests unitarios (sin BD) e integración (con `DATABASE_URL`).
- **Create `tests/test_migrate.py`** — test del script de migración (con `DATABASE_URL`).
- **Modify `requirements.txt`** — añadir `SQLAlchemy`, `psycopg[binary]`, `python-dotenv`.
- **Create `.env.example`** — plantilla de `DATABASE_URL`.

---

## Task 1: Dependencias y plantilla de configuración

**Files:**
- Modify: `requirements.txt`
- Create: `.env.example`

**Interfaces:**
- Produces: dependencias `sqlalchemy`, `psycopg`, `python-dotenv` disponibles; archivo `.env.example` documentando `DATABASE_URL`.

- [ ] **Step 1: Reemplazar `requirements.txt`**

Contenido completo del archivo:

```text
streamlit
pandas
anthropic
PyMuPDF
python-docx
reportlab
matplotlib
SQLAlchemy
psycopg[binary]
python-dotenv
```

- [ ] **Step 2: Crear `.env.example`**

```text
# Conexión a PostgreSQL usada por la app y los scripts.
# Formato SQLAlchemy + psycopg (v3):
DATABASE_URL=postgresql+psycopg://usuario:password@host:5432/nombre_db

# También se aceptan estos formatos (se normalizan automáticamente a psycopg):
#   postgres://usuario:password@host:5432/nombre_db
#   postgresql://usuario:password@host:5432/nombre_db
```

- [ ] **Step 3: Instalar dependencias en el venv**

Run: `source venv/bin/activate && pip install -r requirements.txt`
Expected: termina con `Successfully installed ... SQLAlchemy ... psycopg ... python-dotenv ...` sin errores.

- [ ] **Step 4: Verificar import del driver**

Run: `source venv/bin/activate && python -c "import sqlalchemy, psycopg, dotenv; print(sqlalchemy.__version__, psycopg.__version__)"`
Expected: imprime las versiones (p. ej. `2.x.x 3.x.x`) sin trazas de error.

- [ ] **Step 5: Commit**

```bash
git add requirements.txt .env.example
git commit -m "build: añade SQLAlchemy/psycopg/python-dotenv y .env.example"
```

---

## Task 2: Módulo `db.py` (engine, helpers, esquema)

**Files:**
- Create: `db.py`
- Create: `tests/test_db.py`

**Interfaces:**
- Consumes: `DATABASE_URL` del entorno/`.env`.
- Produces (lo que `app.py` y los scripts importarán):
  - `init_db() -> None`
  - `read_df(sql: str, params: dict | None = None) -> pandas.DataFrame`
  - `execute(sql: str, params: dict | None = None) -> None`
  - `execute_returning(sql: str, params: dict | None = None)` → escalar (primera columna de la primera fila; típicamente el `id`)
  - `fetchone(sql: str, params: dict | None = None) -> tuple | None`
  - `fetchall(sql: str, params: dict | None = None) -> list[tuple]`
  - `get_engine() -> sqlalchemy.engine.Engine` (singleton lazy de módulo)
  - `normalize_db_url(raw: str) -> str` (puro)
  - `build_pregunta_update(materia, contenido, nivel, pregunta, a, b, c, d, e, correcta, explicacion, compartida, pregunta_id, user_id, imagenes: dict) -> tuple[str, dict]` (puro)

- [ ] **Step 1: Escribir tests unitarios (sin BD)**

Crear `tests/test_db.py`:

```python
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
```

- [ ] **Step 2: Ejecutar tests para verlos fallar**

Run: `source venv/bin/activate && pip install pytest && python -m pytest tests/test_db.py -q`
Expected: FAIL con `ModuleNotFoundError: No module named 'db'` (o `AttributeError`).

- [ ] **Step 3: Crear `db.py`**

```python
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
```

- [ ] **Step 4: Ejecutar tests unitarios (deben pasar)**

Run: `source venv/bin/activate && python -m pytest tests/test_db.py -q -k "normalize or build"`
Expected: PASS (6 tests).

- [ ] **Step 5: Añadir tests de integración (con `DATABASE_URL`)**

Agregar al final de `tests/test_db.py`:

```python
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
```

- [ ] **Step 6: Ejecutar la suite (integración se omite si no hay `DATABASE_URL`)**

Run: `source venv/bin/activate && python -m pytest tests/test_db.py -q`
Expected: PASS los unitarios; el de integración aparece como `skipped` (salvo que `DATABASE_URL` esté definida, en cuyo caso debe PASAR).

- [ ] **Step 7: Commit**

```bash
git add db.py tests/test_db.py
git commit -m "feat: módulo db.py (PostgreSQL vía SQLAlchemy/psycopg) + tests"
```

---

## Task 3: Reescribir la capa de datos en `app.py`

Tras esta tarea, `app.py` no contiene ninguna referencia a `sqlite3`, `get_conn`, `lastrowid`, `PRAGMA` ni placeholders `?` de SQL. La app corre íntegramente contra Postgres.

**Files:**
- Modify: `app.py` (líneas 1–332 sobre todo; más inline en ~1052 y ~1172, renumeradas tras los cambios).

**Interfaces:**
- Consumes: helpers de `db.py` (Task 2).
- Produces: las mismas funciones públicas con la misma firma (`registrar_usuario`, `autenticar`, `guardar_pregunta`, etc.) — el resto de `app.py` no cambia.

- [ ] **Step 1: Reemplazar imports y el bloque de BASE DE DATOS**

En `app.py`, sustituir `import sqlite3` (línea 7) por `from sqlalchemy.exc import IntegrityError` y eliminar el uso de `sqlite3`. Cambiar el bloque desde `DB = "banco.db"` (línea 24) hasta el final de `init_db()` (línea 96) por:

```python
import db
from db import read_df, execute, execute_returning, fetchone, fetchall

# ─────────────────────────────────────────────
# BASE DE DATOS
# ─────────────────────────────────────────────
# El esquema y la conexión viven en db.py (PostgreSQL).
```

Y conservar (líneas 98–100):

```python
os.makedirs("uploads", exist_ok=True)

db.init_db()
```

Quitar el `import sqlite3` de la cabecera. Mantener el resto de imports.

- [ ] **Step 2: Reescribir helpers de AUTH**

Reemplazar `cambiar_password_usuario`, `registrar_usuario`, `autenticar` por:

```python
def cambiar_password_usuario(user_id, password_actual, password_nueva):
    row = fetchone("SELECT password_hash FROM usuarios WHERE id=:id",
                   {"id": user_id})
    if row is None:
        return False, "Usuario no encontrado."
    try:
        if _preparar_password(password_actual) != row[0]:
            return False, "La contraseña actual es incorrecta."
    except Exception:
        return False, "Error al verificar la contraseña actual."
    try:
        hashed = _preparar_password(password_nueva)
        execute("UPDATE usuarios SET password_hash=:h WHERE id=:id",
                {"h": hashed, "id": user_id})
        return True, None
    except Exception as e:
        return False, f"Error al guardar la nueva contraseña: {e}"


def registrar_usuario(nombre, email, password):
    try:
        hashed = _preparar_password(password)
    except Exception as e:
        return False, f"Error al procesar la contraseña: {e}"
    try:
        execute(
            "INSERT INTO usuarios (nombre, email, password_hash) "
            "VALUES (:n, :e, :h)",
            {"n": nombre, "e": email, "h": hashed},
        )
        return True, None
    except IntegrityError:
        return False, "Ya existe una cuenta con ese correo."


def autenticar(email, password):
    row = fetchone(
        "SELECT id, nombre, password_hash FROM usuarios WHERE email=:e",
        {"e": email})
    if row is None:
        return None, "Correo no encontrado."
    uid, nombre, hashed = row
    try:
        coincide = _preparar_password(password) == hashed
    except Exception:
        return None, "Error al verificar la contraseña. Contacta al administrador."
    if coincide:
        return {"id": uid, "nombre": nombre, "email": email}, None
    return None, "Contraseña incorrecta."
```

- [ ] **Step 3: Reescribir helpers de TEXTOS**

Reemplazar `guardar_texto`, `cargar_textos_propios`, `cargar_preguntas_de_texto`, `eliminar_texto`:

```python
def guardar_texto(user_id, asignatura, titulo, contenido, compartida=0):
    return execute_returning(
        "INSERT INTO textos (user_id, asignatura, titulo, contenido, compartida) "
        "VALUES (:uid, :asig, :tit, :cont, :comp) RETURNING id",
        {"uid": user_id, "asig": asignatura, "tit": titulo,
         "cont": contenido, "comp": int(compartida)},
    )


def cargar_textos_propios(user_id, asignatura):
    return read_df(
        "SELECT * FROM textos WHERE user_id=:uid AND asignatura=:asig "
        "ORDER BY created_at DESC",
        {"uid": user_id, "asig": asignatura},
    )


def cargar_preguntas_de_texto(texto_id):
    return read_df(
        "SELECT * FROM preguntas WHERE texto_id=:tid ORDER BY id",
        {"tid": texto_id},
    )


def eliminar_texto(texto_id, user_id):
    execute("UPDATE preguntas SET texto_id=NULL WHERE texto_id=:tid",
            {"tid": texto_id})
    execute("DELETE FROM textos WHERE id=:tid AND user_id=:uid",
            {"tid": texto_id, "uid": user_id})
```

- [ ] **Step 4: Reescribir `guardar_pregunta`**

```python
def guardar_pregunta(user_id, asignatura, materia, contenido, nivel, pregunta, a, b, c, d, e, correcta, explicacion, compartida, img_preg=None, img_a=None, img_b=None, img_c=None, img_d=None, img_e=None, tipo="seleccion_multiple"):
    execute(
        """
        INSERT INTO preguntas
            (user_id, asignatura, materia, contenido, nivel, pregunta,
             "A", "B", "C", "D", "E", correcta, explicacion, compartida,
             "imagen_pregunta", "imagen_A", "imagen_B", "imagen_C",
             "imagen_D", "imagen_E", tipo)
        VALUES
            (:uid, :asig, :mat, :cont, :niv, :preg,
             :a, :b, :c, :d, :e, :correcta, :expl, :comp,
             :img_preg, :img_a, :img_b, :img_c, :img_d, :img_e, :tipo)
        """,
        {"uid": user_id, "asig": asignatura, "mat": materia, "cont": contenido,
         "niv": nivel, "preg": pregunta, "a": a, "b": b, "c": c, "d": d, "e": e,
         "correcta": correcta, "expl": explicacion, "comp": int(compartida),
         "img_preg": img_preg, "img_a": img_a, "img_b": img_b, "img_c": img_c,
         "img_d": img_d, "img_e": img_e, "tipo": tipo},
    )
```

- [ ] **Step 5: Reescribir lecturas de PREGUNTAS (`cargar_preguntas_propias`, `cargar_banco_compartido`)**

```python
def cargar_preguntas_propias(user_id, asignatura):
    return read_df(
        "SELECT * FROM preguntas WHERE user_id=:uid AND asignatura=:asig",
        {"uid": user_id, "asig": asignatura},
    )


def cargar_banco_compartido(asignatura, user_id):
    """Preguntas compartidas: públicas (compartida=2) o de colaboradores (compartida=1)."""
    return read_df(
        """
        SELECT p.*, u.nombre as profesor
        FROM preguntas p
        JOIN usuarios u ON p.user_id = u.id
        WHERE p.asignatura=:asig AND p.user_id != :uid AND (
            p.compartida=2
            OR (p.compartida=1 AND EXISTS (
                SELECT 1 FROM colaboraciones c
                WHERE c.from_user_id=p.user_id AND c.to_user_id=:uid
            ))
        )
        ORDER BY u.nombre, p.id
        """,
        {"asig": asignatura, "uid": user_id},
    )
```

- [ ] **Step 6: Reescribir helpers de COLABORACIONES y USUARIOS**

```python
def cargar_colaboradores(user_id):
    """Colegas a los que he invitado (pueden ver mis preguntas compartidas)."""
    return fetchall(
        """
        SELECT u.id, u.nombre, u.email FROM usuarios u
        JOIN colaboraciones c ON c.to_user_id = u.id
        WHERE c.from_user_id=:uid
        ORDER BY u.nombre
        """,
        {"uid": user_id},
    )


def cargar_quienes_me_invitaron(user_id):
    """Profesores que me han dado acceso a sus preguntas."""
    return fetchall(
        """
        SELECT u.id, u.nombre, u.email FROM usuarios u
        JOIN colaboraciones c ON c.from_user_id = u.id
        WHERE c.to_user_id=:uid
        ORDER BY u.nombre
        """,
        {"uid": user_id},
    )


def agregar_colaborador(from_user_id, to_user_id):
    try:
        execute(
            "INSERT INTO colaboraciones (from_user_id, to_user_id) "
            "VALUES (:f, :t)",
            {"f": from_user_id, "t": to_user_id},
        )
        return True
    except IntegrityError:
        return False


def eliminar_colaborador(from_user_id, to_user_id):
    execute(
        "DELETE FROM colaboraciones WHERE from_user_id=:f AND to_user_id=:t",
        {"f": from_user_id, "t": to_user_id},
    )


def buscar_usuario_por_email(email, exclude_id):
    return fetchone(
        "SELECT id, nombre, email FROM usuarios WHERE email=:e AND id!=:x",
        {"e": email, "x": exclude_id},
    )


def todos_los_usuarios(exclude_id):
    return fetchall(
        "SELECT id, nombre, email FROM usuarios WHERE id!=:x ORDER BY nombre",
        {"x": exclude_id},
    )
```

- [ ] **Step 7: Reescribir `eliminar_pregunta`, `actualizar_pregunta`, `toggle_compartida`**

```python
def eliminar_pregunta(pregunta_id, user_id):
    execute("DELETE FROM preguntas WHERE id=:pid AND user_id=:uid",
            {"pid": pregunta_id, "uid": user_id})


def actualizar_pregunta(pregunta_id, user_id, materia, contenido, nivel, pregunta, a, b, c, d, e, correcta, explicacion, compartida, img_preg=None, img_a=None, img_b=None, img_c=None, img_d=None, img_e=None):
    imagenes = {
        "imagen_pregunta": img_preg, "imagen_A": img_a, "imagen_B": img_b,
        "imagen_C": img_c, "imagen_D": img_d, "imagen_E": img_e,
    }
    sql, params = db.build_pregunta_update(
        materia, contenido, nivel, pregunta, a, b, c, d, e, correcta,
        explicacion, compartida, pregunta_id, user_id, imagenes,
    )
    execute(sql, params)


def toggle_compartida(pregunta_id, user_id, valor):
    execute(
        "UPDATE preguntas SET compartida=:v WHERE id=:pid AND user_id=:uid",
        {"v": int(valor), "pid": pregunta_id, "uid": user_id},
    )
```

- [ ] **Step 8: Reescribir el INSERT inline (pregunta dentro de un texto)**

Localizar el bloque `conn = get_conn()` … `conn.close()` que hace el INSERT con `tipo, texto_id` (originalmente líneas ~1052–1059). Reemplazarlo por:

```python
                        else:
                            execute(
                                """
                                INSERT INTO preguntas
                                    (user_id, asignatura, materia, contenido,
                                     nivel, pregunta, "A", "B", "C", "D", "E",
                                     correcta, explicacion, compartida, tipo,
                                     texto_id)
                                VALUES
                                    (:uid, :asig, :mat, :cont, :niv, :preg,
                                     :a, :b, :c, :d, :e, :correcta, :expl,
                                     :comp, :tipo, :tid)
                                """,
                                {"uid": usuario["id"], "asig": asignatura,
                                 "mat": tp_materia, "cont": tp_contenido,
                                 "niv": tp_nivel, "preg": tp_preg.strip(),
                                 "a": tp_a, "b": tp_b, "c": tp_c, "d": tp_d,
                                 "e": tp_e, "correcta": tp_correcta,
                                 "expl": tp_explic, "comp": 0, "tipo": tp_tipo,
                                 "tid": tid},
                            )
                            st.success("✅ Pregunta agregada.")
                            st.rerun()
```

- [ ] **Step 9: Reescribir el `read_sql_query` inline (Crear Prueba)**

Localizar el bloque `conn = get_conn()` … `conn.close()` con el `SELECT p.*, u.nombre as profesor` de la página "Crear Prueba" (originalmente ~1172–1186). Reemplazarlo por:

```python
    df = read_df(
        """
        SELECT p.*, u.nombre as profesor
        FROM preguntas p
        JOIN usuarios u ON p.user_id = u.id
        WHERE p.asignatura=:asig AND (
            p.user_id=:uid
            OR p.compartida=2
            OR (p.compartida=1 AND EXISTS (
                SELECT 1 FROM colaboraciones c
                WHERE c.from_user_id=p.user_id AND c.to_user_id=:uid
            ))
        )
        """,
        {"asig": asignatura, "uid": usuario["id"]},
    )
```

- [ ] **Step 10: Verificar que no quedan restos de SQLite**

Run: `grep -nE "sqlite3|get_conn|lastrowid|PRAGMA|conn\.commit|conn\.close|\.execute\([\"'][^\"']*\?|read_sql_query\([^)]*conn" app.py`
Expected: sin resultados (exit code 1).

- [ ] **Step 11: Verificar que el módulo compila**

Run: `source venv/bin/activate && python -m py_compile app.py db.py && echo OK`
Expected: imprime `OK` sin errores de sintaxis.

- [ ] **Step 12: Commit**

```bash
git add app.py
git commit -m "refactor: app.py usa db.py (PostgreSQL) en lugar de sqlite3"
```

---

## Task 4: Script de migración SQLite → PostgreSQL

**Files:**
- Create: `scripts/migrate_sqlite_to_postgres.py`
- Create: `tests/test_migrate.py`

**Interfaces:**
- Consumes: helpers de `db.py`; un archivo `banco.db` (SQLite) de origen.
- Produces: función `migrar(sqlite_path: str, force: bool = False) -> dict` que devuelve conteos por tabla; CLI ejecutable `python -m scripts.migrate_sqlite_to_postgres <ruta.db> [--force]`.

- [ ] **Step 1: Escribir el test (con `DATABASE_URL`)**

Crear `tests/test_migrate.py`:

```python
import os
import sqlite3
import pytest
import db
from scripts.migrate_sqlite_to_postgres import migrar

needs_db = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL no definida; se omite test de migración",
)


def _build_sqlite(path):
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT, email TEXT UNIQUE, password_hash TEXT);
        CREATE TABLE preguntas (id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER, asignatura TEXT, pregunta TEXT,
            A TEXT, B TEXT, C TEXT, D TEXT, E TEXT, correcta TEXT, compartida INTEGER);
        CREATE TABLE textos (id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER, asignatura TEXT, titulo TEXT, contenido TEXT, compartida INTEGER);
        CREATE TABLE colaboraciones (from_user_id INTEGER, to_user_id INTEGER);
        INSERT INTO usuarios (id,nombre,email,password_hash)
            VALUES (1,'A','mig_a@x.com','h'),(2,'B','mig_b@x.com','h');
        INSERT INTO preguntas (id,user_id,asignatura,pregunta,A,B,C,D,E,correcta,compartida)
            VALUES (1,1,'Fis','¿?','op1','op2',NULL,NULL,NULL,'A',2);
        INSERT INTO colaboraciones VALUES (1,2);
        """
    )
    conn.commit()
    conn.close()


@needs_db
def test_migrar_cuenta_filas(tmp_path):
    src = str(tmp_path / "banco.db")
    _build_sqlite(src)
    # limpiar destino de pruebas previas
    db.init_db()
    db.execute("DELETE FROM colaboraciones WHERE from_user_id IN "
               "(SELECT id FROM usuarios WHERE email LIKE 'mig_%')")
    db.execute("DELETE FROM preguntas WHERE user_id IN "
               "(SELECT id FROM usuarios WHERE email LIKE 'mig_%')")
    db.execute("DELETE FROM usuarios WHERE email LIKE 'mig_%'")

    counts = migrar(src, force=True)

    assert counts["usuarios"] == 2
    assert counts["preguntas"] == 1
    assert counts["colaboraciones"] == 1
    # la columna "A" conserva su case y su valor
    row = db.fetchone('SELECT "A" FROM preguntas WHERE user_id=1', {})
    assert row[0] == "op1"
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `source venv/bin/activate && python -m pytest tests/test_migrate.py -q`
Expected: FAIL con `ModuleNotFoundError: No module named 'scripts.migrate_sqlite_to_postgres'` (o `skipped` si no hay `DATABASE_URL` — en ese caso continúa, se valida manualmente en Task 5).

- [ ] **Step 3: Crear el paquete `scripts/`**

Run: `mkdir -p scripts && touch scripts/__init__.py`

- [ ] **Step 4: Crear `scripts/migrate_sqlite_to_postgres.py`**

```python
"""Migra los datos de un banco.db (SQLite) a PostgreSQL.

Uso:
    python -m scripts.migrate_sqlite_to_postgres ruta/a/banco.db [--force]

Requiere DATABASE_URL en el entorno o en .env.
"""
import argparse
import sqlite3
import sys

import db

# (tabla_destino, columnas en orden). Las columnas A–E e imagen_* se
# entrecomillan al construir el INSERT en Postgres.
TABLAS = ["usuarios", "textos", "preguntas", "colaboraciones"]
SECUENCIAS = ["usuarios", "textos", "preguntas"]  # tablas con id SERIAL


def _columnas_sqlite(scon, tabla):
    cur = scon.execute(f"PRAGMA table_info({tabla})")
    return [r[1] for r in cur.fetchall()]


def _quote(col):
    # Postgres pasa identificadores sin comillas a minúscula: hay que
    # entrecomillar los que tienen mayúsculas para preservar el case.
    return f'"{col}"' if col != col.lower() else col


def migrar(sqlite_path: str, force: bool = False) -> dict:
    db.init_db()
    scon = sqlite3.connect(sqlite_path)
    scon.row_factory = sqlite3.Row
    counts = {}
    try:
        for tabla in TABLAS:
            # ¿La tabla existe en el SQLite de origen?
            existe = scon.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (tabla,),
            ).fetchone()
            if not existe:
                counts[tabla] = 0
                continue

            destino_n = db.fetchone(
                f"SELECT COUNT(*) FROM {tabla}", {})[0]
            if destino_n and not force:
                raise SystemExit(
                    f"La tabla destino '{tabla}' ya tiene {destino_n} filas. "
                    f"Usa --force para insertar igualmente."
                )

            cols = _columnas_sqlite(scon, tabla)
            col_list = ", ".join(_quote(c) for c in cols)
            ph_list = ", ".join(f":{c}" for c in cols)
            insert = f"INSERT INTO {tabla} ({col_list}) VALUES ({ph_list})"

            n = 0
            for row in scon.execute(f"SELECT {', '.join(cols)} FROM {tabla}"):
                db.execute(insert, {c: row[c] for c in cols})
                n += 1
            counts[tabla] = n

        # Reajustar las secuencias SERIAL al MAX(id) para no colisionar.
        for tabla in SECUENCIAS:
            db.execute(
                f"SELECT setval(pg_get_serial_sequence('{tabla}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {tabla}), 1), "
                f"(SELECT MAX(id) FROM {tabla}) IS NOT NULL)",
                {},
            )
    finally:
        scon.close()
    return counts


def main(argv=None):
    parser = argparse.ArgumentParser(description="Migra banco.db a PostgreSQL")
    parser.add_argument("sqlite_path", help="Ruta al archivo banco.db")
    parser.add_argument("--force", action="store_true",
                        help="Insertar aunque el destino tenga datos")
    args = parser.parse_args(argv)
    counts = migrar(args.sqlite_path, force=args.force)
    print("Migración completada:")
    for tabla, n in counts.items():
        print(f"  {tabla}: {n} filas")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Ejecutar el test (pasa o se omite sin BD)**

Run: `source venv/bin/activate && python -m pytest tests/test_migrate.py -q`
Expected: PASS si `DATABASE_URL` está definida; `skipped` si no.

- [ ] **Step 6: Verificar que el script compila e imprime ayuda**

Run: `source venv/bin/activate && python -m scripts.migrate_sqlite_to_postgres --help`
Expected: imprime el uso del CLI sin errores.

- [ ] **Step 7: Commit**

```bash
git add scripts/__init__.py scripts/migrate_sqlite_to_postgres.py tests/test_migrate.py
git commit -m "feat: script de migración SQLite a PostgreSQL + test"
```

---

## Task 5: Verificación end-to-end y documentación

**Files:**
- Modify: `.gitignore` (añadir artefactos de tests si hace falta)
- Create: `docs/postgres.md` (instrucciones de configuración/migración)

**Interfaces:**
- Consumes: todo lo anterior + un `DATABASE_URL` real provisto por el usuario.

- [ ] **Step 1: Configurar `.env` con la conexión real (lo hace el usuario)**

Crear `.env` (NO se commitea) con:

```text
DATABASE_URL=postgresql+psycopg://usuario:password@host:5432/nombre_db
```

- [ ] **Step 2: Ejecutar la suite completa contra Postgres real**

Run: `source venv/bin/activate && python -m pytest -q`
Expected: todos los tests PASAN (incluidos los de integración y migración).

- [ ] **Step 3: Arrancar la app y comprobar que `init_db()` no falla**

Run: `source venv/bin/activate && streamlit run app.py --server.headless true --server.port 8501 > streamlit.log 2>&1 &` y luego `sleep 6 && curl -s -o /dev/null -w "HTTP %{code}\n" http://localhost:8501 && grep -i error streamlit.log || echo "sin errores"`
Expected: `HTTP 200` y sin errores en el log.

- [ ] **Step 4: Smoke test manual en el navegador**

Abrir http://localhost:8501 y verificar:
- Registrar un usuario nuevo → sin error.
- Iniciar sesión.
- Crear una pregunta (con alternativas A–E) y guardarla.
- Recargar la página → la pregunta persiste y muestra las alternativas A–E correctamente.
- Cambiar visibilidad (toggle compartida) → persiste.
- Eliminar la pregunta → desaparece.

- [ ] **Step 5: Confirmar persistencia en Postgres (independiente de la app)**

Run: `source venv/bin/activate && python -c "import db; print(db.read_df('SELECT id, email FROM usuarios', {}))"`
Expected: lista el usuario registrado en el Step 4.

- [ ] **Step 6: Escribir `docs/postgres.md`**

```markdown
# PostgreSQL

La app usa PostgreSQL. La conexión se configura con la variable de entorno
`DATABASE_URL` (ver `.env.example`).

## Configuración local

1. Copia `.env.example` a `.env` y pon tu cadena de conexión.
2. `pip install -r requirements.txt`
3. `streamlit run app.py` — las tablas se crean solas al arrancar.

## Migrar datos desde un banco.db (SQLite)

    python -m scripts.migrate_sqlite_to_postgres ruta/a/banco.db [--force]

Preserva los `id` originales y reajusta las secuencias. Usa `--force` si la
base destino ya contiene datos.

## Notas

- Las imágenes subidas se guardan en `uploads/` (disco local), no en la BD.
  En hosts sin disco persistente no sobreviven a un reinicio.
```

- [ ] **Step 7: Commit**

```bash
git add docs/postgres.md .gitignore
git commit -m "docs: guía de PostgreSQL y verificación end-to-end"
```

---

## Self-Review (cobertura del spec)

- Reemplazo total de SQLite → Tasks 2–3 (db.py + reescritura de app.py; Step 10 verifica que no quedan restos).
- Config vía `DATABASE_URL` + `.env` → Task 1 (`.env.example`) y `db.normalize_db_url` (Task 2).
- Driver psycopg v3 + SQLAlchemy, paramstyle `:named` → Task 2.
- Esquema Postgres (`SERIAL`, `ADD COLUMN IF NOT EXISTS`, comillas en A–E/imagen_*) → Task 2 (`init_db`).
- `lastrowid` → `RETURNING id` → Task 3 (`guardar_texto`, `execute_returning`).
- `pd.read_sql_query` vía engine → Task 2 (`read_df`) usado en Task 3.
- IntegrityError de SQLAlchemy → Task 3 (`registrar_usuario`, `agregar_colaborador`).
- Script de migración reutilizable que preserva ids y secuencias → Task 4.
- Empezar con tablas vacías → init_db idempotente; sin datos sembrados.
- Fuera de alcance `uploads/` documentado → Task 5 (`docs/postgres.md`).
- Verificación (registrar/crear/persistir/compartir/borrar + migración) → Task 5.
```
