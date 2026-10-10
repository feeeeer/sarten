import * as store from './store.js';
import { MOMENTOS, TIPOS } from './store.js';
import { juntarIngredientes, escalar } from './lista.js';

const $app = document.getElementById('app');
const $auth = document.getElementById('authBtn');
let usuario = null;

/* ---------- utilidades ---------- */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const normalizarTexto = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
const ETIQUETA_TIPO = { sana: 'Sana', gocheo: 'Gocheo' };
const PLURAL = { desayuno: 'Desayunos', comida: 'Comidas', merienda: 'Meriendas', cena: 'Cenas' };

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('toast--on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('toast--on'), 3200);
}

function momentoAhora(h = new Date().getHours()) {
  if (h >= 5 && h < 12) return 'desayuno';
  if (h >= 12 && h < 17) return 'comida';
  if (h >= 17 && h < 20) return 'merienda';
  return 'cena';
}

/* ---------- fechas (siempre 'AAAA-MM-DD' en hora local) ---------- */

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const aFecha = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
const hoy = () => iso(new Date());
const sumarDias = (s, n) => { const d = aFecha(s); d.setDate(d.getDate() + n); return iso(d); };
const lunesDe = s => sumarDias(s, -((aFecha(s).getDay() + 6) % 7));
const fechaCorta = s => aFecha(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
const diaSemana = s => aFecha(s).toLocaleDateString('es-ES', { weekday: 'long' });
const semanaValida = d => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') ? lunesDe(d) : lunesDe(hoy());

const FRASE_AHORA = {
  desayuno: 'Toca desayunar.', comida: 'Hora de comer.', merienda: 'Algo para merendar.', cena: '¿Qué cenamos?',
};

// Convierte el enlace de un vídeo en la URL de su reproductor embebido.
export function videoEmbed(url) {
  if (!url) return null;
  let m;
  if ((m = url.match(/tiktok\.com\/.*\/video\/(\d+)/))) return { src: `https://www.tiktok.com/player/v1/${m[1]}?description=0&music_info=0`, red: 'TikTok', vertical: true };
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/))) return { src: `https://www.youtube-nocookie.com/embed/${m[1]}`, red: 'YouTube', vertical: url.includes('/shorts/') };
  if ((m = url.match(/instagram\.com\/(?:reel|p)\/([\w-]+)/))) return { src: `https://www.instagram.com/reel/${m[1]}/embed`, red: 'Instagram', vertical: true };
  return null;
}

function redDe(url) {
  try { return new URL(url).hostname.replace(/^www\.|^vm\.|^m\./, '').split('.')[0]; } catch { return 'vídeo'; }
}

const aDataURL = archivo => new Promise((ok, ko) => {
  const fr = new FileReader();
  fr.onload = () => ok(fr.result);
  fr.onerror = () => ko(new Error('No se ha podido leer el vídeo.'));
  fr.readAsDataURL(archivo);
});

// Saca un fotograma del vídeo (al segundo 1) para usarlo como foto de la receta.
async function fotograma(archivo) {
  const v = Object.assign(document.createElement('video'), { muted: true, playsInline: true, src: URL.createObjectURL(archivo) });
  await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = ko; });
  v.currentTime = Math.min(1, v.duration / 2);
  await new Promise(ok => { v.onseeked = ok; });
  const c = Object.assign(document.createElement('canvas'), { width: v.videoWidth, height: v.videoHeight });
  c.getContext('2d').drawImage(v, 0, 0);
  URL.revokeObjectURL(v.src);
  return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
}

/* ---------- componentes ---------- */

// Las fotos solo aparecen si el usuario ha elegido una; sin foto no se reserva hueco.
const foto = (r, cls = '') => r.foto_url ? `<img class="foto ${cls}" src="${esc(r.foto_url)}" alt="" loading="lazy">` : '';

function chips(r) {
  return `<span class="chip chip--${r.tipo}">${ETIQUETA_TIPO[r.tipo]}</span>
    <span class="chip">${cap(r.momento)}</span>
    ${r.tiempo_min ? `<span class="chip">${r.tiempo_min} min</span>` : ''}
    ${r.video_url ? `<span class="chip chip--video">Vídeo</span>` : ''}`;
}

const tarjeta = r => `
  <a class="card" href="#/receta/${esc(r.id)}">
    ${foto(r, 'card__foto')}
    <div class="card__body">
      <div class="chips">${chips(r)}</div>
      <h3 class="card__titulo">${esc(r.titulo)}</h3>
      ${r.descripcion ? `<p class="card__desc">${esc(r.descripcion)}</p>` : ''}
    </div>
  </a>`;

const estanteria = (titulo, recetas, enlace) => !recetas.length ? '' : `
  <section class="shelf">
    <div class="shelf__head wrap">
      <h2>${titulo}</h2>
      ${enlace ? `<a class="link-more" href="${enlace}">Ver todas</a>` : ''}
    </div>
    <div class="shelf__track">${recetas.map(tarjeta).join('')}</div>
  </section>`;

/* ---------- vistas ---------- */

