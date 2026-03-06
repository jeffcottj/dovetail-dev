'use client';

export default function ArticleError({ reset }: { reset: () => void }) {
  return (
    <div className="text-center py-12">
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ink mb-2">
        Article not found
      </h2>
      <p className="text-ink-muted font-[family-name:var(--font-ui)] mb-6">
        This article may have been moved or deleted.
      </p>
      <button
        onClick={reset}
        className="font-[family-name:var(--font-ui)] text-sm px-4 py-2 bg-accent text-parchment rounded hover:bg-accent-hover transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
