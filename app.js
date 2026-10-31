// Kashiki: registra ingresos, gastos y ahorros, lleva tus metas, tu racha y tus pagos pendientes.
// Sin cuenta todo vive en el teléfono; con cuenta se guarda también en la nube (Supabase).

// Categorías disponibles para cada tipo de movimiento. Puedes agregar o quitar las que quieras.
const CATEGORIAS = {
  gasto: ['Comida', 'Transporte', 'Casa', 'Servicios', 'Salud', 'Diversión', 'Ropa', 'Otros'],
  ingreso: ['Sueldo', 'Ventas', 'Negocio', 'Regalo', 'Saldo inicial', 'Otros'],
};
// Ícono de cada categoría (https://tabler.io/icons). Las categorías propias usan una etiqueta.
const ICONOS = {
  Comida: 'ti-tools-kitchen-2',
  Transporte: 'ti-car',
  Casa: 'ti-home',
  Servicios: 'ti-bolt',
  Salud: 'ti-first-aid-kit',
  'Diversión': 'ti-confetti',
  Ropa: 'ti-shirt',
  Otros: 'ti-category',
  'Pagos fijos': 'ti-repeat',
  Sueldo: 'ti-cash-banknote',
  Ventas: 'ti-shopping-bag',
  Negocio: 'ti-building-store',
  Regalo: 'ti-gift',
  'Saldo inicial': 'ti-wallet',
};
// Color de cada categoría (como las monedas en las apps de cripto): la interfaz es de un solo tono
// y el color aparece donde significa algo. Las categorías propias usan rojo (gasto) o verde (ingreso).
const COLORES = {
  Comida: '#FF9F43',
  Transporte: '#4DA3FF',
  Casa: '#A78BFA',
  Servicios: '#FFD43B',
  Salud: '#FF6B81',
  'Diversión': '#22D3EE',
  Ropa: '#FF6FB1',
  Otros: '#9AA3B5',
  'Pagos fijos': '#8B9CFF',
  Sueldo: '#3DDC97',
  Ventas: '#2FD3A0',
  Negocio: '#F4A261',
  Regalo: '#FF7AC6',
  'Saldo inicial': '#7E8699',
};
// "Saldo inicial" es el dinero que ya tenías al empezar: cuenta para tu total, pero no como ingreso del mes.
const SALDO_INICIAL = 'Saldo inicial';
// Valor especial de los chips de categoría para escribir una propia.
const NUEVA_CATEGORIA = '__nueva__';

// Etapas de la flama según los días de racha.
const ETAPAS = [
  { desde: 0, nombre: 'Apagada', color: '#8A93A6', tamano: 56 },
  { desde: 1, nombre: 'Chispa', color: '#FFB347', tamano: 62 },
  { desde: 7, nombre: 'Fuego', color: '#FF8A3D', tamano: 72 },
  { desde: 30, nombre: 'Llamarada', color: '#FF5A4E', tamano: 84 },
  { desde: 100, nombre: 'Leyenda', color: '#B18CFF', tamano: 96 },
];

// Nombres con los que se guardan los datos en el navegador (localStorage).
const CLAVES = {
  movimientos: 'mi-dinero:movimientos',
  metas: 'mi-dinero:metas',
  dias: 'mi-dinero:dias', // días marcados con "hoy no tuve movimientos"
  pendientes: 'mi-dinero:pagos', // pagos que debo o que me deben
  fijos: 'mi-dinero:fijos', // pagos que se repiten: Netflix, renta, plan del cel…
};
const CLAVE_PENDIENTES = 'mi-dinero:pendientes';
const CLAVE_PERFIL = 'mi-dinero:perfil';
const CLAVE_DUENO = 'mi-dinero:dueno'; // id de la cuenta a la que pertenecen los datos de este teléfono
const CLAVE_SHEETS = 'mi-dinero:nube'; // conexión vieja con Google Sheets, solo para pasar los datos a la cuenta
const CLAVE_SHEETS_PASADO = 'mi-dinero:sheets-pasado';

const $ = (selector) => document.querySelector(selector);
// El número de versión sale del ?v= con el que se cargó este archivo (index.html).
const VERSION_APP = new URL(document.currentScript?.src || location.href).searchParams.get('v') || '—';
const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const corto = (n) => '$' + Math.round(n).toLocaleString('es-MX');

const datos = {
  movimientos: limpiar('movimientos', leer(CLAVES.movimientos, [])),
  metas: limpiar('metas', leer(CLAVES.metas, [])),
  dias: limpiar('dias', leer(CLAVES.dias, [])),
  pendientes: limpiar('pendientes', leer(CLAVES.pendientes, [])),
  fijos: limpiar('fijos', leer(CLAVES.fijos, [])),
};
let pendientes = leer(CLAVE_PENDIENTES, []); // cambios que aún no se suben a la nube
let perfil = leer(CLAVE_PERFIL, { nombre: '', foto: '' });

// ---------- Secciones: separar tu dinero (Personal, Mi empresa…) en la misma cuenta ----------
// Cada movimiento, meta y pago guarda su "seccion". La racha es una sola para todas.
const CLAVE_SECCIONES = 'mi-dinero:secciones';
const CLAVE_SECCION = 'mi-dinero:seccion';
const SECCION_PERSONAL = { id: 'personal', nombre: 'Personal', icono: 'ti-user' };
let secciones = leer(CLAVE_SECCIONES, [SECCION_PERSONAL]);
if (!secciones.some((s) => s.id === 'personal')) secciones.unshift(SECCION_PERSONAL);
let seccionActual = leer(CLAVE_SECCION, 'personal');
if (!secciones.some((s) => s.id === seccionActual)) seccionActual = 'personal';

// Lo que se ve en pantalla: solo lo de la sección actual.
const deSeccion = (nombre) => datos[nombre].filter((x) => x.seccion === seccionActual);

// ---------- Guardar y cargar en el teléfono ----------

function leer(clave, porDefecto) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    avisar('No se pudo guardar en este teléfono (¿memoria llena?)');
  }
}

function guardarColeccion(nombre) {
  escribir(CLAVES[nombre], datos[nombre]);
}

// Revisa que cada registro tenga lo necesario (monto, fecha, tipo…). Lo que viene de un respaldo,
// de Google Sheets o de una versión vieja puede venir chueco; un solo dato malo podía dejar
// la app trabada en la pantalla de carga. Lo que se puede arreglar se arregla; lo que no, se descarta.
function limpiar(nombre, lista) {
  if (!Array.isArray(lista)) return [];
  return lista.map((x) => normalizar(nombre, x)).filter(Boolean);
}

function normalizar(nombre, x) {
  const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/; // va aquí adentro porque esto corre antes que el resto del archivo
  if (!x || typeof x !== 'object' || !x.id) return null;
  const o = { ...x, id: String(x.id) };
  const creado = Number(o.creado);
  o.creado = Number.isFinite(creado) && creado > 0 ? creado : Date.now();
  const texto = (valor) => (valor == null ? '' : String(valor));
  if (nombre === 'dias') return ES_FECHA.test(o.id) ? o : null;
  o.seccion = texto(o.seccion) || 'personal'; // lo de antes de que existieran las secciones es "Personal"
  if (nombre === 'metas') {
    o.objetivo = Number(o.objetivo);
    o.nombre = texto(o.nombre);
    return o.objetivo > 0 && o.nombre ? o : null;
  }
  if (nombre === 'fijos') {
    o.monto = Number(o.monto);
    o.nombre = texto(o.nombre);
    if (!(o.monto > 0) || !o.nombre) return null;
    if (!['semana', 'mes', 'anio'].includes(o.cada)) o.cada = 'mes';
    if (!ES_FECHA.test(o.proximo)) o.proximo = fechaLocal(new Date());
    // El día del mes en que se cobra (para que un cobro del 31 vuelva al 31 después de febrero).
    o.dia = Number(o.dia);
    if (!(o.dia >= 1 && o.dia <= 31)) o.dia = Number(o.proximo.slice(8, 10));
    return o;
  }
  o.monto = Number(o.monto);
  if (!(o.monto > 0)) return null;
  if (!ES_FECHA.test(o.fecha)) o.fecha = fechaLocal(new Date(o.creado));
  o.nota = texto(o.nota);
  if (nombre === 'movimientos') {
    if (!['ingreso', 'gasto', 'ahorro'].includes(o.tipo)) return null;
    o.categoria = texto(o.categoria) || 'Otros';
    o.meta = texto(o.meta);
  } else {
    if (!['debo', 'me-deben'].includes(o.tipo)) return null;
    o.persona = texto(o.persona) || 'Alguien';
  }
  return o;
}

// ---------- Fechas ----------

// Fecha como "AAAA-MM-DD" en la hora local.
function fechaLocal(fecha) {
  return fecha.toLocaleDateString('en-CA');
}

function hoy() {
  return fechaLocal(new Date());
}

// Suma (o resta) días a una fecha "AAAA-MM-DD".
function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  return fechaLocal(new Date(a, m - 1, d + dias));
}

function aFecha(texto) {
  const [a, m, d] = texto.split('-').map(Number);
  return new Date(a, m - 1, d);
}

// "2026-10-25" → "dom, 25 oct"
// Si es de otro año, también dice el año (pasa al buscar en movimientos viejos).
function fechaBonita(fecha) {
  const otroAnio = !fecha.startsWith(hoy().slice(0, 4));
  return aFecha(fecha).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: otroAnio ? 'numeric' : undefined });
}

// Cuántos días faltan para una fecha (negativo si ya pasó).
function diasPara(fecha) {
  return Math.round((aFecha(fecha) - aFecha(hoy())) / 86400000);
}

function cuandoVence(fecha) {
  const dias = diasPara(fecha);
  if (dias < -1) return `Venció hace ${-dias} días`;
  if (dias === -1) return 'Venció ayer';
  if (dias === 0) return 'Es hoy';
  if (dias === 1) return 'Mañana';
  if (dias < 7) return `En ${dias} días`;
  return fechaBonita(fecha);
}

const mayuscula = (texto) => (texto ? texto[0].toUpperCase() + texto.slice(1) : texto);

// ---------- Animaciones pequeñas ----------

// Hace que un número "cuente" desde el valor que tenía hasta el nuevo.
function contar(elemento, valor, duracion = 900) {
  const desde = Number(elemento.dataset.valor || 0);
  elemento.dataset.valor = valor;
  cancelAnimationFrame(elemento._animacion);
  const inicio = performance.now();
  const paso = (ahora) => {
    const t = Math.min(1, (ahora - inicio) / duracion);
    const suave = 1 - Math.pow(1 - t, 3);
    elemento.textContent = dinero.format(desde + (valor - desde) * suave);
    if (t < 1) elemento._animacion = requestAnimationFrame(paso);
  };
  elemento._animacion = requestAnimationFrame(paso);
}

// Llena una barra desde donde estaba hasta el nuevo porcentaje.
function llenar(barra, porcentaje) {
  requestAnimationFrame(() => requestAnimationFrame(() => (barra.style.width = porcentaje + '%')));
}

function vibrar() {
  try {
    navigator.vibrate?.(12);
  } catch {}
}

// ---------- Nube: cuentas y datos de cada usuario (Supabase) ----------

// Datos públicos del proyecto: pueden ir dentro de la app. Lo que protege los datos son las reglas
// de la base de datos (supabase/esquema.sql): cada cuenta solo puede ver y tocar lo suyo.
const SUPABASE_URL = 'https://bzaawjfvzkfhusdtvnia.supabase.co';
const SUPABASE_LLAVE = 'sb_publishable_7wDFI4hA9KS4uXX1kTtF_Q_caUEGt2Q';
// Si al abrir no hay internet, la librería no carga y la app sigue funcionando solo en el teléfono.
const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_LLAVE) : null;

// Columnas de cada tabla; el resto de un objeto no se manda.
const COLUMNAS = {
  movimientos: ['id', 'tipo', 'monto', 'categoria', 'nota', 'fecha', 'creado', 'meta', 'seccion'],
  metas: ['id', 'nombre', 'objetivo', 'creado', 'seccion'],
  dias: ['id', 'creado'],
  pendientes: ['id', 'tipo', 'persona', 'monto', 'fecha', 'nota', 'creado', 'seccion'],
  fijos: ['id', 'nombre', 'monto', 'cada', 'proximo', 'dia', 'seccion', 'creado'],
};
const COLUMNAS_NUMERO = ['monto', 'objetivo', 'creado', 'dia'];

let cuenta = null; // el usuario con sesión iniciada, o null

function aFila(nombre, objeto) {
  const fila = { user_id: cuenta.id };
  for (const columna of COLUMNAS[nombre]) fila[columna] = objeto[columna] ?? '';
  return fila;
}

function deFila(nombre, fila) {
  const objeto = {};
  for (const columna of COLUMNAS[nombre]) {
    objeto[columna] = COLUMNAS_NUMERO.includes(columna) ? Number(fila[columna]) : (fila[columna] ?? '');
  }
  return objeto;
}

async function mandarCambio(cambio) {
  const tabla = db.from(cambio.coleccion);
  const { error } =
    cambio.accion === 'agregar' ? await tabla.upsert(aFila(cambio.coleccion, cambio.objeto)) : await tabla.delete().eq('id', cambio.id);
  if (error) throw error;
}

// Guarda un cambio para subirlo; si no hay internet, se queda en la fila y se reintenta después.
// Se encola si hay cuenta O si los datos de este teléfono son de una cuenta (CLAVE_DUENO): así, si la
// sesión venció sin internet, lo que anotes mientras tanto se sube cuando vuelvas a entrar.
function encolar(cambio) {
  if (!cuenta && !leer(CLAVE_DUENO, null)) return;
  pendientes.push(cambio);
  escribir(CLAVE_PENDIENTES, pendientes);
}

let sincronizando = false;
let otraVez = false; // llegó un cambio mientras se sincronizaba: hay que dar otra vuelta
// Mientras no contestes "¿Subimos lo de este teléfono?", no se descarga nada de la nube
// (si se descargara, lo del teléfono se reemplazaría y se perdería).
let esperandoDecision = false;

// Un error de internet se reintenta después; cualquier otro (dato que la nube rechaza)
// se aparta para que no atore la fila para siempre.
// "column … does not exist" también se reintenta: pasa si la app se actualizó antes que la base de datos.
const esErrorDeRed = (error) =>
  !navigator.onLine || /fetch|network|Load failed|timeout|column|schema cache/i.test(String(error?.message || error));

// Supabase entrega máximo 1000 filas por consulta: se piden de 1000 en 1000 hasta tenerlas todas.
const POR_PAGINA = 1000;
async function leerTabla(nombre) {
  const todas = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    const { data, error } = await db
      .from(nombre)
      .select(COLUMNAS[nombre].join(','))
      .order('id')
      .range(desde, desde + POR_PAGINA - 1);
    if (error) throw error;
    todas.push(...data);
    if (data.length < POR_PAGINA) return todas;
  }
}

async function sincronizar() {
  if (!cuenta || !db) return;
  if (esperandoDecision) {
    abrirHoja($('#hoja-subir'));
    return;
  }
  if (sincronizando) {
    otraVez = true;
    return;
  }
  sincronizando = true;
  mostrarEstado('ti-refresh', 'Sincronizando…');
  let rechazados = 0;
  try {
    do {
      otraVez = false;
      // 1. Sube los cambios pendientes, en orden.
      while (pendientes.length > 0) {
        try {
          await mandarCambio(pendientes[0]);
        } catch (error) {
          if (esErrorDeRed(error)) throw error;
          console.warn('La nube rechazó un cambio y se apartó:', pendientes[0], error);
          rechazados++;
        }
        pendientes.shift();
        escribir(CLAVE_PENDIENTES, pendientes);
      }
      // 2. Descarga todo: la nube es la fuente de verdad.
      const nombres = Object.keys(CLAVES);
      const filas = await Promise.all(nombres.map(leerTabla));
      nombres.forEach((nombre, i) => {
        datos[nombre] = limpiar(nombre, filas[i].map((fila) => deFila(nombre, fila)));
      });
      // Lo que agregaste o borraste MIENTRAS se descargaba todavía no está en la nube:
      // se vuelve a aplicar encima para que no "desaparezca" de la pantalla.
      for (const cambio of pendientes) aplicarCambio(cambio);
      for (const nombre of nombres) guardarColeccion(nombre);
    } while (otraVez || pendientes.length > 0);
    dibujar();
    // También trae las secciones cambiadas en otro dispositivo (y sube las que no se pudieron subir).
    seccionesDeLaCuenta().catch(() => {});
    if (rechazados > 0) {
      mostrarEstado('ti-alert-triangle', `Guardado, pero ${rechazados} ${rechazados === 1 ? 'registro tenía' : 'registros tenían'} datos inválidos y no se subieron`, true);
    } else {
      mostrarEstado('ti-cloud-check', 'Guardado en tu cuenta');
    }
  } catch (error) {
    mostrarEstado('ti-cloud-off', explicarError(error), true);
  } finally {
    sincronizando = false;
  }
}

function aplicarCambio(cambio) {
  const lista = datos[cambio.coleccion];
  if (!lista) return;
  if (cambio.accion === 'agregar') {
    // Si ya existe (por ejemplo, un pago fijo al que se le movió la fecha), se reemplaza.
    const i = lista.findIndex((x) => x.id === cambio.objeto.id);
    if (i >= 0) lista[i] = cambio.objeto;
    else lista.push(cambio.objeto);
  } else {
    datos[cambio.coleccion] = lista.filter((x) => x.id !== cambio.id);
  }
}

function explicarError(error) {
  const mensaje = String(error?.message || error);
  if (!navigator.onLine) return 'Sin internet: tus cambios se subirán cuando vuelva la conexión';
  if (/fetch|network/i.test(mensaje)) return 'No se pudo conectar con la nube. Se reintentará solo.';
  if (/does not exist|Could not find the table/i.test(mensaje)) return 'Faltan las tablas en Supabase (supabase/esquema.sql)';
  if (/JWT|expired/i.test(mensaje)) return 'Tu sesión expiró. Vuelve a entrar.';
  return 'Error de la nube: ' + mensaje;
}

function mostrarEstado(icono, texto, problema = false) {
  const estado = $('#estado');
  estado.innerHTML = `<i class="ti ${icono}" aria-hidden="true"></i>`;
  estado.append(texto);
  estado.classList.toggle('problema', problema);
}

// ---------- Agregar y borrar ----------

function agregar(nombre, objeto) {
  // Lo nuevo se guarda en la sección que estás viendo (la racha es de todas, no lleva sección).
  if (nombre !== 'dias' && !objeto.seccion) objeto.seccion = seccionActual;
  datos[nombre].push(objeto);
  guardarColeccion(nombre);
  encolar({ accion: 'agregar', coleccion: nombre, objeto });
  dibujar();
  sincronizar();
}

function borrar(nombre, id) {
  datos[nombre] = datos[nombre].filter((x) => x.id !== id);
  guardarColeccion(nombre);
  encolar({ accion: 'borrar', coleccion: nombre, id });
  dibujar();
  sincronizar();
}

// Borra y ofrece "Deshacer" por si fue sin querer.
function borrarConDeshacer(nombre, objeto, texto) {
  borrar(nombre, objeto.id);
  avisar(texto, 'Deshacer', () => agregar(nombre, objeto));
}

// ---------- Cálculos ----------

const sumar = (lista) => lista.reduce((total, m) => total + m.monto, 0);

// Lo que un movimiento cambia tu dinero total. Ahorrar no lo cambia: solo lo aparta para una meta.
function efecto(m) {
  if (m.tipo === 'ingreso') return m.monto;
  if (m.tipo === 'gasto') return -m.monto;
  return 0;
}

const esIngresoReal = (m) => m.tipo === 'ingreso' && m.categoria !== SALDO_INICIAL;

function ahorradoEn(meta) {
  return sumar(datos.movimientos.filter((m) => m.tipo === 'ahorro' && m.meta === meta.id));
}

function iconoDe(m) {
  if (m.tipo === 'ahorro') return 'ti-pig-money';
  return ICONOS[m.categoria] || 'ti-tag';
}

// Un día cuenta para la racha si registraste algo ese día (movimiento, meta o pago) o marcaste "hoy no tuve movimientos".
function diasActivos() {
  const activos = new Set(datos.dias.map((d) => d.id));
  for (const x of [...datos.movimientos, ...datos.metas, ...datos.pendientes]) {
    if (x.creado) activos.add(fechaLocal(new Date(x.creado)));
  }
  return activos;
}

function calcularRacha() {
  const activos = diasActivos();
  const hoyTexto = hoy();
  const registradoHoy = activos.has(hoyTexto);

  // La racha sigue viva si registraste ayer, aunque hoy todavía no.
  let actual = 0;
  for (let dia = registradoHoy ? hoyTexto : sumarDias(hoyTexto, -1); activos.has(dia); dia = sumarDias(dia, -1)) {
    actual++;
  }

  let mejor = 0;
  let seguidos = 0;
  let anterior = null;
  for (const dia of [...activos].sort()) {
    seguidos = anterior && sumarDias(dia, -1) === anterior ? seguidos + 1 : 1;
    mejor = Math.max(mejor, seguidos);
    anterior = dia;
  }

  const semana = [6, 5, 4, 3, 2, 1, 0].map((atras) => {
    const dia = sumarDias(hoyTexto, -atras);
    return { dia, activo: activos.has(dia), esHoy: atras === 0 };
  });

  return { actual, mejor, registradoHoy, semana, activos };
}

const etapaDe = (dias) => [...ETAPAS].reverse().find((e) => dias >= e.desde);