async function vistaInicio() {
  const recetas = await store.list();
  const ahora = momentoAhora();
  const n = t => recetas.filter(r => r.tipo === t).length;

  $app.innerHTML = `
    <section class="hero">
      <h1 class="hero__title">Sartén.</h1>
      <p class="hero__sub">Todo lo que cocino, en un sitio. Del táper del lunes a la hamburguesa del viernes.</p>
      <div class="hero__ctas">
        <a class="btn btn--primary" href="#/nueva">Añadir receta</a>
        <a class="link-more" href="#/explorar">Explorar recetas</a>
      </div>
    </section>

    ${recetas.length ? '' : `
      <section class="empty wrap">
        <h2>Aún no hay recetas.</h2>
        <p>Pega el enlace de un TikTok y la IA saca los ingredientes y los pasos por ti.</p>
        <a class="btn btn--primary" href="#/nueva">Añadir la primera</a>
      </section>`}

    ${estanteria(FRASE_AHORA[ahora], recetas.filter(r => r.momento === ahora), `#/explorar?m=${ahora}`)}

    ${recetas.length ? `
    <section class="tiles wrap">
      <a class="tile tile--sana" href="#/explorar?t=sana">
        <h2>Sanas</h2>
        <p>${n('sana')} ${n('sana') === 1 ? 'receta' : 'recetas'} para cuidarse entre semana.</p>
        <span class="link-more">Ver sanas</span>
      </a>
      <a class="tile tile--gocheo" href="#/explorar?t=gocheo">
        <h2>Gocheo</h2>
        <p>${n('gocheo')} ${n('gocheo') === 1 ? 'receta' : 'recetas'} para cuando el cuerpo lo pide.</p>
        <span class="link-more">Ver gocheo</span>
      </a>
    </section>` : ''}

    ${MOMENTOS.filter(m => m !== ahora).map(m =>
      estanteria(PLURAL[m], recetas.filter(r => r.momento === m), `#/explorar?m=${m}`)).join('')}
  `;
}

async function vistaExplorar(q) {
  const recetas = await store.list();
  let m = q.get('m') || '', t = q.get('t') || '', texto = q.get('q') || '';

  const seg = (name, value, opciones) => `
    <div class="segmented" role="radiogroup" aria-label="${name === 'm' ? 'Momento del día' : 'Tipo'}">
      ${opciones.map(([v, l]) => `
        <label><input type="radio" name="${name}" value="${v}" ${v === value ? 'checked' : ''}><span>${l}</span></label>`).join('')}
    </div>`;

  $app.innerHTML = `
    <section class="page-head wrap">
      <h1>Explorar</h1>
      <input class="search" type="search" placeholder="Buscar por nombre o ingrediente" value="${esc(texto)}" aria-label="Buscar">
      <div class="filters">
        ${seg('m', m, [['', 'Todo'], ...MOMENTOS.map(x => [x, cap(x)])])}
        ${seg('t', t, [['', 'Todas'], ['sana', 'Sanas'], ['gocheo', 'Gocheo']])}
      </div>
    </section>
    <section class="grid wrap" id="grid"></section>`;

  const pintar = () => {
    const needle = normalizarTexto(texto);
    const res = recetas.filter(r =>
      (!m || r.momento === m) && (!t || r.tipo === t) &&
      (!needle || normalizarTexto(r.titulo + ' ' + r.ingredientes.join(' ')).includes(needle)));
    document.getElementById('grid').innerHTML = res.length
      ? res.map(tarjeta).join('')
      : `<p class="grid__empty">No hay recetas con estos filtros.</p>`;
    const p = new URLSearchParams(Object.entries({ m, t, q: texto }).filter(([, v]) => v));
    history.replaceState(null, '', `#/explorar${p.size ? '?' + p : ''}`);
  };

  $app.querySelector('.search').addEventListener('input', e => { texto = e.target.value; pintar(); });
  $app.querySelectorAll('.segmented input').forEach(i => i.addEventListener('change', e => {
    e.target.name === 'm' ? (m = e.target.value) : (t = e.target.value);
    pintar();
  }));
  pintar();
}

