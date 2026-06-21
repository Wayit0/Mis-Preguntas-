import streamlit as st
import streamlit.components.v1 as components
import pandas as pd
import sqlite3
import hashlib
import json
import anthropic
import fitz  # PyMuPDF
import docx as docxlib
import os
import io
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import letter
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from PIL import Image as PILImage

st.set_page_config(page_title="Banco de Preguntas", layout="wide")

DB = "banco.db"

# ─────────────────────────────────────────────
# BASE DE DATOS
# ─────────────────────────────────────────────

def get_conn():
    return sqlite3.connect(DB, check_same_thread=False)

def init_db():
    conn = get_conn()
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS preguntas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            asignatura TEXT NOT NULL,
            materia TEXT,
            contenido TEXT,
            nivel TEXT,
            pregunta TEXT NOT NULL,
            A TEXT, B TEXT, C TEXT, D TEXT, E TEXT,
            correcta TEXT,
            explicacion TEXT,
            compartida INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES usuarios(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS textos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            asignatura TEXT NOT NULL,
            titulo TEXT NOT NULL,
            contenido TEXT NOT NULL,
            compartida INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES usuarios(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS colaboraciones (
            from_user_id INTEGER NOT NULL,
            to_user_id INTEGER NOT NULL,
            PRIMARY KEY (from_user_id, to_user_id),
            FOREIGN KEY (from_user_id) REFERENCES usuarios(id),
            FOREIGN KEY (to_user_id) REFERENCES usuarios(id)
        )
    """)
    conn.commit()
    # Migraciones
    cols = [r[1] for r in c.execute("PRAGMA table_info(preguntas)").fetchall()]
    if "nivel" not in cols:
        c.execute("ALTER TABLE preguntas ADD COLUMN nivel TEXT")
    for col in ["imagen_pregunta", "imagen_A", "imagen_B", "imagen_C", "imagen_D", "imagen_E"]:
        if col not in cols:
            c.execute(f"ALTER TABLE preguntas ADD COLUMN {col} TEXT")
    if "tipo" not in cols:
        c.execute("ALTER TABLE preguntas ADD COLUMN tipo TEXT DEFAULT 'seleccion_multiple'")
    if "texto_id" not in cols:
        c.execute("ALTER TABLE preguntas ADD COLUMN texto_id INTEGER")
    conn.commit()
    conn.close()

os.makedirs("uploads", exist_ok=True)

init_db()

# ─────────────────────────────────────────────
# AUTH HELPERS
# ─────────────────────────────────────────────

def _preparar_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def cambiar_password_usuario(user_id, password_actual, password_nueva):
    conn = get_conn()
    row = conn.execute("SELECT password_hash FROM usuarios WHERE id=?", (user_id,)).fetchone()
    conn.close()
    if row is None:
        return False, "Usuario no encontrado."
    try:
        if _preparar_password(password_actual) != row[0]:
            return False, "La contraseña actual es incorrecta."
    except Exception:
        return False, "Error al verificar la contraseña actual."
    try:
        hashed = _preparar_password(password_nueva)
        conn = get_conn()
        conn.execute("UPDATE usuarios SET password_hash=? WHERE id=?", (hashed, user_id))
        conn.commit()
        conn.close()
        return True, None
    except Exception as e:
        return False, f"Error al guardar la nueva contraseña: {e}"

def registrar_usuario(nombre, email, password):
    try:
        hashed = _preparar_password(password)
    except Exception as e:
        return False, f"Error al procesar la contraseña: {e}"
    try:
        conn = get_conn()
        conn.execute("INSERT INTO usuarios (nombre, email, password_hash) VALUES (?,?,?)",
                     (nombre, email, hashed))
        conn.commit()
        conn.close()
        return True, None
    except sqlite3.IntegrityError:
        return False, "Ya existe una cuenta con ese correo."

def autenticar(email, password):
    conn = get_conn()
    row = conn.execute("SELECT id, nombre, password_hash FROM usuarios WHERE email=?", (email,)).fetchone()
    conn.close()
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

# ─────────────────────────────────────────────
# PREGUNTAS HELPERS
# ─────────────────────────────────────────────

def guardar_imagen(uploaded_file):
    """Guarda un archivo subido en uploads/ y retorna el nombre del archivo."""
    if uploaded_file is None:
        return None
    import uuid
    ext = uploaded_file.name.rsplit(".", 1)[-1].lower()
    fname = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join("uploads", fname), "wb") as f:
        f.write(uploaded_file.getbuffer())
    return fname

def mostrar_imagen(nombre_archivo, width=300):
    """Muestra una imagen guardada en uploads/."""
    if nombre_archivo and str(nombre_archivo) != "nan":
        path = os.path.join("uploads", nombre_archivo)
        if os.path.exists(path):
            st.image(path, width=width)

def guardar_texto(user_id, asignatura, titulo, contenido, compartida=0):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO textos (user_id, asignatura, titulo, contenido, compartida) VALUES (?,?,?,?,?)",
        (user_id, asignatura, titulo, contenido, int(compartida))
    )
    texto_id = cur.lastrowid
    conn.commit()
    conn.close()
    return texto_id

def cargar_textos_propios(user_id, asignatura):
    conn = get_conn()
    df = pd.read_sql_query(
        "SELECT * FROM textos WHERE user_id=? AND asignatura=? ORDER BY created_at DESC",
        conn, params=(user_id, asignatura)
    )
    conn.close()
    return df

def cargar_preguntas_de_texto(texto_id):
    conn = get_conn()
    df = pd.read_sql_query(
        "SELECT * FROM preguntas WHERE texto_id=? ORDER BY id",
        conn, params=(texto_id,)
    )
    conn.close()
    return df

def eliminar_texto(texto_id, user_id):
    conn = get_conn()
    conn.execute("UPDATE preguntas SET texto_id=NULL WHERE texto_id=?", (texto_id,))
    conn.execute("DELETE FROM textos WHERE id=? AND user_id=?", (texto_id, user_id))
    conn.commit()
    conn.close()

def guardar_pregunta(user_id, asignatura, materia, contenido, nivel, pregunta, a, b, c, d, e, correcta, explicacion, compartida, img_preg=None, img_a=None, img_b=None, img_c=None, img_d=None, img_e=None, tipo="seleccion_multiple"):
    conn = get_conn()
    conn.execute("""
        INSERT INTO preguntas (user_id, asignatura, materia, contenido, nivel, pregunta, A, B, C, D, E, correcta, explicacion, compartida, imagen_pregunta, imagen_A, imagen_B, imagen_C, imagen_D, imagen_E, tipo)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (user_id, asignatura, materia, contenido, nivel, pregunta, a, b, c, d, e, correcta, explicacion, int(compartida), img_preg, img_a, img_b, img_c, img_d, img_e, tipo))
    conn.commit()
    conn.close()

def cargar_preguntas_propias(user_id, asignatura):
    conn = get_conn()
    df = pd.read_sql_query(
        "SELECT * FROM preguntas WHERE user_id=? AND asignatura=?",
        conn, params=(user_id, asignatura)
    )
    conn.close()
    return df

def cargar_banco_compartido(asignatura, user_id):
    """Preguntas compartidas: públicas (compartida=2) o de colaboradores (compartida=1)."""
    conn = get_conn()
    df = pd.read_sql_query("""
        SELECT p.*, u.nombre as profesor
        FROM preguntas p
        JOIN usuarios u ON p.user_id = u.id
        WHERE p.asignatura=? AND p.user_id != ? AND (
            p.compartida=2
            OR (p.compartida=1 AND EXISTS (
                SELECT 1 FROM colaboraciones c
                WHERE c.from_user_id=p.user_id AND c.to_user_id=?
            ))
        )
        ORDER BY u.nombre, p.id
    """, conn, params=(asignatura, user_id, user_id))
    conn.close()
    return df

def cargar_colaboradores(user_id):
    """Colegas a los que he invitado (pueden ver mis preguntas compartidas)."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT u.id, u.nombre, u.email FROM usuarios u
        JOIN colaboraciones c ON c.to_user_id = u.id
        WHERE c.from_user_id=?
        ORDER BY u.nombre
    """, (user_id,)).fetchall()
    conn.close()
    return rows

def cargar_quienes_me_invitaron(user_id):
    """Profesores que me han dado acceso a sus preguntas."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT u.id, u.nombre, u.email FROM usuarios u
        JOIN colaboraciones c ON c.from_user_id = u.id
        WHERE c.to_user_id=?
        ORDER BY u.nombre
    """, (user_id,)).fetchall()
    conn.close()
    return rows

