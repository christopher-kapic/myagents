import { useCallback, useEffect, useRef, useState } from "react";

import { useWebSpeech, isWebSpeechSupported } from "./use-web-speech";
import { useWhisper, type SpeechEngine, getStoredSpeechEngine, storeSpeechEngine } from "./use-whisper";

// ── Types ───────────────────────────────────────────────────────────────────

type RecordingMode = "idle" | "recording" | "processing";

interface UseVoiceRecordingReturn {
  /** Current recording state */
  mode: RecordingMode;
  /** Whether currently recording audio */
  isRecording: boolean;
  /** Whether transcription is in progress */
  isProcessing: boolean;
  /** Transcribed text from latest recording */
  transcript: string | null;
  /** Error message if something went wrong */
  error: string | null;
  /** Whether voice input is supported (at least one backend available) */
  isSupported: boolean;
  /** Whether the whisper model is loading */
  isModelLoading: boolean;
  /** Model download progress items */
  progressItems: { file: string; progress: number }[];
  /** Audio level (0-1) for visual feedback during recording */
  audioLevel: number;
  /** Current speech engine */
  engine: SpeechEngine;
  /** Change speech engine */
  setEngine: (engine: SpeechEngine) => void;
  /** Whether Whisper backend is available */
  whisperSupported: boolean;
  /** Whether Web Speech API is available */
  webSpeechSupported: boolean;
  /** Whether auto-detect has suggested switching to Web Speech API */
  suggestWebSpeech: boolean;
  /** Dismiss the suggestion */
  dismissSuggestion: () => void;
  /** Start recording (toggle mode) */
  startRecording: () => void;
  /** Stop recording and transcribe */
  stopRecording: () => void;
  /** Toggle recording on/off */
  toggleRecording: () => void;
  /** Clear transcript and error */
  reset: () => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const AUDIO_MIME = MediaRecorder.isTypeSupported?.("audio/webm;codecs=opus")
  ? "audio/webm;codecs=opus"
  : "audio/webm";

/** If Whisper transcription takes longer than this (ms), suggest Web Speech API */
const SLOW_WHISPER_THRESHOLD_MS = 15000;

// ── Hook ────────────────────────────────────────────────────────────────────

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const whisper = useWhisper();
  const webSpeech = useWebSpeech();
  const [engine, setEngineState] = useState<SpeechEngine>(getStoredSpeechEngine);
  const [mode, setMode] = useState<RecordingMode>("idle");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [suggestWebSpeech, setSuggestWebSpeech] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const whisperStartTimeRef = useRef<number>(0);

  const webSpeechAvailable = isWebSpeechSupported();
  const whisperAvailable = whisper.isSupported;
  const hasMic = typeof navigator.mediaDevices?.getUserMedia === "function";
  const isSupported = hasMic && (whisperAvailable || webSpeechAvailable);

  const setEngine = useCallback((e: SpeechEngine) => {
    setEngineState(e);
    storeSpeechEngine(e);
  }, []);

  // If the selected engine isn't supported, fall back
  const effectiveEngine: SpeechEngine =
    engine === "whisper" && !whisperAvailable && webSpeechAvailable
      ? "web-speech"
      : engine === "web-speech" && !webSpeechAvailable && whisperAvailable
        ? "whisper"
        : engine;

  // ── Whisper backend: watch output ──────────────────────────────────────
  // Only transition out of "processing" when the worker is done (isBusy=false).
  // The worker sends "update" events with partial text (isBusy still true) and
  // "complete" when finished (isBusy=false). Without the isBusy check, an early
  // "update" with empty text would set mode to "idle", causing the final
  // "complete" result to be ignored.
  useEffect(() => {
    if (effectiveEngine !== "whisper") return;
    if (whisper.output && !whisper.isBusy && mode === "processing") {
      const text = whisper.output.text.trim();
      if (text) {
        setTranscript(text);
      }
      // Check if whisper was slow and suggest Web Speech API
      if (whisperStartTimeRef.current > 0 && webSpeechAvailable) {
        const elapsed = Date.now() - whisperStartTimeRef.current;
        if (elapsed > SLOW_WHISPER_THRESHOLD_MS) {
          setSuggestWebSpeech(true);
        }
      }
      whisperStartTimeRef.current = 0;
      setMode("idle");
    }
  }, [whisper.output, whisper.isBusy, mode, effectiveEngine, webSpeechAvailable]);

