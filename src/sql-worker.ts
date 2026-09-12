import { DatabaseSync, constants } from "node:sqlite";
import type { AccountRow, Row } from "./collect.js";
process.once("message",(workerData:{rows:Row[];accounts:AccountRow[];sql:string;limit:number})=>{
const db=new DatabaseSync(":memory:",{allowExtension:false});
try {
 db.exec("CREATE TABLE contas(conta_id TEXT PRIMARY KEY,item_id TEXT NOT NULL,connector_id TEXT,connector_name TEXT,institution_name TEXT,tipo_conta TEXT,subtipo TEXT,nome TEXT,identificador_mascarado TEXT,saldo_centavos INTEGER,moeda TEXT,limite_credito_centavos INTEGER,limite_disponivel_centavos INTEGER,transacoes_no_periodo INTEGER)");
 db.exec("CREATE TABLE transacoes(id TEXT PRIMARY KEY,conta_id TEXT,tipo_conta TEXT,data TEXT,descricao TEXT,categoria TEXT,moeda TEXT,valor_centavos INTEGER,tipo TEXT,status TEXT,debito_bruto_centavos INTEGER)");
 const insertAccount=db.prepare("INSERT INTO contas VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
 const insert=db.prepare("INSERT INTO transacoes VALUES(?,?,?,?,?,?,?,?,?,?,?)");
 db.exec("BEGIN");
 for(const a of workerData.accounts as AccountRow[]) insertAccount.run(a.conta_id,a.item_id,a.connector_id,a.connector_name,a.institution_name,a.tipo_conta,a.subtipo,a.nome,a.identificador_mascarado,a.saldo_centavos,a.moeda,a.limite_credito_centavos,a.limite_disponivel_centavos,a.transacoes_no_periodo);
 for(const r of workerData.rows as Row[]) insert.run(r.id,r.conta_id,r.tipo_conta,r.data,r.descricao,r.categoria,r.moeda,r.valor_centavos,r.tipo,r.status,r.debito_bruto_centavos);
 db.exec("COMMIT; PRAGMA hard_heap_limit=67108864; PRAGMA query_only=ON");
 const allowedFunctions=new Set(["sum","total","count","avg","min","max","round","abs","coalesce","nullif","ifnull","lower","upper","length","substr","substring","strftime","date","like","glob"]);
 db.setAuthorizer((action,arg1,arg2)=>{
  if(action===constants.SQLITE_SELECT || action===constants.SQLITE_RECURSIVE) return constants.SQLITE_OK;
  if(action===constants.SQLITE_READ && (arg1==="transacoes" || arg1==="contas"))return constants.SQLITE_OK;
  if(action===constants.SQLITE_FUNCTION && allowedFunctions.has(String(arg2).toLowerCase()))return constants.SQLITE_OK;
  return constants.SQLITE_DENY;
 });
 const statement=db.prepare("SELECT * FROM ("+workerData.sql+") LIMIT ?");
 const rows=[];let bytes=0;let truncated=false;
 for(const row of statement.iterate(workerData.limit+1)){
  const size=Buffer.byteLength(JSON.stringify(row));
  if(rows.length>=workerData.limit || bytes+size>24000){truncated=true;break;}
  bytes+=size;rows.push(row);
 }
 process.send?.({rows,truncated,returned:rows.length});
} catch {process.send?.({error:"Consulta recusada ou SQL inválido. Use apenas SELECT sobre contas, transacoes e funções analíticas comuns."});}
finally {db.close();}
});
