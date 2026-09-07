export function StatCard({ emoji, label, value }) {
  return (
    <div className="rounded-2xl bg-white/10 p-6 text-center shadow-lg backdrop-blur">
      <div className="text-4xl">{emoji}</div>
      <div className="mt-2 text-3xl font-extrabold">{value}</div>
      <div className="mt-1 text-sm font-semibold text-white/70">{label}</div>
    </div>
  );
}