async function vistaReceta(id) {
  const r = await store.get(id);
  if (!r) return vistaNoEncontrada();
  const v = videoEmbed(r.video_url);
  const hechas = (await store.comidas()).filter(c => c.receta_id === r.id && c.hecha).map(c => c.fecha).sort();
  const enLista = extrasLista().includes(r.id);

  $app.innerHTML = `
    <article class="receta">
      <header class="receta__hero wrap">
        <div class="chips">${chips(r)}</div>
        <h1>${esc(r.titulo)}</h1>
        ${r.descripcion ? `<p class="receta__desc">${esc(r.descripcion)}</p>` : ''}
        <p class="receta__meta">
          ${r.raciones ? `${r.raciones} ${r.raciones === 1 ? 'ración' : 'raciones'}` : ''}
          ${r.video_url ? `<a class="link-more" href="${esc(r.video_url)}" target="_blank" rel="noopener">Ver en ${v?.red ?? cap(redDe(r.video_url))}${r.autor_video ? ` (${esc(r.autor_video)})` : ''}</a>` : ''}
        </p>
        <p class="receta__historial">${hechas.length
          ? `La has hecho ${hechas.length === 1 ? 'una vez' : `${hechas.length} veces`}, la última el ${fechaCorta(hechas.at(-1))}.`
          : 'Aún no la has hecho.'}</p>
        <div class="receta__plan">
          <button class="btn btn--primary" type="button" id="hechaHoy">La he hecho hoy</button>
          <details class="planificar">
            <summary class="btn btn--secondary">Planificar</summary>
            <form id="fPlan" class="planificar__form">
              <input type="date" name="fecha" value="${hoy()}" required aria-label="Día">
              <select name="momento" aria-label="Momento">${MOMENTOS.map(m => `<option value="${m}" ${m === r.momento ? 'selected' : ''}>${cap(m)}</option>`).join('')}</select>
              <button class="btn btn--primary" type="submit">Añadir al calendario</button>
            </form>
          </details>
          <button class="btn btn--secondary" type="button" id="aLista" aria-pressed="${enLista}">${enLista ? 'En la lista de la compra' : 'Añadir a la lista'}</button>
        </div>
      </header>

      ${r.foto_url || v ? `
      <div class="receta__media wrap ${r.foto_url && v ? 'receta__media--video' : ''}">
        ${foto(r, 'receta__foto')}
        ${v ? `<div class="video ${v.vertical ? 'video--vertical' : ''}">
          <iframe src="${esc(v.src)}" title="Vídeo original en ${v.red}" loading="lazy"
            allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>` : ''}
      </div>` : ''}

      <div class="receta__body wrap">
        <section class="ingredientes">
          <div class="ingredientes__head">
            <h2>Ingredientes</h2>
            ${r.raciones ? `
            <div class="raciones" role="group" aria-label="Raciones">
              <button type="button" class="btn btn--secondary btn--icono" data-raciones="-1" aria-label="Menos raciones">−</button>
              <span id="nRaciones" aria-live="polite">${r.raciones} ${r.raciones === 1 ? 'ración' : 'raciones'}</span>
              <button type="button" class="btn btn--secondary btn--icono" data-raciones="1" aria-label="Más raciones">+</button>
            </div>` : ''}
          </div>
          <ul>${r.ingredientes.map((x, i) => `
            <li><label><input type="checkbox" id="ing${i}"><span>${esc(x)}</span></label></li>`).join('')}</ul>
        </section>
        <section class="pasos">
          <h2>Preparación</h2>
          <ol>${r.pasos.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
        </section>
      </div>

      ${usuario ? `
      <footer class="receta__acciones wrap">
        <a class="btn btn--secondary" href="#/editar/${esc(r.id)}">Editar</a>
        <button class="btn btn--danger" type="button" id="borrar">Eliminar</button>
      </footer>` : ''}
    </article>`;

  document.title = `${r.titulo} | Sartén`;
  let raciones = r.raciones;
  $app.querySelectorAll('[data-raciones]').forEach(b => b.addEventListener('click', () => {
    raciones = Math.max(1, raciones + Number(b.dataset.raciones));
    document.getElementById('nRaciones').textContent = `${raciones} ${raciones === 1 ? 'ración' : 'raciones'}`;
    $app.querySelectorAll('.ingredientes li span').forEach((el, i) => { el.textContent = escalar(r.ingredientes[i], raciones / r.raciones); });
  }));
  document.getElementById('hechaHoy').addEventListener('click', async () => {
    await store.addComida({ fecha: hoy(), momento: momentoAhora(), receta_id: r.id, hecha: true });
    toast('Apuntada en el calendario de hoy');
    vistaReceta(id);
  });
  document.getElementById('fPlan').addEventListener('submit', async e => {
    e.preventDefault();
    const { fecha, momento } = Object.fromEntries(new FormData(e.target));
    await store.addComida({ fecha, momento, receta_id: r.id, hecha: fecha < hoy() });
    toast(`Añadida al ${diaSemana(fecha)} ${fechaCorta(fecha)}`);
    e.target.closest('details').open = false;
  });
  document.getElementById('aLista').addEventListener('click', e => {
    const dentro = extrasLista().includes(r.id);
    guardarExtras(dentro ? extrasLista().filter(x => x !== r.id) : [...extrasLista(), r.id]);
    e.target.setAttribute('aria-pressed', !dentro);
    e.target.textContent = dentro ? 'Añadir a la lista' : 'En la lista de la compra';
    toast(dentro ? 'Quitada de la lista' : 'Añadida a la lista de la compra');
  });
  document.getElementById('borrar')?.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar «${r.titulo}»? No se puede deshacer.`)) return;
    await store.remove(r.id);
    toast('Receta eliminada');
    location.hash = '#/';
  });
}

async function vistaFormulario(id, q = new URLSearchParams()) {
  if (!usuario) return vistaEntrar();
  const r = id ? await store.get(id) : null;
  if (id && !r) return vistaNoEncontrada();
  const x = r ?? { momento: momentoAhora(), tipo: 'sana', ingredientes: [], pasos: [] };
  let fotoNueva = null, fotoUrl = null;
  let extra = {}; // datos que no pasan por la IA (vídeo e imagen de una receta de Descubrir)

  const radios = (name, opciones, actual) => `
    <div class="segmented" role="radiogroup">
      ${opciones.map(v => `<label><input type="radio" name="${name}" value="${v}" ${v === actual ? 'checked' : ''} required><span>${name === 'tipo' ? ETIQUETA_TIPO[v] : cap(v)}</span></label>`).join('')}
    </div>`;

  $app.innerHTML = `
    <section class="page-head wrap wrap--narrow">
      <h1>${r ? 'Editar receta' : 'Nueva receta'}</h1>
    </section>

    ${r ? '' : `
    <section class="importar wrap wrap--narrow">
      <h2>Importar con IA</h2>
      <p>Pega el enlace de un vídeo de TikTok, Instagram o YouTube, o de cualquier web de recetas. La IA rellena el formulario y tú revisas antes de guardar.</p>
      <form id="fImportar" class="importar__form">
        <input type="url" name="url" placeholder="https://www.tiktok.com/@usuario/video/…" aria-label="Enlace del vídeo o la web">
        <button class="btn btn--primary" type="submit">Importar</button>
        <details>
          <summary>¿La receta solo se dice hablando en el vídeo?</summary>
          <div class="importar__extra">
            <label class="field"><span>Sube el vídeo <small>hasta 12 MB; la IA lo ve y lo escucha</small></span>
              <input type="file" name="video" accept="video/*"></label>
            <label class="field"><span>O pega el texto <small>lo que dice el vídeo, un comentario, tus notas…</small></span>
              <textarea name="texto" rows="4"></textarea></label>
          </div>
        </details>
      </form>
      <p class="importar__estado" id="estadoImport" role="status"></p>
    </section>`}

    <form id="fReceta" class="form wrap wrap--narrow" novalidate>
      <div class="form__foto">
        <label class="foto-drop" for="inFoto">
          <span id="fotoPrev">${x.foto_url ? `<img src="${esc(x.foto_url)}" alt="">` : 'Añadir foto'}</span>
        </label>
        <input id="inFoto" type="file" accept="image/*" hidden>
        <div class="form__foto-acciones">
          <button class="btn btn--secondary" type="button" id="buscarFoto">Buscar foto en internet</button>
          <button class="btn btn--danger" type="button" id="quitarFoto" ${x.foto_url ? '' : 'hidden'}>Quitar foto</button>
        </div>
        <div class="fotos-web" id="fotosWeb" hidden></div>
      </div>

      <label class="field"><span>Nombre</span>
        <input name="titulo" required value="${esc(x.titulo)}" placeholder="Pollo al limón"></label>
      <label class="field"><span>Descripción corta</span>
        <input name="descripcion" value="${esc(x.descripcion)}" placeholder="Una frase para recordarla"></label>

      <fieldset class="field"><legend>Momento del día</legend>${radios('momento', MOMENTOS, x.momento)}</fieldset>
      <fieldset class="field"><legend>Tipo</legend>${radios('tipo', TIPOS, x.tipo)}</fieldset>

      <div class="field-row">
        <label class="field"><span>Minutos</span><input name="tiempo_min" type="number" min="1" inputmode="numeric" value="${esc(x.tiempo_min)}"></label>
        <label class="field"><span>Raciones</span><input name="raciones" type="number" min="1" inputmode="numeric" value="${esc(x.raciones)}"></label>
      </div>

      <label class="field"><span>Ingredientes <small>uno por línea</small></span>
        <textarea name="ingredientes" rows="7" required>${esc(x.ingredientes.join('\n'))}</textarea></label>
      <label class="field"><span>Pasos <small>uno por línea</small></span>
        <textarea name="pasos" rows="8" required>${esc(x.pasos.join('\n'))}</textarea></label>

      <label class="field"><span>Enlace del vídeo <small>opcional</small></span>
        <input name="video_url" type="url" value="${esc(x.video_url)}" placeholder="https://…"></label>
      <input name="autor_video" type="hidden" value="${esc(x.autor_video)}">

      <p class="form__error" id="formError" role="alert"></p>
      <div class="form__acciones">
        <a class="btn btn--secondary" href="${r ? `#/receta/${esc(r.id)}` : '#/'}">Cancelar</a>
        <button class="btn btn--primary" type="submit">Guardar receta</button>
      </div>
    </form>`;

  const f = document.getElementById('fReceta');
  const prev = document.getElementById('fotoPrev');
  const quitar = document.getElementById('quitarFoto');
  const ponerFoto = blob => {
    fotoNueva = blob; fotoUrl = null;
    prev.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="">`;
    quitar.hidden = false;
  };
  const ponerUrl = u => {
    fotoUrl = u; fotoNueva = null;
    prev.innerHTML = u ? `<img src="${esc(u)}" alt="">` : 'Añadir foto';
    quitar.hidden = !u;
  };
  quitar.addEventListener('click', () => ponerUrl(''));

  document.getElementById('inFoto').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (file) ponerFoto(await store.resizeImage(file));
  });

  const web = document.getElementById('fotosWeb');
  // La imagen que trae una receta importada solo se usa si el usuario la toca.
  const sugerirFoto = (src, usar) => {
    web.hidden = false;
    web.innerHTML = `<p>La receta trae una imagen. Tócala si quieres usarla como foto.</p>
      <div class="fotos-web__grid"><button type="button" id="usarSugerida" aria-label="Usar esta imagen"><img src="${esc(src)}" alt=""></button></div>`;
    document.getElementById('usarSugerida').addEventListener('click', () => { usar(); web.hidden = true; });
  };
  document.getElementById('buscarFoto').addEventListener('click', async e => {
    const q = f.elements.titulo.value.trim();
    web.hidden = false;
    if (!q) { web.innerHTML = '<p>Escribe primero el nombre de la receta.</p>'; return f.elements.titulo.focus(); }
    e.target.disabled = true;
    web.innerHTML = '<p>Buscando fotos…</p>';
    try {
      const fotos = await store.buscarFotos(q);
      web.innerHTML = fotos.length ? `
        <div class="fotos-web__grid">${fotos.map((x, i) => `
          <button type="button" data-i="${i}" aria-label="Usar foto de ${esc(x.autor)}"><img src="${esc(x.thumb)}" alt="" loading="lazy"></button>`).join('')}
        </div>
        <p>Fotos de <a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a>. Toca una para usarla.</p>`
        : '<p>No hay fotos para ese nombre. Prueba con algo más general, como «hamburguesa».</p>';
      web.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
        ponerUrl(fotos[b.dataset.i].src);
        web.hidden = true;
      }));
    } catch (err) {
      web.innerHTML = `<p>${esc(err.message)}</p>`;
    } finally {
      e.target.disabled = false;
    }
  });

  document.getElementById('fImportar')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fi = e.target, btn = fi.querySelector('button'), estado = document.getElementById('estadoImport');
    const url = fi.url.value.trim(), texto = fi.texto.value.trim(), archivo = fi.video.files[0];
    estado.className = 'importar__estado';
    if (!url && !texto && !archivo) {
      estado.textContent = 'Pega un enlace, sube un vídeo o escribe el texto de la receta.';
      return estado.classList.add('importar__estado--error');
    }
    if (archivo?.size > 12e6) {
      estado.textContent = 'El vídeo pesa más de 12 MB. Recórtalo o grábalo en menor calidad.';
      return estado.classList.add('importar__estado--error');
    }
    btn.disabled = true;
    estado.textContent = archivo ? 'Viendo el vídeo… puede tardar hasta un minuto.' : 'Leyendo y preparando la receta…';
    try {
      const video = archivo ? await aDataURL(archivo) : '';
      const d = await store.importar({ url, texto, video });
      const set = (k, v) => { if (v != null && v !== '') f.elements[k].value = v; };
      set('titulo', d.titulo); set('descripcion', d.descripcion);
      set('tiempo_min', d.tiempo_min); set('raciones', d.raciones);
      set('ingredientes', d.ingredientes?.join('\n')); set('pasos', d.pasos?.join('\n'));
      set('video_url', d.video_url); set('autor_video', d.autor_video);
      if (MOMENTOS.includes(d.momento)) f.elements.momento.value = d.momento;
      if (TIPOS.includes(d.tipo)) f.elements.tipo.value = d.tipo;
      if (extra.video_url && !f.elements.video_url.value) f.elements.video_url.value = extra.video_url;
      try {
        const blob = d.imagen ? await store.resizeImage(await store.dataURLToBlob(d.imagen))
          : archivo ? await store.resizeImage(await fotograma(archivo)) : null;
        if (blob) sugerirFoto(URL.createObjectURL(blob), () => ponerFoto(blob));
        else if (extra.imagen) sugerirFoto(extra.imagen, () => ponerUrl(extra.imagen));
      } catch { /* sin imagen legible: se puede subir una foto a mano */ }
      estado.textContent = d.nota || 'Listo. Revisa los datos y guarda.';
      estado.classList.add(d.nota ? 'importar__estado--aviso' : 'importar__estado--ok');
    } catch (err) {
      estado.textContent = err.message;
      estado.classList.add('importar__estado--error');
    } finally {
      btn.disabled = false;
    }
  });

  // Viene de Descubrir: se importa solo (la IA traduce y clasifica) y el usuario revisa.
  const idMundo = !r && q.get('descubrir');
  if (idMundo) {
    const m = await platoMundo(idMundo);
    if (m) {
      const fi = document.getElementById('fImportar');
      fi.texto.value = textoPlato(m);
      extra = { video_url: m.strYoutube || '', imagen: m.strMealThumb || '' };
      fi.requestSubmit();
    }
  }

  f.addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('formError');
    if (!f.checkValidity()) {
      err.textContent = 'Faltan el nombre, los ingredientes o los pasos.';
      f.querySelector(':invalid')?.focus();
      return;
    }
    const d = Object.fromEntries(new FormData(f));
    const lineas = s => s.split('\n').map(l => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    const receta = {
      ...(r ?? {}),
      titulo: d.titulo.trim(), descripcion: d.descripcion.trim(),
      momento: d.momento, tipo: d.tipo,
      tiempo_min: +d.tiempo_min || null, raciones: +d.raciones || null,
      ingredientes: lineas(d.ingredientes), pasos: lineas(d.pasos),
      video_url: d.video_url.trim(), autor_video: d.autor_video,
      foto_url: fotoUrl ?? r?.foto_url ?? '',
    };
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const nuevoId = await store.save(receta, fotoNueva);
      toast('Receta guardada');
      location.hash = `#/receta/${nuevoId}`;
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
    }
  });
}

