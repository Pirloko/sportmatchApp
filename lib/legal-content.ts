export type LegalDocumentKind = 'privacy' | 'terms'

export type LegalSection = { title: string; body: string }

/** Fecha mostrada en pantallas legales (alinear con POLITICA-DE-PRIVACIDAD.md / TERMINOS-DE-USO.md). */
export const LEGAL_LAST_UPDATED = '29 de mayo de 2026'

const PRIVACY_EMAIL = 'ancodevs.spa@gmail.com'
const LEGAL_EMAIL = 'ancodevs.spa@gmail.com'
const SITE_URL = 'https://www.sportmatch.cl'

const PRIVACY_SCOPE = `Esta Política aplica a todas las versiones del servicio SportMatch:

• App web SportMatch: sitio y aplicación web en ${SITE_URL} y dominios oficiales que indiquemos.
• App móvil SportMatch: aplicación nativa para Android e iOS (publicada como SportMatch en tiendas de aplicaciones o instalación autorizada).

Salvo indicación contraria, las mismas reglas aplican en web y móvil. Tu cuenta puede ser la misma en ambas plataformas si usas el mismo correo o inicio de sesión con Google.

Algunas funciones existen solo en un canal (por ejemplo, notificaciones push en la app móvil); en esos casos solo recopilamos los datos descritos cuando uses esa función en la plataforma correspondiente.`

const TERMS_SCOPE = `Estos Términos regulan el acceso y uso de SportMatch en:

• App web SportMatch: ${SITE_URL} y dominios oficiales asociados.
• App móvil SportMatch: Android e iOS (Google Play, App Store u otros canales autorizados).

Cuando decimos “el servicio”, “la plataforma” o “SportMatch”, nos referimos a la app web y a la app móvil, salvo que el texto indique un canal concreto (por ejemplo, “solo en la app móvil”).`

