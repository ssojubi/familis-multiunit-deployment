export const RATING_LABELS: Record<number, string> = {
  9: "Like Extremely",
  8: "Like Very Much",
  7: "Like Moderately",
  6: "Like Slightly",
  5: "Neither Like nor Dislike",
  4: "Dislike Slightly",
  3: "Dislike Moderately",
  2: "Dislike Very Much",
  1: "Dislike Extremely",
};

export function getGuideEmoji(score: number): string {
  switch (score) {
    case 9: return "😍";
    case 8: return "😊";
    case 7: return "🙂";
    case 6: return "😄";
    case 5: return "😐";
    case 4: return "😕";
    case 3: return "🙁";
    case 2: return "😖";
    case 1: return "😣";
    default: return "";
  }
}

/** Convert a 1–9 hedonic score to its nearest label string. */
export function hedonicLabel(score: number): string {
  const rounded = Math.round(Math.max(1, Math.min(9, score)));
  return RATING_LABELS[rounded] ?? "";
}

/**
 * Map a 1–9 hedonic score to a CSS color string.
 * Interpolates hue from 0° (red) at score 1 through 38° (amber) at ~5
 * up to 120° (green) at score 9, matching the traffic-light convention.
 */
export function hedonicColor(score: number): string {
  const clamped = Math.max(1, Math.min(9, score));
  const t = (clamped - 1) / 8; // 0 → 1
  const hue = Math.round(t * 120); // 0° red → 120° green
  const saturation = 82;
  const lightness = Math.round(44 + t * 4); // slight brightness lift toward green
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Map a 1–9 hedonic score to the same 3-tier Tailwind text classes
 * used for FER confidence (green / yellow / red).
 */
export function hedonicToTierClasses(score: number): string {
  if (score >= 7) return "text-green-700";
  if (score >= 5) return "text-yellow-700";
  return "text-red-700";
}

/** Sensory aspect means used for weakest-attribute callouts (excludes overall). */
export type SensoryAspectMeans = {
  color?: { mean: number; n: number };
  flavorAroma?: { mean: number; n: number };
  saltSweet?: { mean: number; n: number };
  texture?: { mean: number; n: number };
};

export type HedonicInterpretationInput = {
  /** Survey overall mean on the 1–9 hedonic scale. */
  surveyOverall: number | null;
  /** Optional FER mean on the 1–9 hedonic scale. */
  ferMean?: number | null;
  /** Optional mean FER confidence in 0–1. */
  confidence?: number | null;
  /** Optional aspect stats for a weakest-attribute tip when survey ≤ 4. */
  aspectStats?: SensoryAspectMeans | null;
};

const ASPECT_LABELS: { key: keyof SensoryAspectMeans; label: string }[] = [
  { key: "color", label: "Color" },
  { key: "flavorAroma", label: "Flavor/Aroma" },
  { key: "saltSweet", label: "Salt/Sweet" },
  { key: "texture", label: "Texture" },
];

function formatHedonicPhrase(score: number): string {
  const label = hedonicLabel(score);
  return label ? `${label.toLowerCase()} (${score.toFixed(1)}/9)` : `${score.toFixed(1)}/9`;
}

function weakestSensoryAttribute(
  aspectStats: SensoryAspectMeans
): { label: string; mean: number } | null {
  let weakest: { label: string; mean: number } | null = null;
  for (const { key, label } of ASPECT_LABELS) {
    const aspect = aspectStats[key];
    if (!aspect || aspect.n <= 0) continue;
    if (!weakest || aspect.mean < weakest.mean) {
      weakest = { label, mean: aspect.mean };
    }
  }
  return weakest;
}

function strongestSensoryAttribute(
  aspectStats: SensoryAspectMeans
): { label: string; mean: number } | null {
  let strongest: { label: string; mean: number } | null = null;
  for (const { key, label } of ASPECT_LABELS) {
    const aspect = aspectStats[key];
    if (!aspect || aspect.n <= 0) continue;
    if (!strongest || aspect.mean > strongest.mean) {
      strongest = { label, mean: aspect.mean };
    }
  }
  return strongest;
}

/**
 * Build a short CAP-tone narrative for survey + optional FER hedonic scores.
 * Returns empty-state copy when survey overall is unavailable.
 */
export function buildHedonicInterpretation(input: HedonicInterpretationInput): string {
  const survey = input.surveyOverall;
  if (survey == null || !Number.isFinite(survey)) {
    return "Not enough survey data yet to interpret hedonic scores for this product.";
  }

  const parts: string[] = [
    `<strong>Survey respondents</strong> rate this product as <strong>${formatHedonicPhrase(survey)}</strong>`,
  ];

  const fer = input.ferMean;
  const confidence = input.confidence;
  if (fer != null && Number.isFinite(fer)) {
    parts.push(
      `while the <strong>FER hedonic prediction model</strong> tells the customer's emotional reaction to this product as <strong>${formatHedonicPhrase(fer)}</strong>` +
        (confidence != null && Number.isFinite(confidence)
          ? ` with <strong>${Math.round(confidence * 100)}% confidence</strong>`
          : "") +
        "."
    );
  } else if (confidence != null && Number.isFinite(confidence) && confidence > 0) {
    parts.push(`Mean FER confidence is ${Math.round(confidence * 100)}%.`);
  }

  if (survey <= 4 && input.aspectStats) {
    const weakest = weakestSensoryAttribute(input.aspectStats);
    if (weakest) {
      parts.push(
        `The <strong>weakest sensory attribute</strong> acquired from the survey is <strong>${weakest.label} (${weakest.mean.toFixed(1)}/9)</strong>.`
      );
    }
  }

  return parts.join(" ");
}

export type FerInterpretationInput = {
  ferMean: number | null;
  confidence: number | null;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
};

/**
 * FER Results tab template. Returns null when there is no FER hedonic to report.
 */
export function buildFerInterpretation(input: FerInterpretationInput): string | null {
  const fer = input.ferMean;
  if (fer == null || !Number.isFinite(fer)) return null;

  const confPct =
    input.confidence != null && Number.isFinite(input.confidence)
      ? `${Math.round(input.confidence * 100)}%`
      : null;
  if (!confPct) return null;

  const pos = Math.max(0, Math.round(input.positiveCount));
  const neu = Math.max(0, Math.round(input.neutralCount));
  const neg = Math.max(0, Math.round(input.negativeCount));

  return (
    `The <strong>hedonic score</strong> computed by the <strong>FER hedonic prediction model</strong> is <strong>${formatHedonicPhrase(fer)}</strong> ` +
    `with a <strong>confidence score</strong> of <strong>${confPct}</strong>. ` +
    `The <strong>reaction</strong> is distributed across frames as follows: <strong>${pos}</strong> positive, ` +
    `<strong>${neu}</strong> neutral, and <strong>${neg}</strong> negative.`
  );
}

export type SurveyInterpretationInput = {
  overallMean: number | null;
  surveyCount: number;
  aspectStats?: SensoryAspectMeans | null;
};

/**
 * Survey Results tab narrative (CAP tone, like buildHedonicInterpretation).
 * Highlights strongest/weakest attributes instead of restating every bar.
 * Returns null when there are no survey responses.
 */
export function buildSurveyInterpretation(input: SurveyInterpretationInput): string | null {
  const overall = input.overallMean;
  const n = input.surveyCount;
  if (overall == null || !Number.isFinite(overall) || n <= 0) return null;

  const tasterWord = n === 1 ? "taster" : "tasters";
  const band =
    overall >= 7
      ? "placing it in the positive acceptance band"
      : overall >= 5
        ? "placing it in the neutral acceptance band"
        : "placing it in the negative acceptance band";

  const parts: string[] = [
    `The <strong>overall survey rating</strong> for this food is <strong>${formatHedonicPhrase(overall)}</strong>, taken from <strong>${n}</strong> ${tasterWord}, ${band}.`,
  ];

  if (input.aspectStats) {
    const strongest = strongestSensoryAttribute(input.aspectStats);
    const weakest = weakestSensoryAttribute(input.aspectStats);
    if (strongest && weakest && strongest.label !== weakest.label) {
      parts.push(
        `<strong>Tasters</strong> responded most favorably to <strong>${strongest.label} (${strongest.mean.toFixed(1)}/9)</strong> and least to <strong>${weakest.label} (${weakest.mean.toFixed(1)}/9)</strong>.`
      );
    } else if (strongest) {
      parts.push(
        `Among the sensory attributes, <strong>${strongest.label}</strong> averages <strong>${strongest.mean.toFixed(1)}/9</strong>.`
      );
    }
    if (overall <= 4 && weakest) {
      parts.push(
        `Improving <strong>${weakest.label}</strong> is the clearest opportunity to lift overall acceptance.`
      );
    }
  }

  return parts.join(" ");
}

export type DemographicsBucket = { label: string; score: number };

export type DemographicsInterpretationInput = {
  byAge: DemographicsBucket[];
  byGender: DemographicsBucket[];
  surveyCount: number;
};

const CLOSE_DELTA = 0.5;

function finiteBuckets(rows: DemographicsBucket[]): DemographicsBucket[] {
  return rows.filter((r) => r.label.trim() !== "" && Number.isFinite(r.score));
}

function extremeBuckets(
  rows: DemographicsBucket[]
): { highest: DemographicsBucket; lowest: DemographicsBucket } | null {
  if (rows.length === 0) return null;
  let highest = rows[0];
  let lowest = rows[0];
  for (const row of rows) {
    if (row.score > highest.score) highest = row;
    if (row.score < lowest.score) lowest = row;
  }
  return { highest, lowest };
}

/**
 * Demographics tab narrative: who liked the product most/least by age and gender.
 * Highlights extremes only; does not restate every bar.
 */
export function buildDemographicsInterpretation(
  input: DemographicsInterpretationInput
): string | null {
  const n = input.surveyCount;
  const ages = finiteBuckets(input.byAge ?? []);
  const genders = finiteBuckets(input.byGender ?? []);
  if (n <= 0 || (ages.length === 0 && genders.length === 0)) return null;

  const tasterWord = n === 1 ? "taster" : "tasters";
  const parts: string[] = [
    `The <strong>survey hedonic scores</strong> for this food vary across demographic groups as it follows:`,
  ];

  const ageExt = extremeBuckets(ages);
  if (ageExt) {
    if (ages.length === 1) {
      parts.push(
        `Among age groups with data, <strong>${ageExt.highest.label}</strong> averages <strong>${formatHedonicPhrase(ageExt.highest.score)}</strong>.`
      );
    } else if (
      ageExt.highest.label === ageExt.lowest.label ||
      Math.abs(ageExt.highest.score - ageExt.lowest.score) < CLOSE_DELTA
    ) {
      parts.push(
        `Age groups rate this product similarly, with <strong>${ageExt.highest.label}</strong> at <strong>${formatHedonicPhrase(ageExt.highest.score)}</strong>.`
      );
    } else {
      parts.push(
        `Survey liking is highest among <strong>${ageExt.highest.label}</strong> (<strong>${formatHedonicPhrase(ageExt.highest.score)}</strong>) and lowest among <strong>${ageExt.lowest.label}</strong> (<strong>${formatHedonicPhrase(ageExt.lowest.score)}</strong>).`
      );
    }
  }

  const genderExt = extremeBuckets(genders);
  if (genderExt) {
    if (genders.length === 1) {
      parts.push(
        `By gender, <strong>${genderExt.highest.label}</strong> averages <strong>${formatHedonicPhrase(genderExt.highest.score)}</strong>.`
      );
    } else if (
      genderExt.highest.label === genderExt.lowest.label ||
      Math.abs(genderExt.highest.score - genderExt.lowest.score) < CLOSE_DELTA
    ) {
      parts.push(
        `Gender groups rate this product <strong>similarly</strong> as well.`
      );
    } else {
      parts.push(
        `By gender, <strong>${genderExt.highest.label}</strong> rates this product more favorably (<strong>${formatHedonicPhrase(genderExt.highest.score)}</strong>) than <strong>${genderExt.lowest.label}</strong> (<strong>${formatHedonicPhrase(genderExt.lowest.score)}</strong>).`
      );
    }
  }

  return parts.join(" ");
}
