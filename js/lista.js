// Junta los ingredientes de varias recetas en una lista de la compra.
// "200 g de arroz" + "0,1 kg de arroz" → "300 g de arroz"; lo que no se entiende se deja tal cual.
// ponytail: no convierte entre unidades distintas (2 tazas vs 300 g se quedan en dos líneas).

const UNIDADES = {
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', cl: 'cl', l: 'l', litro: 'l', litros: 'l',
  cucharada: 'cucharada', cucharadas: 'cucharada', cda: 'cucharada', cdas: 'cucharada',
  cucharadita: 'cucharadita', cucharaditas: 'cucharadita', cdta: 'cucharadita', cdtas: 'cucharadita',
  taza: 'taza', tazas: 'taza', vaso: 'vaso', vasos: 'vaso',
  diente: 'diente', dientes: 'diente', lata: 'lata', latas: 'lata', sobre: 'sobre', sobres: 'sobre',
  loncha: 'loncha', lonchas: 'loncha', rebanada: 'rebanada', rebanadas: 'rebanada',
  pizca: 'pizca', pizcas: 'pizca', unidad: '', unidades: '',
};
// Para sumar kg con g o l con ml, todo se pasa a la unidad pequeña.
const BASE = { kg: ['g', 1000], l: ['ml', 1000], cl: ['ml', 10] };
const PALABRAS = { un: 1, una: 1, uno: 1, medio: 0.5, media: 0.5, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };

const normalizar = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/\(.*?\)/g, '').replace(/[.,;:]+$/, '').replace(/\s+/g, ' ').trim();

function numero(t) {
  t = t.toLowerCase();
  if (t in PALABRAS) return PALABRAS[t];
  if (t.includes('/')) { const [a, b] = t.split('/').map(Number); return b ? a / b : NaN; }
  return Number(t.replace(',', '.'));
}

// "400 g de carne picada" → { cantidad: 400, unidad: 'g', nombre: 'carne picada' }
export function leerIngrediente(texto) {
  const m = texto.trim().match(/^(\d+(?:[.,]\d+)?|\d+\/\d+|un|una|uno|medio|media|dos|tres|cuatro|cinco|seis)\s+(?:(\p{L}+)\.?\s+)?(?:de\s+)?(.+)$/iu)
    ?? texto.trim().match(/^(\d+(?:[.,]\d+)?)(g|kg|ml|l|cl)\s+(?:de\s+)?(.+)$/iu);
  if (!m) return null;
  let cantidad = numero(m[1]);
  let unidad = m[2] ? UNIDADES[m[2].toLowerCase()] : '';
  let nombre = m[3];
  // La palabra tras el número no era una unidad ("2 huevos grandes"): forma parte del nombre.
  if (m[2] && unidad === undefined) { nombre = `${m[2]} ${m[3]}`; unidad = ''; }
  if (!Number.isFinite(cantidad)) return null;
  if (BASE[unidad]) { cantidad *= BASE[unidad][1]; unidad = BASE[unidad][0]; }
  return { cantidad, unidad, nombre: nombre.trim() };
}

const redondear = n => Math.round(n * 100) / 100;
const formatoNumero = n => String(redondear(n)).replace('.', ',');

function formato({ cantidad, unidad, nombre }) {
  // 1500 g → 1,5 kg; 1200 ml → 1,2 l
  if (unidad === 'g' && cantidad >= 1000) [cantidad, unidad] = [cantidad / 1000, 'kg'];
  if (unidad === 'ml' && cantidad >= 1000) [cantidad, unidad] = [cantidad / 1000, 'l'];
  const plural = cantidad > 1 && /^(cucharada|cucharadita|taza|vaso|diente|lata|sobre|loncha|rebanada|pizca)$/.test(unidad) ? 's' : '';
  if (unidad) return `${formatoNumero(cantidad)} ${unidad}${plural} de ${nombre}`;
  // "2 cebolla" → "2 cebollas" (solo palabras acabadas en vocal; el resto se deja como está)
  if (cantidad > 1) nombre = nombre.replace(/^(\p{L}*[aeiouáéó])(?=\s|$)/iu, '$1s');
  return `${formatoNumero(cantidad)} ${nombre}`;
}

// ingredientes: [{ texto, receta }] → [{ clave, texto, recetas: [títulos] }] ordenado por nombre
export function juntarIngredientes(ingredientes) {
  const grupos = new Map();
  for (const { texto, receta } of ingredientes) {
    const p = leerIngrediente(texto);
    const clave = p ? `${normalizar(p.nombre)}|${p.unidad}` : normalizar(texto);
    const g = grupos.get(clave);
    if (!g) grupos.set(clave, { clave, p, texto: texto.trim(), recetas: [receta] });
    else {
      if (p) g.p.cantidad += p.cantidad;
      if (!g.recetas.includes(receta)) g.recetas.push(receta);
    }
  }
  return [...grupos.values()]
    .map(g => ({ clave: g.clave, texto: g.p ? formato(g.p) : g.texto, recetas: g.recetas }))
    .sort((a, b) => a.clave.localeCompare(b.clave, 'es'));
}
