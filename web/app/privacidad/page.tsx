import type { Metadata } from 'next'
import { PaginaLegal } from '@/components/marketing/pagina-legal'

export const metadata: Metadata = {
  title: 'Política de Privacidad — EduBox',
  description:
    'Cómo EduBox recopila, usa y protege los datos de los docentes que usan la plataforma.',
}

const CONTACTO = 'contacto@edubox.cl'

export default function PrivacidadPage() {
  return (
    <PaginaLegal titulo="Política de Privacidad" actualizado="julio de 2026">
      <p>
        EduBox (<a href="https://edubox.cl">edubox.cl</a>) es una herramienta para
        que docentes reúnan preguntas, armen pruebas y guías, y las compartan con
        su colegio. Esta política explica qué datos tratamos, con qué fin y con
        quién los compartimos. Al usar EduBox aceptas estas prácticas.
      </p>

      <h2>1. Datos que recopilamos</h2>
      <ul>
        <li>
          <strong>Datos de tu cuenta:</strong> tu nombre y correo electrónico.
          Puedes registrarte con correo y contraseña (que guardamos siempre
          cifrada con <em>hashing</em>, nunca en texto plano) o mediante Google o
          Microsoft, en cuyo caso recibimos de ellos tu nombre y correo verificado.
        </li>
        <li>
          <strong>Contenido que creas:</strong> las preguntas, alternativas,
          textos, pruebas e imágenes que agregas o subes a la plataforma, y el
          colegio al que perteneces si te asocias a uno.
        </li>
        <li>
          <strong>Documentos que importas:</strong> cuando usas “Importar
          documento”, procesamos el archivo (PDF, Word o imagen) para detectar
          preguntas con ayuda de IA. Ver la sección 4.
        </li>
        <li>
          <strong>Registros de acceso y uso:</strong> por seguridad guardamos los
          inicios de sesión (exitosos y fallidos) con la fecha, la dirección IP y
          el navegador, y un registro del uso de las funciones de IA (para control
          de costos). No usamos cookies de seguimiento publicitario; solo la
          cookie necesaria para mantener tu sesión iniciada.
        </li>
      </ul>

      <h2>2. Cómo usamos tus datos</h2>
      <ul>
        <li>Proveer y operar el servicio (crear tu banco, generar tus PDF).</li>
        <li>Autenticarte y mantener tu sesión segura.</li>
        <li>
          Compartir con tu colegio o colaboradores el contenido que tú marques
          como compartido (ver sección 5).
        </li>
        <li>
          Enviarte correos transaccionales necesarios: verificación de tu correo y
          recuperación de contraseña. No enviamos correos publicitarios.
        </li>
        <li>Detectar y prevenir abusos, y diagnosticar problemas técnicos.</li>
      </ul>

      <h2>3. Con quién compartimos datos (proveedores)</h2>
      <p>
        No vendemos tus datos. Nos apoyamos en proveedores que los tratan solo
        para prestarnos su servicio:
      </p>
      <ul>
        <li>
          <strong>Google y Microsoft:</strong> únicamente si eliges iniciar sesión
          con ellos, para verificar tu identidad y tu correo.
        </li>
        <li>
          <strong>Anthropic (Claude):</strong> el contenido de los documentos que
          importas se envía a su API para detectar las preguntas. Se procesa para
          esa tarea y no se usa para entrenar sus modelos.
        </li>
        <li>
          <strong>Resend:</strong> para el envío de los correos de verificación y
          recuperación de contraseña.
        </li>
        <li>
          <strong>Microsoft Azure:</strong> aloja la aplicación, la base de datos y
          las imágenes que subes.
        </li>
      </ul>

      <h2>4. Contenido compartido dentro de EduBox</h2>
      <p>
        Tu contenido es privado por defecto. Si lo marcas como compartido, o si tu
        cuenta está asociada a un colegio, ese contenido puede quedar visible para
        los demás profesores de tu colegio o para los colaboradores que invites,
        junto con tu nombre como autor. Tú controlas qué compartes.
      </p>

      <h2>5. Conservación y seguridad</h2>
      <p>
        Conservamos tus datos mientras tu cuenta esté activa. La conexión viaja
        cifrada (HTTPS), las contraseñas se guardan con <em>hashing</em> y los
        secretos se gestionan en un almacén protegido. Ningún sistema es
        infalible, pero aplicamos medidas razonables para proteger tu información.
      </p>

      <h2>6. Tus derechos</h2>
      <p>
        Puedes acceder a tu contenido y editarlo desde la plataforma, y solicitar
        la corrección o eliminación de tus datos o de tu cuenta escribiéndonos a{' '}
        <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>. Ten presente que el
        contenido que hayas compartido y quedó anclado al banco de tu colegio puede
        permanecer disponible para ese colegio.
      </p>

      <h2>7. Menores de edad</h2>
      <p>
        EduBox está dirigido a docentes y personal de colegios (personas adultas).
        No está pensado para ser usado directamente por menores de edad.
      </p>

      <h2>8. Cambios a esta política</h2>
      <p>
        Podemos actualizar esta política. Publicaremos la versión vigente en esta
        página con su fecha de actualización.
      </p>

      <h2>9. Contacto</h2>
      <p>
        Si tienes dudas sobre esta política o sobre tus datos, escríbenos a{' '}
        <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
      </p>
    </PaginaLegal>
  )
}
