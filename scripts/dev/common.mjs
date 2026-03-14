import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';

export function loadEnvFile(path = '.env') {
  const env = { ...process.env };
  if (!existsSync(path)) return env;

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    if (!(key in env)) env[key] = value;
  }

  return env;
}

export function runCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

export function getComposePortBinding(service, containerPort) {
  try {
    const output = runCommand('docker', ['compose', 'port', service, String(containerPort)]);
    const trimmed = output.trim();
    if (!trimmed) return null;

    const match = trimmed.match(/^(?<host>.+):(?<port>\d+)$/);
    if (!match?.groups) return null;

    return {
      host: match.groups.host,
      hostPort: Number.parseInt(match.groups.port, 10),
    };
  } catch {
    return null;
  }
}

export async function probePort(port) {
  await new Promise((resolve) => setImmediate(resolve));
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve('in-use'));
    server.once('listening', () => {
      server.close(() => resolve('available'));
    });
    server.listen(port, '127.0.0.1');
  });
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function logStep(message) {
  console.log(`- ${message}`);
}
