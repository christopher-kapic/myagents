import { useCallback, useEffect, useRef, useState } from "react";

import { useWhisper } from "./use-whisper";

// ── Types ───────────────────────────────────────────────────────────────────

export type RecordingMode = "idle" | "recording" | "processing";

export interface UseVoiceRecordingReturn {
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
  /** Whether voice input is supported */
  isSupported: boolean;
  /** Whether the whisper model is loading */
  isModelLoading: boolean;
  /** Model download progress items */
  progressItems: { file: string; progress: number }[];
  /** Audio level (0-1) for visual feedback during recording */
  audioLevel: number;
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

// ── Hook ────────────────────────────────────────────────────────────────────

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const whisper = useWhisper();
  const [mode, setMode] = useState<RecordingMode>("idle");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  const isSupported =
    whisper.isSupported && typeof navigator.mediaDevices?.getUserMedia === "function";

  // Watch whisper output for completed transcription
  useEffect(() => {
    if (whisper.output && mode === "processing") {
      const text = whisper.output.text.trim();
      if (text) {
        setTranscript(text);
      }
      setMode("idle");
    }
  }, [whisper.output, mode]);

  // Watch whisper errors
  useEffect(() => {
    if (whisper.error && mode === "processing") {
      setError(whisper.error);
      setMode("idle");
    }
  }, [whisper.error, mode]);

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
    // Average amplitude normalized to 0-1
    const avg = data.reduce((sum, v) => sum + v, 0) / data.length / 255;
    setAudioLevel(avg);
    animFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }, []);

  const startRecording = useCallback(async () => {
    if (mode !== "idle") return;
    setError(null);
    setTranscript(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      // Set up audio analyser for visual feedback
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start level monitoring
      updateAudioLevel();

      // Set up MediaRecorder
      const recorder = new MediaRecorder(stream, { mimeType: AUDIO_MIME });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Clean up stream and analyser
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
          // Too short, likely accidental
          setMode("idle");
          return;
        }

        setMode("processing");
        try {
          await whisper.transcribeBlob(blob);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed");
          setMode("idle");
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250); // collect chunks every 250ms
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
  }, [mode, whisper, updateAudioLevel]);

  const stopRecording = useCallback(() => {
    if (mode !== "recording" || !mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
  }, [mode]);

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

  return {
    mode,
    isRecording: mode === "recording",
    isProcessing: mode === "processing",
    transcript,
    error,
    isSupported,
    isModelLoading: whisper.isModelLoading,
    progressItems: whisper.progressItems,
    audioLevel,
    startRecording,
    stopRecording,
    toggleRecording,
    reset,
  };
}
