-- Kashiki: avisos de Telegram para cada usuario.
-- Se corre DESPUÉS de publicar la Edge Function "kashiki-bot" (ver supabase/functions/kashiki-bot/index.ts).
-- Antes de correrlo, cambia las 3 veces que dice PON-AQUI-EL-SECRETO por el mismo BOT_SECRETO de la función.
-- Supabase → SQL Editor → New query → pegar → Run.

-- ---------- Quién tiene Telegram conectado ----------
-- Solo la Edge Function (con la llave de servicio) lee y escribe aquí: RLS encendido y sin reglas = nadie más.
create table if not exists public.telegram (
  user_id       uuid primary key references auth.users on delete cascade,
  chat_id       bigint,
  codigo        text unique,
  codigo_creado timestamptz,
  conectado     timestamptz
);
alter table public.telegram enable row level security;

-- ---------- Las alarmas ----------
-- pg_cron es el reloj; pg_net le permite a la base de datos llamar a la función por internet.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- México no cambia de horario: 8 pm allá son las 2 am en UTC (el reloj de Supabase).
select cron.schedule(
  'kashiki-recordatorio',
  '0 2 * * *',
  $$ select net.http_post(
       url := 'https://bzaawjfvzkfhusdtvnia.supabase.co/functions/v1/kashiki-bot-',
       headers := '{"Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "PON-AQUI-EL-SECRETO"}'::jsonb,
       body := '{"tarea": "diario"}'::jsonb
     ) $$
);

-- Domingo 9 pm en México = lunes 3 am en UTC.
select cron.schedule(
  'kashiki-resumen',
  '0 3 * * 1',
  $$ select net.http_post(
       url := 'https://bzaawjfvzkfhusdtvnia.supabase.co/functions/v1/kashiki-bot-',
       headers := '{"Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "PON-AQUI-EL-SECRETO"}'::jsonb,
       body := '{"tarea": "semanal"}'::jsonb
     ) $$
);

-- ---------- Conectar el bot con la función (una sola vez) ----------
-- Le dice a Telegram: "cuando alguien le escriba al bot, avísale a kashiki-bot".
select net.http_post(
  url := 'https://bzaawjfvzkfhusdtvnia.supabase.co/functions/v1/kashiki-bot-',
  headers := '{"Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "PON-AQUI-EL-SECRETO"}'::jsonb,
  body := '{"tarea": "configurar"}'::jsonb
);
