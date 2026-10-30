-- Kashiki: notificaciones en el teléfono (Web Push).
-- Cada teléfono o navegador que activa las notificaciones guarda aquí su "dirección" para recibirlas.
-- Solo la Edge Function kashiki-bot- lee y escribe aquí: RLS encendido y sin reglas = nadie más.
-- Supabase → SQL Editor → New query → pegar → Run. Se puede correr más de una vez sin problema.

create table if not exists public.notificaciones (
  endpoint text primary key,             -- la dirección única de ese teléfono para mandarle avisos
  user_id  uuid not null references auth.users on delete cascade,
  p256dh   text not null,                -- llaves para cifrar el aviso (solo ese teléfono lo puede leer)
  auth     text not null,
  creado   timestamptz not null default now()
);
create index if not exists notificaciones_usuario on public.notificaciones (user_id);
alter table public.notificaciones enable row level security;

notify pgrst, 'reload schema';