// Compara lo gastado este mes con lo gastado el mes pasado hasta el mismo día.
function compararConMesPasado() {
  const hoyTexto = hoy();
  const dia = Number(hoyTexto.slice(8));
  const [a, m] = hoyTexto.split('-').map(Number);
  const inicioPasado = fechaLocal(new Date(a, m - 2, 1));
  const finPasado = fechaLocal(new Date(a, m - 2, Math.min(dia, new Date(a, m - 1, 0).getDate())));
  const gastos = (desde, hasta) => sumar(deSeccion('movimientos').filter((x) => x.tipo === 'gasto' && x.fecha >= desde && x.fecha <= hasta));
  const ahora = gastos(hoyTexto.slice(0, 8) + '01', hoyTexto);
  const antes = gastos(inicioPasado, finPasado);
  const mesPasado = new Date(a, m - 2, 1).toLocaleDateString('es-MX', { month: 'long' });
  return { ahora, antes, mesPasado };
}

// ---------- Dibujar la pantalla ----------

function dibujar() {
  dibujarSecciones();
  dibujarEncabezado();
  dibujarSaldo();
  dibujarGrafica(false);
  dibujarMes();
  dibujarMetas();
  dibujarRacha();
  dibujarPagos();
}

function dibujarEncabezado() {
  $('#saludo').textContent = perfil.nombre ? `Hola, ${perfil.nombre}` : 'Hola';
  // Abajo del nombre: la fecha. Si no estás en Personal, antes va la sección, para que sepas dónde estás.
  const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const linea = $('#fecha-hoy');
  if (seccionActual === 'personal') {
    linea.textContent = mayuscula(fecha);
  } else {
    const s = seccionVista();
    linea.innerHTML = `<i class="ti ${s.icono || 'ti-folder'}" aria-hidden="true"></i> `;
    linea.append(`${s.nombre} · ${fecha}`);
  }
  for (const el of [$('#avatar'), $('#avatar-grande'), $('#avatar-ajustes')]) {
    el.style.backgroundImage = perfil.foto ? `url(${perfil.foto})` : '';
    el.textContent = perfil.foto ? '' : (perfil.nombre || '?')[0].toUpperCase();
  }
}

function dibujarSaldo() {
  const total = deSeccion('movimientos').reduce((t, m) => t + efecto(m), 0);
  if (grafica.tocando) return;
  $('#saldo-etiqueta').textContent = 'Tu dinero';
  contar($('#saldo'), total);
  dibujarComparacion();
}

function dibujarComparacion() {
  const { ahora, antes, mesPasado } = compararConMesPasado();
  const el = $('#comparacion');
  el.className = 'comparacion';
  if (antes === 0) {
    el.innerHTML = '';
    if (ahora > 0) el.append(`Llevas ${corto(ahora)} gastados este mes`);
    return;
  }
  const cambio = Math.round(((ahora - antes) / antes) * 100);
  const menos = cambio <= 0;
  el.classList.add(menos ? 'bien' : 'mal');
  el.innerHTML = `<i class="ti ti-trending-${menos ? 'down' : 'up'}" aria-hidden="true"></i>`;
  el.append(`Gastaste ${Math.abs(cambio)}% ${menos ? 'menos' : 'más'} que en ${mesPasado} a estas alturas`);
}

// ---------- Gráfica: barras y tendencia ----------

const grafica = { modo: 'barras', que: 'gas', rango: 7, puntos: [], x: [], tocando: false };
const SVG = 'http://www.w3.org/2000/svg';
const ANCHO = 300;
const ALTO = 170;
const BASE = 148; // donde se apoyan las barras; abajo van las letras de los días
const LETRAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function svg(etiqueta, atributos = {}, estilo = {}) {
  const el = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  Object.assign(el.style, estilo);
  return el;
}

// Ingresos, gastos y saldo al final de cada día (o de cada semana en 3M).
function datosGrafica() {
  const dias = grafica.rango === 90 ? 91 : grafica.rango;
  const hoyTexto = hoy();
  const desde = sumarDias(hoyTexto, -(dias - 1));
  const lista = [];
  for (let i = 0; i < dias; i++) lista.push({ fecha: sumarDias(desde, i), ing: 0, gas: 0, cambio: 0 });
  const indice = new Map(lista.map((d, i) => [d.fecha, i]));

  let saldo = 0;
  for (const m of deSeccion('movimientos')) {
    if (m.fecha < desde) {
      saldo += efecto(m);
      continue;
    }
    const d = lista[indice.get(m.fecha)];
    if (!d) continue;
    if (esIngresoReal(m)) d.ing += m.monto;
    if (m.tipo === 'gasto') d.gas += m.monto;
    d.cambio += efecto(m);
  }
  for (const d of lista) {
    saldo += d.cambio;
    d.saldo = saldo;
  }

  if (grafica.rango < 90) {
    return lista.map((d, i) => {
      const fecha = aFecha(d.fecha);
      const atras = dias - 1 - i;
      return {
        ...d,
        etiqueta: dias === 7 ? LETRAS[fecha.getDay()] : atras % 5 === 0 ? String(fecha.getDate()) : '',
        titulo: mayuscula(fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })),
      };
    });
  }
  // 3 meses: una barra por semana
  const semanas = [];
  for (let i = 0; i < lista.length; i += 7) {
    const grupo = lista.slice(i, i + 7);
    const inicio = aFecha(grupo[0].fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    semanas.push({
      ing: grupo.reduce((t, d) => t + d.ing, 0),
      gas: grupo.reduce((t, d) => t + d.gas, 0),
      saldo: grupo[grupo.length - 1].saldo,
      etiqueta: (i / 7) % 3 === 0 ? inicio : '',
      titulo: `Semana del ${inicio}`,
    });
  }
  return semanas;
}

function dibujarGrafica(animar = true) {
  const lienzo = $('#grafica');
  const puntos = datosGrafica();
  grafica.puntos = puntos;
  lienzo.replaceChildren();
  $('#grafica-titulo').textContent = { 7: 'Esta semana', 30: 'Este mes', 90: 'Últimos 3 meses' }[grafica.rango];
  $('#grafica-que').hidden = grafica.modo !== 'barras';

  // Degradados: las barras se desvanecen hacia abajo y la de hoy brilla con el color fuerte.
  const degradado = (id, arriba, abajo, opArriba = 1, opAbajo = 1) => {
    const g = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    g.append(svg('stop', { offset: 0 }, { stopColor: arriba, stopOpacity: opArriba }), svg('stop', { offset: 1 }, { stopColor: abajo, stopOpacity: opAbajo }));
    return g;
  };
  const defs = svg('defs', {});
  defs.append(
    degradado('g-barra-gas', 'var(--acento-2)', 'var(--acento-2)', 0.6, 0.1),
    degradado('g-hoy-gas', 'var(--acento-2)', 'var(--acento-3)'),
    degradado('g-barra-ing', 'var(--positivo)', 'var(--positivo)', 0.6, 0.1),
    degradado('g-hoy-ing', '#9CF5CF', 'var(--positivo)'),
    degradado('g-area', 'var(--acento)', 'var(--acento)', 0.35, 0)
  );
  lienzo.append(defs);

  const n = puntos.length;
  const ultimo = n - 1;
  if (grafica.modo === 'barras') {
    const valores = puntos.map((p) => p[grafica.que]);
    const maximo = Math.max(...valores, 1);
    const paso = ANCHO / n;
    const ancho = paso * (n <= 13 ? 0.62 : 0.66);
    const radio = Math.min(10, ancho / 2.6);
    const color = `url(#g-barra-${grafica.que})`;
    const colorHoy = `url(#g-hoy-${grafica.que})`;
    grafica.x = puntos.map((_, i) => i * paso + paso / 2);

    puntos.forEach((p, i) => {
      const alto = valores[i] > 0 ? Math.max(5, (valores[i] / maximo) * (BASE - 16)) : 3;
      const barra = svg('rect', { x: grafica.x[i] - ancho / 2, width: ancho, rx: radio, y: BASE, height: 0, 'data-i': i }, {
        fill: i === ultimo ? colorHoy : color,
        opacity: valores[i] > 0 ? 1 : 0.35,
        transition: animar ? `y .65s var(--rebote) ${i * (500 / n)}ms, height .65s var(--rebote) ${i * (500 / n)}ms, opacity .2s` : 'opacity .2s',
      });
      lienzo.append(barra);
      const fin = () => {
        barra.setAttribute('y', BASE - alto);
        barra.setAttribute('height', alto);
      };
      animar ? requestAnimationFrame(() => requestAnimationFrame(fin)) : fin();
      if (p.etiqueta) {
        const letra = svg('text', { x: grafica.x[i], y: ALTO - 4, 'text-anchor': 'middle', 'font-size': 12 }, { fill: i === ultimo ? 'var(--acento)' : 'var(--claro)', fontWeight: i === ultimo ? 700 : 400 });
        letra.textContent = p.etiqueta;
        lienzo.append(letra);
      }
    });
    lienzo.append(svg('text', { id: 'valor-barra', 'text-anchor': 'middle', 'font-size': 11 }, { fill: 'var(--texto)', fontWeight: 600, display: 'none' }));
  } else {
    const saldos = puntos.map((p) => p.saldo);
    const minimo = Math.min(...saldos);
    const maximo = Math.max(...saldos);
    grafica.x = puntos.map((_, i) => (n === 1 ? ANCHO / 2 : (i / (n - 1)) * ANCHO));
    const y = saldos.map((s) => 14 + (1 - (s - minimo) / (maximo - minimo || 1)) * (BASE - 26));
    puntos.forEach((p, i) => (p.y = y[i]));
    const trazo = grafica.x.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y[i].toFixed(1)}`).join(' ');

    lienzo.append(svg('line', { x1: 0, x2: ANCHO, y1: y[0], y2: y[0], 'stroke-dasharray': '3 4' }, { stroke: 'var(--linea)' }));
    const area = svg('path', { d: `${trazo} L${ANCHO} ${BASE} L0 ${BASE} Z` }, { fill: 'url(#g-area)' });
    const linea = svg('path', { d: trazo, fill: 'none', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, { stroke: 'var(--acento)' });
    lienzo.append(area, linea);

    if (maximo !== minimo) {
      for (const [i, texto, dy] of [[saldos.indexOf(maximo), 'máx', -8], [saldos.indexOf(minimo), 'mín', 15]]) {
        lienzo.append(svg('circle', { cx: grafica.x[i], cy: y[i], r: 3 }, { fill: 'var(--acento-2)' }));
        const t = svg('text', { x: Math.min(ANCHO - 40, Math.max(2, grafica.x[i] - 16)), y: y[i] + dy, 'font-size': 10 }, { fill: 'var(--acento-2)' });
        t.textContent = `${texto} ${corto(saldos[i])}`;
        lienzo.append(t);
      }
    }
    puntos.forEach((p, i) => {
      if (!p.etiqueta) return;
      const t = svg('text', { x: Math.min(ANCHO - 8, Math.max(8, grafica.x[i])), y: ALTO - 4, 'text-anchor': 'middle', 'font-size': 12 }, { fill: i === ultimo ? 'var(--acento)' : 'var(--claro)' });
      t.textContent = p.etiqueta;
      lienzo.append(t);
    });
    lienzo.append(
      svg('line', { id: 'guia', y1: 0, y2: BASE }, { stroke: 'var(--suave)', strokeOpacity: 0.6, display: 'none' }),
      svg('circle', { id: 'punto-guia', r: 5, 'stroke-width': 2 }, { fill: 'var(--fondo)', stroke: 'var(--acento)', display: 'none' })
    );
    if (animar) {
      const largo = linea.getTotalLength();
      Object.assign(linea.style, { strokeDasharray: largo, strokeDashoffset: largo });
      area.style.opacity = 0;
      linea.getBoundingClientRect();
      Object.assign(linea.style, { transition: 'stroke-dashoffset 1.2s ease-out', strokeDashoffset: 0 });
      Object.assign(area.style, { transition: 'opacity .8s ease .5s', opacity: 1 });
    }
  }
}

// Al deslizar el dedo sobre la gráfica se ve el detalle de cada día.
function recorrerGrafica(evento) {
  const lienzo = $('#grafica');
  const caja = lienzo.getBoundingClientRect();
  const x = ((evento.clientX - caja.left) / caja.width) * ANCHO;
  let i = 0;
  grafica.x.forEach((xx, k) => {
    if (Math.abs(xx - x) < Math.abs(grafica.x[i] - x)) i = k;
  });
  const p = grafica.puntos[i];
  grafica.tocando = true;

  if (grafica.modo === 'barras') {
    lienzo.querySelectorAll('rect').forEach((r) => (r.style.opacity = Number(r.dataset.i) === i ? 1 : 0.4));
    const barra = lienzo.querySelector(`rect[data-i="${i}"]`);
    const valor = lienzo.querySelector('#valor-barra');
    valor.textContent = corto(p[grafica.que]);
    valor.setAttribute('x', Math.min(ANCHO - 22, Math.max(22, grafica.x[i])));
    valor.setAttribute('y', Number(barra.getAttribute('y')) - 7);
    valor.style.display = '';
  } else {
    const guia = lienzo.querySelector('#guia');
    const punto = lienzo.querySelector('#punto-guia');
    guia.setAttribute('x1', grafica.x[i]);
    guia.setAttribute('x2', grafica.x[i]);
    punto.setAttribute('cx', grafica.x[i]);
    punto.setAttribute('cy', p.y);
    guia.style.display = punto.style.display = '';
  }

  $('#saldo-etiqueta').textContent = p.titulo;
  cancelAnimationFrame($('#saldo')._animacion);
  $('#saldo').textContent = dinero.format(p.saldo);
  const el = $('#comparacion');
  el.className = 'comparacion';
  el.innerHTML = `<span class="positivo">+${corto(p.ing)}</span> · <span class="negativo">−${corto(p.gas)}</span>`;
}

function soltarGrafica() {
  if (!grafica.tocando) return;
  grafica.tocando = false;
  const lienzo = $('#grafica');
  lienzo.querySelectorAll('rect').forEach((r) => (r.style.opacity = ''));
  for (const id of ['#valor-barra', '#guia', '#punto-guia']) {
    const el = lienzo.querySelector(id);
    if (el) el.style.display = 'none';
  }
  dibujarGrafica(false);
  $('#saldo-etiqueta').textContent = 'Tu dinero';
  const total = Number($('#saldo').dataset.valor || 0);
  $('#saldo').textContent = dinero.format(total);
  dibujarComparacion();
}

// ---------- Movimientos del mes ----------

// En la pantalla principal solo se ven los más recientes; el resto, en "Ver todos".
const RECIENTES = 4;

function movimientosDelMes() {
  const mes = $('#mes').value; // "AAAA-MM"
  return deSeccion('movimientos')
    .filter((m) => m.fecha.startsWith(mes))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
}

function dibujarMes() {
  const delMes = movimientosDelMes();

  const ingresos = sumar(delMes.filter(esIngresoReal));
  const gastos = sumar(delMes.filter((m) => m.tipo === 'gasto'));
  const apartado = sumar(delMes.filter((m) => m.tipo === 'ahorro'));
  contar($('#total-ingresos'), ingresos, 700);
  contar($('#total-gastos'), gastos, 700);
  $('#apartado-mes').textContent = apartado > 0 ? `Apartaste ${dinero.format(apartado)} para tus metas este mes` : '';
  $('#apartado-mes').hidden = apartado === 0;
  dibujarComparacionMes();
  dibujarAnillo(ingresos, gastos);

  dibujarLista($('#lista'), delMes.slice(0, RECIENTES), 'Aún no hay movimientos este mes. Toca + para agregar el primero.');
  $('#ver-todos').hidden = delMes.length <= RECIENTES;
  $('#ver-todos').firstChild.textContent = `Ver todos (${delMes.length}) `;
  $('.pista-deslizar').hidden = delMes.length === 0;

  if (!$('#vista-detalle').hidden) dibujarDetalle();
  if (!$('#vista-buscar').hidden) dibujarBusqueda();
}

// ---------- Anillo del mes (en "Tu dinero") ----------
// Cuánto de lo que ganaste en el mes ya se fue en gastos. Si no has ganado nada, no se muestra.
const LARGO_ANILLO = 264; // la vuelta completa del círculo (2 × π × 42)

function dibujarAnillo(ingresos, gastos) {
  const anillo = $('#anillo-mes');
  anillo.hidden = ingresos <= 0;
  if (anillo.hidden) return;
  const porcentaje = Math.round((gastos / ingresos) * 100);
  $('#anillo-pct').textContent = `${porcentaje}%`;
  anillo.classList.toggle('pasado', porcentaje > 100); // gastaste más de lo que ganaste
  const arco = $('#anillo-arco');
  requestAnimationFrame(() => (arco.style.strokeDashoffset = LARGO_ANILLO * (1 - Math.min(porcentaje, 100) / 100)));
}

// ---------- Botones rápidos (Gasto · Ahorrar · Ingreso) ----------

for (const boton of document.querySelectorAll('[data-rapido]')) {
  boton.addEventListener('click', () => abrirFormulario({ tipo: boton.dataset.rapido }));
}

// ---------- Comparación con el mes pasado ----------
// Si ves el mes actual, se compara "a estas alturas": del 1 a hoy contra el 1 al mismo día del mes
// pasado (si no, siempre parecería que este mes gastaste menos, porque aún no termina).

function totalesEntre(desde, hasta) {
  const lista = deSeccion('movimientos').filter((m) => m.fecha >= desde && m.fecha <= hasta);
  const ingresos = sumar(lista.filter(esIngresoReal));
  const gastos = sumar(lista.filter((m) => m.tipo === 'gasto'));
  return { ingresos, gastos, quedo: ingresos - gastos, cuantos: lista.length };
}

// "alturas" = contra el mismo día del mes pasado; "completo" = contra todo el mes pasado
// (por ejemplo, para ver si a medio mes ya ganaste más que en todo el mes anterior).
let modoComparacion = leer('mi-dinero:comparar', 'alturas');

function compararMes(mes, modo) {
  const [a, m] = mes.split('-').map(Number);
  const hoyTexto = hoy();
  const esEsteMes = hoyTexto.startsWith(mes);
  const aEstasAlturas = esEsteMes && modo === 'alturas';
  const diasAntes = new Date(a, m - 1, 0).getDate(); // cuántos días tuvo el mes pasado
  const dia = Number(hoyTexto.slice(8));
  const anterior = fechaLocal(new Date(a, m - 2, 1)).slice(0, 7);
  return {
    actual: totalesEntre(`${mes}-01`, esEsteMes ? hoyTexto : `${mes}-31`),
    pasado: totalesEntre(`${anterior}-01`, `${anterior}-${String(aEstasAlturas ? Math.min(dia, diasAntes) : 31).padStart(2, '0')}`),
    nombrePasado: new Date(a, m - 2, 1).toLocaleDateString('es-MX', { month: 'long' }),
    aEstasAlturas,
    esEsteMes,
  };
}

$('#abrir-comparar').addEventListener('click', () => {
  dibujarComparacionMes();
  abrirHoja($('#hoja-comparar'));
});

for (const boton of document.querySelectorAll('[data-comparar]')) {
  boton.addEventListener('click', () => {
    modoComparacion = boton.dataset.comparar;
    escribir('mi-dinero:comparar', modoComparacion);
    dibujarComparacionMes();
  });
}

function dibujarComparacionMes() {
  const { actual, pasado, nombrePasado, aEstasAlturas, esEsteMes } = compararMes($('#mes').value, modoComparacion);
  // Sin nada registrado el mes pasado no hay con qué comparar: ni sale el link "Comparar".
  const enlace = $('#abrir-comparar');
  enlace.hidden = pasado.cuantos === 0;
  if (enlace.hidden) return;
  // El selector solo tiene sentido en el mes que va corriendo; un mes que ya pasó se compara completo.
  $('#comparacion-modo').hidden = !esEsteMes;
  document.querySelectorAll('[data-comparar]').forEach((b) => b.classList.toggle('activo', b.dataset.comparar === modoComparacion));
  $('#comparacion-titulo').textContent = esEsteMes
    ? aEstasAlturas
      ? `Contra ${nombrePasado} a estas alturas`
      : `Lo que llevas contra todo ${nombrePasado}`
    : `Contra ${nombrePasado}`;

  // "subirEsBueno": ganar más o que te quede más es bueno; gastar más, no.
  const filas = [
    { texto: 'Ganaste', ahora: actual.ingresos, antes: pasado.ingresos, subirEsBueno: true },
    { texto: 'Gastaste', ahora: actual.gastos, antes: pasado.gastos, subirEsBueno: false },
    { texto: 'Te quedó', ahora: actual.quedo, antes: pasado.quedo, subirEsBueno: true },
  ];
  const ul = $('#comparacion-filas');
  ul.replaceChildren();
  for (const f of filas) {
    const diferencia = f.ahora - f.antes;
    const igual = Math.abs(diferencia) < 0.005;
    const bien = igual ? null : diferencia > 0 === f.subirEsBueno;
    const li = document.createElement('li');
    li.innerHTML = `<span class="comp-texto"></span><strong class="comp-ahora"></strong>
      <span class="comp-cambio ${igual ? '' : bien ? 'bien' : 'mal'}"><i class="ti ${igual ? 'ti-equal' : diferencia > 0 ? 'ti-arrow-up' : 'ti-arrow-down'}" aria-hidden="true"></i><span></span></span>`;
    li.querySelector('.comp-texto').textContent = f.texto;
    li.querySelector('.comp-ahora').textContent = dinero.format(f.ahora);
    li.querySelector('.comp-cambio span').textContent = igual ? 'Igual' : `${diferencia > 0 ? '+' : '−'}${dinero.format(Math.abs(diferencia))}`;
    li.title = `${nombrePasado}: ${dinero.format(f.antes)}`;
    ul.append(li);
  }
  // Una frase que resume cómo vas.
  const mejor = actual.quedo - pasado.quedo;
  let frase;
  if (Math.abs(mejor) < 0.005) frase = 'Vas igual que el mes pasado.';
  else if (esEsteMes && !aEstasAlturas) {
    // Mes completo: ¿ya alcanzaste lo de todo el mes pasado?
    frase =
      mejor > 0
        ? `Ya superaste lo que te quedó en todo ${nombrePasado} por ${dinero.format(mejor)}, y el mes aún no termina.`
        : `Faltan ${dinero.format(-mejor)} para alcanzar lo que te quedó en todo ${nombrePasado}.`;
  } else {
    frase =
      mejor > 0
        ? `Vas mejor que en ${nombrePasado}: te quedan ${dinero.format(mejor)} más.`
        : `Vas ${dinero.format(-mejor)} por debajo de ${nombrePasado}.`;
  }
  $('#comparacion-frase').textContent = frase;
}

// ---------- Detalle: ingresos, gastos o todos ----------

const detalle = { tipo: 'todos', orden: 'fecha' };
const TEXTOS_DETALLE = {
  ingreso: { titulo: 'Ingresos', etiqueta: 'Generaste este mes', lista: 'Lo que ingresaste', vacio: 'No tienes ingresos este mes.' },
  gasto: { titulo: 'Gastos', etiqueta: 'Gastaste este mes', lista: 'Lo que gastaste', vacio: 'No tienes gastos este mes.' },
  todos: { titulo: 'Movimientos', etiqueta: 'Balance del mes', lista: 'Todos', vacio: 'Aún no hay movimientos este mes.' },
};

function abrirDetalle(tipo) {
  detalle.tipo = tipo;
  detalle.orden = 'fecha';
  // Así el botón "atrás" del teléfono regresa a la pantalla principal en vez de salirse de la app.
  history.pushState({ detalle: tipo }, '');
  mostrarVista('detalle');
}

function dibujarDetalle() {
  const textos = TEXTOS_DETALLE[detalle.tipo];
  const delMes = movimientosDelMes();
  const lista = detalle.tipo === 'todos' ? delMes : delMes.filter((m) => m.tipo === detalle.tipo);
  const mes = aFecha($('#mes').value + '-01').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  $('#detalle-titulo').textContent = textos.titulo;
  $('#detalle-mes').textContent = mayuscula(mes);
  $('#detalle-etiqueta').textContent = textos.etiqueta;
  $('.detalle-total').className = 'tarjeta detalle-total ' + detalle.tipo;
  // El saldo inicial no cuenta como ingreso del mes (igual que en el cuadro de Ingresos).
  const total =
    detalle.tipo === 'todos'
      ? delMes.reduce((t, m) => t + efecto(m), 0)
      : sumar(detalle.tipo === 'ingreso' ? lista.filter(esIngresoReal) : lista);
  contar($('#detalle-total'), total, 700);
  const tieneSaldoInicial = detalle.tipo === 'ingreso' && lista.some((m) => m.categoria === SALDO_INICIAL);
  $('#detalle-cuenta').textContent =
    `${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'}` + (tieneSaldoInicial ? ' · el saldo inicial no se suma' : '');

  $('#bloque-categorias').hidden = detalle.tipo !== 'gasto';
  if (detalle.tipo === 'gasto') dibujarCategorias(lista, total);

  $('#detalle-lista-titulo').textContent = textos.lista;
  document.querySelectorAll('[data-orden]').forEach((b) => b.classList.toggle('activo', b.dataset.orden === detalle.orden));
  const ordenada = detalle.orden === 'monto' ? [...lista].sort((a, b) => b.monto - a.monto) : lista;
  dibujarLista($('#detalle-lista'), ordenada, textos.vacio);
}

for (const boton of document.querySelectorAll('[data-detalle]')) {
  boton.addEventListener('click', () => abrirDetalle(boton.dataset.detalle));
}
for (const boton of document.querySelectorAll('[data-orden]')) {
  boton.addEventListener('click', () => {
    detalle.orden = boton.dataset.orden;
    dibujarDetalle();
  });
}
$('#volver').addEventListener('click', () => {
  if (history.state?.detalle) history.back();
  else mostrarVista('dinero');
});
window.addEventListener('popstate', () => {
  if (!$('#vista-detalle').hidden) mostrarVista('dinero');
  else if (!$('#vista-buscar').hidden) mostrarVista(vistaAntesDeBuscar);
});

// ---------- Buscar movimientos ----------
// Busca en TODOS los meses. Cada palabra que escribas tiene que aparecer en el movimiento:
// en la categoría, la nota, la meta, el monto o la fecha ("tacos octubre" = tacos de octubre).

const busqueda = { texto: '', filtro: 'todos' };
const MAXIMO_RESULTADOS = 200; // para que no se trabe si tienes muchísimos
let vistaAntesDeBuscar = 'dinero';

// "Café" → "cafe": así encuentra lo mismo con o sin acentos y mayúsculas.
const sinAcentos = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const NOMBRES_TIPO = { gasto: 'gasto gaste', ingreso: 'ingreso gane', ahorro: 'ahorro ahorre meta' };

// Todo lo que se puede buscar de un movimiento, junto en un solo texto.
function textoBuscable(m) {
  const meta = m.meta ? datos.metas.find((x) => x.id === m.meta)?.nombre : '';
  const fecha = aFecha(m.fecha).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return sinAcentos([m.categoria, m.nota, meta, NOMBRES_TIPO[m.tipo], m.monto, m.monto.toFixed(2), fecha].join(' '));
}

function abrirBusqueda() {
  if ($('#vista-buscar').hidden) {
    const actual = document.querySelector('.vista:not([hidden])')?.id.replace('vista-', '');
    vistaAntesDeBuscar = actual === 'detalle' || !actual ? 'dinero' : actual;
    history.pushState({ buscar: true }, '');
  }
  mostrarVista('buscar');
  $('#buscar-texto').focus();
}

function dibujarBusqueda() {
  const palabras = sinAcentos(busqueda.texto).split(/\s+/).filter(Boolean);
  const encontrados = deSeccion('movimientos')
    .filter((m) => busqueda.filtro === 'todos' || m.tipo === busqueda.filtro)
    .filter((m) => {
      const texto = textoBuscable(m);
      return palabras.every((p) => texto.includes(p));
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);

  document.querySelectorAll('[data-filtro]').forEach((b) => b.classList.toggle('activo', b.dataset.filtro === busqueda.filtro));

  const gastado = sumar(encontrados.filter((m) => m.tipo === 'gasto'));
  const ingresado = sumar(encontrados.filter(esIngresoReal));
  const partes = [`${encontrados.length} ${encontrados.length === 1 ? 'movimiento' : 'movimientos'}`];
  if (gastado > 0) partes.push(`gastaste ${dinero.format(gastado)}`);
  if (ingresado > 0) partes.push(`ingresaste ${dinero.format(ingresado)}`);
  if (encontrados.length > MAXIMO_RESULTADOS) partes.push(`se muestran los ${MAXIMO_RESULTADOS} más recientes`);
  $('#buscar-resumen').textContent = palabras.length || busqueda.filtro !== 'todos' ? partes.join(' · ') : 'Todos tus movimientos, de cualquier mes.';

  const vacioTexto = palabras.length ? `No encontré nada con "${busqueda.texto.trim()}".` : 'Aún no tienes movimientos.';
  dibujarLista($('#buscar-lista'), encontrados.slice(0, MAXIMO_RESULTADOS), vacioTexto);
}

$('#abrir-buscar').addEventListener('click', abrirBusqueda);
$('#buscar-texto').addEventListener('input', (e) => {
  busqueda.texto = e.target.value;
  dibujarBusqueda();
});
// En el teléfono, "Buscar" en el teclado lo esconde para que veas los resultados.
$('#buscar-texto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.blur();
});
for (const boton of document.querySelectorAll('[data-filtro]')) {
  boton.addEventListener('click', () => {
    busqueda.filtro = boton.dataset.filtro;
    dibujarBusqueda();
  });
}
$('#volver-buscar').addEventListener('click', () => {
  if (history.state?.buscar) history.back();
  else mostrarVista(vistaAntesDeBuscar);
});
// En la compu: Ctrl + K o "/" abre la búsqueda (como en muchas apps).
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  const escribiendo = e.target.matches('input, textarea, select');
  if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !escribiendo)) {
    e.preventDefault();
    abrirBusqueda();
  }
});

