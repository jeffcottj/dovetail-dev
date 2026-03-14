import { loadEnvFile, probePort, runCommand, getComposePortBinding } from './common.mjs';

const env = loadEnvFile();
const configuredPort = Number.parseInt(env.POSTGRES_PORT ?? '5432', 10);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function renderPortConflictMessage(port) {
  return [
    `Postgres could not be published on host port ${port}.`,
    `A different process is already using localhost:${port}, so Docker cannot bind the compose postgres service there.`,
    '',
    'Fix one of these first:',
    `- stop the process currently using port ${port}`,
    `- or set POSTGRES_PORT and DATABASE_URL to the same free port in .env`,
  ].join('\n');
}

const bindingBeforeUp = getComposePortBinding('postgres', 5432);
const portState = await probePort(configuredPort);

if (portState === 'in-use' && !bindingBeforeUp) {
  fail(renderPortConflictMessage(configuredPort));
}

try {
  runCommand('docker', ['compose', 'up', '-d', 'postgres', '--wait']);
} catch (error) {
  const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
  if (output.includes('failed to bind host port') || output.includes('address already in use')) {
    fail(renderPortConflictMessage(configuredPort));
  }

  process.stderr.write(output.trim() ? `${output.trim()}\n` : '');
  process.exit(error.status ?? 1);
}

const bindingAfterUp = getComposePortBinding('postgres', 5432);
if (!bindingAfterUp) {
  fail([
    'Docker reports postgres as running, but it is not published on a host port.',
    'This happens when an earlier port bind failure leaves the container healthy but unreachable from localhost.',
    '',
    `Resolve the host port conflict on localhost:${configuredPort}, then run:`,
    '- docker compose down',
    '- just setup',
  ].join('\n'));
}