/* ---------- semana: plan y registro ---------- */

const rangoSemana = lunes => {
  const domingo = sumarDias(lunes, 6);
  return aFecha(lunes).getMonth() === aFecha(domingo).getMonth()
    ? `${aFecha(lunes).getDate()} – ${fechaCorta(domingo)}`
    : `${fechaCorta(lunes)} – ${fechaCorta(domingo)}`;
};

const navSemana = (ruta, lunes) => `
  <div class="semana__nav">
    <a class="btn btn--secondary btn--icono" href="#/${ruta}?d=${sumarDias(lunes, -7)}" aria-label="Semana anterior">‹</a>
    <span class="semana__rango">${rangoSemana(lunes)}</span>
    <a class="btn btn--secondary btn--icono" href="#/${ruta}?d=${sumarDias(lunes, 7)}" aria-label="Semana siguiente">›</a>
    ${lunes !== lunesDe(hoy()) ? `<a class="link-more" href="#/${ruta}">Esta semana</a>` : ''}
  </div>`;

async function vistaSemana(q) {
  const lunes = semanaValida(q.get('d'));
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const [recetas, plan] = await Promise.all([store.list(), store.comidas(lunes, dias[6])]);
  const porId = new Map(recetas.map(r => [r.id, r]));
  const h = hoy();

  $app.innerHTML = `
    <section class="page-head wrap">
      <h1>Semana</h1>
      ${navSemana('semana', lunes)}
      <p class="semana__ayuda">Planifica lo que vas a comer y marca lo que ya has cocinado. «Rellenar huecos» propone comidas y cenas para los días que quedan, empezando por lo que hace más tiempo que no haces.</p>
      <div class="semana__acciones">
        <button class="btn btn--primary" type="button" id="rellenar">Rellenar huecos</button>
        <a class="btn btn--secondary" href="#/lista?d=${lunes}">Lista de la compra</a>
      </div>
    </section>

    <section class="semana wrap">${dias.map(d => `
      <article class="dia ${d === h ? 'dia--hoy' : ''} ${d < h ? 'dia--pasado' : ''}">
        <h2 class="dia__titulo">${cap(diaSemana(d))} <span>${aFecha(d).getDate()}</span>${d === h ? ' <em>Hoy</em>' : ''}</h2>
        ${MOMENTOS.map(m => `
        <div class="slot">
          <h3>${cap(m)}</h3>
          ${plan.filter(c => c.fecha === d && c.momento === m && porId.has(c.receta_id)).map(c => {
            const r = porId.get(c.receta_id);
            return `
          <div class="comida ${c.hecha ? 'comida--hecha' : ''}">
            <input type="checkbox" data-hecha="${esc(c.id)}" ${c.hecha ? 'checked' : ''} aria-label="${esc(r.titulo)} hecha">
            ${foto(r, 'comida__foto')}
            <a href="#/receta/${esc(r.id)}">${esc(r.titulo)}</a>
            <button type="button" class="comida__quitar" data-quitar="${esc(c.id)}" aria-label="Quitar ${esc(r.titulo)}">×</button>
          </div>`; }).join('')}
          <button type="button" class="slot__add" data-dia="${d}" data-momento="${m}" aria-label="Añadir ${m} el ${diaSemana(d)}">+ Añadir</button>
        </div>`).join('')}
      </article>`).join('')}
    </section>

    <dialog class="selector" id="selector" aria-labelledby="selTitulo">
      <form method="dialog" class="selector__head">
        <h2 id="selTitulo"></h2>
        <button class="selector__cerrar" aria-label="Cerrar">×</button>
      </form>
      <input class="search" type="search" placeholder="Buscar receta" id="selBuscar" aria-label="Buscar receta">
      <label class="selector__todas"><input type="checkbox" id="selTodas"> Ver también las de otros momentos</label>
      <div class="selector__lista" id="selLista"></div>
    </dialog>`;

  const repintar = () => vistaSemana(q);
  const dlg = document.getElementById('selector');
  let hueco = null;

  const pintarSelector = () => {
    const texto = normalizarTexto(document.getElementById('selBuscar').value);
    const todas = document.getElementById('selTodas').checked;
    const res = recetas.filter(r => (todas || r.momento === hueco.momento) && normalizarTexto(r.titulo).includes(texto));
    document.getElementById('selLista').innerHTML = res.length ? res.map(r => `
      <button type="button" class="selector__item" data-receta="${esc(r.id)}">
        ${foto(r, 'comida__foto')}<span>${esc(r.titulo)}</span><span class="chip chip--${r.tipo}">${ETIQUETA_TIPO[r.tipo]}</span>
      </button>`).join('')
      : `<p class="grid__empty">No hay recetas${todas ? '' : ` de ${hueco.momento}`}. ${todas ? '' : 'Marca «Ver también las de otros momentos».'}</p>`;
  };

  $app.addEventListener('click', async function clic(e) {
    if (!document.body.contains(dlg)) return $app.removeEventListener('click', clic);
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.dia) {
      hueco = { fecha: t.dataset.dia, momento: t.dataset.momento };
      document.getElementById('selTitulo').textContent = `${cap(hueco.momento)} del ${diaSemana(hueco.fecha)} ${aFecha(hueco.fecha).getDate()}`;
      document.getElementById('selBuscar').value = '';
      pintarSelector();
      dlg.showModal();
    } else if (t.dataset.receta) {
      await store.addComida({ ...hueco, receta_id: t.dataset.receta, hecha: hueco.fecha < h });
      dlg.close();
      repintar();
    } else if (t.dataset.quitar) {
      await store.removeComida(t.dataset.quitar);
      repintar();
    }
  });
  $app.querySelectorAll('[data-hecha]').forEach(c => c.addEventListener('change', async () => {
    await store.updateComida(c.dataset.hecha, { hecha: c.checked });
    c.closest('.comida').classList.toggle('comida--hecha', c.checked);
  }));
  document.getElementById('selBuscar').addEventListener('input', pintarSelector);
  document.getElementById('selTodas').addEventListener('change', pintarSelector);

  document.getElementById('rellenar').addEventListener('click', async e => {
    e.target.disabled = true;
    const n = await rellenarHuecos(dias.filter(d => d >= h), recetas, plan);
    toast(n ? `${n === 1 ? 'Añadida 1 comida' : `Añadidas ${n} comidas`}. Cámbialas a tu gusto.` : 'No quedan huecos de comida o cena, o faltan recetas para ellos.');
    repintar();
  });
}

