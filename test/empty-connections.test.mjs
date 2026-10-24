import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectMany} from '../dist/collect.js';
import {runQuery} from '../dist/query.js';

const request = async path => {
 if (path.startsWith('/items/')) return {executionStatus:'SUCCESS'};
 if (path === '/accounts?itemId=empty') return {results:[]};
 if (path === '/accounts?itemId=valid') return {results:[{id:'bank',type:'BANK'}]};
 if (path.startsWith('/v2/transactions?')) return {results:[{id:'receipt',accountId:'bank',date:'2026-09-10T12:00:00Z',description:'Test receipt',amount:100,currencyCode:'BRL',type:'CREDIT',status:'POSTED'}],next:null};
 throw new Error('unexpected request');
};

test('empty connection preserves valid accounts and transactions with explicit partial coverage',async()=>{
 const snapshot=await collectMany(request,['empty','valid'],'2026-09-01','2026-09-30');
 assert.equal(snapshot.coverage.complete,false);
 assert.equal(snapshot.coverage.connections_without_accounts,1);
 assert.equal(snapshot.coverage.connections_with_accounts,1);
 assert.equal(snapshot.coverage.warnings.length,1);
 assert.equal(snapshot.accounts.length,1);
 assert.equal(snapshot.rows.length,1);
 const result=await runQuery(snapshot.rows,snapshot.accounts,'SELECT COUNT(*) AS receipts FROM transacoes',100);
 assert.equal(result.rows[0].receipts,1);
});

test('all connections empty is incomplete coverage rather than a complete zero',async()=>{
 const snapshot=await collectMany(request,['empty'],'2026-09-01','2026-09-30');
 assert.equal(snapshot.coverage.complete,false);
 assert.equal(snapshot.coverage.connections_with_accounts,0);
 assert.equal(snapshot.coverage.connections_without_accounts,1);
 assert.deepEqual(snapshot.accounts,[]);
 assert.deepEqual(snapshot.rows,[]);
});

test('actual upstream failures still block collection instead of returning misleading totals',async()=>{
 await assert.rejects(collectMany(async path=>{
  if(path==='/accounts?itemId=valid')throw new Error('upstream unavailable');
  return request(path);
 },['empty','valid'],'2026-09-01','2026-09-30'),/upstream unavailable/);
});
