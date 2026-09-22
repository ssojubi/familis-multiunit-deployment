import { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type ChartDataset,
  type TooltipItem,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { ATTRIBUTE_COLORS } from "../../lib/attributeColors";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export type SessionTrendPoint = {
  sessionId: number;
  sessionDate: string | null;
  overallRating: number | null;
  color: number | null;
  flavorAroma: number | null;
  saltSweet: number | null;
  texture: number | null;
  meanFerHedonic: number | null;
};

type AspectKey = "color" | "flavorAroma" | "saltSweet" | "texture";

const ASPECT_OPTIONS: { key: AspectKey; label: string }[] = [
  { key: "color", label: "Color" },
  { key: "flavorAroma", label: "Flavor/Aroma" },
  { key: "saltSweet", label: "Salt/Sweet" },
  { key: "texture", label: "Texture" },
];

const OVERALL_COLOR = "#e8174a";

function formatSessionDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Session-over-time trend chart — distinct from the in-session FER phase chart.
 * X axis is the sequence of completed sessions (with date); Y is the 1-9 survey scale.
 * Defaults to Overall rating, with an optional secondary aspect series and FER comparison.
 */
export function SessionTrendChart({ sessionTrends }: { sessionTrends: SessionTrendPoint[] }) {
  const [secondaryAspect, setSecondaryAspect] = useState<AspectKey | null>(null);
  const [showFer, setShowFer] = useState(false);

  const chartData = useMemo(() => {
    const labels = sessionTrends.map((t) => {
      const date = formatSessionDate(t.sessionDate);
      return date ? `S-${t.sessionId} (${date})` : `S-${t.sessionId}`;
    });

    const datasets: ChartDataset<"line", (number | null)[]>[] = [
      {
        label: "Overall",
        data: sessionTrends.map((t) => t.overallRating),
        borderColor: OVERALL_COLOR,
        backgroundColor: OVERALL_COLOR,
        pointBackgroundColor: OVERALL_COLOR,
        borderWidth: 2.5,
        spanGaps: true,
        tension: 0.25,
        pointRadius: 3,
        pointHoverRadius: 5,
      },
    ];

    if (secondaryAspect) {
      const aspectColor = ATTRIBUTE_COLORS[ASPECT_OPTIONS.find((a) => a.key === secondaryAspect)!.label] ?? "#6366f1";
      datasets.push({
        label: ASPECT_OPTIONS.find((a) => a.key === secondaryAspect)!.label,
        data: sessionTrends.map((t) => t[secondaryAspect]),
        borderColor: aspectColor,
        backgroundColor: aspectColor,
        pointBackgroundColor: aspectColor,
        borderWidth: 2,
        borderDash: [4, 3],
        spanGaps: true,
        tension: 0.25,
        pointRadius: 3,
        pointHoverRadius: 5,
      });
    }

    if (showFer) {
      datasets.push({
        label: "FER hedonic (frame-based)",
        data: sessionTrends.map((t) => t.meanFerHedonic),
        borderColor: "#9ca3af",
        backgroundColor: "#9ca3af",
        pointBackgroundColor: "#9ca3af",
        borderWidth: 2,
        borderDash: [2, 2],
        spanGaps: true,
        tension: 0.25,
        pointRadius: 2,
        pointHoverRadius: 4,
      });
    }

    return { labels, datasets };
  }, [sessionTrends, secondaryAspect, showFer]);

  const chartOptions = useMemo(
    () =>
      ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "top" as const, labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx: TooltipItem<"line">) =>
                `${ctx.dataset.label}: ${ctx.raw == null ? "-" : Number(ctx.raw).toFixed(1)} / 9`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#6b7280", font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
            border: { color: "rgba(156, 163, 175, 0.35)" },
          },
          y: {
            min: 1,
            max: 9,
            ticks: { stepSize: 1, color: "#9ca3af", font: { size: 11 } },
            grid: { color: "rgba(156, 163, 175, 0.25)" },
            border: { color: "rgba(156, 163, 175, 0.35)" },
          },
        },
      }) as const,
    []
  );

  if (sessionTrends.length < 2) {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-100 p-4 text-xs text-gray-500 text-center py-10">
        Need at least 2 completed sessions with surveys to show a trend.
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-xs text-gray-600 font-semibold">Survey hedonic ratings over sessions</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {ASPECT_OPTIONS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setSecondaryAspect((prev) => (prev === a.key ? null : a.key))}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                secondaryAspect === a.key
                  ? "bg-[#e8174a] text-white border-[#e8174a]"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              +{a.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowFer((prev) => !prev)}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
              showFer
                ? "bg-gray-700 text-white border-gray-700"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            +FER
          </button>
        </div>
      </div>
      <div className="min-h-[200px] h-[260px]">
        <Line data={chartData as any} options={chartOptions as any} />
      </div>
    </div>
  );
}
