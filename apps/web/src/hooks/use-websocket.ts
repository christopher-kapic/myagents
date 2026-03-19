import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Frame,
  parseFrame,
  serializeFrame,
  createRequestFrame,
} from "@myagents/shared";
import { env } from "@myagents/env/web";

type FrameHandler = (frame: Frame) => void;

interface UseWebSocketReturn {
  connected: boolean;
  sendFrame: (method: Frame["method"], payload?: unknown) => string;
  subscribe: (handler: FrameHandler) => () => void;
}

function getWsUrl(): string {
  const serverUrl = env.VITE_SERVER_URL ?? window.location.origin;
  const wsUrl = serverUrl.replace(/^http/, "ws");
  return `${wsUrl}/ws`;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<FrameHandler>>(new Set());
  const [connected, setConnected] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = getWsUrl();
    console.log("[WS] connecting to", url);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] connected");
        if (mountedRef.current) setConnected(true);
      };

      ws.onmessage = (event) => {
        const frame = parseFrame(event.data);
        if (frame) {
          for (const handler of handlersRef.current) {
            handler(frame);
          }
        }
      };

      ws.onclose = (event) => {
        console.log("[WS] closed", { code: event.code, reason: event.reason, wasClean: event.wasClean });
        if (mountedRef.current) {
          setConnected(false);
          // Reconnect after 3s
          reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) connect();
          }, 3000);
        }
      };

      ws.onerror = (event) => {
        console.error("[WS] error", event);
        ws.close();
      };
    } catch (err) {
      console.error("[WS] failed to create WebSocket", err);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendFrame = useCallback(
    (method: Frame["method"], payload?: unknown): string => {
      const frame = createRequestFrame(method, payload);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(serializeFrame(frame));
      }
      return frame.id;
    },
    [],
  );

  const subscribe = useCallback((handler: FrameHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { connected, sendFrame, subscribe };
}
