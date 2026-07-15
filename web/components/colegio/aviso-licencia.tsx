import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios } from '@/lib/db/schema'

const DIA = 86_400_000

/**
 * Banner para school_admin cuando la licencia del colegio vence en ≤30 días
 * (o ya venció). Sin licencia registrada no muestra nada (colegios free).
 */
export async function AvisoLicencia({ colegioId }: { colegioId: number }) {
  const [c] = await db
    .select({ licenciaHasta: colegios.licenciaHasta })
    .from(colegios)
    .where(eq(colegios.id, colegioId))
    .limit(1)
  if (!c?.licenciaHasta) return null

  // Server component: se ejecuta una sola vez por request, no hay re-render
  // que la regla de pureza proteja.
  // eslint-disable-next-line react-hooks/purity
  const dias = Math.ceil((c.licenciaHasta.getTime() - Date.now()) / DIA)
  if (dias > 30) return null

  const fecha = new Intl.DateTimeFormat('es-CL', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(c.licenciaHasta)

  return (
    <div className="rounded-xl border border-accent-amber bg-accent-amber/10 p-4 text-sm">
      {dias >= 0 ? (
        <>La licencia EduBox de tu colegio vence el <strong>{fecha}</strong>. </>
      ) : (
        <>La licencia EduBox de tu colegio venció el <strong>{fecha}</strong>:
        los profesores volvieron al plan Gratis. </>
      )}
      Escríbenos a{' '}
      <a href="mailto:contacto@edubox.cl" className="font-medium text-primary underline-offset-4 hover:underline">
        contacto@edubox.cl
      </a>{' '}
      para renovarla.
    </div>
  )
}
