# Migración de SQLite a PostgreSQL — Diseño

- **Fecha:** 2026-06-22
- **Branch:** `feature/postgres-migration`
- **Estado:** Aprobado (diseño)

## Objetivo

Hacer que toda la aplicación (`app.py`, una app de Streamlit) funcione con
**PostgreSQL** en lugar de SQLite. Reemplazo total: se elimina toda
dependencia de SQLite del runtime de la app. La configuración de conexión se
toma de la variable de entorno `DATABASE_URL` (cargada desde un `.env` en
desarrollo). Se arranca con tablas vacías, pero se incluye un script reutilizable
para migrar datos desde un `banco.db` SQLite cuando exista.

## Contexto actual

- App monolítica en `app.py` (~1500 líneas) que usa el módulo `sqlite3`.
- Acceso a datos concentrado en funciones helper (líneas ~30–331) más dos
  usos inline (~línea 1053 INSERT de preguntas, ~1173 `read_sql_query`).
- Patrones SQLite-específicos presentes:
  - `sqlite3.connect(DB, check_same_thread=False)` con `DB = "banco.db"`.
  - Placeholders posicionales `?`.
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`.
  - Migraciones de esquema vía `PRAGMA table_info(...)` + `ALTER TABLE ADD COLUMN`.
  - `cur.lastrowid` para recuperar el id insertado.
  - `pd.read_sql_query(sql, conn, params=...)` (pandas 3.0 ya instalado, que
    prefiere un connectable de SQLAlchemy).
- Tablas: `usuarios`, `preguntas`, `textos`, `colaboraciones`.
- Las imágenes subidas se guardan en disco local (`uploads/`), **no** en la BD.

## Decisiones

| Tema | Decisión |
|------|----------|
| Hosting Postgres | Instancia existente; el usuario provee `DATABASE_URL` en implementación |
| SQLite | Reemplazo total (se elimina del runtime) |
| Config de conexión | `DATABASE_URL` (variable de entorno + `.env`) |
| Datos | Empezar con tablas vacías; script de migración reutilizable incluido |
| Driver | `psycopg` (v3) vía SQLAlchemy |
| Paramstyle | Parámetros nombrados `:param` (SQLAlchemy `text()`), uniforme en toda la app |

## Enfoque elegido

**SQLAlchemy + `psycopg` (v3), centralizado en un módulo `db.py`.**

Razones: un solo motor y un solo estilo de parámetros en toda la app; compatible
con pandas 3.0 para `read_sql`; portable. Alternativas descartadas: psycopg
directo con `%s` (mezcla dos paramstyles, casos borde pandas/psycopg) y un shim
traductor `?`→`%s` (frágil, esconde el driver).

## Arquitectura

### Módulo nuevo: `db.py`

Centraliza toda la conexión a la base de datos.

- Carga `DATABASE_URL` desde `.env` (con `python-dotenv`) o variable de entorno.
  Si falta, error claro al arrancar.
- Normaliza la URL al dialecto `postgresql+psycopg://...` (acepta también
  `postgres://...` y `postgresql://...`).
- Crea el engine SQLAlchemy con `create_engine(url, pool_pre_ping=True)`,
  cacheado con `st.cache_resource` para reutilizarlo entre reruns de Streamlit.
- Helpers expuestos (todos con parámetros nombrados `:param`):
  - `read_df(sql, params=None) -> DataFrame` — usa `pd.read_sql_query(text(sql), engine, params=...)`.
  - `execute(sql, params=None)` — ejecuta dentro de `engine.begin()` (transacción + commit).
  - `execute_returning(sql, params=None)` — ejecuta un INSERT/UPDATE con `RETURNING` y devuelve el escalar (p. ej. el id).
  - `fetchone(sql, params=None)` / `fetchall(sql, params=None)` — devuelven filas (tuplas/Row).
- `init_db()` con el esquema en sintaxis PostgreSQL; idempotente.

### `app.py`

