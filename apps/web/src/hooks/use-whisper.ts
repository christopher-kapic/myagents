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
const STORAGE_KEY_MODEL = "whisper-model";
const STORAGE_KEY_LANGUAGE = "whisper-language";

/** Read persisted whisper model from localStorage */
export function getStoredWhisperModel(): WhisperModel {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_MODEL);
    if (stored && WHISPER_MODELS.some((m) => m.id === stored)) {
      return stored as WhisperModel;
    }
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_MODEL;
}

/** Read persisted whisper language from localStorage */
export function getStoredWhisperLanguage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_LANGUAGE) ?? "en";
  } catch {
    return "en";
  }
}

/** Persist whisper model to localStorage */
export function storeWhisperModel(model: WhisperModel): void {
  try {
    localStorage.setItem(STORAGE_KEY_MODEL, model);
  } catch {
    // localStorage unavailable
  }
}

/** Persist whisper language to localStorage */
export function storeWhisperLanguage(language: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_LANGUAGE, language);
  } catch {
    // localStorage unavailable
  }
}

/** Available whisper models with metadata */
export const WHISPER_MODELS: {
  id: WhisperModel;
  label: string;
  size: string;
  description: string;
  requiresWebGPU?: boolean;
  englishOnly?: boolean;
}[] = [
  {
    id: "onnx-community/whisper-tiny",
    label: "Tiny (multilingual)",
    size: "~40 MB",
    description: "Fastest, lower accuracy",
  },
  {
    id: "onnx-community/whisper-tiny.en",
    label: "Tiny (English)",
    size: "~40 MB",
    description: "Fastest, English only",
    englishOnly: true,
  },
  {
    id: "onnx-community/whisper-base",
    label: "Base (multilingual)",
    size: "~75 MB",
    description: "Good balance of speed and accuracy",
  },
  {
    id: "onnx-community/whisper-base.en",
    label: "Base (English)",
    size: "~75 MB",
    description: "Recommended for English",
    englishOnly: true,
  },
  {
    id: "onnx-community/whisper-small",
    label: "Small (multilingual)",
    size: "~250 MB",
    description: "Better accuracy, slower",
  },
  {
    id: "onnx-community/whisper-small.en",
    label: "Small (English)",
    size: "~250 MB",
    description: "Best accuracy for English",
    englishOnly: true,
  },
  {
    id: "onnx-community/whisper-large-v3-turbo",
    label: "Large V3 Turbo",
    size: "~800 MB",
    description: "Highest accuracy, requires WebGPU",
    requiresWebGPU: true,
  },
];

