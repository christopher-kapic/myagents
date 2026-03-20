import { useCallback, useEffect, useState } from "react";

import { WHISPER_MODELS } from "./use-whisper";

/** Check the Cache API for cached model files */
async function getCachedModelInfo(): Promise<{
  totalSize: number;
  modelNames: string[];
}> {
  try {
    const cacheNames = await caches.keys();
    let totalSize = 0;
    const modelNames = new Set<string>();

    for (const cacheName of cacheNames) {
      if (
        cacheName.includes("transformers") ||
        cacheName.includes("huggingface")
      ) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        for (const request of keys) {
          const url = request.url;
          for (const m of WHISPER_MODELS) {
            if (url.includes(m.id.replace("onnx-community/", ""))) {
              modelNames.add(m.id);
            }
          }
          const response = await cache.match(request);
          if (response) {
            const blob = await response.clone().blob();
            totalSize += blob.size;
          }
        }
      }
    }

    return { totalSize, modelNames: Array.from(modelNames) };
  } catch {
    return { totalSize: 0, modelNames: [] };
  }
}

/** Clear cached model files */
export async function clearModelCache(): Promise<void> {
  const cacheNames = await caches.keys();
  for (const cacheName of cacheNames) {
    if (
      cacheName.includes("transformers") ||
      cacheName.includes("huggingface")
    ) {
      await caches.delete(cacheName);
    }
  }
}

/**
 * Manages whisper model cache info. Fetches on mount and re-fetches
 * when model loading completes.
 */
export function useCachedModelInfo(isModelLoading: boolean, progressCount: number) {
  const [cacheSize, setCacheSize] = useState(0);
  const [cachedModels, setCachedModels] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const info = await getCachedModelInfo();
    setCacheSize(info.totalSize);
    setCachedModels(info.modelNames);
  }, []);

  // Fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-fetch when model loading finishes
  useEffect(() => {
    if (!isModelLoading && progressCount === 0) {
      refresh();
    }
  }, [isModelLoading, progressCount, refresh]);

  return { cacheSize, cachedModels, refresh };
}
