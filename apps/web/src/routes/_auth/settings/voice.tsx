import { Button } from "@myagents/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@myagents/ui/components/card";
import { Label } from "@myagents/ui/components/label";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Check, Download, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  type WhisperModel,
  WHISPER_LANGUAGES,
  WHISPER_MODELS,
  useWhisper,
} from "@/hooks/use-whisper";

export const Route = createFileRoute("/_auth/settings/voice")({
  component: VoiceSettings,
});

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
      // transformers.js uses "transformers-cache" by default
      if (
        cacheName.includes("transformers") ||
        cacheName.includes("huggingface")
      ) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        for (const request of keys) {
          const url = request.url;
          // Extract model name from URL
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
async function clearModelCache(): Promise<void> {
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

function VoiceSettings() {
  const whisper = useWhisper();
  const [cacheSize, setCacheSize] = useState<number>(0);
  const [cachedModels, setCachedModels] = useState<string[]>([]);
  const [isClearing, setIsClearing] = useState(false);

  const refreshCacheInfo = useCallback(async () => {
    const info = await getCachedModelInfo();
    setCacheSize(info.totalSize);
    setCachedModels(info.modelNames);
  }, []);

  useEffect(() => {
    refreshCacheInfo();
  }, [refreshCacheInfo]);

  // Refresh cache info when model loading completes
  useEffect(() => {
    if (!whisper.isModelLoading && whisper.progressItems.length === 0) {
      refreshCacheInfo();
    }
  }, [whisper.isModelLoading, whisper.progressItems.length, refreshCacheInfo]);

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      await clearModelCache();
      await refreshCacheInfo();
      toast.success("Model cache cleared");
    } catch {
      toast.error("Failed to clear cache");
    } finally {
      setIsClearing(false);
    }
  };

  const handleModelChange = (modelId: WhisperModel) => {
    whisper.setModel(modelId);
    toast.success("Model updated. It will be downloaded on next use.");
  };

  const handleLanguageChange = (lang: string) => {
    whisper.setLanguage(lang);
  };

  if (!whisper.isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Voice Input</CardTitle>
          <CardDescription>
            Speech-to-text settings for voice input
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-destructive">Not Supported</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your browser does not support WebGPU or WebAssembly, which are
                required for local speech recognition. Please use a modern
                browser like Chrome, Edge, or Firefox.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedModel = WHISPER_MODELS.find((m) => m.id === whisper.model);
  const isMultilingual = !whisper.model.endsWith(".en");

  return (
    <div className="space-y-6">
      {/* Backend info */}
      <Card>
        <CardHeader>
          <CardTitle>Voice Input</CardTitle>
          <CardDescription>
            Speech-to-text settings for voice input. All audio is processed
            locally on your device — nothing is sent to any server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Compute backend:</span>
            <span className="font-medium">
              {whisper.backend === "webgpu" ? "WebGPU (GPU accelerated)" : "WebAssembly"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Model selection */}
      <Card>
        <CardHeader>
          <CardTitle>Model</CardTitle>
          <CardDescription>
            Choose a Whisper model size. Larger models are more accurate but
            slower to download and run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {WHISPER_MODELS.map((m) => {
            const isDisabled =
              m.requiresWebGPU && whisper.backend !== "webgpu";
            const isCached = cachedModels.includes(m.id);
            const isSelected = whisper.model === m.id;

            return (
              <button
                key={m.id}
                type="button"
                disabled={isDisabled}
                onClick={() => handleModelChange(m.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : isDisabled
                      ? "border-muted bg-muted/30 opacity-50 cursor-not-allowed"
                      : "border-border hover:border-primary/50 hover:bg-accent/50 cursor-pointer"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isSelected && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                    <span className="font-medium">{m.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCached && (
                      <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        Cached
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {m.size}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {m.description}
                  {isDisabled && " (requires WebGPU)"}
                </p>
              </button>
            );
          })}

          {/* Download progress */}
          {whisper.progressItems.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                Downloading model...
              </div>
              {whisper.progressItems.map((item) => (
                <div key={item.file} className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="truncate max-w-[200px]">{item.file}</span>
                    <span>{Math.round(item.progress)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Language selection */}
      <Card>
        <CardHeader>
          <CardTitle>Language</CardTitle>
          <CardDescription>
            {isMultilingual
              ? "Select the language for speech recognition."
              : `The selected model (${selectedModel?.label}) only supports English. Choose a multilingual model to enable other languages.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="whisper-language">Language</Label>
            <select
              id="whisper-language"
              disabled={!isMultilingual}
              value={whisper.language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {WHISPER_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
            {!isMultilingual && (
              <p className="text-xs text-muted-foreground">
                Switch to a multilingual model to select a different language.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cache management */}
      <Card>
        <CardHeader>
          <CardTitle>Cache</CardTitle>
          <CardDescription>
            Models are cached in your browser so they only need to be downloaded
            once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm">
                <span className="text-muted-foreground">Cache size: </span>
                <span className="font-medium">{formatBytes(cacheSize)}</span>
              </p>
              {cachedModels.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {cachedModels.length} model{cachedModels.length !== 1 && "s"}{" "}
                  cached
                </p>
              )}
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={cacheSize === 0 || isClearing}
              onClick={handleClearCache}
            >
              {isClearing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Clear Cache
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
