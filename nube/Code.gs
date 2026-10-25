// Servidor de Mi Dinero en Google Apps Script.
// Guarda los movimientos en esta hoja de cálculo y usa a Claude para entender texto escrito normal.
//
// Necesita dos "propiedades del script" (Configuración del proyecto → Propiedades del script):
//   CLAVE_APP          una contraseña que tú inventas; la app la manda en cada petición
//   ANTHROPIC_API_KEY  tu llave de la API de Claude (solo para la función de IA)

const HOJA = 'Movimientos';
const COLUMNAS = ['id', 'tipo', 'monto', 'categoria', 'nota', 'fecha', 'creado'];

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

  try {
    switch (peticion.accion) {
      case 'listar':
        // "ia" le dice a la app si debe mostrar la caja para escribir con IA
        return responder({ movimientos: listar(), ia: Boolean(props.getProperty('ANTHROPIC_API_KEY')) });
      case 'agregar':
        conCandado(() => agregar(peticion.movimiento));
        return responder({ ok: true });
      case 'borrar':
        conCandado(() => borrar(peticion.id));
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

function hoja() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName(HOJA);
  if (!h) {
    h = libro.insertSheet(HOJA);
    h.appendRow(COLUMNAS);
    h.setFrozenRows(1);
    // id y fecha como texto, para que Sheets no las convierta en otra cosa
    h.getRange('A:A').setNumberFormat('@');
    h.getRange('F:F').setNumberFormat('@');
  }
  return h;
}

function listar() {
  const filas = hoja().getDataRange().getValues().slice(1);
  return filas
    .filter((f) => f[0])
    .map((f) => ({
      id: String(f[0]),
      tipo: f[1],
      monto: Number(f[2]),
      categoria: f[3],
      nota: f[4],
      fecha: f[5] instanceof Date ? Utilities.formatDate(f[5], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(f[5]),
      creado: Number(f[6]),
    }));
}

function agregar(m) {
  const h = hoja();
  const ids = h.getRange('A:A').getValues().flat().map(String);
  if (ids.includes(String(m.id))) return; // ya estaba guardado
  h.appendRow([m.id, m.tipo, m.monto, m.categoria, m.nota || '', m.fecha, m.creado]);
}

function borrar(id) {
  const h = hoja();
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