let ultimoAgregado = null; // id del movimiento recién guardado, para animarlo al aparecer

function dibujarLista(ul, movimientos, textoVacio) {
  ul.replaceChildren();
  if (movimientos.length === 0) {
    ul.append(vacio(textoVacio));
    return;
  }
  const signos = { gasto: '−', ingreso: '+', ahorro: '' };
  for (const m of movimientos) {
    const li = filaDeslizable(m.tipo, () => borrarConDeshacer('movimientos', m, `Borrado: ${m.categoria} ${dinero.format(m.monto)}`));
    const fila = li.querySelector('.fila');
    if (m.id === ultimoAgregado) fila.classList.add('entrando');
    fila.append(
      icono(iconoDe(m), colorDe(m)),
      textoFila(m.tipo === 'ahorro' ? `Ahorro: ${m.categoria}` : m.categoria, [fechaBonita(m.fecha), m.nota].filter(Boolean).join(' · ')),
      montoFila(signos[m.tipo] + dinero.format(m.monto))
    );
    ul.append(li);
  }
  ultimoAgregado = null;
}

function dibujarCategorias(gastos, totalGastos) {
  const porCategoria = {};
  for (const m of gastos) porCategoria[m.categoria] = (porCategoria[m.categoria] || 0) + m.monto;
  const ordenadas = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);

  const ul = $('#categorias');
  ul.replaceChildren();
  if (ordenadas.length === 0) {
    ul.append(vacio('Sin gastos este mes.'));
    return;
  }
  for (const [categoria, monto] of ordenadas) {
    const porcentaje = Math.round((monto / totalGastos) * 100);
    const li = document.createElement('li');
    li.innerHTML = `<i class="ti ${ICONOS[categoria] || 'ti-tag'}" aria-hidden="true"></i>
      <div class="cat-fila"><span></span><span class="suave">${dinero.format(monto)} · ${porcentaje}%</span></div>
      <div class="barra"><div></div></div>`;
    li.querySelector('.cat-fila span').textContent = categoria;
    ul.append(li);
    llenar(li.querySelector('.barra > div'), porcentaje);
  }
}

// ---------- Piezas de las filas ----------

// Una fila que se borra al deslizarla a la izquierda.
function filaDeslizable(clase, alBorrar) {
  const li = document.createElement('li');
  li.className = 'deslizable ' + clase;
  li.innerHTML = '<div class="fondo-borrar"><i class="ti ti-trash" aria-hidden="true"></i></div>';
  const fila = document.createElement('div');
  fila.className = 'fila';
  li.append(fila);

  let inicioX = null;
  let inicioY = null;
  let movido = 0;
  let horizontal = null;
  fila.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    inicioX = e.clientX;
    inicioY = e.clientY;
    movido = 0;
    horizontal = null;
    fila.style.transition = 'none';
  });
  fila.addEventListener('pointermove', (e) => {
    if (inicioX === null) return;
    const dx = e.clientX - inicioX;
    const dy = e.clientY - inicioY;
    if (horizontal === null && Math.abs(dx) + Math.abs(dy) > 8) {
      horizontal = Math.abs(dx) > Math.abs(dy);
      if (horizontal) {
        fila.setPointerCapture(e.pointerId);
        li.classList.add('arrastrando');
      }
    }
    if (!horizontal) return;
    movido = Math.min(0, dx);
    fila.style.transform = `translateX(${movido}px)`;
  });
  const soltar = () => {
    if (inicioX === null) return;
    inicioX = null;
    fila.style.transition = 'transform .25s var(--suavecito)';
    if (movido < -fila.offsetWidth * 0.35) {
      fila.style.transform = 'translateX(-110%)';
      vibrar();
      setTimeout(() => {
        li.style.height = li.offsetHeight + 'px';
        li.getBoundingClientRect();
        Object.assign(li.style, { height: '0px', marginBottom: '-8px', opacity: '0' });
        setTimeout(alBorrar, 230);
      }, 180);
    } else {
      fila.style.transform = '';
      setTimeout(() => li.classList.remove('arrastrando'), 250);
    }
  };
  fila.addEventListener('pointerup', soltar);
  fila.addEventListener('pointercancel', soltar);
  return li;
}

// "color" es opcional: si viene, el ícono y su fondito llevan ese color.
function icono(nombre, color) {
  const div = document.createElement('div');
  div.className = 'icono-cat';
  div.innerHTML = `<i class="ti ${nombre}" aria-hidden="true"></i>`;
  // Como las monedas en las apps de cripto: círculo de color sólido con brillito y el dibujo en blanco.
  if (color) {
    div.classList.add('moneda');
    div.style.setProperty('--color-cat', color);
  }
  return div;
}

function colorDe(m) {
  if (m.tipo === 'ahorro') return 'var(--ahorro)';
  return COLORES[m.categoria] || (m.tipo === 'ingreso' ? 'var(--positivo)' : 'var(--negativo)');
}

function textoFila(titulo, detalle) {
  const div = document.createElement('div');
  div.className = 'fila-texto';
  const strong = document.createElement('strong');
  strong.textContent = titulo;
  const small = document.createElement('small');
  if (detalle instanceof Node) small.append(detalle);
  else small.textContent = detalle;
  div.append(strong, small);
  return div;
}

function montoFila(texto) {
  const span = document.createElement('span');
  span.className = 'monto';
  span.textContent = texto;
  return span;
}

function vacio(texto) {
  const li = document.createElement('li');
  li.className = 'vacio';
  li.textContent = texto;
  return li;
}

// ---------- Metas ----------

function dibujarMetas() {
  const total = deSeccion('movimientos').reduce((t, m) => t + efecto(m), 0);
  // Solo cuenta lo apartado en metas que todavía existen: si borras una meta,
  // lo que habías apartado para ella regresa a "Disponible".
  const metasVivas = new Set(datos.metas.map((meta) => meta.id));
  const enMetas = sumar(deSeccion('movimientos').filter((m) => m.tipo === 'ahorro' && metasVivas.has(m.meta)));
  contar($('#total-disponible'), total - enMetas, 700);
  contar($('#total-metas'), enMetas, 700);
  $('#pista-saldo').hidden = deSeccion('movimientos').some((m) => m.categoria === SALDO_INICIAL);

  const ul = $('#metas');
  ul.replaceChildren();
  if (deSeccion('metas').length === 0) {
    ul.append(vacio('Crea una meta para empezar a ahorrar con un objetivo.'));
    return;
  }
  for (const meta of deSeccion('metas')) {
    const ahorrado = ahorradoEn(meta);
    const avance = Math.min(100, Math.round((ahorrado / meta.objetivo) * 100));
    const cumplida = ahorrado >= meta.objetivo;

    const aviso = ahorrado > 0 ? `Meta borrada: ${meta.nombre}. Lo apartado regresó a Disponible` : `Meta borrada: ${meta.nombre}`;
    const li = filaDeslizable('meta-fila', () => borrarConDeshacer('metas', meta, aviso));
    const fila = li.querySelector('.fila');
    fila.classList.add('meta');
    if (cumplida) fila.classList.add('cumplida');
    fila.style.display = 'grid';

    const arriba = document.createElement('div');
    arriba.className = 'meta-arriba';
    const aportar = document.createElement('button');
    aportar.type = 'button';
    aportar.className = 'boton-aportar';
    aportar.textContent = 'Aportar';
    aportar.addEventListener('click', () => abrirFormulario({ tipo: 'ahorro', meta: meta.id }));
    arriba.append(icono(cumplida ? 'ti-trophy' : 'ti-target'), textoFila(meta.nombre, cumplida ? 'Meta cumplida' : `Faltan ${dinero.format(meta.objetivo - ahorrado)}`), aportar);

    const barra = document.createElement('div');
    barra.className = 'barra';
    barra.innerHTML = '<div></div>';
    const abajo = document.createElement('div');
    abajo.className = 'meta-abajo';
    abajo.innerHTML = `<span>${dinero.format(ahorrado)} de ${dinero.format(meta.objetivo)}</span><span>${avance}%</span>`;

    fila.append(arriba, barra, abajo);
    ul.append(li);
    llenar(barra.firstChild, avance);
  }
}

// ---------- Racha ----------

function dibujarRacha() {
  const { actual, mejor, registradoHoy, semana, activos } = calcularRacha();
  const etapa = etapaDe(actual);

  $('#racha-mini').textContent = actual;
  $('#pastilla-racha .ti').style.color = actual > 0 ? etapa.color : '';
  $('#punto-racha').hidden = registradoHoy;

  const flama = $('#flama');
  flama.style.color = etapa.color;
  flama.style.fontSize = etapa.tamano + 'px';
  flama.classList.toggle('viva', actual > 0);
  $('#racha-dias').textContent = `${actual} ${actual === 1 ? 'día' : 'días'}`;
  $('#racha-etapa').textContent = etapa.nombre;
  $('#racha-etapa').style.color = etapa.color;
  $('#racha-mejor').textContent = mejor > 0 ? `Tu mejor racha: ${mejor} ${mejor === 1 ? 'día' : 'días'}` : '';

  $('#racha-semana').replaceChildren(
    ...semana.map(({ dia, activo, esHoy }) => {
      const li = document.createElement('li');
      li.className = [activo && 'activo', esHoy && 'hoy'].filter(Boolean).join(' ');
      li.textContent = LETRAS[aFecha(dia).getDay()];
      li.title = fechaBonita(dia);
      return li;
    })
  );

  const siguiente = ETAPAS.find((e) => e.desde > actual);
  let mensaje;
  if (registradoHoy) mensaje = siguiente ? `Ya registraste hoy. Faltan ${siguiente.desde - actual} días para ${siguiente.nombre}.` : 'Ya registraste hoy. Eres leyenda.';
  else if (actual > 0) mensaje = 'Registra algo hoy para no perder tu racha.';
  else mensaje = 'Registra algo hoy para encender tu flama.';
  $('#racha-mensaje').textContent = mensaje;
  $('#sin-movimientos').hidden = registradoHoy;

  $('#etapas').replaceChildren(
    ...ETAPAS.slice(1).concat([]).map((e) => {
      const div = document.createElement('div');
      div.className = mejor >= e.desde ? 'lograda' : '';
      div.innerHTML = `<i class="ti ti-flame" aria-hidden="true" style="color:${mejor >= e.desde ? e.color : 'var(--linea)'}"></i>`;
      div.append(e.nombre, document.createElement('br'), `${e.desde} ${e.desde === 1 ? 'día' : 'días'}`);
      return div;
    })
  );
  $('#etapas').style.gridTemplateColumns = `repeat(${ETAPAS.length - 1}, 1fr)`;

  dibujarCalendario(activos);
}

// Calendario del mes actual con los días registrados.
function dibujarCalendario(activos) {
  const hoyTexto = hoy();
  const [a, m] = hoyTexto.split('-').map(Number);
  const primero = new Date(a, m - 1, 1);
  const diasDelMes = new Date(a, m, 0).getDate();
  const huecos = (primero.getDay() + 6) % 7; // la semana empieza en lunes

  const celdas = [];
  for (let i = 0; i < huecos; i++) celdas.push(document.createElement('li'));
  let registrados = 0;
  for (let d = 1; d <= diasDelMes; d++) {
    const dia = fechaLocal(new Date(a, m - 1, d));
    const li = document.createElement('li');
    li.textContent = d;
    if (activos.has(dia)) {
      li.classList.add('activo');
      registrados++;
    }
    if (dia === hoyTexto) li.classList.add('hoy');
    if (dia > hoyTexto) li.classList.add('futuro');
    celdas.push(li);
  }
  $('#calendario').replaceChildren(...celdas);
  $('#calendario-titulo').textContent = mayuscula(primero.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }));
  $('#calendario-cuenta').textContent = `${registrados} de ${Number(hoyTexto.slice(8))} días`;
}

// ---------- Pagos pendientes ----------

function dibujarPagos() {
  const ordenados = deSeccion('pendientes').sort((a, b) => a.fecha.localeCompare(b.fecha));
  const debo = ordenados.filter((p) => p.tipo === 'debo');
  const meDeben = ordenados.filter((p) => p.tipo === 'me-deben');

  contar($('#total-debo'), sumar(debo), 700);
  contar($('#total-me-deben'), sumar(meDeben), 700);
  // El punto en la barra avisa de pagos que vencen hoy, mañana o ya vencieron.
  $('#punto-pagos').hidden = !ordenados.some((p) => diasPara(p.fecha) <= 1);

  dibujarListaPagos($('#lista-debo'), debo, 'No le debes nada a nadie.');
  dibujarListaPagos($('#lista-me-deben'), meDeben, 'Nadie te debe nada.');
  dibujarFijos();
}

