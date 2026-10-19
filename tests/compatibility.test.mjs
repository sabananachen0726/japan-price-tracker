import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const baseline=JSON.parse(await readFile(new URL('./compatibility.json',import.meta.url),'utf8'));
function skeleton(text){return text.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g,(all,attrs,body)=>attrs.includes('application/json')||attrs.includes('src=')?all:`<script${attrs}></script>`).replaceAll('V4.13.0','V4.12.0');}
for(const name of ['shell','planner','container'])test(`${name}: HTML, styles and seed data unchanged by modularization`,async()=>{
 const text=await readFile(new URL('../dist/'+(name==='shell'?'index':name)+'.html',import.meta.url),'utf8');assert.equal(createHash('sha256').update(skeleton(text)).digest('hex'),baseline[name]);
});