const PRIVACY_SECTIONS: LegalSection[] = [
  { title: 'Ámbito de aplicación', body: PRIVACY_SCOPE },
  {
    title: '1. Responsable del tratamiento',
    body:
      'SportMatch (“nosotros”, “el servicio”) opera la app web y la app móvil para conectar jugadores, equipos y centros deportivos en Chile. Esta Política describe qué datos personales recopilamos, para qué los usamos, dónde se almacenan y qué derechos tienes, con independencia del dispositivo o navegador que utilices.',
  },
  {
    title: '2. Qué datos recopila SportMatch',
    body:
      'Recopilamos solo los datos necesarios para operar el servicio.\n\nCuenta y autenticación\n• Correo electrónico y contraseña (registro con email).\n• Datos de Google si usas “Continuar con Google” (nombre, email, foto de perfil según tu cuenta Google).\n• Identificador único de usuario.\n\nInformación de perfil\n• Nombre, edad, género, posición, nivel, ciudad, disponibilidad.\n• WhatsApp (si lo ingresas).\n• Foto de perfil (desde la galería del dispositivo).\n• Tipo de cuenta (jugador, centro deportivo o administrador).\n\nPartidos, equipos y actividad\n• Partidos que creas, a los que te unes o en los que participas.\n• Equipos, miembros, invitaciones y solicitudes.\n• Mensajes en chats de partidos.\n• Desafíos, invitaciones y calificaciones cuando uses esas funciones.\n\nReservas y centros (si aplica)\n• Datos del centro: nombre, dirección, teléfono, ciudad, horarios, canchas y reservas.\n\nNotificaciones push (app móvil)\n• Token de dispositivo y datos básicos del dispositivo. Aplica principalmente a la app móvil; la web puede usar otros medios de aviso.\n\nUso técnico y seguridad\n• Eventos de uso agregados o anonimizados.\n• Registros de errores (Sentry, si está activo), sin contraseñas.\n\nNo recopilamos ubicación GPS en segundo plano. La ciudad y el lugar del partido son datos que tú introduces.',
  },
  {
    title: '3. Registro con email o Google',
    body:
      'Con email y contraseña: guardamos tu correo y credenciales mediante Supabase Auth. Puedes recibir correos de verificación o recuperación según la configuración del servicio.\n\nCon Google: inicio de sesión OAuth. Google nos envía la información que autorices (habitualmente email y datos básicos de perfil). No almacenamos tu contraseña de Google. El tratamiento por Google se rige por policies.google.com/privacy.\n\nAl continuar en la pantalla de acceso, declaras haber leído esta Política y nuestros Términos de Uso.',
  },
  {
    title: '4. Imágenes de perfil y galería',
    body:
      'Si subes foto de perfil o escudo de equipo, la imagen se aloja en Supabase para mostrarla en la app a otros usuarios según la función (perfil, equipos, partidos).\n\nLa app solicita acceso a la galería solo cuando eliges cambiar la foto; no usamos cámara ni micrófono para estas funciones.',
  },
  {
    title: '5. Notificaciones push',
    body:
      'Si aceptas notificaciones en tu dispositivo móvil, guardamos un token para avisos (invitaciones, mensajes, recordatorios). Puedes desactivarlas en la configuración del teléfono; algunas funciones pueden dejar de avisarte en tiempo real.',
  },
  {
    title: '6. Cómo y dónde se almacenan los datos',
    body:
      'Los datos se alojan principalmente en Supabase (PostgreSQL, autenticación, archivos), con cifrado en tránsito (HTTPS/TLS).\n\nProveedores auxiliares:\n• Supabase — cuentas, perfiles, partidos, equipos, mensajes, reservas.\n• Google — inicio de sesión con Google.\n• Expo / push — notificaciones en app móvil.\n• Sentry (opcional) — diagnóstico de errores.\n\nNo vendemos tus datos personales con fines publicitarios.',
  },
  {
    title: '7. Para qué usamos tus datos',
    body:
      '• Crear y gestionar tu cuenta.\n• Mostrarte partidos, equipos y jugadores acordes a tu perfil.\n• Gestionar inscripciones, chats, invitaciones y reservas.\n• Enviar notificaciones push que hayas permitido.\n• Mejorar estabilidad y seguridad.\n• Cumplir obligaciones legales cuando corresponda.',
  },
  {
    title: '8. Tus derechos sobre tus datos',
    body:
      'Según la legislación aplicable en Chile, puedes:\n\n• Acceder a los datos de tu cuenta (gran parte en Perfil).\n• Rectificar datos editando tu perfil.\n• Oponerte o limitar tratamientos (p. ej. desactivar notificaciones).\n• Solicitar eliminación de cuenta (sección siguiente).\n• Retirar consentimiento cerrando sesión o desinstalando la app.\n\nPara derechos que no puedas resolver en la app, escríbenos al contacto al final.',
  },
  {
    title: '9. Eliminación de cuenta',
    body:
      'Puedes eliminar tu cuenta de forma permanente desde SportMatch.\n\nApp móvil SportMatch\n• Jugadores: Perfil → Configuración → Eliminar mi cuenta.\n• Centros: Mi centro → pestaña Perfil → Eliminar mi cuenta.\n\nApp web SportMatch\nUsa la opción en configuración de cuenta en el sitio web, si está disponible, o solicita eliminación por correo. La eliminación afecta web y móvil cuando comparten el mismo usuario.\n\nEl proceso en la app móvil incluye doble confirmación y es irreversible. Al confirmar: (1) se eliminan cuenta y perfil; (2) se borran o desvinculan datos asociados según la base de datos; (3) se cierra sesión y se limpia información local.\n\nSi no puedes usar la app: escribe a ' +
      PRIVACY_EMAIL +
      ' indicando el email de tu cuenta.',
  },
  {
    title: '10. Conservación de los datos',
    body:
      'Conservamos datos mientras mantengas cuenta activa. Tras eliminación, eliminamos o anonimizamos en plazo razonable, salvo obligación legal. Las copias de seguridad del proveedor pueden retener datos residualmente un periodo limitado.',
  },
  {
    title: '11. Menores de edad',
    body:
      'SportMatch está orientada a usuarios que cumplan la edad mínima del registro. No recopilamos intencionalmente datos de menores sin consentimiento de quien tenga patria potestad.',
  },
  {
    title: '12. Cambios a esta Política',
    body:
      'Podemos actualizar esta Política por cambios en la app web, la app móvil o en la ley. Publicaremos la versión vigente en ambos canales y actualizaremos la fecha de última actualización. El uso continuado tras cambios relevantes puede requerir tu aceptación según lo indiquemos.',
  },
  {
    title: '13. Contacto legal y privacidad',
    body:
      `Correo: ${PRIVACY_EMAIL}\nAsunto sugerido: Privacidad — SportMatch\n\nPara soporte general usa los canales de la tienda de aplicaciones o el sitio web oficial (${SITE_URL}).`,
  },
]

