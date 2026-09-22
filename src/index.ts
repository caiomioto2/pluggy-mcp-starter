#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runQuery, schema } from "./query.js";
import { collectMany } from "./collect.js";
import { startHttpServer } from "./http.js";
import { TimedSnapshotCache } from "./cache.js";
import { refreshItem, refreshStatus } from "./refresh.js";
import { collectCards } from "./cards.js";

const API_URL = "https://api.pluggy.ai";
const PAGE_SIZE = 500;
const MAX_TRANSACTIONS = 10_000;

type JsonObject = Record<string, unknown>;

interface PluggyTransaction {
  id?: string;
  date?: string;
  description?: string;
  merchant?: string | JsonObject;
  category?: string;
  amount?: number;
  type?: string;
  accountId?: string;
  [key: string]: unknown;
}

interface PluggyPage<T> {
  results?: T[];
  total?: number;
  totalPages?: number;
  page?: number;
  pageSize?: number;
}

class PluggyHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "PluggyHttpError";
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não está configurada neste serviço.`);
  return value;
}

export function configuredItemIds(environment: NodeJS.ProcessEnv = process.env): string[] {
  const raw = environment.PLUGGY_ITEM_IDS?.trim() || environment.PLUGGY_ITEM_ID?.trim();
  if (!raw) throw new Error("Configure PLUGGY_ITEM_IDS com os itemIds das conexões Pluggy (ou PLUGGY_ITEM_ID para uma única conexão).");
  const itemIds = raw.split(/[\s,;]+/).filter(Boolean).map(value => z.string().uuid().parse(value));
  return [...new Set(itemIds)];
}

async function pluggyRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const clientId = requiredEnvironment("PLUGGY_CLIENT_ID");
  const clientSecret = requiredEnvironment("PLUGGY_CLIENT_SECRET");
  const authResponse = await fetch(`${API_URL}/auth`, {
    signal: AbortSignal.timeout(20000),
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!authResponse.ok) {
    throw await toPluggyError(authResponse, "autenticar na Pluggy");
  }

  const authPayload: unknown = await authResponse.json();
  if (!isObject(authPayload) || typeof authPayload.apiKey !== "string") {
    throw new Error("A Pluggy não retornou uma API key válida.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(20000),
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
      "X-API-KEY": authPayload.apiKey,
    },
  });

  if (!response.ok) {
    throw await toPluggyError(response, path);
  }
  return (await response.json()) as T;
}

async function toPluggyError(response: Response, operation: string): Promise<PluggyHttpError> {
  let code: string | undefined;
  let message = `A Pluggy recusou a operação '${operation}'.`;
  try {
    const payload: unknown = await response.json();
    if (isObject(payload)) {
      code = typeof payload.code === "string" ? payload.code : undefined;
      if (typeof payload.message === "string") message = payload.message;
    }
  } catch {
    // Mantém a mensagem segura mesmo quando o corpo não é JSON.
  }
  return new PluggyHttpError(response.status, code, message);
}

function errorText(error: unknown): string {
  if (error instanceof PluggyHttpError) {
    if (error.status === 401) return "Pluggy rejeitou a API key. Tente novamente; ela é renovada a cada chamada.";
    if (error.status === 403) return "A aplicação não tem permissão para acessar esta conexão. Confirme o vínculo OAuth do MeuPluggy.";
    if (error.status === 404) return "Conexão não encontrada. Verifique se o pluggy-itemId é o Item correto.";
    if (error.status === 429) return "Limite da Pluggy atingido. Aguarde antes de repetir.";
    return `Pluggy retornou HTTP ${error.status}${error.code ? ` (${error.code})` : ""}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Erro inesperado ao consultar as finanças.";
}


