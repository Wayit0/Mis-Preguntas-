"""Migra los datos de un banco.db (SQLite) a PostgreSQL.

Uso:
    python -m scripts.migrate_sqlite_to_postgres ruta/a/banco.db [--force]

Requiere DATABASE_URL en el entorno o en .env.
"""
import argparse
import sqlite3

from sqlalchemy import text

from db import init_db, get_engine

# Orden de inserción FK-safe: una tabla referenciada va antes que las que la
# referencian. Las columnas con mayúsculas (A–E, imagen_*) se entrecomillan
# al construir el INSERT (ver _quote).
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
    init_db()
    scon = sqlite3.connect(sqlite_path)
    scon.row_factory = sqlite3.Row
    counts = {}
    try:
        # Toda la carga de datos en UNA transacción: si algo falla, se revierte
        # por completo y la base destino no queda a medio poblar.
        with get_engine().begin() as conn:
            for tabla in TABLAS:
                # ¿La tabla existe en el SQLite de origen?
                existe = scon.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    (tabla,),
                ).fetchone()
                if not existe:
                    counts[tabla] = 0
                    continue

                destino_n = conn.execute(
                    text(f"SELECT COUNT(*) FROM {tabla}")).scalar()
                if destino_n and not force:
                    raise ValueError(
                        f"La tabla destino '{tabla}' ya tiene {destino_n} filas. "
                        f"Usa --force para insertar igualmente."
                    )

                cols = _columnas_sqlite(scon, tabla)
                col_list = ", ".join(_quote(c) for c in cols)
                ph_list = ", ".join(f":{c}" for c in cols)
                insert = text(f"INSERT INTO {tabla} ({col_list}) VALUES ({ph_list})")

                n = 0
                for row in scon.execute(f"SELECT {', '.join(cols)} FROM {tabla}"):
                    conn.execute(insert, {c: row[c] for c in cols})
                    n += 1
                counts[tabla] = n

            # Reajustar las secuencias SERIAL al MAX(id) para no colisionar.
            for tabla in SECUENCIAS:
                conn.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{tabla}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {tabla}), 1), "
                    f"(SELECT MAX(id) FROM {tabla}) IS NOT NULL)"))
    finally:
        scon.close()
    return counts


def main(argv=None):
    parser = argparse.ArgumentParser(description="Migra banco.db a PostgreSQL")
    parser.add_argument("sqlite_path", help="Ruta al archivo banco.db")
    parser.add_argument("--force", action="store_true",
                        help="Insertar aunque el destino tenga datos")
    args = parser.parse_args(argv)
    try:
        counts = migrar(args.sqlite_path, force=args.force)
    except ValueError as e:
        print(f"Error: {e}")
        raise SystemExit(1)
    print("Migración completada:")
    for tabla, n in counts.items():
        print(f"  {tabla}: {n} filas")


if __name__ == "__main__":
    main()
