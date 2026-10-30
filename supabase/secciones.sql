-- Kashiki: secciones de dinero (Personal, Mi empresa…).
-- Agrega la columna "seccion" a movimientos, metas y pagos pendientes.
-- Todo lo que ya existe queda en "personal". La racha (tabla dias) es una sola, no lleva sección.
-- Supabase → SQL Editor → New query → pegar → Run. Se puede correr más de una vez sin problema.

alter table public.movimientos add column if not exists seccion text not null default 'personal';
alter table public.metas       add column if not exists seccion text not null default 'personal';
alter table public.pendientes  add column if not exists seccion text not null default 'personal';

-- Para que la API vea las columnas nuevas de inmediato.
notify pgrst, 'reload schema';
