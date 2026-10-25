// Mi Dinero: registra ingresos y gastos y los guarda en el navegador del teléfono.

// Categorías disponibles para cada tipo de movimiento. Puedes agregar o quitar las que quieras.
const CATEGORIAS = {
  gasto: ['Comida', 'Transporte', 'Casa', 'Servicios', 'Salud', 'Diversión', 'Ropa', 'Otros'],
  ingreso: ['Sueldo', 'Ventas', 'Negocio', 'Regalo', 'Otros'],
};

// Nombre con el que se guardan los datos en el navegador (localStorage).
const CLAVE = 'mi-dinero:movimientos';

const $ = (selector) => document.querySelector(selector);
const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

let movimientos = cargar();

// ---------- Guardar y cargar ----------

function cargar() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) || [];
  } catch {
    return [];
  }
}

function guardar() {
  localStorage.setItem(CLAVE, JSON.stringify(movimientos));
}

// Fecha de hoy como "AAAA-MM-DD" en la hora local.
function hoy() {
  return new Date().toLocaleDateString('en-CA');
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
    ul.append(vacio('Aún no hay movimientos. Toca + para agregar uno.'));
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

    const borrar = document.createElement('button');
    borrar.type = 'button';
    borrar.className = 'borrar';
    borrar.setAttribute('aria-label', 'Borrar movimiento');
    borrar.textContent = '×';
    borrar.addEventListener('click', () => {
      if (!confirm(`¿Borrar ${m.categoria} de ${dinero.format(m.monto)}?`)) return;
      movimientos = movimientos.filter((x) => x.id !== m.id);
      guardar();
      dibujar();
    });

    li.append(info, monto, borrar);
    ul.append(li);
  }
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

// ---------- Formulario ----------

function llenarCategorias() {
  const tipo = $('#form').tipo.value;
  $('#categoria').replaceChildren(...CATEGORIAS[tipo].map((c) => new Option(c, c)));
}

$('#abrir-form').addEventListener('click', () => {
  const form = $('#form');
  form.reset();
  form.fecha.value = hoy();
  llenarCategorias();
  $('#dialogo').showModal();
  form.monto.focus();
});

$('#cancelar').addEventListener('click', () => $('#dialogo').close());

for (const radio of document.querySelectorAll('input[name="tipo"]')) {
  radio.addEventListener('change', llenarCategorias);
}

$('#form').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const form = evento.target;
  movimientos.push({
    id: crypto.randomUUID(),
    tipo: form.tipo.value,
    monto: Math.round(Number(form.monto.value) * 100) / 100,
    categoria: form.categoria.value,
    nota: form.nota.value.trim(),
    fecha: form.fecha.value,
    creado: Date.now(),
  });
  guardar();
  $('#mes').value = form.fecha.value.slice(0, 7); // muestra el mes del movimiento nuevo
  $('#dialogo').close();
  dibujar();
});

$('#mes').addEventListener('change', dibujar);

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
    if (!confirm(`Esto reemplaza tus datos actuales con ${datos.length} movimientos del respaldo. ¿Continuar?`)) return;
    movimientos = datos;
    guardar();
    dibujar();
  } catch {
    alert('Ese archivo no parece un respaldo de Mi Dinero.');
  }
});

// ---------- Arranque ----------

$('#mes').value = hoy().slice(0, 7);
dibujar();

// Permite instalar la app en el teléfono y abrirla sin internet.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js');
}
