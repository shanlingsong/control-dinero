// Servidor de Mi Dinero en Google Apps Script.
// Guarda movimientos, metas, días registrados y pagos pendientes en esta hoja de cálculo,
// usa a Claude para entender texto escrito normal y manda resúmenes por Telegram.
//
// Propiedades del script (Configuración del proyecto → Propiedades del script):
//   CLAVE_APP          una contraseña que tú inventas; la app la manda en cada petición
//   ANTHROPIC_API_KEY  (opcional) tu llave de la API de Claude, para escribir con IA
//   TELEGRAM_TOKEN     (opcional) el token de tu bot de Telegram, para recordatorios y resúmenes
//   TELEGRAM_CHAT_ID   se llena solo al correr configurarTelegram()

const ZONA = 'America/Mexico_City';
const URL_APP = 'https://shanlingsong.github.io/control-dinero/';
const SALDO_INICIAL = 'Saldo inicial';

// Cada colección es una pestaña de la hoja.
// "texto" son las columnas que se guardan como texto para que Sheets no las convierta en fechas o números.
const COLECCIONES = {
  movimientos: {
    hoja: 'Movimientos',
    columnas: ['id', 'tipo', 'monto', 'categoria', 'nota', 'fecha', 'creado', 'meta'],
    numeros: ['monto', 'creado'],
    texto: ['A:A', 'F:F', 'H:H'],
  },
  metas: { hoja: 'Metas', columnas: ['id', 'nombre', 'objetivo', 'creado'], numeros: ['objetivo', 'creado'], texto: ['A:A'] },
  dias: { hoja: 'Dias', columnas: ['id', 'creado'], numeros: ['creado'], texto: ['A:A'] },
  pendientes: {
    hoja: 'Pagos pendientes',
    columnas: ['id', 'tipo', 'persona', 'monto', 'fecha', 'nota', 'creado'],
    numeros: ['monto', 'creado'],
    texto: ['A:A', 'E:E'],
  },
};

// La app manda todas las peticiones aquí, como texto JSON.
function doPost(e) {
  let peticion;
  try {
    peticion = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ error: 'Petición inválida' });
  }

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CLAVE_APP') || peticion.clave !== props.getProperty('CLAVE_APP')) {
    return responder({ error: 'Clave incorrecta' });
  }

  // Las versiones anteriores de la app solo mandaban "movimiento"
  const coleccion = peticion.coleccion || 'movimientos';
  const objeto = peticion.objeto || peticion.movimiento;

  try {
    switch (peticion.accion) {
      case 'listar':
        return responder({
          movimientos: leerTodo('movimientos'),
          metas: leerTodo('metas'),
          dias: leerTodo('dias'),
          pendientes: leerTodo('pendientes'),
          // "ia" le dice a la app si debe mostrar la caja para escribir con IA
          ia: Boolean(props.getProperty('ANTHROPIC_API_KEY')),
        });
      case 'agregar':
        conCandado(() => agregar(coleccion, objeto));
        return responder({ ok: true });
      case 'borrar':
        conCandado(() => borrar(coleccion, peticion.id));
        return responder({ ok: true });
      case 'interpretar':
        return responder({ movimiento: interpretar(peticion.texto, peticion.categorias, peticion.hoy) });
      default:
        return responder({ error: 'Acción desconocida' });
    }
  } catch (err) {
    return responder({ error: String(err.message || err) });
  }
}

function responder(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
}

// Evita que dos peticiones escriban en la hoja al mismo tiempo.
function conCandado(fn) {
  const candado = LockService.getScriptLock();
  candado.waitLock(10000);
  try {
    fn();
  } finally {
    candado.releaseLock();
  }
}

// ---------- Hoja de cálculo ----------

function config(nombre) {
  const c = COLECCIONES[nombre];
  if (!c) throw new Error('Colección desconocida: ' + nombre);
  return c;
}

function hoja(nombre) {
  const c = config(nombre);
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName(c.hoja);
  if (!h) {
    h = libro.insertSheet(c.hoja);
    h.setFrozenRows(1);
  }
  // Pone los encabezados (también agrega columnas nuevas a hojas viejas)
  const encabezado = h.getRange(1, 1, 1, c.columnas.length);
  if (encabezado.getValues()[0].join() !== c.columnas.join()) {
    encabezado.setValues([c.columnas]);
    c.texto.forEach((rango) => h.getRange(rango).setNumberFormat('@'));
  }
  return h;
}

