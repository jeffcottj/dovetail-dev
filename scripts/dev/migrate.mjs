import { spawnSync } from 'node:child_process';
import { loadEnvFile, getComposePortBinding } from './common.mjs';

const env = loadEnvFile();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getExpectedHostPort() {
  return Number.parseInt(env.POSTGRES_PORT ?? '5432', 10);
}

function getDatabaseTarget() {
  const rawUrl = env.DATABASE_URL;
  if (!rawUrl) {
    fail('DATABASE_URL is missing from .env');
  }

  try {
    return new URL(rawUrl);
  } catch {
    fail('DATABASE_URL is not a valid URL');
  }
}

const target = getDatabaseTarget();
const host = target.hostname;
const targetPort = Number.parseInt(target.port || '5432', 10);
const expectedHostPort = getExpectedHostPort();

if (host === 'localhost' || host === '127.0.0.1') {
  const binding = getComposePortBinding('postgres', 5432);
  if (!binding) {
    fail([
      `DATABASE_URL points to ${host}:${targetPort}, but docker compose did not publish the postgres service to the host.`,
      'Your migrations would hit a different local database instance.',
      '',
      `Resolve the port conflict on localhost:${expectedHostPort}, then run:`,
      '- docker compose down',
      '- just setup',
    ].join('\n'));
  }

  if (binding.hostPort !== targetPort) {
    fail([
      `DATABASE_URL points to localhost:${targetPort}, but docker compose published postgres on localhost:${binding.hostPort}.`,
      'Update DATABASE_URL and POSTGRES_PORT in .env so they target the same host port.',
    ].join('\n'));
  }
}

const result = spawnSync('pnpm', ['--filter', '@dovetail/db', 'db:migrate'], {
  encoding: 'utf8',
  stdio: 'pipe',
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.status === 0) {
  process.exit(0);
}

const combinedOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
if (combinedOutput.includes('password authentication failed') || combinedOutput.includes("code: '28P01'")) {
  fail([
    'Database authentication failed.',
    'If you changed POSTGRES_USER or POSTGRES_PASSWORD after the Docker volume was created, the existing database still has the old credentials.',
    '',
    'Run `just db-reset` to recreate the Postgres volume with the credentials from .env.',
  ].join('\n'));
}

process.exit(result.status ?? 1);
