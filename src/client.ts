import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";

// Import GatewayClient from the globally installed openclaw package.
// Node doesn't resolve global packages by default, so we find the path manually.
function findGlobalOpenclaw(): string {
  // Try npm root -g
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
    const candidate = join(globalRoot, "openclaw", "dist", "plugin-sdk", "gateway-runtime.js");
    if (existsSync(candidate)) return candidate;
  } catch { /* fall through */ }
  // Fallback: common Windows path
  const fallback = join(
    process.env.APPDATA || "",
    "npm", "node_modules", "openclaw", "dist", "plugin-sdk", "gateway-runtime.js",
  );
  if (existsSync(fallback)) return fallback;
  throw new Error("Cannot find openclaw global install. Run: npm install -g openclaw");
}

import { pathToFileURL } from "node:url";
const { GatewayClient } = await import(pathToFileURL(findGlobalOpenclaw()).href);

type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  seq: number;
  state: "delta" | "final" | "aborted" | "error";
  message?: {
    role: string;
    content: Array<{ type: string; text?: string }>;
  };
  errorMessage?: string;
  errorKind?: string;
};

type EventFrame = {
  type: "event";
  event: string;
  payload: unknown;
};

function extractText(message: unknown): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  const msg = message as { content?: Array<{ type: string; text?: string }> };
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
  }
  return "";
}

export class TestClient {
  private client: InstanceType<typeof GatewayClient>;
  private connectedPromise: Promise<void>;
  private resolveConnected!: () => void;
  private chatListeners = new Set<(payload: ChatEventPayload) => void>();

  constructor(
    private url: string,
    private token: string,
  ) {
    this.connectedPromise = new Promise((r) => {
      this.resolveConnected = r;
    });

    this.client = new GatewayClient({
      url: this.url,
      token: this.token,
      clientName: "test",
      clientDisplayName: "openclaw-testharness",
      clientVersion: "0.1.0",
      platform: process.platform,
      mode: "test",
      minProtocol: 3,
      maxProtocol: 3,
      instanceId: randomUUID(),
      scopes: ["operator.admin", "operator.read", "operator.write"],
      onHelloOk: () => {
        this.resolveConnected();
      },
      onEvent: (evt: EventFrame) => {
        if (evt.event === "chat") {
          const payload = evt.payload as ChatEventPayload;
          for (const fn of this.chatListeners) fn(payload);
        }
      },
      onConnectError: (err: Error) => {
        console.error("Gateway connect error:", err.message);
      },
      onClose: (code: number, reason: string) => {
        if (code !== 1000) {
          console.error(`Gateway closed: ${code} ${reason}`);
        }
      },
    });
  }

  async start(): Promise<void> {
    this.client.start();
    await this.connectedPromise;
  }

  async stop(): Promise<void> {
    this.client.stop();
  }

  async sendChat(
    agentId: string,
    message: string,
    timeoutMs = 120000,
  ): Promise<string> {
    const idempotencyKey = randomUUID();
    const sessionKey = `agent:${agentId}:test:${randomUUID()}`;

    return new Promise<string>((resolve, reject) => {
      let responseText = "";
      let runId: string | null = null;
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.chatListeners.delete(listener);
        reject(new Error(`timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const settle = (text: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.chatListeners.delete(listener);
        resolve(text);
      };

      const settleError = (msg: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.chatListeners.delete(listener);
        reject(new Error(msg));
      };

      const listener = (payload: ChatEventPayload) => {
        // Before we have a runId, match by sessionKey
        if (runId && payload.runId !== runId) return;
        if (!runId && payload.sessionKey !== sessionKey) return;
        if (!runId) runId = payload.runId;

        // OpenClaw's gateway sends each delta event with the FULL
        // message-so-far, not an incremental chunk, and the final event
        // contains the complete assembled message. Appending all of them
        // duplicates text — short responses come back as "aa" / "55" /
        // "((b)(b)" etc. Use whichever is longer instead of appending,
        // which handles both cumulative and incremental delta styles.
        if (payload.state === "delta") {
          const t = extractText(payload.message);
          if (process.env.OPENCLAW_TH_DEBUG) console.error(`[DELTA seq=${payload.seq} len=${t.length}] ${JSON.stringify(t.slice(0, 80))}`);
          if (t.length > responseText.length) responseText = t;
        } else if (payload.state === "final") {
          const t = extractText(payload.message);
          if (process.env.OPENCLAW_TH_DEBUG) console.error(`[FINAL seq=${payload.seq} len=${t.length} acc=${responseText.length}] ${JSON.stringify(t.slice(0, 80))}`);
          if (t.length > responseText.length) responseText = t;
          settle(responseText);
        } else if (payload.state === "aborted") {
          const t = extractText(payload.message);
          if (t.length > responseText.length) responseText = t;
          settle(responseText);
        } else if (payload.state === "error") {
          settleError(payload.errorMessage || "agent error");
        }
      };

      this.chatListeners.add(listener);

      // Fire the request
      this.client
        .request("chat.send", {
          sessionKey,
          message,
          deliver: false,
          idempotencyKey,
          timeoutMs,
        })
        .then((res: { runId?: string }) => {
          if (res.runId) runId = res.runId;
        })
        .catch((err: Error) => {
          settleError(err.message);
        });
    });
  }
}
