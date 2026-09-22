export type ConfidenceTier = "high" | "moderate" | "unreliable";

export interface TierInfo {
  tier: ConfidenceTier;
  label: string;
  colorClass: string;
  bgClass: string;
  textClass: string;
}

export function confidenceToTier(confidence01: number): TierInfo {
  if (confidence01 >= 0.9) {
    return {
      tier: "high",
      label: "High",
      colorClass: "bg-green-500",
      bgClass: "bg-green-50",
      textClass: "text-green-700",
    };
  }
  if (confidence01 >= 0.5) {
    return {
      tier: "moderate",
      label: "Moderate",
      colorClass: "bg-yellow-400",
      bgClass: "bg-yellow-50",
      textClass: "text-yellow-700",
    };
  }
  return {
    tier: "unreliable",
    label: "Unreliable",
    colorClass: "bg-red-500",
    bgClass: "bg-red-50",
    textClass: "text-red-700",
  };
}

export function confidenceTooltip(confidence01: number): string {
  const { tier } = confidenceToTier(confidence01);
  if (tier === "high") return "High confidence — face well-lit and clearly detected.";
  if (tier === "moderate") return "Moderate confidence — scores may be less precise.";
  return "Low confidence — check lighting and face visibility.";
}
