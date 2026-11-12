import test from 'node:test';
import assert from 'node:assert/strict';
import {brisbaneDate, unlockDate, registerProtection, checkProtectedOrder} from '../src/shared/customer-protection.js';
test('calendar months clamp month-end, renewal follows the latest confirmation and expiry uses Brisbane',()=>{
  assert.equal(unlockDate('2026-10-31'),'2027-02-28');
  assert.equal(unlockDate('2027-10-31'),'2028-02-29');
  assert.equal(brisbaneDate(new Date('2027-02-27T14:00:00Z')),'2027-02-28');
  const first=registerProtection(null,{store:'Lara',confirmedOn:'2026-11-12'},'2026-11-12');
  assert.throws(()=>registerProtection(first,{store:'Other',confirmedOn:'2027-01-20'},'2027-01-20'),/其他店家/);
  const next=registerProtection(first,{store:'Lara',confirmedOn:'2027-01-20'},'2027-01-20');
  assert.equal(next.expiresOn,'2027-05-20');assert.equal(next.history.length,2);
});
test('only a matching unspent Admin pass can cover a protected line within its approved quantity',()=>{
  const A=registerProtection(null,{store:'Lara',confirmedOn:'2026-11-12'},'2026-11-12');
  const pass={id:'P',store:'Lara',confirmedOn:A.confirmedOn,container:'X1',code:'A',boxes:20,reason:'Lara 補單'};
  const args={protections:{A},passes:{P:pass},container:'X1',rows:{A:20},today:'2027-01-01',isAdmin:true};
  assert.deepEqual(checkProtectedOrder(args),['P']);
  for(const change of [{isAdmin:false},{container:'X2'},{rows:{A:21}},{passes:{P:{...pass,usedAt:'now'}}},{passes:{P:{...pass,store:'Other'}}}]) assert.throws(()=>checkProtectedOrder({...args,...change}),/保護中/);
  assert.deepEqual(checkProtectedOrder({...args,today:'2027-03-12',isAdmin:false}),[]);
});

test('protected proposal and pass redemption are staged in the same transaction',async()=>{
  const {commitOrderDraft}=await import('../src/shared/order-version.js');
  const A=registerProtection(null,{store:'Lara',confirmedOn:'2026-11-12'},'2026-11-12');
  const P={id:'P',store:'Lara',confirmedOn:A.confirmedOn,container:'X1',code:'A',boxes:20,reason:'補單'};
  let writes=[];
  const runTransaction=(_,fn)=>fn({get:async ref=>({exists:()=>ref==='guard',data:()=>({customerProtection:{protections:{A},passes:{P}}})}),set:(...args)=>writes.push(args)});
  class FieldPath {constructor(...path){this.path=path;}}
  const args={runTransaction,ref:'drafts',code:'X1',cleaned:{rows:{A:20},revision:'r1'},expectedVersion:'missing',FieldPath,
    protection:{ref:'guard',field:'customerProtection',uid:'admin-1',isAdmin:true,now:new Date('2027-01-01T00:00Z')}};
  await assert.rejects(commitOrderDraft({...args,protection:{...args.protection,isAdmin:false}}),/保護中/);
  assert.equal(writes.length,0);
  await commitOrderDraft(args);
  assert.deepEqual(writes.map(([ref])=>ref),['guard','drafts']);
  assert.equal(writes[0][1].customerProtection.passes.P.revision,'r1');
});
