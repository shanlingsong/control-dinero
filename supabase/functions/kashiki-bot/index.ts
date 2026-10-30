// Kashiki Bot: los avisos de Telegram de cada usuario.
// Una sola Edge Function que hace 3 trabajos:
//   1. La app le pide un código para conectar Telegram (con la sesión del usuario).
//   2. Telegram le avisa cuando alguien le escribe al bot (el /start con el código conecta la cuenta).
//   3. pg_cron la llama cada noche (recordatorio) y cada domingo (resumen) para TODOS los usuarios conectados.
//
// Secretos que necesita (Edge Functions → Secrets):
//   TELEGRAM_TOKEN  el token de tu bot (el mismo que tenías en Apps Script)
//   BOT_SECRETO     una contraseña larga inventada; Telegram y pg_cron la mandan para demostrar que son ellos
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen puestos solos.
//
// Importante: en los detalles de la función hay que APAGAR "Verify JWT", porque Telegram y pg_cron no tienen sesión.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ZONA = 'America/Mexico_City';
const URL_APP = 'https://shanlingsong.github.io/control-dinero/';
const SALDO_INICIAL = 'Saldo inicial';
const MINUTOS_CODIGO = 30;

// Acepta el nombre con guion bajo o con guion medio (TELEGRAM_TOKEN o TELEGRAM-TOKEN).
const secreto = (nombre: string) => Deno.env.get(nombre) ?? Deno.env.get(nombre.replace('_', '-')) ?? '';
const TOKEN = secreto('TELEGRAM_TOKEN');
const SECRETO = secreto('BOT_SECRETO');
// db usa la llave de servicio: se salta las reglas RLS, por eso cada consulta filtra por user_id a mano.
const db = createClient(Deno.env.get('SUPABASE_URL')!, llaveDeServicio());

// Los proyectos nuevos traen la llave en SUPABASE_SECRET_KEYS; los viejos en SUPABASE_SERVICE_ROLE_KEY.
function llaveDeServicio() {
  try {
    const llaves = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const primera = llaves.default ?? Object.values(llaves)[0];
    if (primera) return String(primera);
  } catch {
    // no venía en ese formato; usamos la otra
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(datos: unknown, estado = 200) {
  return new Response(JSON.stringify(datos), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405);

  const cuerpo = await req.json().catch(() => ({}));
  // Telegram manda el secreto en este encabezado; pg_cron lo manda igual.
  const esConfiable = SECRETO !== '' && req.headers.get('x-telegram-bot-api-secret-token') === SECRETO;

  try {
    if (esConfiable && cuerpo.update_id !== undefined) {
      await atenderTelegram(cuerpo);
      return json({ ok: true });
    }
    if (esConfiable && cuerpo.tarea === 'diario') return json(await paraTodos(recordatorioDiario));
    if (esConfiable && cuerpo.tarea === 'semanal') return json(await paraTodos(resumenSemanal));
    if (esConfiable && cuerpo.tarea === 'configurar') return json(await configurar());

    // Lo demás lo pide la app: tiene que venir con la sesión del usuario.
    const usuario = await quienEs(req);
    if (!usuario) return json({ error: 'Inicia sesión primero' }, 401);
    if (cuerpo.accion === 'estado') return json(await estado(usuario));
    if (cuerpo.accion === 'codigo') return json(await nuevoCodigo(usuario));
    if (cuerpo.accion === 'desconectar') {
      await db.from('telegram').delete().eq('user_id', usuario);
      return json({ conectado: false });
    }
    return json({ error: 'No entendí qué quieres' }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: String(error) }, 500);
  }
});

// ---------- Conectar cuentas ----------

async function quienEs(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  return data.user?.id ?? null;
}

async function estado(usuario: string) {
  const { data } = await db.from('telegram').select('chat_id').eq('user_id', usuario).maybeSingle();
  return { conectado: Boolean(data?.chat_id), bot: await nombreDelBot() };
}

