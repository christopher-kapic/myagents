import WebSocket from "ws";
import {
  parseFrame,
  serializeFrame,
  createRequestFrame,
  createResponseFrame,
  type Frame,
  type FrameMethod,
} from "@myagents/shared";

export interface WsClientOptions {
  serverUrl: string;
  apiKey: string;
  nodeId: string;
  onFrame?: (frame: Frame) => void;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: Error) => void;
}

const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30_000;
const BACKOFF_FACTOR = 1.5;
const HEARTBEAT_INTERVAL = 25_000; // Send heartbeat every 25s (server expects within 90s)

export class WsClient {
  private ws: WebSocket | null = null;
  private options: WsClientOptions;
  private shouldReconnect = true;
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: WsClientOptions) {
    this.options = options;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const wsUrl = this.buildWsUrl();
    this.ws = new WebSocket(wsUrl);

    this.ws.on("open", () => {
      this.retryCount = 0;
      this.startHeartbeat();
      this.options.onOpen?.();
    });

    this.ws.on("message", (data: WebSocket.RawData) => {
      const text = data.toString();
      const frame = parseFrame(text);
      if (frame) {
        this.options.onFrame?.(frame);
      }
    });

    this.ws.on("close", (code: number, reason: Buffer) => {
      this.stopHeartbeat();
      this.options.onClose?.(code, reason.toString());
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (error: Error) => {
      this.options.onError?.(error);
    });
  }

  sendFrame(frame: Frame): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serializeFrame(frame));
    }
  }

  sendRequest(method: FrameMethod, payload?: unknown, id?: string): void {
    this.sendFrame(createRequestFrame(method, payload, id));
  }

  sendResponse(method: FrameMethod, payload?: unknown, id?: string, error?: string): void {
    this.sendFrame(createResponseFrame(method, payload, id, error));
  }

  close(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, "Client closing");
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private buildWsUrl(): string {
    const base = this.options.serverUrl.replace(/^http/, "ws");
    const url = new URL("/ws", base);
    url.searchParams.set("type", "node");
    url.searchParams.set("apiKey", this.options.apiKey);
    url.searchParams.set("nodeId", this.options.nodeId);
    return url.toString();
  }

  private getReconnectDelay(): number {
    const delay = Math.min(
      INITIAL_RETRY_DELAY * Math.pow(BACKOFF_FACTOR, this.retryCount),
      MAX_RETRY_DELAY,
    );
    // Add jitter (±10%)
    return delay * (0.9 + Math.random() * 0.2);
  }

  private scheduleReconnect(): void {
    const delay = this.getReconnectDelay();
    this.retryCount++;
    console.log(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.retryCount})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendRequest("agent.heartbeat", {
          nodeId: this.options.nodeId,
        });
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
