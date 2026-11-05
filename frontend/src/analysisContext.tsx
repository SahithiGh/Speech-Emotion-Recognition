import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { PredictResult, TimelineResult, Transcript } from "./api";
import type { Source } from "./types";

export type Phase = "idle" | "reading" | "loading" | "done";
export type Mode = "upload" | "record";

interface AnalysisContextType {
  mode: Mode;
  setMode: (mode: Mode) => void;
  source: Source | null;
  setSource: (source: Source | null) => void;
  phase: Phase;
  setPhase: (phase: Phase) => void;
  result: PredictResult | null;
  setResult: (result: PredictResult | null) => void;
  timeline: TimelineResult | null;
  setTimeline: (timeline: TimelineResult | null) => void;
  transcript: Transcript | null;
  setTranscript: (transcript: Transcript | null) => void;
  error: string | null;
  setError: (error: string | null) => void;
  savedSuccess: boolean;
  setSavedSuccess: (success: boolean) => void;
  saveError: string | null;
  setSaveError: (err: string | null) => void;
  resetAnalysis: () => void;
}

const AnalysisContext = createContext<AnalysisContextType | undefined>(undefined);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("upload");
  const [source, setSource] = useState<Source | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<PredictResult | null>(null);
  const [timeline, setTimeline] = useState<TimelineResult | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resetAnalysis = useCallback(() => {
    if (source?.url) {
      URL.revokeObjectURL(source.url);
    }
    setSource(null);
    setResult(null);
    setError(null);
    setTimeline(null);
    setTranscript(null);
    setPhase("idle");
    setSavedSuccess(false);
    setSaveError(null);
  }, [source]);

  return (
    <AnalysisContext.Provider
      value={{
        mode,
        setMode,
        source,
        setSource,
        phase,
        setPhase,
        result,
        setResult,
        timeline,
        setTimeline,
        transcript,
        setTranscript,
        error,
        setError,
        savedSuccess,
        setSavedSuccess,
        saveError,
        setSaveError,
        resetAnalysis,
      }}
    >
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) {
    throw new Error("useAnalysis must be used within an AnalysisProvider");
  }
  return ctx;
}
