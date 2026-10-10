// Capa de datos: Supabase si está configurado, localStorage (modo demo) si no.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const MOMENTOS = ['desayuno', 'comida', 'merienda', 'cena'];
export const TIPOS = ['sana', 'gocheo'];

let sb = null;
export let modo = 'demo';

export async function init() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  modo = 'supabase';
}

/* ---------- Recetas ---------- */

export async function list() {
  if (!sb) return demoRead().sort((a, b) => b.creado.localeCompare(a.creado));
  const { data, error } = await sb.from('recetas').select('*').order('creado', { ascending: false });
  if (error) throw error;
  return data;
}

export async function get(id) {
  if (!sb) return demoRead().find(r => r.id === id) ?? null;
  const { data, error } = await sb.from('recetas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// foto: Blob opcional (ya redimensionado). Devuelve el id guardado.
export async function save(receta, foto) {
  const r = { ...receta };
  if (!sb) {
    if (foto) r.foto_url = await blobToDataURL(foto);
    const all = demoRead();
    if (r.id) all[all.findIndex(x => x.id === r.id)] = r;
    else all.push({ ...r, id: crypto.randomUUID(), creado: new Date().toISOString() });
    demoWrite(all);
    return r.id ?? all.at(-1).id;
  }
  if (foto) {
    // Cada usuario sube a su carpeta: las políticas de Storage solo le dejan borrar lo suyo.
    const path = `${(await user()).id}/${crypto.randomUUID()}.jpg`;
    const { error } = await sb.storage.from('fotos').upload(path, foto, { contentType: 'image/jpeg' });
    if (error) throw error;
    r.foto_url = sb.storage.from('fotos').getPublicUrl(path).data.publicUrl;
  }
  const { data, error } = await sb.from('recetas').upsert(r).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function remove(id) {
  if (!sb) {
    demoWrite(demoRead().filter(r => r.id !== id));
    return guardar(KEY_COMIDAS, leer(KEY_COMIDAS).filter(c => c.receta_id !== id));
  }
  // En Supabase, sus comidas del calendario se borran solas (on delete cascade).
  const { error } = await sb.from('recetas').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- Calendario: comidas planificadas o ya hechas ---------- */
// Una comida = { id, fecha: 'AAAA-MM-DD', momento, receta_id, hecha }

export async function comidas(desde, hasta) {
  if (!sb) return leer(KEY_COMIDAS).filter(c => (!desde || c.fecha >= desde) && (!hasta || c.fecha <= hasta));
  let q = sb.from('comidas').select('*').order('fecha');
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function addComida({ fecha, momento, receta_id, hecha = false }) {
  const c = { fecha, momento, receta_id, hecha };
  if (!sb) return guardar(KEY_COMIDAS, [...leer(KEY_COMIDAS), { ...c, id: crypto.randomUUID() }]);
  const { error } = await sb.from('comidas').insert(c);
  if (error) throw error;
}

export async function updateComida(id, cambios) {
  if (!sb) return guardar(KEY_COMIDAS, leer(KEY_COMIDAS).map(c => c.id === id ? { ...c, ...cambios } : c));
  const { error } = await sb.from('comidas').update(cambios).eq('id', id);
  if (error) throw error;
}

export async function removeComida(id) {
  if (!sb) return guardar(KEY_COMIDAS, leer(KEY_COMIDAS).filter(c => c.id !== id));
  const { error } = await sb.from('comidas').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- Cuentas (solo con Supabase) ---------- */

export async function user() {
  if (!sb) return { id: 'demo', email: 'demo' };
  return (await sb.auth.getSession()).data.session?.user ?? null;
}

export function onAuth(cb) {
  sb?.auth.onAuthStateChange((_e, s) => cb(s?.user ?? null));
}

const ERRORES_AUTH = {
  invalid_credentials: 'El correo o la contraseña no son correctos.',
  email_not_confirmed: 'Confirma tu cuenta con el enlace que te enviamos por correo.',
  user_already_exists: 'Ya hay una cuenta con ese correo. Entra con tu contraseña.',
  weak_password: 'La contraseña tiene que tener al menos 6 caracteres.',
  over_email_send_rate_limit: 'Se han enviado demasiados correos. Prueba dentro de un rato.',
};
const errorAuth = e => new Error(ERRORES_AUTH[e.code] ?? e.message);

export async function entrar(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw errorAuth(error);
}

// Devuelve true si Supabase pide confirmar el correo antes de entrar.
export async function crearCuenta(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw errorAuth(error);
  return !data.session;
}

export const salir = () => sb?.auth.signOut();

/* ---------- Funciones del servidor (/api) ---------- */

async function cabeceras() {
  const token = sb && (await sb.auth.getSession()).data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// { url?, texto?, video? (data URL) } → receta
export async function importar(datos) {
  const res = await fetch('api/importar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await cabeceras()) },
    body: JSON.stringify(datos),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'La importación no está disponible. Arranca el proyecto con "npm run dev".');
  return body;
}

export async function buscarFotos(q) {
  const res = await fetch(`api/fotos?q=${encodeURIComponent(q)}`, { headers: await cabeceras() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'La búsqueda de fotos no está disponible. Arranca el proyecto con "npm run dev".');
  return body;
}

/* ---------- Imágenes ---------- */

// Reduce a 1400 px de lado mayor y JPEG: las fotos del móvil pesan 5–10 MB.
export async function resizeImage(src, max = 1400) {
  const img = await createImageBitmap(src);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = new OffscreenCanvas(Math.round(img.width * k), Math.round(img.height * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
}

export const dataURLToBlob = async u => (await fetch(u)).blob();

const blobToDataURL = b => new Promise(ok => {
  const fr = new FileReader();
  fr.onload = () => ok(fr.result);
  fr.readAsDataURL(b);
});

/* ---------- Modo demo ---------- */

const KEY = 'sarten.recetas';

function demoRead() {
  const raw = localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw);
  demoWrite(SEMILLA);
  return structuredClone(SEMILLA);
}

function demoWrite(all) {
  guardar(KEY, all);
}

const KEY_COMIDAS = 'sarten.comidas';
const leer = k => JSON.parse(localStorage.getItem(k) ?? '[]');

function guardar(k, valor) {
  try {
    localStorage.setItem(k, JSON.stringify(valor));
  } catch {
    throw new Error('El navegador no tiene más espacio. Configura Supabase para guardar sin límite.');
  }
}

const hace = d => new Date(Date.now() - d * 864e5).toISOString();
const SEMILLA = [
  {
    id: 'demo-1', creado: hace(1), titulo: 'Tostadas de aguacate y huevo poché',
    descripcion: 'El desayuno de los domingos, listo en diez minutos.',
    momento: 'desayuno', tipo: 'sana', tiempo_min: 10, raciones: 1,
    ingredientes: ['2 rebanadas de pan de masa madre', '1 aguacate maduro', '2 huevos', 'Zumo de medio limón', 'Escamas de sal y chile en copos'],
    pasos: ['Tuesta el pan.', 'Machaca el aguacate con el limón y una pizca de sal.', 'Escalfa los huevos 3 minutos en agua con un chorrito de vinagre.', 'Monta: aguacate, huevo, sal en escamas y chile.'],
    foto_url: '', video_url: '', autor_video: '',
  },
  {
    id: 'demo-2', creado: hace(2), titulo: 'Smash burger doble con cheddar',
    descripcion: 'Bordes crujientes, queso fundido y cero remordimientos.',
    momento: 'cena', tipo: 'gocheo', tiempo_min: 20, raciones: 2,
    ingredientes: ['400 g de carne picada de ternera (20 % grasa)', '4 lonchas de cheddar', '2 panes brioche', '1 cebolla', 'Pepinillos', 'Mayonesa, kétchup y mostaza'],
    pasos: ['Haz 4 bolas de 100 g.', 'Plancha muy caliente: aplasta cada bola con una espátula y sal.', 'A los 2 minutos da la vuelta y pon el queso.', 'Tuesta el pan, añade la salsa y monta dos carnes por hamburguesa.'],
    foto_url: '', video_url: '', autor_video: '',
  },
  {
    id: 'demo-3', creado: hace(3), titulo: 'Bowl de pollo teriyaki',
    descripcion: 'Para llevar en táper toda la semana.',
    momento: 'comida', tipo: 'sana', tiempo_min: 25, raciones: 3,
    ingredientes: ['500 g de contramuslo de pollo', '200 g de arroz', '1 brócoli', '4 cucharadas de salsa de soja', '2 cucharadas de miel', '1 diente de ajo y jengibre rallado'],
    pasos: ['Cuece el arroz.', 'Dora el pollo en dados.', 'Añade soja, miel, ajo y jengibre y reduce 3 minutos.', 'Sirve con el brócoli al vapor y sésamo.'],
    foto_url: '', video_url: '', autor_video: '',
  },
  {
    id: 'demo-4', creado: hace(4), titulo: 'Tortitas americanas',
    descripcion: 'Esponjosas, con sirope y fruta.',
    momento: 'merienda', tipo: 'gocheo', tiempo_min: 15, raciones: 2,
    ingredientes: ['150 g de harina', '1 huevo', '200 ml de leche', '1 cucharada de azúcar', '1 sobre de levadura', 'Mantequilla y sirope de arce'],
    pasos: ['Mezcla todo sin batir de más.', 'Sartén a fuego medio con un poco de mantequilla.', 'Cuando salgan burbujas, vuelta y 1 minuto más.'],
    foto_url: '', video_url: '', autor_video: '',
  },
];
