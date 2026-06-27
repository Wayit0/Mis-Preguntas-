import { redirect } from 'next/navigation'

// La raíz redirige al panel; el panel a su vez exige sesión y, si no la hay,
// envía a /login.
export default function Home() {
  redirect('/dashboard')
}
