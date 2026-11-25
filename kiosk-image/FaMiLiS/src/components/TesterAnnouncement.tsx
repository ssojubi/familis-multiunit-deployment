import { useEffect, useRef } from "react";

export type Announcement = { id: string; message: string; sentAt: string };

export default function TesterAnnouncement({ announcement, onDismiss }: { announcement: Announcement | null; onDismiss: () => void }) {
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    const unlock = () => {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume().catch(() => undefined);
      } catch { /* The announcement remains visible without audio support. */ }
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      void audio.current?.close().catch(() => undefined);
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    const context = audio.current;
    if (!announcement || !context || context.state !== "running") return;
    // Short two-note chime, generated locally without an external audio asset.
    [880, 1174].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.16;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.42);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }, [announcement]);
  if (!announcement) return null;
  return <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-lg rounded-[15px] border border-rose-200 bg-white shadow-xl px-5 py-4 flex items-start gap-3" role="alert" aria-live="assertive" aria-atomic="true">
    <svg className="w-6 h-6 shrink-0 text-[#e8174a] mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
    <div className="min-w-0 flex-1"><p className="text-sm font-bold text-[#e8174a]">Announcement from admin</p><p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">{announcement.message}</p></div>
    <button type="button" onClick={onDismiss} aria-label="Dismiss announcement" className="text-gray-500 hover:text-gray-900 text-xl px-1">×</button>
  </div>;
}