function leerTodo(nombre) {
  const c = config(nombre);
  const filas = hoja(nombre).getDataRange().getValues().slice(1);
  return filas
    .filter((f) => f[0] !== '')
    .map((f) => {
      const objeto = {};
      c.columnas.forEach((columna, i) => {
        let valor = f[i] === undefined ? '' : f[i];
        if (valor instanceof Date) valor = Utilities.formatDate(valor, ZONA, 'yyyy-MM-dd');
        objeto[columna] = c.numeros.includes(columna) ? Number(valor) : String(valor);
      });
      return objeto;
    });
}

function agregar(nombre, objeto) {
  const c = config(nombre);
  const h = hoja(nombre);
  const ids = h.getRange('A:A').getValues().flat().map(String);
  if (ids.includes(String(objeto.id))) return; // ya estaba guardado
  h.appendRow(c.columnas.map((columna) => (objeto[columna] === undefined ? '' : objeto[columna])));
}

function borrar(nombre, id) {
  const h = hoja(nombre);
  const ids = h.getRange('A:A').getValues().flat().map(String);
  const fila = ids.indexOf(String(id));
  if (fila > 0) h.deleteRow(fila + 1);
}

// ---------- IA: convertir texto en un movimiento ----------

function interpretar(texto, categorias, hoy) {
  const llave = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!llave) throw new Error('Falta configurar ANTHROPIC_API_KEY en el servidor');

  const esquema = {
    type: 'object',
    properties: {
      tipo: { type: 'string', enum: ['gasto', 'ingreso'] },
      monto: { type: 'number', description: 'Cantidad en pesos mexicanos, siempre positiva' },
      categoria: { type: 'string', enum: [...new Set([...categorias.gasto, ...categorias.ingreso])] },
      nota: { type: 'string', description: 'Descripción corta, por ejemplo "tacos" o "gasolina"' },
      fecha: { type: 'string', description: 'Fecha en formato AAAA-MM-DD' },
    },
    required: ['tipo', 'monto', 'categoria', 'nota', 'fecha'],
    additionalProperties: false,
  };

  const instrucciones =
    'Conviertes lo que una persona escribe sobre su dinero en un movimiento para su app de finanzas personales. ' +
    `Hoy es ${hoy}. Si no menciona fecha, usa hoy; entiende "ayer", "el lunes", etc. ` +
    `Categorías de gasto: ${categorias.gasto.join(', ')}. ` +
    `Categorías de ingreso: ${categorias.ingreso.join(', ')}. ` +
    'Elige una categoría que corresponda al tipo; si ninguna encaja, usa "Otros".';

  const respuesta = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-api-key': llave,
      'anthropic-version': '2026-10-21',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    payload: JSON.stringify({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: esquema } },
      system: instrucciones,
      messages: [{ role: 'user', content: texto }],
    }),
  });

  const datos = JSON.parse(respuesta.getContentText());
  if (respuesta.getResponseCode() !== 200) {
    throw new Error('Error de la API de Claude: ' + (datos.error ? datos.error.message : respuesta.getResponseCode()));
  }
  if (datos.stop_reason === 'refusal') throw new Error('Claude no pudo procesar ese texto');

  const bloque = datos.content.find((b) => b.type === 'text');
  return JSON.parse(bloque.text);
}

// ---------- Fechas, dinero y racha ----------

function fechaHoy() {
  return Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
}

