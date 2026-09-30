// Servidor local sin dependencias: sirve la web y ejecuta las funciones de api/ igual que Vercel.
// Uso: npm run dev  →  http://localhost:3000
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const PORT = process.env.PORT || 3000;

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);

  const api = path.match(/^\/api\/(\w+)$/)?.[1];
  if (api && existsSync(`api/${api}.js`)) {
    const { default: handler } = await import(`./api/${api}.js`);
    req.query = Object.fromEntries(url.searchParams);
    let raw = '';
    for await (const c of req) raw += c;
    req.body = raw ? JSON.parse(raw) : {};
    res.status = code => { res.statusCode = code; return res; };
    res.json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
    return handler(req, res);
  }

  const file = join(process.cwd(), normalize(path === '/' ? '/index.html' : path));
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('No encontrado');
  }
}).listen(PORT, () => console.log(`Sartén en http://localhost:${PORT}`));
