import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredItemGroups} from '../dist/item-groups.js';
import {collectMany} from '../dist/collect.js';
import {runQuery} from '../dist/query.js';

const personalId='11111111-1111-4111-8111-111111111111';
const agentikId='22222222-2222-4222-8222-222222222222';

test('separa os Item IDs pessoais e da Agentik sem duplicar conexões',()=>{
 const groups=configuredItemGroups({PLUGGY_PERSONAL_ITEM_IDS:`${personalId},${personalId}`,PLUGGY_AGENTIK_ITEM_IDS:agentikId});
 assert.deepEqual(groups.pessoal,[personalId]);
 assert.deepEqual(groups.agentik,[agentikId]);
 assert.deepEqual(groups.all,[personalId,agentikId]);
 assert.equal(groups.byItemId.get(personalId),'pessoal');
 assert.equal(groups.byItemId.get(agentikId),'agentik');
 assert.equal(groups.groupsConfigured,true);
});

test('modo legado preserva Item IDs e os deixa explicitamente sem grupo',()=>{
 const groups=configuredItemGroups({PLUGGY_ITEM_IDS:`${personalId},${agentikId}`});
 assert.deepEqual(groups.all,[personalId,agentikId]);
 assert.equal(groups.byItemId.get(personalId),'nao_classificado');
 assert.equal(groups.groupsConfigured,false);
});

test('recusa grupo incompleto, UUID inválido e Item ID duplicado entre grupos',()=>{
 assert.throws(()=>configuredItemGroups({PLUGGY_PERSONAL_ITEM_IDS:personalId}),/PLUGGY_AGENTIK_ITEM_IDS/);
 assert.throws(()=>configuredItemGroups({PLUGGY_PERSONAL_ITEM_IDS:'invalid',PLUGGY_AGENTIK_ITEM_IDS:agentikId}));
 assert.throws(()=>configuredItemGroups({PLUGGY_PERSONAL_ITEM_IDS:personalId,PLUGGY_AGENTIK_ITEM_IDS:personalId}),/não pode aparecer/);
});

test('coleta rotula contas e transações e a consulta pode filtrar por grupo',async()=>{
 const tx=(id,accountId)=>({id,accountId,date:'2026-09-10T12:00:00Z',description:'Recebimento teste',category:'Income',amount:100,currencyCode:'BRL',type:'CREDIT',status:'POSTED'});
 const request=async path=>{
  if(path.startsWith('/items/'))return {executionStatus:'SUCCESS'};
  if(path===`/accounts?itemId=${personalId}`)return {results:[{id:'personal-account',type:'BANK'}]};
  if(path===`/accounts?itemId=${agentikId}`)return {results:[{id:'agentik-account',type:'BANK'}]};
  if(path.includes('accountId=personal-account'))return {results:[tx('personal-tx','personal-account')],next:null};
  if(path.includes('accountId=agentik-account'))return {results:[tx('agentik-tx','agentik-account')],next:null};
  throw new Error(`unexpected request ${path}`);
 };
 const groups=configuredItemGroups({PLUGGY_PERSONAL_ITEM_IDS:personalId,PLUGGY_AGENTIK_ITEM_IDS:agentikId});
 const snapshot=await collectMany(request,groups.all,'2026-09-01','2026-09-30',groups.byItemId);
 assert.deepEqual(snapshot.accounts.map(row=>row.grupo),['pessoal','agentik']);
 assert.deepEqual(snapshot.rows.map(row=>row.grupo),['pessoal','agentik']);
 assert.equal(snapshot.coverage.by_group.pessoal.connections,1);
 assert.equal(snapshot.coverage.by_group.agentik.connections,1);
 const personalRows=snapshot.rows.filter(row=>row.grupo==='pessoal');
 const personalAccounts=snapshot.accounts.filter(row=>row.grupo==='pessoal');
 const result=await runQuery(personalRows,personalAccounts,'SELECT grupo,COUNT(*) AS total FROM transacoes GROUP BY grupo',100);
 assert.deepEqual(result.rows,[{grupo:'pessoal',total:1}]);
});
