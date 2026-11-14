/* ================================================================
   OPERACIÓN ORO NEGRO · contenido.js
   Textos, lugares y ajustes del juego. Para cambiar un texto o una
   coordenada basta con editar este archivo.
   ================================================================ */

const CONFIG = {
  VERSION: '1.0.0-fase1',
  // Dirección del Worker de Cloudflare. Vacío = el juego funciona sin él
  // (guarda la partida solo en el móvil y comprueba las respuestas aquí).
  WORKER_URL: '',
  RADIO_GEOVALLA: 25,          // metros alrededor de cada punto
  VIDEO_CAFE: 'cafe_v1.mp4',   // vídeo provisional del café (V1)
};

/* ---------- Lugares (coordenadas de Al, 13 nov 2026) ---------- */
const LUGARES = {
  1:  { nombre: 'Hotel Café Aurora',          punto: 'Portal nº 42, acera de enfrente',            lat: 41.940137, lon: -7.437904 },
  2:  { nombre: 'Farmacia de la Plaza Mayor', punto: 'Delante de la puerta',                       lat: 41.941574, lon: -7.438014 },
  3:  { nombre: 'Plaza de la Merced',         punto: 'Centro de la plaza',                         lat: 41.940868, lon: -7.436611 },
  4:  { nombre: 'Plazuela del Pozo',          punto: 'Centro de la plazuela',                      lat: 41.942032, lon: -7.436965 },
  5:  { nombre: 'Plaza de la Muralla',        punto: 'Delante de la escultura del carbonero',      lat: 41.942810, lon: -7.436410 },
  6:  { nombre: 'Plaza do Cigarrón',          punto: 'Delante de la estatua',                      lat: 41.942601, lon: -7.437519 },
  7:  { nombre: 'Restaurante de la casa de arcos', punto: 'Puerta del restaurante',                lat: 41.941432, lon: -7.437999 },
  8:  { nombre: 'Rúa Maior 11',               punto: 'Acera de enfrente de los azulejos',          lat: 41.941242, lon: -7.438539 },
  9:  { nombre: 'Puente Mayor',               punto: 'Acera derecha, punto de observación',        lat: 41.940560, lon: -7.441032 },
  10: { nombre: 'Barrio de San Lázaro',       punto: 'Frente a la casa del escudo',                lat: 41.940491, lon: -7.443106 },
};

const NOMBRES_CLAVE = ['HALCÓN', 'LINCE', 'BÚHO', 'CUERVO', 'GAVILÁN', 'MILANO', 'GARZA', 'NUTRIA',
  'CORZO', 'MIRLO', 'NIEBLA', 'CENIZA', 'GRANITO', 'CIERZO', 'RELÁMPAGO'];

/* ---------- Presentación ---------- */
const TXT = {
  vozEnOff: 'Verín, 1942. El mundo está enfrentado en la II Guerra Mundial. Los nazis refuerzan sus avances en todos los frentes, pero dependen del poder de sus blindados y de su artillería. Los nazis por un lado y los ingleses por otro tratan de hacerse con un mineral que resulta imprescindible para reforzar el acero de cañones y tanques. En España no hay guerra, pero hay wolframio, mucho wolframio. Verín es el centro de intrigas y conspiraciones. Los nazis compran todo el wolframio que se extrae en las minas de la comarca. Los ingleses, ayudados por la resistencia antifranquista, sabotean la red nazi para impedir que el wolframio llegue a su destino. El precio del mineral está en máximos y hay mucho dinero en juego. Por eso se le llamó el oro negro. Agentes del servicio secreto exterior del Reino Unido, el MI6, se enfrentan en las sombras con agentes nazis. Usted es un agente del MI6 en una peligrosa misión en Verín.',
  portada: 'Un juego de espías por las calles de Verín. Usted es un agente del MI6: impida que el wolframio llegue a la Alemania nazi.',
  encargo1: '«Agente, el MI6 tiene una misión para usted.',
  encargo2: 'Un cargamento de wolframio está a punto de salir de Verín hacia la Alemania nazi. Su misión: impedir que llegue a su destino.»',
  aliados: '«En Verín contará con la ayuda de la Resistencia antifranquista. Sus miembros le guiarán por radio, en mensajes escondidos y en persona. Confíe en ellos.»',
  enemigaDesc: 'Agente nazi. Dirige la red de aprovisionamiento de wolframio.',
  enemigaAviso: '«Cuídese de ella. Es astuta, fría y no se fía de nadie.»',
  comoSeJuega: [
    'Recorrido a pie por el centro de Verín: 10 etapas, unas 2 horas.',
    'El mapa le guía de un punto a otro. En cada lugar real le espera una misión.',
    'Mire, escuche y descifre: las claves están en las fachadas, las estatuas, la música y la radio.',
    'Si se atasca, pida una pista. Nunca se queda bloqueado.',
  ],
  permisos: [
    ['Ubicación', 'Para guiarle en el mapa y saber cuándo llega a cada punto de la misión.'],
    ['Cámara', 'Para ver el pasado en la cristalera del Aurora y en el puente, para el escáner y para reconocer fachadas. No se guarda ni se envía ninguna imagen.'],
    ['Micrófono', 'Solo en el puente, para que hable con Greta: la app reconoce su frase. No graba ni guarda su voz.'],
    ['Sonido', 'Para los mensajes, la radio, el morse y la música. Suba el volumen y quite el modo silencio.'],
  ],
  manual: [
    ['Sin ubicación:', 'usted avisa al llegar a cada punto con el botón «Ya estoy aquí».'],
    ['Sin cámara:', 'las escenas del Aurora y del puente se ven como vídeo a pantalla completa, y las fotos se sustituyen por preguntas.'],
    ['Sin micrófono:', 'en el puente dice la frase y pulsa «Ya se lo he dicho».'],
  ],
};