def agregar_colaborador(from_user_id, to_user_id):
    conn = get_conn()
    try:
        conn.execute("INSERT INTO colaboraciones (from_user_id, to_user_id) VALUES (?,?)", (from_user_id, to_user_id))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def eliminar_colaborador(from_user_id, to_user_id):
    conn = get_conn()
    conn.execute("DELETE FROM colaboraciones WHERE from_user_id=? AND to_user_id=?", (from_user_id, to_user_id))
    conn.commit()
    conn.close()

def buscar_usuario_por_email(email, exclude_id):
    conn = get_conn()
    row = conn.execute("SELECT id, nombre, email FROM usuarios WHERE email=? AND id!=?", (email, exclude_id)).fetchone()
    conn.close()
    return row

def todos_los_usuarios(exclude_id):
    conn = get_conn()
    rows = conn.execute("SELECT id, nombre, email FROM usuarios WHERE id!=? ORDER BY nombre", (exclude_id,)).fetchall()
    conn.close()
    return rows

def eliminar_pregunta(pregunta_id, user_id):
    conn = get_conn()
    conn.execute("DELETE FROM preguntas WHERE id=? AND user_id=?", (pregunta_id, user_id))
    conn.commit()
    conn.close()

def actualizar_pregunta(pregunta_id, user_id, materia, contenido, nivel, pregunta, a, b, c, d, e, correcta, explicacion, compartida, img_preg=None, img_a=None, img_b=None, img_c=None, img_d=None, img_e=None):
    conn = get_conn()
    # Solo actualizar imágenes si se proporcionan nuevas, si no mantener las existentes
    campos = "materia=?, contenido=?, nivel=?, pregunta=?, A=?, B=?, C=?, D=?, E=?, correcta=?, explicacion=?, compartida=?"
    vals = [materia, contenido, nivel, pregunta, a, b, c, d, e, correcta, explicacion, int(compartida)]
    for col, val in [("imagen_pregunta", img_preg), ("imagen_A", img_a), ("imagen_B", img_b), ("imagen_C", img_c), ("imagen_D", img_d), ("imagen_E", img_e)]:
        if val is not None:
            campos += f", {col}=?"
            vals.append(val)
    vals += [pregunta_id, user_id]
    conn.execute(f"UPDATE preguntas SET {campos} WHERE id=? AND user_id=?", vals)
    conn.commit()
    conn.close()

def toggle_compartida(pregunta_id, user_id, valor):
    conn = get_conn()
    conn.execute("UPDATE preguntas SET compartida=? WHERE id=? AND user_id=?", (int(valor), pregunta_id, user_id))
    conn.commit()
    conn.close()

# ─────────────────────────────────────────────
# PDF
# ─────────────────────────────────────────────

def latex_a_imagen(expresion):
    fig, ax = plt.subplots(figsize=(7, 0.8))
    fig.patch.set_facecolor("white")
    ax.set_axis_off()
    try:
        ax.text(0.02, 0.5, f"${expresion}$", fontsize=16, va="center", ha="left", transform=ax.transAxes)
    except Exception:
        ax.text(0.02, 0.5, expresion, fontsize=14, va="center", ha="left", transform=ax.transAxes)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=150, facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return buf.read()

def generar_pdf(titulo, asignatura, preguntas_df, nombre_colegio, nombre_profesor, logo_bytes, instrucciones="", formulas=None, textos_dict=None):
    buffer = io.BytesIO()
    MARGEN_LAT = 2.5 * cm
    MARGEN_INF = 2.5 * cm
    ALTO_HEADER = 2.2 * cm
    MARGEN_SUP = ALTO_HEADER + 0.8 * cm
    page_w, page_h = letter
    styles = getSampleStyleSheet()

    estilo_titulo = ParagraphStyle("Titulo", parent=styles["Title"], fontName="Times-Bold", fontSize=15, spaceAfter=4)
    estilo_identif = ParagraphStyle("Identificacion", parent=styles["Normal"], fontName="Times-Roman", fontSize=11, spaceAfter=14)
    estilo_num = ParagraphStyle("NumPregunta", parent=styles["Normal"], fontName="Times-Bold", fontSize=11, spaceBefore=12, spaceAfter=3)
    estilo_alt = ParagraphStyle("Alternativa", parent=styles["Normal"], fontName="Times-Roman", fontSize=10, leftIndent=18, spaceAfter=2)
    estilo_seccion = ParagraphStyle("Seccion", parent=styles["Normal"], fontName="Times-Bold", fontSize=10, spaceBefore=8, spaceAfter=4)
    estilo_instruc = ParagraphStyle("Instruc", parent=styles["Normal"], fontName="Times-Roman", fontSize=10, spaceAfter=8, leading=14)

    def dibujar_header(canvas, doc):
        canvas.saveState()
        x = MARGEN_LAT
        y = page_h - ALTO_HEADER - 0.5 * cm
        texto_x = x
        if logo_bytes:
            try:
                pil_img = PILImage.open(io.BytesIO(logo_bytes)).convert("RGBA")
                img_w, img_h = pil_img.size
                alto_logo = ALTO_HEADER - 0.4 * cm
                ancho_logo = alto_logo * img_w / img_h
                img_buf = io.BytesIO()
                pil_img.save(img_buf, format="PNG")
                img_buf.seek(0)
                canvas.drawImage(ImageReader(img_buf), x, y + 0.2 * cm, width=ancho_logo, height=alto_logo, mask="auto")
                texto_x = x + ancho_logo + 0.3 * cm
            except Exception:
                pass
        canvas.setFont("Times-Bold", 10)
        canvas.drawString(texto_x, y + ALTO_HEADER - 0.55 * cm, nombre_colegio or "")
        canvas.setFont("Times-Roman", 10)
        canvas.drawString(texto_x, y + ALTO_HEADER - 1.05 * cm, f"Profesor/a: {nombre_profesor or ''}")
        canvas.drawString(texto_x, y + ALTO_HEADER - 1.55 * cm, f"{asignatura}  |  {titulo or 'Prueba'}")
        canvas.restoreState()

    frame = Frame(MARGEN_LAT, MARGEN_INF, page_w - 2 * MARGEN_LAT, page_h - MARGEN_SUP - MARGEN_INF, id="main")
    doc = BaseDocTemplate(buffer, pagesize=letter, pageTemplates=[PageTemplate(id="p", frames=[frame], onPage=dibujar_header)])
    story = [
        Paragraph(titulo if titulo else "Prueba", estilo_titulo),
        Spacer(1, 10),
        Paragraph("Nombre: _______________________&nbsp;&nbsp; Curso: _________&nbsp;&nbsp; Fecha: _________", estilo_identif),
        Spacer(1, 6),
    ]
    if instrucciones and instrucciones.strip():
        story += [Paragraph("Instrucciones", estilo_seccion), Paragraph(instrucciones.replace("\n", "<br/>"), estilo_instruc)]
    if formulas:
        story.append(Paragraph("Formulario", estilo_seccion))
        for expr in formulas:
            if expr.strip():
                img_bytes = latex_a_imagen(expr)
                pil = PILImage.open(io.BytesIO(img_bytes))
                iw, ih = pil.size
                ancho = 10 * cm
                story.append(Image(io.BytesIO(img_bytes), width=ancho, height=ancho * ih / iw))
        story.append(Spacer(1, 6))
    def pdf_imagen(nombre_archivo, max_ancho=12*cm):
        if not nombre_archivo or str(nombre_archivo) == "nan":
            return None
        path = os.path.join("uploads", nombre_archivo)
        if not os.path.exists(path):
            return None
        try:
            pil = PILImage.open(path)
            iw, ih = pil.size
            ancho = min(max_ancho, iw * (72/96))
            alto = ancho * ih / iw
            return Image(path, width=ancho, height=alto)
        except Exception:
            return None

    estilo_texto_titulo = ParagraphStyle("TextoTitulo", parent=styles["Normal"], fontName="Times-Bold", fontSize=11, spaceBefore=12, spaceAfter=4)
    estilo_texto_body = ParagraphStyle("TextoBody", parent=styles["Normal"], fontName="Times-Roman", fontSize=10, leading=14, spaceAfter=8, leftIndent=0)

    def agregar_pregunta_pdf(num, fila):
        bloque = [Paragraph(f"{num}. {fila['pregunta']}", estilo_num)]
        img = pdf_imagen(fila.get("imagen_pregunta"))
        if img:
            bloque.append(img)
            bloque.append(Spacer(1, 4))
        tipo = fila.get("tipo") or "seleccion_multiple"
        if tipo == "desarrollo_corto":
            bloque.append(Spacer(1, 6))
            for _ in range(2):
                bloque.append(Paragraph("_" * 95, estilo_alt))
                bloque.append(Spacer(1, 6))
        elif tipo == "desarrollo_largo":
            bloque.append(Spacer(1, 6))
            for _ in range(6):
                bloque.append(Paragraph("_" * 95, estilo_alt))
                bloque.append(Spacer(1, 6))
        else:
            for letra in ["A", "B", "C", "D", "E"]:
                val = fila.get(letra) or fila.get(letra.lower())
                img_alt = pdf_imagen(fila.get(f"imagen_{letra}") or fila.get(f"imagen_{letra.lower()}"), max_ancho=7*cm)
                if (pd.notna(val) and str(val).strip()) or img_alt:
                    bloque.append(Paragraph(f"<b>{letra})</b> {val if pd.notna(val) else ''}", estilo_alt))
                    if img_alt:
                        bloque.append(img_alt)
        bloque.append(Spacer(1, 8))
        story.append(KeepTogether(bloque))

    num_preg = 1
    # Separar preguntas con texto de las independientes
    df_sin_texto = preguntas_df[preguntas_df["texto_id"].isna() | (preguntas_df["texto_id"] == "")] if "texto_id" in preguntas_df.columns else preguntas_df
    df_con_texto = preguntas_df[preguntas_df["texto_id"].notna() & (preguntas_df["texto_id"] != "")] if "texto_id" in preguntas_df.columns else pd.DataFrame()

    # Primero los textos con sus preguntas agrupados
    if textos_dict and not df_con_texto.empty:
        for texto_id, info_texto in textos_dict.items():
            preg_del_texto = df_con_texto[df_con_texto["texto_id"].astype(str) == str(texto_id)]
            if preg_del_texto.empty:
                continue
            story.append(Paragraph(info_texto["titulo"], estilo_texto_titulo))
            story.append(Paragraph(info_texto["contenido"].replace("\n", "<br/>"), estilo_texto_body))
            story.append(Spacer(1, 4))
            for _, fila in preg_del_texto.iterrows():
                agregar_pregunta_pdf(num_preg, fila)
                num_preg += 1
            story.append(Spacer(1, 6))

    # Luego las preguntas independientes
    for _, fila in df_sin_texto.iterrows():
        agregar_pregunta_pdf(num_preg, fila)
        num_preg += 1

    doc.build(story)
    buffer.seek(0)
    return buffer

