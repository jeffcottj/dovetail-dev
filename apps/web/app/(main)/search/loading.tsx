export default function SearchLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-9 w-48 bg-parchment-warm rounded mb-2" />
      <div className="h-4 w-32 bg-parchment-warm rounded mb-8" />
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-4 py-4">
            <div className="h-6 w-3/4 bg-parchment-warm rounded mb-2" />
            <div className="h-3 w-1/4 bg-parchment-warm rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
