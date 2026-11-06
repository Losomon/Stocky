export type Period = 7 | 30;

export const Toggle = ({ days, set }: { days: Period; set: (d: Period) => void }) => (
  <div className="inline-flex rounded-xl border border-line bg-bg p-1" role="group" aria-label="Period">
    {([7, 30] as const).map((d) => <button key={d} aria-pressed={days === d} onClick={() => set(d)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${days === d ? "bg-soft text-pdark" : "text-muted"}`}>{d} days</button>)}
  </div>
);
