import type { TurnProposal } from "../llm-client";
import { errorToProposal, extractTurnNotation } from "./shared";

export interface GoogleTurnConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

const GOOGLE_GENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GOOGLE_THINKING_LEVEL = "high";

interface GoogleStreamResult {
  text: string;
  errorMessage: string | null;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  finishReason: string | null;
}

async function readGoogleStream(response: Response): Promise<GoogleStreamResult> {
  if (!response.body) throw new Error("Google stream returned no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const result: GoogleStreamResult = {
    text: "",
    errorMessage: null,
    finishReason: null,
  };

  const handlePayload = (payload: any) => {
    if (!payload) return;
    if (payload.error) {
      result.errorMessage = String(payload.error.message ?? JSON.stringify(payload.error));
      return;
    }
    const candidates = payload.candidates ?? [];
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts ?? [];
      for (const part of parts) {
        if (part?.thought === true) continue;
        if (typeof part?.text === "string") result.text += part.text;
      }
      if (candidate?.finishReason) result.finishReason = candidate.finishReason;
    }
    const usage = payload.usageMetadata;
    if (usage) {
      if (usage.promptTokenCount != null) result.promptTokens = usage.promptTokenCount;
      if (usage.candidatesTokenCount != null) result.completionTokens = usage.candidatesTokenCount;
      if (usage.thoughtsTokenCount != null) result.reasoningTokens = usage.thoughtsTokenCount;
    }
  };

  const flushBlock = (block: string) => {
    const dataLines: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    const dataText = dataLines.join("\n").trim();
    if (!dataText) return;
    try {
      handlePayload(JSON.parse(dataText));
    } catch {
      // Ignore malformed chunks and continue parsing later SSE events.
    }
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
    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;
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

export async function requestGoogleTurn(config: GoogleTurnConfig): Promise<TurnProposal> {
  const startedAt = Date.now();

  try {
    const url = `${GOOGLE_GENAI_BASE}/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;

    const body = {
      systemInstruction: {
        parts: [{ text: config.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: config.userPrompt }],
        },
      ],
      generationConfig: {
        thinkingConfig: {
          thinkingLevel: GOOGLE_THINKING_LEVEL,
          includeThoughts: false,
        },
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Google error ${response.status}: ${await response.text()}`);
    }

    const streamed = await readGoogleStream(response);

    if (streamed.errorMessage) {
      throw new Error(`Google stream error: ${streamed.errorMessage}`);
    }

    if (!streamed.text.trim()) {
      throw new Error(
        `Google stream ended with no text output (finish=${streamed.finishReason ?? "none"})`,
      );
    }

    return {
      notation: extractTurnNotation(streamed.text),
      rawResponse: streamed.text.trim(),
      promptTokens: streamed.promptTokens,
      completionTokens: streamed.completionTokens,
      reasoningTokens: streamed.reasoningTokens,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return errorToProposal(error, startedAt);
  }
}
