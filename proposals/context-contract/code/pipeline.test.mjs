import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSearchInput,mapUrgencyHours} from './pipeline.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url),'utf8'));
const fixture=()=>read('./situation.search-ready.example.json');
const run=(c,overrides={})=>buildSearchInput(c,{messages:read('./messages.search-ready.example.json'),confirmedContext:structuredClone(c),approvedActionIds:['a1','a2','a3'],...overrides});
test('golden grades input matches exactly',()=>assert.deepEqual(run(fixture()),{status:'ready',input:read('./search-input.example.json')}));
test('unknown context is preserved and not searchable',()=>{
 const c=read('./situation.example.json');const messages=read('./context-test-cases.json')[0].messages;
 assert.equal(run(c,{messages}).status,'needs_mapping');
});
test('unconfirmed server snapshot blocks search',()=>assert.equal(run(fixture(),{confirmedContext:null}).status,'needs_confirmation'));
test('correction invalidates old confirmation',()=>{const c=fixture(),old=structuredClone(c);c.situation.summary='정정';assert.equal(run(c,{confirmedContext:old}).status,'needs_confirmation');});
test('model confirmation alone cannot authorize actions',()=>assert.equal(run(fixture(),{approvedActionIds:[]}).status,'needs_mapping'));
test('invalid vocabulary rejected',()=>{const c=fixture();c.searchMapping.problem_type.items[0].value='invented';assert.equal(run(c).status,'invalid');});
test('fabricated quote rejected',()=>{const c=fixture();c.searchMapping.urgency.items[0].evidence[0].quote='내일';assert.equal(run(c).status,'invalid');});
test('confirmed action requires evidence',()=>{const c=fixture();c.situation.consideredActions[0].confirmationEvidence=[];assert.equal(run(c).status,'invalid');});
test('unknown attempted actions cannot contain items',()=>{const c=fixture();c.situation.attemptedActions.items=[c.situation.facts[0]];assert.equal(run(c).status,'invalid');});
test('missing references rejected',()=>{const c=fixture();c.situation.interpretations=[{id:'i1',text:'가설',basedOnFactIds:['missing'],status:'needs_confirmation',confirmationEvidence:[]}];assert.equal(run(c).status,'invalid');});
test('urgency boundaries and vocabulary gaps',()=>{
 for(const h of [12,18,23.9,73,95.9,-1])assert.equal(mapUrgencyHours(h).status,'unmapped');
 for(const [h,v] of [[0,'under_12h'],[24,'1_3_days'],[72,'1_3_days'],[96,'4_7_days'],[168,'4_7_days'],[169,'over_1_week']])assert.equal(mapUrgencyHours(h).value,v);
 assert.equal(mapUrgencyHours(null).status,'unknown');
});
