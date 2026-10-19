import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeatureRuntime} from '../src/core/runtime.js';
import {createWindowEvents} from '../src/core/events.js';
function feature(id,owns,imports=[],writes=[],register=()=>{},initialize=()=>{}){return {definition:{id,owns,imports,writes},register,initialize};}
test('registers functions before initializing dependent features',()=>{
 const seen=[];
 const consumer=feature('consumer',[],['compute'],[],()=>{},ctx=>seen.push(ctx.compute()));
 const producer=feature('producer',[{name:'compute',kind:'function'}],[],[],ctx=>{ctx.compute=()=>42});
 createFeatureRuntime([consumer,producer]).start();assert.deepEqual(seen,[42]);
});
test('explicit mutable dependencies, const semantics and isolation',()=>{
 const build=()=>{let api;const owner=feature('owner',[{name:'value',kind:'let'},{name:'fixed',kind:'const'}],[],[],()=>{},ctx=>{ctx.value=1;ctx.fixed=10});
  const user=feature('user',[],['value','fixed'],['value','fixed'],()=>{},ctx=>api=ctx);const runtime=createFeatureRuntime([owner,user]);runtime.start();return {api,runtime};};
 const a=build(),b=build();a.api.value=7;assert.equal(a.api.value,7);assert.equal(b.api.value,1);assert.throws(()=>a.api.fixed=11,/constant/);assert.throws(()=>a.runtime.start(),/already initialized/);
});
test('rejects undeclared state access and missing dependencies',()=>{
 let api;const f=feature('guarded',[],[],[],()=>{},ctx=>api=ctx);createFeatureRuntime([f]).start();assert.throws(()=>api.secret,/undeclared read/);assert.throws(()=>api.secret=1,/undeclared write/);
 assert.throws(()=>createFeatureRuntime([feature('missing',[],['absent'])]),/missing dependency/);
});
test('preserves uninitialized lexical bindings and var hoisting',()=>{
 const a=feature('a',[],['later','varValue'],[],()=>{},ctx=>{assert.equal(ctx.varValue,undefined);assert.throws(()=>ctx.later,/before initialization/)});
 const b=feature('b',[{name:'later',kind:'let'},{name:'varValue',kind:'var'}],[],[],()=>{},ctx=>{ctx.later=1});createFeatureRuntime([a,b]).start();
});
test('deferred child scope reads parent values without copying stale state',()=>{
 let parent,child;createFeatureRuntime([feature('parent',[{name:'role',kind:'let'}],[],[],()=>{},c=>{c.role='viewer';parent=c})]).start();
 createFeatureRuntime([feature('child',[],['role'],['role'],()=>{},c=>child=c)],{parent}).start();parent.role='admin';assert.equal(child.role,'admin');child.role='editor';assert.equal(parent.role,'editor');
});
test('message subscriptions share one listener and unsubscribe independently',()=>{
 const target=new EventTarget();let adds=0,removes=0;const add=target.addEventListener.bind(target),remove=target.removeEventListener.bind(target);
 target.addEventListener=(...args)=>{adds++;add(...args)};target.removeEventListener=(...args)=>{removes++;remove(...args)};
 const events=createWindowEvents(target),seen=[];const offA=events.onMessage(e=>seen.push('a:'+e.data)),offB=events.onMessage(e=>seen.push('b:'+e.data));assert.equal(adds,1);
 target.dispatchEvent(new MessageEvent('message',{data:1}));offA();target.dispatchEvent(new MessageEvent('message',{data:2}));offB();assert.equal(removes,1);assert.deepEqual(seen,['a:1','b:1','b:2']);events.dispose();
});
