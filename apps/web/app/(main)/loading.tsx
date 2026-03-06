export default function MainLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-parchment-warm rounded w-1/3" />
      <div className="h-4 bg-parchment-warm rounded w-2/3" />
      <div className="h-4 bg-parchment-warm rounded w-1/2" />
      <div className="space-y-3 mt-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-parchment-warm rounded" />
        ))}
      </div>
    </div>
  );
}
