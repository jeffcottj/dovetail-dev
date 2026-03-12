import { existsSync } from 'node:fs';
import { loadEnvFile, probePort, runCommand } from './common.mjs';

const env = loadEnvFile();
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function checkCommand(command, args = ['--version']) {
  try {
    runCommand(command, args);
  } catch (error) {
    fail(`${command} is unavailable`);
  }
}

checkCommand('node');
checkCommand('pnpm');
checkCommand('docker', ['compose', 'version']);

try {
  runCommand('docker', ['compose', 'ps']);
} catch {
  fail('docker compose is installed but the Docker daemon is not accessible');
}

if (!existsSync('.env')) {
  fail('.env is missing');
}

if (!existsSync('node_modules')) {
  fail('node_modules is missing; run pnpm install');
}

const requiredEnvKeys = [
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'API_URL',
  'NEXT_PUBLIC_API_URL',
];

for (const key of requiredEnvKeys) {
  if (!env[key]) fail(`${key} is missing from .env`);
}

if (env.DEV_AUTH_ENABLED !== 'true') {
  warn('DEV_AUTH_ENABLED is not true; local seeded login and just smoke will not work');
}

if ((env.EMBEDDING_PROVIDER ?? 'openai') === 'openai' && !env.OPENAI_API_KEY) {
  warn('OPENAI_API_KEY is missing; just smoke-ai will be skipped');
}

for (const port of [3000, 3001, 5432]) {
  const state = await probePort(port);
  if (state === 'in-use') {
    warn(`port ${port} is already in use`);
  }
}

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const message of warnings) {
    console.log(`- ${message}`);
  }
}

if (failures.length > 0) {
  console.error('Doctor checks failed:');
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log('Doctor checks passed.');
