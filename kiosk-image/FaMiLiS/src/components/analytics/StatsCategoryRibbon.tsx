import { TabButton } from "./TabButton";

export type StatsCategory = "overall" | "frames" | "survey" | "demographics";

const CATEGORIES: { key: StatsCategory; label: string }[] = [
  { key: "overall", label: "Overall Analytics" },
  { key: "frames", label: "FER Results" },
  { key: "survey", label: "Survey Results" },
  { key: "demographics", label: "Demographics" },
];

export function StatsCategoryRibbon({
  active,
  onChange,
}: {
  active: StatsCategory;
  onChange: (key: StatsCategory) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex flex-wrap sm:flex-nowrap">
        {CATEGORIES.map(({ key, label }) => (
          <TabButton key={key} active={active === key} onClick={() => onChange(key)}>
            {label}
          </TabButton>
        ))}
      </div>
    </div>
  );
}
