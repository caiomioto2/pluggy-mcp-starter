type JsonObject = Record<string, unknown>;

export type PluggyRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

type ItemPayload = JsonObject & { status?: string; executionStatus?: string; lastUpdatedAt?: string; updatedAt?: string; error?: unknown };

export type RefreshResult = {
  item_id: string; refresh_requested: boolean; status: string | null; execution_status: string | null;
  last_updated_at: string | null; completed: boolean; requires_user_action: boolean;
  requires_reconnection: boolean; retryable: boolean; reason: string | null; usage_warning: string; next_allowed_at?: string;
};

export const refreshUsageWarning = "Use o refresh manual somente após uma alteração real e recente. Não repita, agende ou execute em lote: a Pluggy reserva esta atualização para ações disparadas pelo usuário; a sincronização de rotina é automática.";

function record(value: unknown): JsonObject | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : undefined; }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function errorCode(item: ItemPayload): string | null { return text(record(item.error)?.code) ?? text(item.executionStatus) ?? null; }
function isUserAction(status: string | null, code: string | null): boolean { return status === "WAITING_USER_INPUT" || code === "WAITING_USER_INPUT" || code === "MFA_REQUIRED"; }
function isReconnect(status: string | null, code: string | null): boolean { return status === "LOGIN_ERROR" || status === "INVALID_CREDENTIALS" || code === "INVALID_CREDENTIALS" || code === "ITEM_LOGIN_ERROR"; }
function isCompleted(status: string | null, executionStatus: string | null): boolean { return status === "UPDATED" && (executionStatus === null || executionStatus === "SUCCESS"); }

export function itemStatus(itemId: string, payload: unknown): RefreshResult {
  const item = (record(payload) ?? {}) as ItemPayload;
  const status = text(item.status); const executionStatus = text(item.executionStatus); const code = errorCode(item);
  return { item_id:itemId, refresh_requested:false, status, execution_status:executionStatus,
    last_updated_at:text(item.lastUpdatedAt) ?? text(item.updatedAt), completed:isCompleted(status,executionStatus),
    requires_user_action:isUserAction(status,code), requires_reconnection:isReconnect(status,code), retryable:status === "UPDATING", reason:code, usage_warning:refreshUsageWarning };
}

function errorDetails(error: unknown): { status?: number; code?: string; nextAllowedAt?: string } {
  const value = record(error) ?? {};
  return { status:typeof value.status === "number" ? value.status : undefined, code:text(value.code) ?? undefined,
    nextAllowedAt:text(value.nextAllowedAt) ?? text(record(value.details)?.nextAllowedAt) ?? undefined };
}

function errorResult(itemId: string, error: unknown): RefreshResult {
  const { status, code, nextAllowedAt } = errorDetails(error);
  const rateLimited = status === 429 || code === "BEFORE_ALLOWED_FREQUENCY" || code === "RATE_LIMIT_EXCEEDED";
  const requiresUserAction = code === "WAITING_USER_INPUT" || code === "MFA_REQUIRED";
  const requiresReconnection = code === "INVALID_CREDENTIALS" || code === "ITEM_LOGIN_ERROR";
  const result: RefreshResult = { item_id:itemId, refresh_requested:false, status:status === 409 ? "UPDATING" : null,
    execution_status:null, last_updated_at:null, completed:false, requires_user_action:requiresUserAction,
    requires_reconnection:requiresReconnection, retryable:status === 409 || rateLimited || status === 502 || status === 503,
    reason:rateLimited ? "RATE_LIMIT" : code ?? (status === 404 ? "ITEM_NOT_FOUND" : status === 409 ? "CONFLICT" : "REFRESH_FAILED"), usage_warning:refreshUsageWarning };
  if (nextAllowedAt) result.next_allowed_at = nextAllowedAt;
  return result;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const forbidden = (itemId: string): RefreshResult => ({item_id:itemId,refresh_requested:false,status:null,execution_status:null,last_updated_at:null,completed:false,requires_user_action:false,requires_reconnection:false,retryable:false,reason:"ITEM_NOT_ALLOWED",usage_warning:refreshUsageWarning});

export async function refreshItem(options: { itemId:string; allowedItemIds:readonly string[]; request:PluggyRequest; invalidateCache:()=>void; waitForCompletion?:boolean; wait?:(ms:number)=>Promise<void> }): Promise<RefreshResult> {
  const { itemId, allowedItemIds, request, invalidateCache, waitForCompletion=false, wait=sleep } = options;
  if (!allowedItemIds.includes(itemId)) return forbidden(itemId);
  try {
    const payload = await request<unknown>(`/items/${encodeURIComponent(itemId)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:"{}"});
    invalidateCache();
    let result = {...itemStatus(itemId,payload),refresh_requested:true,retryable:false};
    if (!waitForCompletion || result.completed || result.requires_user_action || result.requires_reconnection) return result;
    try {
      for (let attempt=0;attempt<3;attempt+=1) {
        await wait(2_000);
        result={...itemStatus(itemId,await request<unknown>(`/items/${encodeURIComponent(itemId)}`)),refresh_requested:true,retryable:false};
        if (result.completed || result.requires_user_action || result.requires_reconnection || result.status !== "UPDATING") break;
      }
    } catch (error) { return {...errorResult(itemId,error),refresh_requested:true}; }
    return result;
  } catch (error) { const result=errorResult(itemId,error); if(result.status === "UPDATING")invalidateCache(); return result; }
}

export async function refreshStatus(options: { itemId:string; allowedItemIds:readonly string[]; request:PluggyRequest; invalidateCache:()=>void }): Promise<RefreshResult> {
  const {itemId,allowedItemIds,request,invalidateCache}=options;
  if(!allowedItemIds.includes(itemId))return forbidden(itemId);
  try { const result=itemStatus(itemId,await request<unknown>(`/items/${encodeURIComponent(itemId)}`));if(result.completed)invalidateCache();return result; }
  catch(error){return errorResult(itemId,error);}
}