# ─────────────────────────────────────────────
# ESTILOS
# ─────────────────────────────────────────────

# ─────────────────────────────────────────────
# IMPORTACIÓN DESDE DOCUMENTO CON IA
# ─────────────────────────────────────────────

def extraer_texto_pdf(file_bytes):
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    return "\n".join(page.get_text() for page in doc)

def extraer_texto_docx(file_bytes):
    import io
    doc = docxlib.Document(io.BytesIO(file_bytes))
    return "\n".join(p.text for p in doc.paragraphs)

def extraer_texto_imagen(file_bytes, filename):
    """Convierte imagen a PDF temporal y extrae texto con OCR de PyMuPDF."""
    ext = filename.rsplit(".", 1)[-1].lower()
    doc = fitz.open(stream=file_bytes, filetype=ext)
    return "\n".join(page.get_text() for page in doc)

def detectar_preguntas_con_claude(texto, asignatura, api_key):
    cliente = anthropic.Anthropic(api_key=api_key)
    prompt = f"""Eres un asistente experto en educación.
Se te entrega el texto de un documento con preguntas de opción múltiple de la asignatura "{asignatura}".
Extrae TODAS las preguntas de selección múltiple que encuentres y devuelve un JSON con esta estructura exacta:

[
  {{
    "pregunta": "Texto completo de la pregunta",
    "A": "Texto alternativa A",
    "B": "Texto alternativa B",
    "C": "Texto alternativa C",
    "D": "Texto alternativa D",
    "E": "Texto alternativa E o null si no existe",
    "correcta": "Letra de la alternativa correcta o null si no se indica",
    "explicacion": "Explicación si aparece en el documento, o cadena vacía"
  }}
]

Reglas:
- Si una alternativa no existe, usa null.
- Si no se indica la respuesta correcta, usa null.
- Devuelve SOLO el JSON, sin texto adicional ni bloques de código.

TEXTO DEL DOCUMENTO:
{texto[:12000]}
"""
    mensaje = cliente.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = mensaje.content[0].text.strip()
    # Limpiar bloques de código si Claude los incluye
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)

ESTILOS_BOTONES = """
<style>
div[data-testid="stButton"] button {
    height: 140px;
    font-size: 1.3rem;
    font-weight: bold;
    white-space: pre-line;
}
</style>
"""

SCRIPT_VOLVER = """
<script>
(function fix() {
    var buttons = window.parent.document.querySelectorAll('button');
    buttons.forEach(function(b) {
        if (b.innerText && b.innerText.indexOf('Volver al inicio') !== -1) {
            b.style.setProperty('height', '35px', 'important');
            b.style.setProperty('font-size', '0.95rem', 'important');
            b.style.setProperty('font-weight', 'normal', 'important');
            b.style.setProperty('white-space', 'normal', 'important');
            b.style.setProperty('padding', '4px 12px', 'important');
        }
    });
    setTimeout(fix, 200);
})();
</script>
"""

# ─────────────────────────────────────────────
# SESSION STATE
# ─────────────────────────────────────────────

for key, default in [
    ("usuario", None),
    ("asignatura", None),
    ("pagina", None),
    ("formulas_lista", []),
    ("auth_modo", "login"),
    ("cuenta_creada", None),
    ("cambiar_password", False),
]:
    if key not in st.session_state:
        st.session_state[key] = default

# ─────────────────────────────────────────────
# PANTALLA DE LOGIN / REGISTRO
# ─────────────────────────────────────────────

if st.session_state.usuario is None:

    st.title("📚 Banco de Preguntas")
    st.markdown("---")

    col_l, col_c, col_r = st.columns([1, 1.4, 1])
    with col_c:
        if st.session_state.cuenta_creada:
            nombre_nuevo = st.session_state.cuenta_creada
            st.success(f"🎉 ¡Cuenta creada con éxito, {nombre_nuevo}!")
            st.markdown("Ya puedes iniciar sesión con tu correo y contraseña.")
            if st.button("Ir a iniciar sesión", use_container_width=True):
                st.session_state.cuenta_creada = None
                st.session_state.auth_modo = "login"
                st.rerun()
            st.stop()

        modo = st.radio("", ["Iniciar sesión", "Crear cuenta"], horizontal=True,
                        index=0 if st.session_state.auth_modo == "login" else 1,
                        label_visibility="collapsed")

        st.markdown("")

        if modo == "Iniciar sesión":
            email = st.text_input("Correo electrónico", key="login_email")
            password = st.text_input("Contraseña", type="password", key="login_pass")
            if st.button("Entrar", use_container_width=True):
                if email and password:
                    usuario, error = autenticar(email.strip().lower(), password)
                    if usuario:
                        st.session_state.usuario = usuario
                        st.rerun()
                    else:
                        st.error(error)
                else:
                    st.warning("Completa todos los campos.")

        else:
            nombre = st.text_input("Tu nombre", key="reg_nombre")
            email = st.text_input("Correo electrónico", key="reg_email")
            password = st.text_input("Contraseña", type="password", key="reg_pass")
            password2 = st.text_input("Repite la contraseña", type="password", key="reg_pass2")
            if st.button("Crear cuenta", use_container_width=True):
                if not (nombre and email and password):
                    st.warning("Completa todos los campos.")
                elif password != password2:
                    st.error("Las contraseñas no coinciden.")
                elif len(password) < 6:
                    st.error("La contraseña debe tener al menos 6 caracteres.")
                else:
                    ok, error = registrar_usuario(nombre.strip(), email.strip().lower(), password)
                    if ok:
                        st.session_state.auth_modo = "login"
                        st.session_state.cuenta_creada = nombre.strip()
                        st.rerun()
                    else:
                        st.error(error)

    st.stop()

