-- Ejecuta esto en Supabase → SQL Editor → New query → Run.

create table if not exists public.recetas (
  id           uuid primary key default gen_random_uuid(),
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

create index if not exists recetas_momento_tipo on public.recetas (momento, tipo);

-- Seguridad: cualquiera puede ver el recetario; solo usuarios con sesión pueden cambiarlo.
-- Como desactivas el registro de nuevos usuarios (ver README), el único usuario eres tú.
alter table public.recetas enable row level security;

create policy "lectura pública" on public.recetas
  for select using (true);
create policy "escritura del dueño" on public.recetas
  for all to authenticated using (true) with check (true);

-- Almacenamiento de fotos (bucket público para poder mostrarlas)
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

create policy "subir fotos con sesión" on storage.objects
  for insert to authenticated with check (bucket_id = 'fotos');
create policy "borrar fotos con sesión" on storage.objects
  for delete to authenticated using (bucket_id = 'fotos');
