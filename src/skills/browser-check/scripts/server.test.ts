import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, 'server.ts');
let directory: string;

const run = (...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { cwd: directory, encoding: 'utf8' });

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const server = http.createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'server-test-'));
});

afterEach(() => {
  run('stop');
  rmSync(directory, { recursive: true, force: true });
});

describe('server script', () => {
  test('rejects a missing subcommand and missing flags with exit 2', () => {
    expect(run().status).toBe(2);
    expect(run('start', '--cmd', 'node').status).toBe(2);
    expect(run('start', '--cmd', 'node', '--url', 'ftp://x').status).toBe(2);
    expect(run('bogus').status).toBe(2);
  });

  test('stop with nothing recorded exits 0', () => {
    const result = run('stop');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ result: 'none' });
  });

  test('reports found and records no pid when something answers', async () => {
    const server = http.createServer((_, response) => response.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    const url = `http://127.0.0.1:${port}/`;
    const result = await new Promise<ReturnType<typeof run>>((resolve) => {
      import('node:child_process').then(({ execFile }) =>
        execFile(
          process.execPath,
          [script, 'start', '--cmd', 'node -e 0', '--url', url],
          { cwd: directory },
          (error, stdout, stderr) =>
            resolve({ status: error ? 1 : 0, stdout, stderr } as ReturnType<typeof run>),
        ),
      );
    });
    server.close();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ result: 'found', url });
    expect(existsSync(join(directory, '.browser-check', 'server.pid'))).toBe(false);
  });

  test('starts a server, records the group, and stop kills it', async () => {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;
    const fixture = join(directory, 'fixture.js');
    writeFileSync(
      fixture,
      `require('http').createServer((q, r) => r.end('ok')).listen(${port}, '127.0.0.1');`,
    );
    const started = run('start', '--cmd', `node "${fixture}"`, '--url', url, '--timeout', '15');
    expect(started.status).toBe(0);
    expect(JSON.parse(started.stdout)).toEqual({ result: 'started', url });
    const pidFile = join(directory, '.browser-check', 'server.pid');
    expect(Number(readFileSync(pidFile, 'utf8'))).toBeGreaterThan(1);

    const stopped = run('stop');
    expect(stopped.status).toBe(0);
    expect(JSON.parse(stopped.stdout)).toEqual({ result: 'stopped' });
    expect(existsSync(pidFile)).toBe(false);
    const again = run('start', '--cmd', 'node -e 0', '--url', url, '--timeout', '1');
    expect(again.status).not.toBe(0);
  });

  test('exits 3 with a timeout result when the server never answers', async () => {
    const port = await freePort();
    const result = run(
      'start',
      '--cmd',
      'node -e "setTimeout(() => {}, 30000)"',
      '--url',
      `http://127.0.0.1:${port}/`,
      '--timeout',
      '1',
    );
    expect(result.status).toBe(3);
    expect(JSON.parse(result.stdout).result).toBe('timeout');
  });

  test('exits 1 when the command does not exist', async () => {
    const port = await freePort();
    const result = run('start', '--cmd', 'no-such-binary-xyz', '--url', `http://127.0.0.1:${port}/`, '--timeout', '5');
    expect(result.status).toBe(1);
  });
});
