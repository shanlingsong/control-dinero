-- Kashiki: pagos fijos (los que se repiten: Netflix, Spotify, renta, plan del cel…).
-- Cada uno tiene cada cuánto se cobra y la fecha del próximo cobro; al marcarlo como pagado,
-- la app lo anota como gasto y mueve la fecha al siguiente cobro.
-- Supabase → SQL Editor → New query → pegar → Run. Se puede correr más de una vez sin problema.

create table if not exists public.fijos (
  user_id uuid   not null default auth.uid() references auth.users on delete cascade,
  id      text   not null,
  nombre  text   not null,
  monto   numeric(12, 2) not null check (monto > 0),
  cada    text   not null check (cada in ('semana', 'mes', 'anio')),
  proximo date   not null, -- cuándo es el siguiente cobro
  seccion text   not null default 'personal',
  creado  bigint not null,
  primary key (user_id, id)
);

-- Seguridad: cada quien solo ve y toca los suyos (igual que las demás tablas).
alter table public.fijos enable row level security;
drop policy if exists "Cada quien lo suyo" on public.fijos;
create policy "Cada quien lo suyo" on public.fijos
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Para que la API vea la tabla nueva de inmediato.
notify pgrst, 'reload schema';