// Suma (o resta) días a una fecha "AAAA-MM-DD".
function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  return Utilities.formatDate(new Date(Date.UTC(a, m - 1, d + dias)), 'UTC', 'yyyy-MM-dd');
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// "2026-10-25" → "25 oct"
function fechaCorta(fecha) {
  const [, m, d] = fecha.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

// 1234.5 → "$1,234.50"
function pesos(cantidad) {
  const signo = cantidad < 0 ? '-' : '';
  const [enteros, centavos] = Math.abs(cantidad).toFixed(2).split('.');
  return `${signo}$${enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${centavos}`;
}

function escapar(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Un día cuenta para la racha si registraste algo ese día (movimiento, meta o pago) o marcaste "hoy no tuve movimientos".
function diasActivos() {
  const activos = new Set(leerTodo('dias').map((d) => d.id));
  [...leerTodo('movimientos'), ...leerTodo('metas'), ...leerTodo('pendientes')].forEach((x) => {
    if (x.creado) activos.add(Utilities.formatDate(new Date(x.creado), ZONA, 'yyyy-MM-dd'));
  });
  return activos;
}

// Cuántos días faltan para una fecha (negativo si ya pasó).
function diasEntre(desde, hasta) {
  const aUTC = (fecha) => {
    const [a, m, d] = fecha.split('-').map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((aUTC(hasta) - aUTC(desde)) / 86400000);
}

// "Darío · $100.00 · mañana"
function lineaPago(p, hoy) {
  const dias = diasEntre(hoy, p.fecha);
  let cuando;
  if (dias < -1) cuando = `venció hace ${-dias} días`;
  else if (dias === -1) cuando = 'venció ayer';
  else if (dias === 0) cuando = 'es hoy';
  else if (dias === 1) cuando = 'mañana';
  else cuando = `${fechaCorta(p.fecha)} (en ${dias} días)`;
  const nota = p.nota ? ` — ${escapar(p.nota)}` : '';
  return `• <b>${escapar(p.persona)}</b> · ${pesos(p.monto)} · ${cuando}${nota}`;
}

function pagosHasta(pendientes, tipo, hasta) {
  return pendientes.filter((p) => p.tipo === tipo && p.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function contarRacha(activos, desde) {
  let n = 0;
  let dia = desde;
  while (activos.has(dia)) {
    n++;
    dia = sumarDias(dia, -1);
  }
  return n;
}

// Lo que un movimiento cambia tu dinero total. Ahorrar no lo cambia: solo lo aparta.
function efecto(m) {
  if (m.tipo === 'ingreso') return m.monto;
  if (m.tipo === 'gasto') return -m.monto;
  return 0;
}

const sumar = (lista) => lista.reduce((total, m) => total + m.monto, 0);

// ---------- Telegram ----------

function enviarTelegram(texto) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) throw new Error('Falta configurar Telegram: corre configurarTelegram()');
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
}

// Córrela una vez desde el editor (después de mandarle un mensaje a tu bot).
// Busca tu chat, guarda TELEGRAM_CHAT_ID y programa el recordatorio diario y el resumen de los domingos.
function configurarTelegram() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_TOKEN');
  if (!token) throw new Error('Primero agrega TELEGRAM_TOKEN en las propiedades del script');

  const respuesta = JSON.parse(UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getUpdates`).getContentText());
  const mensajes = (respuesta.result || []).filter((u) => u.message);
  if (mensajes.length === 0) throw new Error('Mándale cualquier mensaje a tu bot en Telegram y vuelve a correr esta función');
  props.setProperty('TELEGRAM_CHAT_ID', String(mensajes[mensajes.length - 1].message.chat.id));

  ScriptApp.getProjectTriggers()
    .filter((t) => ['resumenSemanal', 'recordatorioDiario'].includes(t.getHandlerFunction()))
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('recordatorioDiario').timeBased().everyDays(1).atHour(20).inTimezone(ZONA).create();
  ScriptApp.newTrigger('resumenSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(21).inTimezone(ZONA).create();

  enviarTelegram(
    '✅ <b>Mi Dinero está conectado</b>\n\n' +
      '• Cada noche (8 pm) te aviso si no has registrado nada, para que no pierdas tu racha, y de los pagos que vencen.\n' +
      '• Cada domingo (9 pm) te mando el resumen de tu semana.'
  );
}

// Se corre sola cada noche. Solo manda mensaje si hay algo que recordar:
// pagos que vencen mañana, hoy o ya vencieron, o que hoy no registraste nada.
function recordatorioDiario() {
  const hoy = fechaHoy();
  const partes = [];

  const pendientes = leerTodo('pendientes');
  const debo = pagosHasta(pendientes, 'debo', sumarDias(hoy, 1));
  const meDeben = pagosHasta(pendientes, 'me-deben', sumarDias(hoy, 1));
  if (debo.length > 0) partes.push('📌 <b>Pagos que tienes que hacer</b>\n' + debo.map((p) => lineaPago(p, hoy)).join('\n'));
  if (meDeben.length > 0) partes.push('💬 <b>Te tienen que pagar</b>\n' + meDeben.map((p) => lineaPago(p, hoy)).join('\n'));

  const activos = diasActivos();
  if (!activos.has(hoy)) {
    const racha = contarRacha(activos, sumarDias(hoy, -1));
    partes.push(
      racha > 0
        ? `🔥 Llevas <b>${racha} ${racha === 1 ? 'día' : 'días'} seguidos</b> registrando tu dinero.\n` +
            'Hoy todavía no anotas nada: entra antes de dormir para no perder tu racha.'
        : '📝 Hoy no has registrado nada en Mi Dinero. ¡Empieza una racha nueva!'
    );
  }

  if (partes.length === 0) return;
  enviarTelegram(`${partes.join('\n\n')}\n\n${URL_APP}`);
}

// Se corre sola cada domingo en la noche: resume los últimos 7 días (lunes a domingo).
function resumenSemanal() {
  const hoy = fechaHoy();
  const inicio = sumarDias(hoy, -6);
  const movimientos = leerTodo('movimientos');
  const metas = leerTodo('metas');

  const antes = movimientos.filter((m) => m.fecha < inicio);
  const semana = movimientos.filter((m) => m.fecha >= inicio && m.fecha <= hoy);

  const inicial = antes.reduce((t, m) => t + efecto(m), 0);
  const final = inicial + semana.reduce((t, m) => t + efecto(m), 0);
  const generado = sumar(semana.filter((m) => m.tipo === 'ingreso' && m.categoria !== SALDO_INICIAL));
  const gastado = sumar(semana.filter((m) => m.tipo === 'gasto'));
  const apartado = sumar(semana.filter((m) => m.tipo === 'ahorro'));

  const porCategoria = {};
  semana
    .filter((m) => m.tipo === 'gasto')
    .forEach((m) => (porCategoria[m.categoria] = (porCategoria[m.categoria] || 0) + m.monto));
  const top = Object.entries(porCategoria)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const activos = diasActivos();
  const diasRegistrados = [0, 1, 2, 3, 4, 5, 6].filter((i) => activos.has(sumarDias(inicio, i))).length;
  const racha = contarRacha(activos, activos.has(hoy) ? hoy : sumarDias(hoy, -1));

  const lineas = [
    `📊 <b>Tu semana en Mi Dinero</b>`,
    `${fechaCorta(inicio)} – ${fechaCorta(hoy)}`,
    '',
    `🏁 Empezaste con: <b>${pesos(inicial)}</b>`,
    `💵 Generaste: <b>+${pesos(generado)}</b>`,
    `💸 Gastaste: <b>−${pesos(gastado)}</b>`,
  ];
  if (apartado > 0) lineas.push(`🎯 Apartaste para metas: <b>${pesos(apartado)}</b>`);
  lineas.push(`🏦 Terminaste con: <b>${pesos(final)}</b> (${final - inicial >= 0 ? '+' : ''}${pesos(final - inicial)})`);

  if (top.length > 0) {
    lineas.push('', '<b>En qué gastaste más</b>');
    top.forEach(([categoria, monto]) => lineas.push(`• ${escapar(categoria)}: ${pesos(monto)}`));
  }

  if (metas.length > 0) {
    lineas.push('', '<b>Tus metas</b>');
    metas.forEach((meta) => {
      const ahorrado = sumar(movimientos.filter((m) => m.tipo === 'ahorro' && m.meta === meta.id));
      const avance = Math.min(100, Math.round((ahorrado / meta.objetivo) * 100));
      lineas.push(`• ${escapar(meta.nombre)}: ${pesos(ahorrado)} de ${pesos(meta.objetivo)} (${avance}%)${avance >= 100 ? ' 🎉' : ''}`);
    });
  }

  const pendientes = leerTodo('pendientes');
  const proximaSemana = sumarDias(hoy, 7);
  const debo = pagosHasta(pendientes, 'debo', proximaSemana);
  const meDeben = pagosHasta(pendientes, 'me-deben', proximaSemana);
  if (debo.length > 0) {
    lineas.push('', '<b>📌 Pagos que tienes esta semana</b>');
    debo.forEach((p) => lineas.push(lineaPago(p, hoy)));
  }
  if (meDeben.length > 0) {
    lineas.push('', '<b>💬 Te tienen que pagar esta semana</b>');
    meDeben.forEach((p) => lineas.push(lineaPago(p, hoy)));
  }

  lineas.push('', `🔥 Racha: <b>${racha} ${racha === 1 ? 'día' : 'días'}</b> · Registraste ${diasRegistrados} de 7 días`);
  lineas.push('', URL_APP);

  enviarTelegram(lineas.join('\n'));
}

// Para probar: córrela desde el editor y te llega el resumen de los últimos 7 días al momento.
function probarResumen() {
  resumenSemanal();
}
