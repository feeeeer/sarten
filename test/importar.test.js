// Pruebas del lector de páginas web: node --test (o npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarHtml } from '../api/importar.js';

test('lee la receta schema.org aunque venga dentro de @graph', () => {
  const html = `<html><head>
    <meta property="og:title" content="Tortilla de patatas &amp; cebolla">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"WebPage","name":"x"},
      {"@type":["Recipe"],"name":"Tortilla","recipeIngredient":["4 huevos","500 g de patatas"],
       "recipeInstructions":[{"@type":"HowToStep","text":"Fríe las patatas"}],
       "image":{"@type":"ImageObject","url":"https://ejemplo.com/t.jpg"}}]}</script>
    </head><body><nav>menú</nav><p>texto</p></body></html>`;
  const p = analizarHtml(html);
  assert.equal(p.title, 'Tortilla de patatas & cebolla');
  assert.equal(p.image, 'https://ejemplo.com/t.jpg');
  assert.match(p.receta, /500 g de patatas/);
  assert.equal(p.texto, '', 'con receta estructurada no manda el texto de la página');
});

test('sin schema.org saca el texto visible sin menús ni scripts', () => {
  const html = `<head><meta content="https://ig.com/f.jpg" property="og:image">
    <meta property="og:description" content="120 likes - chef: &quot;Pasta con pesto&quot; 200 g de pasta"></head>
    <body><nav>Inicio Blog</nav><script>var x=1</script><h1>Pasta</h1><p>Hierve 200&nbsp;g de pasta.</p></body>`;
  const p = analizarHtml(html);
  assert.equal(p.image, 'https://ig.com/f.jpg', 'og:image con content antes de property');
  assert.match(p.description, /"Pasta con pesto"/);
  assert.equal(p.receta, null);
  assert.match(p.texto, /Hierve 200 g de pasta/);
  assert.doesNotMatch(p.texto, /Inicio Blog|var x/);
});

test('un JSON-LD roto no rompe la lectura', () => {
  const p = analizarHtml('<script type="application/ld+json">{roto</script><p>Hola</p>');
  assert.equal(p.receta, null);
  assert.equal(p.texto, 'Hola');
});
