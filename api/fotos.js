// GET /api/fotos?q=nombre del plato → 6 fotos de Pexels (gratis, licencia libre).
import { autorizado } from './importar.js';

export default async function handler(req, res) {
  if (!process.env.PEXELS_API_KEY) return res.status(500).json({ error: 'Falta PEXELS_API_KEY en el archivo .env.' });
  if (!(await autorizado(req))) return res.status(401).json({ error: 'Entra con tu cuenta para buscar fotos.' });

  const q = String(req.query.q ?? '').trim().slice(0, 100);
  if (!q) return res.status(400).json({ error: 'Falta el nombre del plato.' });

  // Si "Tostadas de aguacate y huevo poché" no da nada, prueba con "Tostadas".
  // ponytail: si aun así flojea, traducir el título al inglés con Gemini antes de buscar.
  let photos = await buscar(q);
  const corto = q.split(/\s+(?:de|con|al|a la|en|y)\s+/i)[0];
  if (photos && !photos.length && corto !== q) photos = await buscar(corto);
  if (!photos) return res.status(502).json({ error: 'Pexels no responde. Revisa PEXELS_API_KEY o inténtalo en un momento.' });

  res.status(200).json(photos.map(p => ({ src: p.src.large, thumb: p.src.medium, autor: p.photographer })));
}

async function buscar(query) {
  const url = `https://api.pexels.com/v1/search?${new URLSearchParams({ query, locale: 'es-ES', per_page: 6, orientation: 'landscape' })}`;
  const r = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY } });
  return r.ok ? (await r.json()).photos ?? [] : null;
}
