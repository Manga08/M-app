import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import { API_LIMITS, API_VERSION, integrationGuide, integrationOpenApi, type IntegrationOperation } from "./contract";
import { runIntegrationSimulation, simulationSchema } from "./simulation";
import { parseIntegrationJson } from "./json";

const uuid = z.string().uuid();
const object = z.record(z.string(), z.unknown());
const command = z.object({ id: uuid, action: z.string().min(1).max(60), data: object }).strict();
export const commandsSchema = z.object({ operationId: uuid, expectedRevision: z.string().regex(/^\d+$/), commands: z.array(command).min(1).max(50) }).strict();
const querySchema = z.object({ queries: z.array(z.object({ id: z.string().min(1).max(80), action: z.string().min(1).max(60), data: object.optional() }).strict()).min(1).max(10) }).strict();
const contextSchema = z.object({ include: z.array(z.string().max(30)).max(12).optional(), filters: object.optional() }).strict();
const privateHeaders = { "Cache-Control": "private, no-store", Pragma: "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
type RpcError = { code?: string; message?: string };
class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryAfter = 60) { super(message); }
}

export function canonicalApiOrigin() {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://moneva-three.vercel.app");
  if (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new ApiError(503, "configuration", "La conexión todavía no está disponible.");
  return origin.origin;
}

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const gateway = process.env.MONEVA_INTEGRATION_GATEWAY_KEY;
  if (!url || !key || !gateway) throw new ApiError(503, "configuration", "Las conexiones todavía no están disponibles. Inténtalo más tarde.");
  return { client: createSupabaseClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } }), gateway };
}

export async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ApiError(415, "content_type", "Envía JSON con Content-Type: application/json.");
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > API_LIMITS.maxBodyBytes) throw new ApiError(413, "body_too_large", "La solicitud supera el tamaño permitido.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "invalid_json", "Incluye un cuerpo JSON.");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > API_LIMITS.maxBodyBytes) { await reader.cancel(); throw new ApiError(413, "body_too_large", "La solicitud supera el tamaño permitido."); }
    chunks.push(value);
  }
  try { return parseIntegrationJson(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError(400, "invalid_json", "El contenido JSON no es válido."); }
}

function fail(error: unknown, requestId: string, committed?: boolean) {
  const known = error instanceof ApiError;
  const status = known ? error.status : 503;
  return NextResponse.json({ apiVersion: API_VERSION, requestId, ...(committed === undefined || status === 503 ? {} : { committed }), error: {
    code: known ? error.code : "unavailable", message: known ? error.message : "No pudimos completar la solicitud. Reintenta con el mismo identificador si estabas guardando.", retryable: status === 429 || status === 503,
  } }, { status, headers: { ...privateHeaders, ...(status === 401 ? { "WWW-Authenticate": 'Bearer realm="Moneva"' } : {}), ...(status === 429 ? { "Retry-After": String(known ? error.retryAfter : 60) } : {}) } });
}

function rpcError(error: RpcError): never {
  const status = /^PT\d{3}$/.test(error.code ?? "") ? Number(error.code!.slice(2)) : /^(?:PGRST|40|42|08|53|57)/.test(error.code ?? "") ? 503 : 422;
  const safeMessage = status === 503 ? "No pudimos completar la operación ahora. Consulta el recibo o reintenta el mismo identificador y contenido." : error.code?.startsWith("PT") ? error.message ?? "Revisa los datos de la solicitud." : "Hay un dato o una regla financiera que impide guardar. Revisa los campos y los vínculos del comando.";
  throw new ApiError(status, status === 503 ? "unavailable" : status === 409 ? "conflict" : status === 403 ? "forbidden" : status === 401 ? "unauthorized" : "invalid_request", safeMessage);
}

let cachedCatalog: { value: IntegrationOperation[]; expires: number } | undefined;
let catalogLoading: Promise<IntegrationOperation[]> | undefined;
export async function loadIntegrationCatalog() {
  if (cachedCatalog && cachedCatalog.expires > Date.now()) return cachedCatalog.value;
  if (catalogLoading) return catalogLoading;
  catalogLoading = (async () => {
    const { client, gateway } = database();
    const { data, error } = await client.rpc("integration_schema_v1", { p_gateway_key: gateway });
    if (error) rpcError(error);
    const value = z.array(z.object({ action: z.string(), permission: z.enum(["read", "write", "full"]), arguments: z.array(z.object({ name: z.string(), type: z.string(), required: z.boolean() })), description: z.string().optional() })).parse(data);
    cachedCatalog = { value, expires: Date.now() + 600_000 };
    return value;
  })().finally(() => { catalogLoading = undefined; });
  return catalogLoading;
}

