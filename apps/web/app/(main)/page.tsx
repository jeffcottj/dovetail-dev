import { auth } from '../../auth';

export default async function HomePage() {
  const session = await auth();

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-2 tracking-tight">
        Welcome to Dovetail
      </h1>
      {session?.user?.name && (
        <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mb-8">
          Signed in as {session.user.name}
        </p>
      )}
      <p className="text-ink-light leading-relaxed max-w-prose">
        Select a category from the sidebar to browse articles, or use the search to find what you need.
      </p>
    </div>
  );
}
