import { useCallback, useMemo, useRef, useState } from "react";

// ── Types ───────────────────────────────────────────────────────────────────

export interface WhisperProgressItem {
  file: string;
  loaded: number;
  progress: number;
  total: number;
  name: string;
  status: string;
}

export interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
}

export interface WhisperTranscript {
  text: string;
  chunks: WhisperChunk[];
  tps?: number;
}

export type WhisperModel =
  | "onnx-community/whisper-tiny"
  | "onnx-community/whisper-tiny.en"
  | "onnx-community/whisper-base"
  | "onnx-community/whisper-base.en"
  | "onnx-community/whisper-small"
  | "onnx-community/whisper-small.en"
  | "onnx-community/whisper-large-v3-turbo";

export type WhisperBackend = "webgpu" | "wasm" | "none";

export interface UseWhisperOptions {
  model?: WhisperModel;
  language?: string;
}

export interface UseWhisperReturn {
  /** Whether the worker is currently transcribing */
  isBusy: boolean;
  /** Whether the model is being downloaded/loaded */
  isModelLoading: boolean;
  /** Download progress items for model files */
  progressItems: WhisperProgressItem[];
  /** Latest transcription output */
  output: WhisperTranscript | null;
  /** Error message if something went wrong */
  error: string | null;
  /** Which compute backend is available */
  backend: WhisperBackend;
  /** Whether whisper is supported (WebGPU or WASM) */
  isSupported: boolean;
  /** Current model */
  model: WhisperModel;
  /** Change model */
  setModel: (model: WhisperModel) => void;
  /** Current language */
  language: string;
  /** Change language */
  setLanguage: (language: string) => void;
  /** Start transcription from an AudioBuffer */
  transcribe: (audioBuffer: AudioBuffer) => void;
  /** Start transcription from a Blob (e.g., from MediaRecorder) */
  transcribeBlob: (blob: Blob) => Promise<void>;
}

// ── Constants ───────────────────────────────────────────────────────────────

const SAMPLING_RATE = 16000;
const DEFAULT_MODEL: WhisperModel = "onnx-community/whisper-base.en";

function detectBackend(): WhisperBackend {
  if (typeof navigator === "undefined") return "none";
  if ("gpu" in navigator) return "webgpu";
  // WASM is available in all modern browsers
  if (typeof WebAssembly !== "undefined") return "wasm";
  return "none";
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useWhisper(options?: UseWhisperOptions): UseWhisperReturn {
  const [model, setModel] = useState<WhisperModel>(
    options?.model ?? DEFAULT_MODEL,
  );
  const [language, setLanguage] = useState(options?.language ?? "en");
  const [isBusy, setIsBusy] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [progressItems, setProgressItems] = useState<WhisperProgressItem[]>([]);
  const [output, setOutput] = useState<WhisperTranscript | null>(null);
  const [error, setError] = useState<string | null>(null);

  const backend = useMemo(detectBackend, []);
  const isSupported = backend !== "none";

  // Create worker lazily and keep it for the lifetime of the hook
  const workerRef = useRef<Worker | null>(null);

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(
      new URL("../workers/whisper.worker.js", import.meta.url),
      { type: "module" },
    );
    worker.addEventListener("message", (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.status) {
        case "progress":
          setProgressItems((prev) =>
            prev.map((item) =>
              item.file === msg.file
                ? { ...item, progress: msg.progress }
                : item,
            ),
          );
          break;
        case "initiate":
          setIsModelLoading(true);
          setProgressItems((prev) => [...prev, msg]);
          break;
        case "ready":
          setIsModelLoading(false);
          break;
        case "done":
          setProgressItems((prev) =>
            prev.filter((item) => item.file !== msg.file),
          );
          break;
        case "update": {
          const chunks: WhisperChunk[] = (msg.data.chunks ?? []).map(
            (c: Record<string, unknown>) => ({
              text: String(c.text ?? ""),
              timestamp: c.timestamp as [number, number | null],
            }),
          );
          setOutput({
            text: chunks.map((c) => c.text).join(""),
            chunks,
            tps: msg.data.tps,
          });
          break;
        }
        case "complete": {
          const chunks: WhisperChunk[] = (msg.data?.chunks ?? []).map(
            (c: Record<string, unknown>) => ({
              text: String(c.text ?? ""),
              timestamp: c.timestamp as [number, number | null],
            }),
          );
          const text =
            typeof msg.data?.text === "string"
              ? msg.data.text
              : chunks.map((c) => c.text).join("");
          setOutput({ text, chunks, tps: msg.data?.tps });
          setIsBusy(false);
          break;
        }
        case "error":
          setError(
            msg.data?.message ??
              (typeof msg.data === "string" ? msg.data : "Transcription failed"),
          );
          setIsBusy(false);
          break;
      }
    });
    workerRef.current = worker;
    return worker;
  }, []);

  const transcribe = useCallback(
    (audioBuffer: AudioBuffer) => {
      if (!isSupported) {
        setError("Speech recognition is not supported on this device");
        return;
      }

      setOutput(null);
      setError(null);
      setIsBusy(true);

      // Convert AudioBuffer to mono Float32Array at the expected sample rate
      let audio: Float32Array;
      if (audioBuffer.numberOfChannels === 2) {
        const SCALING_FACTOR = Math.sqrt(2);
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        audio = new Float32Array(left.length);
        for (let i = 0; i < left.length; i++) {
          audio[i] = (SCALING_FACTOR * (left[i] + right[i])) / 2;
        }
      } else {
        audio = audioBuffer.getChannelData(0);
      }

      const isMultilingual = !model.endsWith(".en");

      const worker = getWorker();
      worker.postMessage({
        audio,
        model,
        multilingual: isMultilingual,
        subtask: isMultilingual ? "transcribe" : null,
        language: isMultilingual && language !== "auto" ? language : null,
      });
    },
    [isSupported, model, language, getWorker],
  );

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new AudioContext({ sampleRate: SAMPLING_RATE });
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();
      transcribe(audioBuffer);
    },
    [transcribe],
  );

  return useMemo(
    () => ({
      isBusy,
      isModelLoading,
      progressItems,
      output,
      error,
      backend,
      isSupported,
      model,
      setModel,
      language,
      setLanguage,
      transcribe,
      transcribeBlob,
    }),
    [
      isBusy,
      isModelLoading,
      progressItems,
      output,
      error,
      backend,
      isSupported,
      model,
      language,
      transcribe,
      transcribeBlob,
    ],
  );
}
