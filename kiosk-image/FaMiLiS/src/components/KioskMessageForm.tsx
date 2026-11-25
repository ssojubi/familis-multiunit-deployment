import { useState } from "react";
import { apiFetch } from "../lib/api";

export default function KioskMessageForm({ testerId }: { testerId: number }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  return <form className="px-5 py-3 border-t border-gray-200" onSubmit={async event => {
    event.preventDefault();
    if (sending || !message.trim()) return;
    setSending(true);
    setNotice("");
    try {
      const response = await apiFetch(`/api/users/${testerId}/announcement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not send message.");
      setMessage("");
      setNotice("Announcement queued. Offline tasters receive it when they reconnect.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not send message."); }
    finally { setSending(false); }
  }}>
    <label className="block text-xs font-semibold text-gray-700">Message taster
      <textarea value={message} maxLength={150} disabled={sending} onChange={event => setMessage(event.target.value)} rows={2} placeholder="Type an announcement…" className="block w-full mt-2 rounded-lg border border-gray-300 p-2 text-sm font-normal resize-y" />
    </label>
    <div className="flex items-center justify-between mt-2"><span className="text-xs text-gray-500">{message.length}/150 characters</span><button disabled={sending || !message.trim()} className="rounded-lg bg-[#e8174a] text-white px-3 py-2 text-xs font-semibold disabled:opacity-50">{sending ? "Sending…" : "Send announcement"}</button></div>
    {notice && <p role="status" className="mt-2 text-xs text-gray-700">{notice}</p>}
  </form>;
}
