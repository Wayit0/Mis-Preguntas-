import Link from "next/link";
import { getSession } from "@/lib/get-session";
import { buttonVariants } from "@/components/ui/button";
import { Logo, Isotipo } from "@/components/brand/logo";
import { Revelar } from "@/components/marketing/revelar";
import { lanzamientoGratis } from "@/lib/suscripciones/lanzamiento";

// ---------------------------------------------------------------------------
// Portada pública. Estructura: hero (tesis: de la pregunta al PDF) → cómo
// funciona (pasos maquetados como alternativas A–D, el vernáculo del producto)
// → funciones → tres profundizaciones (IA, PDF en papel, colegio) → FAQ → CTA.
// Si hay sesión, los CTA llevan al panel en vez de a registro/login.
// ---------------------------------------------------------------------------

const PASOS = [
  {
    letra: "A",
    titulo: "Reúne tus preguntas",
    texto:
      "Escríbelas con imágenes y fórmulas, o sube un PDF, Word o foto y deja que la IA las detecte. Tú revisas y guardas.",
  },
  {
    letra: "B",
    titulo: "Organízalas a tu manera",
    texto:
      "Carpetas, asignaturas, materias y niveles —PAES, Plan Ministerial o Bachillerato Internacional—. Todo con buscador.",
  },
  {
    letra: "C",
    titulo: "Arma la prueba",
    texto:
      "Elige las preguntas, suma textos de comprensión, instrucciones y formulario. Reordena como quieras.",
  },
  {
    letra: "D",
    titulo: "Descarga el PDF y compártela",
    texto:
      "Lista para imprimir en formato estándar o estilo IB, con el logo de tu colegio. Y tu banco queda disponible para tus colegas.",
    correcta: true,
  },
];

const FUNCIONES = [
  {
    icono: "📖",
    titulo: "Tu banco de preguntas",
    texto:
      "Selección múltiple, desarrollo o verdadero/falso, con imágenes en el enunciado y en las alternativas. Filtra por materia, nivel y estado.",
  },
  {
    icono: "🤖",
    titulo: "Importa con IA",
    texto:
      "Sube un PDF (hasta 10 páginas), un Word o una foto de una guía. La IA detecta preguntas, alternativas e imágenes; tú revisas antes de guardar.",
  },
  {
    icono: "🧮",
    titulo: "Fórmulas y textos",
    texto:
      "Ecuaciones LaTeX que se imprimen perfectas, y textos de comprensión lectora con sus preguntas asociadas.",
  },
  {
    icono: "📁",
    titulo: "Carpetas",
    texto:
      "Ordena preguntas, pruebas y textos en carpetas y subcarpetas, como en tu computador. Mueve, renombra y navega sin perder nada.",
  },
  {
    icono: "📄",
    titulo: "PDF listo para imprimir",
    texto:
      "Formato estándar o estilo IB: caja de instrucciones, líneas de respuesta punteadas, formulario y encabezado con tu colegio.",
  },
  {
    icono: "🏫",
    titulo: "Tu colegio, en equipo",
    texto:
      "Únete con un código o con tu correo institucional. El banco compartido crece con cada profe; también puedes invitar colaboradores externos.",
  },
];

