import { useEffect, useState } from "react";
import { PageHeader, PageTitle } from "../components/PageHeader";
import { apiFetch } from "../lib/api";

type Preferences = {
  consent: Record<string, { label: string; helper: string }>;
  additionalRoles: string[];
  roleTabAccess: Record<string, string[]>;
  frameRetentionDays: number;
  backup: { frequency: "daily" | "weekly" | "monthly"; destination: "local" | "cloud"; time: string; cloudUrl?: string };
};

const CONSENT_LABELS: Record<string, string> = {
  facialRecording: "Facial recording consent", dataUsage: "Research data use", participant: "Voluntary participation", dataStorage: "Data storage notice",
};
const CONFIGURABLE_TABS = [
  { key: "food", label: "Food Management", adminOnly: false },
  { key: "participants", label: "Taster Management", adminOnly: false },
  { key: "stats", label: "Statistics & Analytics", adminOnly: false },
  { key: "monitor", label: "Monitor Kiosks", adminOnly: false },
  { key: "users", label: "Users (CRUD)", adminOnly: false },
  { key: "preferences", label: "Preferences", adminOnly: false },
];

export default function AdminPreferences() {
  const [value, setValue] = useState<Preferences | null>(null);
  const [newRole, setNewRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch("/api/preferences", { signal: controller.signal }).then(r => r.json()).then(j => { if (j?.ok) setValue(j.preferences); else setMessage(j?.error || "Could not load preferences."); }).catch(() => setMessage("Could not load preferences."));
    return () => controller.abort();
  }, []);
  const updateConsent = (key: string, field: "label" | "helper", text: string) => setValue(prev => prev ? ({ ...prev, consent: { ...prev.consent, [key]: { ...prev.consent[key], [field]: text } } }) : prev);
  const save = async () => {
    if (!value) return;
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: value }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Could not save preferences.");
      setValue(result.preferences); setMessage("Preferences saved.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save preferences."); }
    finally { setBusy(false); }
  };
  return <PageHeader><div className="p-5 sm:p-8 max-w-5xl mx-auto">
    <PageTitle title="Preferences" subtitle="Manage consent wording, roles, frame retention, and backup schedule." />
    {!value ? <p className="mt-6 text-sm text-gray-500">Loading preferences…</p> : <div className="mt-6 space-y-6">
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-bold text-gray-900">Consent form</h2><p className="text-sm text-gray-500">Every listed item is shown to tasters and must be accepted. Keep at least one field.</p></div><button type="button" className="rounded bg-gray-900 px-3 py-2 text-sm text-white" onClick={()=>{const key=`consent_${Date.now()}`;setValue({...value,consent:{...value.consent,[key]:{label:"New consent statement",helper:""}}});}}>Add field</button></div>{Object.entries(value.consent).map(([key, copy]) => <div key={key} className="grid gap-2 border-t pt-4"><div className="flex items-center justify-between"><span className="text-xs text-gray-400">{CONSENT_LABELS[key] || "Custom consent field"}</span><button type="button" disabled={Object.keys(value.consent).length <= 1} className="text-sm font-semibold text-red-600 disabled:opacity-40" onClick={()=>{const consent={...value.consent};delete consent[key];setValue({...value,consent});}}>Delete field</button></div><label className="text-sm font-semibold">Consent statement<input className="mt-1 w-full rounded border p-2 font-normal" value={copy.label} onChange={e=>updateConsent(key,"label",e.target.value)} /></label><label className="text-sm font-semibold">Helper text<textarea className="mt-1 w-full rounded border p-2 font-normal" rows={2} value={copy.helper} onChange={e=>updateConsent(key,"helper",e.target.value)} /></label></div>)}</section>
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4"><h2 className="font-bold text-gray-900">Roles and tab access</h2><p className="text-sm text-gray-500">Choose the tabs each role can access. Admin always has access to every tab. Select the tabs each role should be able to open.</p><div className="flex gap-2"><input className="rounded border px-3 py-2" value={newRole} onChange={e=>setNewRole(e.target.value)} placeholder="e.g. observer" /><button className="rounded bg-gray-900 px-4 py-2 text-white" onClick={()=>{const role=newRole.trim().toLowerCase(); if(role && !value.additionalRoles.includes(role)){setValue({...value,additionalRoles:[...value.additionalRoles,role],roleTabAccess:{...value.roleTabAccess,[role]:[]}});setNewRole("");}}}>Add role</button></div><div className="space-y-4">{[{role:"admin",fixed:true}, {role:"staff",fixed:false}, {role:"tester",fixed:false}, ...value.additionalRoles.map(role=>({role,fixed:false}))].map(({role,fixed})=><div key={role} className="rounded-lg border p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold capitalize">{role}{role==="staff"?" (Operator)":""}</h3></div>{role!=="admin"&&role!=="staff"&&role!=="tester"?<button className="text-sm font-semibold text-red-600" onClick={()=>{const roleTabAccess={...value.roleTabAccess};delete roleTabAccess[role];setValue({...value,additionalRoles:value.additionalRoles.filter(item=>item!==role),roleTabAccess});}}>Delete role</button>:<span className="text-xs text-gray-500">{fixed?"All tabs":"Select tabs below"}</span>}</div><div className="grid gap-2 sm:grid-cols-2">{CONFIGURABLE_TABS.map(tab=><label key={tab.key} className={`flex items-center gap-2 rounded bg-gray-50 px-3 py-2 text-sm ${role==="admin"?"text-gray-400":"text-gray-700"}`}><input type="checkbox" checked={role==="admin"||Boolean(value.roleTabAccess[role]?.includes(tab.key))} disabled={role==="admin"} onChange={e=>{const current=value.roleTabAccess[role]||[];const next=e.target.checked?[...current,tab.key]:current.filter(item=>item!==tab.key);setValue({...value,roleTabAccess:{...value.roleTabAccess,[role]:next}});}} />{tab.label}</label>)}</div></div>)}</div></section>
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3"><h2 className="font-bold text-gray-900">Frame deletion schedule</h2><label className="block text-sm">Delete frame images after <input type="number" min={1} max={3650} className="mx-2 w-24 rounded border px-2 py-1" value={value.frameRetentionDays} onChange={e=>setValue({...value,frameRetentionDays:Number(e.target.value)})} /> days</label><p className="text-xs text-gray-500">The server checks daily, removes expired frame images and frame records, and updates FER results.</p></section>
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3"><h2 className="font-bold text-gray-900">Backup schedule</h2><div className="flex flex-wrap gap-4 text-sm"><label>Frequency <select className="ml-2 rounded border p-2" value={value.backup.frequency} onChange={e=>setValue({...value,backup:{...value.backup,frequency:e.target.value as Preferences["backup"]["frequency"]}})}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label>Destination <select className="ml-2 rounded border p-2" value={value.backup.destination} onChange={e=>setValue({...value,backup:{...value.backup,destination:e.target.value as Preferences["backup"]["destination"]}})}><option value="local">This device</option><option value="cloud">Cloud upload endpoint</option></select></label><label>Time <input type="time" className="ml-2 rounded border p-2" value={value.backup.time} onChange={e=>setValue({...value,backup:{...value.backup,time:e.target.value}})} /></label></div>{value.backup.destination === "cloud" ? <label className="block text-sm font-semibold">HTTPS backup endpoint<input type="url" required className="mt-1 w-full rounded border p-2 font-normal" placeholder="https://your-backup-service/upload" value={value.backup.cloudUrl || ""} onChange={e=>setValue({...value,backup:{...value.backup,cloudUrl:e.target.value}})} /></label> : <p className="text-xs text-gray-500">Backups are written to the server's local backups folder.</p>}<p className="text-xs text-gray-500">Runs on the server's local time. Archives include database tables and uploaded frame and image files. Cloud endpoints must accept an HTTP PUT request with a gzip archive body.</p></section>
      <div className="flex items-center gap-4"><button disabled={busy} onClick={()=>void save()} className="rounded bg-[#e8174a] px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy?"Saving…":"Save preferences"}</button><span className="text-sm text-gray-600">{message}</span></div>
    </div>}
  </div></PageHeader>;
}