// Rellena las comidas y cenas vacías. Primero las recetas que nunca has hecho o que hace más
// tiempo que no haces; no repite en la semana salvo que no queden más.
async function rellenarHuecos(dias, recetas, plan) {
  const ultima = new Map();
  for (const c of await store.comidas()) if ((ultima.get(c.receta_id) ?? '') < c.fecha) ultima.set(c.receta_id, c.fecha);
  const usadas = new Set(plan.map(c => c.receta_id));
  let n = 0;
  for (const fecha of dias) {
    for (const momento of ['comida', 'cena']) {
      if (plan.some(c => c.fecha === fecha && c.momento === momento)) continue;
      const delDia = new Set(plan.filter(c => c.fecha === fecha).map(c => c.receta_id));
      const deMomento = recetas.filter(r => r.momento === momento && !delDia.has(r.id));
      // Si no hay recetas de cena, vale una de comida (y al revés).
      const base = deMomento.length ? deMomento : recetas.filter(r => ['comida', 'cena'].includes(r.momento) && !delDia.has(r.id));
      const nuevas = base.filter(r => !usadas.has(r.id));
      const opciones = (nuevas.length ? nuevas : base)
        .map(r => [Math.random(), r]).sort((a, b) => a[0] - b[0]).map(([, r]) => r) // barajar para desempatar
        .sort((a, b) => (ultima.get(a.id) ?? '').localeCompare(ultima.get(b.id) ?? ''));
      if (!opciones.length) continue;
      const c = { fecha, momento, receta_id: opciones[0].id, hecha: false };
      await store.addComida(c);
      plan.push(c);
      usadas.add(c.receta_id);
      n++;
    }
  }
  return n;
}

