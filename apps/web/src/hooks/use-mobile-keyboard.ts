import { useEffect, useRef, useState } from "react";

/**
 * Detects when a virtual keyboard is likely open on mobile devices.
 * Uses input focus tracking combined with visualViewport size changes.
 *
 * iOS PWA quirks handled:
 * - window.innerHeight doesn't change when the keyboard opens in standalone mode,
 *   so we capture the initial visualViewport height on mount as the baseline.
 * - iOS fires "scroll" events (not just "resize") on visualViewport when the
 *   keyboard opens, so we listen to both.
 */
const MD_BREAKPOINT = 768;

export function useMobileKeyboard() {
  const [inputFocused, setInputFocused] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const initialHeight = useRef(0);

  useEffect(() => {
    const isEditable = (el: HTMLElement) => {
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        el.isContentEditable ||
        el.getAttribute("role") === "textbox"
      );
    };

    const onFocusIn = (e: FocusEvent) => {
      if (
        window.innerWidth < MD_BREAKPOINT &&
        e.target instanceof HTMLElement &&
        isEditable(e.target)
      ) {
        setInputFocused(true);
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && isEditable(e.target)) {
        setInputFocused(false);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    // Capture baseline height before any keyboard opens.
    // On iOS standalone mode, window.innerHeight stays constant,
    // so we use the initial visualViewport height instead.
    initialHeight.current = vv.height;

    const check = () => {
      const baseline = initialHeight.current || window.innerHeight;
      // Keyboard is open when viewport shrinks by >20% from baseline
      setKeyboardOpen(vv.height < baseline * 0.8);
    };

    // iOS fires "scroll" on visualViewport when keyboard opens;
    // Android/desktop fires "resize". Listen to both.
    vv.addEventListener("resize", check);
    vv.addEventListener("scroll", check);
    return () => {
      vv.removeEventListener("resize", check);
      vv.removeEventListener("scroll", check);
    };
  }, []);

  return inputFocused || keyboardOpen;
}