# ─────────────────────────────────────────────
# APP PRINCIPAL (usuario autenticado)
# ─────────────────────────────────────────────

usuario = st.session_state.usuario

# Barra superior
with st.sidebar:
    st.markdown(f"### 👤 {usuario['nombre']}")
    st.caption(usuario['email'])
    st.markdown("---")
    if st.button("🔑 Cambiar contraseña", use_container_width=True):
        st.session_state.cambiar_password = not st.session_state.cambiar_password
        st.rerun()
    if st.button("Cerrar sesión", use_container_width=True):
        for k in ["usuario", "asignatura", "pagina", "formulas_lista"]:
            st.session_state[k] = None if k != "formulas_lista" else []
        st.rerun()

if st.session_state.cambiar_password:
    with st.sidebar:
        st.markdown("---")
        st.markdown("**Cambiar contraseña**")
        pass_actual = st.text_input("Contraseña actual", type="password", key="cp_actual")
        pass_nueva = st.text_input("Nueva contraseña", type="password", key="cp_nueva")
        pass_nueva2 = st.text_input("Repite la nueva", type="password", key="cp_nueva2")
        if st.button("Guardar", use_container_width=True, key="cp_guardar"):
            if not (pass_actual and pass_nueva and pass_nueva2):
                st.error("Completa todos los campos.")
            elif pass_nueva != pass_nueva2:
                st.error("Las contraseñas nuevas no coinciden.")
            elif len(pass_nueva) < 6:
                st.error("Mínimo 6 caracteres.")
            else:
                ok, err = cambiar_password_usuario(usuario["id"], pass_actual, pass_nueva)
                if ok:
                    st.success("¡Contraseña actualizada!")
                    st.session_state.cambiar_password = False
                    st.rerun()
                else:
                    st.error(err)

# ─────────────────────────────────────────────
# PANTALLA DE INICIO — SELECCIONAR ASIGNATURA
# ─────────────────────────────────────────────

if st.session_state.asignatura is None:

    st.title("📚 Banco de Preguntas")
    st.markdown("### Selecciona una asignatura para comenzar")
    st.markdown("---")

    col1, col2, col3, col4 = st.columns(4)
    with col1:
        if st.button("⚛️\n\nFísica", use_container_width=True, key="btn_fisica"):
            st.session_state.asignatura = "Física"
            st.rerun()
    with col2:
        if st.button("🧪\n\nQuímica", use_container_width=True, key="btn_quimica"):
            st.session_state.asignatura = "Química"
            st.rerun()
    with col3:
        if st.button("🧬\n\nBiología", use_container_width=True, key="btn_biologia"):
            st.session_state.asignatura = "Biología"
            st.rerun()
    with col4:
        if st.button("📐\n\nMatemáticas", use_container_width=True, key="btn_matematicas"):
            st.session_state.asignatura = "Matemáticas"
            st.rerun()

    col5, col6, col7, col8 = st.columns(4)
    with col5:
        if st.button("🏛️\n\nFilosofía", use_container_width=True, key="btn_filosofia"):
            st.session_state.asignatura = "Filosofía"
            st.rerun()
    with col6:
        if st.button("🏫\n\nCiencias de la\nCiudadanía", use_container_width=True, key="btn_ciudadania"):
            st.session_state.asignatura = "Ciencias de la Ciudadanía"
            st.rerun()
    with col7:
        if st.button("📖\n\nLenguaje", use_container_width=True, key="btn_lenguaje"):
            st.session_state.asignatura = "Lenguaje"
            st.rerun()
    with col8:
        if st.button("🌍\n\nSAS", use_container_width=True, key="btn_sas"):
            st.session_state.asignatura = "SAS"
            st.rerun()

    st.markdown(ESTILOS_BOTONES, unsafe_allow_html=True)
    st.stop()

# ─────────────────────────────────────────────
# PANTALLA DE ASIGNATURA
# ─────────────────────────────────────────────

asignatura = st.session_state.asignatura
iconos = {"Física": "⚛️", "Química": "🧪", "Biología": "🧬", "Matemáticas": "📐", "Filosofía": "🏛️", "Ciencias de la Ciudadanía": "🏫", "Lenguaje": "📖", "SAS": "🌍"}
icono = iconos[asignatura]

col_volver, _ = st.columns([1, 1])
components.html(SCRIPT_VOLVER, height=0)
if col_volver.button("← Volver al inicio", use_container_width=True):
    st.session_state.asignatura = None
    st.session_state.pagina = None
    st.rerun()

st.title(f"{icono} {asignatura}")

# ─────────────────────────────────────────────
# MENÚ
# ─────────────────────────────────────────────

if st.session_state.pagina is None:

    st.markdown("### ¿Qué quieres hacer?")
    st.markdown("---")

    col1, col2, col3, col4, col5, col6, col7 = st.columns(7)
    with col1:
        if st.button("📖\n\nMis\nPreguntas", use_container_width=True, key="btn_banco"):
            st.session_state.pagina = "Mis Preguntas"
            st.rerun()
    with col2:
        if st.button("🌐\n\nBanco\nCompartido", use_container_width=True, key="btn_compartido"):
            st.session_state.pagina = "Banco Compartido"
            st.rerun()
    with col3:
        if st.button("➕\n\nAgregar\nPregunta", use_container_width=True, key="btn_agregar"):
            st.session_state.pagina = "Agregar Pregunta"
            st.rerun()
    with col4:
        if st.button("📰\n\nMis\nTextos", use_container_width=True, key="btn_textos"):
            st.session_state.pagina = "Mis Textos"
            st.rerun()
    with col5:
        if st.button("📝\n\nCrear\nPrueba", use_container_width=True, key="btn_prueba"):
            st.session_state.pagina = "Crear Prueba"
            st.rerun()
    with col6:
        if st.button("🤝\n\nMis\nColaboradores", use_container_width=True, key="btn_colaboradores"):
            st.session_state.pagina = "Colaboradores"
            st.rerun()
    with col7:
        if st.button("📄\n\nImportar\nDocumento", use_container_width=True, key="btn_importar"):
            st.session_state.pagina = "Importar Documento"
            st.rerun()

    st.markdown(ESTILOS_BOTONES, unsafe_allow_html=True)
    st.stop()

# ─────────────────────────────────────────────
# SUB-PÁGINAS
# ─────────────────────────────────────────────

def boton_volver():
    if st.button("← Volver"):
        st.session_state.pagina = None
        st.rerun()

# ── MIS PREGUNTAS ─────────────────────────────

