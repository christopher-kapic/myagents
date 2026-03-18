import { Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

const THRESHOLD = 80;
const MAX_PULL = 128;

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
      setPullDistance(0);
      return;
    }
    // Dampen the pull distance
    const dampened = Math.min(delta * 0.5, MAX_PULL);
    setPullDistance(dampened);
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current && pullDistance === 0) return;
    pulling.current = false;

    if (pullDistance >= THRESHOLD) {
      setRefreshing(true);
      setPullDistance(THRESHOLD / 2);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, onRefresh]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);

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
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{
          height: pullDistance > 0 || refreshing ? `${pullDistance}px` : 0,
          transitionDuration: pulling.current ? "0ms" : "200ms",
        }}
      >
        <Loader2
          className="h-5 w-5 text-muted-foreground"
          style={{
            opacity: progress,
            transform: `rotate(${progress * 360}deg)`,
            animation: refreshing ? "spin 0.8s linear infinite" : "none",
          }}
        />
      </div>
      {children}
    </div>
  );
}
