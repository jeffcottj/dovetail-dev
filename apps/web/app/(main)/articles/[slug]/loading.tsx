export default function ArticleLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-8 border-b border-border-light pb-6">
        <div className="h-9 bg-parchment-warm rounded w-2/3 mb-3" />
        <div className="h-3 bg-parchment-warm rounded w-48" />
      </div>
      <div className="space-y-3 max-w-prose">
        <div className="h-4 bg-parchment-warm rounded w-full" />
        <div className="h-4 bg-parchment-warm rounded w-5/6" />
        <div className="h-4 bg-parchment-warm rounded w-4/6" />
        <div className="h-4 bg-parchment-warm rounded w-full" />
        <div className="h-4 bg-parchment-warm rounded w-3/4" />
      </div>
    </div>
  );
}
