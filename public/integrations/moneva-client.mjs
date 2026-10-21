#!/usr/bin/env node
/** Moneva HTTP client. No dependencies, no token arguments, no secret logging. */
import { readFile, writeFile, mkdir, chmod, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MAX_BYTES = 262144;
export const defaultCredentialPath = () => process.platform === 'win32'
  ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Moneva', 'credential.private.json')
  : join(homedir(), '.config', 'moneva', 'credential.private.json');

export function parsePayload(text) {
  return JSON.parse(text, (_key, value, context) => {
    if (typeof value !== 'number' || (Number.isSafeInteger(value) && Math.abs(value) < 1e12)) return value;
    if (!context?.source) throw new Error('Envía importes y tasas como cadenas decimales.');
    return context.source;
  });
}

export function validateCredential(value) {
  if (!value || value.version !== 1 || !/^mnv_[A-Za-z0-9_-]{8,16}\.[A-Za-z0-9_-]{43}$/.test(value.token ?? '')) throw new Error('La credencial no es válida. Descárgala de nuevo desde Conexiones.');
  const url = new URL(value.apiUrl);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash || url.pathname !== '/api/v1') throw new Error('El origen de la API no es válido. Usa HTTPS y /api/v1.');
  if (!Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) throw new Error('La credencial caducó. Crea otra conexión.');
  return { ...value, apiUrl: url.toString().replace(/\/$/, '') };
}

async function boundedFile(path) {
  if ((await stat(path)).size > MAX_BYTES) throw new Error('El archivo supera 256 KiB.');
  return readFile(path, 'utf8');
}

export async function readCredential(path) {
  if (process.platform !== 'win32' && ((await stat(path)).mode & 0o077)) throw new Error('La credencial permite acceso a otros usuarios. Restringe sus permisos a 600.');
  return validateCredential(JSON.parse(await boundedFile(path)));
}

async function protect(path, directory = false) {
  if (process.platform !== 'win32') return chmod(path, directory ? 0o700 : 0o600);
  // Argument array, never a shell command. SID avoids localization/user-name issues.
  const identity = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  const sid = identity.stdout?.match(/S-1-5-[\d-]+/)?.[0];
  if (identity.status !== 0 || !sid) throw new Error('No pudimos identificar al propietario para proteger la credencial.');
  const result = spawnSync('icacls.exe', [path, '/inheritance:r', '/grant:r', `*${sid}:${directory ? '(OI)(CI)F' : 'F'}`], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('No pudimos restringir los permisos. No uses esta credencial hasta protegerla.');
}

export async function installCredential(source, destination = defaultCredentialPath()) {
  const credential = validateCredential(JSON.parse(await boundedFile(source)));
  if (resolve(source) === resolve(destination)) throw new Error('Elige el archivo descargado, no el archivo ya instalado.');
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  await protect(dirname(destination), true);
  // wx never overwrites an existing credential without a deliberate user action.
  await writeFile(destination, `${JSON.stringify(credential, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await protect(destination);
  return destination;
}

export async function apiRequest(credential, resource, payload, fetcher = fetch) {
  if (!['context', 'capabilities', 'query', 'commands', 'preview', 'simulation'].includes(resource) && !/^operations\/[\da-f-]{36}$/i.test(resource)) throw new Error('Operación de cliente no disponible.');
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  if (body && Buffer.byteLength(body) > MAX_BYTES) throw new Error('La solicitud supera 256 KiB. Divídela en lotes.');
  const response = await fetcher(`${credential.apiUrl}/${resource}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${credential.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body, redirect: 'error', signal: AbortSignal.timeout(20000), cache: 'no-store',
  });
  // Bound the received stream as well, even when the server omits Content-Length.
  const reader = response.body?.getReader();
  const chunks = []; let bytes = 0;
  if (!reader) throw new Error('La API no devolvió una respuesta. Consulta el recibo si estabas guardando.');
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 2 * 1048576) { await reader.cancel(); throw new Error('Respuesta demasiado grande. Reduce el rango.'); }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString('utf8').replaceAll(credential.token, '[TOKEN OMITIDO]');
  let result;
  try { result = JSON.parse(text); } catch { throw new Error('Respuesta no válida de la API. No reintentes escrituras con otro operationId.'); }
  return { status: response.status, retryAfter: response.headers.get('retry-after'), ...result };
}

async function readStdin() {
  const chunks = []; let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) throw new Error('La solicitud supera 256 KiB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function main(args = process.argv.slice(2)) {
  let path = defaultCredentialPath();
  if (args[0] === '--credentials') { path = args[1]; args = args.slice(2); if (!path) throw new Error('Indica una ruta de credencial privada.'); }
  const [action, input] = args;
  if (!action || action === 'help' || action === '--help') {
    process.stdout.write('Moneva: install RUTA_DESCARGA | [--credentials RUTA_PRIVADA] context | capabilities | query ARCHIVO_JSON | commands ARCHIVO_JSON | preview ARCHIVO_JSON | operation UUID\nUsa - para leer JSON de stdin. Nunca pases el token como argumento. Node.js 22+.\n');
    return;
  }
  if (action === 'install') {
    if (!input) throw new Error('Indica el archivo de credencial descargado.');
    const destination = await installCredential(input);
    process.stdout.write(`Credencial instalada con permisos restringidos en ${destination}. Elimina manualmente la copia de Descargas. No compartas ninguno de esos archivos.\n`);
    return;
  }
  const credential = await readCredential(path);
  let payload;
  const resource = action === 'operation' ? `operations/${input}` : action;
  if (['query', 'commands', 'preview', 'simulation'].includes(action) && !input) throw new Error('Indica un archivo JSON o - para stdin.');
  if (action !== 'operation' && input) payload = parsePayload(input === '-' ? await readStdin() : await boundedFile(input));
  if (action === 'context') payload ??= {};
  const result = await apiRequest(credential, resource, payload);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status >= 400) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // Never echo arbitrary fetch/JSON errors: they can contain credential input.
    process.stderr.write('No se completó la solicitud. Comprueba credencial, permisos, conexión y JSON. Si estabas guardando, consulta el recibo o reintenta el mismo operationId y cuerpo; no generes otro.\n');
    process.exitCode = 1;
  });
}