function dibujarListaPagos(ul, pagos, textoVacio) {
  ul.replaceChildren();
  if (pagos.length === 0) {
    ul.append(vacio(textoVacio));
    return;
  }
  for (const p of pagos) {
    const dias = diasPara(p.fecha);
    const li = filaDeslizable(p.tipo, () => borrarConDeshacer('pendientes', p, `Borrado: ${p.persona} ${dinero.format(p.monto)}`));
    const cuando = document.createElement('span');
    cuando.className = 'vence' + (dias < 0 ? ' vencido' : dias <= 1 ? ' pronto' : '');
    cuando.textContent = cuandoVence(p.fecha);
    const detalle = document.createDocumentFragment();
    detalle.append(cuando, p.nota ? ` · ${p.nota}` : '');

    const listo = document.createElement('button');
    listo.type = 'button';
    listo.className = 'boton-listo';
    listo.textContent = p.tipo === 'debo' ? 'Pagué' : 'Me pagó';
    listo.addEventListener('click', () => liquidarPago(p));

    li.querySelector('.fila').append(icono(p.tipo === 'debo' ? 'ti-arrow-up-right' : 'ti-arrow-down-left'), textoFila(p.persona, detalle), montoFila(dinero.format(p.monto)), listo);
    ul.append(li);
  }
}

// Al pagar (o cobrar), el pago se vuelve un gasto (o ingreso) y sale de la lista de pendientes.
function liquidarPago(p) {
  const debo = p.tipo === 'debo';
  agregar('movimientos', {
    id: crypto.randomUUID(),
    tipo: debo ? 'gasto' : 'ingreso',
    monto: p.monto,
    categoria: 'Otros',
    nota: (debo ? 'Pago a ' : 'Me pagó ') + p.persona + (p.nota ? ` (${p.nota})` : ''),
    fecha: hoy(),
    creado: Date.now(),
    meta: '',
  });
  borrar('pendientes', p.id);
  vibrar();
  avisar(debo ? `Pagado a ${p.persona}. Lo anoté como gasto.` : `${p.persona} te pagó. Lo anoté como ingreso.`);
}

// ---------- Pagos fijos (los que se repiten: Netflix, renta, plan del cel…) ----------

const AVISAR_FIJOS = 7; // con cuántos días de anticipación se avisa
const TEXTO_CADA = { semana: 'Cada semana', mes: 'Cada mes', anio: 'Cada año' };

// La fecha del siguiente cobro. En los meses cortos se ajusta: un cobro del 31 pasa al 30 o al 28,
// y al mes siguiente regresa al 31 (por eso se usa "dia", el día original, y no la fecha anterior).
function siguienteCobro(fecha, cada, dia) {
  if (cada === 'semana') return sumarDias(fecha, 7);
  const [a, m, dFecha] = fecha.split('-').map(Number);
  const d = dia || dFecha;
  const anio = cada === 'anio' ? a + 1 : a + (m === 12 ? 1 : 0);
  const mes = cada === 'anio' ? m : (m % 12) + 1;
  const ultimoDia = new Date(anio, mes, 0).getDate();
  return fechaLocal(new Date(anio, mes - 1, Math.min(d, ultimoDia)));
}

// Los que se cobran pronto (o ya se pasaron), del más cercano al más lejano.
const fijosProximos = () =>
  deSeccion('fijos')
    .filter((f) => diasPara(f.proximo) <= AVISAR_FIJOS)
    .sort((a, b) => a.proximo.localeCompare(b.proximo));

function dibujarFijos() {
  const fijos = deSeccion('fijos').sort((a, b) => a.proximo.localeCompare(b.proximo));
  const porMes = { semana: 52 / 12, mes: 1, anio: 1 / 12 };
  const alMes = fijos.reduce((t, f) => t + f.monto * porMes[f.cada], 0);
  $('#fijos-al-mes').textContent = fijos.length ? `Unos ${dinero.format(alMes)} al mes` : '';

  const ul = $('#lista-fijos');
  ul.replaceChildren();
  if (fijos.length === 0) ul.append(vacio('Anota aquí lo que pagas seguido (Netflix, Spotify, renta…) y te aviso una semana antes.'));
  for (const f of fijos) {
    const dias = diasPara(f.proximo);
    const li = filaDeslizable('fijo', () => borrarConDeshacer('fijos', f, `Borrado: ${f.nombre}`));
    const cuando = document.createElement('span');
    cuando.className = 'vence' + (dias < 0 ? ' vencido' : dias <= 1 ? ' pronto' : '');
    cuando.textContent = cuandoVence(f.proximo);
    const detalle = document.createDocumentFragment();
    detalle.append(`${TEXTO_CADA[f.cada]} · `, cuando);

    const pague = document.createElement('button');
    pague.type = 'button';
    pague.className = 'boton-listo';
    pague.textContent = 'Pagué';
    pague.addEventListener('click', () => pagarFijo(f));

    li.querySelector('.fila').append(icono('ti-repeat'), textoFila(f.nombre, detalle), montoFila(dinero.format(f.monto)), pague);
    ul.append(li);
  }

  // En Dinero: un aviso discreto con lo que se cobra en los próximos días.
  const proximos = fijosProximos();
  const aviso = $('#aviso-fijos');
  aviso.hidden = proximos.length === 0;
  if (proximos.length > 0) {
    const primero = proximos[0];
    const otros = proximos.length > 1 ? ` y ${proximos.length - 1} más` : '';
    $('#aviso-fijos-texto').textContent = `${primero.nombre} (${dinero.format(primero.monto)}) · ${cuandoVence(primero.proximo).toLowerCase()}${otros}`;
  }
  // El punto en la barra también avisa si un pago fijo es hoy, mañana o ya se pasó.
  if (proximos.some((f) => diasPara(f.proximo) <= 1)) $('#punto-pagos').hidden = false;
}

// Al pagarlo se anota como gasto y la fecha brinca al siguiente cobro (sigue en la lista).
const pagadoHaceRato = new Map(); // id → cuándo se tocó "Pagué" (contra el doble toque)

function pagarFijo(f) {
  // Un segundo toque seguido (la lista se redibuja y el botón nuevo queda bajo el dedo) no vuelve a cobrar.
  if (Date.now() - (pagadoHaceRato.get(f.id) || 0) < 2000) return;
  pagadoHaceRato.set(f.id, Date.now());

  const gasto = {
    id: crypto.randomUUID(),
    tipo: 'gasto',
    monto: f.monto,
    categoria: 'Pagos fijos',
    nota: f.nombre,
    fecha: hoy(),
    creado: Date.now(),
    meta: '',
    seccion: f.seccion,
  };
  agregar('movimientos', gasto);
  // Se cambia guardando una copia nueva con el mismo id (así también se actualiza en la nube).
  const siguiente = { ...f, proximo: siguienteCobro(f.proximo, f.cada, f.dia) };
  cambiarFijo(siguiente);
  vibrar();
  avisar(`${f.nombre} pagado. El siguiente cobro es ${fechaBonita(siguiente.proximo)}.`, 'Deshacer', () => {
    // Deshacer: se quita el gasto y el pago regresa a su fecha anterior.
    borrar('movimientos', gasto.id);
    cambiarFijo(f);
    pagadoHaceRato.delete(f.id);
  });
}

function cambiarFijo(fijo) {
  datos.fijos = datos.fijos.map((x) => (x.id === fijo.id ? fijo : x));
  guardarColeccion('fijos');
  encolar({ accion: 'agregar', coleccion: 'fijos', objeto: fijo });
  dibujar();
  sincronizar();
}

$('#aviso-fijos').addEventListener('click', () => mostrarVista('pagos'));

// ---------- Avisos ----------

let ocultarAviso;
function avisar(texto, textoAccion, alTocar) {
  const aviso = $('#aviso');
  const accion = $('#aviso-accion');
  $('#aviso-texto').textContent = texto;
  accion.hidden = !textoAccion;
  accion.textContent = textoAccion || '';
  accion.onclick = () => {
    aviso.hidden = true;
    alTocar?.();
  };
  // Una hoja abierta queda "encima de todo"; si el aviso se queda afuera, no se ve.
  // Por eso se mete dentro de la hoja abierta (y regresa a su lugar cuando la hoja se cierra).
  const hojaAbierta = document.querySelector('dialog[open]:not(.cerrando)');
  const lugar = hojaAbierta || document.body;
  if (aviso.parentElement !== lugar) lugar.append(aviso);
  aviso.hidden = true;
  aviso.getBoundingClientRect();
  aviso.hidden = false;
  clearTimeout(ocultarAviso);
  ocultarAviso = setTimeout(() => (aviso.hidden = true), textoAccion ? 5000 : 3500);
}

// ---------- Hojas que suben desde abajo ----------

// Cada hoja recuerda su "cierre pendiente" para que abrir y cerrar rápido no la deje a medias.
function abrirHoja(hoja) {
  clearTimeout(hoja.cierre);
  hoja.classList.remove('cerrando');
  hoja.style.transform = '';
  hoja.style.transition = '';
  if (!hoja.open) hoja.showModal();
  hoja.scrollTop = 0;
  // Al abrir, el navegador pone el cursor en el primer botón (la X); se quita para que Enter guarde.
  if (document.activeElement?.classList.contains('cerrar-hoja')) document.activeElement.blur();
}

function cerrarHoja(hoja) {
  if (!hoja?.open) return;
  document.activeElement?.blur(); // esconde el teclado del teléfono si estaba abierto
  hoja.classList.add('cerrando');
  clearTimeout(hoja.cierre);
  hoja.cierre = setTimeout(() => {
    hoja.classList.remove('cerrando');
    hoja.close();
  }, 210);
}

for (const hoja of document.querySelectorAll('.hoja')) {
  // Tocar fuera de la hoja (en lo oscuro) la cierra.
  hoja.addEventListener('click', (e) => {
    if (e.target === hoja) cerrarHoja(hoja);
  });
  hoja.addEventListener('cancel', (e) => {
    e.preventDefault();
    cerrarHoja(hoja);
  });
  // Si el aviso estaba dentro de esta hoja, regresa a la pantalla normal para seguir viéndose.
  hoja.addEventListener('close', () => {
    const aviso = $('#aviso');
    if (hoja.contains(aviso)) document.body.append(aviso);
  });
}

// Mientras una hoja se está cerrando, ya no acepta otro "Guardar"
// (un doble toque rápido creaba el mismo movimiento dos veces).
document.addEventListener(
  'submit',
  (e) => {
    const hoja = e.target.closest('dialog');
    if (hoja && (!hoja.open || hoja.classList.contains('cerrando'))) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true
);
for (const boton of document.querySelectorAll('[data-cierra]')) {
  boton.addEventListener('click', () => cerrarHoja(boton.closest('dialog')));
}

// Deslizar una hoja hacia abajo la cierra (como en las apps del iPhone).
// Solo cuenta si la hoja está hasta arriba y el dedo va hacia abajo; si va de lado
// (por ejemplo en las categorías) o la hoja tiene scroll, no hace nada.
const DESLIZAR_PARA_CERRAR = 110; // pixeles
for (const hoja of document.querySelectorAll('.hoja')) {
  let inicio = null;
  let bajando = null; // null = aún no se sabe, true = cerrando, false = es otro gesto
  let distancia = 0;

  hoja.addEventListener('touchstart', (e) => {
    const desdeArriba = e.target.closest('.hoja-arriba');
    // Al acomodar la foto o mover un deslizador, el dedo baja pero NO quieres cerrar la hoja.
    const otroGesto = e.target.closest('#recorte, input[type=range]');
    inicio = e.touches.length === 1 && !otroGesto && (desdeArriba || hoja.scrollTop <= 0) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    bajando = null;
    distancia = 0;
  }, { passive: true });

  hoja.addEventListener('touchmove', (e) => {
    if (!inicio || bajando === false) return;
    const dx = e.touches[0].clientX - inicio.x;
    const dy = e.touches[0].clientY - inicio.y;
    if (bajando === null) {
      if (Math.abs(dx) + Math.abs(dy) < 8) return;
      bajando = dy > 0 && Math.abs(dy) > Math.abs(dx);
      if (!bajando) return;
      hoja.style.transition = 'none';
    }
    e.preventDefault();
    distancia = Math.max(0, dy);
    hoja.style.transform = `translateY(${distancia}px)`;
  }, { passive: false });

  // touchcancel: el teléfono interrumpió el gesto (una llamada, una notificación…): la hoja regresa.
  const soltar = (cancelado) => {
    if (!bajando) return;
    bajando = null;
    hoja.style.transition = 'transform .22s ease-out';
    clearTimeout(hoja.cierre);
    if (!cancelado && distancia > DESLIZAR_PARA_CERRAR) {
      document.activeElement?.blur();
      hoja.style.transform = 'translateY(100%)';
      hoja.cierre = setTimeout(() => {
        hoja.close();
        hoja.style.transition = '';
        hoja.style.transform = '';
      }, 220);
    } else {
      hoja.style.transform = '';
      hoja.cierre = setTimeout(() => (hoja.style.transition = ''), 220);
    }
  };
  hoja.addEventListener('touchend', () => soltar(false));
  hoja.addEventListener('touchcancel', () => soltar(true));
}

// ---------- Formulario de movimientos (teclado propio) ----------

const formulario = { monto: '0', categoria: null };

// Las categorías fijas más las que tú has escrito (se sacan de tus movimientos, así llegan a todos tus dispositivos).
function categoriasDe(tipo) {
  const fijas = CATEGORIAS[tipo].filter((c) => c !== 'Otros');
  const propias = new Set();
  for (const m of datos.movimientos) {
    if (m.tipo === tipo && !CATEGORIAS[tipo].includes(m.categoria)) propias.add(m.categoria);
  }
  return [...fijas, ...[...propias].sort(), 'Otros'];
}

function pintarMonto() {
  const [enteros, decimales] = formulario.monto.split('.');
  $('#monto-pantalla').textContent = '$' + Number(enteros).toLocaleString('es-MX') + (decimales !== undefined ? '.' + decimales : '');
}

// Las 2 categorías que más usas (o unas comunes si apenas empiezas); son las que se ven siempre.
const PRINCIPALES = { gasto: ['Comida', 'Transporte'], ingreso: ['Ventas', 'Sueldo'] };

function principalesDe(tipo) {
  const usos = {};
  for (const m of deSeccion('movimientos')) {
    if (m.tipo !== tipo || m.categoria === 'Otros' || m.categoria === SALDO_INICIAL) continue;
    usos[m.categoria] = (usos[m.categoria] || 0) + 1;
  }
  const masUsadas = Object.entries(usos).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return [...new Set([...masUsadas, ...PRINCIPALES[tipo]])].slice(0, 2);
}

// Chips de categoría. Para no tener que deslizar, solo salen 4: tus 2 principales, "Nueva" con el
// lápiz para escribir la tuya y "Otros" (que despliega todas las demás). Para ahorros, son tus metas.
function pintarCategorias() {
  const tipo = $('#form').tipo.value;
  const contenedor = $('#chips-categoria');
  let opciones;
  if (tipo === 'ahorro') {
    opciones = deSeccion('metas').map((meta) => ({ valor: meta.id, texto: meta.nombre, icono: 'ti-target' }));
  } else {
    const principales = principalesDe(tipo);
    // Si la categoría elegida no está a la vista (por ejemplo, viene de "Aportar" o de la IA), se despliegan todas.
    const elegida = formulario.categoria;
    if (elegida && elegida !== NUEVA_CATEGORIA && !principales.includes(elegida)) formulario.verTodas = true;
    const visibles = formulario.verTodas ? categoriasDe(tipo) : principales;
    opciones = visibles.map((c) => ({ valor: c, texto: c, icono: ICONOS[c] || 'ti-tag' }));
    opciones.push({ valor: NUEVA_CATEGORIA, texto: 'Nueva', icono: 'ti-pencil' });
    if (!formulario.verTodas) opciones.push({ desplegar: true, texto: 'Otros', icono: 'ti-chevron-down' });
    if (formulario.verTodas) opciones.push({ desplegar: true, texto: 'Menos', icono: 'ti-chevron-up' });
  }
  contenedor.classList.toggle('envolver', tipo !== 'ahorro');

  const elegibles = opciones.filter((o) => !o.desplegar);
  if (!elegibles.some((o) => o.valor === formulario.categoria)) formulario.categoria = elegibles[0]?.valor ?? null;
  contenedor.replaceChildren(
    ...opciones.map((o) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      const activo = !o.desplegar && o.valor === formulario.categoria;
      chip.className = 'chip' + (activo ? ' activo' : '') + (o.desplegar ? ' chip-desplegar' : '');
      if (!o.desplegar) {
        chip.setAttribute('role', 'radio');
        chip.setAttribute('aria-checked', activo);
      }
      chip.innerHTML = `<i class="ti ${o.icono}" aria-hidden="true"></i>`;
      chip.append(o.texto);
      chip.addEventListener('click', () => {
        if (o.desplegar) {
          formulario.verTodas = !formulario.verTodas;
          // Al cerrar, si lo elegido ya no se ve, se vuelve a la principal.
          if (!formulario.verTodas && !principalesDe(tipo).includes(formulario.categoria) && formulario.categoria !== NUEVA_CATEGORIA) {
            formulario.categoria = null;
          }
        } else {
          formulario.categoria = o.valor;
        }
        pintarCategorias();
        if (o.valor === NUEVA_CATEGORIA) $('#nueva-categoria').focus();
      });
      return chip;
    })
  );
  if (tipo === 'ahorro' && deSeccion('metas').length === 0) contenedor.append(vacio('Primero crea una meta en la sección Metas.'));

  const caja = $('#nueva-categoria');
  caja.hidden = formulario.categoria !== NUEVA_CATEGORIA;
  if (caja.hidden) caja.value = '';
  actualizarFlechas();
}

// Las flechas solo aparecen si hay chips escondidos de ese lado.
function actualizarFlechas() {
  const chips = $('#chips-categoria');
  requestAnimationFrame(() => {
    $('.flecha.izquierda').hidden = chips.scrollLeft <= 2;
    $('.flecha.derecha').hidden = chips.scrollLeft + chips.clientWidth >= chips.scrollWidth - 2;
  });
}

$('#chips-categoria').addEventListener('scroll', actualizarFlechas);
// Con la rueda del mouse también se mueven hacia los lados.
$('#chips-categoria').addEventListener(
  'wheel',
  (e) => {
    if (e.currentTarget.classList.contains('envolver')) return; // ya no se desliza de lado
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    e.currentTarget.scrollLeft += e.deltaY;
  },
  { passive: false }
);
for (const flecha of document.querySelectorAll('[data-mover]')) {
  flecha.addEventListener('click', () => {
    const chips = $('#chips-categoria');
    chips.scrollBy({ left: Number(flecha.dataset.mover) * chips.clientWidth * 0.7 });
  });
}

// Abre el formulario; si viene algo prellenado (de la IA o de "Aportar"), lo deja listo para revisar.
function abrirFormulario(prellenado = {}) {
  const form = $('#form');
  form.reset();
  form.tipo.value = prellenado.tipo || 'gasto';
  form.fecha.value = prellenado.fecha || hoy();
  form.nota.value = prellenado.nota || '';
  formulario.monto = prellenado.monto ? String(prellenado.monto) : '0';
  formulario.categoria = prellenado.meta || prellenado.categoria || null;
  formulario.verTodas = false;
  const propuesta = prellenado.categoria === NUEVA_CATEGORIA;
  if (prellenado.categoria && !propuesta && form.tipo.value !== 'ahorro' && !categoriasDe(form.tipo.value).includes(prellenado.categoria)) {
    formulario.categoria = 'Otros';
  }
  pintarMonto();
  $('#chips-categoria').scrollLeft = 0;
  abrirHoja($('#hoja-movimiento'));
  pintarCategorias(); // después de abrir, para que las flechas midan bien
  // Categoría nueva propuesta al anotar escribiendo: ya viene escrita en la cajita de "Nueva".
  if (propuesta) $('#nueva-categoria').value = prellenado.nuevaCategoria || '';
}

for (const radio of $('#form').querySelectorAll('input[name="tipo"]')) {
  radio.addEventListener('change', () => {
    formulario.categoria = null;
    formulario.verTodas = false;
    pintarCategorias();
  });
}

$('#teclado').append(
  ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'borrar'].map((tecla) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'tecla';
    boton.dataset.tecla = tecla;
    if (tecla === 'borrar') {
      boton.innerHTML = '<i class="ti ti-backspace" aria-hidden="true"></i>';
      boton.setAttribute('aria-label', 'Borrar');
    } else {
      boton.textContent = tecla;
    }
    boton.addEventListener('click', () => {
      let m = formulario.monto;
      if (tecla === 'borrar') m = m.length > 1 ? m.slice(0, -1) : '0';
      else if (tecla === '.') m = m.includes('.') ? m : m + '.';
      else if (/\.\d\d$/.test(m) || m.replace('.', '').length >= 9) return;
      else m = m === '0' ? tecla : m + tecla;
      formulario.monto = m;
      pintarMonto();
    });
    return boton;
  })
);

// En la compu: el monto también se escribe con el teclado de verdad (números, punto, borrar y Enter).
document.addEventListener('keydown', (e) => {
  if (!$('#hoja-movimiento').open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.matches('input:not([type=radio]), textarea, select')) return; // escribiendo la nota o la fecha
  const tecla = e.key === 'Backspace' ? 'borrar' : e.key === ',' ? '.' : e.key;
  if (tecla === 'Enter') {
    // Enter sobre un botón (la X, una categoría…) hace lo de ese botón, no guardar.
    if (e.target.matches('button')) return;
    e.preventDefault();
    $('#form').requestSubmit();
    return;
  }
  const boton = $(`#teclado [data-tecla="${CSS.escape(tecla)}"]`);
  if (!boton) return;
  e.preventDefault();
  boton.click();
});