export function createFinanceServer() {
  const server = new McpServer({ name: "financeiro-mcp", version: "0.2.0" });
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
  const result = (value: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value });
  server.registerTool("financeiro_schema", {
    title: "Estrutura das finanças", description: "Campos SQL, semântica e limitações das transações. Não consulta segredos.",
    inputSchema: z.object({}).strict(), annotations,
  }, async () => result(schema));
  const cache = new TimedSnapshotCache<Awaited<ReturnType<typeof collectMany>>>();
  const cardsCache = new TimedSnapshotCache<Awaited<ReturnType<typeof collectCards>>>();
  const date = z.string().refine(s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s, "Data inválida YYYY-MM-DD");
  server.registerTool("financeiro_query", {
    title: "Consultar contas e transações com SQL",
    description: "SELECT SQLite somente leitura sobre contas e transações no período UTC informado. contas inclui cada conta de cada conexão Pluggy configurada, inclusive sem transações. Reutiliza a coleta em memória por 15 minutos; um refresh invalida esse snapshot, então consulte novamente após o Item concluir. Consulte financeiro_schema antes de calcular totais.",
    inputSchema: z.object({ sql: z.string().min(1).max(8000), from: date, to: date, limit: z.number().int().min(1).max(200).default(100) }).strict(),
    annotations,
  }, async ({sql, from, to, limit}) => {
    try {
      if (from > to || (Date.parse(to)-Date.parse(from))/86400000 > 366) throw new Error("Use período ordenado de até 366 dias.");
      const key = from + ":" + to;
      const snapshot = await cache.get(key, 900000, () => collectMany(pluggyRequest, configuredItemIds(), from, to));
      const answer = await runQuery(snapshot.value.rows, snapshot.value.accounts, sql, limit);
      return result({...answer, period: {from,to,timezone:"UTC"}, collectedAt: new Date(snapshot.at).toISOString(), coverage: snapshot.value.coverage, warnings: schema.warnings});
    } catch (error) { return {isError:true, content:[{type:"text" as const,text:errorText(error)}]}; }
  });
  server.registerTool("financeiro_cartoes", {
    title: "Consultar cartões, faturas e parcelas",
    description: "Retorna cartões de crédito, Credit Card Bills e transações com status bruto da Pluggy, billId, parcelas, provenance e confidence. PENDING significa fatura aberta na Pluggy; créditos sem evidência adicional permanecem unknown, sem inferir pagamento ou estorno.",
    inputSchema: z.object({ from: date, to: date }).strict(),
    annotations,
  }, async ({ from, to }) => {
    try {
      if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366) throw new Error("Use período ordenado de até 366 dias.");
      const key = `${from}:${to}`;
      const snapshot = await cardsCache.get(key, 900000, () => collectCards(pluggyRequest, configuredItemIds(), from, to));
      return result({ ...snapshot.value, period: { from, to, timezone: "UTC" }, collectedAt: new Date(snapshot.at).toISOString() });
    } catch (error) { return { isError: true, content: [{ type: "text" as const, text: errorText(error) }] }; }
  });
  const itemId = z.string().uuid();
  server.registerTool("financeiro_refresh_item", {
    title: "Atualizar uma conexão financeira",
    description: "Solicita uma única sincronização em tempo real de um Item Pluggy autorizado. Use somente após uma alteração real e recente, como pagamento, transferência ou recebimento. Não use em loops, agendamentos ou tentativas repetidas: a Pluggy reserva esta atualização para ações disparadas pelo usuário e usa a sincronização automática na rotina. Nunca envia credenciais ou MFA. wait_for_completion consulta o estado no máximo três vezes, sem fazer novo refresh.",
    inputSchema: z.object({ item_id:itemId, wait_for_completion:z.boolean().optional().default(false) }).strict(),
    annotations: { readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:true },
  }, async ({item_id,wait_for_completion}) => result(await refreshItem({itemId:item_id,allowedItemIds:configuredItemIds(),request:pluggyRequest,invalidateCache:()=>{ cache.invalidate(); cardsCache.invalidate(); },waitForCompletion:wait_for_completion})));
  server.registerTool("financeiro_refresh_status", {
    title: "Verificar atualização de uma conexão",
    description: "Consulta o estado real de sincronização de um Item Pluggy autorizado. Quando estiver UPDATED, a próxima financeiro_query coleta dados novos.",
    inputSchema: z.object({item_id:itemId}).strict(), annotations,
  }, async ({item_id}) => result(await refreshStatus({itemId:item_id,allowedItemIds:configuredItemIds(),request:pluggyRequest,invalidateCache:()=>{ cache.invalidate(); cardsCache.invalidate(); }})));
  return server;
}

startHttpServer(createFinanceServer);
await createFinanceServer().connect(new StdioServerTransport());
