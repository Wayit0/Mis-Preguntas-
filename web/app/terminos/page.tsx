import type { Metadata } from 'next'
import { PaginaLegal } from '@/components/marketing/pagina-legal'

export const metadata: Metadata = {
  title: 'Condiciones del Servicio — EduBox',
  description:
    'Condiciones de uso de EduBox, la plataforma para que docentes creen pruebas y guías.',
}

const CONTACTO = 'contacto@edubox.cl'

export default function TerminosPage() {
  return (
    <PaginaLegal titulo="Condiciones del Servicio" actualizado="julio de 2026">
      <p>
        Estas condiciones regulan el uso de EduBox (
        <a href="https://edubox.cl">edubox.cl</a>). Al crear una cuenta o usar la
        plataforma aceptas estas condiciones. Si no estás de acuerdo, no uses el
        servicio.
      </p>

      <h2>1. El servicio</h2>
      <p>
        EduBox permite a docentes reunir preguntas, textos e imágenes, armar
        pruebas y guías en PDF, importar documentos con ayuda de IA y compartir
        contenido con su colegio o colaboradores. Podemos mejorar, cambiar o
        discontinuar funciones con el tiempo.
      </p>

      <h2>2. Tu cuenta</h2>
      <ul>
        <li>
          Debes entregar información veraz y mantener la confidencialidad de tus
          credenciales. Eres responsable de la actividad realizada desde tu cuenta.
        </li>
        <li>
          Si te asocias a un colegio, aceptas que tu contenido compartido pueda
          quedar disponible para ese colegio según lo descrito en la{' '}
          <a href="/privacidad">Política de Privacidad</a>.
        </li>
      </ul>

      <h2>3. Uso aceptable</h2>
      <p>Te comprometes a no usar EduBox para:</p>
      <ul>
        <li>
          Subir o compartir contenido ilegal, que infrinja derechos de terceros o
          que no tengas autorización para usar.
        </li>
        <li>
          Intentar vulnerar la seguridad de la plataforma, acceder a datos de otros
          usuarios o interferir con su funcionamiento.
        </li>
        <li>Abusar de las funciones automatizadas o de IA de forma desmedida.</li>
      </ul>

      <h2>4. Tu contenido</h2>
      <p>
        Conservas la titularidad del contenido que creas o subes. Nos concedes una
        licencia limitada para almacenarlo, procesarlo y mostrarlo con el único fin
        de prestarte el servicio (incluido generar tus PDF y mostrar el contenido
        que compartas a tu colegio o colaboradores). Eres responsable de tener los
        derechos sobre el contenido que subes.
      </p>

      <h2>5. Funciones de IA</h2>
      <p>
        La detección de preguntas al importar documentos usa inteligencia
        artificial y puede contener errores u omisiones. Revisa siempre el
        resultado antes de usarlo: EduBox no garantiza su exactitud.
      </p>

      <h2>6. Propiedad intelectual de EduBox</h2>
      <p>
        La marca EduBox, el software y el diseño de la plataforma son de su titular
        y están protegidos. Estas condiciones no te otorgan derechos sobre ellos
        más allá del uso del servicio.
      </p>

      <h2>7. Disponibilidad y garantías</h2>
      <p>
        El servicio se ofrece “tal cual” y “según disponibilidad”. Hacemos lo
        razonable por mantenerlo operativo, pero no garantizamos que esté libre de
        interrupciones o errores.
      </p>

      <h2>8. Limitación de responsabilidad</h2>
      <p>
        En la medida permitida por la ley, EduBox no será responsable por daños
        indirectos o por la pérdida de contenido derivada del uso o de la
        imposibilidad de usar el servicio. Te recomendamos conservar respaldos de
        tu material importante.
      </p>

      <h2>9. Suspensión y término</h2>
      <p>
        Puedes dejar de usar EduBox y solicitar la eliminación de tu cuenta cuando
        quieras. Podemos suspender o cerrar cuentas que incumplan estas condiciones.
      </p>

      <h2>10. Cambios</h2>
      <p>
        Podemos actualizar estas condiciones. Publicaremos la versión vigente en
        esta página con su fecha de actualización; el uso continuado implica su
        aceptación.
      </p>

      <h2>11. Contacto</h2>
      <p>
        Para consultas sobre estas condiciones, escríbenos a{' '}
        <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
      </p>
    </PaginaLegal>
  )
}