if st.session_state.pagina == "Mis Preguntas":
    boton_volver()
    st.header(f"📖 Mis Preguntas — {asignatura}")

    df = cargar_preguntas_propias(usuario["id"], asignatura)

    if df.empty:
        st.info("Aún no tienes preguntas en esta asignatura. ¡Agrega la primera!")
    else:
        if "editando" not in st.session_state:
            st.session_state.editando = None

        st.write(f"**{len(df)} pregunta(s)**")
        for _, fila in df.iterrows():
            pid = fila["id"]
            compartida_actual = bool(fila["compartida"])
            editando = st.session_state.editando == pid

            with st.expander(f"{'🌐 ' if compartida_actual else '🔒 '} Materia: {fila['materia'] or '—'} | Contenido: {fila['contenido'] or '—'} | Nivel: {fila.get('nivel') or '—'}"):

                if not editando:
                    tipo_fila = fila.get("tipo") or "seleccion_multiple"
                    etiqueta_tipo = {"seleccion_multiple": "Selección múltiple", "desarrollo_corto": "Desarrollo corto", "desarrollo_largo": "Desarrollo largo"}.get(tipo_fila, tipo_fila)
                    st.caption(f"Tipo: {etiqueta_tipo}")
                    st.markdown(f"**{fila['pregunta']}**")
                    mostrar_imagen(fila.get("imagen_pregunta"), width=400)
                    if tipo_fila == "seleccion_multiple":
                        for letra in ["A", "B", "C", "D", "E"]:
                            val = fila.get(letra)
                            img_col = f"imagen_{letra}"
                            tiene_texto = pd.notna(val) and str(val).strip()
                            tiene_imagen = pd.notna(fila.get(img_col)) and str(fila.get(img_col)) != "nan"
                            if tiene_texto or tiene_imagen:
                                st.write(f"**{letra})**  {val if tiene_texto else ''}")
                                mostrar_imagen(fila.get(img_col), width=250)
                        st.success(f"Respuesta correcta: {fila['correcta']}")
                    if fila["explicacion"]:
                        st.info(fila["explicacion"])

                    OPCIONES_VIS = ["🔒 Privada", "🤝 Solo mis colaboradores", "🌐 Todos"]
                    vis_actual = int(fila["compartida"]) if pd.notna(fila["compartida"]) else 0
                    nueva_vis = st.radio("Visibilidad", OPCIONES_VIS, index=vis_actual, horizontal=True, key=f"vis_{pid}")
                    nuevo_val = OPCIONES_VIS.index(nueva_vis)
                    if nuevo_val != vis_actual:
                        toggle_compartida(pid, usuario["id"], nuevo_val)
                        st.rerun()

                    col_b, col_c = st.columns(2)
                    with col_b:
                        if st.button("✏️ Editar", key=f"edit_{pid}"):
                            st.session_state.editando = pid
                            st.rerun()
                    with col_c:
                        if st.button("🗑️ Eliminar", key=f"del_{pid}"):
                            eliminar_pregunta(pid, usuario["id"])
                            st.rerun()

                else:
                    st.markdown("#### ✏️ Editando pregunta")

                    e_mat = st.text_input("Materia", value=fila["materia"] or "", key=f"e_mat_{pid}")
                    e_cont = st.text_input("Contenido / Tema", value=fila["contenido"] or "", key=f"e_cont_{pid}")

                    niveles_base = ["PAES", "Plan Ministerial", "Bachillerato Internacional", "Otro"]
                    nivel_actual = fila.get("nivel") or "PAES"
                    idx_nivel = niveles_base.index(nivel_actual) if nivel_actual in niveles_base else 3
                    e_nivel_sel = st.selectbox("Nivel de la pregunta", niveles_base, index=idx_nivel, key=f"e_nivel_{pid}")
                    if e_nivel_sel == "Otro":
                        val_otro = nivel_actual if nivel_actual not in niveles_base else ""
                        e_nivel_otro = st.text_input("Especifica el nivel", value=val_otro, key=f"e_nivel_otro_{pid}")
                        e_nivel = e_nivel_otro.strip() if e_nivel_otro.strip() else "Otro"
                    else:
                        e_nivel = e_nivel_sel

                    e_preg = st.text_area("Pregunta", value=fila["pregunta"] or "", key=f"e_preg_{pid}")
                    mostrar_imagen(fila.get("imagen_pregunta"), width=300)
                    e_img_preg = st.file_uploader("Reemplazar imagen de pregunta", type=["png","jpg","jpeg"], key=f"e_up_preg_{pid}")

                    for letra, fkey in [("A","e_a"),("B","e_b"),("C","e_c"),("D","e_d"),("E","e_e")]:
                        col_t, col_i = st.columns([2,1])
                        with col_t:
                            locals()[fkey] = st.text_input(f"Alternativa {letra}", value=fila[letra] or "", key=f"{fkey}_{pid}")
                        with col_i:
                            mostrar_imagen(fila.get(f"imagen_{letra}"), width=150)
                            locals()[f"e_img_{letra.lower()}"] = st.file_uploader(f"Img {letra}", type=["png","jpg","jpeg"], key=f"e_up_{letra.lower()}_{pid}", label_visibility="collapsed")

                    e_a = locals()["e_a"]; e_b = locals()["e_b"]; e_c = locals()["e_c"]
                    e_d = locals()["e_d"]; e_e = locals()["e_e"]
                    e_img_a = locals()["e_img_a"]; e_img_b = locals()["e_img_b"]; e_img_c = locals()["e_img_c"]
                    e_img_d = locals()["e_img_d"]; e_img_e = locals()["e_img_e"]

                    letras = ["A", "B", "C", "D", "E"]
                    idx_correcta = letras.index(fila["correcta"]) if fila["correcta"] in letras else 0
                    e_correcta = st.selectbox("Respuesta correcta", letras, index=idx_correcta, key=f"e_correcta_{pid}")
                    e_explic = st.text_area("Explicación", value=fila["explicacion"] or "", key=f"e_explic_{pid}")
                    OPCIONES_VIS2 = ["🔒 Privada", "🤝 Solo mis colaboradores", "🌐 Todos"]
                    e_compartida = st.radio("Visibilidad", OPCIONES_VIS2, index=int(fila["compartida"]) if pd.notna(fila["compartida"]) else 0, horizontal=True, key=f"e_comp_{pid}")
                    e_compartida = OPCIONES_VIS2.index(e_compartida)

                    col_g, col_c2 = st.columns(2)
                    with col_g:
                        if st.button("💾 Guardar cambios", key=f"save_{pid}", use_container_width=True):
                            if not e_preg.strip():
                                st.warning("La pregunta no puede estar vacía.")
                            else:
                                actualizar_pregunta(
                                    pid, usuario["id"], e_mat, e_cont, e_nivel, e_preg,
                                    e_a, e_b, e_c, e_d, e_e, e_correcta, e_explic, e_compartida,
                                    guardar_imagen(e_img_preg),
                                    guardar_imagen(e_img_a), guardar_imagen(e_img_b),
                                    guardar_imagen(e_img_c), guardar_imagen(e_img_d),
                                    guardar_imagen(e_img_e),
                                )
                                st.session_state.editando = None
                                st.success("✅ Pregunta actualizada.")
                                st.rerun()
                    with col_c2:
                        if st.button("✕ Cancelar", key=f"cancel_{pid}", use_container_width=True):
                            st.session_state.editando = None
                            st.rerun()

# ── BANCO COMPARTIDO ──────────────────────────

elif st.session_state.pagina == "Banco Compartido":
    boton_volver()
    st.header(f"🌐 Banco Compartido — {asignatura}")
    st.caption("Preguntas que tus colegas han decidido compartir.")

    df = cargar_banco_compartido(asignatura, usuario["id"])

    if df.empty:
        st.info("Aún no hay preguntas compartidas en esta asignatura.")
    else:
        profesores = ["Todos"] + sorted(df["profesor"].unique().tolist())
        profesor_sel = st.selectbox("Filtrar por profesor", profesores)
        if profesor_sel != "Todos":
            df = df[df["profesor"] == profesor_sel]

        st.write(f"**{len(df)} pregunta(s)**")
        for _, fila in df.iterrows():
            with st.expander(f"🌐 Materia: {fila['materia'] or '—'} | Contenido: {fila['contenido'] or '—'} | Nivel: {fila.get('nivel') or '—'}"):
                st.caption(f"Publicado por: **{fila['profesor']}** · Materia: {fila['materia']} · Contenido: {fila['contenido']} · Nivel: {fila.get('nivel') or '—'}")
                mostrar_imagen(fila.get("imagen_pregunta"), width=400)
                for letra in ["A", "B", "C", "D", "E"]:
                    val = fila.get(letra)
                    img_col = f"imagen_{letra}"
                    tiene_texto = pd.notna(val) and str(val).strip()
                    tiene_imagen = pd.notna(fila.get(img_col)) and str(fila.get(img_col)) != "nan"
                    if tiene_texto or tiene_imagen:
                        st.write(f"**{letra})**  {val if tiene_texto else ''}")
                        mostrar_imagen(fila.get(img_col), width=250)
                st.success(f"Respuesta correcta: {fila['correcta']}")
                if fila["explicacion"]:
                    st.info(fila["explicacion"])

# ── BUSCAR PREGUNTAS ──────────────────────────

# ── MIS TEXTOS ────────────────────────────────

