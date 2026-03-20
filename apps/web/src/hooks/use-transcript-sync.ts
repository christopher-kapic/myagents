import { useEffect, type RefObject } from "react";

/**
 * Appends voice transcript text to an input value and focuses the textarea.
 */
export function useTranscriptSync(
  transcript: string | null,
  resetTranscript: () => void,
  setInputValue: React.Dispatch<React.SetStateAction<string>>,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
) {
  useEffect(() => {
    if (transcript) {
      setInputValue((prev) => {
        const separator = prev.trim() ? " " : "";
        return prev + separator + transcript;
      });
      resetTranscript();
      textareaRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);
}