function temblarMonto() {
  const pantalla = $('#monto-pantalla');
  pantalla.classList.remove('tiembla');
  pantalla.getBoundingClientRect();
  pantalla.classList.add('tiembla');
}
$('#monto-pantalla').addEventListener('animationend', (e) => e.target.classList.remove('tiembla'));

$('#form').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const form = evento.target;
  const tipo = form.tipo.value;
  const monto = Math.round(parseFloat(formulario.monto) * 100) / 100;
  if (!monto) {
    temblarMonto();
    avisar('Escribe cuánto fue con los números de abajo');
    return;
  }
  const meta = tipo === 'ahorro' ? datos.metas.find((x) => x.id === formulario.categoria) : null;
  if (tipo === 'ahorro' && !meta) {
    avisar('Primero crea una meta en la sección Metas');
    return;
  }
  // Una categoría escrita a mano empieza con mayúscula: "gimnasio" → "Gimnasio"
  const escrita = form.nuevaCategoria.value.trim();
  if (formulario.categoria === NUEVA_CATEGORIA && !escrita) {
    $('#nueva-categoria').focus();
    avisar('Escribe el nombre de tu categoría');
    return;
  }
  const categoria = meta ? meta.nombre : formulario.categoria === NUEVA_CATEGORIA ? mayuscula(escrita) : formulario.categoria;

  const id = crypto.randomUUID();
  ultimoAgregado = id;
  $('#mes').value = form.fecha.value.slice(0, 7); // muestra el mes del movimiento nuevo
  agregar('movimientos', {
    id,
    tipo,
    monto,
    categoria,
    nota: form.nota.value.trim(),
    fecha: form.fecha.value,
    creado: Date.now(),
    meta: meta ? meta.id : '',
  });
  vibrar();
  cerrarHoja($('#hoja-movimiento'));
  if (tipo === 'ahorro') avisar(`Apartaste ${dinero.format(monto)} para ${meta.nombre}`);
});

// ---------- Racha ----------

$('#sin-movimientos').addEventListener('click', () => {
  agregar('dias', { id: hoy(), creado: Date.now() });
  vibrar();
  avisar('Día registrado. Tu racha sigue.');
});

// ---------- Metas ----------

$('#form-meta').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const form = evento.target;
  agregar('metas', {
    id: crypto.randomUUID(),
    nombre: form.nombre.value.trim(),
    objetivo: Math.round(Number(form.objetivo.value) * 100) / 100,
    creado: Date.now(),
  });
  cerrarHoja($('#hoja-meta'));
  avisar('Meta creada. Toca "Aportar" cuando apartes dinero para ella.');
});

// ---------- Pagos pendientes ----------

function ajustarFormularioPago() {
  const debo = $('#form-pago').tipo.value === 'debo';
  $('#etiqueta-persona').textContent = debo ? '¿A quién le debes?' : '¿Quién te debe?';
}

for (const radio of $('#form-pago').querySelectorAll('input[name="tipo"]')) {
  radio.addEventListener('change', ajustarFormularioPago);
}

$('#form-pago').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const form = evento.target;
  agregar('pendientes', {
    id: crypto.randomUUID(),
    tipo: form.tipo.value,
    persona: form.persona.value.trim(),
    monto: Math.round(Number(form.monto.value) * 100) / 100,
    fecha: form.fecha.value,
    nota: form.nota.value.trim(),
    creado: Date.now(),
  });
  cerrarHoja($('#hoja-pago'));
  avisar('Anotado.');
});

$('#form-fijo').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const form = evento.target;
  const nombre = form.nombre.value.trim();
  agregar('fijos', {
    id: crypto.randomUUID(),
    nombre,
    monto: Math.round(Number(form.monto.value) * 100) / 100,
    cada: form.cada.value,
    proximo: form.proximo.value,
    dia: Number(form.proximo.value.slice(8, 10)),
    creado: Date.now(),
  });
  cerrarHoja($('#hoja-fijo'));
  avisar(`Te avisaremos una semana antes de cada cobro de ${nombre}.`);
});

// ---------- Secciones de dinero (Personal, Mi empresa…) ----------

const ICONOS_SECCION = ['ti-user', 'ti-building-store', 'ti-briefcase', 'ti-pepper', 'ti-home', 'ti-school', 'ti-heart', 'ti-car'];
let seccionEditando = null; // null = creando una nueva

const seccionVista = () => secciones.find((s) => s.id === seccionActual) || SECCION_PERSONAL;

// Las secciones borradas se recuerdan un tiempo (id → cuándo), para que otro dispositivo no las "reviva".
const CLAVE_SECCIONES_BORRADAS = 'mi-dinero:secciones-borradas';
const CLAVE_SECCIONES_SIN_SUBIR = 'mi-dinero:secciones-sin-subir';
let seccionesBorradas = leer(CLAVE_SECCIONES_BORRADAS, {});

// "Otra sección" es solo un nombre provisional de este teléfono: no se sube a la cuenta.
const seccionesParaGuardar = () => secciones.filter((s) => !s.relleno);

function guardarSecciones() {
  escribir(CLAVE_SECCIONES, secciones);
  escribir(CLAVE_SECCIONES_BORRADAS, seccionesBorradas);
  // Con cuenta, la lista también se guarda en tu cuenta para que salga en todos tus dispositivos.
  if (!cuenta || !db) return;
  escribir(CLAVE_SECCIONES_SIN_SUBIR, true);
  db.auth
    .updateUser({ data: { secciones: seccionesParaGuardar(), secciones_borradas: seccionesBorradas } })
    .then(({ data, error }) => {
      if (error) return; // Se reintenta en la siguiente sincronización.
      if (data?.user) cuenta = data.user;
      escribir(CLAVE_SECCIONES_SIN_SUBIR, false);
    })
    .catch(() => {});
}

// Al salir de la cuenta, las secciones eran de esa cuenta.
function reiniciarSecciones() {
  secciones = [SECCION_PERSONAL];
  seccionActual = 'personal';
  seccionesBorradas = {};
  escribir(CLAVE_SECCIONES, secciones);
  escribir(CLAVE_SECCION, seccionActual);
  escribir(CLAVE_SECCIONES_BORRADAS, seccionesBorradas);
  escribir(CLAVE_SECCIONES_SIN_SUBIR, false);
}

// Junta las secciones guardadas en la cuenta con las de este teléfono (al entrar y al sincronizar).
async function seccionesDeLaCuenta() {
  // getUser() pregunta a la nube, así salen las secciones creadas en otro dispositivo hace poco.
  const { data } = await db.auth.getUser().catch(() => ({ data: null }));
  if (!cuenta) return;
  if (data?.user) cuenta = data.user;
  const enLaCuenta = cuenta.user_metadata?.secciones;
  const borradasCuenta = cuenta.user_metadata?.secciones_borradas || {};
  const antes = JSON.stringify([secciones, seccionesBorradas]);

  // Borradas: se juntan las de los dos lados (gana la fecha más nueva).
  for (const [id, cuando] of Object.entries(borradasCuenta)) {
    if (!(seccionesBorradas[id] >= cuando)) seccionesBorradas[id] = cuando;
  }
  // Por cada sección gana la versión cambiada más recientemente; un relleno nunca le gana a una real.
  const porId = new Map(secciones.map((s) => [s.id, s]));
  for (const s of Array.isArray(enLaCuenta) ? enLaCuenta : []) {
    if (!s?.id) continue;
    const aqui = porId.get(s.id);
    if (!aqui || aqui.relleno || (s.cambio || 0) > (aqui.cambio || 0)) porId.set(s.id, s);
  }
  // Se quita lo borrado, salvo que alguien la haya vuelto a cambiar después de borrarla.
  secciones = [...porId.values()].filter((s) => s.id === 'personal' || !(seccionesBorradas[s.id] > (s.cambio || 0)));
  if (!secciones.some((s) => s.id === 'personal')) secciones.unshift(SECCION_PERSONAL);
  if (!secciones.some((s) => s.id === seccionActual)) cambiarSeccion('personal');

  escribir(CLAVE_SECCIONES, secciones);
  escribir(CLAVE_SECCIONES_BORRADAS, seccionesBorradas);
  // Solo se sube si algo es distinto (sin importar el orden), para no escribir en cada sincronización.
  const huella = (lista, borradas) =>
    JSON.stringify([
      [...lista].sort((a, b) => (a.id < b.id ? -1 : 1)).map((s) => [s.id, s.nombre, s.icono, s.cambio || 0]),
      Object.entries(borradas).sort(),
    ]);
  const distinto = huella(Array.isArray(enLaCuenta) ? enLaCuenta : [], borradasCuenta) !== huella(seccionesParaGuardar(), seccionesBorradas);
  if (distinto || leer(CLAVE_SECCIONES_SIN_SUBIR, false)) guardarSecciones();
  if (JSON.stringify([secciones, seccionesBorradas]) !== antes) dibujar();
}

function dibujarSecciones() {
  // Si llegó algo de una sección que este teléfono no conoce (por ejemplo, creada en otro), se agrega.
  for (const nombre of ['movimientos', 'metas', 'pendientes', 'fijos']) {
    for (const x of datos[nombre]) {
      if (!secciones.some((s) => s.id === x.seccion)) secciones.push({ id: x.seccion, nombre: 'Otra sección', icono: 'ti-folder', relleno: true });
    }
  }
  if (!secciones.some((s) => s.id === seccionActual)) seccionActual = 'personal';

  // La hoja "Cambiar a" (sale al picarle a tu nombre): todas las secciones con palomita en la actual,
  // un lápiz para editar cada una y, hasta abajo, "Nueva sección".
  const lista = $('#lista-secciones');
  lista.replaceChildren();
  for (const s of secciones) {
    const fila = document.createElement('div');
    fila.className = 'opcion-seccion' + (s.id === seccionActual ? ' actual' : '');
    fila.innerHTML = `<button type="button" class="opcion-elegir" role="radio" aria-checked="${s.id === seccionActual}">
        <span class="opcion-icono"><i class="ti ${s.icono || 'ti-folder'}" aria-hidden="true"></i></span><span class="opcion-nombre"></span>
        <i class="ti ti-circle-check palomita" aria-hidden="true"></i>
      </button>
      <button type="button" class="opcion-editar"><i class="ti ti-pencil" aria-hidden="true"></i></button>`;
    fila.querySelector('.opcion-nombre').textContent = s.nombre;
    fila.querySelector('.opcion-editar').setAttribute('aria-label', `Editar ${s.nombre}`);
    fila.querySelector('.opcion-elegir').addEventListener('click', () => {
      cerrarHoja($('#hoja-cambiar'));
      if (s.id !== seccionActual) cambiarSeccion(s.id);
    });
    fila.querySelector('.opcion-editar').addEventListener('click', () => {
      cerrarHoja($('#hoja-cambiar'));
      abrirSeccion(s);
    });
    lista.append(fila);
  }
  const nueva = document.createElement('button');
  nueva.type = 'button';
  nueva.className = 'opcion-nueva';
  nueva.innerHTML = '<span class="opcion-icono"><i class="ti ti-plus" aria-hidden="true"></i></span>Nueva sección';
  nueva.addEventListener('click', () => {
    cerrarHoja($('#hoja-cambiar'));
    abrirSeccion(null);
  });
  lista.append(nueva);
}

$('#cambiar-seccion').addEventListener('click', () => {
  dibujarSecciones();
  abrirHoja($('#hoja-cambiar'));
});

function cambiarSeccion(id) {
  seccionActual = id;
  escribir(CLAVE_SECCION, id);
  vibrar();
  $('#saldo').dataset.valor = 0; // que el saldo cuente desde cero, como al abrir la app
  dibujar();
  dibujarGrafica(true);
}

function abrirSeccion(seccion) {
  seccionEditando = seccion;
  const form = $('#form-seccion');
  form.reset();
  form.nombre.value = seccion?.nombre || '';
  $('#seccion-titulo').textContent = seccion ? 'Editar sección' : 'Nueva sección';
  $('#seccion-guardar').textContent = seccion ? 'Guardar' : 'Crear sección';
  $('#seccion-borrar').hidden = !seccion || seccion.id === 'personal';
  pintarIconosSeccion(seccion?.icono || 'ti-building-store');
  abrirHoja($('#hoja-seccion'));
}

function pintarIconosSeccion(elegido) {
  const contenedor = $('#seccion-iconos');
  contenedor.replaceChildren();
  for (const icono of ICONOS_SECCION) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'chip icono-chip' + (icono === elegido ? ' activo' : '');
    boton.dataset.icono = icono;
    boton.setAttribute('aria-checked', icono === elegido);
    boton.setAttribute('role', 'radio');
    boton.innerHTML = `<i class="ti ${icono}" aria-hidden="true"></i>`;
    boton.addEventListener('click', () => pintarIconosSeccion(icono));
    contenedor.append(boton);
  }
}

$('#form-seccion').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const nombre = evento.target.nombre.value.trim();
  if (!nombre) return;
  const icono = $('#seccion-iconos .activo')?.dataset.icono || 'ti-folder';
  if (seccionEditando) {
    const seccion = secciones.find((s) => s.id === seccionEditando.id);
    if (!seccion) return cerrarHoja($('#hoja-seccion'));
    Object.assign(seccion, { nombre, icono, cambio: Date.now() });
    delete seccion.relleno; // al ponerle nombre, ya es una sección de verdad
    guardarSecciones();
    dibujar();
    avisar('Sección actualizada');
  } else {
    const nueva = { id: 's' + Date.now().toString(36), nombre, icono, cambio: Date.now() };
    secciones.push(nueva);
    guardarSecciones();
    cambiarSeccion(nueva.id);
    avisar(`Ahora estás en ${nombre}. Lo que registres aquí queda separado.`);
  }
  cerrarHoja($('#hoja-seccion'));
});

// Solo se puede borrar una sección vacía, para no perder dinero registrado por accidente.
$('#seccion-borrar').addEventListener('click', () => {
  const id = seccionEditando?.id;
  if (!id || id === 'personal') return;
  const usados = ['movimientos', 'metas', 'pendientes', 'fijos'].reduce((t, n) => t + datos[n].filter((x) => x.seccion === id).length, 0);
  if (usados > 0) {
    avisar(`No se puede borrar: tiene ${usados} ${usados === 1 ? 'registro' : 'registros'}. Bórralos primero.`);
    return;
  }
  secciones = secciones.filter((s) => s.id !== id);
  seccionesBorradas[id] = Date.now();
  guardarSecciones();
  cerrarHoja($('#hoja-seccion'));
  cambiarSeccion('personal');
  avisar('Sección borrada');
});

// ---------- Secciones ----------

function mostrarVista(nombre) {
  if (!$(`#vista-${nombre}`)) nombre = 'dinero';
  // Si sales del detalle o de buscar con la barra de secciones, se quita su paso del historial;
  // si no, el botón "atrás" del teléfono parecía no hacer nada.
  if (nombre !== 'detalle' && nombre !== 'buscar' && (history.state?.detalle || history.state?.buscar)) history.back();
  for (const vista of document.querySelectorAll('.vista')) {
    vista.hidden = vista.id !== `vista-${nombre}`;
  }
  // El detalle es parte de la sección Dinero; al buscar se queda marcada la sección de donde vienes.
  const seccion = nombre === 'detalle' ? 'dinero' : nombre === 'buscar' ? vistaAntesDeBuscar : nombre;
  for (const boton of document.querySelectorAll('.barra-secciones [data-vista]')) {
    if (boton.dataset.vista === seccion) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');
  }
  $('#boton-agregar').hidden = nombre === 'buscar'; // el + está en todas las secciones, junto a la barra
  window.scrollTo(0, 0);
  // Al entrar a una sección se repiten sus animaciones.
  if (nombre === 'detalle') {
    dibujarDetalle();
    return; // no se guarda: al volver a abrir la app empieza en la pantalla principal
  }
  if (nombre === 'buscar') {
    dibujarBusqueda();
    return;
  }
  if (nombre === 'dinero') {
    $('#saldo').dataset.valor = 0;
    dibujarSaldo();
    dibujarGrafica(true);
    dibujarMes();
  } else if (nombre === 'metas') {
    dibujarMetas();
  } else if (nombre === 'pagos') {
    dibujarPagos();
  }
  escribir('mi-dinero:vista', nombre);
}

for (const boton of document.querySelectorAll('.barra-secciones [data-vista]')) {
  boton.addEventListener('click', () => mostrarVista(boton.dataset.vista));
}
$('#pastilla-racha').addEventListener('click', () => mostrarVista('racha'));

const abridores = {
  movimiento: () => abrirFormulario(),
  login: () => abrirLogin(),
  meta: () => {
    $('#form-meta').reset();
    abrirHoja($('#hoja-meta'));
  },
  pago: () => {
    const form = $('#form-pago');
    form.reset();
    form.fecha.value = sumarDias(hoy(), 7);
    ajustarFormularioPago();
    abrirHoja($('#hoja-pago'));
  },
  fijo: () => {
    const form = $('#form-fijo');
    form.reset();
    form.proximo.value = hoy();
    abrirHoja($('#hoja-fijo'));
  },
};
for (const boton of document.querySelectorAll('[data-abre]')) {
  boton.addEventListener('click', abridores[boton.dataset.abre]);
}

// Controles de la gráfica
for (const boton of document.querySelectorAll('[data-modo]')) {
  boton.addEventListener('click', () => {
    grafica.modo = boton.dataset.modo;
    document.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('activo', b === boton));
    dibujarGrafica(true);
  });
}
for (const boton of document.querySelectorAll('[data-que]')) {
  boton.addEventListener('click', () => {
    grafica.que = boton.dataset.que;
    document.querySelectorAll('[data-que]').forEach((b) => b.classList.toggle('activo', b === boton));
    dibujarGrafica(true);
  });
}
for (const boton of document.querySelectorAll('[data-rango]')) {
  boton.addEventListener('click', () => {
    grafica.rango = Number(boton.dataset.rango);
    document.querySelectorAll('[data-rango]').forEach((b) => b.classList.toggle('activo', b === boton));
    dibujarGrafica(true);
  });
}
const lienzo = $('#grafica');
lienzo.addEventListener('pointerdown', (e) => {
  lienzo.setPointerCapture(e.pointerId);
  recorrerGrafica(e);
});
lienzo.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' || grafica.tocando) recorrerGrafica(e);
});
lienzo.addEventListener('pointerleave', soltarGrafica);
lienzo.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'mouse') soltarGrafica();
});
lienzo.addEventListener('pointercancel', soltarGrafica);

$('#mes').addEventListener('change', () => {
  // Si se borra el mes (en algunos navegadores se puede), regresa al mes actual en vez de fallar.
  if (!/^\d{4}-\d{2}$/.test($('#mes').value)) $('#mes').value = hoy().slice(0, 7);
  dibujarMes();
});

// ---------- Anotar escribiendo: "gasté 80 en tacos ayer" ----------
// Sin IA ni internet: con reglas (listas de palabras) se saca el monto, el tipo, la categoría,
// la fecha y la nota. Después se abre el formulario YA LLENO para que lo revises antes de guardar.

function mostrarIA() {
  $('#form-ia').hidden = false;
}

// Palabras que dicen qué tipo de movimiento es (se buscan sin acentos). Si no hay ninguna, es gasto.
const PALABRAS_TIPO = {
  ingreso: [
    'me pagaron', 'me pago', 'me depositaron', 'me deposito', 'me dieron', 'me dio', 'me regalaron', 'me regalo',
    'me transfirieron', 'me transfirio', 'me mandaron', 'me mando', 'me prestaron', 'me presto', 'me devolvieron',
    'me devolvio', 'me cayo', 'me cayeron', 'me llego', 'me llegaron', 'me encontre', 'me gane', 'cobre', 'cobramos',
    'gane', 'ganamos', 'vendi', 'vendimos', 'recibi', 'recibimos', 'ingreso', 'ingresaron', 'entraron', 'entro',
    'sueldo', 'quincena', 'nomina', 'salario', 'aguinaldo', 'bono', 'propina', 'propinas', 'domingo de', 'mesada',
    'venta de', 'ventas', 'utilidad', 'ganancia', 'reembolso', 'cashback', 'beca',
  ],
  ahorro: ['ahorre', 'ahorrar', 'ahorramos', 'aparte', 'apartar', 'apartamos', 'guarde', 'guardar', 'ahorro', 'meti a', 'meti en', 'para la meta', 'para mi meta', 'al cochinito', 'alcancia', 'cochinito'],
};

