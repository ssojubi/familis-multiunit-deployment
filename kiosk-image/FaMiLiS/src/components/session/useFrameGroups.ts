import { useMemo } from "react";

export type SessionFrameLog = {
  frameLogId: number;
  timestamp: string | null;
  faceDetected: boolean | null;
  confidenceScore: number | null; // 0..1
  hedonicScore: number | null; // 0..1
  frameImageUrl?: string | null;
};

export type IndexedFrameLog = SessionFrameLog & { index: number };

export type FrameGroupBy = "time" | "hedonic" | "face";

export type FrameGroup = {
  key: string;
  label: string;
  subtitle: string;
  frames: IndexedFrameLog[];
  avgHedonicOutOf9: number | null;
};

export const DEFAULT_BUCKET_SECONDS = 30;

function hedonicBand(score0to1: number | null): "positive" | "neutral" | "negative" | "unknown" {
  if (score0to1 == null) return "unknown";
  const outOf9 = score0to1 * 8 + 1;
  if (outOf9 >= 7) return "positive";
  if (outOf9 >= 5) return "neutral";
  return "negative";
}

function formatSecondsRange(startSec: number, endSec: number) {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${String(ss).padStart(2, "0")}`;
  };
  return `${fmt(startSec)}\u2013${fmt(endSec)}`;
}

function buildGroup(key: string, label: string, frames: IndexedFrameLog[]): FrameGroup {
  const hedonicVals = frames
    .map((f) => f.hedonicScore)
    .filter((v): v is number => v != null)
    .map((v) => v * 8 + 1);
  const avgHedonicOutOf9 =
    hedonicVals.length === 0 ? null : hedonicVals.reduce((a, b) => a + b, 0) / hedonicVals.length;
  const countLabel = `${frames.length} frame${frames.length === 1 ? "" : "s"}`;
  const subtitle = avgHedonicOutOf9 == null ? countLabel : `${countLabel} \u00b7 avg hedonic ${avgHedonicOutOf9.toFixed(1)}`;
  return { key, label, subtitle, frames, avgHedonicOutOf9 };
}

function hasValidTimestamp<T extends SessionFrameLog>(f: T): f is T & { timestamp: string } {
  return f.timestamp != null && !Number.isNaN(new Date(f.timestamp).getTime());
}

function groupByTime(frames: IndexedFrameLog[], bucketSeconds: number): FrameGroup[] {
  const withTime = frames.filter(hasValidTimestamp);
  const withoutTime = frames.filter((f) => !hasValidTimestamp(f));

  if (withTime.length === 0) {
    return frames.length > 0 ? [buildGroup("all", "All frames", frames)] : [];
  }

  const firstMs = new Date(withTime[0].timestamp).getTime();
  const buckets = new Map<number, IndexedFrameLog[]>();
  for (const f of withTime) {
    const elapsedSec = (new Date(f.timestamp).getTime() - firstMs) / 1000;
    const bucketIdx = Math.max(0, Math.floor(elapsedSec / bucketSeconds));
    const list = buckets.get(bucketIdx) ?? [];
    list.push(f);
    buckets.set(bucketIdx, list);
  }

  const sortedBucketIdxs = Array.from(buckets.keys()).sort((a, b) => a - b);
  const groups = sortedBucketIdxs.map((idx) => {
    const label = formatSecondsRange(idx * bucketSeconds, (idx + 1) * bucketSeconds);
    return buildGroup(`t-${idx}`, label, buckets.get(idx) ?? []);
  });

  if (withoutTime.length > 0) {
    groups.push(buildGroup("t-unknown", "Unknown time", withoutTime));
  }
  return groups;
}

function groupByHedonic(frames: IndexedFrameLog[]): FrameGroup[] {
  const bandOrder: { key: "positive" | "neutral" | "negative" | "unknown"; label: string }[] = [
    { key: "positive", label: "Positive (7-9)" },
    { key: "neutral", label: "Neutral (5-6)" },
    { key: "negative", label: "Negative (1-4)" },
    { key: "unknown", label: "No hedonic score" },
  ];
  const buckets = new Map<string, IndexedFrameLog[]>();
  for (const f of frames) {
    const band = hedonicBand(f.hedonicScore);
    const list = buckets.get(band) ?? [];
    list.push(f);
    buckets.set(band, list);
  }
  return bandOrder
    .filter((b) => (buckets.get(b.key)?.length ?? 0) > 0)
    .map((b) => buildGroup(b.key, b.label, buckets.get(b.key) ?? []));
}

function groupByFace(frames: IndexedFrameLog[]): FrameGroup[] {
  const defs: { key: string; label: string; test: (f: IndexedFrameLog) => boolean }[] = [
    { key: "face-yes", label: "Face detected", test: (f) => f.faceDetected === true },
    { key: "face-no", label: "No face detected", test: (f) => f.faceDetected === false },
    { key: "face-unknown", label: "Unknown", test: (f) => f.faceDetected == null },
  ];
  return defs
    .map((d) => buildGroup(d.key, d.label, frames.filter(d.test)))
    .filter((g) => g.frames.length > 0);
}

/**
 * Groups session frame logs for the folder gallery view. Defaults to 30s time
 * buckets from the first frame's timestamp; can also group by hedonic band or
 * face-detected status (same band thresholds as the server-side analytics).
 */
export function useFrameGroups(
  frames: IndexedFrameLog[],
  groupBy: FrameGroupBy,
  bucketSeconds: number = DEFAULT_BUCKET_SECONDS
): FrameGroup[] {
  return useMemo(() => {
    if (frames.length === 0) return [];
    if (groupBy === "hedonic") return groupByHedonic(frames);
    if (groupBy === "face") return groupByFace(frames);
    return groupByTime(frames, bucketSeconds);
  }, [frames, groupBy, bucketSeconds]);
}
