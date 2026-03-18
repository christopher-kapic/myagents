import { useCallback, useEffect, useRef, useState } from "react";
import { parseFrame, serializeFrame, createRequestFrame, } from "@myagents/shared";
import { env } from "@myagents/env/web";
function getWsUrl() {
    const serverUrl = env.VITE_SERVER_URL;
    const wsUrl = serverUrl.replace(/^http/, "ws");
    return `${wsUrl}/ws`;
}
export function useWebSocket() {
    const wsRef = useRef(null);
    const handlersRef = useRef(new Set());
    const [connected, setConnected] = useState(false);
    const reconnectTimerRef = useRef(null);
    const mountedRef = useRef(true);
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN)
            return;
        try {
            const ws = new WebSocket(getWsUrl());
            wsRef.current = ws;
            ws.onopen = () => {
                if (mountedRef.current)
                    setConnected(true);
            };
            ws.onmessage = (event) => {
                const frame = parseFrame(event.data);
                if (frame) {
                    for (const handler of handlersRef.current) {
                        handler(frame);
                    }
                }
            };
            ws.onclose = () => {
                if (mountedRef.current) {
                    setConnected(false);
                    // Reconnect after 3s
                    reconnectTimerRef.current = setTimeout(() => {
                        if (mountedRef.current)
                            connect();
                    }, 3000);
                }
            };
            ws.onerror = () => {
                ws.close();
            };
        }
        catch {
            // Will retry via onclose
        }
    }, []);
    useEffect(() => {
        mountedRef.current = true;
        connect();
        return () => {
            mountedRef.current = false;
            if (reconnectTimerRef.current)
                clearTimeout(reconnectTimerRef.current);
            wsRef.current?.close();
        };
    }, [connect]);
    const sendFrame = useCallback((method, payload) => {
        const frame = createRequestFrame(method, payload);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(serializeFrame(frame));
        }
        return frame.id;
    }, []);
    const subscribe = useCallback((handler) => {
        handlersRef.current.add(handler);
        return () => {
            handlersRef.current.delete(handler);
        };
    }, []);
    return { connected, sendFrame, subscribe };
}
