"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Shared screen → a frame every ~1–1.5 s. Frames are stored as screen moments
// when the screen changed; when nothing happened in the instrumented app for a
// while but the screen changed, the frame goes to the vision model, which
// turns it into an "external" event (Excel, Outlook…).

export interface FrameResult {
  frame?: { id: string };
  questions?: unknown[];
  events?: unknown[];
  recognized?: unknown[];
  vision?: { caption: string } | null;
  /** real app (ERPNext): what the vision model read off the screen */
  screen?: { view: string; invoiceRef?: string; costCenter?: string; status?: string; dialog?: string; section?: string; activity?: string; caption: string } | null;
  /** real app: an irreversible step's confirm dialog is open and asky wants to ask first */
  hold?: { question: unknown };
  /** real app, Teach: the learner is about to break a guardrail */
  block?: { tool?: string; violations?: unknown[]; message?: string; stage?: "confirm" | "saved" | "left"; invoice?: string };
}

export function useScreenShare(opts: {
  sessionId: string | null;
  lastAppEventAt: () => number;
  onResult?: (r: FrameResult) => void;
  /** frame width sent to the server; dense business UIs need more pixels to be legible */
  width?: number;
  /** every changed frame is read by the vision model (no instrumentation to rely on) */
  alwaysDescribe?: boolean;
  /** the screen changed — counts as the expert being busy for pause detection */
  onActivity?: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [lastFrame, setLastFrame] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevThumb = useRef<Uint8ClampedArray | null>(null);
  const lastSaved = useRef(0);
  const caption = useRef<string | undefined>(undefined);
  const inflight = useRef(false);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setSharing(false);
  }, []);

  const start = useCallback(async () => {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
    stream.current = s;
    s.getVideoTracks()[0].addEventListener("ended", stop);
    const video = document.createElement("video");
    video.srcObject = s;
    video.muted = true;
    await video.play();
    const canvas = document.createElement("canvas");
    // a real app (ERPNext) is only seen through pixels: a finer thumbnail catches a typed cost center or a small dialog
    const fine = !!optsRef.current.alwaysDescribe;
    const TW = fine ? 256 : 48;
    const TH = fine ? 144 : 27;
    const thumb = document.createElement("canvas");
    thumb.width = TW;
    thumb.height = TH;
    setSharing(true);

    timer.current = setInterval(async () => {
      const { sessionId, lastAppEventAt, onResult, onActivity, alwaysDescribe } = optsRef.current;
      if (!sessionId || !video.videoWidth || inflight.current) return;
      const W = Math.min(optsRef.current.width ?? 960, video.videoWidth);
      const h = Math.round((video.videoHeight / video.videoWidth) * W);
      canvas.width = W;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(video, 0, 0, W, h);
      const tctx = thumb.getContext("2d", { willReadFrequently: true })!;
      tctx.drawImage(video, 0, 0, TW, TH);
      const px = tctx.getImageData(0, 0, TW, TH).data;
      let diff = 0;
      let hot = 0;
      if (prevThumb.current)
        for (let k = 0; k < px.length; k += 4) {
          const d = Math.abs(px[k] - prevThumb.current[k]) + Math.abs(px[k + 1] - prevThumb.current[k + 1]) + Math.abs(px[k + 2] - prevThumb.current[k + 2]);
          diff += d;
          if (d > 60) hot++;
        }
      // busy = a big change (page, list, dialog); a few hot pixels (typed digits, a ticked box) are worth a look but not "busy"
      const busy = !prevThumb.current || diff / (TW * TH) > 27;
      const changed = busy || (fine && hot >= 8);
      prevThumb.current = px;
      if (busy) onActivity?.();
      const now = Date.now();
      if (!changed && now - lastSaved.current < (fine ? 4000 : 8000)) return;
      lastSaved.current = now;
      const dataUrl = canvas.toDataURL("image/jpeg", alwaysDescribe ? 0.72 : 0.6);
      setLastFrame(dataUrl);
      const describe = alwaysDescribe || (changed && now - lastAppEventAt() > 3000);
      inflight.current = true;
      const r = await fetch(`/api/sessions/${sessionId}/frames`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl, ts: now, describe, prevCaption: caption.current }),
      }).then((x) => x.json()).catch(() => null).finally(() => (inflight.current = false));
      if (r?.vision?.caption) caption.current = r.vision.caption;
      if (r) onResult?.(r);
    }, fine ? 1000 : 1500);
  }, [stop]);

  return { sharing, start, stop, lastFrame };
}
