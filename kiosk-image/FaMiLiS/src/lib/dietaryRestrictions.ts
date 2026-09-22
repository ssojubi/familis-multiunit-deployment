/**
 * Labeled dietary_restrictions helpers for Consent ethics detail boxes (N+5).
 * Format: `Allergies: …; Intolerances: …; Medical: …; Religious/Cultural: …; Health today: …; Recent food/medication: …`
 */

export const DIETARY_ETHICS_SECTIONS = [
  { key: "foodAllergies", dietaryLabel: "Allergies" },
  { key: "intolerances", dietaryLabel: "Intolerances" },
  { key: "medicalDietary", dietaryLabel: "Medical" },
  { key: "religiousCultural", dietaryLabel: "Religious/Cultural" },
  { key: "healthToday", dietaryLabel: "Health today" },
  { key: "recentFoodMedication", dietaryLabel: "Recent food/medication" },
] as const;

export type DietaryEthicsKey = (typeof DIETARY_ETHICS_SECTIONS)[number]["key"];
export type DietaryDetailsMap = Record<DietaryEthicsKey, string>;

export function emptyDietaryDetails(): DietaryDetailsMap {
  return {
    foodAllergies: "",
    intolerances: "",
    medicalDietary: "",
    religiousCultural: "",
    healthToday: "",
    recentFoodMedication: "",
  };
}

/** Build labeled dietary_restrictions from filled per-section detail boxes only. */
export function buildDietaryRestrictionsFromDetails(
  details: Partial<Record<DietaryEthicsKey, string>>
): string | null {
  const parts: string[] = [];
  for (const item of DIETARY_ETHICS_SECTIONS) {
    const text = (details[item.key] ?? "").trim();
    if (text) parts.push(`${item.dietaryLabel}: ${text}`);
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

/**
 * Inverse of buildDietaryRestrictionsFromDetails.
 * Labeled sections map into matching keys; free-form / unparseable text goes into Medical.
 */
export function parseDietaryRestrictionsToDetails(
  raw: string | null | undefined
): DietaryDetailsMap {
  const result = emptyDietaryDetails();
  const text = (raw ?? "").trim();
  if (!text) return result;

  const labelToKey = new Map<string, DietaryEthicsKey>(
    DIETARY_ETHICS_SECTIONS.map((s) => [s.dietaryLabel.toLowerCase(), s.key])
  );

  // Split on "; " but keep values that may contain commas.
  const segments = text.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  let matchedAny = false;

  for (const segment of segments) {
    const colon = segment.indexOf(":");
    if (colon <= 0) continue;
    const label = segment.slice(0, colon).trim().toLowerCase();
    const value = segment.slice(colon + 1).trim();
    const key = labelToKey.get(label);
    if (key && value) {
      result[key] = value;
      matchedAny = true;
    }
  }

  if (!matchedAny) {
    // Free-form legacy string: put whole text in Medical (most general).
    result.medicalDietary = text;
  }

  return result;
}
