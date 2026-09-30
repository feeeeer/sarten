// Función serverless de Vercel: POST /api/importar  { url, texto? }
// 1. Saca los metadatos públicos del vídeo (oEmbed de TikTok/YouTube u Open Graph).
// 2. Pide a Gemini que convierta descripción + miniatura (+ texto opcional) en una receta.
// 3. Devuelve la receta, el enlace canónico y la miniatura como data URL
//    (las URLs de miniatura de TikTok caducan, así que el cliente la guarda como foto propia).

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    es_receta: { type: 'BOOLEAN' },
    titulo: { type: 'STRING' },
    descripcion: { type: 'STRING' },
    momento: { type: 'STRING', enum: ['desayuno', 'comida', 'merienda', 'cena'] },
    tipo: { type: 'STRING', enum: ['sana', 'gocheo'] },
    tiempo_min: { type: 'INTEGER', nullable: true },
    raciones: { type: 'INTEGER', nullable: true },
    ingredientes: { type: 'ARRAY', items: { type: 'STRING' } },
    pasos: { type: 'ARRAY', items: { type: 'STRING' } },
    nota: { type: 'STRING' },
  },
  required: ['es_receta', 'titulo', 'descripcion', 'momento', 'tipo', 'ingredientes', 'pasos', 'nota'],
};

const PROMPT = `Eres el asistente de un recetario personal en español de España.
Te paso los datos públicos de un vídeo de cocina (título/descripción del post y su miniatura)
y, a veces, un texto extra que ha pegado el usuario. Extrae la receta.

Reglas:
- Escribe todo en español de España, con tono natural. Traduce si el original está en otro idioma.
- titulo: nombre corto del plato, sin emojis ni hashtags. descripcion: una frase apetecible.
- ingredientes: uno por elemento, con cantidad si aparece ("200 g de arroz"). No inventes cantidades.
- pasos: frases imperativas y breves, en orden. Sin numerar.
- momento: cuándo se come normalmente este plato en España (desayuno, comida, merienda o cena).
- tipo: "sana" si es equilibrada o ligera; "gocheo" si es frita, muy calórica, muy dulce o un capricho.
- tiempo_min y raciones: solo si se dicen o se deducen con claridad; si no, null.
- Si la descripción no trae ingredientes o pasos, puedes proponer los que se ven claramente
  en la imagen o se deducen del título, pero entonces explica en "nota", en una frase dirigida al
  usuario, qué has supuesto y qué debe revisar. Si todo venía en el texto, "nota" va vacía.
- es_receta: false si el contenido no es una receta; en ese caso explícalo en "nota".
- Ignora hashtags, menciones, promociones y códigos de descuento.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Falta GEMINI_API_KEY en las variables de entorno.' });
  }
  if (!(await autorizado(req))) return res.status(401).json({ error: 'Entra con tu cuenta para importar recetas.' });

  const { url = '', texto = '' } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'El enlace no es válido.' });

  try {
    const videoUrl = await resolverCorto(url);
    const meta = await metadatos(videoUrl);
    const imagen = meta.thumbnail ? await aDataURL(meta.thumbnail) : null;

    if (!meta.texto && !texto && !imagen) {
      return res.status(422).json({ error: 'No he podido leer ese vídeo. ¿Es público? Prueba a pegar el texto de la receta debajo.' });
    }

    const receta = await gemini({ meta, texto: texto.slice(0, 8000), imagen });
    if (!receta.es_receta) return res.status(422).json({ error: receta.nota || 'Ese vídeo no parece una receta.' });

    res.status(200).json({ ...receta, video_url: videoUrl, autor_video: meta.autor ?? '', imagen });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.publico ?? `No se ha podido importar. Detalle: ${err.message.slice(0, 300)}` });
  }
}

// Si el proyecto usa Supabase, solo el usuario con sesión puede gastar cuota de la IA.
export async function autorizado(req) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL) return true;
  const auth = req.headers.authorization;
  if (!auth) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth } });
  return r.ok;
}

// vm.tiktok.com/xxx, tiktok.com/t/xxx, youtu.be/xxx… → URL completa
async function resolverCorto(url) {
  const u = new URL(url);
  if (!/^(vm|vt)\.tiktok\.com$/.test(u.hostname) && !u.pathname.startsWith('/t/')) return url;
  const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } });
  const final = new URL(r.url);
  return final.origin + final.pathname;
}

async function metadatos(url) {
  const host = new URL(url).hostname;
  let oembed = null;
  if (host.endsWith('tiktok.com')) oembed = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  else if (/youtube\.com$|youtu\.be$/.test(host)) oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;

  const meta = { texto: '', autor: '', thumbnail: '' };
  if (oembed) {
    const r = await fetch(oembed, { headers: { 'User-Agent': UA } });
    if (r.ok) {
      const j = await r.json();
      meta.texto = j.title ?? '';
      meta.autor = j.author_unique_id ? `@${j.author_unique_id}` : j.author_name ?? '';
      meta.thumbnail = j.thumbnail_url ?? '';
    }
  }
  // TikTok ya trae el texto completo en oEmbed; al resto (YouTube, Instagram, blogs…)
  // le añadimos la descripción de las etiquetas Open Graph de la página.
  if (!host.endsWith('tiktok.com')) {
    const og = await openGraph(url);
    meta.texto = [meta.texto, og.title, og.description].filter(Boolean).join('\n');
    meta.thumbnail ||= og.image;
  }
  return meta;
}

async function openGraph(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' } });
    const html = (await r.text()).slice(0, 500_000);
    const get = p => html.match(new RegExp(`<meta[^>]+property=["']og:${p}["'][^>]+content=["']([^"']*)`, 'i'))?.[1];
    const dec = s => s?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return { title: dec(get('title')), description: dec(get('description')), image: dec(get('image')) };
  } catch {
    return {};
  }
}

async function aDataURL(src) {
  try {
    const r = await fetch(src, { headers: { 'User-Agent': UA } });
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !type.startsWith('image/')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 5_000_000) return null;
    return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function gemini({ meta, texto, imagen }) {
  const parts = [
    { text: PROMPT },
    { text: `DESCRIPCIÓN DEL VÍDEO:\n${meta.texto || '(sin descripción)'}` },
  ];
  if (texto) parts.push({ text: `TEXTO EXTRA DEL USUARIO:\n${texto}` });
  if (imagen) {
    const [, mime, data] = imagen.match(/^data:([^;]+);base64,(.+)$/);
    parts.push({ inline_data: { mime_type: mime, data } });
  }

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
    }),
  });
  if (r.status === 429) throw Object.assign(new Error('429'), { publico: 'Has llegado al límite gratuito de la IA por ahora. Prueba en unos minutos.' });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);

  const j = await r.json();
  const out = j.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('');
  if (!out) throw new Error(`Gemini sin respuesta: ${JSON.stringify(j).slice(0, 500)}`);
  return JSON.parse(out);
}