/* ---------- Etapa 1 · Hotel Café Aurora ---------- */
const E1 = {
  titulo: 'Misión 1 · El Pianista',
  aviso: 'Ha llegado al Hotel Café Aurora. Hoy está cerrado, pero en los años 40 era el centro de la vida social de la ciudad. Nuestro contacto es el Pianista, miembro de la resistencia antifranquista y enlace de la red local con el MI6. Sitúese en la acera de enfrente, ante la cristalera del café, a la derecha de la columna de azulejos: el Pianista le dejará un mensaje en su música.',
  fotoPunto: 'FOTO: el portal del número 42, en la acera de enfrente, casi frente a la cristalera del café (panel de Banksy, a la derecha de la columna de azulejos), con una flecha que señala dónde colocarse',
  pasos: ['Busque la columna de azulejos: el café es la cristalera de su derecha.',
          'Póngase delante del portal del nº 42, de cara a esa cristalera.',
          'Móvil en vertical, a la altura del pecho.'],
  subtitulo: 'El Pianista repite una misma frase, como si quisiera decirle algo.',
  pistas: ['Las notas también son palabras.', 'Lee los nombres de las notas seguidos.', 'La primera palabra es: MÍRELA'],
  fallo: 'El Pianista niega con la cabeza.',
  falloAyuda: 'Escuche otra vez y lea los nombres de las notas en orden.',
  correcto: '«Mírela sola.»',
  zoomSub: 'Alguien le observaba desde dentro del café.',
  ficha: { rasgos: 'Zurda · Fuma · Odia el café frío', debilidad: 'Nunca rechaza una copa' },
  pianista: '«Vaya a la farmacia de la Plaza Mayor. Don Manuel le espera. Dígale la contraseña.»',
  santoYSena: 'Vengo a por el jarabe del Pianista',
};

/* ---------- Etapa 2 · Farmacia ---------- */
const E2 = {
  titulo: 'Misión 2 · Don Manuel',
  aviso: 'Ha llegado a la farmacia de la Plaza Mayor. Don Manuel es el farmacéutico y contacto del MI6 en Verín. No hace falta entrar: preséntese en la puerta y diga el santo y seña que le dio el Pianista.',
  fotoPunto: 'FOTO: la puerta de la farmacia, en la Plaza Mayor, con una flecha que señala dónde colocarse (se compondrá más adelante)',
  pasos: ['Busque la farmacia en la Plaza Mayor.', 'Colóquese frente a la puerta (no hace falta entrar).', 'Espere la confirmación.'],
  opciones: ['Me envía el MI6 a recoger un encargo', 'Vengo a por el jarabe del Pianista', 'Busco unas gotas para dormir'],
  fallo: 'Don Manuel no responde.',
  falloAyuda: 'Tras la puerta se hace el silencio. Piense qué frase le dio el Pianista.',
  donManuel: '«Así que le envía el Pianista. Espere ahí, en la puerta. Enseguida le traigo el jarabe.»',
  frascoImg: 'IMAGEN: una mano abierta sostiene en la palma un frasco pequeño de cristal de los años 40, con tapón de corcho y etiqueta de papel que dice «DORMIDIÑA»',
  instrucciones: 'Ponga unas gotas en la copa de Greta. Nunca rechaza una copa.',
  siguiente: '«Vaya a la Merced y fíjese en la casa con tres letras. En esas letras tiene la frecuencia de radio del MI6.»',
};

/* ---------- Etapa 3 · Plaza de la Merced (rotor) ---------- */
const E3 = {
  titulo: 'Misión 3 · La frecuencia',
  aviso: 'Ha llegado a la Plaza de la Merced. Recuerde lo que le dijo Don Manuel: busque las letras para la clave de la frecuencia de radio.',
  donManuel: '«Fíjese en la casa con tres letras. En esas letras tiene la frecuencia de radio del MI6.»',
  ambiente: 'IMAGEN de ambientación: radio de válvulas de los años 40 sobre una mesa (no se muestra la casa: encontrarla es parte del juego)',
  emisoras: {
    FCC: { f: '633', nombre: 'Resistencia', clase: 'av', titulo: 'Emisora de la Resistencia', texto: 'No es la del MI6, pero recuérdela. Queda apuntada en su cuaderno de frecuencias.' },
    CCF: { f: '336', nombre: 'alemana',     clase: 'mal', titulo: 'Emisora alemana',          texto: 'Esta frecuencia la escuchan los hombres de Greta. No es la suya.' },
    CFC: { f: '363', nombre: 'MI6',         clase: 'ok', titulo: 'Correcto · Emisora del MI6', texto: 'Frecuencia de emisión: 363. El rotor queda guardado en C-F-C.' },
  },
  pistas: ['Busque la casa con letras en la Merced.', 'Mire encima de cada puerta.', 'Pruebe a cambiar el orden de las letras.', 'La emisora inglesa empieza por C.'],
  mi6: '«Bien sintonizado. Con esa frecuencia contactará con Londres desde la Plazuela del Pozo.»',
};

/* Comprobación sin conexión: huellas SHA-256 de las respuestas
   (no aparecen en claro). Las mismas respuestas están en el Worker. */
const HUELLAS = {
  e1: ['3b85716bc2ba06e47dc7a56dcb0b7621763674769871298257ae22eff1868f5c',
       '9f65ad51fca879373f31557e4d755f8d8ea6e614679387c75d860bc4e8738f12'],
  e2: ['409e20f8870cd0bc66dc44e0f090162ab92dbdc3593b3c919d2c76421dd2895c'],
  e3: ['416e9c3e995b6a16421c16cfd92e299eceb5a5d348a924ac016caeaf32c93581'],
};
