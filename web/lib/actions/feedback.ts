'use server'

import { db } from '@/lib/db'
import { feedback } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import { feedbackSchema, type FeedbackInput } from '@/lib/validation/feedback'

// ---------------------------------------------------------------------------
// Server action del feedback de usuarios. Sólo inserta (append-only); la
// lectura vive en el panel de administración (lib/queries/admin.ts).
// ---------------------------------------------------------------------------

export type ResultadoFeedback = { ok: true } | { ok: false; error: string }

export async function enviarFeedback(
  input: FeedbackInput,
): Promise<ResultadoFeedback> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  const parsed = feedbackSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Feedback no válido.',
    }
  }
  const { pagina, puntaje, comentario, contexto } = parsed.data

  await db.insert(feedback).values({
    userId,
    pagina,
    puntaje,
    comentario: comentario.length > 0 ? comentario : null,
    contexto: (contexto ?? {}) as Record<string, unknown>,
  })

  return { ok: true }
}
