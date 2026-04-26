import { readFileSync } from "node:fs";
import { exportPgn, getActionNumber, getCurrentPlayer, summarizeBoards } from "./chess-node";
import type { CompetitorConfig } from "./types";
import {
  errorToProposal,
  extractTurnNotation,
  getRetryBackoffMs,
  mergeAttemptResponses,
  shouldRetryTurnProposal,
  sleep,
} from "./providers/shared";

export interface LlmClientOptions {
  openRouterApiKey?: string;
  siteUrl?: string;
  appName?: string;
}

interface PickTurnInput {
  competitor: CompetitorConfig;
  seedLabel: string;
  seedDescription: string;
  chess: any;
}

export interface TurnProposal {
  notation: string | null;
  rawResponse: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  latencyMs: number;
}

const RULES_TEXT = readFileSync(new URL("../../rules.txt", import.meta.url), "utf8").trim();
const README_TEXT = readFileSync(new URL("../../README.md", import.meta.url), "utf8").trim();
const TURN_NOTATION_EXAMPLE = [
  '[Board "Standard - Turn Zero"]',
  '[Mode "5D"]',
  "",
  "1. d4 / d6",
  "2. (0T2)Ng1>>(0T1)g3~ (>L1) / (1T1)Ng8>>(0T1)g6~ (>L-1)",
  "3. (-1T2)d5 (1T2)Nf5 / (-1T2)Nf4 (0T2)f5 (1T2)e5",
].join("\n");

const OPENROUTER_RESPONSES_URL = "https://openrouter.ai/api/v1/responses";
const OPENROUTER_REASONING_EFFORT = "xhigh";
const OPENROUTER_MAX_OUTPUT_TOKENS = 131_072;
const OPENROUTER_STREAM_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_RETAINED_RESPONSE_CHARS = 8 * 1024;
const MAX_DELTA_TEXT_CHARS = 256 * 1024;

function truncateForRetention(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.7));
  const tail = text.slice(-Math.floor(maxChars * 0.2));
  return `${head}\n...[truncated ${text.length - head.length - tail.length} chars]...\n${tail}`;
}

function extractResponsesOutputText(output: unknown): string {
  if (!Array.isArray(output)) return "";

  const assistantMessages = output.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as Record<string, unknown>).type === "message" &&
      (item as Record<string, unknown>).role === "assistant",
  ) as Array<Record<string, unknown>>;

  if (assistantMessages.length === 0) return "";

  let preferred = assistantMessages[assistantMessages.length - 1];
  for (let i = assistantMessages.length - 1; i >= 0; i -= 1) {
    if (assistantMessages[i].phase === "final_answer") {
      preferred = assistantMessages[i];
      break;
    }
  }

  const content = preferred.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        return item.text;
      }
      return "";
    })
    .join("\n")
    .trim();
}

interface StreamedResponsesResult {
  deltaText: string;
  finalText: string | null;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  };
  completed: boolean;
  errorMessage: string | null;
  eventCount: number;
}

function createIdleWatchdog(timeoutMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const touch = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      controller.abort(
        new Error(`OpenRouter responses stream idle timeout after ${timeoutMs} ms with no bytes received`),
      );
    }, timeoutMs);
  };

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  touch();
  return { controller, touch, clear };
}

