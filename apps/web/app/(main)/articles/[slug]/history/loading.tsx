export default function HistoryLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-3 bg-parchment-warm rounded w-32 mb-3" />
      <div className="h-9 bg-parchment-warm rounded w-48 mb-2" />
      <div className="h-4 bg-parchment-warm rounded w-24 mb-8" />
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-4 py-3 -mx-4">
            <div className="h-5 bg-parchment-warm rounded w-40 mb-1" />
            <div className="h-3 bg-parchment-warm rounded w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
