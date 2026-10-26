// Mi Dinero: registra ingresos, gastos y ahorros, lleva tus metas, tu racha y tus pagos pendientes,
// y lo guarda todo en el teléfono y en la nube (Google Sheets).

// Categorías disponibles para cada tipo de movimiento. Puedes agregar o quitar las que quieras.
const CATEGORIAS = {
  gasto: ['Comida', 'Transporte', 'Casa', 'Servicios', 'Salud', 'Diversión', 'Ropa', 'Otros'],
  ingreso: ['Sueldo', 'Ventas', 'Negocio', 'Regalo', 'Saldo inicial', 'Otros'],
};
// Ícono de cada categoría (https://tabler.io/icons). Las categorías propias usan una etiqueta.
const ICONOS = {
  Comida: 'ti-tools-kitchen-2',
  Transporte: 'ti-bus',
  Casa: 'ti-home',
  Servicios: 'ti-bulb',
  Salud: 'ti-heart-rate-monitor',
  'Diversión': 'ti-device-gamepad-2',
  Ropa: 'ti-shirt',
  Otros: 'ti-dots',
  Sueldo: 'ti-cash',
  Ventas: 'ti-briefcase',
  Negocio: 'ti-building-store',
  Regalo: 'ti-gift',
  'Saldo inicial': 'ti-wallet',
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
};
const CLAVE_NUBE = 'mi-dinero:nube';
const CLAVE_PENDIENTES = 'mi-dinero:pendientes';
const CLAVE_IA = 'mi-dinero:ia';
const CLAVE_PERFIL = 'mi-dinero:perfil';

const $ = (selector) => document.querySelector(selector);
const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const corto = (n) => '$' + Math.round(n).toLocaleString('es-MX');

const datos = {
  movimientos: leer(CLAVES.movimientos, []),
  metas: leer(CLAVES.metas, []),
  dias: leer(CLAVES.dias, []),
  pendientes: leer(CLAVES.pendientes, []),
};
let nube = leer(CLAVE_NUBE, null); // { url, clave } o null si no está conectada
let pendientes = leer(CLAVE_PENDIENTES, []); // cambios que aún no se suben a la nube
let perfil = leer(CLAVE_PERFIL, { nombre: '', foto: '' });

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
function fechaBonita(fecha) {
  return aFecha(fecha).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
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

// ---------- Nube ----------

// Manda una petición al servidor de Google. Se usa texto simple para que el navegador lo permita.
async function llamarNube(peticion) {
  const respuesta = await fetch(nube.url, {
    method: 'POST',
    body: JSON.stringify({ ...peticion, clave: nube.clave }),
  });
  const resultado = await respuesta.json();
  if (resultado.error) throw new Error(resultado.error);
  return resultado;
}

// Guarda un cambio para subirlo; si no hay internet, se queda en la fila y se reintenta después.
function encolar(cambio) {
  if (!nube) return;
  pendientes.push(cambio);
  escribir(CLAVE_PENDIENTES, pendientes);
}

let sincronizando = false;

async function sincronizar() {
  if (!nube || sincronizando) return;
  sincronizando = true;
  mostrarEstado('ti-refresh', 'Sincronizando…');
  try {
    // 1. Sube los cambios pendientes, en orden.
    while (pendientes.length > 0) {
      await llamarNube(pendientes[0]);
      pendientes.shift();
      escribir(CLAVE_PENDIENTES, pendientes);
    }
    // 2. Descarga todo: la nube es la fuente de verdad.
    const respuesta = await llamarNube({ accion: 'listar' });
    for (const nombre of Object.keys(CLAVES)) {
      if (respuesta[nombre]) {
        datos[nombre] = respuesta[nombre];
        guardarColeccion(nombre);
      }
    }
    escribir(CLAVE_IA, Boolean(respuesta.ia));
    mostrarIA();
    dibujar();
    mostrarEstado('ti-cloud-check', 'Guardado en la nube');
  } catch (error) {
    mostrarEstado('ti-cloud-off', explicarError(error), true);
  } finally {
    sincronizando = false;
  }
}

// Un TypeError de fetch significa que no hubo respuesta: o no hay internet, o la dirección del servidor está mal.
function explicarError(error) {
  if (!(error instanceof TypeError || error instanceof SyntaxError)) return 'Error de la nube: ' + error.message;
  if (!navigator.onLine) return 'Sin internet: tus cambios se subirán cuando vuelva la conexión';
  return 'No responde el servidor. Revisa en ajustes que la dirección termine en /exec';
}

function mostrarEstado(icono, texto, problema = false) {
  const estado = $('#estado');
  estado.innerHTML = `<i class="ti ${icono}" aria-hidden="true"></i>`;
  estado.append(texto);
  estado.classList.toggle('problema', problema);
}

// ---------- Agregar y borrar ----------

function agregar(nombre, objeto) {
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
  const gastos = (desde, hasta) => sumar(datos.movimientos.filter((x) => x.tipo === 'gasto' && x.fecha >= desde && x.fecha <= hasta));
  const ahora = gastos(hoyTexto.slice(0, 8) + '01', hoyTexto);
  const antes = gastos(inicioPasado, finPasado);
  const mesPasado = new Date(a, m - 2, 1).toLocaleDateString('es-MX', { month: 'long' });
  return { ahora, antes, mesPasado };
}

// ---------- Dibujar la pantalla ----------

function dibujar() {
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
  $('#fecha-hoy').textContent = mayuscula(new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }));
  for (const el of [$('#avatar'), $('#avatar-grande')]) {
    el.style.backgroundImage = perfil.foto ? `url(${perfil.foto})` : '';
    el.textContent = perfil.foto ? '' : (perfil.nombre || '?')[0].toUpperCase();
  }
}