async function readStreamedResponses(
  response: Response,
  onActivity?: () => void,
): Promise<StreamedResponsesResult> {
  if (!response.body) {
    throw new Error("OpenRouter responses stream returned no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let deltaText = "";
  let finalText: string | null = null;
  const usage: StreamedResponsesResult["usage"] = {};
  let completed = false;
  let errorMessage: string | null = null;
  let eventCount = 0;

  const handleEvent = (eventName: string | null, dataLines: string[]) => {
    if (dataLines.length === 0) return;
    const dataText = dataLines.join("\n").trim();
    if (!dataText || dataText === "[DONE]") return;

    let payload: any;
    try {
      payload = JSON.parse(dataText);
    } catch {
      return;
    }

    eventCount += 1;
    const type = eventName ?? payload?.type ?? "";

    if (type === "response.output_text.delta") {
      const delta = typeof payload?.delta === "string" ? payload.delta : "";
      if (delta) {
        if (deltaText.length + delta.length <= MAX_DELTA_TEXT_CHARS) {
          deltaText += delta;
        } else if (deltaText.length < MAX_DELTA_TEXT_CHARS) {
          deltaText += delta.slice(0, MAX_DELTA_TEXT_CHARS - deltaText.length);
        }
      }
      payload = null;
      return;
    }

    if (type === "response.completed") {
      const response = payload?.response ?? payload ?? null;
      if (response) {
        const text = extractResponsesOutputText(response.output);
        if (text) finalText = text;
        const u = response.usage ?? {};
        if (typeof u.input_tokens === "number") usage.inputTokens = u.input_tokens;
        if (typeof u.output_tokens === "number") usage.outputTokens = u.output_tokens;
        const r = u.output_tokens_details?.reasoning_tokens;
        if (typeof r === "number") usage.reasoningTokens = r;
      }
      completed = true;
      payload = null;
      return;
    }

    if (type === "error" || payload?.error) {
      errorMessage = String(payload?.error?.message ?? type);
    }

    payload = null;
  };

  const flushBlock = (block: string) => {
    let eventName: string | null = null;
    const dataLines: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
    handleEvent(eventName, dataLines);
  };

  const findBoundary = (s: string): { index: number; length: number } | null => {
    const crlf = s.indexOf("\r\n\r\n");
    const lf = s.indexOf("\n\n");
    if (crlf === -1 && lf === -1) return null;
    if (crlf !== -1 && (lf === -1 || crlf <= lf)) return { index: crlf, length: 4 };
    return { index: lf, length: 2 };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }

    if (value.byteLength > 0) onActivity?.();
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const boundary = findBoundary(buffer);
      if (!boundary) break;
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);
      flushBlock(block);
    }
  }

  if (buffer.trim()) flushBlock(buffer);

  return { deltaText, finalText, usage, completed, errorMessage, eventCount };
}

function buildPrompts(input: PickTurnInput): { systemPrompt: string; userPrompt: string } {
  const history = exportPgn(input.chess);
  const recentHistory = history
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(-8)
    .join("\n");
  const boardSummary = summarizeBoards(input.chess).replace(/ /g, "");

  const systemPrompt = [
    "You are playing a full game of competitive 5D Chess With Multiverse Time Travel in an unassisted benchmark.",
    "This is 5D chess, not standard chess.",
    "On each call, write exactly one complete submitted sub-turn for the current player in valid 5DPGN notation.",
    "A submitted sub-turn may contain multiple space-separated moves if the rules allow or require multiple moves before the turn is submitted.",
    "Use the full features of 5D chess whenever they are strongest, including time travel, timeline branching, cross-timeline geometry, present-line management, and tactics that span multiple boards.",
    "Do not default to playing on a single timeline like ordinary chess if stronger multiverse turns exist.",
    "No legal move list will be provided. You must reason from the current multiverse position and the rules.",
    "The engine will validate your notation exactly. If you return an invalid turn, you immediately lose the game.",
    "If passing is the only legal option, return exactly `pass`.",
    "Return only the move text itself as plain text.",
    "Your response must contain only the current player's submitted sub-turn, not a turn number and not a slash-separated pair of both players' moves.",
    "Do not include JSON, confidence scores, notes, quotes, markdown fences, prose, analysis, comments, or alternatives.",
    "Treat the following rules reference as binding for this benchmark:",
    RULES_TEXT,
    "Treat the following README.md notation reference as binding for 5DPGN syntax and turn structure:",
    README_TEXT,
    "Example 5DPGN turn structure:",
    TURN_NOTATION_EXAMPLE,
  ].join("\n\n");

  const userPrompt = [
    "Game: Full 5D Chess With Multiverse Time Travel",
    `Seed: ${input.seedLabel}`,
    `Seed note: ${input.seedDescription}`,
    `Current player: ${getCurrentPlayer(input.chess)}`,
    `Current action number: ${getActionNumber(input.chess)}`,
    "Write the strongest legal submitted sub-turn from this position in 5DPGN.",
    "Output rules:",
    "- Return only the move text itself, for example `Nf6` or `(0T2)Ng1>>(0T1)g3~ (>L1)`.",
    "- Do not include a turn number like `12.` or `12w.`.",
    "- Do not include `/` or the opponent's reply.",
    "- If your submitted sub-turn contains multiple moves, put them in one space-separated string.",
    "- Do not include JSON, field names, confidence scores, notes, quotes, or explanations.",
    "- If the only legal option is to pass, return exactly `pass`.",
    "",
    "Recent 5DPGN context:",
    "```",
    recentHistory || "(game start)",
    "```",
    "",
    "Current multiverse board state:",
    "```",
    boardSummary,
    "```",
  ].join("\n");

  return { systemPrompt, userPrompt };
}

