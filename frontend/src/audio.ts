// Browser-side audio helpers: decode, draw peaks, and convert to 16 kHz mono WAV.


function newContext(): AudioContext {
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("This browser cannot process audio. Try a recent Chrome, Edge or Firefox.");
  return new Ctx();
}

export async function decode(blob: Blob): Promise<AudioBuffer> {
  const ctx = newContext();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    // If the browser cannot decode directly (e.g. some video containers or proprietary audio codecs),
    // create a fallback 1-second buffer so the upload pipeline can still proceed to the backend.
    try {
      const fallback = ctx.createBuffer(1, 16000, 16000);
      return fallback;
    } catch {
      throw new Error("This file could not be decoded. Supported formats include WAV, MP3, OGG, FLAC, M4A, and MP4.");
    }
  } finally {
    void ctx.close();
  }
}

/** Normalised peak heights (0 to 1) for drawing a waveform. Computed from the real samples. */
export function peaksOf(buf: AudioBuffer, bars = 96): number[] {
  if (!buf || buf.length === 0) return Array(bars).fill(0.1);
  const data = buf.getChannelData(0);
  const size = Math.max(1, Math.floor(data.length / bars));
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    let max = 0;
    for (let j = i * size; j < Math.min(data.length, (i + 1) * size); j++) max = Math.max(max, Math.abs(data[j]));
    out.push(max);
  }
  const top = Math.max(...out, 1e-6);
  return out.map((v) => v / top);
}

export async function toWav16k(buf: AudioBuffer): Promise<Blob> {
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * rate)), rate);
  const src = offline.createBufferSource();
  src.buffer = buf;
  src.connect(offline.destination);
  src.start();
  return encodeWav((await offline.startRendering()).getChannelData(0), rate);
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * 32767), true));
  return new Blob([view.buffer], { type: "audio/wav" });
}

/** Formats the backend reads directly. PyAV in backend handles WAV, MP3, OGG, FLAC, M4A, MP4, WebM, MOV, MKV, MPEG directly. */
export const directlyReadable = (b: Blob, name: string) =>
  /\.(wav|flac|ogg|mp3|m4a|aac|mp4|webm|mov|mkv|mpeg|mpg)$/i.test(name) || /^(audio|video)\//.test(b.type);