elif st.session_state.pagina == "Mis Textos":
    boton_volver()
    st.header(f"📰 Mis Textos — {asignatura}")

    tab_ver, tab_nuevo = st.tabs(["Ver mis textos", "Agregar nuevo texto"])

    with tab_nuevo:
        st.markdown("#### Nuevo texto")
        t_titulo = st.text_input("Título del texto", placeholder="Ej: Noticia sobre el cambio climático")
        t_contenido = st.text_area("Contenido del texto", height=200, placeholder="Pega o escribe el texto aquí...")
        OPCIONES_VIS_T = ["🔒 Privado", "🤝 Solo mis colaboradores", "🌐 Todos"]
        t_vis = st.radio("Visibilidad", OPCIONES_VIS_T, index=0, horizontal=True, key="t_vis")
        t_compartida = OPCIONES_VIS_T.index(t_vis)
        if st.button("Guardar texto", use_container_width=True):
            if not t_titulo.strip() or not t_contenido.strip():
                st.warning("Completa el título y el contenido.")
            else:
                nuevo_id = guardar_texto(usuario["id"], asignatura, t_titulo.strip(), t_contenido.strip(), t_compartida)
                st.success("✅ Texto guardado. Ahora puedes agregarle preguntas en la pestaña 'Ver mis textos'.")
                st.rerun()

    with tab_ver:
        df_textos = cargar_textos_propios(usuario["id"], asignatura)
        if df_textos.empty:
            st.info("Aún no tienes textos. Crea uno en la pestaña 'Agregar nuevo texto'.")
        else:
            for _, texto in df_textos.iterrows():
                tid = texto["id"]
                with st.expander(f"📰 {texto['titulo']}"):
                    st.markdown(texto["contenido"])
                    st.markdown("---")

                    df_preg_texto = cargar_preguntas_de_texto(tid)
                    if not df_preg_texto.empty:
                        st.markdown(f"**{len(df_preg_texto)} pregunta(s) asociada(s):**")
                        for _, fp in df_preg_texto.iterrows():
                            tipo_fp = fp.get("tipo") or "seleccion_multiple"
                            etiq = {"seleccion_multiple": "Selección múltiple", "desarrollo_corto": "Desarrollo corto", "desarrollo_largo": "Desarrollo largo"}.get(tipo_fp, tipo_fp)
                            st.markdown(f"- [{etiq}] **{fp['pregunta']}**")
                    else:
                        st.caption("Sin preguntas aún.")

                    st.markdown("#### Agregar pregunta a este texto")
                    tipo_opciones_t = {"Selección múltiple": "seleccion_multiple", "Desarrollo corto": "desarrollo_corto", "Desarrollo largo": "desarrollo_largo"}
                    tp_label = st.selectbox("Tipo", list(tipo_opciones_t.keys()), key=f"tp_tipo_{tid}")
                    tp_tipo = tipo_opciones_t[tp_label]
                    tp_materia = st.text_input("Materia", key=f"tp_mat_{tid}")
                    tp_contenido = st.text_input("Contenido / Tema", key=f"tp_cont_{tid}")
                    tp_nivel = st.selectbox("Nivel", ["PAES", "Plan Ministerial", "Bachillerato Internacional", "Otro"], key=f"tp_nivel_{tid}")
                    if tp_nivel == "Otro":
                        tp_nivel_otro = st.text_input("Especifica el nivel", key=f"tp_nivel_otro_{tid}")
                        tp_nivel = tp_nivel_otro.strip() or "Otro"
                    tp_preg = st.text_area("Pregunta", key=f"tp_preg_{tid}")

                    tp_a = tp_b = tp_c = tp_d = tp_e = tp_correcta = ""
                    if tp_tipo == "seleccion_multiple":
                        tp_a = st.text_input("Alternativa A", key=f"tp_a_{tid}")
                        tp_b = st.text_input("Alternativa B", key=f"tp_b_{tid}")
                        tp_c = st.text_input("Alternativa C", key=f"tp_c_{tid}")
                        tp_d = st.text_input("Alternativa D", key=f"tp_d_{tid}")
                        tp_e = st.text_input("Alternativa E (opcional)", key=f"tp_e_{tid}")
                        tp_correcta = st.selectbox("Respuesta correcta", ["A", "B", "C", "D", "E"], key=f"tp_correcta_{tid}")
                    elif tp_tipo == "desarrollo_corto":
                        st.caption("2 líneas para responder en el PDF.")
                    else:
                        st.caption("6 líneas para responder en el PDF.")

                    tp_explic = st.text_area("Explicación / pauta", key=f"tp_explic_{tid}")

                    if st.button("➕ Agregar pregunta al texto", key=f"tp_guardar_{tid}", use_container_width=True):
                        if not tp_preg.strip():
                            st.warning("Escribe la pregunta.")
                        else:
                            conn = get_conn()
                            conn.execute("""
                                INSERT INTO preguntas (user_id, asignatura, materia, contenido, nivel, pregunta, A, B, C, D, E, correcta, explicacion, compartida, tipo, texto_id)
                                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                            """, (usuario["id"], asignatura, tp_materia, tp_contenido, tp_nivel, tp_preg.strip(),
                                  tp_a, tp_b, tp_c, tp_d, tp_e, tp_correcta, tp_explic, 0, tp_tipo, tid))
                            conn.commit()
                            conn.close()
                            st.success("✅ Pregunta agregada.")
                            st.rerun()

                    st.markdown("---")
                    if st.button("🗑️ Eliminar este texto", key=f"del_texto_{tid}"):
                        eliminar_texto(tid, usuario["id"])
                        st.rerun()

# ── AGREGAR PREGUNTA ──────────────────────────

elif st.session_state.pagina == "Agregar Pregunta":
    boton_volver()
    st.header(f"➕ Agregar Pregunta — {asignatura}")

    col_mat, col_cont = st.columns(2)
    with col_mat:
        materia = st.text_input("Materia")
    with col_cont:
        contenido = st.text_input("Contenido / Tema")
    nivel_sel = st.selectbox("Nivel de la pregunta", ["PAES", "Plan Ministerial", "Bachillerato Internacional", "Otro"])
    if nivel_sel == "Otro":
        nivel_otro = st.text_input("Especifica el nivel", placeholder="Ej: Reforzamiento, Evaluación diagnóstica...")
        nivel = nivel_otro.strip() if nivel_otro.strip() else "Otro"
    else:
        nivel = nivel_sel
    tipo_opciones = {
        "Selección múltiple": "seleccion_multiple",
        "Desarrollo corto": "desarrollo_corto",
        "Desarrollo largo": "desarrollo_largo",
    }
    tipo_label = st.selectbox("Tipo de pregunta", list(tipo_opciones.keys()))
    tipo = tipo_opciones[tipo_label]

    pregunta = st.text_area("Pregunta")
    img_preg_file = st.file_uploader("Imagen para la pregunta (opcional)", type=["png","jpg","jpeg"], key="up_preg")
    if img_preg_file:
        st.image(img_preg_file, width=350)

    a = b = c = d = e = correcta = ""
    img_a_file = img_b_file = img_c_file = img_d_file = img_e_file = None

    if tipo == "seleccion_multiple":
        st.markdown("**Alternativas**")
        col_a1, col_a2 = st.columns([2, 1])
        with col_a1:
            a = st.text_input("Alternativa A")
        with col_a2:
            img_a_file = st.file_uploader("Imagen A", type=["png","jpg","jpeg"], key="up_a", label_visibility="collapsed")
            if img_a_file: st.image(img_a_file, width=150)

        col_b1, col_b2 = st.columns([2, 1])
        with col_b1:
            b = st.text_input("Alternativa B")
        with col_b2:
            img_b_file = st.file_uploader("Imagen B", type=["png","jpg","jpeg"], key="up_b", label_visibility="collapsed")
            if img_b_file: st.image(img_b_file, width=150)

        col_c1, col_c2 = st.columns([2, 1])
        with col_c1:
            c = st.text_input("Alternativa C")
        with col_c2:
            img_c_file = st.file_uploader("Imagen C", type=["png","jpg","jpeg"], key="up_c", label_visibility="collapsed")
            if img_c_file: st.image(img_c_file, width=150)

        col_d1, col_d2 = st.columns([2, 1])
        with col_d1:
            d = st.text_input("Alternativa D")
        with col_d2:
            img_d_file = st.file_uploader("Imagen D", type=["png","jpg","jpeg"], key="up_d", label_visibility="collapsed")
            if img_d_file: st.image(img_d_file, width=150)

        col_e1, col_e2 = st.columns([2, 1])
        with col_e1:
            e = st.text_input("Alternativa E")
        with col_e2:
            img_e_file = st.file_uploader("Imagen E", type=["png","jpg","jpeg"], key="up_e", label_visibility="collapsed")
            if img_e_file: st.image(img_e_file, width=150)

        correcta = st.selectbox("Respuesta correcta", ["A", "B", "C", "D", "E"])
    elif tipo == "desarrollo_corto":
        st.caption("El alumno dispondrá de 2 líneas para responder en el PDF.")
    else:
        st.caption("El alumno dispondrá de 6 líneas para responder en el PDF.")

    explicacion = st.text_area("Explicación / pauta")
    OPCIONES_VIS3 = ["🔒 Privada", "🤝 Solo mis colaboradores", "🌐 Todos"]
    vis_sel = st.radio("Visibilidad de la pregunta", OPCIONES_VIS3, index=0, horizontal=True)
    compartida = OPCIONES_VIS3.index(vis_sel)

    if st.button("Guardar Pregunta", use_container_width=True):
        if not pregunta.strip():
            st.warning("Escribe la pregunta antes de guardar.")
        elif not st.session_state.get("guardando_pregunta"):
            st.session_state.guardando_pregunta = True
            guardar_pregunta(
                usuario["id"], asignatura, materia, contenido, nivel, pregunta,
                a, b, c, d, e, correcta, explicacion, compartida,
                guardar_imagen(img_preg_file),
                guardar_imagen(img_a_file), guardar_imagen(img_b_file),
                guardar_imagen(img_c_file), guardar_imagen(img_d_file),
                guardar_imagen(img_e_file),
                tipo=tipo,
            )
            st.session_state.guardando_pregunta = False
            st.success("✅ Pregunta guardada correctamente")