/* ---------- lista de la compra ---------- */

// Recetas sueltas añadidas a mano a la lista (por usuario y navegador).
const claveExtras = () => `sarten.lista.extra.${usuario?.id ?? 'demo'}`;
const extrasLista = () => JSON.parse(localStorage.getItem(claveExtras()) ?? '[]');
const guardarExtras = ids => localStorage.setItem(claveExtras(), JSON.stringify(ids));

async function vistaLista(q) {
  const lunes = semanaValida(q.get('d'));
  const h = hoy();
  const [recetas, plan] = await Promise.all([store.list(), store.comidas(lunes, sumarDias(lunes, 6))]);
  const porId = new Map(recetas.map(r => [r.id, r]));
  // Lo planificado que aún no has cocinado, más las recetas sueltas.
  const planificadas = plan.filter(c => !c.hecha && c.fecha >= h && porId.has(c.receta_id)).map(c => porId.get(c.receta_id));
  const extras = extrasLista().map(id => porId.get(id)).filter(Boolean);
  const incluidas = [...planificadas, ...extras];
  // 0 = cantidades tal cual vienen en cada receta; N = cada comida escalada a N personas.
  const clavePersonas = `sarten.lista.personas.${usuario?.id ?? 'demo'}`;
  const personas = Number(localStorage.getItem(clavePersonas)) || 0;
  const factor = r => (personas && r.raciones ? personas / r.raciones : 1);
  const items = juntarIngredientes(incluidas.flatMap(r => r.ingredientes.map(texto => ({ texto, receta: r.titulo, factor: factor(r) }))));

  const claveMarcas = `sarten.lista.marcados.${usuario?.id ?? 'demo'}.${lunes}`;
  const marcados = new Set(JSON.parse(localStorage.getItem(claveMarcas) ?? '[]'));
  const resumen = [...new Set(planificadas)];

  $app.innerHTML = `
    <section class="page-head wrap wrap--narrow">
      <h1>Lista de la compra</h1>
      ${navSemana('lista', lunes)}
      <p class="semana__ayuda">Los ingredientes de lo que tienes planificado y aún no has cocinado esta semana, más las recetas que añadas sueltas. Los repetidos se suman.</p>
    </section>

    <section class="lista wrap wrap--narrow">${incluidas.length ? `
      <div class="lista__personas">
        <label for="personas">Cantidades para</label>
        <select id="personas">
          <option value="0">lo que diga cada receta</option>
          ${[1, 2, 3, 4, 5, 6, 8].map(n => `<option value="${n}" ${n === personas ? 'selected' : ''}>${n} ${n === 1 ? 'persona' : 'personas'} por comida</option>`).join('')}
        </select>
        ${personas && incluidas.some(r => !r.raciones) ? '<p>Las recetas que no dicen para cuántas raciones son se quedan como están.</p>' : ''}
      </div>
      <div class="lista__origen">
        ${resumen.length ? `<p><strong>De la semana:</strong> ${resumen.map(r => esc(r.titulo)).join(', ')}.</p>` : ''}
        ${extras.length ? `<p><strong>Sueltas:</strong></p>
        <div class="chips">${extras.map(r => `
          <span class="chip chip--quitable">${esc(r.titulo)}
            <button type="button" data-quitar-extra="${esc(r.id)}" aria-label="Quitar ${esc(r.titulo)} de la lista">×</button></span>`).join('')}
        </div>` : ''}
      </div>
      <div class="ingredientes">
        <ul>${items.map(it => `
          <li><label><input type="checkbox" data-clave="${esc(it.clave)}" ${marcados.has(it.clave) ? 'checked' : ''}>
            <span>${esc(it.texto)}${it.recetas.length > 1 ? ` <small>${it.recetas.length} recetas</small>` : ''}</span></label></li>`).join('')}
        </ul>
      </div>
      <div class="form__acciones">
        <button class="btn btn--primary" type="button" id="copiar">Copiar lo que falta</button>
      </div>` : `
      <div class="empty">
        <h2>No hay nada que comprar.</h2>
        <p>Planifica comidas en la semana o pulsa «Añadir a la lista» en cualquier receta.</p>
        <a class="btn btn--primary" href="#/semana?d=${lunes}">Ir a la semana</a>
      </div>`}
    </section>`;

  $app.querySelectorAll('[data-clave]').forEach(c => c.addEventListener('change', () => {
    c.checked ? marcados.add(c.dataset.clave) : marcados.delete(c.dataset.clave);
    localStorage.setItem(claveMarcas, JSON.stringify([...marcados]));
  }));
  document.getElementById('personas')?.addEventListener('change', e => {
    localStorage.setItem(clavePersonas, e.target.value);
    vistaLista(q);
  });
  $app.querySelectorAll('[data-quitar-extra]').forEach(b => b.addEventListener('click', () => {
    guardarExtras(extrasLista().filter(id => id !== b.dataset.quitarExtra));
    vistaLista(q);
  }));
  document.getElementById('copiar')?.addEventListener('click', async () => {
    const faltan = items.filter(it => !marcados.has(it.clave)).map(it => `- ${it.texto}`);
    try {
      await navigator.clipboard.writeText(`Lista de la compra (${rangoSemana(lunes)})\n${faltan.join('\n')}`);
      toast('Lista copiada. Pégala donde quieras.');
    } catch {
      toast('El navegador no ha dejado copiar. Selecciona la lista a mano.');
    }
  });
}

