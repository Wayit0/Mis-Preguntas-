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
