import test from 'node:test';
import assert from 'node:assert/strict';
import {customerBucket, summarizeDemand} from '../src/shared/customer-demand.js';
import {renderCustomerDemand} from '../src/shell/customer-demand-view.js';
import {register as registerOrders} from '../src/planner/modules/customer-orders.js';
test('not-required orders remain demand; cancelled and shipped orders are excluded in both views', () => {
  const statuses=['不需預訂','不須預定','處理中','Final','取消','已出貨','已出舊貨'];
  const rows=statuses.map((status,id)=>({id,code:'ACE005',status,qty:2,unit:'CTN'}));
  assert.equal(customerBucket('不需預訂'),'processing');
  const context={state:{orders:rows},norm:v=>String(v).toUpperCase(),round:v=>v}; registerOrders(context);
  assert.equal(context.orderNeed({code:'ACE005'}).total,8);
  assert.equal(summarizeDemand(rows,new Set(['ace005','ACE005'])).total,8);
});
test('unknown units and quantities remain visible without guessed availability; escaping and assignment separation', () => {
  const rows=[{code:'A',customer:'<script>',qty:3,unit:'CTN',container:'JSR27B0102',note:'提醒'},
    {code:'A',qty:5,unit:'EA',container:''},{code:'A',qty:null,unit:'CTN',container:'OTHER'}];
  const html=renderCustomerDemand({rows,codes:new Set(['A']),incoming:20,fetchedAt:1,status:'讀取失敗；保留上次資料',containers:['JSR27B0102']});
  assert.equal(summarizeDemand(rows,['A']).unknown,2);
  for(const text of ['資料不足，無法計算','單位待確認','未指定貨櫃（1 筆）','指定貨櫃 JSR27B0102','讀取失敗','最後成功更新','&lt;script&gt;','提醒'])assert.ok(html.includes(text),text);
  assert.ok(!html.includes('<script>'));
});
test('missing source differs from a successfully empty source and demand is deducted once', () => {
  const render=rows=>renderCustomerDemand({rows,codes:new Set(['A','A']),incoming:12});
  assert.ok(render(null).includes('尚未取得'));
  assert.ok(render(null).includes('資料不足，無法計算'));
  assert.ok(render([]).includes('在途可用箱數：12 箱'));
  assert.ok(render([{code:'A',qty:4,unit:'箱'}]).includes('在途可用箱數：8 箱'));
});
