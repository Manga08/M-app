import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { apiRequest, installCredential, readCredential, validateCredential, parsePayload } from '../public/integrations/moneva-client.mjs';
import { parseIntegrationJson } from '@/lib/integrations/json';

const credential = { version: 1, apiUrl: 'https://moneva-three.vercel.app/api/v1', token: `mnv_clitest0.${'A'.repeat(43)}`, expiresAt: new Date(Date.now() + 3600000).toISOString() };
const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) {
    const target = resolve(path);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('moneva-credential-test-')) throw new Error('Refusing cleanup outside the dedicated test directory');
    await rm(target, { recursive: true, force: true });
  }
});

describe('portable credential client', () => {
  it('preserves exact decimal input before any JavaScript rounding in both transports', () => {
    const source = '{"amount":90000000000000.01,"rate":0.0187,"count":2}';
    for (const parse of [parsePayload, parseIntegrationJson]) expect(parse(source)).toEqual({ amount: '90000000000000.01', rate: '0.0187', count: 2 });
  });
  it('accepts official HTTPS and rejects insecure, embedded-password, query and redirect-style credentials', () => {
    expect(validateCredential(credential).apiUrl).toBe(credential.apiUrl);
    for (const apiUrl of ['http://example.com/api/v1', 'https://user:password@example.com/api/v1', 'https://example.com/api/v1?token=secret', 'https://example.com/other']) expect(() => validateCredential({ ...credential, apiUrl })).toThrow();
    expect(() => validateCredential({ ...credential, expiresAt: '2000-01-01T00:00:00Z' })).toThrow('caducó');
    expect(() => validateCredential({ ...credential, token: 'wrong' })).toThrow('válida');
  });
  it('installs a protected credential without overwriting an existing one', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'moneva-credential-test-')); directories.push(directory);
    const source = join(directory, 'download.json');
    const destination = join(directory, 'private', 'credential.json');
    await writeFile(source, JSON.stringify(credential));
    await installCredential(source, destination);
    expect((await readCredential(destination)).token).toBe(credential.token);
    expect(await readFile(source, 'utf8')).toContain(credential.token);
    if (process.platform !== 'win32') expect((await stat(destination)).mode & 0o777).toBe(0o600);
    await expect(installCredential(source, destination)).rejects.toThrow();
  });
  it('never prints a token echoed by a server', async () => {
    const result = await apiRequest(credential, 'capabilities', undefined, async (_url, options) => {
      expect(options?.redirect).toBe('error');
      expect(options?.headers).toHaveProperty('Authorization', `Bearer ${credential.token}`);
      return new Response(JSON.stringify({ data: credential.token }), { headers: { 'content-type': 'application/json' } });
    });
    expect(JSON.stringify(result)).not.toContain(credential.token);
  });
  it('performs real HTTP with one batch request and never follows an authenticated redirect', async () => {
    let calls = 0;
    const server = createServer((request, response) => {
      calls++;
      if (request.url?.endsWith('capabilities')) { response.writeHead(302, { Location: '/leak' }); response.end(); return; }
      expect(request.headers.authorization).toBe(`Bearer ${credential.token}`);
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ committed: true, results: [1, 2] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const local = validateCredential({ ...credential, apiUrl: `http://127.0.0.1:${address.port}/api/v1` });
    try {
      const result = await apiRequest(local, 'commands', { commands: [1, 2] });
      expect(result.committed).toBe(true); expect(calls).toBe(1);
      await expect(apiRequest(local, 'capabilities')).rejects.toThrow();
      expect(calls).toBe(2);
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  });
});
