import { RestablecerForm } from '@/components/auth/restablecer-form'

// searchParams es un Promise en esta versión de Next: hay que await-earlo.
// better-auth redirige aquí con ?token=... (válido) o ?error=INVALID_TOKEN.
export default async function RestablecerPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const { token, error } = await searchParams
  return <RestablecerForm token={token ?? null} errorCode={error ?? null} />
}
