// Pruebas de la lista de la compra: node --test (o npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerIngrediente, juntarIngredientes } from '../js/lista.js';

test('entiende cantidades, unidades y nombres', () => {
  assert.deepEqual(leerIngrediente('400 g de carne picada'), { cantidad: 400, unidad: 'g', nombre: 'carne picada' });
  assert.deepEqual(leerIngrediente('1,5 kg de patatas'), { cantidad: 1500, unidad: 'g', nombre: 'patatas' });
  assert.deepEqual(leerIngrediente('200ml de leche'), { cantidad: 200, unidad: 'ml', nombre: 'leche' });
  assert.deepEqual(leerIngrediente('2 huevos'), { cantidad: 2, unidad: '', nombre: 'huevos' });
  assert.deepEqual(leerIngrediente('2 huevos grandes'), { cantidad: 2, unidad: '', nombre: 'huevos grandes' });
  assert.deepEqual(leerIngrediente('medio limón'), { cantidad: 0.5, unidad: '', nombre: 'limón' });
  assert.deepEqual(leerIngrediente('3 cucharadas de aceite'), { cantidad: 3, unidad: 'cucharada', nombre: 'aceite' });
  assert.equal(leerIngrediente('Sal y pimienta'), null);
});

test('suma el mismo ingrediente de varias recetas', () => {
  const lista = juntarIngredientes([
    { texto: '200 g de arroz', receta: 'Paella' },
    { texto: '0,1 kg de Arroz', receta: 'Arroz con leche' },
    { texto: '2 huevos', receta: 'Tortilla' },
    { texto: '4 huevos', receta: 'Tortilla' },
    { texto: 'Sal', receta: 'Paella' },
    { texto: 'sal.', receta: 'Tortilla' },
    { texto: '800 g de patatas', receta: 'Tortilla' },
    { texto: '400 g de patatas', receta: 'Guiso' },
  ]);
  const textos = lista.map(x => x.texto);
  assert.ok(textos.includes('300 g de arroz'));
  assert.ok(textos.includes('6 huevos'));
  assert.ok(textos.includes('1,2 kg de patatas'));
  assert.equal(lista.filter(x => x.clave === 'sal').length, 1, 'la sal sale una sola vez');
  assert.deepEqual(lista.find(x => x.texto === '300 g de arroz').recetas, ['Paella', 'Arroz con leche']);
});

test('pone en plural al sumar', () => {
  const lista = juntarIngredientes([{ texto: '1 cebolla', receta: 'A' }, { texto: '1 cebolla', receta: 'B' }, { texto: '1 brócoli', receta: 'A' }]);
  assert.deepEqual(lista.map(x => x.texto), ['1 brócoli', '2 cebollas']);
});

test('no mezcla unidades distintas', () => {
  const lista = juntarIngredientes([
    { texto: '2 tazas de harina', receta: 'A' },
    { texto: '100 g de harina', receta: 'B' },
  ]);
  assert.equal(lista.length, 2);
});
