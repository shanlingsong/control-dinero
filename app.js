// Mi Dinero: registra ingresos y gastos, los guarda en el teléfono y los sube a la nube (Google Sheets).

// Categorías disponibles para cada tipo de movimiento. Puedes agregar o quitar las que quieras.
const CATEGORIAS = {
  gasto: ['Comida', 'Transporte', 'Casa', 'Servicios', 'Salud', 'Diversión', 'Ropa', 'Otros'],
  ingreso: ['Sueldo', 'Ventas', 'Negocio', 'Regalo', 'Otros'],
};

// Nombres con los que se guardan los datos en el navegador (localStorage).
const CLAVE = 'mi-dinero:movimientos';
const CLAVE_NUBE = 'mi-dinero:nube';
const CLAVE_PENDIENTES = 'mi-dinero:pendientes';

const $ = (selector) => document.querySelector(selector);
const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

let movimientos = leer(CLAVE, []);
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

// Fecha de hoy como "AAAA-MM-DD" en la hora local.
function hoy() {
  return new Date().toLocaleDateString('en-CA');
}

// ---------- Nube ----------

// Manda una petición al servidor de Google. Se usa texto simple para que el navegador lo permita.
async function llamarNube(peticion) {
  const respuesta = await fetch(nube.url, {
    method: 'POST',
    body: JSON.stringify({ ...peticion, clave: nube.clave }),
  });
  const datos = await respuesta.json();
  if (datos.error) throw new Error(datos.error);
  return datos;
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
    // 2. Descarga la lista completa: la nube es la fuente de verdad.
    const { movimientos: deLaNube } = await llamarNube({ accion: 'listar' });
    movimientos = deLaNube;
    escribir(CLAVE, movimientos);
    dibujar();
    mostrarEstado('☁ Guardado en la nube');
  } catch (error) {
    const sinInternet = error instanceof TypeError;
    mostrarEstado(sinInternet ? 'Sin conexión: se subirá cuando vuelva el internet' : 'Error de la nube: ' + error.message, true);
  } finally {
    sincronizando = false;
  }
}

function mostrarEstado(texto, problema = false) {
  const estado = $('#estado');
  estado.textContent = texto;
  estado.classList.toggle('problema', problema);
}

// ---------- Agregar y borrar ----------

function agregarMovimiento(m) {
  movimientos.push(m);
  escribir(CLAVE, movimientos);
  encolar({ accion: 'agregar', movimiento: m });
  dibujar();
  sincronizar();
}

function borrarMovimiento(id) {
  movimientos = movimientos.filter((m) => m.id !== id);
  escribir(CLAVE, movimientos);
  encolar({ accion: 'borrar', id });
  dibujar();
  sincronizar();
}

// ---------- Dibujar la pantalla ----------

function dibujar() {
  const mes = $('#mes').value; // "AAAA-MM"
  const delMes = movimientos
    .filter((m) => m.fecha.startsWith(mes))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);

  const sumar = (tipo) => delMes.filter((m) => m.tipo === tipo).reduce((total, m) => total + m.monto, 0);
  const ingresos = sumar('ingreso');
  const gastos = sumar('gasto');
  const balance = ingresos - gastos;

  $('#total-ingresos').textContent = dinero.format(ingresos);
  $('#total-gastos').textContent = dinero.format(gastos);
  $('#balance').textContent = dinero.format(balance);
  $('#balance').classList.toggle('negativo', balance < 0);

  dibujarCategorias(delMes, gastos);
  dibujarLista(delMes);
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
    ul.append(vacio('Aún no hay movimientos. Toca + o escribe arriba para agregar uno.'));
    return;
  }
  for (const m of delMes) {
    const li = document.createElement('li');
    li.className = m.tipo;

    const info = document.createElement('div');
    const titulo = document.createElement('strong');
    titulo.textContent = m.categoria;
    const detalle = document.createElement('small');
    detalle.textContent = [fechaBonita(m.fecha), m.nota].filter(Boolean).join(' · ');
    info.append(titulo, detalle);

    const monto = document.createElement('span');
    monto.className = 'monto';
    monto.textContent = (m.tipo === 'gasto' ? '−' : '+') + dinero.format(m.monto);

    li.append(info, monto, botonBorrar(m));
    ul.append(li);
  }
}