# ── CREAR PRUEBA ──────────────────────────────

elif st.session_state.pagina == "Crear Prueba":
    boton_volver()
    st.header(f"📝 Crear Prueba — {asignatura}")

    conn = get_conn()
    df = pd.read_sql_query("""
        SELECT p.*, u.nombre as profesor
        FROM preguntas p
        JOIN usuarios u ON p.user_id = u.id
        WHERE p.asignatura=? AND (
            p.user_id=?
            OR p.compartida=2
            OR (p.compartida=1 AND EXISTS (
                SELECT 1 FROM colaboraciones c
                WHERE c.from_user_id=p.user_id AND c.to_user_id=?
            ))
        )
    """, conn, params=(asignatura, usuario["id"], usuario["id"]))
    conn.close()

    if df.empty:
        st.warning("No hay preguntas disponibles. Agrega preguntas o espera a que tus colegas compartan.")
        st.stop()

    st.markdown("#### Encabezado de la prueba")
    col_enc1, col_enc2, col_enc3 = st.columns(3)
    with col_enc1:
        titulo_prueba = st.text_input("Título de la prueba", placeholder="Ej: Prueba N°1 — Cinemática")
    with col_enc2:
        nombre_colegio = st.text_input("Nombre del colegio", placeholder="Ej: Colegio San José")
    with col_enc3:
        nombre_profesor = st.text_input("Nombre del profesor/a", value=usuario["nombre"])

    logos_disponibles = [f for f in os.listdir(".") if f.lower().endswith((".png", ".jpg", ".jpeg"))]
    logo_opciones = ["Sin logo"] + logos_disponibles
    indice_default = logo_opciones.index("Dunalastair.png") if "Dunalastair.png" in logo_opciones else 0
    logo_sel = st.selectbox("Logo del colegio", logo_opciones, index=indice_default)
    logo_bytes = open(logo_sel, "rb").read() if logo_sel != "Sin logo" else None

    st.markdown("---")
    st.markdown("#### Filtrar preguntas")
    col_a, col_b, col_c = st.columns(3)
    with col_a:
        materias = ["Todas"] + sorted(df["materia"].dropna().unique().tolist())
        materia_sel = st.selectbox("Materia", materias, key="prueba_materia")
    with col_b:
        temas = ["Todos"] + sorted(df["contenido"].dropna().unique().tolist())
        tema_sel = st.selectbox("Contenido", temas, key="prueba_tema")
    with col_c:
        profesores_opts = ["Todos"] + sorted(df["profesor"].unique().tolist())
        prof_sel = st.selectbox("Profesor", profesores_opts, key="prueba_prof")

    df_f = df.copy()
    if materia_sel != "Todas":
        df_f = df_f[df_f["materia"] == materia_sel]
    if tema_sel != "Todos":
        df_f = df_f[df_f["contenido"] == tema_sel]
    if prof_sel != "Todos":
        df_f = df_f[df_f["profesor"] == prof_sel]

    # ── Textos disponibles para incluir ──────────
    df_textos_prueba = cargar_textos_propios(usuario["id"], asignatura)
    textos_seleccionados = {}  # texto_id -> info

    if not df_textos_prueba.empty:
        st.markdown("#### Textos con preguntas asociadas (opcional)")
        st.caption("Al seleccionar un texto, se incluirá completo en la prueba seguido de todas sus preguntas.")
        for _, txt in df_textos_prueba.iterrows():
            preg_txt = cargar_preguntas_de_texto(txt["id"])
            if preg_txt.empty:
                continue
            checked_txt = st.checkbox(
                f"📰 {txt['titulo']} ({len(preg_txt)} pregunta(s))",
                key=f"txt_{txt['id']}"
            )
            if checked_txt:
                textos_seleccionados[txt["id"]] = {"titulo": txt["titulo"], "contenido": txt["contenido"]}
                with st.expander(f"Vista previa: {txt['titulo']}", expanded=False):
                    st.markdown(txt["contenido"])
                    for _, fp in preg_txt.iterrows():
                        st.markdown(f"- {fp['pregunta']}")

    st.markdown(f"#### Preguntas sueltas ({len(df_f)} disponibles)")
    st.caption("Estas preguntas no pertenecen a ningún texto.")

    # Excluir del listado las preguntas que ya pertenecen a textos seleccionados
    ids_en_textos = set()
    for tid in textos_seleccionados:
        ptt = cargar_preguntas_de_texto(tid)
        ids_en_textos.update(ptt["id"].tolist())

    df_f_sueltas = df_f[~df_f["id"].isin(ids_en_textos)] if ids_en_textos else df_f

    seleccionadas = []
    for idx, fila in df_f_sueltas.iterrows():
        col_check, col_texto = st.columns([0.05, 0.95])
        with col_check:
            checked = st.checkbox("", key=f"preg_{fila['id']}")
        with col_texto:
            tipo_fila = fila.get("tipo") or "seleccion_multiple"
            etiq_tipo = {"seleccion_multiple": "Selección múltiple", "desarrollo_corto": "Desarrollo corto", "desarrollo_largo": "Desarrollo largo"}.get(tipo_fila, tipo_fila)
            with st.expander(f"[{etiq_tipo}] Materia: {fila['materia'] or '—'} | {fila['contenido'] or '—'} | {fila.get('nivel') or '—'}"):
                st.caption(f"Profesor: {fila['profesor']}")
                st.markdown(f"**{fila['pregunta']}**")
                if tipo_fila == "seleccion_multiple":
                    for letra in ["A", "B", "C", "D", "E"]:
                        val = fila.get(letra)
                        if pd.notna(val) and str(val).strip():
                            st.write(f"{letra}) {val}")
                    if fila.get("correcta"):
                        st.success(f"Respuesta: {fila['correcta']}")
        if checked:
            seleccionadas.append(fila)

    st.markdown("---")
    st.markdown("#### Instrucciones (opcional)")
    instrucciones = st.text_area("Instrucciones", placeholder="Ej: Lee atentamente cada pregunta y marca la alternativa correcta.", height=80, label_visibility="collapsed")

    st.markdown("#### Formulario (opcional)")
    st.caption("Escribe cada fórmula en notación LaTeX.")

    col_input, col_add = st.columns([0.85, 0.15])
    with col_input:
        nueva_formula = st.text_input("Nueva fórmula", key="formula_input", label_visibility="collapsed", placeholder="Ej: v^2 = v_0^2 + 2a\\Delta x")
    with col_add:
        if st.button("＋ Agregar", use_container_width=True) and nueva_formula.strip():
            st.session_state.formulas_lista.append(nueva_formula.strip())
            st.rerun()

    for fi, expr in enumerate(st.session_state.formulas_lista):
        col_prev, col_del = st.columns([0.9, 0.1])
        with col_prev:
            st.latex(expr)
        with col_del:
            if st.button("✕", key=f"del_formula_{fi}"):
                st.session_state.formulas_lista.pop(fi)
                st.rerun()

    st.markdown("---")

    # Armar df final: preguntas de textos + sueltas
    todas_seleccionadas = list(seleccionadas)
    for tid in textos_seleccionados:
        ptt = cargar_preguntas_de_texto(tid)
        for _, fp in ptt.iterrows():
            todas_seleccionadas.append(fp)

    if todas_seleccionadas or textos_seleccionados:
        df_sel = pd.DataFrame(todas_seleccionadas) if todas_seleccionadas else pd.DataFrame()
        n_preg = len(df_sel)
        n_txt = len(textos_seleccionados)
        st.success(f"**{n_preg} pregunta(s)** · **{n_txt} texto(s)** seleccionado(s)")

        with st.expander("👁️ Ver borrador de la prueba", expanded=False):
            st.markdown(f"## {titulo_prueba or 'Prueba'}")
            if instrucciones.strip():
                st.markdown(f"*{instrucciones}*")
            st.markdown("---")
            num = 1
            for tid, info in textos_seleccionados.items():
                st.markdown(f"**{info['titulo']}**")
                st.markdown(info["contenido"])
                ptt = cargar_preguntas_de_texto(tid)
                for _, fp in ptt.iterrows():
                    st.markdown(f"**{num}. {fp['pregunta']}**")
                    num += 1
            for fila in seleccionadas:
                st.markdown(f"**{num}. {fila['pregunta']}**")
                num += 1

        if not df_sel.empty:
            pdf_buffer = generar_pdf(
                titulo_prueba, asignatura, df_sel,
                nombre_colegio, nombre_profesor, logo_bytes,
                instrucciones=instrucciones,
                formulas=st.session_state.formulas_lista,
                textos_dict=textos_seleccionados if textos_seleccionados else None,
            )
            nombre_archivo = f"prueba_{asignatura.lower().replace('í','i').replace('ó','o').replace('é','e')}.pdf"
            st.download_button(
                label="⬇️ Descargar prueba en PDF",
                data=pdf_buffer,
                file_name=nombre_archivo,
                mime="application/pdf",
                use_container_width=True,
            )
    else:
        st.info("Selecciona al menos una pregunta o texto para generar la prueba.")

