import { combine as c } from "../lib";
import type { ResolvedStat } from "../store/stats/types";

export function StatBreakdown(p: { stat: ResolvedStat }) {
  return (
    <div className="flex justify-between flex-wrap gap-y-4">
      {p.stat.lines.map((line, i) => (
        <div
          key={i}
          className={c(
            "flex flex-col w-1/2",
            line.status !== "applied" && "opacity-50",
          )}
          title={line.reason ?? line.condition}
        >
          <span className="text-label text-sm">{line.label}</span>
          <span
            className={c(
              "tabular-nums",
              line.status === "suppressed" && "line-through",
            )}
          >
            {line.amount}
            {line.condition && (
              <span className="italic"> ({line.condition})</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
