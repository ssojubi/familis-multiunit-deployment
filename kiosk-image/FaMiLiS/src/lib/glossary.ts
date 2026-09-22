export type GlossaryTerm =
  | "hedonicScore"
  | "fer"
  | "confidenceScore"
  | "sensoryAttributes"
  | "invalidated"
  | "retentionStatus"
  | "sampleSize"
  | "stdDev"
  | "sessionTrends"
  | "reactionDistribution"
  | "framesAnalyzed"
  | "testingSessions"
  | "sessionStatus"
  | "sentiment"
  | "boothHandoff"
  | "participantLabel"
  | "account"
  | "operatorRole"
  | "tasterAccount"
  | "tasterSubject"
  | "overallAcceptance"
  | "overallProfile"
  | "surveyColor"
  | "surveyFlavorAroma"
  | "surveySaltSweet"
  | "surveyTexture"
  | "faceOnly"
  | "lowConfidenceFilter"
  | "hedonicBand"
  | "compareSessions"
  | "sessionContinuation"
  | "ferVsSurvey"
  | "demographicsHedonic"
  | "spiderChart";

export type GlossaryEntry = {
  title: string;
  body: string;
};

export const GLOSSARY: Record<GlossaryTerm, GlossaryEntry> = {
  hedonicScore: {
    title: "Hedonic score",
    body: "How much a taster appears to like the food, rated on a 1-9 scale.",
  },
  fer: {
    title: "FER",
    body: "Facial Emotion Recognition, which estimates a taster's reaction from camera frames.",
  },
  confidenceScore: {
    title: "Confidence score",
    body: "How certain the system is that a face was detected correctly in a frame.",
  },
  sensoryAttributes: {
    title: "Sensory attributes",
    body: "The color, aroma, salt or sweetness, and texture ratings collected from the survey.",
  },
  invalidated: {
    title: "Invalidated",
    body: "A session flagged as unusable for analysis. Invalidated sessions are excluded from reports, analytics, and exports.",
  },
  retentionStatus: {
    title: "Retention status",
    body: "Whether a session's data is still active, pending deletion, or already anonymized.",
  },
  sampleSize: {
    title: "Sample size (N)",
    body: "Completed survey responses for this product. Trends need at least 5 for reliability.",
  },
  stdDev: {
    title: "Standard deviation (σ)",
    body: "How spread out survey ratings are around the mean. Higher values mean less agreement.",
  },
  sessionTrends: {
    title: "Session trends",
    body: "Mean survey and FER ratings across testing sessions over time.",
  },
  reactionDistribution: {
    title: "Reaction distribution",
    body: "Share of frames in FER reaction buckets (like, neutral, dislike style), not survey votes.",
  },
  framesAnalyzed: {
    title: "Frames analyzed",
    body: "Camera frames that went through face detection and emotion inference.",
  },
  testingSessions: {
    title: "Testing sessions",
    body: "Recorded tasting sessions for this product.",
  },
  sessionStatus: {
    title: "Session status",
    body: "Workflow state: pending, active, completed, or cancelled. Separate from invalidate and retention.",
  },
  sentiment: {
    title: "Sentiment",
    body: "Coarse positive, neutral, or negative label derived from live FER.",
  },
  boothHandoff: {
    title: "Booth handoff",
    body: "Admin or Operator starts the session and switches into the Taster account automatically. Recommended for single-device testing.",
  },
  participantLabel: {
    title: "Taster label",
    body: "Stable taster reference ID. Reuse an existing label to continue a history, or enter a new one to create a taster profile.",
  },
  account: {
    title: "Account",
    body: "A login identity with a role: Admin, Operator, or Taster account. Separate from the taster subject profile used in sessions.",
  },
  operatorRole: {
    title: "Operator",
    body: "Login role for running sessions and lab workflows. Stored as staff in the system; shown as Operator in the UI.",
  },
  tasterAccount: {
    title: "Taster account",
    body: "Login role used at the booth after handoff. Distinct from the taster subject profile (label, age, gender).",
  },
  tasterSubject: {
    title: "Taster",
    body: "Subject profile for a tasting session: label, demographics, and session history. Not the same as a Taster account login.",
  },
  overallAcceptance: {
    title: "Overall acceptance",
    body: "Final overall survey liking on the 1-9 hedonic scale (Overall Profile).",
  },
  overallProfile: {
    title: "Overall Profile",
    body: "The taster's overall liking of the product as a whole, separate from individual sensory attributes like color or texture.",
  },
  surveyColor: {
    title: "Color",
    body: "How appealing the food looks, based on its color and visual appearance.",
  },
  surveyFlavorAroma: {
    title: "Flavor / Aroma",
    body: "How much the taster likes the food's taste and smell together.",
  },
  surveySaltSweet: {
    title: "Salt / Sweet",
    body: "How much the taster likes the saltiness or sweetness of the food.",
  },
  surveyTexture: {
    title: "Texture",
    body: "How much the taster likes the food's mouthfeel, thickness, or viscosity.",
  },
  faceOnly: {
    title: "Face only",
    body: "Show only frames where a face was detected.",
  },
  lowConfidenceFilter: {
    title: "Low confidence filter",
    body: "Show only frames with confidence under 50%.",
  },
  hedonicBand: {
    title: "Hedonic band",
    body: "Groups frames by hedonic score ranges for easier browsing.",
  },
  compareSessions: {
    title: "Compare sessions",
    body: "Select sibling sessions to view or compare for the same product and taster context.",
  },
  sessionContinuation: {
    title: "Continue tasting",
    body: "After the survey, continue with the same food, switch to a different food, or finish.",
  },
  ferVsSurvey: {
    title: "FER vs survey",
    body: "FER is camera-inferred reactions from frames. Survey is self-reported ratings. They are distinct.",
  },
  demographicsHedonic: {
    title: "Demographics",
    body: "Average survey hedonic scores grouped by age and gender, not FER.",
  },
  spiderChart: {
    title: "Spider chart",
    body: "Summarizes overall taster responses for this food: mean survey ratings for color, flavor/aroma, salt/sweet, texture, and overall across valid sessions.",
  },
};
