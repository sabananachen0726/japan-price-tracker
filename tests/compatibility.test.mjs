import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const baseline=JSON.parse(await readFile(new URL('./compatibility.json',import.meta.url),'utf8'));
function skeleton(text){return text.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g,(all,attrs,body)=>attrs.includes('application/json')||attrs.includes('src=')?all:`<script${attrs}></script>`).replaceAll('V4.13.0','V4.12.0');}
for(const name of ['shell','planner','container'])test(`${name}: HTML, styles and seed data unchanged by modularization`,async()=>{
 let text=await readFile(new URL('../dist/'+(name==='shell'?'index':name)+'.html',import.meta.url),'utf8');
 for(const match of [...text.matchAll(/<link rel="stylesheet"([^>]*?) href="\.\/([^\"]+)">/g)]){
  text=text.replace(match[0],`<style${match[1]}>${await readFile(new URL('../dist/'+match[2],import.meta.url),'utf8')}</style>`);
 }
 text=text.replace(/<script([^>]*?) src="\.\/assets\/[^\"]+"><\/script>/g,(_,attrs)=>`<script${name==='planner'?attrs.replace(' type="module"',''):attrs}></script>`);
 if(name==='planner')text=text.replace('<script id="seed" type="application/json"></script>',`<script id="seed" type="application/json">${await readFile(new URL('../dist/data/planner-seed.json',import.meta.url),'utf8')}</script>`);
 assert.equal(createHash('sha256').update(skeleton(text)).digest('hex'),baseline[name]);
});
