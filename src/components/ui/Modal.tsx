"use client";
import { X } from "lucide-react";
import { useEffect } from "react";

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`rise panel max-h-[92dvh] w-full overflow-y-auto rounded-b-none bg-surface p-5 sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="h-display text-2xl">{title}</h2>
          <button type="button" onClick={onClose} className="btn-quiet !p-2" aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
