"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, XIcon } from "@/components/icons";
import { button, cx } from "@/components/ui";

// The phone's own "Take Photo" (in the file picker) takes one photo and closes. Worksheets, papers and diaries are
// several pages, so this opens the camera inside Syllabi: take as many photos as needed, see them, remove a bad
// one, then attach them all at once. Where the camera can't be opened here (no permission, an old browser), the
// phone's own camera is offered instead, one photo at a time.

interface Props {
  /** The photos taken, in order, when "Attach" is pressed. */
  onPhotos: (files: File[]) => void;
  /** At most this many photos (what is still free). */
  max: number;
  disabled?: boolean;
  /** The button's look; the default is a quiet button beside "Attach". */
  className?: string;
  label?: string;
}

/** A "Take photos" button that opens the camera for several photos in a row. */
export function TakePhotos({ onPhotos, max, disabled, className, label = "Take photos" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? button.ghost} onClick={() => setOpen(true)} disabled={disabled || max <= 0} title="Take several photos in a row with the camera">
        <CameraIcon className="h-4.5 w-4.5" />
        <span>{label}</span>
      </button>
      {open && (
        <CameraSheet
          max={max}
          onClose={() => setOpen(false)}
          onDone={(files) => {
            setOpen(false);
            if (files.length) onPhotos(files);
          }}
        />
      )}
    </>
  );
}

interface Shot {
  file: File;
  url: string;
}

/** The camera, full screen: a shutter, the photos taken so far, and Attach. */
function CameraSheet({ max, onClose, onDone }: { max: number; onClose: () => void; onDone: (files: File[]) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fallback = useRef<HTMLInputElement>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const full = shots.length >= max;

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("This browser can't open the camera inside Syllabi. Use the phone's camera instead: one photo at a time.");
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (cancelled) return media.getTracks().forEach((t) => t.stop());
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play().catch(() => {});
        }
        setReady(true);
      } catch (err) {
        const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
        setProblem(
          denied
            ? "Syllabi isn't allowed to use the camera. Allow it in the phone's Settings (Safari, Camera), or use the phone's camera instead: one photo at a time."
            : "The camera couldn't be opened. Use the phone's camera instead: one photo at a time."
        );
      }
    }
    void start();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // The photos' previews are let go when the sheet closes.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);
  const preview = (file: Blob) => {
    const url = URL.createObjectURL(file);
    previews.current.push(url);
    return url;
  };

  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth || full) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        // A plain name: the diary reader looks for a date in a file's name, and this has none.
        setShots((list) => (list.length >= max ? list : [...list, { file: new File([blob], `Camera photo ${list.length + 1}.jpg`, { type: "image/jpeg" }), url: preview(blob) }]));
        setFlash(true);
        setTimeout(() => setFlash(false), 150);
      },
      "image/jpeg",
      0.9
    );
  }

  const remove = (i: number) => setShots((list) => list.filter((_, j) => j !== i));

  const attach = () => onDone(shots.map((s) => s.file));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Take photos">
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close the camera">
          <XIcon className="h-6 w-6" />
        </button>
        <p className="text-sm text-white/80" aria-live="polite">
          {shots.length === 0 ? "Take a photo of each page" : `${shots.length} photo${shots.length === 1 ? "" : "s"}${full ? " (the most at once)" : ""}`}
        </p>
        <span className="w-10" />
      </div>

      <div className="relative min-h-0 flex-1">
        {/* playsInline and muted: an iPhone shows the camera in the page only with both. */}
        <video ref={video} playsInline muted autoPlay className={cx("h-full w-full object-contain", !ready && "invisible")} data-testid="camera-view" />
        {flash && <div className="pointer-events-none absolute inset-0 bg-white/60" />}
        {!ready && !problem && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Opening the camera...</p>}
        {problem && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm">{problem}</p>
            <button type="button" className={button.primary} onClick={() => fallback.current?.click()}>
              Use the phone&apos;s camera
            </button>
            {/* The phone's own camera: one photo each time, added to the ones above. */}
            <input
              ref={fallback}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && !full) setShots((list) => [...list, { file, url: preview(file) }]);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      {shots.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto px-4 pt-3" aria-label="Photos taken">
          {shots.map((s, i) => (
            <li key={s.url} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a photo just taken */}
              <img src={s.url} alt={`Photo ${i + 1}`} className="h-16 w-12 rounded-md object-cover ring-1 ring-white/30" />
              <button type="button" onClick={() => remove(i)} className="absolute -top-1.5 -right-1.5 rounded-full bg-black/80 p-0.5 ring-1 ring-white/40" aria-label={`Remove photo ${i + 1}`}>
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-4 px-6 pt-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
        <span className="w-24" />
        <button
          type="button"
          onClick={snap}
          disabled={!ready || full}
          className="h-18 w-18 rounded-full border-4 border-white bg-white/90 transition active:scale-95 disabled:opacity-40"
          aria-label="Take a photo"
        />
        <button type="button" onClick={attach} disabled={shots.length === 0} className={cx(button.primary, "w-24 justify-center disabled:opacity-40")}>
          Attach{shots.length > 0 ? ` ${shots.length}` : ""}
        </button>
      </div>
    </div>
  );
}