const TERMS_SECTIONS: LegalSection[] = [
  { title: 'Ámbito de aplicación', body: TERMS_SCOPE },
  {
    title: '1. Aceptación de los Términos',
    body:
      'Al registrarte o usar la app web SportMatch, la app móvil SportMatch o cualquier función del servicio, aceptas estos Términos y nuestra Política de Privacidad (en la app: /privacy-policy). Si no estás de acuerdo, no uses SportMatch en ninguna versión.\n\nDebes cumplir la edad mínima del registro y tener capacidad legal según la legislación chilena.',
  },
  {
    title: '2. Qué es SportMatch',
    body:
      'SportMatch es una plataforma digital (web y móvil) que conecta jugadores, equipos y centros para organizar partidos, revueltas, desafíos y reservas de canchas.\n\nSportMatch no es club, federación, árbitro ni organizador presencial. Acuerdos sobre horarios, reglas, pagos en cancha o conducta en cancha son responsabilidad de los participantes.',
  },
  {
    title: '3. Uso permitido de SportMatch',
    body:
      'Puedes usar web y móvil solo para fines lícitos:\n\n• Gestionar perfil de jugador o centro.\n• Publicar, buscar y unirte a partidos.\n• Equipos, invitaciones y chats de partido.\n• Reservar u ofrecer canchas según tu cuenta.\n• Recibir notificaciones de actividad.\n\nQueda prohibido: fraude, bots o scraping abusivo, suplantación, cuentas falsas, contenido ilegal o acoso, vulnerar seguridad, revender el acceso sin autorización.\n\nPodemos limitar funciones o cerrar cuentas que incumplan estas reglas.',
  },
  {
    title: '4. Responsabilidad del usuario',
    body:
      'Eres responsable de:\n\n• Veracidad de tu perfil.\n• Confidencialidad de contraseña y dispositivo.\n• Actividad en tu cuenta.\n• Conducta con otros usuarios y en partidos.\n• Cumplir normas del centro, del barrio y la ley.\n• Daños a terceros por uso indebido.\n\nSi compartes WhatsApp u otros contactos, lo haces bajo tu criterio y riesgo.',
  },
  {
    title: '5. Cuentas de jugador y centro deportivo',
    body:
      'Cuenta jugador: buscar partidos, equipos, chat, calificaciones y perfil. Pueden aplicar límites (p. ej. cantidad de equipos).\n\nCuenta centro: administrar recinto, horarios, canchas y reservas. El titular declara autorización para representar al establecimiento.\n\nCuenta administrador: uso interno, no pública salvo invitación.\n\nNo está permitida más de una cuenta para el mismo fin a fin de eludir sanciones.',
  },
  {
    title: '6. Reservas y organización de partidos',
    body:
      'Organización: quien crea un partido debe dar datos razonablemente exactos y comunicar cambios. Asistencia, fair play y pagos fuera de la app son entre participantes.\n\nReservas: la disponibilidad depende del centro y del sistema. Una reserva en la app no sustituye depósitos o reglamento del recinto. Conflictos de horario o clima se resuelven prioritariamente entre usuario y centro.\n\nDesafíos e invitaciones: solo con consentimiento de las personas involucradas.',
  },
  {
    title: '7. Conducta dentro de la plataforma',
    body:
      'Se espera trato respetuoso en perfiles, chats y mensajes.\n\nProhibido: insultos, discriminación, publicar datos de terceros sin consentimiento, spam, enlaces maliciosos, infracción de derechos de autor.\n\nPodemos eliminar contenido o restringir cuentas ante incumplimientos graves.',
  },
  {
    title: '8. Cancelaciones y modificaciones',
    body:
      'Por el usuario: puedes abandonar partidos o cancelar participación según la app. El organizador puede suspender o finalizar según las reglas de la interfaz.\n\nPor centro u organizador: notificar cambios sustanciales con la mayor antelación posible.\n\nPor SportMatch: podemos modificar o suspender funciones por mantenimiento, seguridad o fuerza mayor. No respondemos por clima, cierre del recinto o fallas de internet del usuario.',
  },
  {
    title: '9. Limitación de responsabilidad',
    body:
      'En la máxima medida permitida por la ley:\n\n• El servicio se ofrece “tal cual” y “según disponibilidad”.\n• No respondemos por lesiones, accidentes, robos, daños o disputas entre usuarios.\n• No garantizamos asistencia ni calidad deportiva de terceros.\n• No somos parte de contratos de cancha ni pagos fuera de la app.\n• Nuestra responsabilidad total se limita, cuando la ley lo permita, a lo pagado a SportMatch en los últimos doce meses, o cero si el servicio es gratuito.\n\nNada limita derechos irrenunciables del consumidor en Chile.',
  },
  {
    title: '10. Suspensión o eliminación de cuenta',
    body:
      'Por el usuario: cierra sesión cuando quieras. Elimina tu cuenta así:\n\nApp móvil\n• Jugador: Perfil → Configuración → Eliminar mi cuenta.\n• Centro: Mi centro → Perfil → Eliminar mi cuenta.\n\nApp web\nOpción en configuración del sitio o escribe a ' +
      PRIVACY_EMAIL +
      ' desde el correo de tu cuenta. Aplica a web y móvil con el mismo acceso.\n\nDoble confirmación en móvil; irreversible. Ver Política de Privacidad.\n\nPor SportMatch: podemos suspender o eliminar tu cuenta si incumples estos Términos, la ley, generas riesgos, usas la plataforma de forma abusiva o por obligación legal.',
  },
  {
    title: '11. Propiedad intelectual de SportMatch',
    body:
      'La app web, la app móvil, diseño, logotipos, nombre SportMatch, software y bases de datos son propiedad de SportMatch o licenciantes.\n\nLicencia limitada, no exclusiva, revocable e intransferible para uso personal conforme a estos Términos.\n\nNo puedes copiar, modificar, descompilar ni hacer ingeniería inversa salvo lo permitido por ley.\n\nTu contenido (fotos, mensajes, nombres de equipo) sigue siendo tuyo; nos concedes licencia para alojarlo y mostrarlo solo dentro del servicio.',
  },
  {
    title: '12. Enlaces y servicios de terceros',
    body:
      'La app puede enlazar a mapas, WhatsApp o sitios externos, e integrar Google, Supabase o push. No controlamos esos servicios; aplican sus propias políticas.',
  },
  {
    title: '13. Privacidad',
    body:
      'El tratamiento de datos personales está en nuestra Política de Privacidad, disponible en la app móvil y web en la ruta /privacy-policy.',
  },
  {
    title: '14. Cambios futuros en los Términos',
    body:
      'Podemos actualizar estos Términos por cambios en web, móvil, ley o modelo de negocio. Publicaremos la versión vigente y actualizaremos la fecha. Cambios sustanciales pueden notificarse por app o correo. El uso continuado implica aceptación, salvo que la ley exija consentimiento expreso. Si no aceptas, deja de usar el servicio y puedes eliminar tu cuenta.',
  },
  {
    title: '15. Ley aplicable y jurisdicción',
    body:
      'Estos Términos se rigen por las leyes de la República de Chile. Las controversias se someten a tribunales ordinarios de Chile, salvo norma imperativa que favorezca al consumidor.',
  },
  {
    title: '16. Contacto',
    body:
      `Consultas generales y legales: ${LEGAL_EMAIL}\nPrivacidad: ${PRIVACY_EMAIL}`,
  },
]

export function legalDocumentTitle(kind: LegalDocumentKind): string {
  return kind === 'privacy' ? 'Política de Privacidad' : 'Términos de Uso'
}

export function legalDocumentSections(kind: LegalDocumentKind): LegalSection[] {
  return kind === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS
}
