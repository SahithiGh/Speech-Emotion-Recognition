import { useCallback, useEffect, useRef, useState } from "react";

function micError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access was blocked. Click the lock icon in the address bar, allow the microphone, and try again.";
  if (name === "NotFoundError") return "No microphone was found. Connect one and try again.";
  if (name === "NotReadableError") return "The microphone is being used by another program. Close it and try again.";
  return "The microphone could not be started.";
}

export function useRecorder(onDone: (blob: Blob) => void, maxSeconds = 15) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const timers = useRef<number[]>([]);
  const chunks = useRef<Blob[]>([]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const cleanup = useCallback(() => {
    timers.current.forEach((t) => window.clearInterval(t));
    timers.current = [];
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close();
    audioCtx.current = null;
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not support microphone recording. Use a recent Chrome, Edge or Firefox, or upload a file instead.");
      return;
    }
    try {
      // Standard browser voice processing removes laptop fan noise, room reverberation, and normalizes voice volume.
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      stream.current = s;
      const rec = new MediaRecorder(s);
      recorder.current = rec;
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        cleanup();
        setRecording(false);
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) doneRef.current(blob);
      };
      try {
        const ctx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        audioCtx.current = ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        timers.current.push(window.setInterval(() => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        }, 80));
      } catch { /* the level meter is optional */ }
      s.getAudioTracks().forEach((t) => { t.onended = () => {   // device unplugged or taken by another program
        setError("The microphone was disconnected or interrupted. Any audio recorded so far was kept; record again if needed.");
        stop();
      }; });
      rec.start();
      setSeconds(0);
      setRecording(true);
      timers.current.push(window.setInterval(() => {
        setSeconds((n) => {
          if (n + 1 >= maxSeconds) stop();
          return n + 1;
        });
      }, 1000));
    } catch (e) {
      cleanup();
      setError(micError(e));
    }
  }, [cleanup, stop, maxSeconds]);

  useEffect(() => () => {
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    cleanup();
  }, [cleanup]);

  return { recording, seconds, level, error, start, stop };
}
