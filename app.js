// Mi Dinero: registra ingresos, gastos y ahorros, lleva tus metas y tu racha,
// y lo guarda todo en el teléfono y en la nube (Google Sheets).

// Categorías disponibles para cada tipo de movimiento. Puedes agregar o quitar las que quieras.
const CATEGORIAS = {
  gasto: ['Comida', 'Transporte', 'Casa', 'Servicios', 'Salud', 'Diversión', 'Ropa', 'Otros'],
  ingreso: ['Sueldo', 'Ventas', 'Negocio', 'Regalo', 'Saldo inicial', 'Otros'],
};
// "Saldo inicial" es el dinero que ya tenías al empezar: cuenta para tu total, pero no como ingreso del mes.
const SALDO_INICIAL = 'Saldo inicial';

// Nombres con los que se guardan los datos en el navegador (localStorage).
const CLAVES = {
  movimientos: 'mi-dinero:movimientos',
  metas: 'mi-dinero:metas',
  dias: 'mi-dinero:dias', // días marcados con "hoy no tuve movimientos"
};
const CLAVE_NUBE = 'mi-dinero:nube';
const CLAVE_PENDIENTES = 'mi-dinero:pendientes';
const CLAVE_IA = 'mi-dinero:ia';

const $ = (selector) => document.querySelector(selector);
const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

const datos = {
  movimientos: leer(CLAVES.movimientos, []),
  metas: leer(CLAVES.metas, []),
  dias: leer(CLAVES.dias, []),
};
let nube = leer(CLAVE_NUBE, null); // { url, clave } o null si no está conectada
let pendientes = leer(CLAVE_PENDIENTES, []); // cambios que aún no se suben a la nube

// ---------- Guardar y cargar en el teléfono ----------

function leer(clave, porDefecto) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(clave, valor) {
  localStorage.setItem(clave, JSON.stringify(valor));
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

// "2026-10-25" → "sáb, 25 oct"
function fechaBonita(fecha) {
  return aFecha(fecha).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
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
  mostrarEstado('Sincronizando…');
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
    mostrarEstado('☁ Guardado en la nube');
  } catch (error) {
    mostrarEstado(explicarError(error), true);
  } finally {
    sincronizando = false;
  }
}

// Un TypeError de fetch significa que no hubo respuesta: o no hay internet, o la dirección del servidor está mal.
function explicarError(error) {
  if (!(error instanceof TypeError || error instanceof SyntaxError)) return 'Error de la nube: ' + error.message;
  if (!navigator.onLine) return 'Sin internet: tus cambios se subirán cuando vuelva la conexión';
  return 'No responde el servidor. Revisa en ⚙ que la dirección esté completa y termine en /exec';
}