function dibujarSaldo() {
  const total = datos.movimientos.reduce((t, m) => t + efecto(m), 0);
  if (!grafica.tocando) contar($('#saldo'), total);
  if (!grafica.tocando) dibujarComparacion();
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
  for (const m of datos.movimientos) {
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

  const n = puntos.length;
  const ultimo = n - 1;
  if (grafica.modo === 'barras') {
    const valores = puntos.map((p) => p[grafica.que]);
    const maximo = Math.max(...valores, 1);
    const paso = ANCHO / n;
    const ancho = paso * (n <= 13 ? 0.62 : 0.66);
    const radio = Math.min(10, ancho / 2.6);
    const color = grafica.que === 'gas' ? 'var(--acento-2)' : 'var(--positivo)';
    const colorHoy = grafica.que === 'gas' ? 'var(--acento)' : 'var(--acento-2)';
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
    const area = svg('path', { d: `${trazo} L${ANCHO} ${BASE} L0 ${BASE} Z` }, { fill: 'var(--acento)', fillOpacity: 0.12 });
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

function dibujarMes() {
  const mes = $('#mes').value; // "AAAA-MM"
  const delMes = datos.movimientos
    .filter((m) => m.fecha.startsWith(mes))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);

  const ingresos = sumar(delMes.filter(esIngresoReal));
  const gastos = sumar(delMes.filter((m) => m.tipo === 'gasto'));
  const apartado = sumar(delMes.filter((m) => m.tipo === 'ahorro'));
  contar($('#total-ingresos'), ingresos, 700);
  contar($('#total-gastos'), gastos, 700);
  $('#apartado-mes').textContent = apartado > 0 ? `Apartaste ${dinero.format(apartado)} para tus metas este mes` : '';
  $('#apartado-mes').hidden = apartado === 0;

  dibujarLista(delMes);
  dibujarCategorias(delMes, gastos);
}

let ultimoAgregado = null; // id del movimiento recién guardado, para animarlo al aparecer

function dibujarLista(delMes) {
  const ul = $('#lista');
  ul.replaceChildren();
  $('.pista-deslizar').hidden = delMes.length === 0;
  if (delMes.length === 0) {
    ul.append(vacio('Aún no hay movimientos este mes. Toca + para agregar el primero.'));
    return;
  }
  const signos = { gasto: '−', ingreso: '+', ahorro: '' };
  for (const m of delMes) {
    const li = filaDeslizable(m.tipo, () => borrarConDeshacer('movimientos', m, `Borrado: ${m.categoria} ${dinero.format(m.monto)}`));
    const fila = li.querySelector('.fila');
    if (m.id === ultimoAgregado) fila.classList.add('entrando');
    fila.append(
      icono(iconoDe(m)),
      textoFila(m.tipo === 'ahorro' ? `Ahorro: ${m.categoria}` : m.categoria, [fechaBonita(m.fecha), m.nota].filter(Boolean).join(' · ')),
      montoFila(signos[m.tipo] + dinero.format(m.monto))
    );
    ul.append(li);
  }
  ultimoAgregado = null;
}

function dibujarCategorias(delMes, totalGastos) {
  const porCategoria = {};
  for (const m of delMes) {
    if (m.tipo === 'gasto') porCategoria[m.categoria] = (porCategoria[m.categoria] || 0) + m.monto;
  }
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

function icono(nombre) {
  const div = document.createElement('div');
  div.className = 'icono-cat';
  div.innerHTML = `<i class="ti ${nombre}" aria-hidden="true"></i>`;
  return div;
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
  const total = datos.movimientos.reduce((t, m) => t + efecto(m), 0);
  const enMetas = sumar(datos.movimientos.filter((m) => m.tipo === 'ahorro'));
  contar($('#total-disponible'), total - enMetas, 700);
  contar($('#total-metas'), enMetas, 700);
  $('#pista-saldo').hidden = datos.movimientos.some((m) => m.categoria === SALDO_INICIAL);

  const ul = $('#metas');
  ul.replaceChildren();
  if (datos.metas.length === 0) {
    ul.append(vacio('Crea una meta para empezar a ahorrar con un objetivo.'));
    return;
  }
  for (const meta of datos.metas) {
    const ahorrado = ahorradoEn(meta);
    const avance = Math.min(100, Math.round((ahorrado / meta.objetivo) * 100));
    const cumplida = ahorrado >= meta.objetivo;

    const li = filaDeslizable('meta-fila', () => borrarConDeshacer('metas', meta, `Meta borrada: ${meta.nombre}`));
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
    arriba.append(icono(cumplida ? 'ti-trophy' : 'ti-target'), textoFila(meta.nombre, cumplida ? '¡Meta cumplida!' : `Faltan ${dinero.format(meta.objetivo - ahorrado)}`), aportar);

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
  const ordenados = [...datos.pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const debo = ordenados.filter((p) => p.tipo === 'debo');
  const meDeben = ordenados.filter((p) => p.tipo === 'me-deben');

  contar($('#total-debo'), sumar(debo), 700);
  contar($('#total-me-deben'), sumar(meDeben), 700);
  // El punto en la barra avisa de pagos que vencen hoy, mañana o ya vencieron.
  $('#punto-pagos').hidden = !ordenados.some((p) => diasPara(p.fecha) <= 1);

  dibujarListaPagos($('#lista-debo'), debo, 'No le debes nada a nadie.');
  dibujarListaPagos($('#lista-me-deben'), meDeben, 'Nadie te debe nada.');
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
  aviso.hidden = true;
  aviso.getBoundingClientRect();
  aviso.hidden = false;
  clearTimeout(ocultarAviso);
  ocultarAviso = setTimeout(() => (aviso.hidden = true), textoAccion ? 5000 : 3500);
}

// ---------- Hojas que suben desde abajo ----------

function abrirHoja(hoja) {
  hoja.classList.remove('cerrando');
  hoja.showModal();
}

function cerrarHoja(hoja) {
  if (!hoja.open) return;
  hoja.classList.add('cerrando');
  setTimeout(() => {
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
}
for (const boton of document.querySelectorAll('[data-cierra]')) {
  boton.addEventListener('click', () => cerrarHoja(boton.closest('dialog')));
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

// Chips de categoría; para ahorros, los chips son tus metas.
function pintarCategorias() {
  const tipo = $('#form').tipo.value;
  const contenedor = $('#chips-categoria');
  const opciones =
    tipo === 'ahorro'
      ? datos.metas.map((meta) => ({ valor: meta.id, texto: meta.nombre, icono: 'ti-target' }))
      : categoriasDe(tipo).map((c) => ({ valor: c, texto: c, icono: ICONOS[c] || 'ti-tag' }));
  if (tipo !== 'ahorro') opciones.push({ valor: NUEVA_CATEGORIA, texto: 'Otra', icono: 'ti-pencil' });

  if (!opciones.some((o) => o.valor === formulario.categoria)) formulario.categoria = opciones[0]?.valor ?? null;
  contenedor.replaceChildren(
    ...opciones.map((o) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (o.valor === formulario.categoria ? ' activo' : '');
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', o.valor === formulario.categoria);
      chip.innerHTML = `<i class="ti ${o.icono}" aria-hidden="true"></i>`;
      chip.append(o.texto);
      chip.addEventListener('click', () => {
        formulario.categoria = o.valor;
        pintarCategorias();
        if (o.valor === NUEVA_CATEGORIA) $('#nueva-categoria').focus();
      });
      return chip;
    })
  );
  if (tipo === 'ahorro' && datos.metas.length === 0) contenedor.append(vacio('Primero crea una meta en la sección Metas.'));

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
  if (prellenado.categoria && form.tipo.value !== 'ahorro' && !categoriasDe(form.tipo.value).includes(prellenado.categoria)) {
    formulario.categoria = 'Otros';
  }
  pintarMonto();
  $('#chips-categoria').scrollLeft = 0;
  abrirHoja($('#hoja-movimiento'));
  pintarCategorias(); // después de abrir, para que las flechas midan bien
}

for (const radio of $('#form').querySelectorAll('input[name="tipo"]')) {
  radio.addEventListener('change', () => {
    formulario.categoria = null;
    pintarCategorias();
  });
}

$('#teclado').append(
  ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'borrar'].map((tecla) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'tecla';
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
  avisar(nube ? 'Anotado. Te lo recordaré por Telegram un día antes.' : 'Anotado.');
});

// ---------- Secciones ----------

function mostrarVista(nombre) {
  if (!$(`#vista-${nombre}`)) nombre = 'dinero';
  for (const vista of document.querySelectorAll('.vista')) {
    vista.hidden = vista.id !== `vista-${nombre}`;
  }
  for (const boton of document.querySelectorAll('.barra-secciones button')) {
    if (boton.dataset.vista === nombre) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');
  }
  $('#boton-agregar').hidden = nombre !== 'dinero';
  window.scrollTo(0, 0);
  // Al entrar a una sección se repiten sus animaciones.
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

for (const boton of document.querySelectorAll('.barra-secciones button')) {
  boton.addEventListener('click', () => mostrarVista(boton.dataset.vista));
}
$('#pastilla-racha').addEventListener('click', () => mostrarVista('racha'));

const abridores = {
  movimiento: () => abrirFormulario(),
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

$('#mes').addEventListener('change', dibujarMes);

// ---------- IA: escribir en lenguaje normal ----------

// La caja solo aparece si la nube está conectada y el servidor tiene la llave de la API.
function mostrarIA() {
  $('#form-ia').hidden = !(nube && leer(CLAVE_IA, false));
}

$('#form-ia').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const form = evento.target;
  const boton = form.querySelector('button');
  boton.disabled = true;
  boton.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
  try {
    const { movimiento } = await llamarNube({
      accion: 'interpretar',
      texto: form.texto.value,
      categorias: { gasto: categoriasDe('gasto'), ingreso: categoriasDe('ingreso') },
      hoy: hoy(),
    });
    form.reset();
    abrirFormulario(movimiento);
  } catch (error) {
    avisar(explicarError(error));
  } finally {
    boton.disabled = false;
    boton.innerHTML = '<i class="ti ti-arrow-up" aria-hidden="true"></i>';
  }
});

// ---------- Ajustes: perfil, nube y respaldo ----------

function abrirAjustes() {
  const form = $('#form-ajustes');
  form.url.value = nube?.url || '';
  form.clave.value = nube?.clave || '';
  form.nombre.value = perfil.nombre;
  dibujarEncabezado();
  abrirHoja($('#hoja-ajustes'));
}
$('#abrir-ajustes').addEventListener('click', abrirAjustes);
$('#avatar').addEventListener('click', abrirAjustes);

function guardarPerfil() {
  escribir(CLAVE_PERFIL, perfil);
  dibujarEncabezado();
}

$('#nombre').addEventListener('input', (e) => {
  perfil.nombre = e.target.value.trim();
  guardarPerfil();
});

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
  const form = evento.target;
  const estabaConectada = Boolean(nube);
  nube = form.url.value.trim() ? { url: form.url.value.trim(), clave: form.clave.value } : null;
  escribir(CLAVE_NUBE, nube);
  cerrarHoja($('#hoja-ajustes'));

  if (!nube) {
    pendientes = [];
    escribir(CLAVE_PENDIENTES, pendientes);
    mostrarIA();
    mostrarEstado('ti-device-mobile', 'Solo en este teléfono. Conecta la nube en ajustes.');
    return;
  }
  // La primera vez, sube lo que ya había en el teléfono.
  if (!estabaConectada) {
    for (const nombre of Object.keys(CLAVES)) {
      for (const objeto of datos[nombre]) encolar({ accion: 'agregar', coleccion: nombre, objeto });
    }
  }
  sincronizar();
});

$('#exportar').addEventListener('click', () => {
  const archivo = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(archivo);
  enlace.download = `mi-dinero-${hoy()}.json`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
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
      const nuevos = respaldo[nombre].filter((x) => x.id && !existentes.has(x.id));
      datos[nombre].push(...nuevos);
      guardarColeccion(nombre);
      for (const objeto of nuevos) encolar({ accion: 'agregar', coleccion: nombre, objeto });
      agregados += nuevos.length;
    }
    dibujar();
    sincronizar();
    avisar(`Se agregaron ${agregados} registros del respaldo`);
  } catch {
    avisar('Ese archivo no parece un respaldo de Mi Dinero.');
  }
});

// ---------- Pantalla de carga ----------

const inicioCarga = performance.now();
// La barrita aparece con una animación; hasta que se ve, solo se recuerda cuánto avanzar,
// así siempre arranca desde 0 en vez de aparecer ya a la mitad.
let avanceCarga = 0;
let barraVisible = false;
function progresoCarga(porcentaje) {
  avanceCarga = Math.max(avanceCarga, porcentaje);
  if (barraVisible) $('#carga-progreso').style.width = avanceCarga + '%';
}
setTimeout(() => {
  barraVisible = true;
  progresoCarga(avanceCarga);
}, 800);

// Se queda al menos 1.9 s para que se vea la animación, y se quita al terminar de cargar.
function terminarCarga() {
  const carga = $('#carga');
  if (!carga || carga.dataset.terminando) return;
  carga.dataset.terminando = '1';
  progresoCarga(100);
  const espera = Math.max(0, 1900 - (performance.now() - inicioCarga));
  setTimeout(() => {
    carga.classList.add('oculta');
    mostrarVista(leer('mi-dinero:vista', 'dinero')); // las animaciones de la sección arrancan al quitarse la carga
    setTimeout(() => carga.remove(), 500);
  }, espera + 350);
}

// ---------- Arranque ----------

progresoCarga(25);
$('#mes').value = hoy().slice(0, 7);
dibujar();
mostrarIA();
mostrarVista(leer('mi-dinero:vista', 'dinero'));
progresoCarga(55);
if (nube) {
  setTimeout(() => progresoCarga(80), 400);
  Promise.resolve(sincronizar()).finally(terminarCarga);
} else {
  mostrarEstado('ti-device-mobile', 'Solo en este teléfono. Conecta la nube en ajustes.');
  terminarCarga();
}
setTimeout(terminarCarga, 5000); // por si la nube tarda mucho, no te deja esperando

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
