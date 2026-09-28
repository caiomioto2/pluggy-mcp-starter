type ErrorPayload = Record<string, unknown>;

export class PluggyHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "PluggyHttpError";
  }
}

function isObject(value: unknown): value is ErrorPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function toPluggyError(response: Pick<Response, "status" | "json">, operation: string): Promise<PluggyHttpError> {
  let code: string | undefined;
  let message = `A Pluggy recusou a operação '${operation}'.`;
  try {
    const payload: unknown = await response.json();
    if (isObject(payload)) {
      code = typeof payload.codeDescription === "string"
        ? payload.codeDescription
        : typeof payload.code === "string" ? payload.code : undefined;
      if (typeof payload.message === "string") message = payload.message;
    }
  } catch {
    // Preserve the safe fallback if the upstream body is not JSON.
  }
  return new PluggyHttpError(response.status, code, message);
}
