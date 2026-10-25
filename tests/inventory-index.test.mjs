import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('MYOB snapshot map is exempt from unused single-field indexes',async()=>{
 const config=JSON.parse(await readFile(new URL('../firebase/firestore.indexes.json',import.meta.url),'utf8'));
 assert.deepEqual(config.fieldOverrides.find(x=>x.collectionGroup==='app_data'&&x.fieldPath==='rows')?.indexes,[]);
});