// Palabras que dicen la categoría (en singular; los plurales se reconocen solos).
// Las categorías que tú creaste también se reconocen por su nombre.
const PALABRAS_CATEGORIA = {
  Comida: [
    'comida', 'comer', 'comi', 'comimos', 'taco', 'taquito', 'torta', 'tortilla', 'pizza', 'hamburguesa', 'hot dog', 'hotdog', 'burrito',
    'quesadilla', 'gordita', 'tamal', 'tamale', 'pozole', 'menudo', 'birria', 'pastor', 'carnitas', 'barbacoa', 'elote', 'esquite',
    'sushi', 'ramen', 'pollo', 'alitas', 'boneless', 'carne', 'asada', 'mariscos', 'coctel', 'ceviche', 'sopa', 'ensalada',
    'pan', 'concha', 'dona', 'galleta', 'pastel', 'helado', 'nieve', 'paleta', 'dulce', 'chocolate', 'chicle', 'papas', 'sabritas',
    'botana', 'snack', 'antojo', 'antojito', 'fruta', 'licuado', 'jugo', 'smoothie', 'cafe', 'starbucks', 'frappe', 'malteada',
    'refresco', 'coca', 'pepsi', 'agua', 'cerveza', 'chela', 'bebida', 'almuerzo', 'desayuno', 'comida corrida', 'cena', 'lonche',
    'restaurante', 'fonda', 'cocina', 'cafeteria', 'oxxo', 'seven', '7 eleven', 'mcdonalds', 'burger king', 'kfc', 'dominos',
    'little caesars', 'subway', 'vips', 'sanborns', 'rappi', 'didi food', 'uber eats', 'mandado', 'tianguis', 'mercado', 'leche', 'huevo',
  ],
  Transporte: [
    'uber', 'didi', 'indriver', 'cabify', 'taxi', 'camion', 'camioncito', 'micro', 'pesero', 'combi', 'metro', 'metrobus', 'tren', 'tren ligero',
    'pasaje', 'transporte', 'gasolina', 'gas del carro', 'diesel', 'magna', 'premium', 'estacionamiento', 'parking', 'caseta', 'peaje',
    'autobus', 'ado', 'boleto de autobus', 'avion', 'vuelo', 'bici', 'scooter', 'moto', 'llanta', 'mecanico', 'taller', 'servicio del carro',
    'verificacion', 'tenencia', 'refrendo', 'lavado de carro', 'autolavado', 'tarjeta del metro', 'recarga del metro', 'mi movilidad',
  ],
  Casa: [
    'renta', 'hipoteca', 'super', 'supermercado', 'despensa', 'casa', 'hogar', 'limpieza', 'detergente', 'jabon', 'cloro', 'papel', 'escoba',
    'mueble', 'cama', 'colchon', 'silla', 'mesa', 'decoracion', 'foco', 'herramienta', 'ferreteria', 'plomero', 'electricista', 'reparacion',
    'walmart', 'soriana', 'costco', 'sams', 'chedraui', 'heb', 'bodega aurrera', 'aurrera', 'la comer', 'home depot', 'liverpool', 'coppel',
    'mascota', 'perro', 'gato', 'croquetas', 'veterinario', 'vecino',
  ],
  Servicios: [
    'luz', 'cfe', 'agua potable', 'recibo', 'internet', 'telmex', 'totalplay', 'izzi', 'megacable', 'telefono', 'celular', 'recarga', 'saldo',
    'plan', 'telcel', 'att', 'movistar', 'bait', 'netflix', 'spotify', 'disney', 'hbo', 'max', 'prime', 'amazon prime', 'apple music',
    'youtube', 'youtube premium', 'icloud', 'google one', 'chatgpt', 'xbox game pass', 'playstation plus', 'crunchyroll', 'vix', 'star',
    'gas', 'tanque de gas', 'pipa', 'servicio', 'suscripcion', 'mensualidad', 'predial', 'banco', 'comision', 'seguro',
  ],
  Salud: [
    'farmacia', 'similares', 'del ahorro', 'benavides', 'guadalajara', 'doctor', 'doctora', 'medico', 'medicina', 'medicamento', 'pastilla',
    'jarabe', 'vitamina', 'dentista', 'ortodoncia', 'brackets', 'consulta', 'hospital', 'clinica', 'laboratorio', 'analisis', 'estudio',
    'lentes', 'optica', 'psicologo', 'terapia', 'gym', 'gimnasio', 'smart fit', 'proteina', 'suplemento', 'curita', 'vacuna',
  ],
  'Diversión': [
    'cine', 'cinepolis', 'cinemex', 'palomitas', 'fiesta', 'peda', 'juego', 'videojuego', 'salida', 'concierto', 'boleto', 'ticketmaster',
    'bar', 'antro', 'boliche', 'billar', 'parque', 'museo', 'peli', 'pelicula', 'serie', 'fortnite', 'robux', 'roblox', 'steam',
    'playstation', 'xbox', 'nintendo', 'switch', 'skin', 'pase de batalla', 'gemas', 'paseo', 'viaje', 'hotel', 'airbnb', 'playa',
    'karaoke', 'futbol', 'partido', 'estadio', 'lucha libre', 'apuesta', 'cumple', 'cumpleanos', 'regalo para', 'novia', 'novio',
  ],
  Ropa: [
    'ropa', 'tenis', 'zapato', 'zapatilla', 'bota', 'sandalia', 'chancla', 'playera', 'camiseta', 'pantalon', 'jeans', 'sudadera', 'gorra',
    'camisa', 'chamarra', 'chaqueta', 'calcetin', 'calzon', 'boxer', 'shorts', 'short', 'vestido', 'falda', 'uniforme', 'cinturon',
    'mochila', 'bolsa', 'cartera', 'reloj', 'lentes de sol', 'accesorio', 'arete', 'collar', 'perfume', 'loción', 'locion', 'corte de pelo',
    'peluqueria', 'barberia', 'barbero', 'shein', 'zara', 'pull and bear', 'bershka', 'nike', 'adidas', 'puma', 'vans', 'converse', 'h&m',
  ],
  Ventas: ['vendi', 'vendimos', 'venta', 'cliente', 'chile', 'pedido', 'encargo', 'cobre a', 'me compro', 'me compraron', 'mercancia vendida'],
  Sueldo: ['sueldo', 'quincena', 'nomina', 'me pagaron', 'trabajo', 'chamba', 'salario', 'propina', 'aguinaldo', 'bono', 'pago semanal', 'semana', 'turno', 'horas extra'],
  Regalo: ['regalaron', 'regalo', 'me dieron', 'domingo de', 'mesada', 'mi abuela', 'mi abuelo', 'mi mama', 'mi papa', 'mis papas', 'mi tia', 'mi tio', 'padrino', 'madrina'],
  Negocio: ['negocio', 'abasto', 'central de abasto', 'mercancia', 'proveedor', 'flete', 'costal', 'bulto', 'inventario', 'local', 'puesto', 'utilidad', 'ganancia'],
};

// Palabras que se quitan para que la nota quede limpia ("gasté 80 en tacos ayer" → "tacos").
const PALABRAS_SOBRAN = new Set('fui fuimos fue nos le les se lo la los las gastamos pagamos compramos gaste gasto gastaron pague pago pagaron compre compro compraron me pagaron depositaron deposito dieron dio regalaron regalo transfirieron transfirio mandaron mando prestaron presto devolvieron devolvio cayo cayeron llego llegaron cobre gane vendi vendimos recibi ahorre ahorrar aparte apartar guarde meti en de del el un una uno unos unas para por con a al y o mi mis tu su que hoy ayer antier anteayer pesos peso mxn varo varos lana baro baros feria mil lunes martes miercoles jueves viernes sabado domingo pasado este esta ese esa como mas menos casi aprox aproximadamente unos ya'.split(' '));

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

// Números escritos con letra (así los manda a veces el dictado): "doscientos cincuenta", "mil quinientos".
const NUMEROS = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
  ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, cuatrocientos: 400,
  quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};

function numeroEnLetra(palabras) {
  let total = 0;
  let parte = 0;
  let enNumero = false;
  let soloArticulo = true; // "un taco" no es un monto; "un mil" o "dos" sí
  for (const p of palabras) {
    if (p in NUMEROS || p === 'mil' || (enNumero && p === 'y')) {
      enNumero = true;
      if (p === 'mil') {
        total += (parte || 1) * 1000;
        parte = 0;
        soloArticulo = false;
      } else if (p !== 'y') {
        parte += NUMEROS[p];
        if (!['un', 'uno', 'una'].includes(p)) soloArticulo = false;
      }
    } else if (enNumero) {
      break;
    }
  }
  return soloArticulo ? 0 : total + parte;
}

// Lo que Kashiki aprendió de ti: qué palabra de tus notas fue a qué categoría ("chiles" → Ventas).
function categoriaAprendida(palabras, tipo, validas) {
  const votos = {};
  for (const m of deSeccion('movimientos')) {
    if (m.tipo !== tipo || m.categoria === 'Otros' || !validas.includes(m.categoria) || !m.nota) continue;
    const enNota = new Set(sinAcentos(m.nota).split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 3 && !PALABRAS_SOBRAN.has(p)));
    for (const p of palabras) {
      const singular = p.replace(/(es|s)$/, '');
      if (enNota.has(p) || enNota.has(singular) || enNota.has(singular + 's')) votos[m.categoria] = (votos[m.categoria] || 0) + 1;
    }
  }
  return Object.entries(votos).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function interpretarTexto(original) {
  const base = sinAcentos(original);
  // Para buscar palabras se quitan los signos (pero el monto se busca en "base", con sus comas y puntos).
  const texto = ' ' + base.replace(/[¿?¡!,;]|\.(?!\d)/g, ' ').replace(/\s+/g, ' ') + ' ';
  const palabras = texto.trim().split(' ');
  // Palabra completa (o su plural): "taco" encuentra "tacos", pero "pan" no encuentra "pantalón".
  const tiene = (palabra, en = texto) => new RegExp(`\\s${palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?\\s`).test(en);

  // 1. El monto: el primer número ("80", "$1,250.50", "2 mil", "2k", "mil") o con letra ("doscientos").
  let monto = 0;
  const conK = base.match(/(\d+(?:[.,]\d+)?)\s?k\b/);
  // "1,500" y "1.500" son mil quinientos; "1.50" y "1,50" son un peso con cincuenta.
  const numero = base.match(/\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,3}(?:\.\d{3})+(?!\d)|\d+(?:[.,]\d{1,2})?)(\s*mil\b)?/);
  if (conK) {
    monto = Number(conK[1].replace(',', '.')) * 1000;
  } else if (numero) {
    const cifra = numero[1];
    monto = /^\d{1,3}(?:\.\d{3})+$/.test(cifra)
      ? Number(cifra.replace(/\./g, ''))
      : Number(cifra.replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
    if (numero[2]) monto *= 1000;
  } else {
    monto = numeroEnLetra(palabras);
  }
  monto = Math.round(monto * 100) / 100;

  // 2. El tipo: ingreso o ahorro si aparece alguna de sus palabras; si no, gasto.
  //    "Farmacias del Ahorro" es una tienda: ahí "ahorro" no quiere decir que ahorraste.
  const textoTipo = texto.replace(/ farmacias? del ahorro /g, ' farmacia ');
  const tieneTipo = (palabra) => tiene(palabra, textoTipo);
  let tipo = 'gasto';
  if (PALABRAS_TIPO.ahorro.some(tieneTipo)) tipo = 'ahorro';
  else if (PALABRAS_TIPO.ingreso.some(tieneTipo)) tipo = 'ingreso';

  // 3. La categoría. En este orden: el nombre de una de tus categorías, lo que aprendió de ti,
  //    su lista de palabras y, si no conoce nada, te propone una categoría nueva.
  let categoria = null;
  let nuevaCategoria = '';
  if (tipo === 'ahorro') {
    const metas = deSeccion('metas');
    categoria = (metas.find((meta) => texto.includes(sinAcentos(meta.nombre))) || metas[0])?.id ?? null;
  } else {
    const validas = categoriasDe(tipo);
    categoria =
      validas.find((c) => c !== 'Otros' && tiene(sinAcentos(c))) ||
      categoriaAprendida(palabras, tipo, validas) ||
      Object.entries(PALABRAS_CATEGORIA).find(([c, lista]) => validas.includes(c) && lista.some((p) => tiene(p)))?.[0] ||
      null;
    if (!categoria) {
      // La primera palabra "de verdad" que no sea un nombre de persona (las que empiezan con mayúscula
      // a media frase, como "Don Pepe") ni un número.
      const candidata = original
        .split(/\s+/)
        .find((p, i) => {
          const limpia = sinAcentos(p).replace(/[^a-z0-9ñ]/g, '');
          const esNombre = i > 0 && /^[A-ZÁÉÍÓÚÑ]/.test(p);
          return limpia.length >= 3 && !/\d/.test(limpia) && !PALABRAS_SOBRAN.has(limpia) && !(limpia in NUMEROS) && !esNombre;
        });
      if (candidata) {
        categoria = NUEVA_CATEGORIA;
        nuevaCategoria = mayuscula(candidata.replace(/[^\p{L}\p{N} ]/gu, '').toLowerCase());
      } else {
        categoria = 'Otros';
      }
    }
  }

  // 4. La fecha: hoy, ayer, antier o un día de la semana ("el lunes" = el lunes pasado más cercano).
  let fecha = hoy();
  if (tiene('antier') || tiene('anteayer')) fecha = sumarDias(hoy(), -2);
  else if (tiene('ayer')) fecha = sumarDias(hoy(), -1);
  else {
    // "mi domingo" o "el domingo de mi abuela" es dinero que te dan, no un día.
    const esDomingoDeDinero = tiene('mi domingo') || tiene('domingo de');
    const dia = DIAS_SEMANA.findIndex((d) => tiene(d) && !(d === 'domingo' && esDomingoDeDinero));
    if (dia >= 0) {
      const atras = (new Date().getDay() - dia + 7) % 7;
      fecha = sumarDias(hoy(), -atras);
    }
  }

  // 5. La nota: lo que queda sin números ni palabras de relleno ("tacos con Fran").
  const palabrasOriginales = original.replace(/[¿?¡!,;]/g, ' ').split(/\s+/).filter(Boolean);
  const nota = palabrasOriginales
    .filter((p) => !/\d/.test(p) && !/^\$/.test(p) && !PALABRAS_SOBRAN.has(sinAcentos(p)) && !(sinAcentos(p) in NUMEROS))
    .join(' ')
    .trim();
  const nombreCategoria = nuevaCategoria || String(categoria);
  const notaFinal = sinAcentos(nota) === sinAcentos(nombreCategoria) ? '' : nota;

  return { tipo, monto, categoria, nuevaCategoria, fecha, nota: notaFinal.slice(0, 80) };
}

// ---------- Dictar con el micrófono ----------
// Usa el reconocimiento de voz que ya trae el teléfono (gratis). Mientras escucha, el texto va
// apareciendo en la cajita; al terminar de hablar se abre el formulario ya lleno.
const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
const TEXTO_CAJITA = 'Escribe: gasté 80 en tacos ayer';
const MAXIMO_DICTADO = 15000; // si sigue escuchando después de 15 s, se detiene solo
let dictado = null;
let limiteDictado;

// Termina el dictado AL MOMENTO, sin esperar a que el teléfono conteste (la primera vez, mientras
// pide el permiso, el teléfono puede tardar o no avisar nunca: así ya no se queda trabado).
// "usarTexto" = si se escuchó algo, se abre el formulario con eso.
function terminarDictado(usarTexto) {
  if (!dictado) return;
  const reconocedor = dictado;
  dictado = null;
  clearTimeout(limiteDictado);
  reconocedor.onresult = reconocedor.onerror = reconocedor.onend = null;
  try {
    reconocedor.abort();
  } catch {
    // ya estaba detenido
  }
  const cajita = $('#form-ia');
  cajita.classList.remove('escuchando');
  cajita.texto.placeholder = TEXTO_CAJITA;
  if (usarTexto && cajita.texto.value.trim()) cajita.requestSubmit();
}

$('#dictar').addEventListener('click', () => {
  const cajita = $('#form-ia');
  const campo = cajita.texto;
  if (dictado) {
    terminarDictado(true); // volver a picarle = ya terminé de hablar
    return;
  }
  if (!Reconocedor) {
    // Sin reconocimiento de voz: el teclado del teléfono también tiene su micrófono.
    campo.focus();
    avisar('Para dictar, toca el micrófono del teclado.');
    return;
  }
  const reconocedor = new Reconocedor();
  dictado = reconocedor;
  reconocedor.lang = 'es-MX';
  reconocedor.interimResults = true;
  reconocedor.continuous = false;
  reconocedor.onresult = (e) => {
    campo.value = [...e.results].map((r) => r[0].transcript).join(' ').trim();
  };
  reconocedor.onerror = (e) => {
    if (e.error === 'service-not-allowed') {
      // iPhone sin dictado de Siri (o en la app instalada): el micrófono del teclado sí funciona.
      avisar('Este teléfono no permite dictar aquí. Usa el micrófono de tu teclado para escribirlo.');
      setTimeout(() => campo.focus(), 50);
    } else if (e.error === 'not-allowed') {
      avisar('Kashiki necesita permiso para usar el micrófono. Actívalo en los ajustes del teléfono.');
    } else if (e.error === 'no-speech') {
      avisar('No se escuchó nada. Intenta de nuevo.');
    } else if (e.error !== 'aborted') {
      avisar('No se pudo usar el micrófono. Puedes escribirlo en la cajita.');
    }
    terminarDictado(false);
  };
  reconocedor.onend = () => terminarDictado(true);
  campo.value = '';
  campo.placeholder = 'Escuchando… di: gasté 80 en tacos';
  cajita.classList.add('escuchando');
  limiteDictado = setTimeout(() => terminarDictado(true), MAXIMO_DICTADO);
  try {
    reconocedor.start();
  } catch {
    terminarDictado(false);
    avisar('No se pudo usar el micrófono. Puedes escribirlo en la cajita.');
  }
});

// Si sales de la app mientras escucha, se detiene (para que al volver no siga abierto).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') terminarDictado(false);
});

$('#form-ia').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const campo = evento.target.texto;
  const texto = campo.value.trim();
  if (!texto) return;
  const entendido = interpretarTexto(texto);
  campo.value = '';
  campo.blur();
  // Para ahorros, la "categoría" es la meta.
  abrirFormulario(entendido.tipo === 'ahorro' ? { ...entendido, meta: entendido.categoria, categoria: null } : entendido);
  if (!entendido.monto) avisar('No se encontró el monto. Escríbelo con el teclado numérico.');
  else if (entendido.nuevaCategoria) avisar(`Categoría nueva sugerida: "${entendido.nuevaCategoria}". Puedes cambiarla antes de guardar.`);
});

// ---------- Cuenta: iniciar sesión, crear cuenta, cerrar sesión ----------

let modoLogin = 'entrar'; // entrar | crear | nueva (poner contraseña nueva después de recuperarla)
const TEXTOS_LOGIN = {
  entrar: { titulo: 'Entra a tu cuenta', boton: 'Entrar' },
  crear: { titulo: 'Crea tu cuenta', boton: 'Crear cuenta' },
  nueva: { titulo: 'Pon tu contraseña nueva', boton: 'Guardar contraseña' },
};

function abrirLogin(modo = 'entrar') {
  if (!db) {
    avisar('Necesitas internet para entrar a tu cuenta');
    return;
  }
  modoLogin = modo;
  $('#form-login').reset();
  pintarLogin();
  abrirHoja($('#hoja-login'));
}

function pintarLogin() {
  const form = $('#form-login');
  $('#login-titulo').textContent = TEXTOS_LOGIN[modoLogin].titulo;
  $('#login-enviar').textContent = TEXTOS_LOGIN[modoLogin].boton;
  $('#login-pestanas').hidden = modoLogin === 'nueva';
  $('#campo-correo').hidden = modoLogin === 'nueva';
  $('#olvide').hidden = modoLogin !== 'entrar';
  form.contrasena.autocomplete = modoLogin === 'entrar' ? 'current-password' : 'new-password';
  document.querySelectorAll('[data-modo-login]').forEach((b) => b.classList.toggle('activo', b.dataset.modoLogin === modoLogin));
  mostrarErrorLogin('');
}

function mostrarErrorLogin(texto, esBueno = false) {
  const p = $('#login-error');
  p.textContent = texto;
  p.hidden = !texto;
  p.style.color = esBueno ? 'var(--positivo)' : '';
}

// Los errores de Supabase vienen en inglés; aquí se traducen a algo entendible.
function traducirError(error) {
  const mensaje = String(error?.message || error);
  if (/Invalid login credentials/i.test(mensaje)) return 'Correo o contraseña incorrectos.';
  if (/already registered|already been registered/i.test(mensaje)) return 'Ya existe una cuenta con ese correo. Inicia sesión.';
  if (/Email not confirmed/i.test(mensaje)) return 'Primero confirma tu correo: revisa tu bandeja de entrada.';
  if (/at least 6|Password should/i.test(mensaje)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/rate limit|too many/i.test(mensaje)) return 'Demasiados intentos. Espera unos minutos.';
  if (/invalid.*email|email.*invalid/i.test(mensaje)) return 'Ese correo no parece válido.';
  if (/fetch|network/i.test(mensaje)) return 'Sin conexión. Revisa tu internet.';
  return mensaje;
}

for (const boton of document.querySelectorAll('[data-modo-login]')) {
  boton.addEventListener('click', () => {
    modoLogin = boton.dataset.modoLogin;
    pintarLogin();
  });
}

$('#form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const form = evento.target;
  const correo = form.correo.value.trim();
  const contrasena = form.contrasena.value;
  if (modoLogin !== 'nueva' && !/^\S+@\S+\.\S+$/.test(correo)) return mostrarErrorLogin('Escribe tu correo.');
  if (contrasena.length < 6) return mostrarErrorLogin('La contraseña debe tener al menos 6 caracteres.');

  const boton = $('#login-enviar');
  boton.disabled = true;
  boton.textContent = 'Un momento…';
  try {
    if (modoLogin === 'entrar') {
      const { error } = await db.auth.signInWithPassword({ email: correo, password: contrasena });
      if (error) throw error;
    } else if (modoLogin === 'crear') {
      const { data, error } = await db.auth.signUp({ email: correo, password: contrasena });
      if (error) throw error;
      // Si Supabase pide confirmar el correo, todavía no hay sesión.
      if (!data.session) {
        mostrarErrorLogin('Te mandamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión.', true);
        return;
      }
    } else {
      const { error } = await db.auth.updateUser({ password: contrasena });
      if (error) throw error;
      avisar('Contraseña actualizada');
    }
    cerrarHoja($('#hoja-login'));
    vibrar();
  } catch (error) {
    mostrarErrorLogin(traducirError(error));
  } finally {
    boton.disabled = false;
    boton.textContent = TEXTOS_LOGIN[modoLogin].boton;
  }
});

