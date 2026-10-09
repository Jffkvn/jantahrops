// Run: deno test netlify/edge-functions/
import { assertEquals } from 'jsr:@std/assert@1';
import { decide } from './country-gate-rules.ts';

Deno.test('Uganda is allowed by default, everyone else is not', () => {
  assertEquals(decide('UG', 'UG'), 'allow');
  assertEquals(decide('ug', 'UG'), 'allow');
  assertEquals(decide('KE', 'UG'), 'block');
  assertEquals(decide('US', 'UG'), 'block');
});

Deno.test('unknown locations are refused', () => {
  assertEquals(decide(undefined, 'UG'), 'block');
  assertEquals(decide(null, 'UG'), 'block');
  assertEquals(decide('', 'UG'), 'block');
});

Deno.test('extra countries can be allowed; a broken list falls back to Uganda only', () => {
  assertEquals(decide('KE', 'UG, KE'), 'allow');
  assertEquals(decide('UG', ' , nonsense,'), 'allow');
  assertEquals(decide('KE', ' , nonsense,'), 'block');
});