function mostrarEstado(texto, problema = false) {
  const estado = $('#estado');
  estado.textContent = texto;
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

// ---------- Cálculos ----------

const sumar = (lista) => lista.reduce((total, m) => total + m.monto, 0);

// Lo que un movimiento cambia tu dinero total. Ahorrar no lo cambia: solo lo aparta para una meta.
function efecto(m) {
  if (m.tipo === 'ingreso') return m.monto;
  if (m.tipo === 'gasto') return -m.monto;
  return 0;
}

function ahorradoEn(meta) {
  return sumar(datos.movimientos.filter((m) => m.tipo === 'ahorro' && m.meta === meta.id));
}

// Un día cuenta para la racha si registraste algo ese día o marcaste "hoy no tuve movimientos".
function diasActivos() {
  const activos = new Set(datos.dias.map((d) => d.id));
  for (const m of datos.movimientos) {
    if (m.creado) activos.add(fechaLocal(new Date(m.creado)));
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

  return { actual, mejor, registradoHoy, semana };
}

// ---------- Dibujar la pantalla ----------

function dibujar() {
  dibujarRacha();
  dibujarTotal();
  dibujarMetas();

  const mes = $('#mes').value; // "AAAA-MM"
  const delMes = datos.movimientos
    .filter((m) => m.fecha.startsWith(mes))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);

  const ingresos = sumar(delMes.filter((m) => m.tipo === 'ingreso' && m.categoria !== SALDO_INICIAL));
  const gastos = sumar(delMes.filter((m) => m.tipo === 'gasto'));
  const apartado = sumar(delMes.filter((m) => m.tipo === 'ahorro'));
  const balance = ingresos - gastos;

  $('#total-ingresos').textContent = dinero.format(ingresos);
  $('#total-gastos').textContent = dinero.format(gastos);
  $('#balance').textContent = dinero.format(balance);
  $('#balance').classList.toggle('negativo', balance < 0);
  $('#apartado-mes').textContent = apartado > 0 ? `Apartaste ${dinero.format(apartado)} para tus metas` : '';

  dibujarCategorias(delMes, gastos);
  dibujarLista(delMes);
}

function dibujarRacha() {
  const { actual, mejor, registradoHoy, semana } = calcularRacha();

  $('#racha-dias').textContent = `🔥 ${actual} ${actual === 1 ? 'día' : 'días'}`;
  $('#racha-dias').classList.toggle('apagada', actual === 0);
  $('#racha-mejor').textContent = mejor > 0 ? `Mejor racha: ${mejor}` : '';

  $('#racha-semana').replaceChildren(
    ...semana.map(({ dia, activo, esHoy }) => {
      const li = document.createElement('li');
      li.className = [activo && 'activo', esHoy && 'hoy'].filter(Boolean).join(' ');
      li.textContent = aFecha(dia).toLocaleDateString('es-MX', { weekday: 'narrow' });
      li.title = fechaBonita(dia);
      return li;
    })
  );

  let mensaje;
  if (registradoHoy) mensaje = '✅ Ya registraste hoy. ¡Sigue así mañana!';
  else if (actual > 0) mensaje = 'Registra algo hoy para no perder tu racha.';
  else mensaje = 'Registra algo hoy para empezar tu racha.';
  $('#racha-mensaje').textContent = mensaje;
  $('#sin-movimientos').hidden = registradoHoy;
}

function dibujarTotal() {
  const total = datos.movimientos.reduce((t, m) => t + efecto(m), 0);
  const enMetas = sumar(datos.movimientos.filter((m) => m.tipo === 'ahorro'));

  $('#total-dinero').textContent = dinero.format(total);
  $('#total-dinero').classList.toggle('negativo', total < 0);
  $('#total-disponible').textContent = dinero.format(total - enMetas);
  $('#total-metas').textContent = dinero.format(enMetas);
  $('#pista-saldo').hidden = datos.movimientos.some((m) => m.categoria === SALDO_INICIAL);
}

function dibujarMetas() {
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

    const li = document.createElement('li');
    li.className = 'tarjeta meta' + (cumplida ? ' cumplida' : '');
    li.innerHTML = `
      <div class="fila"><strong></strong><span class="meta-acciones"></span></div>
      <div class="barra"><div style="width:${avance}%"></div></div>
      <small></small>`;
    li.querySelector('strong').textContent = (cumplida ? '🎉 ' : '🎯 ') + meta.nombre;
    li.querySelector('small').textContent = cumplida
      ? `¡Meta cumplida! ${dinero.format(ahorrado)} de ${dinero.format(meta.objetivo)}`
      : `${dinero.format(ahorrado)} de ${dinero.format(meta.objetivo)} · ${avance}% · faltan ${dinero.format(meta.objetivo - ahorrado)}`;

    const aportar = document.createElement('button');
    aportar.type = 'button';
    aportar.className = 'enlace';
    aportar.textContent = 'Aportar';
    aportar.addEventListener('click', () => abrirFormulario({ tipo: 'ahorro', meta: meta.id }));

    li.querySelector('.meta-acciones').append(
      aportar,
      botonBorrar(`Meta borrada: ${meta.nombre}`, () => borrar('metas', meta.id))
    );
    ul.append(li);
  }
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
    li.innerHTML = `
      <div class="fila"><span></span><span>${dinero.format(monto)} · ${porcentaje}%</span></div>
      <div class="barra"><div style="width:${porcentaje}%"></div></div>`;
    li.querySelector('.fila span').textContent = categoria;
    ul.append(li);
  }
}

