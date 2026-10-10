-- Ejecuta esto en Supabase → SQL Editor → New query → Run.
-- Cada usuario tiene sus propias recetas, su calendario y sus fotos: nadie ve lo de otro.

-- ---------- Recetas ----------
create table if not exists public.recetas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  creado       timestamptz not null default now(),
  titulo       text not null,
  descripcion  text not null default '',
  momento      text not null check (momento in ('desayuno', 'comida', 'merienda', 'cena')),
  tipo         text not null check (tipo in ('sana', 'gocheo')),
  tiempo_min   int check (tiempo_min > 0),
  raciones     int check (raciones > 0),
  ingredientes jsonb not null default '[]',
  pasos        jsonb not null default '[]',
  foto_url     text not null default '',
  video_url    text not null default '',
  autor_video  text not null default ''
);
create index if not exists recetas_usuario on public.recetas (user_id, creado desc);

-- ---------- Calendario: comidas planificadas o ya hechas ----------
create table if not exists public.comidas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  fecha      date not null,
  momento    text not null check (momento in ('desayuno', 'comida', 'merienda', 'cena')),
  receta_id  uuid not null references public.recetas on delete cascade,
  hecha      boolean not null default false,
  creado     timestamptz not null default now()
);
create index if not exists comidas_usuario_fecha on public.comidas (user_id, fecha);

-- ---------- Seguridad: cada fila solo es visible y editable por su dueño ----------
alter table public.recetas enable row level security;
alter table public.comidas enable row level security;

create policy "cada uno sus recetas" on public.recetas
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cada uno su calendario" on public.comidas
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Fotos ----------
-- Bucket público para poder mostrar las fotos con un enlace normal. Cada usuario sube a una
-- carpeta con su id, y solo puede subir o borrar dentro de ella.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

create policy "subir fotos a tu carpeta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "borrar fotos de tu carpeta" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
