import test from 'node:test';
import assert from 'node:assert/strict';
import {customerBucket, splitContainerCustomerOrders, finalAddOn, allocationContainer} from '../src/shared/customer-demand.js';
import {checkProtectedFinal} from '../src/shared/customer-protection.js';
import {register as registerOrders} from '../src/planner/modules/customer-orders.js';

test('customer-sheet statuses map to Final, allocated, processing, cancelled and shipped', () => {
  for (const s of ['待處理', '已訂待回覆', '通知Sab', '追Serena', '1']) assert.equal(customerBucket(s), 'processing', s);
  assert.equal(customerBucket('Final'), 'final');
  assert.equal(customerBucket('已分配貨櫃'), 'allocated');
  assert.equal(customerBucket('取消=>通知女孩兒'), 'cancelled');
  assert.equal(customerBucket('女孩兒自己取消'), 'cancelled');
  assert.equal(customerBucket('已出貨'), 'hidden');
  assert.equal(allocationContainer(' jtc26b-1101 '), 'JTC26B1101');
});

test('container split: Final is added, allocated is inside, processing only counted, protection keeps other stores out', () => {
  const o = (customer, status, qty, extra = {}) => ({code: 'yura006', customer, status, qty, unit: 'CTN', container: 'JTC26B-1101', ...extra});
  const orders = [o('Formosa', '已分配貨櫃', 10), o('Lara', 'Final', 5), o('Lara', 'Final', 3, {unit: '箱'}), o('Sunny', 'Final', 4),
    o('Sunny', 'Final', 6, {unit: 'EA'}), o('Kim', '待處理', 2), o('Kim', '已出貨', 9), o('Kim', 'Final', 9, {container: 'OTHER'})];
  const plain = splitContainerCustomerOrders(orders, 'JTC26B1101').get('YURA006');
  assert.equal(plain.final.boxes, 12); assert.equal(plain.allocated.boxes, 10);
  assert.equal(plain.processing.count, 1); assert.equal(plain.final.nonBox.length, 1);
  assert.deepEqual(finalAddOn(splitContainerCustomerOrders(orders, 'JTC26B1101')), {YURA006: {Lara: 8, Sunny: 4}});
  const held = splitContainerCustomerOrders(orders, 'JTC26B1101', {protections: {YURA006: {store: 'Lara', expiresOn: '2027-01-01'}}, today: '2026-11-12'}).get('YURA006');
  assert.equal(held.final.boxes, 8); assert.equal(held.blocked.boxes, 4);
  const expired = splitContainerCustomerOrders(orders, 'JTC26B1101', {protections: {YURA006: {store: 'Lara', expiresOn: '2026-11-12'}}, today: '2026-11-12'}).get('YURA006');
  assert.equal(expired.final.boxes, 12);
});

test('orders for the container being written no longer count as extra demand', () => {
  const orders = [{code: 'A', container: 'JTC26B1101', qty: 10, unit: 'CTN', status: '已分配貨櫃'},
    {code: 'A', container: 'JTC26B1101', qty: 5, unit: 'CTN', status: 'Final'},
    {code: 'A', container: 'OLD26B0901', qty: 3, unit: 'CTN', status: 'Final'},
    {code: 'A', container: '', qty: 2, unit: 'CTN', status: '待處理'}];
  const context = {state: {orders}, norm: v => String(v).toUpperCase(), round: v => v}; registerOrders(context);
  assert.equal(context.orderNeed({code: 'A'}).total, 20);
  assert.equal(context.orderNeed({code: 'A'}, 'jtc26b-1101').total, 5);
});

test('saving refuses Final from another store while an item is protected', () => {
  const protections = {A: {store: 'Lara', expiresOn: '2027-01-01'}};
  assert.doesNotThrow(() => checkProtectedFinal({protections, customerFinal: {A: {Lara: 5}, B: {Kim: 2}}, today: '2026-11-12'}));
  assert.throws(() => checkProtectedFinal({protections, customerFinal: {A: {Lara: 5, Sunny: 1}}, today: '2026-11-12'}), /Sunny/);
  assert.doesNotThrow(() => checkProtectedFinal({protections, customerFinal: {A: {Sunny: 1}}, today: '2027-01-01'}));
});
