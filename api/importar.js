// Función serverless: POST /api/importar  { url?, texto?, video? }
// Convierte en receta cualquiera de estas fuentes (o varias a la vez):
//   - Vídeo de TikTok o YouTube: descripción vía oEmbed (YouTube, además, lo "ve" Gemini entero).
//   - Post de Instagram o cualquier web: etiquetas Open Graph, receta estructurada (schema.org) y texto.
//   - Vídeo subido por el usuario (data URL): Gemini lo ve y escucha.
//   - Texto pegado por el usuario.
// Devuelve la receta, el enlace canónico y una imagen como data URL para usarla de foto.

// Si el primero está saturado (error 503) o sin cuota (429), se prueba con el siguiente.
const MODELOS = [process.env.GEMINI_MODEL || 'gemini-flash-latest', 'gemini-flash-lite-latest'];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
// Instagram solo enseña la descripción del post a los "previsualizadores" de enlaces.
const UA_PREVIEW = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const MAX_VIDEO = 16_000_000; // caracteres base64 (~12 MB de vídeo): límite de datos en línea de Gemini

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
Te paso contenido de cocina de una o varias fuentes: la descripción de un vídeo (TikTok, Instagram,
YouTube), el texto de una página web, una receta estructurada sacada de la web, una imagen,
el propio vídeo y/o un texto que ha pegado el usuario. Extrae UNA receta.

Reglas:
- Escribe todo en español de España, con tono natural. Traduce si el original está en otro idioma.
- Si tienes el vídeo, lo que se dice y se ve en él manda sobre la descripción.
- Si hay receta estructurada de la web, es la fuente más fiable: úsala y solo límpiala.
- titulo: nombre corto del plato, sin emojis ni hashtags. descripcion: una frase apetecible.
- ingredientes: uno por elemento, con cantidad si aparece ("200 g de arroz"). No inventes cantidades.
- pasos: frases imperativas y breves, en orden. Sin numerar.
- momento: cuándo se come normalmente este plato en España (desayuno, comida, merienda o cena).
- tipo: "sana" si es equilibrada o ligera; "gocheo" si es frita, muy calórica, muy dulce o un capricho.
- tiempo_min y raciones: solo si se dicen o se deducen con claridad; si no, null.
- Si las fuentes no traen ingredientes o pasos, puedes proponer los que se ven claramente
  en la imagen o se deducen del título, pero entonces explica en "nota", en una frase dirigida al
  usuario, qué has supuesto y qué debe revisar. Si todo venía en las fuentes, "nota" va vacía.
- Ignora menús, comentarios, publicidad, hashtags, menciones y códigos de descuento de la página.
- es_receta: false si el contenido no es una receta; en ese caso explícalo en "nota".`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Falta GEMINI_API_KEY en las variables de entorno.' });
  }
  if (!(await autorizado(req))) return res.status(401).json({ error: 'Entra con tu cuenta para importar recetas.' });

  const { url = '', texto = '', video = '' } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
  if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'El enlace no es válido.' });
  if (video && !/^data:video\/[\w.+-]+;base64,/.test(video)) return res.status(400).json({ error: 'El archivo no es un vídeo.' });
  if (video.length > MAX_VIDEO) return res.status(413).json({ error: 'El vídeo pesa más de 12 MB. Recórtalo o grábalo en menor calidad.' });
  if (!url && !texto && !video) return res.status(400).json({ error: 'Pega un enlace, sube un vídeo o escribe el texto de la receta.' });

  try {
    const fuenteUrl = url ? await resolverCorto(url) : '';
    const meta = fuenteUrl ? await metadatos(fuenteUrl) : {};
    const imagen = meta.imagen ? await aDataURL(meta.imagen) : null;

    if (!meta.texto && !meta.receta && !meta.youtube && !texto && !video) {
      return res.status(422).json({
        error: 'No he podido leer ese enlace (Instagram suele bloquearlo). Sube el vídeo o pega el texto de la receta.',
      });
    }

    const receta = await gemini({ meta, texto: texto.slice(0, 8000), imagen, video });
    if (!receta.es_receta) return res.status(422).json({ error: receta.nota || 'Eso no parece una receta.' });

    res.status(200).json({ ...receta, video_url: fuenteUrl, autor_video: meta.autor ?? '', imagen });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.publico ?? `No se ha podido importar. Detalle: ${err.message.slice(0, 300)}` });
  }
}

// Con Supabase configurado, solo un usuario con sesión puede gastar cuota de la IA.
export async function autorizado(req) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL) return true;
  const auth = req.headers.authorization;
  if (!auth) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth } });
  return r.ok;
}

// vm.tiktok.com/xxx, tiktok.com/t/xxx → URL completa
async function resolverCorto(url) {
  const u = new URL(url);
  if (!/^(vm|vt)\.tiktok\.com$/.test(u.hostname) && !(u.hostname.endsWith('tiktok.com') && u.pathname.startsWith('/t/'))) return url;
  const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } });
  const final = new URL(r.url);
  return final.origin + final.pathname;
}

// Reúne todo lo que se puede saber del enlace: texto, autor, imagen y receta estructurada.
export async function metadatos(url) {
  const host = new URL(url).hostname;
  const esTikTok = host.endsWith('tiktok.com');
  const esYouTube = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host);
  const meta = { texto: '', autor: '', imagen: '', receta: null, youtube: esYouTube ? url : null };

  const oembed = esTikTok ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    : esYouTube ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}` : null;
  if (oembed) {
    const r = await fetch(oembed, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (r?.ok) {
      const j = await r.json();
      meta.texto = j.title ?? '';
      meta.autor = j.author_unique_id ? `@${j.author_unique_id}` : j.author_name ?? '';
      meta.imagen = j.thumbnail_url ?? '';
    }
  }
  // TikTok ya trae la descripción completa en oEmbed. Al resto le leemos la página.
  if (!esTikTok) {
    const p = await leerPagina(url, host.endsWith('instagram.com') ? UA_PREVIEW : UA);
    meta.texto = [meta.texto, p.title, p.description, p.texto].filter(Boolean).join('\n\n').slice(0, 15000);
    meta.imagen ||= p.image ?? '';
    meta.receta = p.receta;
    if (host.endsWith('instagram.com') && !meta.autor) meta.autor = p.title?.match(/^(.+?) (?:en|on) Instagram/)?.[1] ?? '';
  }
  return meta;
}