/* ---------- descubrir: platos de otros países (TheMealDB) ---------- */

// API abierta y gratuita; la clave "1" es la de pruebas, válida para proyectos personales y educativos.
const MEALDB = 'https://www.themealdb.com/api/json/v1/1/';
async function mealdb(ruta) {
  const r = await fetch(MEALDB + ruta).catch(() => null);
  if (!r?.ok) throw new Error('No se ha podido conectar con TheMealDB. Comprueba la conexión y prueba otra vez.');
  return r.json();
}
const platoMundo = async id => (await mealdb(`lookup.php?i=${encodeURIComponent(id)}`)).meals?.[0] ?? null;

const PAISES = {
  Algerian: 'Argelia', American: 'Estados Unidos', Argentinian: 'Argentina', Australian: 'Australia', British: 'Reino Unido',
  Canadian: 'Canadá', Chinese: 'China', Croatian: 'Croacia', Dutch: 'Países Bajos', Egyptian: 'Egipto', Filipino: 'Filipinas',
  French: 'Francia', Greek: 'Grecia', Indian: 'India', Irish: 'Irlanda', Italian: 'Italia', Jamaican: 'Jamaica',
  Japanese: 'Japón', Kenyan: 'Kenia', Malaysian: 'Malasia', Mexican: 'México', Moroccan: 'Marruecos', Norwegian: 'Noruega',
  Polish: 'Polonia', Portuguese: 'Portugal', Russian: 'Rusia', 'Saudi Arabian': 'Arabia Saudí', Slovakian: 'Eslovaquia',
  Spanish: 'España', Syrian: 'Siria', Thai: 'Tailandia', Tunisian: 'Túnez', Turkish: 'Turquía', Ukrainian: 'Ucrania',
  Uruguayan: 'Uruguay', Venezulan: 'Venezuela', Vietnamese: 'Vietnam',
};
const pais = a => PAISES[a] ?? a;

const ingredientesPlato = m => Array.from({ length: 20 }, (_, i) => [m[`strMeasure${i + 1}`], m[`strIngredient${i + 1}`]])
  .filter(([, ing]) => ing?.trim()).map(([medida, ing]) => `${medida?.trim() ?? ''} ${ing.trim()}`.trim());
const pasosPlato = m => (m.strInstructions ?? '').split(/\r?\n+/)
  .map(p => p.replace(/^\s*(?:step\s*\d+[:.]?|\d+[.)])\s*/i, '').trim()).filter(p => p.length > 3);
const textoPlato = m => `Receta típica de ${pais(m.strArea)} (${m.strCategory}): ${m.strMeal}
Ingredientes:
${ingredientesPlato(m).map(x => `- ${x}`).join('\n')}
Preparación:
${pasosPlato(m).join('\n')}`;

