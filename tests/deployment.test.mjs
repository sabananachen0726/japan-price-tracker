import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
const dist=new URL('../dist/',import.meta.url);
test('published pages use separate local assets and no embedded child applications',async()=>{
 for(const page of ['index','planner','container']){
  const html=await readFile(new URL(page+'.html',dist),'utf8');
  assert(Buffer.byteLength(html)<150000,`${page} HTML must remain small`);
  assert(!html.includes('srcdoc')&&!html.includes('base64,'));
  assert(!/<style[\s>]/.test(html));
  for(const match of html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g))await access(new URL(match[1],dist));
  assert(/<script[^>]+type="module"[^>]+src="\.\/assets\//.test(html));
 }
 const jsFiles=[...(await readFile(new URL('index.html',dist),'utf8')).matchAll(/src="(\.\/assets\/[^\"]+\.js)"/g)];
 const shell=(await Promise.all(jsFiles.map(m=>readFile(new URL(m[1],dist),'utf8')))).join('');
 assert(shell.includes('./planner.html')&&shell.includes('./container.html'));
 assert(!shell.includes('srcdoc')&&!shell.includes('EMBEDDED_ORDER_PLANNER_B64'));
 const seed=JSON.parse(await readFile(new URL('data/planner-seed.json',dist),'utf8'));
 assert(Array.isArray(seed.items)&&seed.items.length>0);
});
