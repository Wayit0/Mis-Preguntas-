// ---------------------------------------------------------------------------
// Cliente mínimo de la API de MercadoPago (suscripciones "sin plan asociado"):
// cada suscripción se crea como un preapproval con su auto_recurring inline y
// status 'pending' — la respuesta trae un init_point donde el pagador ingresa
// su tarjeta. Sin SDK (patrón Resend: fetch directo). El trial de 15 días se
// modela con start_date = hoy+15d (MP no cobra nada antes de esa fecha).
// ---------------------------------------------------------------------------

const MP_API = 'https://api.mercadopago.com'

export const PRECIOS_CLP = { mensual: 3490, anual: 35880 } as const
export type Periodicidad = keyof typeof PRECIOS_CLP
export const TRIAL_DIAS = 15

export interface MpPreapproval {
  id: string
  status: 'pending' | 'authorized' | 'paused' | 'cancelled'
  external_reference?: string
  payer_email?: string
  init_point?: string
  next_payment_date?: string
  reason?: string
  auto_recurring?: {
    frequency: number
    frequency_type: string
    transaction_amount: number
    currency_id: string
    start_date?: string
  }
}

export interface MpPagoAutorizado {
  id: string | number
  preapproval_id: string
  status: string
  transaction_amount?: number
  date_created?: string
  payment?: { id?: number; status?: string; status_detail?: string }
}

export function mpHabilitado(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN)
}

async function mpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) throw new Error('MP_ACCESS_TOKEN no configurado')
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '')
    throw new Error(`MercadoPago ${res.status} en ${path}: ${cuerpo.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

export async function mpCrearPreapproval(opts: {
  userId: number
  email: string
  periodicidad: Periodicidad
  conTrial: boolean
}): Promise<MpPreapproval> {
  const { userId, email, periodicidad, conTrial } = opts
  const base = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  const startDate = conTrial
    ? new Date(Date.now() + TRIAL_DIAS * 86_400_000).toISOString()
    : undefined
  return mpFetch<MpPreapproval>('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: periodicidad === 'anual' ? 'EduBox Pro (anual)' : 'EduBox Pro (mensual)',
      external_reference: String(userId),
      payer_email: email,
      back_url: `${base}/cuenta?suscripcion=retorno`,
      status: 'pending',
      auto_recurring: {
        frequency: periodicidad === 'anual' ? 12 : 1,
        frequency_type: 'months',
        transaction_amount: PRECIOS_CLP[periodicidad],
        currency_id: 'CLP',
        ...(startDate ? { start_date: startDate } : {}),
      },
    }),
  })
}

export const mpObtenerPreapproval = (id: string) =>
  mpFetch<MpPreapproval>(`/preapproval/${id}`)

export const mpCancelarPreapproval = (id: string) =>
  mpFetch<MpPreapproval>(`/preapproval/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled' }),
  })

export const mpObtenerPagoAutorizado = (id: string) =>
  mpFetch<MpPagoAutorizado>(`/authorized_payments/${id}`)
