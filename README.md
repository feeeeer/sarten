# Sartén 🍳

Mi recetario personal. Guardo todas mis recetas, las clasifico por **desayuno, comida, merienda y cena** y por **sana o gocheo**, planifico las comidas de la semana y saco la lista de la compra. Las recetas las puedo importar con IA desde un vídeo de TikTok, Instagram o YouTube, o desde cualquier web de recetas.

El diseño está inspirado en las páginas de producto de Apple: tipografía grande, mucho espacio, barra de navegación translúcida y estanterías con scroll horizontal. Funciona en móvil, tablet y ordenador, y tiene modo oscuro.

## Qué hace

- **Recetario**: ingredientes que se van tachando, pasos y el vídeo original al lado. Las cantidades se recalculan si cambias las raciones. La foto es opcional: solo aparece si la subes o eliges una (de Pexels o la que trae la receta importada).
- **Descubrir**: platos típicos de unos 30 países sacados de [TheMealDB](https://www.themealdb.com), una base de datos abierta. *Guardar en mis recetas* lo pasa por la IA, que lo traduce al español y lo clasifica.
- **Importar con IA** desde:
  - **TikTok**: lee la descripción del vídeo.
  - **YouTube**: Gemini ve el vídeo entero desde el enlace.
  - **Webs de recetas**: lee la receta estructurada (schema.org) que llevan casi todas.
  - **Instagram**: lee la descripción del post cuando Instagram lo deja.
  - **Un vídeo subido**: Gemini lo ve y lo escucha. Es la solución cuando la receta solo se cuenta hablando.
- **Semana**: planificas desayuno, comida, merienda y cena; marcas lo que has cocinado; *Rellenar huecos* propone comidas y cenas empezando por lo que hace más tiempo que no haces.
- **Lista de la compra**: junta los ingredientes de lo planificado y de las recetas que añadas, suma los repetidos (`200 g de arroz` + `0,1 kg de arroz` → `300 g de arroz`), escala las cantidades a las personas que elijas y se copia para mandarla por WhatsApp.
- **App en el móvil (PWA)**: se instala en la pantalla de inicio, abre a pantalla completa, funciona sin conexión y, instalada, tiene una barra de pestañas abajo (recetas, descubrir, añadir, semana y lista).
- **Cuentas**: con Supabase, cada persona tiene su recetario, su calendario y sus fotos, privados.

## Tecnologías

| Parte | Qué uso | Por qué |
|---|---|---|
| Frontend | HTML, CSS y JavaScript nativos (módulos ES) | Sin frameworks ni build: se entiende todo el código |
| Datos, cuentas y fotos | [Supabase](https://supabase.com) (Postgres + Auth + Storage) | Capa gratuita, se usa desde el navegador y la seguridad va en la base de datos (RLS) |
| IA | [Gemini API](https://aistudio.google.com) (modelo Flash) | Capa gratuita, entiende texto, imágenes y vídeo, y devuelve JSON con esquema |
| Fotos | [Pexels API](https://www.pexels.com/api/) | Fotos de platos gratis y con licencia libre |
| Platos del mundo | [TheMealDB](https://www.themealdb.com/api.php) | API abierta; la clave de pruebas `1` vale para proyectos personales y educativos |
| Servidor | Funciones serverless en [Vercel](https://vercel.com) (`api/`) | Las claves de la IA y de Pexels no pueden estar en el navegador |

## Cómo funciona la importación

1. Pego un enlace, subo un vídeo o pego un texto (o varias cosas a la vez).
2. `api/importar.js` reúne todo lo que puede del enlace:
   - TikTok y YouTube: endpoint oficial **oEmbed** (descripción, autor, miniatura).
   - Webs e Instagram: etiquetas **Open Graph** y la receta **schema.org (JSON-LD)**. Si la web no la tiene, coge el texto visible de la página.
3. Se lo envía todo a Gemini con un esquema JSON fijo (título, momento, sana/gocheo, ingredientes, pasos…). Si Gemini está saturado, reintenta y cambia a un modelo más ligero.
4. El formulario se rellena solo, reviso y guardo. La imagen se guarda como foto propia, porque las URLs de TikTok caducan. Si he subido un vídeo, la foto sale de un fotograma.

**Limitaciones:** no descargo vídeos de TikTok ni de Instagram: va contra sus condiciones y es frágil. Por eso existe la opción de subir el vídeo. Instagram bloquea a menudo la lectura de posts desde fuera.

## Estructura

```
index.html            Página única (router por hash: #/, #/explorar, #/semana, #/lista, #/receta/:id, #/nueva)
css/styles.css        Todo el diseño
js/app.js             Vistas y navegación
js/store.js           Datos: Supabase o, si no está configurado, localStorage (modo demo)
js/lista.js           Junta, suma y escala ingredientes (lista de la compra y raciones)
manifest.webmanifest  Nombre, iconos y accesos directos de la app instalada
sw.js                 Service worker: guarda la app para abrirla sin conexión
js/config.js          URL y clave pública de Supabase
api/importar.js       Función serverless: enlace / vídeo / texto → receta con IA
api/fotos.js          Función serverless: busca fotos del plato en Pexels
supabase/schema.sql   Tablas, políticas de seguridad por usuario y bucket de fotos
test/                 Pruebas (npm test)
dev.js                Servidor local sin dependencias (npm run dev)
```

## Arrancar en local

Necesitas Node 20.12 o superior (`node -v`).

```bash
npm run dev     # http://localhost:3000
npm test        # pruebas del lector de webs y de la lista de la compra
```

Sin configurar nada funciona en **modo demo**: todo se guarda en el navegador y trae 4 recetas de ejemplo.

Para la importación con IA y las fotos:

1. Crea una clave gratis en https://aistudio.google.com/apikey
2. Copia `.env.example` como `.env` y pega la clave en `GEMINI_API_KEY`.
3. Para las fotos, saca otra clave gratis en https://www.pexels.com/api/ y ponla en `PEXELS_API_KEY`.
4. Reinicia `npm run dev`.

## Cuentas y datos en la nube (Supabase)

1. Crea un proyecto en https://supabase.com (plan gratuito).
2. **SQL Editor → New query**: pega `supabase/schema.sql` y pulsa *Run*.
3. **Authentication → Sign In / Providers → Email**: déjalo activado. Mientras pruebas, desactiva *Confirm email*: el correo gratuito de Supabase solo manda unos pocos al día.
4. **Authentication → URL Configuration**: en *Site URL* pon la URL de Vercel (y añade `http://localhost:3000` en *Redirect URLs*).
5. **Project Settings → API**: copia *Project URL* y *anon public key* en `js/config.js` y en `.env`.
6. Abre la web y pulsa **Crear cuenta**.

La clave *anon* es pública por diseño. Lo que protege los datos son las políticas RLS: cada fila lleva el `user_id` de su dueño y la base de datos solo deja verla y cambiarla a ese usuario.

Las recetas que hayas guardado en modo demo se quedan en ese navegador y no pasan a tu cuenta.

## Publicar (Vercel)

1. Sube el repo a GitHub (el `.gitignore` ya excluye `.env`).
2. En https://vercel.com → *Add New Project* → importa el repo. No hace falta configurar framework ni build.
3. En *Settings → Environment Variables* añade `GEMINI_API_KEY`, `PEXELS_API_KEY`, `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
4. Cada `git push` vuelve a desplegar.

Antes de abrirla a más gente:

- **Vídeos subidos**: Vercel limita las peticiones a 4,5 MB, así que en producción solo pasarán vídeos muy cortos. La solución es subirlos primero a Supabase Storage y que la función los lea de ahí.
- **Cuota de la IA**: todos los usuarios gastan tus claves de Gemini y Pexels. Con pocos usuarios sobra la capa gratuita; si crece, habría que poner un límite por usuario.

## Instalarla en el móvil

El navegador solo deja instalar webs servidas por **https** (o desde `localhost`), así que en el móvil se instala desde la versión publicada en Vercel:

- **iPhone (Safari)**: botón Compartir → *Añadir a pantalla de inicio*.
- **Android (Chrome)**: menú ⋮ → *Instalar aplicación*.
- **Mac (Chrome)**: en `localhost:3000`, icono de instalar en la barra de direcciones. Sirve para probarla ya.

El service worker pide siempre la versión nueva a la red y solo usa lo guardado si no hay conexión. Así cada despliegue se ve al momento, sin tener que tocar ninguna versión de caché.

## Ideas para seguir

- Raciones distintas para cada comida del calendario.
- Traducir también los nombres de los platos de Descubrir al navegar (ahora se traducen al guardarlos).