export class LlmClient {
  private readonly openRouterApiKey?: string;
  private readonly siteUrl: string;
  private readonly appName: string;

  constructor(options: LlmClientOptions) {
    this.openRouterApiKey = options.openRouterApiKey;
    this.siteUrl = options.siteUrl ?? "http://localhost/fivebench";
    this.appName = options.appName ?? "FiveBench v1";
  }

  private async requestOnce(input: PickTurnInput): Promise<TurnProposal> {
    const { systemPrompt, userPrompt } = buildPrompts(input);
    const modelId = input.competitor.model;
    if (!modelId) {
      throw new Error(`Competitor ${input.competitor.id} has no model identifier configured.`);
    }
    if (!this.openRouterApiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const startedAt = Date.now();
    const watchdog = createIdleWatchdog(OPENROUTER_STREAM_IDLE_TIMEOUT_MS);

    try {
      const body = {
        model: modelId,
        input: [
          {
            type: "message",
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
        ],
        reasoning: {
          effort: OPENROUTER_REASONING_EFFORT,
          exclude: true,
        },
        max_output_tokens: OPENROUTER_MAX_OUTPUT_TOKENS,
        stream: true,
      };

      const response = await fetch(OPENROUTER_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.openRouterApiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "HTTP-Referer": this.siteUrl,
          "X-Title": this.appName,
        },
        body: JSON.stringify(body),
        signal: watchdog.controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
      }

      watchdog.touch();
      const streamed = await readStreamedResponses(response, watchdog.touch);

      if (streamed.errorMessage) {
        throw new Error(`OpenRouter responses stream error: ${streamed.errorMessage}`);
      }

      const rawResponse = (streamed.finalText ?? "") || streamed.deltaText.trim();

      if (!rawResponse && !streamed.completed) {
        throw new Error(
          `OpenRouter responses stream ended with no completed event and no output text (Premature close after ${streamed.eventCount} events)`,
        );
      }

      return {
        notation: extractTurnNotation(rawResponse),
        rawResponse: truncateForRetention(rawResponse, MAX_RETAINED_RESPONSE_CHARS),
        promptTokens: streamed.usage.inputTokens,
        completionTokens: streamed.usage.outputTokens,
        reasoningTokens: streamed.usage.reasoningTokens,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      const abortedReason = watchdog.controller.signal.aborted ? watchdog.controller.signal.reason : null;
      const finalError =
        abortedReason instanceof Error
          ? abortedReason
          : abortedReason
            ? new Error(String(abortedReason))
            : error;
      return errorToProposal(finalError, startedAt);
    } finally {
      watchdog.clear();
    }
  }

  async pickTurn(input: PickTurnInput): Promise<TurnProposal> {
    const maxAttempts = 5;
    const attempts: TurnProposal[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const proposal = await this.requestOnce(input);
      attempts.push(proposal);

      const isLast = attempt === maxAttempts - 1;
      if (!shouldRetryTurnProposal(proposal) || isLast) {
        return mergeAttemptResponses(attempts);
      }

      await sleep(getRetryBackoffMs(attempt));
    }

    return mergeAttemptResponses(attempts);
  }
}
