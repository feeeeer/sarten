// GET /api/fotos?q=nombre del plato → 6 fotos de Pexels (gratis, licencia libre).
import { autorizado } from './importar.js';

export default async function handler(req, res) {
  if (!process.env.PEXELS_API_KEY) return res.status(500).json({ error: 'Falta PEXELS_API_KEY en el archivo .env.' });
  if (!(await autorizado(req))) return res.status(401).json({ error: 'Entra con tu cuenta para buscar fotos.' });

  const q = String(req.query.q ?? '').trim().slice(0, 100);
  if (!q) return res.status(400).json({ error: 'Falta el nombre del plato.' });

  // ponytail: busca por el título tal cual; si los resultados flojean, traducir el título con Gemini antes.
  const url = `https://api.pexels.com/v1/search?${new URLSearchParams({ query: q, locale: 'es-ES', per_page: 6, orientation: 'landscape' })}`;
  const r = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY } });
  if (!r.ok) return res.status(502).json({ error: 'Pexels no responde. Inténtalo en un momento.' });

  const { photos = [] } = await r.json();
  res.status(200).json(photos.map(p => ({ src: p.src.large, thumb: p.src.medium, autor: p.photographer })));
}
