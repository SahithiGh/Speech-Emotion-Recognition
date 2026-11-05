import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  AudioWaveform,
  Bookmark,
  Check,
  CheckCircle2,
  Download,
  History,
  Info,
  LogIn,
  Mic,
  Play,
  RefreshCw,
  Scale,
  Square,
  Trash2,
  Upload,
  Video,
  Layers,
  ArrowLeftRight,
  FileAudio,
  Sparkles,
  Volume2,
  ChevronDown,
  Users,
  Activity,
} from "lucide-react";
import {
  predict,
  analyzeConversationJob,
  getJobProgress,
  renameSpeaker,
  exportPdfDirect,
  exportCsvDirect,
  exportPdfSaved,
  exportCsvSaved,
  type PredictResult,
  type TimelineResult,
} from "../api";
import { decode, directlyReadable, peaksOf } from "../audio";
import { withUpload, type Source } from "../types";
import { buildReport, download, reportToCsv } from "../report";
import AdvancedPanels from "../components/AdvancedPanels";
import Samples from "../components/Samples";
import { useRecorder } from "../useRecorder";
import { useConfig, useModel } from "../model";
import { usePageMeta } from "../meta";
import { LevelMeter, Waveform } from "../components/Waveform";
import ScoreBars from "../components/ScoreBars";
import ErrorText from "../components/ErrorText";
import { label, pct, secs } from "../format";
import PageHero from "../components/PageHero";
import { useAuth, type SavedAnalysis } from "../auth";
import InteractiveTranscript from "../components/InteractiveTranscript";
import { ConversationTimeline } from "../components/ConversationTimeline";
import { EmotionVisualizations } from "../components/EmotionVisualizations";
import { SpeakerAnalysisView } from "../components/SpeakerAnalysisView";
import AnalysisComparison, { type ComparisonTarget } from "../components/AnalysisComparison";
import MismatchModal from "../components/MismatchModal";

const CUES: Record<string, string> = {
  angry: "closest to acted anger: forceful, high-energy speech",
  disgust: "closest to acted disgust: drawn-out, strained speech",
  fear: "closest to acted fear: tense, often higher-pitched speech",
  happy: "closest to acted happiness: bright, lively speech",
  neutral: "closest to calm, even speech without strong emotion",
  sad: "closest to acted sadness: quiet, slow, low-energy speech",
};

const kb = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

interface BatchItem {
  id: string;
  file: File | Blob;
  name: string;
  size: number;
  kind: "upload" | "recording";
  isVideo: boolean;
  status: "queued" | "reading" | "analyzing" | "done" | "error";
  progressText?: string;
  error?: string | null;
  buffer?: AudioBuffer | null;
  peaks?: number[];
  url?: string;
  originalUrl?: string;
  processedUrl?: string | null;
  playbackMode?: "original" | "processed";
  source?: Source;
  result?: PredictResult | null;
  timeline?: TimelineResult | null;
  saved?: boolean;
}

type Mode = "upload" | "record";

