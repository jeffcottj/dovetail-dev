import { signIn } from '../../auth';
import { DEV_USERS, isDevAuthEnabled } from '../../lib/dev-auth';

// Must be dynamic so OAUTH_PROVIDER is read at runtime, not build time
export const dynamic = 'force-dynamic';

const providerId =
  (process.env.OAUTH_PROVIDER ?? 'google') === 'entra'
    ? 'microsoft-entra-id'
    : 'google';

const providerLabel =
  providerId === 'microsoft-entra-id' ? 'Microsoft' : 'Google';

const hasOAuthProvider =
  providerId === 'microsoft-entra-id'
    ? Boolean(
        process.env.ENTRA_CLIENT_ID &&
        process.env.ENTRA_CLIENT_SECRET &&
        process.env.ENTRA_TENANT_ID,
      )
    : Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

function MicrosoftLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

export default function LoginPage() {
  const devAuthEnabled = isDevAuthEnabled();

  return (
    <main className="min-h-screen flex items-center justify-center bg-parchment px-4">
      <div className="w-full max-w-sm">
        <div className="bg-parchment-warm border border-border-light rounded-lg shadow-sm p-8">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ink text-center tracking-tight">
            Dovetail
          </h1>
          <p className="text-ink-muted text-sm text-center mt-1 font-[family-name:var(--font-ui)]">
            Legal Knowledge Base
          </p>

          <hr className="border-border-light my-6" />

          {devAuthEnabled ? (
            <div className="space-y-3">
              {Object.entries(DEV_USERS).map(([key, user]) => (
                <form key={key} action="/api/dev/login" method="POST">
                  <input type="hidden" name="user" value={key} />
                  <button
                    type="submit"
                    className="w-full flex items-center justify-between gap-3 bg-accent hover:bg-accent-hover text-white font-[family-name:var(--font-ui)] font-medium py-2.5 px-4 rounded-md transition-colors cursor-pointer"
                  >
                    <span>Sign in as {user.name}</span>
                    <span className="text-xs uppercase tracking-wide text-white/80">{user.role}</span>
                  </button>
                </form>
              ))}
              <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)]">
                Dev auth is enabled. These accounts are seeded locally and bypass external OAuth.
              </p>
            </div>
          ) : hasOAuthProvider ? (
            <form
              action={async () => {
                'use server';
                await signIn(providerId, { redirectTo: '/' });
              }}
            >
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 bg-accent hover:bg-accent-hover text-white font-[family-name:var(--font-ui)] font-medium py-2.5 px-4 rounded-md transition-colors cursor-pointer"
              >
                {providerId === 'microsoft-entra-id' ? <MicrosoftLogo /> : <GoogleLogo />}
                Sign in with {providerLabel}
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink-muted font-[family-name:var(--font-ui)] text-center">
              No OAuth provider is configured for this environment.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
