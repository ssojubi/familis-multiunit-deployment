/** Fixed per-attribute identity colors — used in progress bars and chart legends. */
export const ATTRIBUTE_COLORS: Record<string, string> = {
  Color:          "#f97316", // orange
  "Flavor/Aroma": "#a855f7", // purple
  "Salt/Sweet":   "#3b82f6", // blue
  Texture:        "#eab308", // yellow
};

/** Rotating palette for demographic bars (age groups, gender) — distinct but not attribute-specific. */
export const DEMO_COLORS = ["#6366f1", "#06b6d4", "#f59e0b", "#10b981", "#ec4899"];

export function getDemoColor(index: number): string {
  return DEMO_COLORS[index % DEMO_COLORS.length];
}
