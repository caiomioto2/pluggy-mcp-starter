import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const MAX_BODY_BYTES = 1_000_000;

function json(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function authorized(request: IncomingMessage, token: string) {
  const received = request.headers.authorization;
  const expected = `Bearer ${token}`;
  if (!received || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function startHttpServer(createFinanceServer: () => McpServer) {
  const token = process.env.MCP_HTTP_TOKEN?.trim();
  if (!token) return;
  const port = Number.parseInt(process.env.MCP_HTTP_PORT ?? "3000", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MCP_HTTP_PORT inválida.");

  const http = createServer(async (request, response) => {
    if (request.url === "/healthz") return json(response, 200, { status: "ok" });
    if (request.url !== "/mcp") return json(response, 404, { error: "Not found" });
    if (!authorized(request, token)) {
      response.writeHead(401, { "WWW-Authenticate": "Bearer" });
      return response.end();
    }
    if (request.method !== "POST") return json(response, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
    try {
      const body = await readJson(request);
      const server = createFinanceServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
      response.on("close", () => { void transport.close(); void server.close(); });
    } catch (error) {
      console.error("Erro ao atender MCP HTTP", error);
      if (!response.headersSent) json(response, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });
  http.listen(port, "0.0.0.0", () => console.error(`MCP HTTP privado pronto na porta ${port}.`));
}
