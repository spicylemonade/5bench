import type { TurnProposal } from "../llm-client";
import { errorToProposal, extractTurnNotation } from "./shared";

export interface AnthropicTurnConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DESIRED_MAX_REASONING_OUTPUT_TOKENS = 1_000_000;
const ANTHROPIC_PROVIDER_MAX_TOKENS = 128_000;
const ANTHROPIC_MAX_TOKENS = Math.min(
  DESIRED_MAX_REASONING_OUTPUT_TOKENS,
  ANTHROPIC_PROVIDER_MAX_TOKENS,
);
const ANTHROPIC_THINKING_BUDGET_TOKENS = 48_000;

function usesAdaptiveThinking(model: string): boolean {
  const m = model.toLowerCase();
  if (/claude-(opus|sonnet|haiku)-4-[6-9]/.test(m)) return true;
  if (/claude-(opus|sonnet|haiku)-[5-9]/.test(m)) return true;
  return false;
}

interface StreamedAnthropicResult {
  textDelta: string;
  errorMessage: string | null;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  stopReason: string | null;
  eventCount: number;
}

async function readAnthropicStream(response: Response): Promise<StreamedAnthropicResult> {
  if (!response.body) throw new Error("Anthropic stream returned no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const result: StreamedAnthropicResult = {
    textDelta: "",
    errorMessage: null,
    stopReason: null,
    eventCount: 0,
  };

  const handleEvent = (eventName: string | null, dataLines: string[]) => {
    if (dataLines.length === 0) return;
    const dataText = dataLines.join("\n").trim();
    if (!dataText) return;

    let payload: any;
    try {
      payload = JSON.parse(dataText);
    } catch {
      return;
    }

    result.eventCount += 1;
    const type: string = eventName ?? payload?.type ?? "";

    if (type === "content_block_delta" && payload?.delta?.type === "text_delta") {
      result.textDelta += payload.delta.text ?? "";
      return;
    }

    if (type === "message_start" && payload?.message?.usage) {
      result.inputTokens = payload.message.usage.input_tokens;
      result.outputTokens = payload.message.usage.output_tokens;
      return;
    }

    if (type === "message_delta") {
      if (payload?.usage?.output_tokens != null) {
        result.outputTokens = payload.usage.output_tokens;
      }
      if (payload?.delta?.stop_reason) {
        result.stopReason = payload.delta.stop_reason;
      }
      return;
    }

    if (type === "error" || payload?.error) {
      result.errorMessage = String(payload?.error?.message ?? type);
    }
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

  return result;
}

export async function requestAnthropicTurn(config: AnthropicTurnConfig): Promise<TurnProposal> {
  const startedAt = Date.now();

  try {
    const adaptive = usesAdaptiveThinking(config.model);
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: config.systemPrompt,
      messages: [{ role: "user", content: config.userPrompt }],
      stream: true,
    };
    if (adaptive) {
      body.thinking = { type: "adaptive" };
      body.output_config = { effort: "max" };
    } else {
      body.thinking = {
        type: "enabled",
        budget_tokens: ANTHROPIC_THINKING_BUDGET_TOKENS,
      };
    }

    const response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Anthropic error ${response.status}: ${await response.text()}`);
    }

    const streamed = await readAnthropicStream(response);

    if (streamed.errorMessage) {
      throw new Error(`Anthropic stream error: ${streamed.errorMessage}`);
    }

    if (!streamed.textDelta.trim()) {
      throw new Error(
        `Anthropic stream ended with no text output (stop_reason=${streamed.stopReason}, events=${streamed.eventCount})`,
      );
    }

    return {
      notation: extractTurnNotation(streamed.textDelta),
      rawResponse: streamed.textDelta.trim(),
      promptTokens: streamed.inputTokens,
      completionTokens: streamed.outputTokens,
      reasoningTokens: streamed.reasoningTokens,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return errorToProposal(error, startedAt);
  }
}
