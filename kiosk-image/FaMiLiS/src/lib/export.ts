import * as XLSX from "xlsx";

export type ExportFormat = "csv" | "xlsx";

export type FoodExportSessionRow = {
  sessionId: number;
  status: string;
  startTime: string | null;
  endTime: string | null;
  participantLabel: string | null;
  participantAge: number | null;
  participantGender: string | null;
  frameCount: number;
  hasSurvey: boolean;
  surveyOverall?: number | null;
  invalidatedAt?: string | null;
  validity?: "Valid" | "Invalidated";
  meanFerHedonic?: number | null;
  meanFerConfidence?: number | null;
};

export type FoodExportSurveyRow = {
  sessionId: number;
  participantLabel: string | null;
  age: number | null;
  gender: string | null;
  colorRating: number | null;
  flavorAromaRating: number | null;
  saltSweetRating: number | null;
  textureRating: number | null;
  finalOverallRating: number;
  remarks: string | null;
};

export type FoodExportFerSummary = {
  validSessionCount: number;
  frameCount: number;
  meanHedonic: number | null;
  meanConfidence: number | null;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
};

export type FoodExportPayload = {
  food: { id: number; name: string; category: string };
  sessions: FoodExportSessionRow[];
  surveys: FoodExportSurveyRow[];
  ferSummary?: FoodExportFerSummary | null;
};

export type SessionExportPayload = {
  session: {
    id: number;
    status: string;
    startTime: string | null;
    endTime: string | null;
    foodName: string | null;
    foodCategory: string | null;
    participantLabel: string | null;
    participantAge: number | null;
    participantGender: string | null;
  };
  survey: {
    colorRating: number | null;
    flavorAromaRating: number | null;
    saltSweetRating: number | null;
    textureRating: number | null;
    finalOverallRating: number | null;
    remarks: string | null;
  } | null;
  frameSummary: {
    totalFrames: number;
    meanConfidence: number | null;
    meanHedonicOutOf9: number | null;
    faceDetectedCount: number;
    positiveCount: number;
    neutralCount: number;
    negativeCount: number;
  };
};

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "export";
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatScore(n: number | null | undefined): string | number {
  if (n == null || !Number.isFinite(n)) return "";
  return Number(n.toFixed(2));
}

/** Soft sheet protect with no password. Unprotect Sheet works without a prompt. CSV cannot be protected. */
function softProtectSheet(ws: XLSX.WorkSheet): XLSX.WorkSheet {
  ws["!protect"] = {};
  return ws;
}

function appendProtectedSheet(
  wb: XLSX.WorkBook,
  ws: XLSX.WorkSheet,
  name: string
): void {
  XLSX.utils.book_append_sheet(wb, softProtectSheet(ws), name);
}

function buildFoodMetaRows(payload: FoodExportPayload) {
  const validSessions = payload.sessions.filter(
    (s) => s.validity !== "Invalidated" && !s.invalidatedAt
  );
  const fer = payload.ferSummary;
  // Surveys array is already valid-only (P1a), so this mean matches Dashboard.
  const overallRatings = payload.surveys
    .map((s) => s.finalOverallRating)
    .filter((v) => v != null && Number.isFinite(v));
  const surveyOverallMean =
    overallRatings.length > 0
      ? overallRatings.reduce((a, b) => a + b, 0) / overallRatings.length
      : null;
  return [
    { Field: "Food ID", Value: payload.food.id },
    { Field: "Food Name", Value: payload.food.name },
    { Field: "Category", Value: payload.food.category },
    { Field: "Export Date", Value: todayStamp() },
    { Field: "Total Sessions (incl. invalidated)", Value: payload.sessions.length },
    { Field: "Valid Sessions", Value: validSessions.length },
    { Field: "Survey Responses (valid only)", Value: payload.surveys.length },
    {
      Field: "Survey Overall Mean (valid only, /9)",
      Value: formatScore(surveyOverallMean),
    },
    {
      Field: "FER Mean Hedonic (valid only, /9)",
      Value: formatScore(fer?.meanHedonic),
    },
    {
      Field: "FER Mean Confidence (valid only)",
      Value:
        fer?.meanConfidence == null ? "" : `${Math.round(fer.meanConfidence * 100)}%`,
    },
  ];
}

function buildFoodSessionRows(payload: FoodExportPayload) {
  return payload.sessions.map((s) => ({
    "Session ID": s.sessionId,
    Status: s.status,
    Validity: s.validity ?? (s.invalidatedAt ? "Invalidated" : "Valid"),
    "Invalidated At": s.invalidatedAt ?? "",
    "Start Time": s.startTime ?? "",
    "End Time": s.endTime ?? "",
    "Taster Label": s.participantLabel ?? "",
    "Taster Age": s.participantAge ?? "",
    "Taster Gender": s.participantGender ?? "",
    "Frame Count": s.frameCount,
    "Has Survey": s.hasSurvey ? "Yes" : "No",
    "Survey Overall (/9)": formatScore(s.surveyOverall),
    "Mean FER Hedonic (/9)": formatScore(s.meanFerHedonic),
    "Mean FER Confidence":
      s.meanFerConfidence == null ? "" : `${Math.round(s.meanFerConfidence * 100)}%`,
  }));
}

