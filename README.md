# Sartén 🍳

Mi recetario personal. Guardo todas mis recetas, las clasifico por **desayuno, comida, merienda y cena** y por **sana o gocheo**, y puedo importar una receta directamente desde un vídeo de TikTok (o Instagram/YouTube): una IA lee la descripción y la miniatura del vídeo y me rellena ingredientes y pasos.

El diseño está inspirado en las páginas de producto de Apple: tipografía grande, mucho espacio, barra de navegación translúcida y estanterías con scroll horizontal. Funciona en móvil, tablet y ordenador, y tiene modo oscuro.

## Tecnologías

| Parte | Qué uso | Por qué |
|---|---|---|
| Frontend | HTML, CSS y JavaScript nativos (módulos ES) | Sin frameworks ni build: se entiende todo el código |
| Datos y fotos | [Supabase](https://supabase.com) (Postgres + Storage + Auth) | Capa gratuita, se usa desde el navegador y sincroniza entre dispositivos |
| Fotos | [Pexels API](https://www.pexels.com/api/) | Fotos de platos gratis y con licencia libre |
| IA | [Gemini API](https://aistudio.google.com) (modelo Flash) | Capa gratuita, entiende texto e imágenes y devuelve JSON con esquema |
| Servidor | Una función serverless en [Vercel](https://vercel.com) (`api/importar.js`) | La clave de la IA no puede estar en el navegador |

## Cómo funciona la importación desde TikTok

1. Pego el enlace (también vale el corto `vm.tiktok.com/...`).
2. `api/importar.js` pide los datos públicos del vídeo al endpoint oficial **oEmbed** de TikTok: descripción, autor y miniatura.
3. Envía la descripción y la miniatura a Gemini con un esquema JSON fijo (título, momento, sana/gocheo, ingredientes, pasos…).
4. El formulario se rellena solo, reviso y guardo. La miniatura se guarda como foto propia porque las URLs de TikTok caducan.

**Limitación:** la IA lee lo que está *escrito* en el post, no lo que se dice en el audio. Si la receta solo se cuenta hablando, hay un campo para pegar el texto y la IA lo ordena igual.

## Estructura

```
index.html          Página única (router por hash: #/, #/explorar, #/receta/:id, #/nueva)
css/styles.css      Todo el diseño
js/app.js           Vistas y navegación
js/store.js         Datos: Supabase o, si no está configurado, localStorage (modo demo)
js/config.js        URL y clave pública de Supabase
api/importar.js     Función serverless: vídeo → receta con IA
supabase/schema.sql Tabla, políticas de seguridad y bucket de fotos
dev.js              Servidor local sin dependencias (npm run dev)
```

## Arrancar en local

Necesitas Node 20.12 o superior (`node -v`).

```bash
npm run dev
```

Abre http://localhost:3000. Sin configurar nada funciona en **modo demo**: las recetas se guardan en el navegador y trae 4 de ejemplo.

Para que funcione la importación con IA:

1. Crea una clave gratis en https://aistudio.google.com/apikey
2. Copia `.env.example` como `.env` y pega la clave en `GEMINI_API_KEY`.
3. Para el botón **Buscar foto en internet**, saca otra clave gratis en https://www.pexels.com/api/ y ponla en `PEXELS_API_KEY`.
4. Reinicia `npm run dev`.

## Guardar las recetas en la nube (Supabase)

1. Crea un proyecto en https://supabase.com (plan gratuito).
2. **SQL Editor → New query**: pega `supabase/schema.sql` y pulsa *Run*.
3. **Authentication → Users → Add user**: créate tu usuario con tu correo.
4. **Authentication → Sign In / Providers**: desactiva *Allow new users to sign up*. Así solo tú puedes editar.
5. **Authentication → URL Configuration**: en *Site URL* pon la URL de Vercel (y añade `http://localhost:3000` en *Redirect URLs*).
6. **Project Settings → API**: copia *Project URL* y *anon public key* en `js/config.js` y en `.env`.

La clave *anon* es pública por diseño; lo que protege los datos son las políticas RLS: todo el mundo puede ver las recetas, pero solo un usuario con sesión puede crear, editar o borrar.

## Publicar (Vercel)

1. Sube el repo a GitHub (el `.gitignore` ya excluye `.env`).
2. En https://vercel.com → *Add New Project* → importa el repo. No hace falta configurar framework ni build.
3. En *Settings → Environment Variables* añade `GEMINI_API_KEY`, `PEXELS_API_KEY`, `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
4. Cada `git push` vuelve a desplegar.

## Ideas para seguir

- Lista de la compra a partir de varias recetas.
- Transcribir el audio del vídeo cuando la descripción no trae la receta.
- Instalarla como app en el móvil (PWA).