  // Watch whisper errors
  useEffect(() => {
    if (effectiveEngine !== "whisper") return;
    if (whisper.error && mode === "processing") {
      setError(whisper.error);
      setMode("idle");
      whisperStartTimeRef.current = 0;
    }
  }, [whisper.error, mode, effectiveEngine]);

  // ── Web Speech backend: watch transcript ───────────────────────────────
  useEffect(() => {
    if (effectiveEngine !== "web-speech") return;
    if (webSpeech.transcript) {
      setTranscript(webSpeech.transcript);
      webSpeech.reset();
      setMode("idle");
    }
  }, [effectiveEngine, webSpeech.transcript]);

  useEffect(() => {
    if (effectiveEngine !== "web-speech") return;
    if (webSpeech.error) {
      setError(webSpeech.error);
      webSpeech.reset();
      setMode("idle");
    }
  }, [effectiveEngine, webSpeech.error]);

  // When Web Speech stops listening, transition out of recording
  useEffect(() => {
    if (effectiveEngine !== "web-speech") return;
    if (!webSpeech.isListening && mode === "recording") {
      setMode("idle");
    }
  }, [effectiveEngine, webSpeech.isListening, mode]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const avg = data.reduce((sum, v) => sum + v, 0) / data.length / 255;
    setAudioLevel(avg);
    animFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }, []);

  const startRecording = useCallback(async () => {
    if (mode !== "idle") return;
    setError(null);
    setTranscript(null);

    if (effectiveEngine === "web-speech") {
      // Web Speech API: start recognition directly (it handles mic access)
      setMode("recording");
      const lang = whisper.language === "en" ? "en-US" : whisper.language;
      webSpeech.start(lang);

      // Still capture mic for audio level visualization
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        streamRef.current = stream;
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        updateAudioLevel();
      } catch {
        // Audio level visualization is optional
      }
      return;
    }

    // Whisper backend: record audio then transcribe
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      updateAudioLevel();

      const recorder = new MediaRecorder(stream, { mimeType: AUDIO_MIME });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        cancelAnimationFrame(animFrameRef.current);
        setAudioLevel(0);
        for (const track of stream.getTracks()) {
          track.stop();
        }
        analyserRef.current = null;
        await audioCtx.close();

        if (chunksRef.current.length === 0) {
          setMode("idle");
          return;
        }

        const blob = new Blob(chunksRef.current, { type: AUDIO_MIME });
        chunksRef.current = [];

        if (blob.size < 1000) {
          setMode("idle");
          return;
        }

        setMode("processing");
        whisperStartTimeRef.current = Date.now();
        try {
          await whisper.transcribeBlob(blob);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed");
          setMode("idle");
          whisperStartTimeRef.current = 0;
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setMode("recording");
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access denied. Please allow microphone access in your browser settings."
          : err instanceof Error
            ? err.message
            : "Failed to start recording";
      setError(msg);
    }
  }, [mode, effectiveEngine, whisper, webSpeech, updateAudioLevel]);

  const stopRecording = useCallback(() => {
    if (mode !== "recording") return;

    if (effectiveEngine === "web-speech") {
      webSpeech.stop();
      // Clean up audio level stream
      cancelAnimationFrame(animFrameRef.current);
      setAudioLevel(0);
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
      analyserRef.current = null;
      return;
    }

    // Whisper backend
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, [mode, effectiveEngine, webSpeech]);

  const toggleRecording = useCallback(() => {
    if (mode === "recording") {
      stopRecording();
    } else if (mode === "idle") {
      startRecording();
    }
  }, [mode, startRecording, stopRecording]);

  const reset = useCallback(() => {
    setTranscript(null);
    setError(null);
  }, []);

  const dismissSuggestion = useCallback(() => {
    setSuggestWebSpeech(false);
  }, []);

  return {
    mode,
    isRecording: mode === "recording",
    isProcessing: mode === "processing",
    transcript,
    error,
    isSupported,
    isModelLoading: effectiveEngine === "whisper" ? whisper.isModelLoading : false,
    progressItems: effectiveEngine === "whisper" ? whisper.progressItems : [],
    audioLevel,
    engine: effectiveEngine,
    setEngine,
    whisperSupported: whisperAvailable,
    webSpeechSupported: webSpeechAvailable,
    suggestWebSpeech,
    dismissSuggestion,
    startRecording,
    stopRecording,
    toggleRecording,
    reset,
  };
}
