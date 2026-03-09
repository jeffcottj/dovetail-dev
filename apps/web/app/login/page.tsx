import { signIn } from '../../auth';

function getProviderId(): 'google' | 'microsoft-entra-id' {
  return process.env.OAUTH_PROVIDER === 'entra' ? 'microsoft-entra-id' : 'google';
}

export default function LoginPage() {
  return (
    <main>
      <h1>Sign in to Dovetail</h1>
      <form
        action={async () => {
          'use server';
          await signIn(getProviderId());
        }}
      >
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