# ── MIS COLABORADORES ─────────────────────────

elif st.session_state.pagina == "Colaboradores":
    boton_volver()
    st.header("🤝 Mis Colaboradores")

    tab1, tab2 = st.tabs(["Colegas que puedo ver", "Quién me puede ver a mí"])

    with tab1:
        st.markdown("Estos colegas te han dado acceso a sus preguntas compartidas.")
        invitantes = cargar_quienes_me_invitaron(usuario["id"])
        if not invitantes:
            st.info("Aún ningún colega te ha invitado.")
        else:
            for uid, nombre, email in invitantes:
                st.markdown(f"- **{nombre}**")

    with tab2:
        st.markdown("Los colegas de tu lista pueden ver las preguntas que marques como **compartidas**.")

        colaboradores = cargar_colaboradores(usuario["id"])
        if colaboradores:
            st.markdown("**Lista actual:**")
            for uid, nombre, email in colaboradores:
                col_n, col_b = st.columns([4, 1])
                col_n.markdown(f"👤 **{nombre}**")
                if col_b.button("Quitar", key=f"quitar_{uid}"):
                    eliminar_colaborador(usuario["id"], uid)
                    st.rerun()
        else:
            st.info("Aún no has invitado a ningún colega.")

        st.markdown("---")
        st.markdown("#### Agregar colega")
        todos = todos_los_usuarios(usuario["id"])
        ids_ya_agregados = {uid for uid, _, _ in colaboradores} if colaboradores else set()
        disponibles = [(uid, nombre, email) for uid, nombre, email in todos if uid not in ids_ya_agregados]

        if not disponibles:
            st.info("No hay más profesores registrados para agregar.")
        else:
            opciones = {nombre: uid for uid, nombre, email in disponibles}
            seleccion = st.selectbox("Selecciona un colega para invitar", list(opciones.keys()))
            if st.button("➕ Agregar colaborador", use_container_width=True):
                agregar_colaborador(usuario["id"], opciones[seleccion])
                st.success(f"✅ {seleccion} puede ver ahora tus preguntas compartidas.")
                st.rerun()

# ── IMPORTAR DOCUMENTO ────────────────────────

elif st.session_state.pagina == "Importar Documento":
    boton_volver()
    st.header(f"📄 Importar Preguntas desde Documento — {asignatura}")
    st.caption("Sube un PDF, Word o imagen. La IA detectará las preguntas automáticamente.")

    api_key = st.text_input("API Key de Claude (Anthropic)", type="password",
                            help="Tu clave se usa solo para esta sesión y no se guarda.")

    archivo = st.file_uploader("Sube el documento", type=["pdf", "docx", "png", "jpg", "jpeg"])

    if archivo and api_key:
        if st.button("🔍 Detectar preguntas", use_container_width=True):
            with st.spinner("Leyendo documento y detectando preguntas con IA..."):
                try:
                    file_bytes = archivo.read()
                    nombre = archivo.name.lower()

                    if nombre.endswith(".pdf"):
                        texto = extraer_texto_pdf(file_bytes)
                    elif nombre.endswith(".docx"):
                        texto = extraer_texto_docx(file_bytes)
                    else:
                        texto = extraer_texto_imagen(file_bytes, archivo.name)

                    if not texto.strip():
                        st.error("No se pudo extraer texto del documento. Intenta con otro archivo.")
                    else:
                        preguntas = detectar_preguntas_con_claude(texto, asignatura, api_key)
                        st.session_state.preguntas_importadas = preguntas
                        st.success(f"✅ Se detectaron {len(preguntas)} pregunta(s). Revísalas antes de guardar.")
                except json.JSONDecodeError:
                    st.error("La IA no pudo estructurar las preguntas. Intenta con un documento más claro.")
                except Exception as e:
                    st.error(f"Error: {e}")

    if st.session_state.get("preguntas_importadas"):
        preguntas = st.session_state.preguntas_importadas
        st.markdown(f"### {len(preguntas)} pregunta(s) detectadas")
        st.caption("Puedes editar cada pregunta antes de guardarla. Desmarca las que no quieras importar.")
        st.markdown("---")

        OPCIONES_VIS_IMP = ["🔒 Privada", "🤝 Solo mis colaboradores", "🌐 Todos"]
        vis_imp = st.radio("Visibilidad para todas las preguntas importadas", OPCIONES_VIS_IMP, horizontal=True, index=0, key="vis_importar")
        vis_val = OPCIONES_VIS_IMP.index(vis_imp)

        col_mat_i, col_cont_i = st.columns(2)
        with col_mat_i:
            materia_imp = st.text_input("Materia (se aplica a todas)", key="mat_imp")
        with col_cont_i:
            contenido_imp = st.text_input("Contenido / Tema (se aplica a todas)", key="cont_imp")

        niveles_imp = ["PAES", "Plan Ministerial", "Bachillerato Internacional", "Otro"]
        nivel_imp = st.selectbox("Nivel (se aplica a todas)", niveles_imp, key="nivel_imp")

        seleccionadas_imp = []
        for i, p in enumerate(preguntas):
            with st.expander(f"Pregunta {i+1} — {p.get('pregunta','')[:80]}"):
                incluir = st.checkbox("Incluir esta pregunta", value=True, key=f"inc_{i}")
                p["pregunta"] = st.text_area("Pregunta", value=p.get("pregunta",""), key=f"imp_preg_{i}")
                for letra in ["A","B","C","D","E"]:
                    val = p.get(letra) or ""
                    p[letra] = st.text_input(f"Alternativa {letra}", value=val if val and val != "None" else "", key=f"imp_{letra}_{i}")
                letras_v = ["A","B","C","D","E"]
                correcta_actual = p.get("correcta") or "A"
                if correcta_actual not in letras_v:
                    correcta_actual = "A"
                p["correcta"] = st.selectbox("Respuesta correcta", letras_v,
                                              index=letras_v.index(correcta_actual), key=f"imp_cor_{i}")
                p["explicacion"] = st.text_area("Explicación", value=p.get("explicacion",""), key=f"imp_exp_{i}")
                if incluir:
                    seleccionadas_imp.append(p)

        st.markdown("---")
        if seleccionadas_imp:
            if st.button(f"💾 Guardar {len(seleccionadas_imp)} pregunta(s) en el banco", use_container_width=True):
                for p in seleccionadas_imp:
                    guardar_pregunta(
                        usuario["id"], asignatura,
                        materia_imp, contenido_imp, nivel_imp,
                        p["pregunta"],
                        p.get("A",""), p.get("B",""), p.get("C",""), p.get("D",""), p.get("E",""),
                        p.get("correcta","A"), p.get("explicacion",""),
                        vis_val,
                    )
                st.success(f"✅ {len(seleccionadas_imp)} pregunta(s) guardadas correctamente.")
                st.session_state.preguntas_importadas = None
                st.rerun()
