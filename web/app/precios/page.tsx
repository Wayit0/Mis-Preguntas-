import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { lanzamientoGratis } from "@/lib/suscripciones/lanzamiento";

// El aviso de lanzamiento se lee de LANZAMIENTO_GRATIS en cada request: si se
// prerenderizara, apagar el lanzamiento en el App Service dejaría esta página
// prometiendo Pro gratis hasta el siguiente build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Precios — EduBox",
  description:
    "Planes de EduBox: Gratis para partir, Pro para importar sin límites y licencias para colegios.",
};

// El plan Pro se muestra distinto mientras dure el lanzamiento: no se cobra a
// nadie (ver lib/suscripciones/lanzamiento.ts), así que la tarjeta anuncia el
// precio futuro en vez de pedirlo hoy.
const planes = (gratis: boolean) => [
  {
    nombre: "Gratis",
    precio: "$0",
    detalle: "para siempre",
    cta: { href: "/registro", texto: "Crear cuenta" },
    destacado: false,
    incluye: [
      "Banco de preguntas ilimitado",
      "Pruebas en PDF ilimitadas",
      "Textos de comprensión y carpetas",
      "Banco compartido del colegio",
      gratis
        ? "100 importaciones con IA al mes durante el lanzamiento"
        : "3 importaciones con IA al mes",
    ],
  },
  {
    nombre: "Pro",
    precio: gratis ? "Gratis" : "$3.490",
    detalle: gratis
      ? "durante el lanzamiento · después $3.490/mes"
      : "/mes · o $35.880/año (equivale a $2.990/mes)",
    cta: gratis
      ? { href: "/registro", texto: "Crear cuenta gratis" }
      : { href: "/cuenta", texto: "Probar gratis 15 días" },
    destacado: true,
    incluye: [
      "Todo lo del plan Gratis",
      "100 importaciones con IA al mes",
      gratis ? "Sin tarjeta mientras dure el lanzamiento" : "Prueba gratis de 15 días",
      "Acceso anticipado a nuevas funciones (formas A/B, exportar a Word)",
    ],
  },
  {
    nombre: "Colegio",
    precio: "Conversemos",
    detalle: "licencia anual por factura",
    cta: {
      href: "mailto:contacto@edubox.cl?subject=Licencia%20EduBox%20para%20colegio",
      texto: "Escríbenos",
    },
    destacado: false,
    incluye: [
      "Pro para todos los profesores del colegio",
      "Banco compartido y logo en las pruebas",
      "Factura y pago por transferencia",
      "Acompañamiento en la puesta en marcha",
    ],
  },
];

export default function PreciosPage() {
  const gratis = lanzamientoGratis();
  const PLANES = planes(gratis);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12">
      <header className="flex items-center justify-between">
        <Link href="/">
          <Logo />
        </Link>
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Iniciar sesión
        </Link>
      </header>

      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Precios simples
        </h1>
        <p className="text-muted-foreground">
          Parte gratis. Paga solo si la IA te ahorra horas todos los meses.
        </p>
      </div>

      {gratis && (
        <div className="rounded-2xl border-2 border-primary bg-primary/5 p-5 text-center">
          <p className="font-heading text-lg font-semibold text-primary">
            EduBox está en versión de lanzamiento: Pro es gratis para todos
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Por ahora no cobramos nada. Todas las cuentas tienen las funciones
            Pro liberadas —incluidas las 100 importaciones con IA al mes— sin
            tarjeta. Te avisaremos por correo con anticipación antes de empezar
            a cobrar.
          </p>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        {PLANES.map((p) => (
          <div
            key={p.nombre}
            className={
              p.destacado
                ? "flex flex-col gap-4 rounded-2xl border-2 border-primary bg-card p-6 shadow-sm"
                : "flex flex-col gap-4 rounded-2xl border border-border bg-card p-6"
            }
          >
            <div>
              <h2 className="font-heading text-xl font-semibold">
                {p.nombre}
              </h2>
              <p className="mt-1">
                <span className="font-heading text-3xl font-bold text-primary">
                  {p.precio}
                </span>{" "}
                <span className="text-sm text-muted-foreground">
                  {p.detalle}
                </span>
              </p>
            </div>
            <ul className="flex flex-1 flex-col gap-2 text-sm">
              {p.incluye.map((linea) => (
                <li key={linea} className="flex gap-2">
                  <span className="text-primary">✓</span>
                  <span>{linea}</span>
                </li>
              ))}
            </ul>
            <Link
              href={p.cta.href}
              className={buttonVariants({
                variant: p.destacado ? "default" : "outline",
              })}
            >
              {p.cta.texto}
            </Link>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Precios en pesos chilenos, IVA incluido
        {gratis ? ", referenciales mientras dure el lanzamiento" : ""}. Cancela
        cuando quieras: conservas todo tu contenido y vuelves al plan Gratis.
      </p>
    </main>
  );
}