function dibujarLista(delMes) {
  const ul = $('#lista');
  ul.replaceChildren();
  if (delMes.length === 0) {
    ul.append(vacio('Aún no hay movimientos este mes. Toca + para agregar uno.'));
    return;
  }
  const signos = { gasto: '−', ingreso: '+', ahorro: '→ ' };
  for (const m of delMes) {
    const li = document.createElement('li');
    li.className = m.tipo;

    const info = document.createElement('div');
    const titulo = document.createElement('strong');
    titulo.textContent = m.tipo === 'ahorro' ? `🎯 ${m.categoria}` : m.categoria;
    const detalle = document.createElement('small');
    detalle.textContent = [fechaBonita(m.fecha), m.nota].filter(Boolean).join(' · ');
    info.append(titulo, detalle);

    const monto = document.createElement('span');
    monto.className = 'monto';
    monto.textContent = signos[m.tipo] + dinero.format(m.monto);

    li.append(info, monto, botonBorrar(`Borrado: ${m.categoria} ${dinero.format(m.monto)}`, () => borrar('movimientos', m.id)));
    ul.append(li);
  }
}

// La × pide confirmación en el mismo botón: primer toque "¿Borrar?", segundo toque borra.
function botonBorrar(textoAviso, alBorrar) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'borrar';
  boton.setAttribute('aria-label', 'Borrar');
  boton.textContent = '×';
  let regresar;
  boton.addEventListener('click', () => {
    if (boton.classList.contains('confirmar')) {
      clearTimeout(regresar);
      alBorrar();
      avisar(textoAviso);
      return;
    }
    boton.classList.add('confirmar');
    boton.textContent = '¿Borrar?';
    regresar = setTimeout(() => {
      boton.classList.remove('confirmar');
      boton.textContent = '×';
    }, 3000);
  });
  return boton;
}

function vacio(texto) {
  const li = document.createElement('li');
  li.className = 'vacio';
  li.textContent = texto;
  return li;
}

// Mensaje corto que aparece abajo unos segundos.
let ocultarAviso;
function avisar(texto) {
  const aviso = $('#aviso');
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(ocultarAviso);
  ocultarAviso = setTimeout(() => (aviso.hidden = true), 3500);
}

// ---------- Formulario de movimientos ----------

// Para ahorros, la "categoría" es la meta a la que va el dinero.
function llenarCategorias() {
  const tipo = $('#form').tipo.value;
  const select = $('#categoria');
  $('#etiqueta-categoria').textContent = tipo === 'ahorro' ? 'Meta' : 'Categoría';
  if (tipo === 'ahorro') {
    select.replaceChildren(...datos.metas.map((meta) => new Option(meta.nombre, meta.id)));
    if (datos.metas.length === 0) select.append(new Option('Primero crea una meta', ''));
  } else {
    select.replaceChildren(...CATEGORIAS[tipo].map((c) => new Option(c, c)));
  }
}

// Abre el formulario; si viene algo prellenado (de la IA o de "Aportar"), lo deja listo para revisar.
function abrirFormulario(prellenado = {}) {
  const form = $('#form');
  form.reset();
  form.tipo.value = prellenado.tipo || 'gasto';
  llenarCategorias();
  form.fecha.value = prellenado.fecha || hoy();
  if (prellenado.monto) form.monto.value = prellenado.monto;
  if (prellenado.nota) form.nota.value = prellenado.nota;
  if (prellenado.meta) form.categoria.value = prellenado.meta;
  if (prellenado.categoria) {
    form.categoria.value = CATEGORIAS[form.tipo.value]?.includes(prellenado.categoria) ? prellenado.categoria : 'Otros';
  }
  $('#dialogo').showModal();
  if (!prellenado.monto) form.monto.focus();
}