const PREGUNTAS_FRECUENTES = [
  {
    p: "¿Cuánto cuesta EduBox?",
    r: "Crear tu cuenta es gratis. Regístrate con tu correo o con Google y empieza a armar tu banco de inmediato.",
  },
  {
    p: "¿Qué archivos puedo importar?",
    r: "PDF (hasta 10 páginas), Word (.docx) e imágenes. La IA detecta las preguntas, sus alternativas y las imágenes incrustadas; tú revisas todo antes de guardar en tu banco.",
  },
  {
    p: "¿Cómo se une mi colegio?",
    r: "De tres formas: con el código de unión que comparte tu coordinación, automáticamente al verificar tu correo institucional, o creando tú mismo el colegio y quedando como su administrador.",
  },
  {
    p: "¿Puedo escribir fórmulas?",
    r: "Sí. Escribe LaTeX entre signos $ en el enunciado o en las alternativas —por ejemplo $v = d/t$— y se renderiza en la app y en el PDF impreso.",
  },
  {
    p: "¿Mis preguntas son privadas?",
    r: "Sí, todo lo que creas es privado por defecto. Tú decides qué compartir con tu colegio o con tus colaboradores. Puedes leer más en nuestra Política de Privacidad.",
  },
  {
    p: "¿Qué formatos de prueba genera?",
    r: "Dos: el formato estándar y uno estilo Bachillerato Internacional (A4, tipografía serif, caja de instrucciones y líneas punteadas para las respuestas). Ambos admiten logo, instrucciones y formulario.",
  },
];