async function leerPagina(url, ua) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept-Language': 'es-ES,es;q=0.9' } });
    if (!r.ok) return {};
    return analizarHtml((await r.text()).slice(0, 2_000_000));
  } catch {
    return {};
  }
}

const decodificar = s => s?.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n)).replace(/&amp;/g, '&');

// Extrae de un HTML: Open Graph, receta schema.org (JSON-LD) y el texto visible.
export function analizarHtml(html) {
  const og = p => decodificar(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']og:${p}["'][^>]*content=["']([^"']*)`, 'i'))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']og:${p}["']`, 'i'))?.[1]);

  let receta = null;
  for (const [, json] of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { receta = buscarReceta(JSON.parse(json)); } catch { /* JSON-LD roto: lo ignoramos */ }
    if (receta) break;
  }
  const imagenReceta = receta && [receta.image].flat()[0];

  // Si hay receta estructurada no hace falta el texto de la página: es ruido y gasta cuota.
  const texto = receta ? '' : decodificar(html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, 12000);

  return {
    title: og('title'), description: og('description'), texto,
    image: (typeof imagenReceta === 'string' ? imagenReceta : imagenReceta?.url) || og('image'),
    receta: receta && JSON.stringify({
      nombre: receta.name, descripcion: receta.description, raciones: receta.recipeYield,
      tiempo: receta.totalTime ?? receta.cookTime, categoria: receta.recipeCategory,
      ingredientes: receta.recipeIngredient, pasos: receta.recipeInstructions,
    }).slice(0, 12000),
  };
}

function buscarReceta(nodo) {
  if (Array.isArray(nodo)) {
    for (const n of nodo) { const r = buscarReceta(n); if (r) return r; }
    return null;
  }
  if (!nodo || typeof nodo !== 'object') return null;
  if ([nodo['@type']].flat().includes('Recipe')) return nodo;
  return buscarReceta(nodo['@graph']);
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

const enLinea = dataUrl => {
  const [, mime, data] = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  return { inline_data: { mime_type: mime, data } };
};

async function gemini({ meta, texto, imagen, video }) {
  const parts = [{ text: PROMPT }];
  if (meta.texto) parts.push({ text: `DESCRIPCIÓN / TEXTO DE LA FUENTE:\n${meta.texto}` });
  if (meta.receta) parts.push({ text: `RECETA ESTRUCTURADA DE LA WEB:\n${meta.receta}` });
  if (texto) parts.push({ text: `TEXTO DEL USUARIO:\n${texto}` });
  if (imagen) parts.push(enLinea(imagen));
  if (video) parts.push(enLinea(video));
  // Gemini puede ver vídeos públicos de YouTube directamente desde el enlace.
  if (meta.youtube && !video) parts.push({ file_data: { file_uri: meta.youtube } });

  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
  });

  // 503 = modelo saturado: reintenta una vez y, si sigue, cambia de modelo.
  // 429 = cuota gastada en ese modelo: pasa directamente al siguiente.
  let r;
  for (const modelo of MODELOS) {
    for (let intento = 0; intento < 2; intento++) {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body,
      });
      if (r.status !== 503) break;
      await new Promise(ok => setTimeout(ok, 2000));
    }
    if (r.status !== 503 && r.status !== 429) break;
  }
  if (r.status === 503) throw Object.assign(new Error('503'), { publico: 'La IA de Google está saturada ahora mismo. Prueba en unos minutos.' });
  if (r.status === 429) throw Object.assign(new Error('429'), { publico: 'Has llegado al límite gratuito de la IA por ahora. Prueba en unos minutos.' });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);

  const j = await r.json();
  const out = j.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('');
  if (!out) throw new Error(`Gemini sin respuesta: ${JSON.stringify(j).slice(0, 500)}`);
  return JSON.parse(out);
}