/** Common languages supported by Whisper */
export const WHISPER_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh", label: "Chinese" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "ru", label: "Russian" },
  { code: "ko", label: "Korean" },
  { code: "fr", label: "French" },
  { code: "ja", label: "Japanese" },
  { code: "pt", label: "Portuguese" },
  { code: "tr", label: "Turkish" },
  { code: "pl", label: "Polish" },
  { code: "ca", label: "Catalan" },
  { code: "nl", label: "Dutch" },
  { code: "ar", label: "Arabic" },
  { code: "sv", label: "Swedish" },
  { code: "it", label: "Italian" },
  { code: "id", label: "Indonesian" },
  { code: "hi", label: "Hindi" },
  { code: "fi", label: "Finnish" },
  { code: "vi", label: "Vietnamese" },
  { code: "he", label: "Hebrew" },
  { code: "uk", label: "Ukrainian" },
  { code: "el", label: "Greek" },
  { code: "ms", label: "Malay" },
  { code: "cs", label: "Czech" },
  { code: "ro", label: "Romanian" },
  { code: "da", label: "Danish" },
  { code: "hu", label: "Hungarian" },
  { code: "ta", label: "Tamil" },
  { code: "no", label: "Norwegian" },
  { code: "th", label: "Thai" },
  { code: "ur", label: "Urdu" },
  { code: "hr", label: "Croatian" },
  { code: "bg", label: "Bulgarian" },
  { code: "lt", label: "Lithuanian" },
  { code: "la", label: "Latin" },
  { code: "mi", label: "Maori" },
  { code: "ml", label: "Malayalam" },
  { code: "cy", label: "Welsh" },
  { code: "sk", label: "Slovak" },
  { code: "te", label: "Telugu" },
  { code: "fa", label: "Persian" },
  { code: "lv", label: "Latvian" },
  { code: "bn", label: "Bengali" },
  { code: "sr", label: "Serbian" },
  { code: "az", label: "Azerbaijani" },
  { code: "sl", label: "Slovenian" },
  { code: "kn", label: "Kannada" },
  { code: "et", label: "Estonian" },
  { code: "mk", label: "Macedonian" },
  { code: "br", label: "Breton" },
  { code: "eu", label: "Basque" },
  { code: "is", label: "Icelandic" },
  { code: "hy", label: "Armenian" },
  { code: "ne", label: "Nepali" },
  { code: "mn", label: "Mongolian" },
  { code: "bs", label: "Bosnian" },
  { code: "kk", label: "Kazakh" },
  { code: "sq", label: "Albanian" },
  { code: "sw", label: "Swahili" },
  { code: "gl", label: "Galician" },
  { code: "mr", label: "Marathi" },
  { code: "pa", label: "Punjabi" },
  { code: "si", label: "Sinhala" },
  { code: "km", label: "Khmer" },
  { code: "sn", label: "Shona" },
  { code: "yo", label: "Yoruba" },
  { code: "so", label: "Somali" },
  { code: "af", label: "Afrikaans" },
  { code: "ka", label: "Georgian" },
  { code: "be", label: "Belarusian" },
  { code: "tg", label: "Tajik" },
  { code: "sd", label: "Sindhi" },
  { code: "gu", label: "Gujarati" },
  { code: "am", label: "Amharic" },
  { code: "yi", label: "Yiddish" },
  { code: "lo", label: "Lao" },
  { code: "uz", label: "Uzbek" },
  { code: "fo", label: "Faroese" },
  { code: "ht", label: "Haitian Creole" },
  { code: "ps", label: "Pashto" },
  { code: "tk", label: "Turkmen" },
  { code: "nn", label: "Nynorsk" },
  { code: "mt", label: "Maltese" },
  { code: "sa", label: "Sanskrit" },
  { code: "lb", label: "Luxembourgish" },
  { code: "my", label: "Myanmar" },
  { code: "bo", label: "Tibetan" },
  { code: "tl", label: "Tagalog" },
  { code: "mg", label: "Malagasy" },
  { code: "as", label: "Assamese" },
  { code: "tt", label: "Tatar" },
  { code: "haw", label: "Hawaiian" },
  { code: "ln", label: "Lingala" },
  { code: "ha", label: "Hausa" },
  { code: "ba", label: "Bashkir" },
  { code: "jw", label: "Javanese" },
  { code: "su", label: "Sundanese" },
];

function detectBackend(): WhisperBackend {
  if (typeof navigator === "undefined") return "none";
  if ("gpu" in navigator) return "webgpu";
  // WASM is available in all modern browsers
  if (typeof WebAssembly !== "undefined") return "wasm";
  return "none";
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useWhisper(options?: UseWhisperOptions): UseWhisperReturn {
  const [model, setModelState] = useState<WhisperModel>(
    options?.model ?? getStoredWhisperModel(),
  );
  const [language, setLanguageState] = useState(
    options?.language ?? getStoredWhisperLanguage(),
  );

  const setModel = useCallback((m: WhisperModel) => {
    setModelState(m);
    storeWhisperModel(m);
  }, []);

  const setLanguage = useCallback((l: string) => {
    setLanguageState(l);
    storeWhisperLanguage(l);
  }, []);
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
