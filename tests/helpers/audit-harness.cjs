const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const firestore=`
const host=window.top, options=host.__scenario||{};
const store=host.__store||(host.__store=structuredClone(options.store||{
 'app_data/main_config':{suppliers:['SilkRoad','Tencho'],mappings:{},products:{'4901071404000':{itemCode:'ACE005',sourceBarcode:'4901071404000',name:'Acecook',kind:'dry'},'4900000000002':{itemCode:'TEST002',sourceBarcode:'4900000000002',name:'Test Product',kind:'dry'}},itemToBarcode:{ACE005:'4901071404000',TEST002:'4900000000002'},quotes:[],finalPiContainers:{}}
}));
host.__writes||=[];host.__listeners||={};
const snapshot=p=>({exists:()=>p.startsWith('user_roles/')?options.role!=='missing':true,data:()=>structuredClone(p.startsWith('user_roles/')?{role:options.role||'admin'}:store[p]||{})});
export function getFirestore(app){return {app}};export function doc(db,...p){return {path:p.join('/')}};export function collection(db,...p){return {path:p.join('/')}};
export async function runTransaction(db,fn){const ops=[];const result=await fn({get:async ref=>{if(host.__failRead)throw Error('simulated read failure');return snapshot(ref.path)},set:(ref,data,opts)=>ops.push([ref,data,opts])});for(const args of ops)await setDoc(...args);return result};export async function getDoc(ref){if(host.__failRead)throw Error('simulated read failure');return snapshot(ref.path)};
export async function setDoc(ref,data,opts){if(ref.path==='app_data/order_inventory_v1'&&host.__holdInventoryWrite)await new Promise(resolve=>host.__releaseInventoryWrite=resolve);host.__writes.push({path:ref.path,data:structuredClone(data)});if(host.__failWrites)throw Error('simulated write failure');const merge=(a,b)=>{const out=structuredClone(a||{});for(const [k,v]of Object.entries(b)){if(v?.__op==='delete')delete out[k];else out[k]=v&&typeof v==='object'&&!Array.isArray(v)?merge(out[k],v):structuredClone(v);}return out};if(opts?.mergeFields){const out=structuredClone(store[ref.path]||{});for(const field of opts.mergeFields){const parts=field.parts||field.split('.');let dest=out,source=data;for(const key of parts.slice(0,-1)){dest=dest[key]||=( {} );source=source[key]}const last=parts.at(-1);dest[last]=structuredClone(source[last])}store[ref.path]=out}else store[ref.path]=opts?.merge?merge(store[ref.path],data):structuredClone(data);setTimeout(()=>{for(const cb of host.__listeners[ref.path]||[])cb(snapshot(ref.path))},0)};
export function onSnapshot(ref,cb,error){(host.__listeners[ref.path]||=[]).push(cb);setTimeout(()=>{if(host.__failRead)error?.(Error('simulated read failure'));else cb(snapshot(ref.path))},5);return ()=>host.__listeners[ref.path]=host.__listeners[ref.path].filter(x=>x!==cb)};
export function writeBatch(){const ops=[];return {set(ref,data,opts){ops.push([ref,data,opts])},delete(ref){ops.push([ref,null])},async commit(){if(host.__failBatch||host.__failWrites)throw Error('simulated batch failure');for(const x of ops){if(x[1]===null)await deleteDoc(x[0]);else await setDoc(...x)}}}};
export async function getDocsFromServer(ref){if(ref?.path==='kaisi_customer_orders'){if(host.__failCustomerRead)throw Error('simulated customer read failure');const docs=(options.customerOrders||[]).map((x,i)=>({id:String(i),data:()=>({values:[null,x.customer,x.code,null,null,null,x.qty,x.unit,x.status,x.container,x.note]})}));return {empty:!docs.length,docs,forEach(fn){docs.forEach(fn)}}}const docs=(options.users||[]).map(x=>({id:x.uid,data:()=>({email:x.email,role:x.role||'editor'})}));return {empty:!docs.length,docs,forEach(fn){docs.forEach(fn)}}};export async function deleteDoc(ref){delete store[ref.path]};
export async function updateDoc(ref,field,value){if(!(field instanceof FieldPath)&&typeof field!=='string')return setDoc(ref,field,{merge:true});const data=structuredClone(store[ref.path]||{}),parts=field instanceof FieldPath?field.parts:field.split('.');let target=data;for(const k of parts.slice(0,-1))target=target[k]||=( {} );const key=parts.at(-1);if(value?.__op==='delete')delete target[key];else if(value?.__op==='union')target[key]=[...(target[key]||[]),...value.values.filter(x=>!(target[key]||[]).some(y=>JSON.stringify(x)===JSON.stringify(y)))];else if(value?.__op==='remove')target[key]=(target[key]||[]).filter(x=>!value.values.some(y=>JSON.stringify(x)===JSON.stringify(y)));else target[key]=value;return setDoc(ref,data)};
export function deleteField(){return {__op:'delete'}};export function arrayUnion(...values){return {__op:'union',values}};export function arrayRemove(...values){return {__op:'remove',values}};export class FieldPath{constructor(...x){this.parts=x}};
`;
const auth=`
const host=window.top,options=host.__scenario||{};const clients=new Map();
export function getAuth(app){if(clients.has(app.name))return clients.get(app.name);const auth={currentUser:!app.name&&options.signedIn!==false?{uid:'audit-user-000001',email:'audit@example.com'}:null,listeners:[]};clients.set(app.name,auth);if(!app.name){host.__auth=auth;host.__setRole=async role=>{options.role=role;auth.currentUser={uid:'audit-user-'+role,email:role+'@example.com'};await Promise.all(auth.listeners.map(cb=>cb(auth.currentUser)))}}return auth};
export function onAuthStateChanged(auth,cb){auth.listeners.push(cb);setTimeout(()=>cb(auth.currentUser),5);return ()=>auth.listeners=auth.listeners.filter(x=>x!==cb)};
export async function signInWithEmailAndPassword(auth,email,password){if(password==='wrong')throw Error('auth/invalid-credential');auth.currentUser={uid:auth!==host.__auth&&options.customerUid?options.customerUid:'audit-user-000001',email};await Promise.all(auth.listeners.map(cb=>cb(auth.currentUser)));return {user:auth.currentUser}};
export async function signOut(auth){auth.currentUser=null;await Promise.all(auth.listeners.map(cb=>cb(null)))};
export async function setPersistence(){};export const browserLocalPersistence={},browserSessionPersistence={};
`;
async function start(){
 const mount='/japan-price-tracker/';
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'dist',pathname.slice(mount.length)||'index.html');if(!pathname.startsWith(mount)||!file.startsWith(path.join(root,'dist')+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end()};res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]+'; charset=utf-8');res.end(fs.readFileSync(file))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.JPT_CHROME_PATH?{executablePath:process.env.JPT_CHROME_PATH}:{}),args:['--no-sandbox']});
 return {async close(){await browser.close();await new Promise(r=>server.close(r))},async page(options={}){
  const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
  await context.addInitScript(options=>{window.__scenario=options},options);
  const page=await context.newPage(),errors=[],dialogs=[],external=[];page.setDefaultTimeout(7000);
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());if(options.dismissDialogs)await d.dismiss();else await d.accept(options.prompt||'Audit Supplier')});
  page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1')&&r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url())});
  await context.route('**/*',route=>{const u=route.request().url();
   if(u.startsWith('http://127.0.0.1')){if(u.endsWith('/data/planner-seed.json')){const seed=JSON.parse(fs.readFileSync(path.join(root,'src/planner/data/seed.json')));seed.items=seed.items.filter(x=>x.code==='ACE005').map(x=>({...x,imgUrl:'',stock:0,monthly:7}));seed.orders=[];seed.inventory={};return route.fulfill({contentType:'application/json',body:JSON.stringify(seed)})}return route.continue()}
   if(u.startsWith('blob:')||u.startsWith('data:'))return route.continue();
   if(u.includes('firebase-app.js'))return route.fulfill({contentType:'text/javascript',body:'export function initializeApp(config,name){return {config,name}}'});
   if(u.includes('firebase-firestore.js'))return route.fulfill({contentType:'text/javascript',body:firestore});
   if(u.includes('firebase-auth.js'))return route.fulfill({contentType:'text/javascript',body:auth});
   for(const f of ['xlsx.full.min.js','bootstrap.bundle.min.js','bootstrap.min.css'])if(u.includes(f))return route.fulfill({path:path.join(root,'tests/vendor',f),contentType:f.endsWith('.css')?'text/css':'text/javascript'});
   external.push(u);return route.abort();
  });
  await page.goto('http://127.0.0.1:'+server.address().port+mount);
  await page.waitForFunction(()=>document.querySelector('#loginForm')&&window.saveFirebaseData);
  if(options.signedIn!==false&&!['disabled','missing'].includes(options.role))await page.locator('#protectedApp:not(.d-none)').waitFor();
  return {page,context,errors,dialogs,external,async planner(){await page.locator('#planner-tab').click();const frame=page.frameLocator('#plannerFrame');await frame.locator('#productRows tr').first().waitFor();const handle=await(await page.$('#plannerFrame')).contentFrame();return {frame,handle}},async settings(){await page.locator('#settings-tab').click();await page.locator('button[data-product-view="master"]').click()},async imports(view){await page.locator('#add-tab').click();await page.locator('.import-switcher [data-import-view="'+view+'"]').click()},async container(){await page.locator('#container-tab').click();const frame=page.frameLocator('#containerTrackerFrame');await frame.locator('#app:not(.hide)').waitFor();return {frame,handle:await(await page.$('#containerTrackerFrame')).contentFrame()}}};
 }};
}
module.exports={start};
