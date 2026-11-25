import { useEffect, useState } from "react";
import { ParticipantSessionTable, type ParticipantSessionRow } from "../components/participants/ParticipantSessionTable";
import TesterShell from "../components/TesterShell";
import { apiFetch } from "../lib/api";

type Profile = { username: string; email: string; contactNumber: string | null; kioskNumber: number | null };
type Attempt = ParticipantSessionRow & { remarks?: string | null };

export default function TesterProfile({ historyOnly = false }: { historyOnly?: boolean }) {
  const [data, setData] = useState<{ profile: Profile; history: Attempt[] } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = data?.history.find(session => session.id === selectedId);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch("/api/tester/profile", { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not load profile.");
      setData(result);
    }).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    return () => controller.abort();
  }, []);
  return <TesterShell><main className="min-h-screen bg-[#f6f7fb] p-6">
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{historyOnly ? "Test History" : "My Profile"}</h1>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!data && !error && <p>Loading your profile…</p>}
      {data && <>
        {!historyOnly && <section className="bg-white rounded-xl p-6 border space-y-2">
          <h2 className="text-xl font-semibold">{data.profile.username}</h2>
          <p>{data.profile.email}</p>
          <p>Contact: {data.profile.contactNumber || "Not provided"}</p>
          <p>Kiosk ID: {data.profile.kioskNumber ? String(data.profile.kioskNumber).padStart(3, "0") : "Not assigned"}</p>
        </section>}
        {historyOnly && <section className="bg-white rounded-xl p-6 border overflow-x-auto">
          <h2 className="text-sm font-bold text-gray-900 mb-1">Session History</h2>
          <p className="text-xs text-gray-500 mb-4">Every tasting session you have taken.</p>
          <ParticipantSessionTable sessions={data.history} testerView onOpenSession={setSelectedId} />
          {selected && <section aria-label="Selected test details" className="mt-6 rounded-lg border border-gray-200 p-5">
            <div className="flex justify-between gap-4"><h3 className="font-semibold">{selected.foodName} — Test details</h3><button onClick={() => setSelectedId(null)} className="text-sm text-[#e8174a]">Close</button></div>
            <p className="text-sm text-gray-600 mt-2">Session ID: {selected.sessionCode || "—"} · Kiosk ID: {selected.kioskNumber == null ? "Not recorded" : String(selected.kioskNumber).padStart(3, "0")}</p>
            {selected.survey ? <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {([["Color", selected.survey.color], ["Flavor / Aroma", selected.survey.flavorAroma], ["Saltiness / Sweetness", selected.survey.saltSweet], ["Texture / Viscosity", selected.survey.texture], ["Overall", selected.survey.overall]] as const).map(([label, rating]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd className="font-semibold">{rating == null ? "—" : `${rating}/9`}</dd></div>)}
            </dl> : <p className="mt-4 text-sm text-gray-500">No survey submitted.</p>}
            {selected.remarks && <p className="mt-4 text-sm whitespace-pre-wrap">Remarks: {selected.remarks}</p>}
          </section>}
        </section>}
      </>}
    </div>
  </main></TesterShell>;
}