$('#abrir-form').addEventListener('click', () => abrirFormulario());
$('#cancelar').addEventListener('click', () => $('#dialogo').close());

for (const radio of document.querySelectorAll('input[name="tipo"]')) {
  radio.addEventListener('change', llenarCategorias);
}

$('#form').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const form = evento.target;
  const tipo = form.tipo.value;
  const meta = tipo === 'ahorro' ? datos.metas.find((x) => x.id === form.categoria.value) : null;
  if (tipo === 'ahorro' && !meta) {
    avisar('Primero crea una meta en "Mis metas"');
    return;
  }
  agregar('movimientos', {
    id: crypto.randomUUID(),
    tipo,
    monto: Math.round(Number(form.monto.value) * 100) / 100,
    categoria: meta ? meta.nombre : form.categoria.value,
    nota: form.nota.value.trim(),
    fecha: form.fecha.value,
    creado: Date.now(),
    meta: meta ? meta.id : '',
  });
  $('#mes').value = form.fecha.value.slice(0, 7); // muestra el mes del movimiento nuevo
  $('#dialogo').close();
  dibujar();
});

$('#mes').addEventListener('change', dibujar);

// ---------- Racha ----------

$('#sin-movimientos').addEventListener('click', () => {
  agregar('dias', { id: hoy(), creado: Date.now() });
  avisar('🔥 ¡Día registrado! Tu racha sigue.');
});

// ---------- Metas ----------

$('#nueva-meta').addEventListener('click', () => {
  $('#form-meta').reset();
  $('#dialogo-meta').showModal();
});

$('#cancelar-meta').addEventListener('click', () => $('#dialogo-meta').close());

$('#form-meta').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const form = evento.target;
  agregar('metas', {
    id: crypto.randomUUID(),
    nombre: form.nombre.value.trim(),
    objetivo: Math.round(Number(form.objetivo.value) * 100) / 100,
    creado: Date.now(),
  });
  $('#dialogo-meta').close();
  avisar('🎯 Meta creada. Toca "Aportar" cuando apartes dinero para ella.');
});

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
  boton.textContent = 'Pensando…';
  try {
    const { movimiento } = await llamarNube({
      accion: 'interpretar',
      texto: form.texto.value,
      categorias: CATEGORIAS,
      hoy: hoy(),
    });
    form.reset();
    abrirFormulario(movimiento);
  } catch (error) {
    avisar(explicarError(error));
  } finally {
    boton.disabled = false;
    boton.textContent = 'Listo';
  }
});

// ---------- Ajustes de la nube ----------

$('#abrir-ajustes').addEventListener('click', () => {
  const form = $('#form-ajustes');
  form.url.value = nube?.url || '';
  form.clave.value = nube?.clave || '';
  $('#dialogo-ajustes').showModal();
});

$('#cancelar-ajustes').addEventListener('click', () => $('#dialogo-ajustes').close());

$('#form-ajustes').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const form = evento.target;
  const estabaConectada = Boolean(nube);
  nube = form.url.value.trim() ? { url: form.url.value.trim(), clave: form.clave.value } : null;
  escribir(CLAVE_NUBE, nube);
  $('#dialogo-ajustes').close();

  if (!nube) {
    pendientes = [];
    escribir(CLAVE_PENDIENTES, pendientes);
    mostrarIA();
    mostrarEstado('Solo en este teléfono. Toca ⚙ para guardar en la nube.');
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

// ---------- Respaldo ----------

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

// ---------- Arranque ----------

$('#mes').value = hoy().slice(0, 7);
dibujar();
mostrarIA();
if (nube) {
  sincronizar();
} else {
  mostrarEstado('Solo en este teléfono. Toca ⚙ para guardar en la nube.');
}

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
