import { useEffect, useState } from "react";
import type { ParticipantListItem } from "./ParticipantRow";

export type ParticipantFormValues = {
  testerLabel: string;
  age: string;
  gender: string;
  dietaryRestrictions: string;
};

type ParticipantFormModalProps = {
  mode: "create" | "edit";
  initial?: Pick<ParticipantListItem, "testerLabel" | "age" | "gender" | "dietaryRestrictions"> | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: ParticipantFormValues) => void;
};

const inputClass =
  "w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white";

export function ParticipantFormModal({
  mode,
  initial,
  saving = false,
  error = null,
  onClose,
  onSubmit,
}: ParticipantFormModalProps) {
  const [testerLabel, setTesterLabel] = useState(initial?.testerLabel ?? "");
  const [age, setAge] = useState(initial?.age != null ? String(initial.age) : "");
  const [gender, setGender] = useState(initial?.gender ?? "");
  const [dietaryRestrictions, setDietaryRestrictions] = useState(initial?.dietaryRestrictions ?? "");

  useEffect(() => {
    setTesterLabel(initial?.testerLabel ?? "");
    setAge(initial?.age != null ? String(initial.age) : "");
    setGender(initial?.gender ?? "");
    setDietaryRestrictions(initial?.dietaryRestrictions ?? "");
  }, [initial]);

  const canSubmit = testerLabel.trim().length > 0 && !saving;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="participant-form-title"
      >
        <h2 id="participant-form-title" className="text-gray-900 font-bold mb-1">
          {mode === "create" ? "Add participant" : "Edit participant"}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {mode === "create"
            ? "Create a participant profile without starting a session."
            : "Update label and demographics for this participant."}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-semibold">
              Participant Label / ID <span className="text-[#e8174a]">*</span>
            </label>
            <input
              type="text"
              value={testerLabel}
              onChange={(e) => setTesterLabel(e.target.value)}
              placeholder="e.g. T-01"
              className={inputClass}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1.5 font-semibold">Age</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Optional"
                min={0}
                max={120}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1.5 font-semibold">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className={inputClass}
              >
                <option value="">Optional</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-semibold">
              Dietary restrictions
            </label>
            <textarea
              value={dietaryRestrictions}
              onChange={(e) => setDietaryRestrictions(e.target.value)}
              rows={3}
              placeholder="Optional allergies, intolerances, or dietary notes"
              className={`${inputClass} resize-y`}
            />
          </div>
        </div>

        {error ? <p className="text-xs text-red-600 mt-3">{error}</p> : null}

        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ testerLabel, age, gender, dietaryRestrictions })}
            disabled={!canSubmit}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
              canSubmit
                ? "bg-[#e8174a] hover:bg-[#c9143f] text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {saving ? "Saving…" : mode === "create" ? "Add" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
