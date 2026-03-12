import { loadEnvFile, assert, logStep } from './common.mjs';

const env = loadEnvFile();
const webUrl = env.NEXTAUTH_URL ?? 'http://localhost:3000';
const apiUrl = env.NEXT_PUBLIC_API_URL ?? env.API_URL ?? 'http://localhost:3001';
const smokeAi = process.env.SMOKE_AI === '1';
const devRagApiKey = 'dovetail-dev-rag-key';

function getSetCookieHeader(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie()[0] ?? null;
  }
  return response.headers.get('set-cookie');
}

async function expectOk(response, context) {
  const text = await response.text();
  assert(response.ok, `${context} failed: ${response.status} ${text}`);
  return text;
}

async function fetchJson(url, init, context) {
  const response = await fetch(url, init);
  const text = await expectOk(response, context);
  return JSON.parse(text);
}

async function run() {
  assert(env.DEV_AUTH_ENABLED === 'true', 'DEV_AUTH_ENABLED must be true for smoke testing');

  logStep(`Checking API health at ${apiUrl}/health`);
  const health = await fetchJson(`${apiUrl}/health`, undefined, 'API health');
  assert(health.status === 'ok', 'API health did not return status ok');

  logStep(`Checking login page at ${webUrl}/login`);
  const loginPage = await fetch(`${webUrl}/login`);
  const loginHtml = await expectOk(loginPage, 'Login page');
  assert(loginHtml.includes('Local Admin'), 'Login page does not expose seeded dev auth');

  logStep('Creating seeded admin session');
  const loginResponse = await fetch(`${webUrl}/api/dev/login`, {
    method: 'POST',
    body: new URLSearchParams({ user: 'admin' }),
    redirect: 'manual',
  });
  assert(loginResponse.status === 303, `Dev login returned ${loginResponse.status}`);
  const setCookie = getSetCookieHeader(loginResponse);
  assert(setCookie, 'Dev login did not issue a session cookie');
  const cookie = setCookie.split(';', 1)[0];

  logStep('Checking authenticated home page');
  const homeResponse = await fetch(`${webUrl}/`, {
    headers: { Cookie: cookie },
  });
  const homeHtml = await expectOk(homeResponse, 'Home page');
  assert(homeHtml.includes('Welcome to Dovetail'), 'Home page did not render the signed-in dashboard');
  assert(homeHtml.includes('Notice Requirements for Evictions'), 'Home page is missing seeded published content');

  const authHeaders = { Cookie: cookie };

  logStep('Checking authenticated API identity');
  const me = await fetchJson(`${apiUrl}/api/me`, { headers: authHeaders }, 'API /api/me');
  assert(me.id === '00000000-0000-4000-8000-000000000001', 'Unexpected seeded admin user');
  assert(me.role === 'admin', 'Seeded admin session did not carry admin role');

  logStep('Checking categories endpoint');
  const categories = await fetchJson(`${apiUrl}/api/categories`, { headers: authHeaders }, 'API /api/categories');
  assert(Array.isArray(categories) && categories.length >= 2, 'Seeded categories were not returned');

  logStep('Checking published articles endpoint');
  const articles = await fetchJson(
    `${apiUrl}/api/articles?status=published&limit=10`,
    { headers: authHeaders },
    'API /api/articles',
  );
  assert(articles.total >= 1, 'Seeded published article was not returned');

  logStep('Checking full-text search');
  const search = await fetchJson(
    `${apiUrl}/api/search?q=notice&mode=fulltext`,
    { headers: authHeaders },
    'API /api/search',
  );
  assert(search.total >= 1, 'Full-text search did not return the seeded article');

  logStep('Checking admin dashboard');
  const adminResponse = await fetch(`${webUrl}/admin`, { headers: authHeaders });
  const adminHtml = await expectOk(adminResponse, 'Admin dashboard');
  assert(adminHtml.includes('Admin Dashboard'), 'Admin dashboard did not load for seeded admin');

  if (smokeAi) {
    logStep('Checking semantic search');
    const semantic = await fetchJson(
      `${apiUrl}/api/search?q=notice&mode=semantic`,
      { headers: authHeaders },
      'API semantic search',
    );
    assert(semantic.total >= 1, 'Semantic search did not return any seeded results');

    logStep('Checking RAG search');
    const rag = await fetchJson(
      `${apiUrl}/api/v1/rag/search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${devRagApiKey}`,
        },
        body: JSON.stringify({ query: 'What notice is required before eviction?', limit: 3 }),
      },
      'API RAG search',
    );
    assert(Array.isArray(rag.results) && rag.results.length >= 1, 'RAG search did not return seeded chunks');
  }

  console.log(smokeAi ? 'Smoke AI checks passed.' : 'Smoke checks passed.');
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
