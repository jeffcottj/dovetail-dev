import { signIn } from '../../auth';

export default function LoginPage() {
  return (
    <main>
      <h1>Sign in to Dovetail</h1>
      <form
        action={async () => {
          'use server';
          await signIn(process.env.OAUTH_PROVIDER ?? 'google');
        }}
      >
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