export default async function Home() {
  const session = await getSession();
  const autenticado = session !== null;
  const ctaPrincipalHref = autenticado ? "/dashboard" : "/registro";
  const ctaPrincipalTexto = autenticado ? "Ir al panel" : "Crear cuenta gratis";
  const gratisPorLanzamiento = lanzamientoGratis();

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      {/* ── Barra superior ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/" aria-label="EduBox — inicio">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <div className="hidden items-center gap-1 md:flex">
              {[
                { href: "#como-funciona", texto: "Cómo funciona" },
                { href: "#funciones", texto: "Funciones" },
                { href: "#preguntas", texto: "Preguntas" },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.texto}
                </a>
              ))}
              <Link
                href="/precios"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Precios
              </Link>
            </div>
            {autenticado ? (
              <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
                Ir al panel
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Iniciar sesión
                </Link>
                <Link href="/registro" className={buttonVariants({ size: "sm" })}>
                  Crear cuenta
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 right-[-10%] h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl"
          />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="animar-subir flex flex-col gap-6">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium tracking-wide text-primary">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-accent-amber"
                />
                Para profesores
              </span>
              <h1 className="font-heading text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]">
                De tus preguntas a una{" "}
                <span className="text-primary">prueba en PDF</span>, en minutos.
              </h1>
              <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                EduBox reúne todas tus preguntas en un solo lugar —con imágenes
                y fórmulas— y las convierte en evaluaciones listas para
                imprimir. Compártelas con tu colegio y deja de armar cada
                prueba desde cero.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={ctaPrincipalHref}
                  className={buttonVariants({
                    size: "lg",
                    className: "w-full sm:w-auto",
                  })}
                >
                  {ctaPrincipalTexto}
                </Link>
                <a
                  href="#como-funciona"
                  className={buttonVariants({
                    variant: "outline",
                    size: "lg",
                    className: "w-full sm:w-auto",
                  })}
                >
                  Ver cómo funciona
                </a>
              </div>
              {gratisPorLanzamiento && (
                <p className="text-sm text-muted-foreground">
                  Estamos en versión de lanzamiento:{" "}
                  <Link
                    href="/precios"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    las funciones Pro son gratis para todos
                  </Link>
                  , sin tarjeta.
                </p>
              )}
              <p className="font-mono text-xs text-muted-foreground">
                Física · Química · Biología · Matemáticas · Filosofía ·
                Lenguaje · y más
              </p>
            </div>

            {/* Firma del hero: una pregunta real con su alternativa correcta. */}
            <div className="animar-subir relative">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-primary/5 sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-secondary px-2 py-1 font-mono text-[11px] font-medium text-primary">
                    Física · Mecánica
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    <span className="text-primary">●</span> Compartida
                  </span>
                </div>
                <p className="mt-4 text-[15px] font-medium leading-snug text-card-foreground">
                  Se lanza una piedra hacia abajo desde un acantilado a 5,0 m/s
                  y golpea el suelo 2,0 s después. ¿Cuál es la altura del
                  acantilado?
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {[
                    { l: "A", t: "20 m", ok: false },
                    { l: "B", t: "30 m", ok: true },
                    { l: "C", t: "40 m", ok: false },
                    { l: "D", t: "50 m", ok: false },
                  ].map((o) => (
                    <li
                      key={o.l}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                        o.ok
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-background/60"
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold ${
                          o.ok
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {o.l}
                      </span>
                      <span
                        className={
                          o.ok
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {o.t}
                      </span>
                      {o.ok ? (
                        <span className="ml-auto font-mono text-xs text-primary">
                          correcta ✓
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex items-center justify-between border-t border-border pt-4 font-mono text-xs text-muted-foreground">
                  <span>Pregunta 1 de 12</span>
                  <span className="text-foreground">→ Prueba.pdf</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Cómo funciona: el flujo como alternativas A–D ─────────── */}
        <section
          id="como-funciona"
          className="scroll-mt-20 border-t border-border bg-card/50"
        >
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
            <Revelar>
              <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
                Cómo funciona
              </p>
              <h2 className="mt-2 max-w-2xl font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Cuatro pasos, como una buena pregunta.
              </h2>
            </Revelar>
            <div className="mt-10 grid gap-3 lg:grid-cols-2">
              {PASOS.map((paso, i) => (
                <Revelar key={paso.letra} retrasoMs={i * 80}>
                  <div
                    className={`flex h-full gap-4 rounded-xl border p-5 transition-colors sm:p-6 ${
                      paso.correcta
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-base font-semibold ${
                        paso.correcta
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {paso.letra}
                    </span>
                    <div className="flex flex-col gap-1.5">
                      <h3 className="flex flex-wrap items-center gap-2 font-heading text-lg font-semibold tracking-tight">
                        {paso.titulo}
                        {paso.correcta ? (
                          <span className="font-mono text-xs font-medium text-primary">
                            correcta ✓
                          </span>
                        ) : null}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {paso.texto}
                      </p>
                    </div>
                  </div>
                </Revelar>
              ))}
            </div>
          </div>
        </section>

        {/* ── Funciones ─────────────────────────────────────────────── */}
        <section id="funciones" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
            <Revelar>
              <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
                Funciones
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Todo lo que necesitas para evaluar
              </h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Pensado para el día a día en la sala: rápido, claro y en tu
                idioma.
              </p>
            </Revelar>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FUNCIONES.map((f, i) => (
                <Revelar key={f.titulo} retrasoMs={(i % 3) * 80}>
                  <div className="flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
                    <span className="text-2xl" aria-hidden>
                      {f.icono}
                    </span>
                    <h3 className="font-heading text-lg font-semibold tracking-tight">
                      {f.titulo}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {f.texto}
                    </p>
                  </div>
                </Revelar>
              ))}
            </div>
          </div>
        </section>

        {/* ── Profundización 1: importar con IA ─────────────────────── */}
        <section className="border-t border-border bg-card/50">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16">
            <Revelar>
              <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
                Importar con IA
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight">
                Esa guía que ya tienes, adentro en un minuto.
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Sube el PDF, el Word o una foto de tu guía de siempre. La IA
                detecta cada pregunta con sus alternativas, sus imágenes y su
                respuesta correcta; tú revisas el resultado, corriges lo que
                quieras y lo guardas en tu banco.
              </p>
              <ul className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground">
                {[
                  "PDF de hasta 10 páginas, Word o imagen",
                  "Detecta imágenes del enunciado y de las alternativas",
                  "Tú revisas todo antes de guardar",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] text-primary"
                    >
                      ✓
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </Revelar>
            <Revelar retrasoMs={120}>
              {/* Visual: archivo → preguntas detectadas */}
              <div
                aria-hidden
                className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-primary/5 sm:p-6"
              >
                <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-background/60 px-4 py-3">
                  <span className="flex items-center gap-2.5 font-mono text-xs text-foreground">
                    <span className="text-base">📄</span> guia_cinematica.pdf
                  </span>
                  <span className="rounded-full bg-accent-amber px-2.5 py-0.5 font-mono text-[11px] font-semibold text-accent-amber-foreground">
                    12 detectadas
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {[
                    "Un móvil recorre 40 m en 8 s. ¿Cuál es su rapidez media?",
                    "¿Qué gráfico representa un MRU? (con imagen)",
                    "Calcula $v_f = v_0 + at$ para t = 3 s…",
                  ].map((q, i) => (
                    <div
                      key={q}
                      className="flex items-start gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 font-mono text-[10px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <p className="text-[13px] leading-snug text-muted-foreground">
                        {q}
                      </p>
                      <span className="ml-auto mt-0.5 font-mono text-[11px] text-primary">
                        ✓
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-center font-mono text-[11px] text-muted-foreground">
                  … y 9 preguntas más listas para revisar
                </p>
              </div>
            </Revelar>
          </div>
        </section>

        {/* ── Profundización 2: el PDF (hoja de prueba en papel) ────── */}
        <section>
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16">
            <Revelar className="order-2 lg:order-1" retrasoMs={120}>
              {/* Visual: hoja de prueba estilo IB con hoja de respaldo detrás */}
              <div aria-hidden className="relative mx-auto max-w-md">
                <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-[1.2deg] rounded-xl border border-border bg-card" />
                <div className="relative -rotate-[0.8deg] rounded-xl border border-border bg-card p-6 shadow-[0_12px_32px_rgba(23,33,27,0.08)] sm:p-8">
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-2.5">
                      <Isotipo className="h-7" />
                      <div>
                        <p className="font-heading text-sm font-bold text-foreground">
                          Prueba de Física
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          Cinemática · 2° Medio
                        </p>
                      </div>
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      Nombre: ………………
                    </p>
                  </div>
                  <div className="mt-4 rounded-md border border-border px-3 py-2">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Instrucciones
                    </p>
                    <p className="mt-1 font-heading text-[11px] italic leading-relaxed text-muted-foreground">
                      Responde con lápiz pasta. No se permite calculadora.
                    </p>
                  </div>
                  <div className="mt-5 space-y-1.5">
                    <p className="font-heading text-[12px] font-semibold text-foreground">
                      1. Un cuerpo parte del reposo con aceleración constante…
                    </p>
                    <div className="flex flex-col gap-1 pl-4 pt-1">
                      {["A", "B", "C", "D"].map((l) => (
                        <p
                          key={l}
                          className="font-mono text-[11px] text-muted-foreground"
                        >
                          {l}){" "}
                          <span className="font-heading italic">
                            {l === "B" ? "v = a · t" : "…"}
                          </span>
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    <p className="font-heading text-[12px] font-semibold text-foreground">
                      2. Explica la diferencia entre rapidez y velocidad.
                    </p>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="border-b-2 border-dotted border-border"
                      />
                    ))}
                  </div>
                  <p className="mt-6 text-center font-mono text-[10px] text-muted-foreground">
                    — Página 1 de 4 —
                  </p>
                </div>
              </div>
            </Revelar>
            <Revelar className="order-1 lg:order-2">
              <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
                El PDF
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight">
                Se imprime como si la hubieras diagramado tú.
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Cada prueba sale con encabezado, instrucciones, formulario y el
                logo de tu colegio. Elige el formato estándar o el estilo
                Bachillerato Internacional, con su caja de instrucciones y
                líneas punteadas para responder.
              </p>
              <ul className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground">
                {[
                  "Fórmulas LaTeX impresas con calidad de libro",
                  "Imágenes en tamaño chico, mediano o grande",
                  "Tus instrucciones se recuerdan para la próxima",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] text-primary"
                    >
                      ✓
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </Revelar>
          </div>
        </section>

        {/* ── Profundización 3: colegio ─────────────────────────────── */}
        <section className="border-t border-border bg-card/50">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16">
            <Revelar>
              <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
                Tu colegio
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight">
                El banco que arma un profe, lo aprovechan todos.
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Únete a tu colegio con un código o con tu correo institucional.
                Lo que cada profesor comparte queda en el banco común, listo
                para que sus colegas lo usen en sus propias pruebas. ¿Trabajas
                con alguien de otro colegio? Invítalo como colaborador.
              </p>
              <div className="mt-6">
                <Link
                  href={ctaPrincipalHref}
                  className={buttonVariants({ variant: "outline" })}
                >
                  {autenticado ? "Ir a mi colegio" : "Unir a mi colegio"}
                </Link>
              </div>
            </Revelar>
            <Revelar retrasoMs={120}>
              {/* Visual: banco compartido del colegio */}
              <div
                aria-hidden
                className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-primary/5 sm:p-6"
              >
                <div className="flex items-center justify-between">
                  <p className="font-heading text-sm font-bold text-foreground">
                    🏫 Colegio San Martín
                  </p>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-primary">
                    banco compartido
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {[
                    { n: "Carolina P.", d: "84 preguntas · Física" },
                    { n: "Rodrigo M.", d: "56 preguntas · Matemáticas" },
                    { n: "Fernanda S.", d: "112 preguntas · Lenguaje" },
                  ].map((p) => (
                    <div
                      key={p.n}
                      className="flex items-center gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs font-semibold text-primary">
                        {p.n[0]}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {p.n}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {p.d}
                        </p>
                      </div>
                      <span className="ml-auto font-mono text-[11px] text-primary">
                        ● compartido
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3.5 font-mono text-xs text-muted-foreground">
                  <span>252 preguntas en el banco</span>
                  <span className="text-foreground">3 profesores</span>
                </div>
              </div>
            </Revelar>
          </div>
        </section>

        {/* ── Preguntas frecuentes ──────────────────────────────────── */}
        <section id="preguntas" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-20">
            <Revelar>
              <p className="text-center font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
                Preguntas frecuentes
              </p>
              <h2 className="mt-2 text-center font-heading text-3xl font-bold tracking-tight">
                Lo que siempre nos preguntan
              </h2>
            </Revelar>
            <div className="mt-8 flex flex-col gap-3">
              {PREGUNTAS_FRECUENTES.map((f, i) => (
                <Revelar key={f.p} retrasoMs={i * 50}>
                  <details className="group rounded-xl border border-border bg-card open:border-primary/40">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                      {f.p}
                      <span
                        aria-hidden
                        className="font-mono text-lg text-muted-foreground transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                      {f.r}
                    </p>
                  </details>
                </Revelar>
              ))}
            </div>
          </div>
        </section>

        {/* ── Banda CTA (tinta) ─────────────────────────────────────── */}
        <section className="bg-sidebar text-sidebar-foreground">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-5 py-14 sm:flex-row sm:items-center sm:justify-between sm:py-16">
            <div className="max-w-xl">
              <h2 className="font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Arma tu próxima prueba hoy
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-sidebar-foreground/80">
                Crea tu cuenta gratis o únete al banco de tu colegio con el
                código que te compartió tu coordinación.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href={ctaPrincipalHref}
                className={buttonVariants({
                  size: "lg",
                  className: "w-full sm:w-auto",
                })}
              >
                {autenticado ? "Ir al panel" : "Crear cuenta"}
              </Link>
              <Link
                href="/login"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className:
                    "w-full border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto",
                })}
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-sm text-muted-foreground sm:flex-row">
          <Logo isoClassName="h-5" className="[&_span]:text-base" />
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span>Banco de preguntas y pruebas para docentes</span>
            <Link href="/precios" className="hover:text-foreground">
              Precios
            </Link>
            <Link href="/privacidad" className="hover:text-foreground">
              Privacidad
            </Link>
            <Link href="/terminos" className="hover:text-foreground">
              Términos
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
