import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const scopes=['shell','shell/dom','planner','container'];
for(const scope of scopes)test(`${scope}: module contracts match manifests and declared context use`,async()=>{
 const url=new URL(`../src/${scope}/dependencies.json`,import.meta.url),manifest=JSON.parse(await readFile(url,'utf8'));
 const owned=new Set();for(const f of manifest.features)for(const name of f.owns){assert(!owned.has(name),`${name} has duplicate owners`);owned.add(name);}
 for(const f of manifest.features){const file=new URL(`../src/${scope}/${f.file}`,import.meta.url),module=await import(file);assert.equal(typeof module.register,'function');assert.equal(typeof module.initialize,'function');assert.deepEqual(module.definition.owns.map(x=>x.name),f.owns);assert.deepEqual(module.definition.imports,f.imports);
 const allowed=new Set([...f.owns,...f.imports]);const text=await readFile(file,'utf8');for(const m of text.matchAll(/\bcontext\.([a-zA-Z_$][\w$]*)/g))assert(allowed.has(m[1]),`${scope}/${f.id}: undeclared context member ${m[1]}`);
 }
});