// El código va en el link t.me/<bot>?start=<código>. Al abrirlo, Telegram le manda "/start <código>" al bot.
async function nuevoCodigo(usuario: string) {
  const codigo = crypto.randomUUID().replaceAll('-', '');
  const { error } = await db
    .from('telegram')
    .upsert({ user_id: usuario, codigo, codigo_creado: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
  return { codigo, bot: await nombreDelBot() };
}

let botGuardado = '';
async function nombreDelBot() {
  if (!botGuardado) botGuardado = (await telegram('getMe', {})).result.username;
  return botGuardado;
}

async function atenderTelegram(update: any) {
  const mensaje = update.message;
  if (!mensaje?.text) return;
  const chatId = mensaje.chat.id;
  const [comando, codigo] = mensaje.text.trim().split(/\s+/);

  if (comando === '/start' && codigo) {
    const limite = new Date(Date.now() - MINUTOS_CODIGO * 60000).toISOString();
    const { data } = await db
      .from('telegram')
      .update({ chat_id: chatId, codigo: null, conectado: new Date().toISOString() })
      .eq('codigo', codigo)
      .gte('codigo_creado', limite)
      .select('user_id');
    if (data && data.length > 0) {
      await enviar(
        chatId,
        '✅ <b>Kashiki está conectado</b>\n\n' +
          '• Cada noche (8 pm) te aviso si no has registrado nada, para que no pierdas tu racha, y de los pagos que vencen.\n' +
          '• Cada domingo (9 pm) te mando el resumen de tu semana.'
      );
      return;
    }
    await enviar(chatId, 'Ese link ya caducó 😅 Abre Kashiki → Ajustes → <b>Conectar Telegram</b> para sacar uno nuevo.');
    return;
  }

  // Los comandos solo funcionan si este chat ya está conectado a una cuenta.
  const { data: dueno } = await db.from('telegram').select('user_id').eq('chat_id', chatId).limit(1).maybeSingle();
  if (!dueno) {
    await enviar(chatId, `Hola 👋 Soy el bot de Kashiki. Para recibir tus avisos abre Kashiki → Ajustes → <b>Conectar Telegram</b>.\n\n${URL_APP}`);
    return;
  }

  const responder = COMANDOS[comando.split('@')[0].toLowerCase()];
  if (!responder) {
    await enviar(chatId, AYUDA);
    return;
  }
  const hoy = fechaDe(Date.now());
  await enviar(chatId, responder(await leerDatos(dueno.user_id), hoy));
}

// Lo que le puedes pedir al bot cuando quieras. Telegram los muestra en el menú al escribir "/".
const COMANDOS: Record<string, (datos: Datos, hoy: string) => string> = {
  '/resumen': (datos, hoy) => resumen(datos, hoy, sumarDias(hoy, -6), 'Tus últimos 7 días'),
  '/mes': (datos, hoy) => resumen(datos, hoy, hoy.slice(0, 8) + '01', 'Tu mes hasta hoy'),
  '/pagos': pagos,
  '/racha': racha,
  '/ayuda': () => AYUDA,
  '/help': () => AYUDA,
};

const MENU = [
  { command: 'resumen', description: 'Cómo te fue en los últimos 7 días' },
  { command: 'mes', description: 'Cómo vas en este mes' },
  { command: 'pagos', description: 'Lo que debes y lo que te deben' },
  { command: 'racha', description: 'Cuántos días seguidos llevas' },
  { command: 'ayuda', description: 'Qué le puedo pedir al bot' },
];

const AYUDA =
  '🤖 <b>Esto me puedes pedir:</b>\n\n' +
  MENU.map((c) => `/${c.command} — ${c.description}`).join('\n') +
  '\n\nAdemás, cada noche te aviso si no has registrado nada y cada domingo te mando tu semana.';

// Le dice a Telegram que mande los mensajes del bot a esta función. Se corre una vez.
async function configurar() {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/kashiki-bot-`;
  const respuesta = await telegram('setWebhook', { url, secret_token: SECRETO, allowed_updates: ['message'] });
  const menu = await telegram('setMyCommands', { commands: MENU });
  return { webhook: respuesta.ok, menu: menu.ok, bot: await nombreDelBot() };
}

// ---------- Telegram ----------

async function telegram(metodo: string, datos: unknown) {
  if (!TOKEN) throw new Error('Falta el secreto TELEGRAM_TOKEN');
  const respuesta = await fetch(`https://api.telegram.org/bot${TOKEN}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  return await respuesta.json();
}

function enviar(chatId: number, texto: string) {
  return telegram('sendMessage', { chat_id: chatId, text: texto, parse_mode: 'HTML', disable_web_page_preview: true });
}

// Corre una tarea para cada usuario con Telegram conectado. Si alguien bloqueó al bot, lo desconecta.
async function paraTodos(tarea: (datos: Datos, hoy: string) => string | null) {
  const { data: conectados, error } = await db.from('telegram').select('user_id, chat_id').not('chat_id', 'is', null);
  if (error) throw error;
  const hoy = fechaDe(Date.now());
  let enviados = 0;
  for (const { user_id, chat_id } of conectados ?? []) {
    try {
      const texto = tarea(await leerDatos(user_id), hoy);
      if (!texto) continue;
      const respuesta = await enviar(chat_id, texto);
      if (respuesta.ok) enviados++;
      else if (respuesta.error_code === 403) await db.from('telegram').update({ chat_id: null }).eq('user_id', user_id);
    } catch (e) {
      console.error(user_id, e);
    }
  }
  return { usuarios: conectados?.length ?? 0, enviados };
}

// ---------- Datos de un usuario ----------

type Movimiento = { tipo: string; monto: number; categoria: string; fecha: string; creado: number; meta: string; seccion: string };
type Meta = { id: string; nombre: string; objetivo: number; creado: number; seccion: string };
type Pendiente = { tipo: string; persona: string; monto: number; fecha: string; nota: string; creado: number; seccion: string };
type Seccion = { id: string; nombre: string; icono?: string };
type Datos = { movimientos: Movimiento[]; metas: Meta[]; pendientes: Pendiente[]; activos: Set<string>; secciones: Seccion[] };

// Los íconos de la app (Tabler) en versión emoji para Telegram.
const EMOJIS: Record<string, string> = {
  'ti-user': '👤',
  'ti-building-store': '🏪',
  'ti-briefcase': '💼',
  'ti-pepper': '🌶️',
  'ti-home': '🏠',
  'ti-school': '🎓',
  'ti-heart': '❤️',
  'ti-car': '🚗',
};
const encabezadoSeccion = (s: Seccion) => `${EMOJIS[s.icono ?? ''] ?? '📁'} <b>${escapar(s.nombre)}</b>`;

// Parte tus datos por sección (Personal, Ventas…). Solo salen las secciones que tienen algo.
function porSeccion({ movimientos, metas, pendientes, secciones }: Datos) {
  return secciones
    .map((seccion) => ({
      seccion,
      movimientos: movimientos.filter((m) => m.seccion === seccion.id),
      metas: metas.filter((m) => m.seccion === seccion.id),
      pendientes: pendientes.filter((p) => p.seccion === seccion.id),
    }))
    .filter((g) => g.movimientos.length + g.metas.length + g.pendientes.length > 0);
}

async function leerDatos(usuario: string): Promise<Datos> {
  const leer = async (tabla: string) => {
    const { data, error } = await db.from(tabla).select('*').eq('user_id', usuario);
    if (error) throw error;
    return (data ?? []).map((fila: any) => ({
      ...fila,
      monto: Number(fila.monto),
      objetivo: Number(fila.objetivo),
      creado: Number(fila.creado),
      seccion: fila.seccion || 'personal',
    }));
  };
  const [movimientos, metas, dias, pendientes] = await Promise.all(
    ['movimientos', 'metas', 'dias', 'pendientes'].map(leer)
  );

  // Los nombres de tus secciones se guardan en tu cuenta (los que les pusiste en la app).
  const { data: cuenta } = await db.auth.admin.getUserById(usuario);
  const guardadas: Seccion[] = Array.isArray(cuenta?.user?.user_metadata?.secciones) ? cuenta.user.user_metadata.secciones : [];
  const secciones: Seccion[] = guardadas.some((s) => s.id === 'personal')
    ? [...guardadas]
    : [{ id: 'personal', nombre: 'Personal', icono: 'ti-user' }, ...guardadas];
  for (const x of [...movimientos, ...metas, ...pendientes]) {
    if (!secciones.some((s) => s.id === x.seccion)) secciones.push({ id: x.seccion, nombre: 'Otra sección' });
  }

  // Un día cuenta para la racha si registraste algo ese día o marcaste "hoy no tuve movimientos".
  const activos = new Set<string>(dias.map((d: any) => d.id));
  [...movimientos, ...metas, ...pendientes].forEach((x: any) => x.creado && activos.add(fechaDe(x.creado)));
  return { movimientos, metas, pendientes, activos, secciones };
}

// ---------- Fechas, dinero y racha ----------

// Milisegundos → "AAAA-MM-DD" en hora de México.
function fechaDe(ms: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(ms));
}

function sumarDias(fecha: string, dias: number) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(fecha: string) {
  const [, m, d] = fecha.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

function pesos(cantidad: number) {
  const signo = cantidad < 0 ? '-' : '';
  const [enteros, centavos] = Math.abs(cantidad).toFixed(2).split('.');
  return `${signo}$${enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${centavos}`;
}

function escapar(texto: string) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function diasEntre(desde: string, hasta: string) {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000);
}

// "etiqueta" = el nombre de la sección, cuando hay varias y el pago sale en una lista junta.
function lineaPago(p: Pendiente & { etiqueta?: string }, hoy: string) {
  const dias = diasEntre(hoy, p.fecha);
  let cuando;
  if (dias < -1) cuando = `venció hace ${-dias} días`;
  else if (dias === -1) cuando = 'venció ayer';
  else if (dias === 0) cuando = 'es hoy';
  else if (dias === 1) cuando = 'mañana';
  else cuando = `${fechaCorta(p.fecha)} (en ${dias} días)`;
  const nota = p.nota ? ` — ${escapar(p.nota)}` : '';
  const seccion = p.etiqueta ? ` <i>(${escapar(p.etiqueta)})</i>` : '';
  return `• <b>${escapar(p.persona)}</b> · ${pesos(p.monto)} · ${cuando}${nota}${seccion}`;
}

function pagosHasta<T extends Pendiente>(pendientes: T[], tipo: string, hasta: string) {
  return pendientes.filter((p) => p.tipo === tipo && p.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function contarRacha(activos: Set<string>, desde: string) {
  let n = 0;
  let dia = desde;
  while (activos.has(dia)) {
    n++;
    dia = sumarDias(dia, -1);
  }
  return n;
}

// Lo que un movimiento cambia tu dinero total. Ahorrar no lo cambia: solo lo aparta.
function efecto(m: Movimiento) {
  if (m.tipo === 'ingreso') return m.monto;
  if (m.tipo === 'gasto') return -m.monto;
  return 0;
}

const sumar = (lista: { monto: number }[]) => lista.reduce((total, m) => total + m.monto, 0);

// ---------- Los mensajes ----------

// Cada noche. Solo manda mensaje si hay algo que recordar.
function recordatorioDiario(datos: Datos, hoy: string) {
  const { activos } = datos;
  const partes: string[] = [];

  // Si tienes varias secciones, cada pago dice de cuál es.
  const grupos = porSeccion(datos);
  const conNombre = grupos.length > 1;
  const etiquetados = grupos.flatMap((g) => g.pendientes.map((p) => ({ ...p, etiqueta: conNombre ? g.seccion.nombre : '' })));
  const debo = pagosHasta(etiquetados, 'debo', sumarDias(hoy, 1));
  const meDeben = pagosHasta(etiquetados, 'me-deben', sumarDias(hoy, 1));
  if (debo.length > 0) partes.push('📌 <b>Pagos que tienes que hacer</b>\n' + debo.map((p) => lineaPago(p, hoy)).join('\n'));
  if (meDeben.length > 0) partes.push('💬 <b>Te tienen que pagar</b>\n' + meDeben.map((p) => lineaPago(p, hoy)).join('\n'));

  if (!activos.has(hoy)) {
    const racha = contarRacha(activos, sumarDias(hoy, -1));
    partes.push(
      racha > 0
        ? `🔥 Llevas <b>${racha} ${racha === 1 ? 'día seguido' : 'días seguidos'}</b> registrando tu dinero.\n` +
            'Hoy todavía no anotas nada: entra antes de dormir para no perder tu racha.'
        : '📝 Hoy no has registrado nada en Kashiki. ¡Empieza una racha nueva!'
    );
  }

  if (partes.length === 0) return null;
  return `${partes.join('\n\n')}\n\n${URL_APP}`;
}

// Cada domingo en la noche: resume los últimos 7 días.
function resumenSemanal(datos: Datos, hoy: string) {
  return resumen(datos, hoy, sumarDias(hoy, -6), 'Tu semana en Kashiki');
}

// Resume desde "inicio" hasta hoy. Si tienes varias secciones (Personal, Ventas…),
// cada una sale por separado con el nombre que le pusiste en la app.
function resumen(datos: Datos, hoy: string, inicio: string, titulo: string) {
  const totalDias = diasEntre(inicio, hoy) + 1;
  const grupos = porSeccion(datos);
  const lineas = [`📊 <b>${titulo}</b>`, `${fechaCorta(inicio)} – ${fechaCorta(hoy)}`];

  if (grupos.length === 0) lineas.push('', 'Todavía no tienes movimientos registrados.');
  for (const g of grupos) {
    lineas.push('');
    if (grupos.length > 1) lineas.push(`━━━━━━━━━━`, encabezadoSeccion(g.seccion));
    lineas.push(...resumenDeSeccion(g, hoy, inicio));
  }

  const diasRegistrados = Array.from({ length: totalDias }, (_, i) => sumarDias(inicio, i)).filter((d) => datos.activos.has(d)).length;
  const racha = rachaActual(datos.activos, hoy);
  lineas.push('', `🔥 Racha: <b>${racha} ${racha === 1 ? 'día' : 'días'}</b> · Registraste ${diasRegistrados} de ${totalDias} días`);
  lineas.push('', URL_APP);
  return lineas.join('\n');
}

// Lo de UNA sección: con cuánto empezaste, cuánto generaste, gastaste, con cuánto vas, metas y pagos.
function resumenDeSeccion(
  { movimientos, metas, pendientes }: { movimientos: Movimiento[]; metas: Meta[]; pendientes: Pendiente[] },
  hoy: string,
  inicio: string
) {
  const antes = movimientos.filter((m) => m.fecha < inicio);
  const periodo = movimientos.filter((m) => m.fecha >= inicio && m.fecha <= hoy);

  // El saldo inicial no es dinero que generaste: cuenta como lo que ya tenías al empezar.
  const esSaldoInicial = (m: Movimiento) => m.tipo === 'ingreso' && m.categoria === SALDO_INICIAL;
  const inicial = antes.reduce((t, m) => t + efecto(m), 0) + sumar(periodo.filter(esSaldoInicial));
  const final = antes.reduce((t, m) => t + efecto(m), 0) + periodo.reduce((t, m) => t + efecto(m), 0);
  const generado = sumar(periodo.filter((m) => m.tipo === 'ingreso' && m.categoria !== SALDO_INICIAL));
  const gastado = sumar(periodo.filter((m) => m.tipo === 'gasto'));
  const apartado = sumar(periodo.filter((m) => m.tipo === 'ahorro'));

  const porCategoria: Record<string, number> = {};
  periodo
    .filter((m) => m.tipo === 'gasto')
    .forEach((m) => (porCategoria[m.categoria] = (porCategoria[m.categoria] || 0) + m.monto));
  const top = Object.entries(porCategoria)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const lineas = [
    `🏁 Empezaste con: <b>${pesos(inicial)}</b>`,
    `💵 Generaste: <b>+${pesos(generado)}</b>`,
    `💸 Gastaste: <b>−${pesos(gastado)}</b>`,
  ];
  if (apartado > 0) lineas.push(`🎯 Apartaste para metas: <b>${pesos(apartado)}</b>`);
  lineas.push(`🏦 Vas en: <b>${pesos(final)}</b> (${final - inicial >= 0 ? '+' : ''}${pesos(final - inicial)})`);

  if (top.length > 0) {
    lineas.push('', '<b>En qué gastaste más</b>');
    top.forEach(([categoria, monto]) => lineas.push(`• ${escapar(categoria)}: ${pesos(monto)}`));
  }

  if (metas.length > 0) {
    lineas.push('', '<b>Metas</b>');
    metas.forEach((meta) => {
      const ahorrado = sumar(movimientos.filter((m) => m.tipo === 'ahorro' && m.meta === meta.id));
      const avance = Math.min(100, Math.round((ahorrado / meta.objetivo) * 100));
      lineas.push(`• ${escapar(meta.nombre)}: ${pesos(ahorrado)} de ${pesos(meta.objetivo)} (${avance}%)${avance >= 100 ? ' 🎉' : ''}`);
    });
  }

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
  return lineas;
}

// /pagos: todo lo pendiente, sin importar la fecha (separado por sección si tienes varias).
function pagos(datos: Datos, hoy: string) {
  const grupos = porSeccion(datos).filter((g) => g.pendientes.length > 0);
  if (grupos.length === 0) return '✨ No tienes pagos pendientes: ni debes ni te deben.';
  const partes: string[] = [];
  for (const g of grupos) {
    const debo = pagosHasta(g.pendientes, 'debo', '9999-12-31');
    const meDeben = pagosHasta(g.pendientes, 'me-deben', '9999-12-31');
    const bloque: string[] = [];
    if (grupos.length > 1) bloque.push(encabezadoSeccion(g.seccion));
    if (debo.length > 0) bloque.push(`📌 <b>Debes ${pesos(sumar(debo))}</b>\n` + debo.map((p) => lineaPago(p, hoy)).join('\n'));
    if (meDeben.length > 0) bloque.push(`💬 <b>Te deben ${pesos(sumar(meDeben))}</b>\n` + meDeben.map((p) => lineaPago(p, hoy)).join('\n'));
    partes.push(bloque.join('\n'));
  }
  return partes.join('\n\n');
}
// /racha: cuántos días seguidos llevas y si hoy ya cuenta.
function racha({ activos }: Datos, hoy: string) {
  const dias = rachaActual(activos, hoy);
  const texto = `🔥 Llevas <b>${dias} ${dias === 1 ? 'día seguido' : 'días seguidos'}</b> registrando tu dinero.`;
  if (activos.has(hoy)) return `${texto}\nHoy ya cuenta ✅`;
  return `${texto}\nHoy todavía no anotas nada: entra antes de dormir para no perderla.\n\n${URL_APP}`;
}

// Si hoy no has registrado, la racha que cuenta es la que llevabas hasta ayer.
function rachaActual(activos: Set<string>, hoy: string) {
  return contarRacha(activos, activos.has(hoy) ? hoy : sumarDias(hoy, -1));
}
