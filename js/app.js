import * as store from './store.js';
import { MOMENTOS, TIPOS } from './store.js';

const $app = document.getElementById('app');
const $auth = document.getElementById('authBtn');
let usuario = null;

/* ---------- utilidades ---------- */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
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

/* ---------- componentes ---------- */

function foto(r, cls = '') {
  return r.foto_url
    ? `<img class="foto ${cls}" src="${esc(r.foto_url)}" alt="" loading="lazy">`
    : `<div class="foto foto--vacia foto--${r.momento} ${cls}" aria-hidden="true"><span>${esc(r.titulo.charAt(0))}</span></div>`;
}

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
    const needle = texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const res = recetas.filter(r =>
      (!m || r.momento === m) && (!t || r.tipo === t) &&
      (!needle || norm(r.titulo + ' ' + r.ingredientes.join(' ')).includes(needle)));
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
      </header>

      <div class="receta__media wrap ${v ? 'receta__media--video' : ''}">
        ${foto(r, 'receta__foto')}
        ${v ? `<div class="video ${v.vertical ? 'video--vertical' : ''}">
          <iframe src="${esc(v.src)}" title="Vídeo original en ${v.red}" loading="lazy"
            allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>` : ''}
      </div>

      <div class="receta__body wrap">
        <section class="ingredientes">
          <h2>Ingredientes</h2>
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
  document.getElementById('borrar')?.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar «${r.titulo}»? No se puede deshacer.`)) return;
    await store.remove(r.id);
    toast('Receta eliminada');
    location.hash = '#/';
  });
}

async function vistaFormulario(id) {
  if (!usuario) return vistaEntrar();
  const r = id ? await store.get(id) : null;
  if (id && !r) return vistaNoEncontrada();
  const x = r ?? { momento: momentoAhora(), tipo: 'sana', ingredientes: [], pasos: [] };
  let fotoNueva = null, fotoUrl = null;

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
      <h2>Importar desde un vídeo</h2>
      <p>Pega el enlace de TikTok, Instagram o YouTube. La IA lee la descripción del vídeo y rellena el formulario; tú revisas antes de guardar.</p>
      <form id="fImportar" class="importar__form">
        <input type="url" name="url" placeholder="https://www.tiktok.com/@usuario/video/…" required aria-label="Enlace del vídeo">
        <button class="btn btn--primary" type="submit">Importar con IA</button>
        <details>
          <summary>¿La receta solo se dice hablando en el vídeo?</summary>
          <textarea name="texto" rows="4" placeholder="Pega aquí lo que dice el vídeo, un comentario fijado o tus notas. La IA lo ordenará."></textarea>
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
        <button class="btn btn--secondary" type="button" id="buscarFoto">Buscar foto en internet</button>
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
  const ponerFoto = blob => {
    fotoNueva = blob; fotoUrl = null;
    prev.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="">`;
  };

  document.getElementById('inFoto').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (file) ponerFoto(await store.resizeImage(file));
  });

  const web = document.getElementById('fotosWeb');
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
        fotoUrl = fotos[b.dataset.i].src; fotoNueva = null;
        prev.innerHTML = `<img src="${esc(fotoUrl)}" alt="">`;
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
    btn.disabled = true;
    estado.className = 'importar__estado';
    estado.textContent = 'Leyendo el vídeo y preparando la receta…';
    try {
      const d = await store.importar(fi.url.value.trim(), fi.texto.value.trim());
      const set = (k, v) => { if (v != null && v !== '') f.elements[k].value = v; };
      set('titulo', d.titulo); set('descripcion', d.descripcion);
      set('tiempo_min', d.tiempo_min); set('raciones', d.raciones);
      set('ingredientes', d.ingredientes?.join('\n')); set('pasos', d.pasos?.join('\n'));
      set('video_url', d.video_url); set('autor_video', d.autor_video);
      if (MOMENTOS.includes(d.momento)) f.elements.momento.value = d.momento;
      if (TIPOS.includes(d.tipo)) f.elements.tipo.value = d.tipo;
      if (d.imagen) {
        try { ponerFoto(await store.resizeImage(await store.dataURLToBlob(d.imagen))); }
        catch { /* miniatura ilegible: se puede subir una foto a mano */ }
      }
      estado.textContent = d.nota || 'Listo. Revisa los datos y guarda.';
      estado.classList.add(d.nota ? 'importar__estado--aviso' : 'importar__estado--ok');
    } catch (err) {
      estado.textContent = err.message;
      estado.classList.add('importar__estado--error');
    } finally {
      btn.disabled = false;
    }
  });

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
      if (!fotoNueva && !receta.foto_url) receta.foto_url = await fotoAuto(receta.titulo);
      const nuevoId = await store.save(receta, fotoNueva);
      toast('Receta guardada');
      location.hash = `#/receta/${nuevoId}`;
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
    }
  });
}

function vistaEntrar() {
  $app.innerHTML = `
    <section class="auth wrap">
      <h1>Entrar</h1>
      <p>Solo el dueño del recetario puede añadir y editar recetas. Te enviaremos un enlace de acceso al correo.</p>
      <form id="fEntrar" class="auth__form">
        <input type="email" name="email" required placeholder="tu@correo.com" autocomplete="email" aria-label="Correo">
        <button class="btn btn--primary" type="submit">Enviar enlace</button>
      </form>
      <p class="importar__estado" id="estadoEntrar" role="status"></p>
    </section>`;
  document.getElementById('fEntrar').addEventListener('submit', async e => {
    e.preventDefault();
    const est = document.getElementById('estadoEntrar');
    try {
      await store.signIn(e.target.email.value);
      est.textContent = 'Revisa tu correo y abre el enlace desde este dispositivo.';
    } catch {
      est.textContent = 'Ese correo no tiene acceso a este recetario.';
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

/* ---------- fotos automáticas ---------- */

// Primera foto de Pexels para el plato, o '' si no hay (o no está configurado).
const fotoAuto = titulo => store.buscarFotos(titulo).then(f => f[0]?.src ?? '', () => '');

// Pone foto a las recetas que no tienen. Solo con sesión, porque guarda cambios.
async function rellenarFotos() {
  if (!usuario) return;
  const sinFoto = (await store.list()).filter(r => !r.foto_url);
  let cambios = 0;
  for (const r of sinFoto) {
    const foto_url = await fotoAuto(r.titulo);
    if (foto_url) { await store.save({ ...r, foto_url }); cambios++; }
  }
  if (cambios) router();
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
    switch (partes[0]) {
      case undefined: await vistaInicio(); break;
      case 'explorar': await vistaExplorar(q); break;
      case 'receta': await vistaReceta(partes[1]); break;
      case 'nueva': await vistaFormulario(); break;
      case 'editar': await vistaFormulario(partes[1]); break;
      case 'entrar': vistaEntrar(); break;
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
  $auth.hidden = false;
  $auth.textContent = usuario ? 'Salir' : 'Entrar';
}

$auth.addEventListener('click', async () => {
  if (usuario) { await store.signOut(); toast('Sesión cerrada'); }
  else location.hash = '#/entrar';
});

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
rellenarFotos();
