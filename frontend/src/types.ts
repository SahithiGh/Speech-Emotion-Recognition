import { ApiError } from "./api";
import { toWav16k } from "./audio";

export interface Source { blob: Blob; url: string; name: string; buffer: AudioBuffer; peaks: number[]; direct: boolean; kind: "upload" | "recording" }

/** Sends the original file when the backend reads that format; otherwise (or if the backend cannot decode it) a browser-made 16 kHz WAV. */
export async function withUpload<T>(source: Source, call: (blob: Blob, name: string) => Promise<T>): Promise<T> {
  if (source.direct) {
    try { return await call(source.blob, source.name); }
    catch (e) { if (!(e instanceof ApiError && e.code === "undecodable")) throw e; }
  }
  return call(await toWav16k(source.buffer), source.direct ? "audio.wav" : "recording.wav");
}