$('#olvide').addEventListener('click', async () => {
  const correo = $('#form-login').correo.value.trim();
  if (!/^\S+@\S+\.\S+$/.test(correo)) return mostrarErrorLogin('Escribe tu correo y vuelve a tocar "¿Olvidaste tu contraseña?".');
  const { error } = await db.auth.resetPasswordForEmail(correo, { redirectTo: location.origin + location.pathname });
  if (error) mostrarErrorLogin(traducirError(error));
  else mostrarErrorLogin('Te mandamos un correo con un enlace para poner una contraseña nueva.', true);
});

$('#boton-entrar').addEventListener('click', () => abrirLogin());

// Cambia la pantalla según haya o no sesión, y prepara los datos de esa cuenta.
function ponerCuenta(usuario) {
  const anterior = cuenta?.id;
  cuenta = usuario;
  $('#boton-entrar').hidden = Boolean(cuenta);
  $('#abrir-ajustes').hidden = !cuenta;
  $('#cuenta-con-sesion').hidden = !cuenta;
  $('#cuenta-sin-sesion').hidden = Boolean(cuenta);
  $('#cuenta-correo').textContent = cuenta?.email || '';
  // En Configuración: los avisos y "Cerrar sesión" solo tienen sentido con cuenta.
  $('#grupo-avisos').hidden = !cuenta;
  $('#grupo-sesion').hidden = !cuenta;
  $('#resumen-cuenta').textContent = cuenta ? 'Conectada' : 'Entrar';
  $('#traer-sheets').hidden = !(cuenta && leer(CLAVE_SHEETS, null) && !leer(CLAVE_SHEETS_PASADO, false));
  if (!cuenta) {
    mostrarEstado('ti-device-mobile', 'Sin cuenta: tus datos solo están en este teléfono');
    return;
  }
  nombreDeLaCuenta();
  if (anterior === cuenta.id) return;
  seccionesDeLaCuenta();
  // Se prepara Telegram por detrás (despierta al servidor y deja el link listo), para que el botón no tarde.
  setTimeout(() => revisarTelegram().catch(() => {}), 2500);
  return alEntrar();
}

const hayDatosLocales = () => Object.keys(CLAVES).reduce((t, nombre) => t + datos[nombre].length, 0);

function borrarDatosLocales() {
  for (const nombre of Object.keys(CLAVES)) {
    datos[nombre] = [];
    guardarColeccion(nombre);
  }
  pendientes = [];
  escribir(CLAVE_PENDIENTES, pendientes);
}

// Al entrar: si los datos del teléfono no son de nadie, se pregunta si se suben a la cuenta;
// si son de otra cuenta, se quitan para no mezclar el dinero de dos personas.
function alEntrar() {
  const dueno = leer(CLAVE_DUENO, null);
  if (dueno === cuenta.id) return sincronizar();
  if (dueno) borrarDatosLocales();
  const total = hayDatosLocales();
  if (!dueno && total > 0) {
    $('#subir-texto').textContent = `En este teléfono hay ${total} ${total === 1 ? 'registro' : 'registros'} (movimientos, metas, racha y pagos). ¿Los guardamos en tu cuenta para no perderlos?`;
    esperandoDecision = true; // si cierras la hoja sin contestar, vuelve a preguntar después
    abrirHoja($('#hoja-subir'));
    return;
  }
  escribir(CLAVE_DUENO, cuenta.id);
  return sincronizar();
}

$('#form-subir').addEventListener('submit', (evento) => {
  evento.preventDefault();
  for (const nombre of Object.keys(CLAVES)) {
    for (const objeto of datos[nombre]) encolar({ accion: 'agregar', coleccion: nombre, objeto });
  }
  esperandoDecision = false;
  escribir(CLAVE_DUENO, cuenta.id);
  cerrarHoja($('#hoja-subir'));
  sincronizar();
  avisar('Subiendo tus datos a tu cuenta…');
});

$('#subir-no').addEventListener('click', () => {
  esperandoDecision = false;
  borrarDatosLocales();
  escribir(CLAVE_DUENO, cuenta.id);
  cerrarHoja($('#hoja-subir'));
  dibujar();
  sincronizar();
});

$('#cerrar-sesion').addEventListener('click', async () => {
  // Si hay cambios que aún no llegan a la nube, primero se intentan subir; si no se puede, no se cierra.
  if (pendientes.length > 0) {
    await sincronizar();
    if (pendientes.length > 0) {
      avisar(`Tienes ${pendientes.length} ${pendientes.length === 1 ? 'cambio' : 'cambios'} sin subir. Conéctate a internet antes de cerrar sesión para no perderlos.`);
      return;
    }
  }
  const boton = $('#cerrar-sesion');
  boton.disabled = true;
  // Este teléfono deja de recibir los avisos de esa cuenta (con límite, para no quedarse esperando).
  await conLimite(quitarNotificaciones(), 5000, 'tardó').catch(() => {});
  await db.auth.signOut().catch(() => db.auth.signOut({ scope: 'local' }).catch(() => {}));
  boton.disabled = false;
  salirDeLaCuenta('Cerraste sesión. Tus datos siguen guardados en tu cuenta.');
});

// Borra la dirección de notificaciones de este teléfono en la cuenta y en el propio teléfono.
async function quitarNotificaciones() {
  if (!('serviceWorker' in navigator)) return;
  const registro = await navigator.serviceWorker.getRegistration();
  const suscripcion = await registro?.pushManager?.getSubscription();
  if (!suscripcion) return;
  await pedirAlBot('push-quitar', { endpoint: suscripcion.endpoint }).catch(() => {});
  await suscripcion.unsubscribe().catch(() => {});
}

// Quita del teléfono todo lo de la cuenta (al cerrar sesión o al borrarla).
function salirDeLaCuenta(mensaje) {
  esperandoDecision = false;
  borrarDatosLocales();
  escribir(CLAVE_DUENO, null);
  escribir(CLAVE_TELEGRAM, null);
  escribir(CLAVE_LINK_TELEGRAM, null);
  linkTelegram = { url: '', hecho: 0, cuenta: '' };
  // Las secciones también eran de esa cuenta.
  reiniciarSecciones();
  ponerCuenta(null);
  dibujar();
  cerrarHoja($('#hoja-ajustes'));
  avisar(mensaje);
}

// Borrar la cuenta: primero se escribe BORRAR (para que no pase por accidente).
$('#borrar-cuenta').addEventListener('click', () => {
  $('#confirmar-borrado').hidden = !$('#confirmar-borrado').hidden;
  $('#texto-borrar').value = '';
  $('#borrar-para-siempre').disabled = true;
});
$('#texto-borrar').addEventListener('input', (e) => {
  $('#borrar-para-siempre').disabled = e.target.value.trim().toUpperCase() !== 'BORRAR';
});
$('#borrar-para-siempre').addEventListener('click', async () => {
  const boton = $('#borrar-para-siempre');
  boton.disabled = true;
  try {
    // Si el teléfono tenía notificaciones, se apagan aquí también.
    await conLimite(quitarNotificaciones(), 5000, 'tardó').catch(() => {});
    await pedirAlBot('borrar-cuenta');
    await db.auth.signOut({ scope: 'local' }).catch(() => {});
    $('#confirmar-borrado').hidden = true;
    salirDeLaCuenta('Tu cuenta y todos tus datos se borraron.');
  } catch (error) {
    boton.disabled = false;
    avisar('No se pudo borrar la cuenta: ' + traducirError(error));
  }
});

// Pasa a la cuenta lo que había en la hoja de Google Sheets (de la versión anterior de la app).
$('#traer-sheets').addEventListener('click', async () => {
  const sheets = leer(CLAVE_SHEETS, null);
  const boton = $('#traer-sheets');
  boton.disabled = true;
  try {
    const respuesta = await fetch(sheets.url, { method: 'POST', body: JSON.stringify({ accion: 'listar', clave: sheets.clave }) });
    const deSheets = await respuesta.json();
    if (deSheets.error) throw new Error(deSheets.error);
    let traidos = 0;
    for (const nombre of Object.keys(CLAVES)) {
      const existentes = new Set(datos[nombre].map((x) => x.id));
      for (const objeto of limpiar(nombre, deSheets[nombre])) {
        if (existentes.has(objeto.id)) continue;
        datos[nombre].push(objeto);
        encolar({ accion: 'agregar', coleccion: nombre, objeto });
        traidos++;
      }
      guardarColeccion(nombre);
    }
    escribir(CLAVE_SHEETS_PASADO, true);
    boton.hidden = true;
    dibujar();
    sincronizar();
    avisar(`Se importaron ${traidos} ${traidos === 1 ? 'registro' : 'registros'} de Google Sheets a tu cuenta.`);
  } catch (error) {
    avisar('No se pudo leer Google Sheets: ' + traducirError(error));
  } finally {
    boton.disabled = false;
  }
});

// ---------- Avisos por Telegram ----------
// La Edge Function "kashiki-bot" (supabase/functions) guarda qué chat de Telegram es de cada cuenta.

const pedirAlBot = async (accion, extra = {}) => {
  const { data, error } = await db.functions.invoke('kashiki-bot-', { body: { accion, ...extra } });
  if (error) throw error;
  return data;
};

// Lo último que se supo (¿conectado o no?) se guarda en el teléfono, para pintar el botón
// correcto al instante en lugar de esperar a que conteste Supabase.
const CLAVE_TELEGRAM = 'mi-dinero:telegram';
const CLAVE_LINK_TELEGRAM = 'mi-dinero:telegram-link';
const MINUTOS_LINK = 25; // el código dura 30 en el servidor; se renueva un poco antes
// El link se guarda en el teléfono: al abrir Configuración ya está listo y el botón abre Telegram al instante.
let linkTelegram = leer(CLAVE_LINK_TELEGRAM, { url: '', hecho: 0, cuenta: '' });
let esperandoTelegram = false;

function pintarTelegram(conectado) {
  $('#telegram-estado').textContent = conectado
    ? 'Telegram conectado: recibirás avisos cada noche y los domingos'
    : 'Recibe recordatorios y tu resumen semanal en Telegram';
  $('#telegram-conectar').hidden = conectado;
  $('#telegram-desconectar').hidden = !conectado;
  $('#resumen-telegram').textContent = conectado ? 'Conectado' : 'No conectado';
}

function recordarTelegram(conectado) {
  escribir(CLAVE_TELEGRAM, { cuenta: cuenta.id, conectado });
  pintarTelegram(conectado);
}

// El link lleva un código de un solo uso; al picarle "Iniciar", el bot sabe que ese chat es de esta cuenta.
async function pedirLink() {
  const { codigo, bot } = await pedirAlBot('codigo');
  linkTelegram = { url: `https://t.me/${bot}?start=${codigo}`, hecho: Date.now(), cuenta: cuenta?.id };
  escribir(CLAVE_LINK_TELEGRAM, linkTelegram);
  $('#telegram-conectar').href = linkTelegram.url;
  return linkTelegram.url;
}

const linkVigente = () =>
  linkTelegram.url && linkTelegram.cuenta === cuenta?.id && Date.now() - linkTelegram.hecho < MINUTOS_LINK * 60000;

// Pinta al instante con lo recordado y luego confirma con Supabase. Si no estás conectado,
// deja el link listo de una vez, para que el botón abra Telegram con un solo toque.
async function revisarTelegram() {
  if (!cuenta) return;
  const recordado = leer(CLAVE_TELEGRAM, null);
  const pareciaConectado = recordado?.cuenta === cuenta.id && recordado.conectado;
  pintarTelegram(pareciaConectado);
  if (linkVigente()) $('#telegram-conectar').href = linkTelegram.url;
  try {
    // Las dos preguntas al servidor van al mismo tiempo (antes iban una tras otra).
    const necesitaLink = !pareciaConectado && !linkVigente();
    const [{ conectado }] = await Promise.all([pedirAlBot('estado'), necesitaLink ? pedirLink() : null]);
    if (!cuenta) return; // cerró sesión mientras tanto
    recordarTelegram(conectado);
    if (!conectado && !linkVigente()) await pedirLink();
  } catch {
    // sin internet: se queda lo recordado; si no hay link, se pide al tocar el botón
  }
}

$('#telegram-conectar').addEventListener('click', async (evento) => {
  esperandoTelegram = true;
  $('#telegram-estado').textContent = 'Pícale "Iniciar" en Telegram y regresa aquí';
  if (linkVigente()) return; // el link ya está listo: el navegador lo abre solo

  // Todavía no hay link: se abre la ventana ya (si se espera, el teléfono la bloquea) y se llena después.
  // Si el teléfono no deja abrirla, NO se cambia la página de Kashiki (en la app instalada no hay
  // botón de atrás y te quedarías atorado en Telegram): se deja el link listo para un segundo toque.
  evento.preventDefault();
  const ventana = window.open('', '_blank');
  try {
    const url = await pedirLink();
    if (ventana) ventana.location.href = url;
    else $('#telegram-estado').textContent = 'El enlace está listo. Toca de nuevo "Conectar Telegram".';
  } catch (error) {
    ventana?.close();
    esperandoTelegram = false;
    pintarTelegram(false);
    avisar('No se pudo conectar Telegram: ' + traducirError(error));
  }
});

$('#telegram-desconectar').addEventListener('click', async () => {
  try {
    await pedirAlBot('desconectar');
    recordarTelegram(false);
    avisar('Avisos de Telegram desactivados.');
    pedirLink().catch(() => {});
  } catch (error) {
    avisar('No se pudo: ' + traducirError(error));
  }
});

// Al regresar de Telegram, revisa si ya quedó conectado.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !esperandoTelegram) return;
  esperandoTelegram = false;
  revisarTelegram();
});

// ---------- Notificaciones en el teléfono ----------
// El teléfono le da a Kashiki una "dirección" para mandarle avisos; se guarda en tu cuenta
// y el bot (supabase/functions) manda ahí los mismos avisos que por Telegram.

// Llave pública de Kashiki para las notificaciones (la privada está guardada en Supabase).
const VAPID_PUBLICA = 'BE_Av1BLFGYly-sl7Btb33ny0jypW5kvPov_mCYtkkf1V3UoE7Iz6EzEfaXCr1KoiYZ7Ap55W_emhDXY1QQd0ZM';

const soportaNotificaciones = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// En iPhone solo funcionan con Kashiki instalada en la pantalla de inicio.
const iPhoneSinInstalar = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;

function bytesDeLlave(base64) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const texto = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(texto, (c) => c.charCodeAt(0));
}

function pintarNotificaciones(texto, activas, sePuede = true) {
  $('#notif-estado').textContent = texto;
  $('#notif-activar').hidden = activas || !sePuede;
  $('#notif-activas').hidden = !activas;
  $('#resumen-notif').textContent = activas ? 'Activadas' : 'Desactivadas';
}

async function revisarNotificaciones() {
  if (!cuenta) return;
  if (iPhoneSinInstalar()) {
    pintarNotificaciones('En iPhone primero agrega Kashiki a tu pantalla de inicio: Compartir → "Agregar a inicio".', false, false);
    return;
  }
  if (!soportaNotificaciones()) {
    pintarNotificaciones('Este navegador no puede recibir notificaciones.', false, false);
    return;
  }
  if (Notification.permission === 'denied') {
    pintarNotificaciones('Las notificaciones están bloqueadas. Actívalas en los ajustes del teléfono para Kashiki.', false, false);
    return;
  }
  const registro = await navigator.serviceWorker.ready;
  const suscripcion = await registro.pushManager.getSubscription();
  if (suscripcion && Notification.permission === 'granted') {
    pintarNotificaciones('Notificaciones activadas en este teléfono', true);
    // Por si cambió la dirección o no se alcanzó a guardar: se vuelve a guardar (por detrás, sin avisar).
    pedirAlBot('push-guardar', { suscripcion: suscripcion.toJSON() }).catch(() => {});
  } else {
    pintarNotificaciones('Recibe tus avisos como notificación en este teléfono', false);
  }
}

// Si algo tarda más de "ms", se deja de esperar (con mala señal o un iPhone lento podía tardar minutos).
const conLimite = (promesa, ms, mensaje) =>
  Promise.race([promesa, new Promise((_, rechazar) => setTimeout(() => rechazar(new Error(mensaje)), ms))]);

// Guarda la dirección del teléfono en tu cuenta. Corre por detrás: si falla, se reintenta
// la próxima vez que abras Ajustes (revisarNotificaciones la vuelve a guardar).
function guardarSuscripcion(suscripcion) {
  return pedirAlBot('push-guardar', { suscripcion: suscripcion.toJSON() }).catch(() => {
    avisar('Las notificaciones quedaron activadas, pero no se pudieron guardar en tu cuenta. Se reintentará solo.');
  });
}

$('#notif-activar').addEventListener('click', async () => {
  const boton = $('#notif-activar');
  boton.disabled = true;
  try {
    // El permiso se pide justo al tocar el botón (el iPhone solo lo permite así).
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') {
      await revisarNotificaciones();
      if (permiso === 'default') avisar('Las notificaciones no se activaron. Puedes intentarlo de nuevo cuando quieras.');
      return;
    }
    $('#notif-estado').textContent = 'Activando…';
    const registro = await conLimite(navigator.serviceWorker.ready, 8000, 'la app tardó en responder');
    const suscripcion =
      (await registro.pushManager.getSubscription()) ||
      (await conLimite(
        registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDeLlave(VAPID_PUBLICA) }),
        20000,
        'Apple tardó demasiado en contestar. Inténtalo otra vez'
      ));
    // Ya quedó activado en el teléfono: se avisa al instante y lo de la cuenta se guarda por detrás.
    pintarNotificaciones('Notificaciones activadas en este teléfono', true);
    avisar('Notificaciones activadas. Toca "Probar" para ver un ejemplo.');
    guardarSuscripcion(suscripcion);
  } catch (error) {
    await revisarNotificaciones().catch(() => {});
    avisar('No se pudieron activar: ' + traducirError(error));
  } finally {
    boton.disabled = false;
  }
});

$('#notif-probar').addEventListener('click', async () => {
  const boton = $('#notif-probar');
  boton.disabled = true;
  avisar('Enviando una notificación de prueba. Sal de la app para verla.');
  try {
    // Primero se asegura de que este teléfono esté guardado en tu cuenta.
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    if (suscripcion) await conLimite(pedirAlBot('push-guardar', { suscripcion: suscripcion.toJSON() }), 15000, 'la nube tardó demasiado');
    const { enviados } = await conLimite(pedirAlBot('push-probar'), 15000, 'la nube tardó demasiado');
    if (!enviados) avisar('No se pudo mandar la prueba. Desactiva y vuelve a activar las notificaciones.');
  } catch (error) {
    avisar('No se pudo: ' + traducirError(error));
  } finally {
    boton.disabled = false;
  }
});

$('#notif-quitar').addEventListener('click', async () => {
  try {
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    if (suscripcion) {
      await pedirAlBot('push-quitar', { endpoint: suscripcion.endpoint }).catch(() => {});
      await suscripcion.unsubscribe();
    }
    pintarNotificaciones('Recibe tus avisos como notificación en este teléfono', false);
    avisar('Notificaciones desactivadas en este teléfono.');
  } catch (error) {
    avisar('No se pudo: ' + traducirError(error));
  }
});

async function iniciarCuenta() {
  const { data } = await db.auth.getSession();
  db.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'PASSWORD_RECOVERY') abrirLogin('nueva');
    // TOKEN_REFRESHED: la sesión se renovó sola (por ejemplo, al volver el internet): se retoma la cuenta.
    else if (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED') ponerCuenta(sesion?.user ?? null);
    else if (evento === 'SIGNED_OUT') {
      // La sesión se cerró sola (venció): las secciones eran de esa cuenta; vuelven al entrar otra vez.
      if (cuenta) reiniciarSecciones();
      ponerCuenta(null);
    }
  });
  await ponerCuenta(data.session?.user ?? null);
}

// ---------- Ajustes: perfil, cuenta y respaldo ----------

// Configuración es una lista; cada opción abre su pantallita dentro de la misma hoja
// (y la flecha ‹ regresa a la lista), como en TikTok o en los Ajustes del iPhone.
const TITULOS_AJUSTES = {
  inicio: 'Configuración',
  perfil: 'Tu perfil',
  cuenta: 'Mi cuenta',
  notificaciones: 'Notificaciones',
  telegram: 'Telegram',
  respaldo: 'Respaldo',
};

function irAjuste(nombre, regresando = false) {
  for (const pantalla of document.querySelectorAll('#hoja-ajustes .pantalla')) {
    const es = pantalla.dataset.pantalla === nombre;
    pantalla.hidden = !es;
    pantalla.classList.remove('entra', 'regresa');
    if (es && nombre !== 'inicio') pantalla.classList.add('entra');
    if (es && regresando) pantalla.classList.add('regresa');
  }
  $('#ajustes-titulo').textContent = TITULOS_AJUSTES[nombre];
  $('#ajustes-atras').hidden = nombre === 'inicio';
  $('#hoja-ajustes').scrollTop = 0;
}

