"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Shared screen → a frame every ~1.5 s. Frames are stored as screen moments
// when the screen changed; when nothing happened in the instrumented app for a
// while but the screen changed, the frame goes to the vision model, which
// turns it into an "external" event (Excel, Outlook…).

const W = 960;

export function useScreenShare(opts: {
  sessionId: string | null;
  lastAppEventAt: () => number;
  onResult?: (r: { frame?: { id: string }; questions?: unknown[]; events?: unknown[]; vision?: { caption: string } | null }) => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [lastFrame, setLastFrame] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevThumb = useRef<Uint8ClampedArray | null>(null);
  const lastSaved = useRef(0);
  const caption = useRef<string | undefined>(undefined);
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
    const thumb = document.createElement("canvas");
    thumb.width = 48;
    thumb.height = 27;
    setSharing(true);

    timer.current = setInterval(async () => {
      const { sessionId, lastAppEventAt, onResult } = optsRef.current;
      if (!sessionId || !video.videoWidth) return;
      const h = Math.round((video.videoHeight / video.videoWidth) * W);
      canvas.width = W;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(video, 0, 0, W, h);
      const tctx = thumb.getContext("2d", { willReadFrequently: true })!;
      tctx.drawImage(video, 0, 0, 48, 27);
      const px = tctx.getImageData(0, 0, 48, 27).data;
      let diff = 0;
      if (prevThumb.current) for (let k = 0; k < px.length; k += 4) diff += Math.abs(px[k] - prevThumb.current[k]) + Math.abs(px[k + 1] - prevThumb.current[k + 1]);
      const changed = !prevThumb.current || diff / (48 * 27) > 18;
      prevThumb.current = px;
      const now = Date.now();
      if (!changed && now - lastSaved.current < 8000) return;
      lastSaved.current = now;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      setLastFrame(dataUrl);
      const describe = changed && now - lastAppEventAt() > 3000;
      const r = await fetch(`/api/sessions/${sessionId}/frames`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl, ts: now, describe, prevCaption: caption.current }),
      }).then((x) => x.json()).catch(() => null);
      if (r?.vision?.caption) caption.current = r.vision.caption;
      if (r) onResult?.(r);
    }, 1500);
  }, [stop]);

  return { sharing, start, stop, lastFrame };
}
