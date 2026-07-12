import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { eliminarPrueba } from '@/lib/actions/pruebas'
import { BotonGenerarPdf } from '@/components/pruebas/boton-generar-pdf'
import type { Prueba } from '@/lib/queries/pruebas'
import type { Carpeta } from '@/lib/queries/carpetas'
import { MoverACarpeta } from '@/components/carpetas/mover-a-carpeta'

/** Formatea una fecha en español (día mes año); vacío si es null. */
function formatoFecha(d: Date | null): string {
  if (!d) return ''
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(d))
}

// Clases compartidas de las acciones (misma altura táctil que "Mis Textos").
const ACCION = 'h-9 px-3 sm:h-7 sm:px-2.5'

export function TarjetaPrueba({
  prueba,
  carpetas,
}: {
  prueba: Prueba
  /** Lista plana de carpetas; si se pasa, muestra el selector "Mover a". */
  carpetas?: Carpeta[]
}) {
  const nPreguntas = prueba.preguntasIds?.length ?? 0
  const nTextos = prueba.textosIds?.length ?? 0
  const tienePdf = !!prueba.pdfKey
  const editarHref = `/mis-pruebas/${prueba.id}/editar?asignatura=${encodeURIComponent(
    prueba.asignatura,
  )}`

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            🗂️ {prueba.titulo || 'Sin título'}
          </h2>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {prueba.asignatura}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {nPreguntas === 1 ? '1 pregunta' : `${nPreguntas} preguntas`}
          </Badge>
          {nTextos > 0 ? (
            <Badge variant="secondary">
              {nTextos === 1 ? '1 texto' : `${nTextos} textos`}
            </Badge>
          ) : null}
          {tienePdf ? (
            <Badge>
              ✅ PDF listo
              {prueba.pdfGeneradoEn
                ? ` · ${formatoFecha(prueba.pdfGeneradoEn)}`
                : ''}
            </Badge>
          ) : (
            <Badge variant="outline">Sin PDF — genéralo para descargar</Badge>
          )}
        </div>

        {prueba.createdAt ? (
          <p className="text-xs text-muted-foreground">
            Creada el {formatoFecha(prueba.createdAt)}
          </p>
        ) : null}

        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <Link
            href={editarHref}
            className={buttonVariants({
              variant: 'secondary',
              size: 'sm',
              className: ACCION,
            })}
          >
            ✏️ Editar
          </Link>

          {tienePdf ? (
            <a
              href={`/api/mis-pruebas/${prueba.id}/pdf`}
              className={buttonVariants({ size: 'sm', className: ACCION })}
            >
              ⬇️ Descargar PDF
            </a>
          ) : null}

          <BotonGenerarPdf
            pruebaId={prueba.id}
            asignatura={prueba.asignatura}
            tienePdf={tienePdf}
          />

          <form action={eliminarPrueba.bind(null, prueba.id)}>
            <button
              type="submit"
              className={buttonVariants({
                variant: 'destructive',
                size: 'sm',
                className: ACCION,
              })}
            >
              🗑 Eliminar
            </button>
          </form>

          {carpetas ? (
            <MoverACarpeta
              tipo="pruebas"
              id={prueba.id}
              carpetaActual={prueba.carpetaId ?? null}
              carpetas={carpetas}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
