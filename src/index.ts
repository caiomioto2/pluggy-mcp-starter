#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runQuery, schema } from "./query.js";
import { collectMany } from "./collect.js";
import { startHttpServer } from "./http.js";

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
  const server = new McpServer({ name: "pluggy-mcp-starter", version: "0.1.0" });
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
  const result = (value: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value });
  server.registerTool("pluggy_schema", {
    title: "Pluggy finance schema", description: "SQL fields, semantics, and transaction limitations. Does not access secrets.",
    inputSchema: z.object({}).strict(), annotations,
  }, async () => result(schema));
  let cache: { key: string; at: number; data: Awaited<ReturnType<typeof collectMany>> } | undefined;
  const date = z.string().refine(s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s, "Data inválida YYYY-MM-DD");
  server.registerTool("pluggy_query", {
    title: "Query Pluggy accounts and transactions with SQL",
    description: "Read-only SQLite SELECT over accounts and transactions for the requested UTC period. accounts includes every account returned by every configured Pluggy connection, including accounts without transactions. Reuses collection in memory for 15 minutes and returns coverage metadata. Call pluggy_schema before computing totals.",
    inputSchema: z.object({ sql: z.string().min(1).max(8000), from: date, to: date, limit: z.number().int().min(1).max(200).default(100) }).strict(),
    annotations,
  }, async ({sql, from, to, limit}) => {
    try {
      if (from > to || (Date.parse(to)-Date.parse(from))/86400000 > 366) throw new Error("Use período ordenado de até 366 dias.");
      const key = from + ":" + to;
      if (!cache || cache.key !== key || Date.now()-cache.at > 900000) {
        const data = await collectMany(pluggyRequest, configuredItemIds(), from, to);
        cache = {key, at: Date.now(), data};
      }
      const answer = await runQuery(cache.data.rows, cache.data.accounts, sql, limit);
      return result({...answer, period: {from,to,timezone:"UTC"}, collectedAt: new Date(cache.at).toISOString(), coverage: cache.data.coverage, warnings: schema.warnings});
    } catch (error) { return {isError:true, content:[{type:"text" as const,text:errorText(error)}]}; }
  });
  return server;
}

startHttpServer(createFinanceServer);
await createFinanceServer().connect(new StdioServerTransport());
