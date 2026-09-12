import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runQuery} from '../dist/query.js';
import {collect,collectMany,normalize} from '../dist/collect.js';
import {TimedSnapshotCache} from '../dist/cache.js';
import {refreshItem,refreshStatus} from '../dist/refresh.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const tx=(id,amount,type='DEBIT')=>({id,amount,type,accountId:'a',date:'2026-09-01T12:00:00Z',description:'Teste',currencyCode:'BRL',status:'POSTED',category:'Mercado'});
const rows=[normalize(tx('1',100),'CREDIT'),normalize(tx('2',-100,'CREDIT'),'CREDIT')];
const accounts=[{conta_id:'a',item_id:'item-a',connector_id:'101',connector_name:'Example Bank Business',institution_name:'Example Bank',tipo_conta:'CREDIT',subtipo:'CREDIT_CARD',nome:'Cartão',identificador_mascarado:'***2BC',saldo_centavos:0,moeda:'BRL',limite_credito_centavos:100000,limite_disponivel_centavos:90000,transacoes_no_periodo:2}];
test('cartão positivo é débito; pagamento negativo não é gasto',async()=>{
 const r=await runQuery(rows,accounts,'SELECT SUM(debito_bruto_centavos) AS total FROM transacoes',100);
 assert.equal(r.rows[0].total,10000);
});
test('SQL bloqueia escrita, attach, extensões e tabelas internas',async()=>{
 for(const sql of ['DELETE FROM transacoes',"ATTACH DATABASE '/tmp/test' AS other",'SELECT * FROM sqlite_master',"SELECT load_extension('x')",'SELECT 1; DELETE FROM transacoes','SELECT * FROM pragma_database_list'])await assert.rejects(runQuery(rows,accounts,sql,100));
});
test('WITH, agrupamento, limite e truncamento',async()=>{
 const r=await runQuery(rows,accounts,'WITH x AS (SELECT moeda,valor_centavos FROM transacoes) SELECT moeda,SUM(valor_centavos) AS total FROM x GROUP BY moeda',100);
 assert.equal(r.rows[0].total,0);
 assert.equal((await runQuery(rows,accounts,'SELECT * FROM transacoes',1)).truncated,true);
});
test('contas aparecem mesmo sem transações no período',async()=>{
 const withoutTransactions={...accounts[0],conta_id:'b',nome:'Conta sem uso',identificador_mascarado:'***9ZZ',tipo_conta:'BANK',subtipo:'CHECKINGS_ACCOUNT',transacoes_no_periodo:0};
 const r=await runQuery(rows,[...accounts,withoutTransactions],'SELECT conta_id,identificador_mascarado,transacoes_no_periodo FROM contas ORDER BY conta_id',100);
 assert.deepEqual(r.rows,[{conta_id:'a',identificador_mascarado:'***2BC',transacoes_no_periodo:2},{conta_id:'b',identificador_mascarado:'***9ZZ',transacoes_no_periodo:0}]);
});
test('consulta infinita termina no limite de tempo',async()=>{
 await assert.rejects(runQuery(rows,accounts,'WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x) SELECT SUM(n) FROM x',100));
});
test('coleta segue cursor e deduplica IDs',async()=>{
 const paths=[];
 const req=async path=>{paths.push(path); if(path.startsWith('/items/'))return {executionStatus:'SUCCESS'};if(path.startsWith('/accounts'))return {results:[{id:'a',type:'CREDIT',number:'***2BC'},{id:'b',type:'BANK',number:'***9ZZ'}]};if(path.includes('accountId=b'))return {results:[],next:null};if(path.includes('after='))return {results:[tx('1',100),tx('2',50)],next:null};return {results:[tx('1',100)],next:'?accountId=a&after=cursor'};};
 const r=await collect(req,'item','2026-09-01','2026-09-30');assert.equal(r.rows.length,2);assert.deepEqual(r.accounts.map(a=>[a.identificador_mascarado,a.transacoes_no_periodo]),[['***2BC',2],['***9ZZ',0]]);assert.equal(paths.length,5);
});
test('cursor repetido e coleta parcial nunca viram total completo',async()=>{
 const req=async path=>path.startsWith('/items/')?{executionStatus:'SUCCESS'}:path.startsWith('/accounts')?{results:[{id:'a',type:'BANK'}]}:{results:[tx('1',-10)],next:'?accountId=a&after=loop'};
 await assert.rejects(collect(req,'item','2026-09-01','2026-09-30'));
 await assert.rejects(collect(async()=>({executionStatus:'PARTIAL_SUCCESS'}),'item','2026-09-01','2026-09-30'));
});
test('coleta agrega todas as conexões configuradas',async()=>{
 const req=async path=>{
  if(path.startsWith('/items/')) return {executionStatus:'SUCCESS',lastUpdatedAt:'2026-09-01T12:00:00Z'};
  if(path.includes('itemId=item-a')) return {results:[{id:'a',type:'BANK',number:'***111'}]};
  if(path.includes('itemId=item-b')) return {results:[{id:'b',type:'CREDIT',number:'***222'}]};
  if(path.includes('accountId=a')) return {results:[tx('tx-a',-10)],next:null};
  return {results:[{...tx('tx-b',20),accountId:'b'}],next:null};
 };
 const result=await collectMany(req,['item-a','item-b'],'2026-09-01','2026-09-30');
 assert.equal(result.coverage.connections,2);assert.equal(result.coverage.accounts,2);assert.equal(result.coverage.transactions,2);
 assert.deepEqual(result.accounts.map(account=>account.identificador_mascarado),['***111','***222']);
});
test('accounts preserve their Item and real Connector metadata',async()=>{
 const req=async path=>{
  if(path==='/items/item-business') return {executionStatus:'SUCCESS',connector:{id:201,name:'Example Bank Business',institution:{name:'Example Bank'}}};
  if(path.startsWith('/accounts')) return {results:[{id:'checking',itemId:'item-business',type:'BANK',number:'***1111'},{id:'card',itemId:'item-business',type:'CREDIT',number:'***2222'}]};
  return {results:[],next:null};
 };
 const result=await collect(req,'item-business','2026-09-01','2026-09-30');
 assert.deepEqual(result.accounts.map(({conta_id,item_id,connector_id,connector_name,institution_name})=>({conta_id,item_id,connector_id,connector_name,institution_name})),[
  {conta_id:'checking',item_id:'item-business',connector_id:'201',connector_name:'Example Bank Business',institution_name:'Example Bank'},
  {conta_id:'card',item_id:'item-business',connector_id:'201',connector_name:'Example Bank Business',institution_name:'Example Bank'}
 ]);
});
test('Connector lookup is shared and missing institution metadata remains NULL',async()=>{
 const paths=[];
 const req=async path=>{
  paths.push(path);
  if(path==='/items/item-a'||path==='/items/item-b') return {executionStatus:'SUCCESS',connectorId:101};
  if(path==='/connectors/101') return {id:101,name:'Example Bank'};
  if(path.includes('itemId=item-a')) return {results:[{id:'a',itemId:'item-a',type:'BANK'}]};
  if(path.includes('itemId=item-b')) return {results:[{id:'b',itemId:'item-b',type:'CREDIT'}]};
  return {results:[],next:null};
 };
 const result=await collectMany(req,['item-a','item-b'],'2026-09-01','2026-09-30');
 assert.equal(paths.filter(path=>path==='/connectors/101').length,1);
 assert.deepEqual(result.accounts.map(account=>[account.item_id,account.connector_id,account.connector_name,account.institution_name]),[['item-a','101','Example Bank',null],['item-b','101','Example Bank',null]]);
});
test('existing account queries continue to work with added columns',async()=>{
 const r=await runQuery(rows,accounts,'SELECT conta_id,nome,identificador_mascarado,tipo_conta FROM contas',100);
 assert.deepEqual(r.rows,[{conta_id:'a',nome:'Cartão',identificador_mascarado:'***2BC',tipo_conta:'CREDIT'}]);
});
test('MCP expõe as ferramentas financeiras sem credenciais',async()=>{
 const client=new Client({name:'test',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:['dist/index.js'],env:{},stderr:'pipe'});
 try{await client.connect(transport);assert.deepEqual((await client.listTools()).tools.map(t=>t.name),['financeiro_schema','financeiro_query','financeiro_refresh_item','financeiro_refresh_status']);const r=await client.callTool({name:'financeiro_schema',arguments:{}});assert.ok(r.structuredContent.tables.transacoes);assert.ok(r.structuredContent.tables.contas);}finally{await client.close();}
});
const itemId='11111111-1111-4111-8111-111111111111';
test('authorized refresh sends one empty PATCH and invalidates cache',async()=>{
 const calls=[];let invalidated=0;
 const result=await refreshItem({itemId,allowedItemIds:[itemId],invalidateCache:()=>invalidated++,request:async(path,init)=>{calls.push({path,init});return {status:'UPDATING'};}});
 assert.equal(result.refresh_requested,true);assert.equal(invalidated,1);assert.deepEqual(calls,[{path:'/items/'+itemId,init:{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'}}]);
});
test('unconfigured Item never reaches the Pluggy API',async()=>{
 let calls=0;const result=await refreshItem({itemId,allowedItemIds:[],invalidateCache:()=>{},request:async()=>{calls++;return {};}});
 assert.equal(result.reason,'ITEM_NOT_ALLOWED');assert.equal(calls,0);
});
test('refresh handles conflict, rate limit, MFA, credentials and missing Item safely',async()=>{
 for(const [status,code,expected,field] of [[409,'ITEM_UPDATING','ITEM_UPDATING','retryable'],[429,'BEFORE_ALLOWED_FREQUENCY','RATE_LIMIT','retryable'],[400,'WAITING_USER_INPUT','WAITING_USER_INPUT','requires_user_action'],[400,'INVALID_CREDENTIALS','INVALID_CREDENTIALS','requires_reconnection'],[404,undefined,'ITEM_NOT_FOUND',undefined]]){
  const error=Object.assign(new Error('api-key must-not-leak'),{status,code});
  const result=await refreshItem({itemId,allowedItemIds:[itemId],invalidateCache:()=>{},request:async()=>{throw error;}});
  assert.equal(result.reason,expected);if(field)assert.equal(result[field],true);assert.equal(JSON.stringify(result).includes('must-not-leak'),false);
 }
});
test('bounded polling checks status without another PATCH',async()=>{
 let gets=0;let waits=0;
 const result=await refreshItem({itemId,allowedItemIds:[itemId],invalidateCache:()=>{},waitForCompletion:true,wait:async()=>{waits++;},request:async(_path,init)=>{
  if(init?.method==='PATCH')return {status:'UPDATING'};gets++;return {status:gets===1?'UPDATING':'UPDATED',executionStatus:'SUCCESS'};
 }});
 assert.equal(result.completed,true);assert.equal(gets,2);assert.equal(waits,2);
});
test('refresh status is authorized and completion invalidates cache',async()=>{
 let invalidated=0;const result=await refreshStatus({itemId,allowedItemIds:[itemId],invalidateCache:()=>invalidated++,request:async()=>({status:'UPDATED',executionStatus:'SUCCESS'})});
 assert.equal(result.completed,true);assert.equal(invalidated,1);
});
test('query cache does not retain a snapshot after refresh',async()=>{
 const cache=new TimedSnapshotCache();let loads=0;
 assert.equal((await cache.get('period',900000,async()=>({version:++loads}))).value.version,1);
 await refreshItem({itemId,allowedItemIds:[itemId],invalidateCache:()=>cache.invalidate(),request:async()=>({status:'UPDATING'})});
 assert.equal((await cache.get('period',900000,async()=>({version:++loads}))).value.version,2);
});
