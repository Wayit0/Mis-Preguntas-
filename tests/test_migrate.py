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


def _cleanup_mig_rows():
    """Delete test rows in FK-safe order."""
    db.execute(
        "DELETE FROM colaboraciones WHERE from_user_id IN "
        "(SELECT id FROM usuarios WHERE email LIKE 'mig_%')"
    )
    db.execute(
        "DELETE FROM preguntas WHERE user_id IN "
        "(SELECT id FROM usuarios WHERE email LIKE 'mig_%')"
    )
    db.execute("DELETE FROM usuarios WHERE email LIKE 'mig_%'")


@needs_db
def test_migrar_cuenta_filas(tmp_path):
    src = str(tmp_path / "banco.db")
    _build_sqlite(src)
    # limpiar destino de pruebas previas
    db.init_db()
    _cleanup_mig_rows()

    try:
        counts = migrar(src, force=True)

        assert counts["usuarios"] == 2
        assert counts["preguntas"] == 1
        assert counts["colaboraciones"] == 1
        # la columna "A" conserva su case y su valor
        row = db.fetchone('SELECT "A" FROM preguntas WHERE user_id=1', {})
        assert row[0] == "op1"
    finally:
        # Post-test cleanup: leave the live DB exactly as it was
        _cleanup_mig_rows()
