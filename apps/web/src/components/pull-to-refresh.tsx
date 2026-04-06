import { Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

const THRESHOLD = 80;
const MAX_PULL = 128;

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [refreshing, setRefreshing] = useState(false);
  const pullDistanceRef = useRef(0);
  const touchStartY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<SVGSVGElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container || container.scrollTop > 0 || refreshing) return;
    touchStartY.current = e.touches[0].clientY;
    pulling.current = true;
  }, [refreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta < 0) {
      pulling.current = false;
      pullDistanceRef.current = 0;
      if (indicatorRef.current) indicatorRef.current.style.height = "0px";
      if (spinnerRef.current) {
        spinnerRef.current.style.opacity = "0";
        spinnerRef.current.style.transform = "rotate(0deg)";
      }
      return;
    }
    // Dampen the pull distance
    const dampened = Math.min(delta * 0.5, MAX_PULL);
    pullDistanceRef.current = dampened;
    const indicator = indicatorRef.current;
    const spinner = spinnerRef.current;
    if (indicator) {
      indicator.style.height = `${dampened}px`;
    }
    if (spinner) {
      const progress = Math.min(dampened / THRESHOLD, 1);
      spinner.style.opacity = String(progress);
      spinner.style.transform = `rotate(${progress * 360}deg)`;
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current && pullDistanceRef.current === 0) return;
    pulling.current = false;

    if (pullDistanceRef.current >= THRESHOLD) {
      setRefreshing(true);
      pullDistanceRef.current = THRESHOLD / 2;
      if (indicatorRef.current) indicatorRef.current.style.height = `${THRESHOLD / 2}px`;
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        pullDistanceRef.current = 0;
        if (indicatorRef.current) indicatorRef.current.style.height = "0px";
      }
    } else {
      pullDistanceRef.current = 0;
      if (indicatorRef.current) indicatorRef.current.style.height = "0px";
      if (spinnerRef.current) {
        spinnerRef.current.style.opacity = "0";
        spinnerRef.current.style.transform = "rotate(0deg)";
      }
    }
  }, [onRefresh]);

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        ref={indicatorRef}
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{
          height: 0,
          transitionDuration: pulling.current ? "0ms" : "200ms",
        }}
      >
        <Loader2
          ref={spinnerRef}
          className="h-5 w-5 text-muted-foreground"
          style={{
            opacity: 0,
            transform: "rotate(0deg)",
            animation: refreshing ? "spin 0.8s linear infinite" : "none",
          }}
        />
      </div>
      {children}
    </div>
  );
}