// La × pide confirmación en el mismo botón: primer toque "¿Borrar?", segundo toque borra.
function botonBorrar(m) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'borrar';
  boton.setAttribute('aria-label', 'Borrar movimiento');
  boton.textContent = '×';
  let regresar;
  boton.addEventListener('click', () => {
    if (boton.classList.contains('confirmar')) {
      clearTimeout(regresar);
      borrarMovimiento(m.id);
      avisar(`Borrado: ${m.categoria} ${dinero.format(m.monto)}`);
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

// "2026-10-25" → "sáb, 25 oct"
function fechaBonita(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
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

// ---------- Formulario ----------

function llenarCategorias() {
  const tipo = $('#form').tipo.value;
  $('#categoria').replaceChildren(...CATEGORIAS[tipo].map((c) => new Option(c, c)));
}

// Abre el formulario; si viene un movimiento (de la IA), lo deja prellenado para revisarlo.
function abrirFormulario(prellenado) {
  const form = $('#form');
  form.reset();
  form.fecha.value = hoy();
  if (prellenado) {
    form.tipo.value = prellenado.tipo;
    llenarCategorias();
    form.monto.value = prellenado.monto;
    form.categoria.value = CATEGORIAS[prellenado.tipo].includes(prellenado.categoria) ? prellenado.categoria : 'Otros';
    form.nota.value = prellenado.nota;
    form.fecha.value = prellenado.fecha;
  } else {
    llenarCategorias();
  }
  $('#dialogo').showModal();
  if (!prellenado) form.monto.focus();
}

$('#abrir-form').addEventListener('click', () => abrirFormulario());
$('#cancelar').addEventListener('click', () => $('#dialogo').close());

for (const radio of document.querySelectorAll('input[name="tipo"]')) {
  radio.addEventListener('change', llenarCategorias);
}

$('#form').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const form = evento.target;
  agregarMovimiento({
    id: crypto.randomUUID(),
    tipo: form.tipo.value,
    monto: Math.round(Number(form.monto.value) * 100) / 100,
    categoria: form.categoria.value,
    nota: form.nota.value.trim(),
    fecha: form.fecha.value,
    creado: Date.now(),
  });
  $('#mes').value = form.fecha.value.slice(0, 7); // muestra el mes del movimiento nuevo
  $('#dialogo').close();
  dibujar();
});

$('#mes').addEventListener('change', dibujar);

// ---------- IA: escribir en lenguaje normal ----------

$('#form-ia').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const form = evento.target;
  if (!nube) {
    avisar('Primero conecta la nube con el botón ⚙');
    return;
  }
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
    avisar(error instanceof TypeError ? 'Sin conexión: la IA necesita internet' : error.message);
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
    mostrarEstado('Solo en este teléfono. Toca ⚙ para guardar en la nube.');
    return;
  }
  // La primera vez, sube lo que ya había en el teléfono.
  if (!estabaConectada) {
    for (const m of movimientos) encolar({ accion: 'agregar', movimiento: m });
  }
  sincronizar();
});

// ---------- Respaldo ----------

$('#exportar').addEventListener('click', () => {
  const archivo = new Blob([JSON.stringify(movimientos, null, 2)], { type: 'application/json' });
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
    const datos = JSON.parse(await archivo.text());
    if (!Array.isArray(datos)) throw new Error('formato');
    const existentes = new Set(movimientos.map((m) => m.id));
    const nuevos = datos.filter((m) => m.id && !existentes.has(m.id));
    movimientos.push(...nuevos);
    escribir(CLAVE, movimientos);
    for (const m of nuevos) encolar({ accion: 'agregar', movimiento: m });
    dibujar();
    sincronizar();
    avisar(`Se agregaron ${nuevos.length} movimientos del respaldo`);
  } catch {
    avisar('Ese archivo no parece un respaldo de Mi Dinero.');
  }
});

// ---------- Arranque ----------

$('#mes').value = hoy().slice(0, 7);
dibujar();
if (nube) {
  sincronizar();
} else {
  mostrarEstado('Solo en este teléfono. Toca ⚙ para guardar en la nube.');
}

// Al volver a abrir la app, trae lo más nuevo de la nube.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sincronizar();
});
window.addEventListener('online', sincronizar);

// Permite instalar la app en el teléfono y abrirla sin internet.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js');
}