function buildFoodSurveyRows(payload: FoodExportPayload) {
  return payload.surveys.map((s) => ({
    "Session ID": s.sessionId,
    "Taster Label": s.participantLabel ?? "",
    Age: s.age ?? "",
    Gender: s.gender ?? "",
    Color: s.colorRating ?? "",
    "Flavor/Aroma": s.flavorAromaRating ?? "",
    "Salt/Sweet": s.saltSweetRating ?? "",
    Texture: s.textureRating ?? "",
    Overall: s.finalOverallRating,
    Remarks: s.remarks ?? "",
  }));
}

function buildFerSummaryRows(payload: FoodExportPayload) {
  const fer = payload.ferSummary;
  if (!fer) {
    return [
      { Field: "Note", Value: "No FER summary available for valid sessions." },
    ];
  }
  return [
    { Field: "Valid Sessions", Value: fer.validSessionCount },
    { Field: "Frames Analyzed", Value: fer.frameCount },
    { Field: "Mean FER Hedonic (/9)", Value: formatScore(fer.meanHedonic) },
    {
      Field: "Mean FER Confidence",
      Value: fer.meanConfidence == null ? "" : `${Math.round(fer.meanConfidence * 100)}%`,
    },
    { Field: "Positive Frames (7-9)", Value: fer.positiveCount },
    { Field: "Neutral Frames (5-6)", Value: fer.neutralCount },
    { Field: "Negative Frames (1-4)", Value: fer.negativeCount },
  ];
}

/**
 * Downloads a food product's sessions (+ survey / FER for XLSX) as CSV or XLSX.
 * CSV is single-sheet (Sessions only) and cannot be sheet-protected.
 * XLSX is the ready-made multi-sheet report with soft no-password sheet protect.
 */
export function downloadFoodExport(payload: FoodExportPayload, format: ExportFormat): void {
  const base = `${slugify(payload.food.name)}-export-${todayStamp()}`;
  const sessionRows = buildFoodSessionRows(payload);

  if (format === "csv") {
    // CSV has no sheet-protection model; export content unchanged.
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessionRows), "Sessions");
    XLSX.writeFile(wb, `${base}.csv`, { bookType: "csv" });
    return;
  }

  const wb = XLSX.utils.book_new();
  appendProtectedSheet(wb, XLSX.utils.json_to_sheet(buildFoodMetaRows(payload)), "Food summary");
  appendProtectedSheet(wb, XLSX.utils.json_to_sheet(buildFerSummaryRows(payload)), "FER frame analysis");
  appendProtectedSheet(wb, XLSX.utils.json_to_sheet(sessionRows), "Sessions");
  appendProtectedSheet(wb, XLSX.utils.json_to_sheet(buildFoodSurveyRows(payload)), "Survey");
  XLSX.writeFile(wb, `${base}-report.xlsx`);
}

function buildSessionRows(payload: SessionExportPayload) {
  const s = payload.session;
  const sv = payload.survey;
  const fs = payload.frameSummary;
  return [
    {
      "Session ID": s.id,
      Status: s.status,
      "Start Time": s.startTime ?? "",
      "End Time": s.endTime ?? "",
      Food: s.foodName ?? "",
      Category: s.foodCategory ?? "",
      "Taster Label": s.participantLabel ?? "",
      "Taster Age": s.participantAge ?? "",
      "Taster Gender": s.participantGender ?? "",
      "Survey Color": sv?.colorRating ?? "",
      "Survey Flavor/Aroma": sv?.flavorAromaRating ?? "",
      "Survey Salt/Sweet": sv?.saltSweetRating ?? "",
      "Survey Texture": sv?.textureRating ?? "",
      "Survey Overall": sv?.finalOverallRating ?? "",
      "Survey Remarks": sv?.remarks ?? "",
      "Total Frames": fs.totalFrames,
      "Mean Confidence": fs.meanConfidence == null ? "" : `${Math.round(fs.meanConfidence * 100)}%`,
      "Mean Hedonic (FER, /9)": fs.meanHedonicOutOf9 == null ? "" : fs.meanHedonicOutOf9.toFixed(1),
      "Faces Detected": fs.faceDetectedCount,
      "Positive Frames (7-9)": fs.positiveCount,
      "Neutral Frames (5-6)": fs.neutralCount,
      "Negative Frames (1-4)": fs.negativeCount,
    },
  ];
}

/** Downloads a single session's metadata, survey, and frame aggregates (summary-only, no per-frame rows). */
export function downloadSessionExport(payload: SessionExportPayload, format: ExportFormat): void {
  const base = `session-${payload.session.id}-export-${todayStamp()}`;
  const rows = buildSessionRows(payload);
  const wb = XLSX.utils.book_new();
  if (format === "csv") {
    // CSV has no sheet-protection model; export content unchanged.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Session");
    XLSX.writeFile(wb, `${base}.csv`, { bookType: "csv" });
  } else {
    appendProtectedSheet(wb, XLSX.utils.json_to_sheet(rows), "Session");
    XLSX.writeFile(wb, `${base}.xlsx`);
  }
}
