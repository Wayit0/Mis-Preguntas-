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

## Despliegue en producción

`DATABASE_URL` se inyecta como variable de entorno en el host (p. ej. en Render:
Environment → Add Environment Variable). La app llama a `init_db()` en cada
arranque; es idempotente (`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT
EXISTS`), así que crear o actualizar el esquema en cada boot es seguro.

## Si la migración falla

`migrar()` carga todos los datos en una sola transacción: si algo falla a mitad,
se revierte por completo y la base destino no queda a medio poblar. Corrige el
origen y vuelve a ejecutar el script (usa `--force` si la base destino ya tiene
filas que quieres conservar).

## Notas

- Las imágenes subidas se guardan en `uploads/` (disco local), no en la BD.
  En hosts sin disco persistente no sobreviven a un reinicio.