- Eliminar `import sqlite3` y `get_conn()`.
- Sustituir cada call site por el helper correspondiente de `db.py`.
- Mantener intacta la lógica de UI y de negocio; solo cambia la capa de datos.

## Esquema PostgreSQL

Equivalencias respecto del DDL SQLite actual:

- `id INTEGER PRIMARY KEY AUTOINCREMENT` → `id SERIAL PRIMARY KEY`.
- Tipos de texto `TEXT` se mantienen (`TEXT` existe en Postgres).
- `compartida INTEGER DEFAULT 0` se mantiene como `INTEGER` (0/1) para no tocar
  la lógica que compara/asigna enteros en la app.
- `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` se mantiene.
- Claves foráneas se mantienen igual.

Migraciones de columnas (lo que hoy hace `PRAGMA table_info` + `ALTER TABLE`):

- Reemplazar por `ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <tipo>`
  (soportado de forma nativa e idempotente por PostgreSQL).
- Columnas afectadas según el código actual: `preguntas.nivel TEXT`,
  `preguntas.tipo TEXT DEFAULT 'seleccion_multiple'`, `preguntas.texto_id INTEGER`,
  y cualquier otra que el `init_db` actual agregue dinámicamente.

## Reescritura de queries

- Placeholders `?` → `:named` (p. ej. `WHERE id = :id`).
- `cur.lastrowid` → `INSERT ... RETURNING id` vía `execute_returning`.
- `conn.execute(...).fetchone()/.fetchall()` → `fetchone`/`fetchall`.
- `conn.execute(...); conn.commit()` → `execute(...)`.
- `pd.read_sql_query(sql, conn, params=tuple)` → `read_df(sql, params=dict)`.
- El UPDATE dinámico construido con f-string (`SET {campos}`) se conserva, pero
  con nombres `:param` generados de forma segura (sin interpolar valores).

## Script de migración

`scripts/migrate_sqlite_to_postgres.py`:

- Argumentos: ruta al `banco.db` (origen) y `DATABASE_URL` (destino, o desde env).
- Crea el esquema en Postgres (`init_db()`), luego copia en orden respetando FKs:
  `usuarios` → `textos` → `preguntas` → `colaboraciones`.
- Preserva los `id` originales (inserción explícita de id) y, al terminar,
  reajusta las secuencias `SERIAL` con `setval` para evitar colisiones.
- Idempotencia razonable: avisa/aborta si las tablas destino ya tienen datos
  (para no duplicar), con flag opcional para forzar.

## Dependencias y configuración

- `requirements.txt`: añadir `psycopg[binary]`, `SQLAlchemy`, `python-dotenv`.
  (Se mantiene `pandas`; se elimina toda dependencia de `sqlite3`, que es stdlib.)
- `.env.example`: documentar `DATABASE_URL=postgresql+psycopg://user:pass@host:5432/dbname`.
- `.env` ya está en `.gitignore` (no se commitea).
- `runtime.txt` / `.python-version`: sin cambios (Python 3.12).

## Fuera de alcance

- **Almacenamiento de imágenes (`uploads/`)**: hoy se guardan en disco local.
  No se migran a la BD en este branch. Mejora futura: mover a `bytea` en Postgres
  o a object storage para que persistan en hosts stateless.
- Cualquier refactor de UI o de lógica de negocio no relacionado con la BD.

## Verificación

1. Configurar `DATABASE_URL` apuntando al Postgres real del usuario.
2. Arrancar la app; confirmar que `init_db()` crea las tablas sin error.
3. Registrar un usuario, iniciar sesión, crear una pregunta y un texto; recargar
   y confirmar que persisten (lectura desde Postgres).
4. Probar `share`/`unshare` y borrado para cubrir UPDATE/DELETE.
5. Ejecutar el script de migración contra un `banco.db` de ejemplo y verificar
   conteos de filas y secuencias.
6. `grep` final: no debe quedar `sqlite3`, `lastrowid`, `PRAGMA`, ni `?`-placeholders
   de SQL en `app.py`.
