import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const root=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(root,process.env.JPT_OUTPUT_DIR||'dist');
await mkdir(output,{recursive:true});
async function bundle(file,format,define={}) {
 const result=await build({absWorkingDir:root,entryPoints:[path.join(root,file)],bundle:true,write:false,format,target:'es2022',platform:'browser',keepNames:false,external:['https://*'],define,charset:'utf8',legalComments:'none'});
 return result.outputFiles[0].text.replaceAll('</script','<\\/script');
}
async function page(name,define={}) {
 const base=path.join(root,'src',name);
 let html=await readFile(path.join(base,'template.html'),'utf8');
 async function includeFiles(text,depth=0){
  if(depth>12)throw Error('Template include cycle in '+name);
  for(const match of [...text.matchAll(/\{\{file:([^}]+)\}\}/g)]){
   const file=path.resolve(base,match[1]);if(!file.startsWith(base+path.sep))throw Error('Invalid template path');
   text=text.replace(match[0],await includeFiles(await readFile(file,'utf8'),depth+1));
  }
  return text;
 }
 html=await includeFiles(html);
 html=html.replace('{{application-script}}',await bundle(`src/${name}/bootstrap.js`,name==='shell'?'esm':'iife',define));
 if(name==='shell')html=html.replace('{{release-script}}',await bundle('src/shell/releases.js','iife'));
 if(/\{\{(?:file:|application-script|release-script)/.test(html))throw Error('Unresolved template in '+name);
 return html;
}
// Dependency manifests are derived from the module definitions, never a second source of truth.
const architecture={};
for(const scope of ['shell','shell/dom','planner','container']){
 const entry=await readFile(path.join(root,'src',scope,'bootstrap.js'),'utf8');
 const names=[...entry.matchAll(/from ["']\.\/modules\/([^"']+)["']/g)].map(m=>m[1]);
 const features=[];
 for(const name of names){const {definition:d}=await import(pathToFileURL(path.join(root,'src',scope,'modules',name)));features.push({id:d.id,file:'modules/'+name,owns:d.owns.map(x=>x.name),imports:d.imports,writes:d.writes});}
 architecture[scope]={scope,features};
 await writeFile(path.join(root,'src',scope,'dependencies.json'),JSON.stringify(architecture[scope],null,2)+'\n');
}
await writeFile(path.join(root,'architecture.json'),JSON.stringify(architecture,null,2)+'\n');
const planner=await page('planner'),container=await page('container');
const html=await page('shell',{__JPT_ORDER_PLANNER_B64__:JSON.stringify(Buffer.from(planner).toString('base64')),__JPT_CONTAINER_TRACKER_B64__:JSON.stringify(Buffer.from(container).toString('base64'))});
await writeFile(path.join(output,'index.html'),html);
await writeFile(path.join(output,'planner.html'),planner);await writeFile(path.join(output,'container.html'),container);
console.log('Built V4.13.0:',path.join(output,'index.html'));
