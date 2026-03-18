import { useCallback, useRef, useState } from "react";

// ── Types ───────────────────────────────────────────────────────────────────

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

export interface UseWebSpeechReturn {
  /** Whether the browser supports SpeechRecognition */
  isSupported: boolean;
  /** Whether currently listening */
  isListening: boolean;
  /** Interim transcript (updates in real-time) */
  interimTranscript: string;
  /** Final transcript after recognition completes */
  transcript: string | null;
  /** Error message */
  error: string | null;
  /** Start listening */
  start: (language?: string) => void;
  /** Stop listening */
  stop: () => void;
  /** Clear transcript and error */
  reset: () => void;
}

// ── Detection ───────────────────────────────────────────────────────────────

/** Minimal interface for the browser SpeechRecognition API */
interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: BrowserSpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: BrowserSpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: BrowserSpeechRecognition, ev: Event) => void) | null;
  onend: ((this: BrowserSpeechRecognition, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function getSpeechRecognitionConstructor(): (new () => BrowserSpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => BrowserSpeechRecognition)
    | null;
}

export function isWebSpeechSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useWebSpeech(): UseWebSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const isSupported = getSpeechRecognitionConstructor() !== null;

  const start = useCallback(
    (language?: string) => {
      const Ctor = getSpeechRecognitionConstructor();
      if (!Ctor) {
        setError("Web Speech API is not supported in this browser");
        return;
      }

      // Stop any existing session
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }

      setError(null);
      setTranscript(null);
      setInterimTranscript("");

      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language ?? "en-US";

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: Event) => {
        const e = event as unknown as SpeechRecognitionEvent;
        let interim = "";
        let final = "";

        for (let i = 0; i < e.results.length; i++) {
          const result = e.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        setInterimTranscript(interim);
        if (final) {
          setTranscript(final.trim());
        }
      };

      recognition.onerror = (event: Event) => {
        const e = event as unknown as SpeechRecognitionErrorEvent;
        // "no-speech" and "aborted" are not real errors
        if (e.error === "no-speech" || e.error === "aborted") return;
        const msg =
          e.error === "not-allowed"
            ? "Microphone access denied. Please allow microphone access in your browser settings."
            : `Speech recognition error: ${e.error}`;
        setError(msg);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
      };

      recognitionRef.current = recognition;
      recognition.start();
    },
    [],
  );

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript(null);
    setError(null);
    setInterimTranscript("");
  }, []);

  return {
    isSupported,
    isListening,
    interimTranscript,
    transcript,
    error,
    start,
    stop,
    reset,
  };
}
