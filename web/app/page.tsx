import Link from "next/link";
import { getSession } from "@/lib/get-session";
import { buttonVariants } from "@/components/ui/button";

// Portada pública. Si hay sesión, el CTA principal lleva al panel en vez de a login.
export default async function Home() {
  const session = await getSession();
  const autenticado = session !== null;

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      {/* ── Barra superior ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap font-heading text-lg font-semibold tracking-tight">
            <span aria-hidden>📚</span> Mis Preguntas
          </span>
          <nav className="flex items-center gap-2">
            {autenticado ? (
              <Link
                href="/dashboard"
                className={buttonVariants({ size: "sm" })}
              >
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
                <Link
                  href="/registro"
                  className={buttonVariants({ size: "sm" })}
                >
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
          {/* resplandor esmeralda sutil */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 right-[-10%] h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl"
          />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="animar-subir flex flex-col gap-6">
              <span className="w-fit rounded-full border border-border bg-card px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Para profesores
              </span>
              <h1 className="font-heading text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                De tus preguntas a una{" "}
                <span className="text-primary">prueba en PDF</span>, en minutos.
              </h1>
              <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                Mis Preguntas reúne todas tus preguntas en un solo lugar —con
                imágenes y fórmulas— y las convierte en evaluaciones listas para
                imprimir. Compártelas con tu colegio y deja de armar cada prueba
                desde cero.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={autenticado ? "/dashboard" : "/registro"}
                  className={buttonVariants({
                    size: "lg",
                    className: "w-full sm:w-auto",
                  })}
                >
                  {autenticado ? "Ir al panel" : "Crear cuenta gratis"}
                </Link>
                <Link
                  href={autenticado ? "/preguntas" : "/login"}
                  className={buttonVariants({
                    variant: "outline",
                    size: "lg",
                    className: "w-full sm:w-auto",
                  })}
                >
                  {autenticado ? "Ver mis preguntas" : "Ya tengo cuenta"}
                </Link>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                Física · Química · Biología · Matemáticas · Lenguaje · y más
              </p>
            </div>

            {/* Firma: una pregunta real con alternativas A–E y su correcta. */}
            <div className="animar-subir relative">
              <div className="rotate-[1.2deg] rounded-2xl border border-border bg-card p-5 shadow-xl shadow-primary/5 sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-secondary px-2 py-1 font-mono text-[11px] font-medium text-primary">
                    Física · Mecánica
                  </span>
                  <span className="font-mono text-[11px] text-accent-foreground">
                    <span className="text-primary">●</span> Compartida
                  </span>
                </div>
                <p className="mt-4 text-[15px] font-medium leading-snug text-card-foreground">
                  Se lanza una piedra hacia abajo desde un acantilado a 5,0 m/s y
                  golpea el suelo 2,0 s después. ¿Cuál es la altura del
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

        {/* ── Qué puedes hacer ──────────────────────────────────────── */}
        <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-20">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Todo lo que necesitas para evaluar
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Pensado para el día a día en la sala: rápido, claro y en tu idioma.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icono: "📖",
                titulo: "Tu banco de preguntas",
                texto:
                  "Guarda preguntas por asignatura, materia y nivel, con imágenes en el enunciado y en las alternativas, y fórmulas en LaTeX.",
              },
              {
                icono: "📝",
                titulo: "Pruebas en PDF",
                texto:
                  "Elige las preguntas y descarga una prueba lista para imprimir, con tu encabezado, instrucciones, textos y formulario.",
              },
              {
                icono: "🤝",
                titulo: "Tu colegio, en equipo",
                texto:
                  "Comparte el banco con tus colegas del colegio automáticamente, o invita a colaboradores por correo.",
              },
              {
                icono: "📄",
                titulo: "Importar con IA",
                texto:
                  "Sube un PDF, Word o una imagen y deja que la IA detecte las preguntas; tú revisas y guardas.",
              },
            ].map((f) => (
              <div
                key={f.titulo}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
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
            ))}
          </div>
        </section>

        {/* ── Banda CTA (grafito) ───────────────────────────────────── */}
        <section className="bg-sidebar text-sidebar-foreground">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-5 py-14 sm:flex-row sm:items-center sm:justify-between sm:py-16">
            <div className="max-w-xl">
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Arma tu próxima prueba hoy
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-sidebar-foreground/80">
                Crea tu cuenta o únete al banco de tu colegio con el código que
                te compartió tu coordinación.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href={autenticado ? "/dashboard" : "/registro"}
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
          <span className="font-heading font-semibold text-foreground">
            📚 Mis Preguntas
          </span>
          <span>Banco de preguntas y pruebas para docentes</span>
        </div>
      </footer>
    </div>
  );
}