export default function Analyze() {
  usePageMeta(
    "Analyze speech emotion",
    "Record or upload audio and video clips to evaluate vocal emotion, local transcription, word timestamps, and cross-modal consistency.",
    "/analyze"
  );

  const model = useModel();
  const cfg = useConfig();
  const { user, token, saveAnalysis } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const [mode, setMode] = useState<Mode>("upload");
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [over, setOver] = useState(false);

  // Compare mode targets
  const [compareTargets, setCompareTargets] = useState<{ itemA: ComparisonTarget; itemB: ComparisonTarget } | null>(null);

  // Save states for active item
  const [savingActive, setSavingActive] = useState(false);
  const [saveSuccessActive, setSaveSuccessActive] = useState(false);
  const [saveErrorActive, setSaveErrorActive] = useState<string | null>(null);

  // Mismatch Alert Modal states
  const [mismatchModalOpen, setMismatchModalOpen] = useState(false);
  const [dismissedMismatchKeys, setDismissedMismatchKeys] = useState<Set<string>>(new Set());

  const audioRef = useRef<HTMLAudioElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Synchronized playback states for audio player & waveform
  const [playbackTime, setPlaybackTime] = useState<number>(0);
  const [playbackDuration, setPlaybackDuration] = useState<number>(0);

  // Collapsible analysis section states (both collapsed by default)
  const [isEmotionVisualsOpen, setIsEmotionVisualsOpen] = useState(false);
  const [isSpeakerAnalysisOpen, setIsSpeakerAnalysisOpen] = useState(false);

  // Reset collapsible states when active item changes so sections start collapsed by default
  useEffect(() => {
    setIsEmotionVisualsOpen(false);
    setIsSpeakerAnalysisOpen(false);
  }, [activeId]);

  // Mode sync
  useEffect(() => {
    const m = params.get("mode") === "record" ? "record" : "upload";
    setMode(m);
  }, [params]);

  // Handle reopened analysis from profile
  useEffect(() => {
    const reopened = (location.state as any)?.reopenedAnalysis as SavedAnalysis | undefined;
    if (reopened) {
      const syntheticResult: PredictResult = {
        emotion: reopened.predicted_emotion,
        confidence: reopened.confidence,
        margin: reopened.margin,
        scores: reopened.scores,
        score_type: "normalized model scores (sum to 1)",
        reliability: {
          available: !reopened.is_uncertain,
          validated_accuracy: reopened.is_uncertain ? null : reopened.confidence,
          samples: 100,
          score_range: [0.5, 1.0],
          uncertain: reopened.is_uncertain,
        },
        analyzed_seconds: reopened.analyzed_seconds,
        processing_ms: 0,
        notes: reopened.notes || [],
        model: {
          id: reopened.model_id || null,
          name: reopened.model_name || "SVM / CREMA-D",
          trained_at: null,
          language: "en",
          dataset: "CREMA-D",
        },
        transcription: reopened.transcript
          ? {
            text: reopened.transcript,
            available: true,
            engine: "faster-whisper (local)",
            language: "en",
            no_speech: false,
            segments: reopened.transcript_segments || [],
          }
          : undefined,
        consistency: reopened.consistency_status
          ? {
            status: reopened.consistency_status as any,
            display_label:
              reopened.consistency_status === "consistent"
                ? "Broadly Consistent"
                : reopened.consistency_status === "divergent"
                  ? "Mismatch Detected"
                  : "Insufficient Evidence",
            explanation: reopened.consistency_explanation || "",
            text_affect: {
              polarity: "evaluated",
              detected_emotions: [],
              cues: [],
            },
          }
          : undefined,
        speakers: reopened.speakers || [],
        conversation_timeline: reopened.conversation_timeline || [],
        emotion_tracks: reopened.emotion_tracks || {},
        emotion_journey: reopened.emotion_journey || [],
        voice_analysis: reopened.voice_analysis || {},
        speaker_count: reopened.speakers ? reopened.speakers.length : 1,
      };

      const fakeBuffer = {
        duration: reopened.analyzed_seconds,
        length: Math.round(reopened.analyzed_seconds * 16000),
        numberOfChannels: 1,
        sampleRate: 16000,
      } as AudioBuffer;

      const audioUrl = reopened.id ? `/api/analyses/${reopened.id}/audio?token=${encodeURIComponent(token || "")}` : "";

      const item: BatchItem = {
        id: reopened.id || "reopened-" + Date.now(),
        file: new Blob([], { type: "audio/wav" }),
        name: reopened.original_filename,
        size: Math.round(reopened.analyzed_seconds * 32000),
        kind: "upload",
        isVideo: false,
        status: "done",
        buffer: fakeBuffer,
        peaks: Array(64).fill(0.15),
        url: audioUrl,
        originalUrl: audioUrl,
        processedUrl: null,
        playbackMode: "original",
        result: syntheticResult,
        saved: true,
      };

      setBatch([item]);
      setActiveId(item.id);
      setSaveSuccessActive(true);

      if (reopened.id) {
        fetch(audioUrl)
          .then((r) => {
            if (!r.ok) throw new Error("Audio fetch failed with status " + r.status);
            return r.blob();
          })
          .then(async (b) => {
            try {
              const decBuf = await decode(b);
              const pks = peaksOf(decBuf);
              setBatch((prev) =>
                prev.map((it) => (it.id === item.id ? { ...it, file: b, buffer: decBuf, peaks: pks } : it))
              );
            } catch (decErr) {
              console.warn("Could not decode audio for reopened analysis:", decErr);
            }
          })
          .catch((e) => console.warn("Could not load audio for reopened analysis:", e));
      }
    }
  }, [location.state, token]);

  const activeItem = batch.find((b) => b.id === activeId) || batch[0] || null;

  // Trigger Mismatch Alert Modal when a genuine divergent result is present
  useEffect(() => {
    if (!activeItem || !activeItem.result) return;
    const res = activeItem.result;

    // Do NOT trigger for noisy audio or when prediction is rejected
    if (res.audio_quality?.status === "NOISY" || res.prediction_accepted === false) {
      setMismatchModalOpen(false);
      return;
    }

    // Trigger only when consistency status is genuinely divergent
    if (res.consistency?.status === "divergent") {
      const mismatchKey = `${activeItem.id}::${res.emotion}::${res.transcription?.text || ""}`;
      if (!dismissedMismatchKeys.has(mismatchKey)) {
        setMismatchModalOpen(true);
      }
    } else {
      setMismatchModalOpen(false);
    }
  }, [
    activeItem?.id,
    activeItem?.result?.consistency?.status,
    activeItem?.result?.transcription?.text,
    activeItem?.result?.emotion,
    activeItem?.result?.prediction_accepted,
    activeItem?.result?.audio_quality?.status,
    dismissedMismatchKeys,
  ]);

  const handleCloseMismatchModal = () => {
    if (activeItem?.result) {
      const res = activeItem.result;
      const mismatchKey = `${activeItem.id}::${res.emotion}::${res.transcription?.text || ""}`;
      setDismissedMismatchKeys((prev) => new Set(prev).add(mismatchKey));
    }
    setMismatchModalOpen(false);
  };

  // Track all active object URLs so they are ONLY revoked on unmount or explicit removal
  const blobUrlsRef = useRef<Set<string>>(new Set());

  const createTrackedBlobUrl = (blob: Blob): string => {
    const url = URL.createObjectURL(blob);
    blobUrlsRef.current.add(url);
    return url;
  };

  const safeRevokeBlobUrl = (url?: string | null) => {
    if (url && blobUrlsRef.current.has(url)) {
      try {
        URL.revokeObjectURL(url);
      } catch { }
      blobUrlsRef.current.delete(url);
    }
  };

  // Helper to convert base64 data URLs to Blobs for stable audio playback
  const dataUrlToBlob = (dataUrl: string): Blob => {
    const parts = dataUrl.split(",");
    const mime = parts[0].match(/:(.*?);/)?.[1] || "audio/wav";
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  // Cleanup object URLs ONLY when component truly unmounts
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch { }
      });
      blobUrlsRef.current.clear();
    };
  }, []);

  // Audio seek and play from word timestamp or waveform click
  const handleSeekAndPlay = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, seconds);
      void audioRef.current.play().catch(() => { });
    }
  };

  // Switch between original and noise-reduced audio track
  const togglePlaybackMode = (mode: "original" | "processed") => {
    if (!activeItem) return;
    const targetUrl = mode === "processed" ? activeItem.processedUrl : activeItem.originalUrl;
    if (!targetUrl) return;

    const currentPos = audioRef.current?.currentTime || 0;
    const wasPlaying = audioRef.current ? !audioRef.current.paused : false;

    setBatch((prev) =>
      prev.map((b) =>
        b.id === activeItem.id ? { ...b, playbackMode: mode, url: targetUrl } : b
      )
    );

    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = currentPos;
        if (wasPlaying) {
          void audioRef.current.play().catch(() => { });
        }
      }
    }, 50);
  };

  // Add files to batch queue
  const addFilesToBatch = useCallback(
    async (fileList: FileList | File[]) => {
      const newItems: BatchItem[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (!file) continue;

        const isVideo =
          file.type.startsWith("video/") ||
          /\.(mp4|webm|mov|mkv|avi)$/i.test(file.name);

        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
        newItems.push({
          id,
          file,
          name: file.name,
          size: file.size,
          kind: "upload",
          isVideo,
          status: "queued",
          progressText: "Queued for analysis",
        });
      }

      if (newItems.length === 0) return;

      setBatch((prev) => {
        const combined = [...prev, ...newItems];
        if (!activeId && combined.length > 0) {
          setActiveId(combined[0].id);
        }
        return combined;
      });

      if (!activeId) {
        setActiveId(newItems[0].id);
      }
    },
    [activeId]
  );

  // Analyze a single batch item
  const processBatchItem = async (item: BatchItem): Promise<BatchItem> => {
    // 1. Validation checks
    if (item.size === 0) {
      return { ...item, status: "error", error: "File is empty." };
    }
    if (item.size > cfg.max_upload_mb * 1024 * 1024) {
      return {
        ...item,
        status: "error",
        error: `File exceeds maximum allowed size of ${cfg.max_upload_mb} MB.`,
      };
    }

    try {
      // 1. Ensure original audio URL is created and tracked
      let originalUrl = item.originalUrl || item.url;
      if (!originalUrl) {
        originalUrl = createTrackedBlobUrl(item.file);
      }

      // 2. Decode audio for waveform visualization
      let buffer: AudioBuffer | null = null;
      let peaks: number[] = [];
      try {
        buffer = await decode(item.file);
        peaks = peaksOf(buffer);
      } catch {
        // Fallback for visual buffer if video audio decoding in browser is partial
        peaks = Array(64).fill(0.15);
      }

      const sourceObj: Source = {
        blob: item.file,
        url: originalUrl,
        name: item.name,
        buffer: buffer || ({ duration: 3.0, sampleRate: 16000, length: 48000, numberOfChannels: 1 } as AudioBuffer),
        peaks,
        direct: directlyReadable(item.file, item.name),
        kind: item.kind,
      };

      // 3. Call unified conversation analysis with stage progress updates
      let result: PredictResult;
      try {
        setBatch((prev) =>
          prev.map((b) =>
            b.id === item.id
              ? { ...b, progressText: "Validating audio format..." }
              : b
          )
        );
        const job = await analyzeConversationJob(item.file, item.name);
        let completed = false;
        let jobRes: any = null;
        for (let poll = 0; poll < 120; poll++) {
          await new Promise((r) => setTimeout(r, 350));
          const p = await getJobProgress(job.job_id);
          setBatch((prev) =>
            prev.map((b) =>
              b.id === item.id
                ? {
                    ...b,
                    progressText: `${p.stage_label || "Processing"} (${p.progress_pct || 0}%)`,
                  }
                : b
            )
          );
          if (p.done) {
            completed = true;
            if (p.error) {
              throw new Error(p.error);
            }
            jobRes = p.result;
            break;
          }
        }
        if (!completed || !jobRes) {
          throw new Error("Job timed out.");
        }
        result = jobRes;
      } catch (jobErr) {
        console.warn("Conversation job polling fallback to direct predict:", jobErr);
        result = await withUpload(sourceObj, predict);
      }

      // 4. Maintain two clearly separated audio references:
      // - Original audio (if video, use backend-extracted pristine WAV for 100% browser compatibility)
      // - Processed audio (denoised audio track if noise reduction was applied)
      let activePlaybackUrl = originalUrl;
      let processedUrl: string | null = null;

      if (result?.audio_playback) {
        // If input was a video container (or browser audio tag cannot play container), use extracted WAV
        if (item.isVideo && result.audio_playback.original_audio_url) {
          try {
            const extractedBlob = dataUrlToBlob(result.audio_playback.original_audio_url);
            originalUrl = createTrackedBlobUrl(extractedBlob);
            activePlaybackUrl = originalUrl;
          } catch (e) {
            console.warn("Could not create blob from extracted video audio:", e);
          }
        }
        // If noise reduction was applied, provide separate denoised audio track
        if (result.audio_playback.processed_audio_url) {
          try {
            const procBlob = dataUrlToBlob(result.audio_playback.processed_audio_url);
            processedUrl = createTrackedBlobUrl(procBlob);
          } catch (e) {
            console.warn("Could not create blob from denoised audio:", e);
          }
        }
      }

      return {
        ...item,
        status: "done",
        buffer,
        peaks,
        url: activePlaybackUrl,
        originalUrl,
        processedUrl,
        playbackMode: "original",
        source: { ...sourceObj, url: activePlaybackUrl },
        result,
        error: null,
      };
    } catch (err: any) {
      return {
        ...item,
        status: "error",
        result: null,
        timeline: null,
        error: err.message || "Could not analyze audio.",
      };
    }
  };

  // Analyze all queued or selected items
  const runAnalysis = async () => {
    if (isProcessingBatch) return;
    setIsProcessingBatch(true);

    const itemsToProcess = batch.filter((b) => b.status === "queued" || b.status === "error");
    if (itemsToProcess.length === 0 && activeItem && activeItem.status !== "done") {
      itemsToProcess.push(activeItem);
    }

    for (const item of itemsToProcess) {
      // Mark as analyzing
      setBatch((prev) =>
        prev.map((b) => (b.id === item.id ? { ...b, status: "analyzing", progressText: "Evaluating audio & reducing noise..." } : b))
      );

      const updated = await processBatchItem(item);

      setBatch((prev) => prev.map((b) => (b.id === item.id ? updated : b)));
    }

    setIsProcessingBatch(false);
  };

  // Retry a failed item
  const retryItem = async (id: string) => {
    const item = batch.find((b) => b.id === id);
    if (!item) return;

    setBatch((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "analyzing", error: null } : b))
    );

    const updated = await processBatchItem(item);
    setBatch((prev) => prev.map((b) => (b.id === id ? updated : b)));
  };

  // Remove an item from the batch
  const removeItem = (id: string) => {
    const item = batch.find((b) => b.id === id);
    if (item) {
      safeRevokeBlobUrl(item.url);
      safeRevokeBlobUrl(item.originalUrl);
      safeRevokeBlobUrl(item.processedUrl);
    }

    setBatch((prev) => {
      const next = prev.filter((b) => b.id !== id);
      if (activeId === id) {
        setActiveId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  };

  // Clear all items and reset state
  const clearAll = () => {
    batch.forEach((b) => {
      safeRevokeBlobUrl(b.url);
      safeRevokeBlobUrl(b.originalUrl);
      safeRevokeBlobUrl(b.processedUrl);
    });
    setBatch([]);
    setActiveId(null);
    setCompareTargets(null);
    setSaveSuccessActive(false);
    setSaveErrorActive(null);
  };

  // Mobile & desktop Replace Audio action
  const handleReplaceAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!activeItem) {
      void addFilesToBatch([file]);
      return;
    }

    // Replace the currently active item cleanly, resetting its stale result
    safeRevokeBlobUrl(activeItem.url);
    safeRevokeBlobUrl(activeItem.originalUrl);
    safeRevokeBlobUrl(activeItem.processedUrl);

    const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi)$/i.test(file.name);
    const updated: BatchItem = {
      ...activeItem,
      file,
      name: file.name,
      size: file.size,
      isVideo,
      status: "queued",
      url: undefined,
      originalUrl: undefined,
      processedUrl: undefined,
      playbackMode: "original",
      result: null,
      error: null,
      timeline: null,
      saved: false,
    };

    setBatch((prev) => prev.map((b) => (b.id === activeItem.id ? updated : b)));
    setSaveSuccessActive(false);
    setSaveErrorActive(null);
  };

  // Save active analysis to personal history
  const handleSaveActive = async () => {
    if (!activeItem || !activeItem.result) return;
    if (!activeItem.result.emotion) {
      setSaveErrorActive("Recordings without a valid emotion prediction cannot be saved to history.");
      return;
    }
    if (!user) {
      setSaveErrorActive("Please sign in to save analyses to your personal account.");
      return;
    }

    setSavingActive(true);
    setSaveErrorActive(null);
    try {
      const res = activeItem.result;
      await saveAnalysis({
        original_filename: activeItem.name,
        predicted_emotion: res.emotion,
        confidence: res.confidence,
        margin: res.margin,
        scores: res.scores,
        analyzed_seconds: res.analyzed_seconds,
        is_uncertain: Boolean(res.uncertain || res.reliability?.uncertain === true),
        transcript: res.transcription?.text || null,
        transcript_segments: res.transcription?.segments || null,
        consistency_status: res.consistency?.status || null,
        consistency_explanation: res.consistency?.explanation || null,
        notes: res.notes || [],
        model_name: res.model.name,
        model_id: res.model.id,
        speakers: res.speakers || [],
        conversation_timeline: res.conversation_timeline || [],
        emotion_tracks: res.emotion_tracks || {},
        emotion_journey: res.emotion_journey || [],
        voice_analysis: res.voice_analysis || {},
        audio_id: (res as any).audio_playback?.audio_id || null,
        audio_base64: (res as any).audio_playback?.original_audio_url || null,
      });

      setBatch((prev) =>
        prev.map((b) => (b.id === activeItem.id ? { ...b, saved: true } : b))
      );
      setSaveSuccessActive(true);
    } catch (err: any) {
      setSaveErrorActive(err.message || "Failed to save analysis.");
    } finally {
      setSavingActive(false);
    }
  };

  // Speaker rename handler with optimistic UI update and DB persistence
  const handleRenameSpeaker = async (speakerId: string, newName: string) => {
    if (!activeItem?.result) return;
    const res = activeItem.result;
    const updatedSpeakers = (res.speakers || []).map((s) =>
      s.speaker_id === speakerId ? { ...s, name: newName, label: newName } : s
    );
    const updatedTimeline = (res.conversation_timeline || []).map((t) =>
      t.speaker_id === speakerId ? { ...t, speaker_name: newName } : t
    );
    const updatedCombinedTranscript = (res.transcription?.combined_transcript || []).map((t) =>
      t.speaker_id === speakerId ? { ...t, speaker_name: newName } : t
    );

    const updatedResult: PredictResult = {
      ...res,
      speakers: updatedSpeakers,
      conversation_timeline: updatedTimeline,
      transcription: res.transcription
        ? {
            ...res.transcription,
            combined_transcript: updatedCombinedTranscript,
          }
        : res.transcription,
    };

    setBatch((prev) =>
      prev.map((b) => (b.id === activeItem.id ? { ...b, result: updatedResult } : b))
    );

    if (activeItem.saved && activeItem.id && !activeItem.id.startsWith("reopened-")) {
      try {
        await renameSpeaker(activeItem.id, speakerId, newName);
      } catch (err) {
        console.warn("Could not persist speaker rename to backend:", err);
      }
    }
  };

  // Direct and Saved PDF / CSV export actions
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const handleExportPdf = async () => {
    if (!activeItem?.result) return;
    setExportingPdf(true);
    try {
      if (activeItem.saved && activeItem.id && !activeItem.id.startsWith("reopened-") && user) {
        const token = localStorage.getItem("ser_auth_token") || "";
        await exportPdfSaved(activeItem.id, token);
      } else {
        await exportPdfDirect({
          ...activeItem.result,
          original_filename: activeItem.name,
        });
      }
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportCsv = async () => {
    if (!activeItem?.result) return;
    setExportingCsv(true);
    try {
      if (activeItem.saved && activeItem.id && !activeItem.id.startsWith("reopened-") && user) {
        const token = localStorage.getItem("ser_auth_token") || "";
        await exportCsvSaved(activeItem.id, token);
      } else {
        await exportCsvDirect({
          ...activeItem.result,
          original_filename: activeItem.name,
        });
      }
    } catch (err) {
      console.error("CSV export failed:", err);
    } finally {
      setExportingCsv(false);
    }
  };

  // Recorder handling
  const rec = useRecorder((blob) => {
    const isVideo = false;
    const id = `rec-${Date.now()}`;
    const item: BatchItem = {
      id,
      file: blob,
      name: `Recording (${new Date().toLocaleTimeString()})`,
      size: blob.size,
      kind: "recording",
      isVideo,
      status: "queued",
      progressText: "Microphone recording ready to analyze",
    };
    setBatch((prev) => [...prev, item]);
    setActiveId(id);
  }, cfg.max_record_seconds);

  // File Drop Handlers
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void addFilesToBatch(e.dataTransfer.files);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void addFilesToBatch(e.target.files);
      e.target.value = "";
    }
  };

  // Side-by-side comparison trigger
  const handleOpenComparison = () => {
    const doneItems = batch.filter((b) => b.status === "done" && b.result);
    if (doneItems.length < 2) return;

    setCompareTargets({
      itemA: {
        name: doneItems[0].name,
        url: doneItems[0].url,
        result: doneItems[0].result!,
        analyzedSeconds: doneItems[0].result!.analyzed_seconds,
      },
      itemB: {
        name: doneItems[1].name,
        url: doneItems[1].url,
        result: doneItems[1].result!,
        analyzedSeconds: doneItems[1].result!.analyzed_seconds,
      },
    });
  };

  // Export report
  const saveReport = (kind: "json" | "csv") => {
    if (!activeItem?.result || !activeItem?.source) return;
    const r = buildReport(activeItem.result, activeItem.source, activeItem.timeline || null, null);
    const stamp = r.generated_at.replace(/[:.]/g, "-");
    if (kind === "json") download(`emotion-report-${stamp}.json`, JSON.stringify(r, null, 2), "application/json");
    else download(`emotion-report-${stamp}.csv`, reportToCsv(r), "text/csv");
  };

  const offline = model.phase === "offline";
  const unavailable = model.phase === "ready" && !model.status.trained;
  const modelReady = model.phase === "ready" && model.status.trained;
  const doneCount = batch.filter((b) => b.status === "done").length;

  return (
    <>
      <PageHero
        kicker="Acoustic & Lexical Intelligence"
        title="Analyze Speech Emotion"
        description="Upload or record audio to predict the underlying emotion using our trained SER model."
        videoSrc="/media/signals.mp4"
        posterSrc="/media/hero-poster.jpg"
      />

      <section className="wrap section" style={{ paddingTop: "0.5rem" }}>
        {offline && (
          <div className="banner warn" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>The backend server is currently offline. Start it with run_project.bat, then refresh.</span>
          </div>
        )}
        {unavailable && model.phase === "ready" && (
          <div className="banner warn" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              {model.status.state === "incompatible"
                ? "The saved model is incompatible with this software version. Run train_model.bat to re-train."
                : "No trained model found. Run train_model.bat to train on CREMA-D."}
            </span>
          </div>
        )}

        {/* Comparison Modal / Panel */}
        {compareTargets && (
          <div style={{ marginBottom: "2rem" }}>
            <AnalysisComparison
              itemA={compareTargets.itemA}
              itemB={compareTargets.itemB}
              onClose={() => setCompareTargets(null)}
            />
          </div>
        )}

        {/* Unified Continuous Analysis Workspace */}
        <div className="analysis-workspace-card">
          {/* 1. Integrated Tabs Bar */}
          <div className="workspace-tabs" role="tablist" aria-label="Audio input mode">
            <button
              role="tab"
              id="tab-upload"
              aria-selected={mode === "upload"}
              tabIndex={mode === "upload" ? 0 : -1}
              className={`workspace-tab-item ${mode === "upload" ? "active" : ""}`}
              disabled={isProcessingBatch || rec.recording}
              onClick={() => {
                setMode("upload");
                setParams({ mode: "upload" });
              }}
            >
              <Upload size={16} aria-hidden="true" />
              <span>Upload Audio & Video</span>
            </button>

            <button
              role="tab"
              id="tab-record"
              aria-selected={mode === "record"}
              tabIndex={mode === "record" ? 0 : -1}
              className={`workspace-tab-item ${mode === "record" ? "active" : ""}`}
              disabled={isProcessingBatch || rec.recording}
              onClick={() => {
                setMode("record");
                setParams({ mode: "record" });
              }}
            >
              <Mic size={16} aria-hidden="true" />
              <span>Record Microphone</span>
            </button>
          </div>

          {/* 2. Upper Ingestion Split */}
          <div className="workspace-ingestion-body" role="tabpanel" aria-labelledby={mode === "upload" ? "tab-upload" : "tab-record"}>
            {mode === "upload" ? (
              <div className="workspace-ingest-split">
                {/* Left Dropzone Column */}
                <div className="workspace-dropzone-col">
                  <div
                    className={`workspace-dropzone-box ${over ? "over" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOver(true);
                    }}
                    onDragLeave={() => setOver(false)}
                    onDrop={onDrop}
                  >
                    <div className="dropzone-upload-icon">
                      <Upload size={28} aria-hidden="true" />
                    </div>
                    <p className="dropzone-title">
                      <strong>Drag and drop audio or video files here</strong>, or click to choose
                    </p>
                    <input
                      id="multi-file-input"
                      className="sr-only"
                      type="file"
                      multiple
                      accept="audio/*,video/*,.wav,.mp3,.m4a,.ogg,.flac,.webm,.mp4,.mov,.mkv"
                      onChange={onFileInputChange}
                      disabled={isProcessingBatch}
                    />
                    <label className={`btn-choose-files ${isProcessingBatch ? "disabled" : ""}`} htmlFor="multi-file-input">
                      Choose Audio / Video Files
                    </label>
                    <p className="dropzone-meta-hint">
                      Supports WAV, MP3, OGG, FLAC, M4A and MP4 videos (audio track evaluated). Up to {cfg.max_upload_mb} MB and {cfg.max_audio_seconds}s per clip.
                    </p>
                  </div>
                </div>

                {/* Vertical Divider Line */}
                <div className="workspace-vertical-divider" aria-hidden="true" />

                {/* Right Info Column */}
                <div className="workspace-side-info-col">
                  <div className="side-info-item">
                    <div className="side-info-icon-wrap">
                      <Video size={18} aria-hidden="true" />
                    </div>
                    <div className="side-info-text">
                      <h4>Video Upload Support</h4>
                      <p>For video files (.mp4, .webm, .mov), the acoustic audio track is extracted locally and analyzed.</p>
                    </div>
                  </div>

                  <div className="side-info-item">
                    <div className="side-info-icon-wrap">
                      <AudioWaveform size={18} aria-hidden="true" />
                    </div>
                    <div className="side-info-text">
                      <h4>What is Analyzed?</h4>
                      <p>Emotion recognition evaluates vocal acoustics and speech tone, not facial expressions.</p>
                    </div>
                  </div>

                  <div className="side-info-item side-info-samples">
                    <div className="side-info-icon-wrap play-icon">
                      <Play size={16} fill="currentColor" aria-hidden="true" />
                    </div>
                    <div className="side-info-text samples-text">
                      <Samples
                        disabled={isProcessingBatch}
                        onLoad={(blob, title) => {
                          const item: BatchItem = {
                            id: `sample-${Date.now()}-${title}`,
                            file: blob,
                            name: title,
                            size: blob.size,
                            kind: "upload",
                            isVideo: false,
                            status: "queued",
                          };
                          setBatch((prev) => [...prev, item]);
                          setActiveId(item.id);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="workspace-record-wrap">
                <div className="record-panel-inner">
                  <div className="record-controls-row">
                    {!rec.recording ? (
                      <button
                        className="btn-action-primary record-btn"
                        onClick={() => void rec.start()}
                        disabled={isProcessingBatch}
                      >
                        <Mic size={18} aria-hidden="true" /> Start recording
                      </button>
                    ) : (
                      <button className="btn-action-danger record-btn" onClick={rec.stop}>
                        <Square size={16} aria-hidden="true" /> Stop recording
                      </button>
                    )}

                    <div className="record-status-text" role="status">
                      {rec.recording ? (
                        <span className="recording-indicator">
                          <span className="pulse-dot" /> Recording: {rec.seconds}s / max {cfg.max_record_seconds}s
                        </span>
                      ) : (
                        <span className="recording-idle">
                          Speak clearly into your microphone for 2 to 5 seconds. Audio is captured locally and analyzed.
                        </span>
                      )}
                    </div>
                  </div>

                  {rec.recording && (
                    <div className="record-level-wrap">
                      <span className="level-label">Microphone Level:</span>
                      <LevelMeter level={rec.level} active={rec.recording} />
                    </div>
                  )}

                  {rec.error && <ErrorText>{rec.error}</ErrorText>}
                </div>
              </div>
            )}
          </div>

          {/* 3. Full-width Horizontal Divider */}
          <div className="workspace-horizontal-divider" aria-hidden="true" />

          {/* 4. Integrated File Queue & Analysis Table */}
          <div className="workspace-queue-section">
            <div className="queue-bar-header">
              <div className="queue-bar-left">
                <Layers size={18} className="queue-bar-icon" aria-hidden="true" />
                <div>
                  <h3 className="queue-bar-title">File Queue & Analysis</h3>
                  <p className="queue-bar-desc">
                    {batch.length} {batch.length === 1 ? "file" : "files"} in queue · {batch.length > 0 ? 'Click "Analyze Files" to start' : 'Drop audio or video above'}
                  </p>
                </div>
              </div>

              <div className="queue-bar-actions">
                {batch.length > 0 && (
                  <button
                    className="btn-action-primary"
                    onClick={runAnalysis}
                    disabled={isProcessingBatch || unavailable || offline || !batch.some((b) => b.status === "queued" || b.status === "error")}
                  >
                    {isProcessingBatch ? (
                      <>
                        <span className="spinner light sm" /> Analyzing...
                      </>
                    ) : (
                      <>
                        <Play size={14} fill="currentColor" aria-hidden="true" /> Analyze Files
                      </>
                    )}
                  </button>
                )}

                {doneCount >= 2 && (
                  <button
                    className="btn-action-outline"
                    onClick={handleOpenComparison}
                    title="Compare two analyses side-by-side"
                  >
                    <ArrowLeftRight size={14} aria-hidden="true" /> Compare Two
                  </button>
                )}

                <input
                  type="file"
                  ref={replaceInputRef}
                  className="sr-only"
                  accept="audio/*,video/*,.wav,.mp3,.m4a,.ogg,.flac,.webm,.mp4"
                  onChange={handleReplaceAudio}
                />
                <button
                  type="button"
                  className="btn-action-outline"
                  onClick={() => replaceInputRef.current?.click()}
                  disabled={isProcessingBatch || !activeItem}
                  title="Replace the selected file"
                >
                  <RefreshCw size={14} aria-hidden="true" /> Replace File
                </button>

                {batch.length > 0 && (
                  <button
                    className="btn-action-outline"
                    onClick={clearAll}
                    disabled={isProcessingBatch}
                  >
                    <Trash2 size={14} aria-hidden="true" /> Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Queue Table */}
            {batch.length > 0 ? (
              <div className="queue-table-scroll">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Status</th>
                      <th>Vocal Emotion</th>
                      <th>Consistency</th>
                      <th className="th-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.map((item) => {
                      const isSelected = item.id === activeItem?.id;
                      const consistencyStatus = item.result?.consistency?.status;
                      const isMismatch = consistencyStatus === "divergent";
                      const isMatch = consistencyStatus === "consistent";
                      return (
                        <tr
                          key={item.id}
                          className={`workspace-row ${isSelected ? "active-row" : ""} ${isMismatch ? "mismatch-row" : isMatch ? "match-row" : ""
                            }`}
                          onClick={() => setActiveId(item.id)}
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && setActiveId(item.id)}
                        >
                          <td className="cell-filename">
                            <span className="row-indicator-bar" />
                            <span className="row-file-icon">
                              {item.isVideo ? <Video size={15} /> : <FileAudio size={15} />}
                            </span>
                            <span className="row-filename-text" title={item.name}>
                              {item.name}
                            </span>
                          </td>
                          <td>{item.isVideo ? "Video (Audio)" : "Audio"}</td>
                          <td className="cell-size">{kb(item.size)}</td>
                          <td>
                            {item.status === "queued" && <span className="status-pill queued">Queued</span>}
                            {item.status === "reading" && <span className="status-pill analyzing">Reading...</span>}
                            {item.status === "analyzing" && (
                              <span className="status-pill analyzing">
                                <span className="spinner sm" /> Analyzing...
                              </span>
                            )}
                            {item.status === "done" && (
                              <div style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                                <span className="status-pill done">
                                  <CheckCircle2 size={13} /> Complete
                                </span>
                                {item.result?.noise_reduction?.applied && (
                                  <span className="status-pill denoised" title={item.result.noise_reduction.message || "Background noise reduced"}>
                                    <Sparkles size={11} /> Denoised
                                  </span>
                                )}
                              </div>
                            )}
                            {item.status === "error" && (
                              <span className="status-pill error" title={item.error || "Failed"}>
                                <AlertTriangle size={13} /> Error
                              </span>
                            )}
                          </td>
                          <td>
                            {item.result?.emotion ? (
                              <span className={`emotion-badge sm emotion-${item.result.emotion.toLowerCase()}`}>
                                {label(item.result.emotion)} ({pct(item.result.confidence)})
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            {item.result?.consistency ? (
                              <span className={`consistency-badge sm ${item.result.consistency.status}`}>
                                {item.result.consistency.status === "divergent" && <AlertTriangle size={12} className="inline-icon" />}
                                {item.result.consistency.status === "consistent" && <CheckCircle2 size={12} className="inline-icon" />}
                                {item.result.consistency.display_label}
                              </span>
                            ) : item.result?.audio_quality?.status === "NOISY" ? (
                              <span className="muted">N/A (Noisy)</span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                            {item.status === "error" && (
                              <button
                                className="btn-row-action"
                                onClick={() => retryItem(item.id)}
                                title="Retry processing this file"
                              >
                                <RefreshCw size={14} />
                              </button>
                            )}
                            <button
                              className="btn-row-action text-danger"
                              onClick={() => removeItem(item.id)}
                              title="Remove file"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="queue-empty-msg">
                <p>No files in queue. Drag & drop audio/video above or choose files to begin.</p>
              </div>
            )}

            {/* Active item error display */}
            {activeItem?.status === "error" && activeItem.error && (
              <div className="callout warn" style={{ marginTop: "1rem" }} role="alert">
                <AlertTriangle size={16} />
                <span>
                  <strong>Validation/Processing Error:</strong> {activeItem.error}
                </span>
              </div>
            )}
          </div>

          {/* 5. Integrated Analysis Results */}
          {activeItem && activeItem.status === "done" && activeItem.result && (
            <div className="workspace-results-section" ref={resultRef} tabIndex={-1} aria-label="Analysis Result Details">
              <div className="workspace-section-divider">
                <div className="divider-label">
                  <AudioWaveform size={15} aria-hidden="true" />
                  <span>Inspection & Findings</span>
                </div>
              </div>

              {/* Active File Context Header */}
              <div className="active-item-banner">
                <div className="active-item-meta">
                  <span className="active-label">Currently Inspecting</span>
                  <div className="active-filename-group">
                    <h3 className="active-filename">{activeItem.name}</h3>
                    {activeItem.result.noise_reduction?.applied && (
                      <span className="audio-quality-badge denoised" title={activeItem.result.noise_reduction.message || "Background noise automatically reduced"}>
                        <Sparkles size={12} /> Noise Reduced (-{activeItem.result.noise_reduction.noise_floor_reduction_pct ?? 0}% floor)
                      </span>
                    )}
                    {activeItem.result.audio_quality?.status === "GOOD" && !activeItem.result.noise_reduction?.applied && (
                      <span className="audio-quality-badge good" title={activeItem.result.audio_quality.reason}>
                        <CheckCircle2 size={12} /> Clean Audio ({activeItem.result.audio_quality.snr_db} dB SNR)
                      </span>
                    )}
                    {activeItem.result.audio_quality?.status === "WARNING" && !activeItem.result.noise_reduction?.applied && (
                      <span className="audio-quality-badge warning" title={activeItem.result.audio_quality.reason}>
                        <AlertTriangle size={12} /> Quality Warning ({activeItem.result.audio_quality.snr_db} dB SNR)
                      </span>
                    )}
                    {(activeItem.result.audio_quality?.status === "NOISY" || activeItem.result.prediction_accepted === false) && !activeItem.result.noise_reduction?.applied && (
                      <span className="audio-quality-badge noisy" title={activeItem.result.audio_quality?.reason}>
                        <AlertTriangle size={12} /> Noisy Audio ({activeItem.result.audio_quality?.snr_db ?? 0} dB SNR)
                      </span>
                    )}
                  </div>
                </div>
                <div className="actions">
                  <button
                    className="btn sub sm"
                    onClick={() => replaceInputRef.current?.click()}
                    title="Replace this audio"
                  >
                    <RefreshCw size={14} /> Replace Audio
                  </button>
                </div>
              </div>

              {/* Audio Quality Advisory Banners */}
              {activeItem.result.noise_reduction?.applied && (
                <div className="audio-quality-advisory denoised" role="status">
                  <div className="advisory-icon-wrap">
                    <Sparkles size={22} className="advisory-icon" aria-hidden="true" />
                  </div>
                  <div className="advisory-body">
                    <h4 className="advisory-title">Automatic Noise Reduction Applied</h4>
                    <p className="advisory-text">
                      {activeItem.result.noise_reduction.message || "Background noise was automatically suppressed prior to emotion detection."}
                      {activeItem.result.audio_quality?.status === "WARNING" && (
                        <span> Residual ambient noise is present, but vocal acoustic features were preserved and confidence is displayed normally.</span>
                      )}
                    </p>
                    <div className="advisory-stats">
                      <span>Original Floor: <strong>{(activeItem.result.noise_reduction.noise_floor_before ?? 0).toFixed(4)} RMS</strong></span>
                      <span>Cleaned Floor: <strong>{(activeItem.result.noise_reduction.noise_floor_after ?? 0).toFixed(4)} RMS</strong></span>
                      <span>Floor Reduction: <strong>{activeItem.result.noise_reduction.noise_floor_reduction_pct ?? 0}%</strong></span>
                      <span>SNR: <strong>{activeItem.result.audio_quality?.snr_db ?? 0} dB</strong> (+{activeItem.result.noise_reduction.snr_improvement_db ?? 0} dB)</span>
                    </div>
                  </div>
                </div>
              )}

              {activeItem.result.audio_quality?.status === "NOISY" && !activeItem.result.noise_reduction?.applied && (
                <div className="audio-quality-advisory noisy" role="alert">
                  <div className="advisory-icon-wrap">
                    <AlertTriangle size={22} className="advisory-icon" aria-hidden="true" />
                  </div>
                  <div className="advisory-body">
                    <h4 className="advisory-title">Noisy Audio Advisory</h4>
                    <p className="advisory-text">
                      {activeItem.result.audio_quality.reason || "Elevated background noise detected. Heavy ambient noise may affect prediction reliability. We suggest recording in a quieter environment."}
                    </p>
                    <div className="advisory-stats">
                      <span>Estimated SNR: <strong>{activeItem.result.audio_quality.snr_db ?? 0} dB</strong></span>
                      <span>Noise Floor: <strong>{(activeItem.result.audio_quality.noise_floor ?? 0).toFixed(4)} RMS</strong></span>
                      <span>Speech Duration: <strong>{activeItem.result.audio_quality.speech_duration ?? 0}s</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {activeItem.result.audio_quality?.status === "WARNING" && !activeItem.result.noise_reduction?.applied && (
                <div className="audio-quality-advisory warning" role="status">
                  <div className="advisory-icon-wrap">
                    <AlertTriangle size={20} className="advisory-icon" aria-hidden="true" />
                  </div>
                  <div className="advisory-body">
                    <h4 className="advisory-title">Audio Quality Advisory</h4>
                    <p className="advisory-text">
                      {activeItem.result.audio_quality.reason || "Moderate background noise detected. Prediction may be less reliable."}
                      {" "}(Estimated SNR: {activeItem.result.audio_quality.snr_db} dB, Noise Floor: {(activeItem.result.audio_quality.noise_floor ?? 0).toFixed(4)})
                    </p>
                  </div>
                </div>
              )}

              {/* Vocal Emotion Hero Result Card */}
              <div className={`primary-emotion-hero emo-${(activeItem.result.emotion || "neutral").toLowerCase()}`}>
                <span className="r-kicker">Predicted Vocal Emotion</span>
                <div className="r-emotion-row">
                  <h3 className="r-emotion">{label(activeItem.result.emotion || "neutral")}</h3>
                  <span className="r-conf-tag">{pct(activeItem.result.confidence)}</span>
                </div>
                <p className="r-cue">{CUES[activeItem.result.emotion || "neutral"]}</p>
              </div>

              {/* Model Uncertainty Advisory */}
              {activeItem.result.uncertain && (
                <div className="uncertain-callout" role="alert" style={{ marginTop: "0.85rem" }}>
                  <AlertTriangle size={20} aria-hidden="true" />
                  <div>
                    <h4>Model Uncertainty: Nuanced Acoustic Inflection</h4>
                    <p>
                      The model classified this clip with narrow candidate separation (margin: {pct(activeItem.result.margin)}).
                      The closest acoustic pattern was <strong>{label(activeItem.result.emotion || "neutral")}</strong>, but candidate separation is close.
                    </p>
                  </div>
                </div>
              )}

              {/* Out-of-Distribution Advisory */}
              {activeItem.result.out_of_distribution && (
                <div
                  className="ood-callout"
                  role="alert"
                  style={{
                    display: "flex",
                    gap: "1rem",
                    alignItems: "flex-start",
                    padding: "1rem 1.25rem",
                    borderRadius: "8px",
                    background: "rgba(217, 119, 6, 0.08)",
                    border: "1px solid rgba(217, 119, 6, 0.35)",
                    margin: "1rem 0",
                  }}
                >
                  <AlertTriangle size={22} style={{ color: "#d97706", flexShrink: 0, marginTop: "2px" }} aria-hidden="true" />
                  <div>
                    <h4 style={{ margin: "0 0 0.35rem 0", fontSize: "0.95rem", fontWeight: 600, color: "#d97706" }}>
                      Atypical Acoustic Environment (Out-of-Distribution Advisory)
                    </h4>
                    <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5, color: "var(--color-muted-foreground)" }}>
                      {activeItem.result.ood_details?.warning ||
                        `The acoustic properties of this recording differ substantially from the model's training distribution (measured peak deviation: ${activeItem.result.ood_details?.max_deviation ?? "atypical"}σ vs ${activeItem.result.ood_details?.threshold ?? 10.12}σ threshold). The prediction reflects vocal acoustic proximity and should be interpreted as advisory.`}
                    </p>
                  </div>
                </div>
              )}

              <p className="r-conf">
                Model confidence: {pct(activeItem.result.confidence)} | Margin over candidate #2: {pct(activeItem.result.margin)} | Analyzed {secs(activeItem.result.analyzed_seconds)} of speech.
              </p>

              {/* Quality & Processing Notes */}
              {activeItem.result.notes
                .filter(
                  (n) =>
                    !n.toLowerCase().includes("noisy audio") &&
                    !n.toLowerCase().includes("background noise") &&
                    !n.toLowerCase().includes("atypical acoustic environment")
                )
                .map((n, i) => (
                  <p key={i} className="banner info">
                    <Info size={16} aria-hidden="true" />
                    <span>{n}</span>
                  </p>
                ))}

              {/* Two-Column Responsive Workspace Grid */}
              <div className="workspace-results-grid">
                {/* Left Column: Linguistic & Alignment */}
                <div className="results-col-left">
                  <InteractiveTranscript
                    result={activeItem.result}
                    onSeekAndPlay={handleSeekAndPlay}
                    onUpdateResult={(updatedResult) => {
                      setBatch((prev) =>
                        prev.map((b) => (b.id === activeItem.id ? { ...b, result: updatedResult } : b))
                      );
                    }}
                  />

                  {/* Cross-Modal Consistency Card */}
                  {(() => {
                    const cStatus = activeItem.result.consistency?.status;
                    const isMismatch = cStatus === "divergent";
                    const isConsistent = cStatus === "consistent";
                    const cardModifier = isMismatch ? "mismatch-card" : isConsistent ? "match-card" : "";
                    const signalModifier = isMismatch ? "signal-box-mismatch" : isConsistent ? "signal-box-match" : "";
                    const headlineModifier = isMismatch ? "headline-mismatch" : isConsistent ? "headline-match" : "";

                    return (
                      <div className={`card result-feature-card ${cardModifier}`} style={{ marginTop: "1.25rem" }}>
                        <div className="card-header-flex">
                          <h3 className="feature-card-title">
                            <Scale size={20} className="icon-accent" /> Words vs Vocal Tone Analysis
                          </h3>
                          {activeItem.result.consistency?.status && (
                            <span className={`consistency-badge ${activeItem.result.consistency.status}`}>
                              {isMismatch && <AlertTriangle size={13} className="inline-icon" />}
                              {isConsistent && <CheckCircle2 size={13} className="inline-icon" />}
                              {activeItem.result.consistency.display_label}
                            </span>
                          )}
                        </div>

                        <div className="consistency-content">
                          <div className="consistency-signals-grid">
                            <div className={`signal-box ${signalModifier}`}>
                              <span className="signal-label">Vocal Emotion (Acoustics)</span>
                              <strong className={`signal-val emotion-${activeItem.result.emotion ? activeItem.result.emotion.toLowerCase() : "neutral"}`}>
                                {activeItem.result.emotion ? label(activeItem.result.emotion) : "N/A"}
                              </strong>
                            </div>
                            <div className={`signal-box ${signalModifier}`}>
                              <span className="signal-label">Wording Affect (Transcript)</span>
                              <strong className="signal-val">
                                {activeItem.result.consistency?.text_affect?.polarity
                                  ? activeItem.result.consistency.text_affect.polarity.toUpperCase()
                                  : "NEUTRAL / AMBIGUOUS"}
                              </strong>
                            </div>
                          </div>

                          <p className={`consistency-headline ${headlineModifier}`}>
                            {isMismatch && <AlertTriangle size={15} className="inline-icon" />}
                            {isConsistent && <CheckCircle2 size={15} className="inline-icon" />}
                            <strong>{activeItem.result.consistency?.display_label || "Insufficient Evidence"}</strong>
                          </p>
                          <p className="consistency-explanation">
                            {activeItem.result.consistency?.explanation ||
                              "Acoustic delivery and transcript wording require clear signals in both modalities for cross-modal comparison."}
                          </p>

                          <div className="ethical-guardrail-note">
                            <Info size={14} />
                            <span>
                              <strong>Methodological notice:</strong> Divergence between acoustic inflection and literal phrasing is a natural linguistic occurrence (such as polite restraint, understatement, or conversational nuance). It is never proof of deception, sarcasm, or verified inner emotional truth.
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Audio Playback & Waveform */}
                  <div className="workspace-module waveform-module">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
                      <h3 className="module-title" style={{ margin: 0 }}>Audio Playback & Waveform</h3>
                      {activeItem.processedUrl && (
                        <div className="audio-mode-selector" style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-muted-foreground)", marginRight: "0.25rem" }}>Audio Track:</span>
                          <button
                            type="button"
                            className={`btn sm ${activeItem.playbackMode !== "processed" ? "primary" : "sub"}`}
                            onClick={() => togglePlaybackMode("original")}
                            style={{ padding: "0.2rem 0.55rem", fontSize: "0.75rem" }}
                            title="Play original recording"
                          >
                            <Volume2 size={13} aria-hidden="true" /> Original
                          </button>
                          <button
                            type="button"
                            className={`btn sm ${activeItem.playbackMode === "processed" ? "primary" : "sub"}`}
                            onClick={() => togglePlaybackMode("processed")}
                            style={{ padding: "0.2rem 0.55rem", fontSize: "0.75rem" }}
                            title="Play noise-reduced audio"
                          >
                            <Sparkles size={13} aria-hidden="true" /> Noise-Reduced
                          </button>
                        </div>
                      )}
                    </div>

                    {activeItem.peaks && (
                      <Waveform
                        peaks={activeItem.peaks}
                        currentTime={playbackTime}
                        duration={playbackDuration || activeItem.result.analyzed_seconds}
                        onSeek={handleSeekAndPlay}
                      />
                    )}

                    {activeItem.url && (
                      <audio
                        ref={audioRef}
                        controls
                        src={activeItem.url}
                        style={{ width: "100%", marginTop: "1rem" }}
                        aria-label={activeItem.playbackMode === "processed" ? "Playback of noise-reduced audio" : "Playback of original audio"}
                        onTimeUpdate={(e) => setPlaybackTime(e.currentTarget.currentTime)}
                        onLoadedMetadata={(e) => setPlaybackDuration(e.currentTarget.duration)}
                        onDurationChange={(e) => setPlaybackDuration(e.currentTarget.duration)}
                      />
                    )}
                  </div>
                </div>

                {/* Right Column: Acoustic Scores, Metadata & Actions */}
                <div className="results-col-right">
                  <div className="workspace-module score-module">
                    <h3 className="module-title">Acoustic Model Scores</h3>
                    <ScoreBars scores={activeItem.result.scores} />
                    <p className="hint">
                      Normalized model scores summing to 100% across the six emotions on CREMA-D.
                    </p>
                  </div>

                  <div className="workspace-module metadata-module">
                    <h3 className="module-title">Model and Analysis Metadata</h3>
                    <dl className="meta-grid">
                      <div>
                        <dt>Audio Length</dt>
                        <dd className="mono">{secs(activeItem.result.analyzed_seconds)}</dd>
                      </div>
                      <div>
                        <dt>Processing Time</dt>
                        <dd className="mono">{activeItem.result.processing_ms} ms</dd>
                      </div>
                      <div>
                        <dt>Model</dt>
                        <dd>{activeItem.result.model.name ?? "SVM (RBF, C=3)"}</dd>
                      </div>
                      <div>
                        <dt>Model ID</dt>
                        <dd><code>{activeItem.result.model.id ?? "crema-d-svm"}</code></dd>
                      </div>
                      <div>
                        <dt>Trained Dataset</dt>
                        <dd>CREMA-D (Acted Speech)</dd>
                      </div>
                    </dl>
                  </div>

                  {/* Save Analysis Card */}
                  <div className="workspace-module save-analysis-module">
                    <div className="card-header-flex">
                      <div>
                        <h3 className="module-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Bookmark size={18} className="icon-accent" /> Save to Workspace
                        </h3>
                        <p className="hint" style={{ marginTop: "0.25rem" }}>
                          Store this prediction to your account history to revisit or compare later.
                        </p>
                      </div>
                      {user ? (
                        <button
                          onClick={handleSaveActive}
                          disabled={savingActive || activeItem.saved || saveSuccessActive}
                          className={`btn ${activeItem.saved || saveSuccessActive ? "ok" : "primary"} sm`}
                        >
                          {activeItem.saved || saveSuccessActive ? (
                            <><Check size={14} /> Saved</>
                          ) : savingActive ? (
                            <><span className="spinner light sm" /> Saving...</>
                          ) : (
                            <><Bookmark size={14} /> Save Analysis</>
                          )}
                        </button>
                      ) : (
                        <Link to="/login" className="btn sub sm">
                          <LogIn size={14} /> Sign In
                        </Link>
                      )}
                    </div>
                    {(activeItem.saved || saveSuccessActive) && (
                      <div className="callout ok" role="status" style={{ marginTop: "0.75rem" }}>
                        <CheckCircle2 size={15} />
                        <span>Saved! View in <Link to="/profile" className="auth-link">User History</Link>.</span>
                      </div>
                    )}
                    {saveErrorActive && (
                      <div className="callout warn" role="alert" style={{ marginTop: "0.75rem" }}>
                        <AlertTriangle size={15} />
                        <span>{saveErrorActive}</span>
                      </div>
                    )}
                  </div>

                  {/* Export Reports */}
                  <div className="workspace-module export-module">
                    <h3 className="module-title">Export Findings</h3>
                    <div className="actions" style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      <button className="btn sm primary" onClick={handleExportPdf} disabled={exportingPdf}>
                        {exportingPdf ? <span className="spinner light sm" /> : <Download size={14} aria-hidden="true" />}
                        PDF Report
                      </button>
                      <button className="btn sm sub" onClick={handleExportCsv} disabled={exportingCsv}>
                        {exportingCsv ? <span className="spinner sm" /> : <Download size={14} aria-hidden="true" />}
                        Multi-CSV ZIP
                      </button>
                      <button className="btn sm sub" onClick={() => saveReport("json")}>
                        <Download size={14} aria-hidden="true" /> JSON
                      </button>
                      <button className="btn sm sub" onClick={() => saveReport("csv")}>
                        <Download size={14} aria-hidden="true" /> Single CSV
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Collapsible Analysis Sections: Emotion Visuals & Speaker Analysis (both collapsed by default) */}
              {activeItem.result.speakers && activeItem.result.speakers.length > 0 && (() => {
                const effectiveDur = activeItem.result.recording_duration || activeItem.result.analyzed_seconds || playbackDuration || 1.0;
                const spkCount = activeItem.result.speakers.length;
                return (
                  <div className="collapsible-analysis-sections" style={{ marginTop: "1.5rem" }}>
                    {/* 1. Emotion Visuals Accordion (Collapsed by default) */}
                    <div className={`conv-accordion-panel ${isEmotionVisualsOpen ? "is-open" : ""}`} id="emotion-visuals-section">
                      <button
                        type="button"
                        className="conv-accordion-header"
                        onClick={() => setIsEmotionVisualsOpen(!isEmotionVisualsOpen)}
                        aria-expanded={isEmotionVisualsOpen}
                        aria-controls="emotion-visuals-content"
                      >
                        <div className="conv-accordion-title-group">
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Activity size={18} className="icon-accent" aria-hidden="true" />
                            <h3 className="conv-panel-title" style={{ fontSize: "1.05rem" }}>
                              Emotion Visuals
                            </h3>
                            <span className="conv-badge conv-badge-primary">
                              Emotion Tracks & Emotion Journey
                            </span>
                          </div>
                          <p className="conv-panel-subtitle" style={{ marginLeft: "1.6rem" }}>
                            Continuous 6-class acoustic probability trajectories and dominant temporal journey blocks.
                          </p>
                        </div>
                        <div className="conv-accordion-action">
                          <span className="conv-accordion-action-label">
                            {isEmotionVisualsOpen ? "Hide Visuals" : "View Emotion Visuals"}
                          </span>
                          <ChevronDown className="conv-accordion-chevron" size={18} aria-hidden="true" />
                        </div>
                      </button>

                      {isEmotionVisualsOpen && (
                        <div className="conv-accordion-body" id="emotion-visuals-content">
                          <EmotionVisualizations
                            duration={effectiveDur}
                            tracks={activeItem.result.emotion_tracks || {}}
                            journey={activeItem.result.emotion_journey || []}
                            turns={activeItem.result.conversation_timeline || []}
                            currentTime={playbackTime}
                            onSeek={handleSeekAndPlay}
                            embedded
                          />
                        </div>
                      )}
                    </div>

                    {/* 2. Speaker Analysis Accordion (Collapsed by default) */}
                    <div className={`conv-accordion-panel ${isSpeakerAnalysisOpen ? "is-open" : ""}`} id="speaker-analysis-section">
                      <button
                        type="button"
                        className="conv-accordion-header"
                        onClick={() => setIsSpeakerAnalysisOpen(!isSpeakerAnalysisOpen)}
                        aria-expanded={isSpeakerAnalysisOpen}
                        aria-controls="speaker-analysis-content"
                      >
                        <div className="conv-accordion-title-group">
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Users size={18} className="icon-accent" aria-hidden="true" />
                            <h3 className="conv-panel-title" style={{ fontSize: "1.05rem" }}>
                              Speaker Analysis
                            </h3>
                            <span className="conv-badge conv-badge-primary">
                              {spkCount} {spkCount === 1 ? "Speaker Detected" : "Speakers Detected"}
                            </span>
                          </div>
                          <p className="conv-panel-subtitle" style={{ marginLeft: "1.6rem" }}>
                            Participation share, speaking durations, speech turns, and speaker-specific emotion distributions.
                          </p>
                        </div>
                        <div className="conv-accordion-action">
                          <span className="conv-accordion-action-label">
                            {isSpeakerAnalysisOpen ? "Hide Analysis" : "View Speaker Analysis"}
                          </span>
                          <ChevronDown className="conv-accordion-chevron" size={18} aria-hidden="true" />
                        </div>
                      </button>

                      {isSpeakerAnalysisOpen && (
                        <div className="conv-accordion-body" id="speaker-analysis-content">
                          {/* Multi-speaker speaking turns & overlap timeline */}
                          <ConversationTimeline
                            duration={effectiveDur}
                            speakers={activeItem.result.speakers}
                            turns={activeItem.result.conversation_timeline || []}
                            currentTime={playbackTime}
                            onSeek={handleSeekAndPlay}
                            embedded
                          />

                          {/* Detected speaker profiles, duration, speech share, emotion results */}
                          <SpeakerAnalysisView
                            speakers={activeItem.result.speakers}
                            turns={activeItem.result.conversation_timeline || []}
                            onRenameSpeaker={handleRenameSpeaker}
                            onSeek={handleSeekAndPlay}
                            embedded
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Advanced Panels: Spectrogram & Timeline (Full Width) */}
              {activeItem.source && (
                <div className="workspace-module advanced-module" style={{ marginTop: "1.5rem" }}>
                  <AdvancedPanels
                    source={activeItem.source}
                    modelReady={modelReady}
                    limits={cfg.timeline}
                    timeline={activeItem.timeline || null}
                    onTimeline={(tl) => {
                      setBatch((prev) =>
                        prev.map((b) => (b.id === activeItem.id ? { ...b, timeline: tl } : b))
                      );
                    }}
                  />
                </div>
              )}

              {/* Workspace Footer Actions & Disclaimer */}
              <div className="workspace-footer-row">
                <button className="btn primary" onClick={() => replaceInputRef.current?.click()}>
                  <RefreshCw size={16} aria-hidden="true" /> Upload another file
                </button>
                {user && (
                  <Link className="btn sub" to="/profile">
                    <History size={16} aria-hidden="true" /> View saved history
                  </Link>
                )}
                <Link className="btn sub" to="/evaluation">
                  Model evaluation
                </Link>
              </div>

              <div className="workspace-disclaimer">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>
                  This is an estimate. The model compares acoustic contours against acted speech recordings, so it can be wrong and does not represent verified inner psychological states.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Cross-Modal Mismatch Alert Popup/Modal */}
        <MismatchModal
          isOpen={mismatchModalOpen}
          onClose={handleCloseMismatchModal}
          result={activeItem?.result || null}
          filename={activeItem?.name}
        />
      </section>
    </>
  );
}
