import { useState } from "react";
import { apiFetch } from "../lib/api";

export default function AnnouncementComposer({ tasters }: { tasters: { id: number; username: string }[] }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <div className="w-full">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded-md bg-[#e8174a] px-3 py-2 text-xs font-semibold text-white">Message tasters / Schedule announcement</button>
    {open && <form className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setNotice("");
      const scheduledDate = new Date(date);
      if (schedule && (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now())) { setNotice("Choose a future date and time."); return; }
      setBusy(true);
      try {
        const response = await apiFetch("/api/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, allTasters: all, recipientIds: selected, scheduledAt: schedule ? scheduledDate.toISOString() : null }) });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Could not queue announcement.");
        setNotice(`${schedule ? "Scheduled" : "Queued"} for ${result.recipientCount} tasters${schedule ? ` on ${new Date(result.scheduledAt).toLocaleString()}` : ""}. Offline recipients will receive it when they reconnect.`);
        setMessage("");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Could not queue announcement."); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="text-sm font-bold mb-2">Announcement recipients</legend>
        <label className="mr-4 text-sm"><input type="radio" checked={all} onChange={() => setAll(true)} /> All active taster accounts ({tasters.length})</label>
        <label className="text-sm"><input type="radio" checked={!all} onChange={() => setAll(false)} /> Choose accounts ({selected.length})</label>
        {!all && <div className="space-y-2">
          <input aria-label="Search taster accounts" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tasters…" className="w-full rounded-md border p-2 text-sm" />
          <div className="max-h-48 overflow-y-auto bg-white rounded-md border p-2">
            {tasters.filter(t => t.username.toLowerCase().includes(search.toLowerCase())).map(t => <label key={t.id} className="flex gap-2 p-2 text-sm"><input type="checkbox" checked={selected.includes(t.id)} onChange={event => setSelected(current => event.target.checked ? [...current, t.id] : current.filter(id => id !== t.id))} />{t.username}</label>)}
          </div>
        </div>}
        <p className="text-xs text-gray-500">Recipients are saved when you submit, including accounts that are currently offline.</p>
        <label className="block text-sm font-semibold">Message<textarea required maxLength={150} value={message} onChange={event => setMessage(event.target.value)} rows={3} className="mt-1 block w-full rounded-md border p-2 font-normal" /></label>
        <p className="text-xs text-gray-500">{message.length}/150 characters</p>
        <label className="mr-4 text-sm"><input type="radio" checked={!schedule} onChange={() => setSchedule(false)} /> Send now</label>
        <label className="text-sm"><input type="radio" checked={schedule} onChange={() => setSchedule(true)} /> Schedule</label>
        {schedule && <label className="block text-sm">Date and time ({timezone})<input type="datetime-local" required value={date} onChange={event => setDate(event.target.value)} className="block mt-1 rounded-md border p-2" /></label>}
        <button disabled={!message.trim() || (!all && !selected.length) || !tasters.length} className="block rounded-md bg-[#e8174a] text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? "Saving…" : schedule ? "Schedule announcement" : "Send announcement"}</button>
      </fieldset>
    </form>}
    {notice && <p role="status" className="mt-2 text-sm text-gray-700">{notice}</p>}
  </div>;
}