async function vistaDescubrir(q) {
  const elegido = q.get('p') || 'Italian';
  const [{ meals: areas }, { meals }] = await Promise.all([
    mealdb('list.php?a=list'),
    mealdb(`filter.php?a=${encodeURIComponent(elegido)}`),
  ]);
  const lista = areas.map(a => a.strArea).filter(a => a !== 'Unknown').sort((a, b) => pais(a).localeCompare(pais(b), 'es'));

  $app.innerHTML = `
    <section class="page-head wrap">
      <h1>Descubrir</h1>
      <p class="semana__ayuda">Platos típicos de ${lista.length} países, de la base de datos abierta TheMealDB. Vienen en inglés: al guardar uno en tus recetas, la IA lo traduce.</p>
    </section>
    <nav class="paises" aria-label="Países">${lista.map(a => `
      <a class="pais" href="#/descubrir?p=${encodeURIComponent(a)}" ${a === elegido ? 'aria-current="page"' : ''}>${esc(pais(a))}</a>`).join('')}
    </nav>
    <section class="grid wrap">${(meals ?? []).map(m => `
      <a class="card" href="#/descubrir/${esc(m.idMeal)}">
        <img class="foto card__foto" src="${esc(m.strMealThumb)}" alt="" loading="lazy">
        <div class="card__body"><h3 class="card__titulo">${esc(m.strMeal)}</h3></div>
      </a>`).join('') || '<p class="grid__empty">No hay platos de este país.</p>'}
    </section>`;
  document.title = `Descubrir: ${pais(elegido)} | Sartén`;
  requestAnimationFrame(() => $app.querySelector('.pais[aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
}

async function vistaPlatoMundo(id) {
  const m = await platoMundo(id);
  if (!m) return vistaNoEncontrada();
  $app.innerHTML = `
    <article class="receta">
      <header class="receta__hero wrap">
        <div class="chips"><span class="chip">${esc(pais(m.strArea))}</span>${m.strCategory ? `<span class="chip">${esc(m.strCategory)}</span>` : ''}</div>
        <h1>${esc(m.strMeal)}</h1>
        <p class="receta__meta">
          ${m.strYoutube ? `<a class="link-more" href="${esc(m.strYoutube)}" target="_blank" rel="noopener">Ver el vídeo en YouTube</a>` : ''}
          ${m.strSource ? `<a class="link-more" href="${esc(m.strSource)}" target="_blank" rel="noopener">Receta original</a>` : ''}
        </p>
        <div class="receta__plan">
          <a class="btn btn--primary" href="#/nueva?descubrir=${esc(m.idMeal)}">Guardar en mis recetas</a>
          <a class="btn btn--secondary" href="#/descubrir?p=${encodeURIComponent(m.strArea)}">Más de ${esc(pais(m.strArea))}</a>
        </div>
      </header>
      <div class="receta__media wrap"><img class="foto receta__foto" src="${esc(m.strMealThumb)}" alt=""></div>
      <div class="receta__body wrap">
        <section class="ingredientes">
          <h2>Ingredientes</h2>
          <ul>${ingredientesPlato(m).map(x => `<li><label><input type="checkbox"><span>${esc(x)}</span></label></li>`).join('')}</ul>
        </section>
        <section class="pasos">
          <h2>Preparación</h2>
          <ol>${pasosPlato(m).map(x => `<li>${esc(x)}</li>`).join('')}</ol>
        </section>
      </div>
    </article>`;
  document.title = `${m.strMeal} | Sartén`;
}

/* ---------- cuentas ---------- */

function vistaEntrar() {
  $app.innerHTML = `
    <section class="auth wrap">
      <h1>Entra en Sartén.</h1>
      <p>Tu recetario, tu semana y tu lista de la compra, en una cuenta privada.</p>
      <form id="fEntrar" class="auth__form auth__form--cuenta">
        <input type="email" name="email" required placeholder="tu@correo.com" autocomplete="email" aria-label="Correo">
        <input type="password" name="password" required minlength="6" placeholder="Contraseña (mínimo 6 caracteres)" autocomplete="current-password" aria-label="Contraseña">
        <button class="btn btn--primary" type="submit" value="entrar">Entrar</button>
        <button class="btn btn--secondary" type="submit" value="crear">Crear cuenta</button>
      </form>
      <p class="importar__estado" id="estadoEntrar" role="status"></p>
    </section>`;
  document.getElementById('fEntrar').addEventListener('submit', async e => {
    e.preventDefault();
    const est = document.getElementById('estadoEntrar');
    const { email, password } = Object.fromEntries(new FormData(e.target));
    est.className = 'importar__estado';
    try {
      if (e.submitter?.value === 'crear') {
        const confirmar = await store.crearCuenta(email, password);
        if (confirmar) est.textContent = 'Te hemos enviado un correo. Abre el enlace para activar la cuenta y luego entra.';
      } else {
        await store.entrar(email, password);
      }
    } catch (err) {
      est.textContent = err.message;
      est.classList.add('importar__estado--error');
    }
  });
}

function vistaNoEncontrada() {
  $app.innerHTML = `
    <section class="empty wrap">
      <h1>Esta receta no existe.</h1>
      <p>Puede que se haya eliminado.</p>
      <a class="btn btn--primary" href="#/explorar">Ir a Explorar</a>
    </section>`;
}

/* ---------- router ---------- */

async function router() {
  const [path, qs] = location.hash.slice(1).split('?');
  const partes = (path || '/').split('/').filter(Boolean);
  const q = new URLSearchParams(qs);
  document.title = 'Sartén';
  document.querySelectorAll('[data-nav]').forEach(a =>
    a.toggleAttribute('aria-current', a.dataset.nav === (partes[0] === 'editar' ? 'nueva' : partes[0])));

  try {
    // Con cuentas (Supabase), todo es privado: sin sesión solo se ve la pantalla de entrar.
    if (store.modo === 'supabase' && !usuario) return vistaEntrar();
    switch (partes[0]) {
      case undefined: await vistaInicio(); break;
      case 'semana': await vistaSemana(q); break;
      case 'lista': await vistaLista(q); break;
      case 'explorar': await vistaExplorar(q); break;
      case 'receta': await vistaReceta(partes[1]); break;
      case 'nueva': await vistaFormulario(undefined, q); break;
      case 'descubrir': await (partes[1] ? vistaPlatoMundo(partes[1]) : vistaDescubrir(q)); break;
      case 'editar': await vistaFormulario(partes[1]); break;
      case 'entrar': location.hash = '#/'; break;
      default: vistaNoEncontrada();
    }
  } catch (err) {
    console.error(err);
    $app.innerHTML = `<section class="empty wrap"><h1>No se han podido cargar las recetas.</h1><p>${esc(err.message)}</p></section>`;
  }
  window.scrollTo(0, 0);
}

function pintarAuth() {
  if (store.modo !== 'supabase') return;
  $auth.hidden = !usuario;
  $auth.textContent = 'Salir';
  $auth.title = usuario ? `Salir de ${usuario.email}` : '';
}

$auth.addEventListener('click', async () => {
  await store.salir();
  toast('Sesión cerrada');
});

// Instalada como app (pantalla de inicio): barra de pestañas abajo en vez del menú de arriba.
document.documentElement.classList.toggle('app', matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);

await store.init();
usuario = await store.user();
store.onAuth(u => {
  const cambio = !!u !== !!usuario;
  usuario = u; pintarAuth();
  if (cambio) router();
});
pintarAuth();
window.addEventListener('hashchange', router);
router();
// Instalable como app y disponible sin conexión (solo en https o localhost).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(err => console.warn('Sin modo offline:', err));