export async function handleIntegrationApi(request: Request, path: string[]) {
  const requestId = randomUUID();
  const resource = path.join("/");
  try {
    if (request.method === "GET" && ["openapi.json", "guide"].includes(resource)) {
      const operations = await loadIntegrationCatalog();
      if (resource === "guide") return new Response(integrationGuide(canonicalApiOrigin(), operations), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=600", "X-Content-Type-Options": "nosniff" } });
      return NextResponse.json(integrationOpenApi(canonicalApiOrigin(), operations, z.toJSONSchema(simulationSchema, { unrepresentable: "any" })), { headers: { "Cache-Control": "public, max-age=600", "X-Content-Type-Options": "nosniff" } });
    }
    const token = request.headers.get("authorization")?.match(/^Bearer (mnv_[A-Za-z0-9_-]{8,16}\.[A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) throw new ApiError(401, "unauthorized", "Incluye un token personal válido en Authorization: Bearer.");
    const { client, gateway } = database();
    let mode: string;
    let payload: unknown = {};
    if (request.method === "GET" && resource === "capabilities") mode = "capabilities";
    else if (request.method === "GET" && path[0] === "operations" && path.length === 2) { mode = "operation"; payload = { id: uuid.parse(path[1]) }; }
    else if (request.method === "POST" && ["context", "query", "commands", "preview"].includes(resource)) {
      mode = resource;
      const body = await readLimitedJson(request);
      payload = (mode === "context" ? contextSchema : mode === "query" ? querySchema : commandsSchema).parse(body);
    } else if (request.method === "POST" && resource === "simulation") {
      // Authenticate and meter once; the canonical simulator is a pure function.
      payload = simulationSchema.parse(await readLimitedJson(request));
      mode = "simulation";
    } else throw new ApiError(404, "not_found", "Esta ruta o método no está disponible.");
    const { data, error } = await client.rpc(mode === "preview" ? "integration_preview_v1" : "integration_gateway_v1", {
      p_gateway_key: gateway, p_token: createHash("sha256").update(token).digest("hex"), ...(mode === "preview" ? {} : { p_mode: mode === "simulation" ? "capabilities" : mode }), p_payload: (mode === "simulation" ? {} : payload) as Json,
    });
    if (error) rpcError(error);
    const result = data as Record<string, unknown>;
    if (result?.error && typeof result.error === "object") {
      const limit = result.error as { status: number; code: string; message: string; retryAfter?: number };
      throw new ApiError(Number(limit.status), limit.code, limit.message, Number(limit.retryAfter ?? 60));
    }
    const responsePayload = { apiVersion: API_VERSION, requestId, limits: API_LIMITS, ...result,
      ...(mode === "simulation" ? { data: runIntegrationSimulation(payload) } : {}),
    };
    if (Buffer.byteLength(JSON.stringify(responsePayload)) > API_LIMITS.maxResponseBytes) throw new ApiError(413, "response_too_large", "El resultado supera 1 MiB. Reduce el rango o pagina el detalle.");
    return NextResponse.json(responsePayload, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return fail(new ApiError(422, "invalid_request", "Revisa los campos, tipos y límites del esquema de esta operación."), requestId, resource === "commands" ? false : undefined);
    return fail(error, requestId, resource === "commands" ? false : undefined);
  }
}

const managementSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(1).max(80), permission: z.enum(["read", "write", "full"]), expiresAt: z.iso.datetime({ offset: true }).nullable() }).strict(),
  z.object({ action: z.literal("revoke"), id: uuid }).strict(),
  z.object({ action: z.literal("revoke_all") }).strict(),
  z.object({ action: z.literal("rename"), id: uuid, name: z.string().trim().min(1).max(80) }).strict(),
]);

export async function handleConnectionManagement(request: Request) {
  const requestId = randomUUID();
  try {
    const client = await createSessionClient();
    if (!client) throw new ApiError(503, "configuration", "Necesitas conectarte a Moneva para gestionar conexiones.");
    const { data: identity, error: authError } = await client.auth.getUser();
    if (authError || !identity.user) throw new ApiError(401, "unauthorized", "Inicia sesión para gestionar tus conexiones.");
    let action = "list";
    let payload: Record<string, unknown> = {};
    let token: string | undefined;
    if (request.method === "POST") {
      if (request.headers.get("origin") !== new URL(request.url).origin) throw new ApiError(403, "origin", "Realiza esta acción desde Moneva.");
      const input = managementSchema.parse(await readLimitedJson(request));
      action = input.action;
      if (input.action === "create") {
        let expiresAt: string | null = null;
        if (input.expiresAt !== null) {
          const expires = Date.parse(input.expiresAt);
          const maximum = Date.now() + 90 * 86_400_000;
          // Tolerate small clock drift, without extending the database limit.
          if (expires <= Date.now() || expires > maximum + 30_000) throw new ApiError(422, "expiration", "Elige un vencimiento futuro de hasta noventa días o Sin vencimiento.");
          expiresAt = new Date(Math.min(expires, maximum - 2_000)).toISOString();
        }
        const prefix = `mnv_${randomBytes(6).toString("base64url")}`;
        token = `${prefix}.${randomBytes(32).toString("base64url")}`;
        payload = { name: input.name, permission: input.permission, expiresAt, prefix, hash: createHash("sha256").update(token).digest("hex") };
      } else payload = input;
    } else {
      const id = new URL(request.url).searchParams.get("activity");
      if (id) { action = "activity"; payload = { id: uuid.parse(id) }; }
    }
    const { data, error } = await client.rpc("manage_integration_connections", { p_action: action, p_data: payload as Json });
    if (error) rpcError(error);
    return NextResponse.json({ data, ...(token ? { token, apiUrl: `${canonicalApiOrigin()}/api/v1` } : {}) }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return fail(new ApiError(422, "invalid_request", "Revisa el nombre, permiso y vencimiento de la conexión."), requestId);
    return fail(error, requestId);
  }
}
