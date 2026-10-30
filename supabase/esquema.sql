-- Kashiki: base de datos en Supabase.
-- Cada tabla guarda el dueño (user_id) y las reglas de seguridad (RLS) hacen que
-- cada persona solo pueda ver, crear, cambiar y borrar SUS propios registros.
-- Se corre una sola vez en Supabase → SQL Editor → New query → Run.

-- ---------- Movimientos: ingresos, gastos y ahorros ----------
create table if not exists public.movimientos (
  user_id   uuid   not null default auth.uid() references auth.users on delete cascade,
  id        text   not null,
  tipo      text   not null check (tipo in ('ingreso', 'gasto', 'ahorro')),
  monto     numeric(12, 2) not null check (monto > 0),
  categoria text   not null,
  nota      text   not null default '',
  fecha     date   not null,
  creado    bigint not null,
  meta      text   not null default '',
  seccion   text   not null default 'personal', -- Personal, Mi empresa… (ver secciones.sql)
  primary key (user_id, id)
);

-- ---------- Metas de ahorro ----------
create table if not exists public.metas (
  user_id  uuid   not null default auth.uid() references auth.users on delete cascade,
  id       text   not null,
  nombre   text   not null,
  objetivo numeric(12, 2) not null check (objetivo > 0),
  creado   bigint not null,
  seccion  text   not null default 'personal',
  primary key (user_id, id)
);

-- ---------- Días marcados con "hoy no tuve movimientos" (racha) ----------
create table if not exists public.dias (
  user_id uuid   not null default auth.uid() references auth.users on delete cascade,
  id      text   not null, -- la fecha, "AAAA-MM-DD"
  creado  bigint not null,
  primary key (user_id, id)
);

-- ---------- Pagos pendientes: lo que debo y lo que me deben ----------
create table if not exists public.pendientes (
  user_id uuid   not null default auth.uid() references auth.users on delete cascade,
  id      text   not null,
  tipo    text   not null check (tipo in ('debo', 'me-deben')),
  persona text   not null,
  monto   numeric(12, 2) not null check (monto > 0),
  fecha   date   not null,
  nota    text   not null default '',
  creado  bigint not null,
  seccion text   not null default 'personal',
  primary key (user_id, id)
);

-- ---------- Seguridad: cada quien solo ve lo suyo ----------
alter table public.movimientos enable row level security;
alter table public.metas       enable row level security;
alter table public.dias        enable row level security;
alter table public.pendientes  enable row level security;

drop policy if exists "Cada quien lo suyo" on public.movimientos;
drop policy if exists "Cada quien lo suyo" on public.metas;
drop policy if exists "Cada quien lo suyo" on public.dias;
drop policy if exists "Cada quien lo suyo" on public.pendientes;

create policy "Cada quien lo suyo" on public.movimientos
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Cada quien lo suyo" on public.metas
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Cada quien lo suyo" on public.dias
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Cada quien lo suyo" on public.pendientes
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
