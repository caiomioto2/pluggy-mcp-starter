import { z } from "zod";
const accountSchema = z.object({
 id:z.string(), type:z.enum(["BANK","CREDIT"]), subtype:z.string().nullable().optional(),
 name:z.string().nullable().optional(), number:z.string().nullable().optional(),
 balance:z.number().finite().nullable().optional(), currencyCode:z.string().nullable().optional(),
 creditData:z.object({creditLimit:z.number().finite().nullable().optional(),availableCreditLimit:z.number().finite().nullable().optional()}).nullable().optional()
});
const txSchema = z.object({
 id:z.string(), accountId:z.string(), date:z.string().datetime({offset:true}),
 description:z.string(), category:z.string().nullable().optional(),
 amount:z.number().finite(), currencyCode:z.string(), type:z.enum(["DEBIT","CREDIT"]),
 status:z.enum(["PENDING","POSTED"])
});
export type Row = ReturnType<typeof normalize>;
export type AccountRow = {
 conta_id:string; tipo_conta:"BANK"|"CREDIT"; subtipo:string|null; nome:string|null;
 identificador_mascarado:string|null; saldo_centavos:number|null; moeda:string|null;
 limite_credito_centavos:number|null; limite_disponivel_centavos:number|null;
 transacoes_no_periodo:number;
};
export function normalize(t:z.infer<typeof txSchema>, accountType:string) {
 return {id:t.id,conta_id:t.accountId,tipo_conta:accountType,data:t.date.slice(0,10),
 descricao:t.description,categoria:t.category ?? "Sem categoria",moeda:t.currencyCode,
 valor_centavos:Math.round(t.amount*100),tipo:t.type,status:t.status,
 debito_bruto_centavos:t.type==="DEBIT"?Math.round(Math.abs(t.amount)*100):0};
}
export async function collect(request:<T>(path:string)=>Promise<T>,itemId:string,from:string,to:string) {
 const item=await request<Record<string,unknown>>("/items/"+itemId);
 if (item.executionStatus !== "SUCCESS") throw new Error("Conexão não está com sincronização completa. Nenhum total será apresentado.");
 const accounts=z.object({results:z.array(accountSchema)}).parse(await request("/accounts?itemId="+itemId)).results;
 if (!accounts.length) throw new Error("Nenhuma conta disponível na conexão.");
 const rows:Row[]=[]; const ids=new Set<string>();
 for(const a of accounts) {
  const params=new URLSearchParams({accountId:a.id,dateFrom:from,dateTo:to});
  let path="/v2/transactions?"+params;
  const seen=new Set<string>();
  for(let pages=0;;pages++){
   if(pages>=200 || seen.has(path)) throw new Error("Paginação incompleta ou repetida. Reduza o período.");
   seen.add(path);
   const page=z.object({results:z.array(txSchema),next:z.string().nullable().optional()}).parse(await request(path));
   for(const t of page.results) {
    if(t.accountId!==a.id) throw new Error("Resposta de conta inesperada.");
    if(t.date.slice(0,10)<from || t.date.slice(0,10)>to) continue;
    if(ids.has(t.id)) continue;
    ids.add(t.id); rows.push(normalize(t,a.type));
    if(rows.length>50000) throw new Error("Mais de 50 mil transações. Reduza o período; total não calculado.");
   }
   if(!page.next) break;
   if(!page.next.startsWith("?")) throw new Error("Cursor inesperado.");
   const next=new URLSearchParams(page.next);
   if(next.get("accountId")!==a.id) throw new Error("Cursor mudou de conta.");
   path="/v2/transactions"+page.next;
  }
 }
 const accountRows:AccountRow[]=accounts.map(a=>({
  conta_id:a.id,tipo_conta:a.type,subtipo:a.subtype??null,nome:a.name??null,
  identificador_mascarado:a.number??null,
  saldo_centavos:a.balance==null?null:Math.round(a.balance*100),moeda:a.currencyCode??null,
  limite_credito_centavos:a.creditData?.creditLimit==null?null:Math.round(a.creditData.creditLimit*100),
  limite_disponivel_centavos:a.creditData?.availableCreditLimit==null?null:Math.round(a.creditData.availableCreditLimit*100),
  transacoes_no_periodo:rows.filter(row=>row.conta_id===a.id).length
 }));
 return {rows,accounts:accountRows,coverage:{complete:true,connections:1,accounts:accounts.length,transactions:rows.length,lastUpdatedAt:item.lastUpdatedAt??null,scope:"1 conexão; somente dados disponibilizados pela Pluggy."}};
}

/** Coleta cada conexão configurada. Uma falha impede totais parciais. */
export async function collectMany(request:<T>(path:string)=>Promise<T>,itemIds:string[],from:string,to:string) {
 if (!itemIds.length) throw new Error("Nenhuma conexão Pluggy foi configurada.");
 const collections=await Promise.all(itemIds.map(itemId=>collect(request,itemId,from,to)));
 const rows=collections.flatMap(collection=>collection.rows);
 const accounts=collections.flatMap(collection=>collection.accounts);
 const accountIds=new Set<string>();
 const transactionIds=new Set<string>();
 for(const account of accounts) {
  if(accountIds.has(account.conta_id)) throw new Error("A mesma conta foi retornada por mais de uma conexão. Nenhum total será apresentado.");
  accountIds.add(account.conta_id);
 }
 for(const row of rows) {
  if(transactionIds.has(row.id)) throw new Error("A mesma transação foi retornada por mais de uma conexão. Nenhum total será apresentado.");
  transactionIds.add(row.id);
 }
 return {rows,accounts,coverage:{
  complete:true,connections:itemIds.length,accounts:accounts.length,transactions:rows.length,
  lastUpdatedAt:collections.map(collection=>collection.coverage.lastUpdatedAt),
  scope:`${itemIds.length} conexões; somente dados disponibilizados pela Pluggy.`
 }};
}