for (const boton of document.querySelectorAll('#hoja-ajustes [data-ir]')) {
  boton.addEventListener('click', () => irAjuste(boton.dataset.ir));
}
$('#ajustes-atras').addEventListener('click', () => {
  dibujarResumenAjustes();
  irAjuste('inicio', true);
});

// Lo que se ve en la lista: tu nombre, tu correo y la versión de la app.
function dibujarResumenAjustes() {
  $('#ajustes-nombre').textContent = perfil.nombre || 'Tu perfil';
  $('#ajustes-correo').textContent = cuenta?.email || 'Foto y nombre';
  $('#ajustes-version').textContent = `Kashiki · versión ${VERSION_APP}`;
}

function abrirAjustes() {
  const form = $('#form-ajustes');
  form.nombre.value = perfil.nombre;
  dibujarEncabezado();
  dibujarResumenAjustes();
  irAjuste('inicio');
  abrirHoja($('#hoja-ajustes'));
  revisarTelegram();
  revisarNotificaciones().catch(() => {});
}
$('#abrir-ajustes').addEventListener('click', abrirAjustes);
$('#avatar').addEventListener('click', abrirAjustes);

function guardarPerfil() {
  escribir(CLAVE_PERFIL, perfil);
  dibujarEncabezado();
}

// El nombre también se guarda en la cuenta, para que salga en cualquier teléfono o compu.
// Espera a que dejes de escribir un momento para no mandarlo letra por letra.
let esperaNombre;
$('#nombre').addEventListener('input', (e) => {
  perfil.nombre = e.target.value.trim();
  guardarPerfil();
  clearTimeout(esperaNombre);
  esperaNombre = setTimeout(subirNombre, 800);
});

function subirNombre() {
  if (!cuenta || cuenta.user_metadata?.nombre === perfil.nombre) return;
  db.auth.updateUser({ data: { nombre: perfil.nombre } }).then(({ data }) => {
    if (data?.user) cuenta = data.user;
  });
}

// Al entrar: si la cuenta ya tiene nombre, ese manda; si no, se le pone el de este teléfono.
function nombreDeLaCuenta() {
  const enLaCuenta = cuenta.user_metadata?.nombre;
  if (!enLaCuenta) {
    if (perfil.nombre) subirNombre();
    return;
  }
  if (enLaCuenta === perfil.nombre) return;
  perfil.nombre = enLaCuenta;
  guardarPerfil();
}

// ---------- Recorte de la foto ----------

// La foto se acomoda dentro de un cuadro; "escala" es cuánto se agranda y (x, y) dónde queda su esquina.
const recorte = { imagen: null, base: 1, escala: 1, x: 0, y: 0, dedos: new Map() };
const ladoRecorte = () => $('#recorte').clientWidth;

// No deja que la foto se salga: siempre cubre todo el cuadro.
function acomodarFoto() {
  const lado = ladoRecorte();
  const ancho = recorte.imagen.naturalWidth * recorte.escala;
  const alto = recorte.imagen.naturalHeight * recorte.escala;
  recorte.x = Math.min(0, Math.max(lado - ancho, recorte.x));
  recorte.y = Math.min(0, Math.max(lado - alto, recorte.y));
  Object.assign($('#recorte-img').style, { width: ancho + 'px', height: alto + 'px', transform: `translate(${recorte.x}px, ${recorte.y}px)` });
}

// Acerca o aleja manteniendo fijo el punto (px, py) del cuadro.
function acercar(zoom, px = ladoRecorte() / 2, py = ladoRecorte() / 2) {
  zoom = Math.min(4, Math.max(1, zoom));
  const nueva = recorte.base * zoom;
  recorte.x = px - ((px - recorte.x) / recorte.escala) * nueva;
  recorte.y = py - ((py - recorte.y) / recorte.escala) * nueva;
  recorte.escala = nueva;
  $('#zoom').value = zoom;
  acomodarFoto();
}

$('#foto').addEventListener('change', (evento) => {
  const archivo = evento.target.files[0];
  evento.target.value = '';
  if (!archivo) return;
  const imagen = new Image();
  imagen.onload = () => {
    recorte.imagen = imagen;
    $('#recorte-img').src = imagen.src;
    abrirHoja($('#hoja-foto'));
    // Empieza centrada y cubriendo todo el cuadro.
    const lado = ladoRecorte();
    recorte.base = recorte.escala = lado / Math.min(imagen.naturalWidth, imagen.naturalHeight);
    recorte.x = (lado - imagen.naturalWidth * recorte.escala) / 2;
    recorte.y = (lado - imagen.naturalHeight * recorte.escala) / 2;
    $('#zoom').value = 1;
    acomodarFoto();
  };
  imagen.src = URL.createObjectURL(archivo);
});

$('#zoom').addEventListener('input', (e) => acercar(Number(e.target.value)));

const cuadro = $('#recorte');
cuadro.addEventListener('pointerdown', (e) => {
  cuadro.setPointerCapture(e.pointerId);
  recorte.dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
cuadro.addEventListener('pointermove', (e) => {
  const antes = recorte.dedos.get(e.pointerId);
  if (!antes) return;
  const caja = cuadro.getBoundingClientRect();
  if (recorte.dedos.size === 1) {
    // Un dedo: mover
    recorte.x += e.clientX - antes.x;
    recorte.y += e.clientY - antes.y;
    acomodarFoto();
  } else {
    // Dos dedos: pellizcar para acercar
    const [otro] = [...recorte.dedos].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
    const distancia = (a) => Math.hypot(a.x - otro.x, a.y - otro.y);
    const ahora = { x: e.clientX, y: e.clientY };
    const factor = distancia(ahora) / (distancia(antes) || 1);
    acercar((recorte.escala / recorte.base) * factor, (ahora.x + otro.x) / 2 - caja.left, (ahora.y + otro.y) / 2 - caja.top);
  }
  recorte.dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
for (const tipo of ['pointerup', 'pointercancel']) {
  cuadro.addEventListener(tipo, (e) => recorte.dedos.delete(e.pointerId));
}
cuadro.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const caja = cuadro.getBoundingClientRect();
    acercar((recorte.escala / recorte.base) * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX - caja.left, e.clientY - caja.top);
  },
  { passive: false }
);

// Guarda solo lo que se ve en el cuadro, achicado a 160 px para que no ocupe mucho.
$('#form-foto').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const salida = 160;
  const lienzoFoto = document.createElement('canvas');
  lienzoFoto.width = lienzoFoto.height = salida;
  const lado = ladoRecorte() / recorte.escala;
  lienzoFoto.getContext('2d').drawImage(recorte.imagen, -recorte.x / recorte.escala, -recorte.y / recorte.escala, lado, lado, 0, 0, salida, salida);
  perfil.foto = lienzoFoto.toDataURL('image/jpeg', 0.85);
  URL.revokeObjectURL(recorte.imagen.src);
  guardarPerfil();
  cerrarHoja($('#hoja-foto'));
});

$('#quitar-foto').addEventListener('click', () => {
  perfil.foto = '';
  guardarPerfil();
});

$('#form-ajustes').addEventListener('submit', (evento) => {
  evento.preventDefault();
  cerrarHoja($('#hoja-ajustes'));
});

$('#exportar').addEventListener('click', () => {
  const archivo = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(archivo);
  enlace.download = `mi-dinero-${hoy()}.json`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
});

// ---------- Exportar a Excel ----------
// La librería que arma el .xlsx (SheetJS) solo se descarga la primera vez que se usa.
let cargandoExcel = null;
function cargarExcel() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  cargandoExcel ??= new Promise((listo, fallo) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => listo(window.XLSX);
    script.onerror = () => {
      cargandoExcel = null;
      script.remove();
      fallo(new Error('sin internet'));
    };
    document.head.append(script);
  });
  return cargandoExcel;
}

const FORMATO_DINERO = '"$"#,##0.00';
const NOMBRE_TIPO = { ingreso: 'Ingreso', gasto: 'Gasto', ahorro: 'Ahorro' };
const NOMBRE_CADA = { semana: 'Cada semana', mes: 'Cada mes', anio: 'Cada año' };

// Excel guarda las fechas como "días desde el 30/12/1899". Se calcula en UTC para que no se recorra un día.
const diaExcel = (fecha) => {
  const [a, m, d] = fecha.split('-').map(Number);
  return (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
};

// Arma una hoja con encabezados, ancho de columnas y formato de dinero y fecha.
function hojaExcel(XLSX, encabezados, filas, { dinero: deDinero = [], fechas = [], anchos = [] } = {}) {
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
  hoja['!cols'] = encabezados.map((e, i) => ({ wch: anchos[i] || Math.max(12, e.length + 2) }));
  for (let f = 1; f <= filas.length; f++) {
    for (const c of deDinero) {
      const celda = hoja[XLSX.utils.encode_cell({ r: f, c })];
      if (celda) celda.z = FORMATO_DINERO;
    }
    for (const c of fechas) {
      const celda = hoja[XLSX.utils.encode_cell({ r: f, c })];
      if (celda) celda.z = 'dd/mm/yyyy';
    }
  }
  if (filas.length > 0) hoja['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: encabezados.length - 1 } }) };
  return hoja;
}

function armarExcel(XLSX) {
  const nombreSeccion = (id) => secciones.find((s) => s.id === id)?.nombre || 'Otra sección';
  const nombreMeta = (id) => datos.metas.find((m) => m.id === id)?.nombre || '';
  const conSecciones = secciones.length > 1;
  const libro = XLSX.utils.book_new();

  // 1. Resumen por mes (de todas las secciones), del más reciente al más viejo.
  const porMes = {};
  for (const m of datos.movimientos) {
    if (m.categoria === SALDO_INICIAL) continue;
    const mes = (porMes[m.fecha.slice(0, 7)] ??= { ingreso: 0, gasto: 0, ahorro: 0 });
    mes[m.tipo] += m.monto;
  }
  const meses = Object.keys(porMes).sort().reverse();
  const filasResumen = meses.map((clave) => {
    const { ingreso, gasto, ahorro } = porMes[clave];
    const nombre = aFecha(clave + '-01').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    return [nombre.charAt(0).toUpperCase() + nombre.slice(1), ingreso, gasto, ahorro, ingreso - gasto];
  });
  XLSX.utils.book_append_sheet(
    libro,
    hojaExcel(XLSX, ['Mes', 'Ingresos', 'Gastos', 'Ahorrado', 'Balance'], filasResumen, { dinero: [1, 2, 3, 4], anchos: [20, 14, 14, 14, 14] }),
    'Resumen por mes'
  );

  // 2. Todos los movimientos, del más nuevo al más viejo.
  const movimientos = [...datos.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
  const encabezadosMov = ['Fecha', 'Tipo', 'Categoría', 'Nota', 'Monto', ...(conSecciones ? ['Sección'] : [])];
  const filasMov = movimientos.map((m) => [
    diaExcel(m.fecha),
    NOMBRE_TIPO[m.tipo],
    m.tipo === 'ahorro' ? nombreMeta(m.meta) || m.categoria : m.categoria,
    m.nota || '',
    m.tipo === 'gasto' ? -m.monto : m.monto,
    ...(conSecciones ? [nombreSeccion(m.seccion)] : []),
  ]);
  XLSX.utils.book_append_sheet(
    libro,
    hojaExcel(XLSX, encabezadosMov, filasMov, { dinero: [4], fechas: [0], anchos: [12, 10, 18, 30, 14, 16] }),
    'Movimientos'
  );

  // 3. Metas de ahorro.
  const filasMetas = datos.metas.map((meta) => {
    const ahorrado = ahorradoEn(meta);
    return [meta.nombre, meta.objetivo, ahorrado, Math.max(0, meta.objetivo - ahorrado), ...(conSecciones ? [nombreSeccion(meta.seccion)] : [])];
  });
  XLSX.utils.book_append_sheet(
    libro,
    hojaExcel(XLSX, ['Meta', 'Objetivo', 'Ahorrado', 'Falta', ...(conSecciones ? ['Sección'] : [])], filasMetas, { dinero: [1, 2, 3], anchos: [22, 14, 14, 14, 16] }),
    'Metas'
  );

  // 4. Pagos pendientes y pagos fijos.
  const filasPendientes = [...datos.pendientes]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((p) => [p.tipo === 'debo' ? 'Yo debo' : 'Me deben', p.persona, p.monto, diaExcel(p.fecha), p.nota || '', ...(conSecciones ? [nombreSeccion(p.seccion)] : [])]);
  XLSX.utils.book_append_sheet(
    libro,
    hojaExcel(XLSX, ['Tipo', 'Persona', 'Monto', 'Fecha', 'Nota', ...(conSecciones ? ['Sección'] : [])], filasPendientes, { dinero: [2], fechas: [3], anchos: [12, 20, 14, 12, 26, 16] }),
    'Pagos pendientes'
  );
  const filasFijos = [...datos.fijos]
    .sort((a, b) => a.proximo.localeCompare(b.proximo))
    .map((f) => [f.nombre, f.monto, NOMBRE_CADA[f.cada], diaExcel(f.proximo), ...(conSecciones ? [nombreSeccion(f.seccion)] : [])]);
  XLSX.utils.book_append_sheet(
    libro,
    hojaExcel(XLSX, ['Pago', 'Monto', 'Cada cuándo', 'Próximo cobro', ...(conSecciones ? ['Sección'] : [])], filasFijos, { dinero: [1], fechas: [3], anchos: [22, 14, 14, 14, 16] }),
    'Pagos fijos'
  );
  return libro;
}

$('#exportar-excel').addEventListener('click', async () => {
  const boton = $('#exportar-excel');
  boton.disabled = true;
  try {
    const XLSX = await conLimite(cargarExcel(), 15000, 'tardó');
    XLSX.writeFile(armarExcel(XLSX), `kashiki-${hoy()}.xlsx`, { compression: true });
    avisar('Listo: se descargó tu archivo de Excel.');
  } catch {
    avisar('No se pudo crear el archivo. Revisa tu conexión a internet e intenta de nuevo.');
  } finally {
    boton.disabled = false;
  }
});

$('#importar').addEventListener('change', async (evento) => {
  const archivo = evento.target.files[0];
  evento.target.value = '';
  if (!archivo) return;
  try {
    let respaldo = JSON.parse(await archivo.text());
    if (Array.isArray(respaldo)) respaldo = { movimientos: respaldo }; // respaldos de la primera versión
    let agregados = 0;
    for (const nombre of Object.keys(CLAVES)) {
      if (!Array.isArray(respaldo[nombre])) continue;
      const existentes = new Set(datos[nombre].map((x) => x.id));
      const nuevos = limpiar(nombre, respaldo[nombre]).filter((x) => !existentes.has(x.id));
      datos[nombre].push(...nuevos);
      guardarColeccion(nombre);
      for (const objeto of nuevos) encolar({ accion: 'agregar', coleccion: nombre, objeto });
      agregados += nuevos.length;
    }
    dibujar();
    sincronizar();
    avisar(`Se agregaron ${agregados} registros del respaldo`);
  } catch {
    avisar('Ese archivo no es un respaldo de Kashiki.');
  }
});

// ---------- Pantalla de carga ----------

// La barrita avanza a su propio paso, con calma: aunque los datos lleguen rápido,
// nunca sube más de VELOCIDAD_CARGA por ciento por segundo (de 0 a 100 tarda unos 3.5 s).
const VELOCIDAD_CARGA = 28;
let avanceCarga = 0; // hasta dónde puede llegar según lo que ya cargó
let barraMostrada = 0; // lo que se ve en pantalla
let cargaTerminada = false;

function progresoCarga(porcentaje) {
  avanceCarga = Math.max(avanceCarga, porcentaje);
}

function animarBarra(antes) {
  return (ahora) => {
    const segundos = (ahora - antes) / 1000;
    // Se va frenando al acercarse a su meta, para que se vea suave.
    const falta = avanceCarga - barraMostrada;
    barraMostrada = Math.min(avanceCarga, barraMostrada + Math.min(VELOCIDAD_CARGA * segundos, Math.max(falta * 0.08, 0.15)));
    const barra = $('#carga-progreso');
    if (!barra) return;
    barra.style.width = barraMostrada + '%';
    if (cargaTerminada && barraMostrada >= 100) {
      setTimeout(quitarCarga, 350);
      return;
    }
    requestAnimationFrame(animarBarra(ahora));
  };
}
// Empieza cuando la barrita ya apareció en pantalla.
setTimeout(() => requestAnimationFrame(animarBarra(performance.now())), 800);

// Cuando los datos están listos la barrita termina de llenarse y entonces se quita la pantalla.
function terminarCarga() {
  cargaTerminada = true;
  progresoCarga(100);
}

function quitarCarga() {
  const carga = $('#carga');
  if (!carga) return;
  carga.classList.add('oculta');
  mostrarVista(leer('mi-dinero:vista', 'dinero')); // las animaciones de la sección arrancan al quitarse la carga
  setTimeout(() => carga.remove(), 500);
}

// ---------- Arranque ----------

setTimeout(terminarCarga, 5000); // por si la nube tarda mucho (o algo falla), no te deja esperando
setTimeout(quitarCarga, 8000); // último seguro: aunque la animación de la barrita se atore, la pantalla se quita
progresoCarga(25);
$('#mes').value = hoy().slice(0, 7);
// Si algo falla al dibujar, la app sigue arrancando en lugar de quedarse trabada en la pantalla de carga.
try {
  dibujar();
  mostrarIA();
  mostrarVista(leer('mi-dinero:vista', 'dinero'));
} catch (error) {
  console.error('Error al dibujar la app:', error);
}
progresoCarga(55);
if (db) {
  setTimeout(() => progresoCarga(80), 400);
  iniciarCuenta().catch(() => ponerCuenta(null)).finally(terminarCarga);
} else {
  ponerCuenta(null);
  terminarCarga();
}

// ---------- Jalar hacia abajo para recargar (como en Instagram) ----------
// Si estás hasta arriba y jalas hacia abajo, la pantalla baja contigo (el encabezado se queda)
// y en el hueco sale el circulito; al soltarlo pasando la marca, la app se recarga y trae
// la versión más nueva y tus datos de la nube.
const JALON_MINIMO = 70; // cuánto hay que jalar (en pixeles) para que recargue
const JALON_MAXIMO = 110;
let inicioJalon = null;
let jalon = 0;

function moverCirculo(distancia) {
  const circulo = $('#recargar');
  const avance = Math.min(1, distancia / JALON_MINIMO);
  // El circulito va centrado en el hueco entre el encabezado y la pantalla que bajó.
  circulo.style.transform = `translateY(${distancia / 2 - 20}px) scale(${0.4 + avance * 0.6}) rotate(${distancia * 3}deg)`;
  circulo.style.opacity = avance;
  circulo.classList.toggle('listo', distancia >= JALON_MINIMO);
  $('main').style.transform = distancia ? `translateY(${distancia}px)` : '';
}

function soltarAnimado(si) {
  $('#recargar').classList.toggle('suelto', si);
  $('main').classList.toggle('suelto', si);
}

let inicioJalonX = 0;
let jalonDecidido = false; // ya se sabe si el dedo va hacia abajo (jalar) o de lado (otra cosa)

document.addEventListener('touchstart', (e) => {
  const hojaAbierta = document.querySelector('dialog[open]');
  // En la gráfica el dedo se usa para ver los días; ahí no se jala para recargar.
  const enGrafica = e.target.closest?.('#grafica');
  inicioJalon = window.scrollY <= 0 && !hojaAbierta && !enGrafica && e.touches.length === 1 ? e.touches[0].clientY : null;
  jalon = 0;
  jalonDecidido = false;
  if (inicioJalon === null) return;
  inicioJalonX = e.touches[0].clientX;
  soltarAnimado(false);
  $('#recargar').style.top = `${$('.encabezado').getBoundingClientRect().bottom}px`;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (inicioJalon === null) return;
  const bajado = e.touches[0].clientY - inicioJalon;
  // Si el dedo va más de lado que hacia abajo (por ejemplo, deslizando un movimiento para
  // borrarlo), no es un jalón: se ignora el resto del gesto.
  if (!jalonDecidido) {
    const deLado = Math.abs(e.touches[0].clientX - inicioJalonX);
    if (deLado + Math.abs(bajado) < 8) return;
    jalonDecidido = true;
    if (deLado > Math.abs(bajado)) {
      inicioJalon = null;
      return;
    }
  }
  if (bajado <= 0 || window.scrollY > 0) {
    jalon = 0;
    moverCirculo(0);
    return;
  }
  e.preventDefault(); // que la página no rebote mientras jalas
  jalon = Math.min(JALON_MAXIMO, bajado * 0.5); // se siente "pesado", como en otras apps
  moverCirculo(jalon);
}, { passive: false });

document.addEventListener('touchend', () => {
  if (inicioJalon === null) return;
  inicioJalon = null;
  soltarAnimado(true);
  if (jalon < JALON_MINIMO) {
    moverCirculo(0);
    return;
  }
  moverCirculo(JALON_MINIMO); // la pantalla se queda un poco abajo mientras gira, como en Instagram
  $('#recargar').classList.add('girando');
  setTimeout(() => location.reload(), 350);
});

// El teléfono interrumpió el gesto (por ejemplo, bajaste el centro de notificaciones): todo regresa.
document.addEventListener('touchcancel', () => {
  if (inicioJalon === null) return;
  inicioJalon = null;
  jalon = 0;
  soltarAnimado(true);
  moverCirculo(0);
});

// Al volver a abrir la app, trae lo más nuevo de la nube y actualiza la racha.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  dibujar();
  sincronizar();
});
window.addEventListener('online', sincronizar);

// Permite instalar la app en el teléfono y abrirla sin internet.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js');
}
