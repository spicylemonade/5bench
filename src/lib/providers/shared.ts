import type { TurnProposal } from "../llm-client";

export function extractTurnNotationFromObject(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const raw =
    typeof record.turn_notation === "string"
      ? record.turn_notation
      : typeof record.notation === "string"
        ? record.notation
        : typeof record.move === "string"
          ? record.move
          : typeof record.action === "string"
            ? record.action
            : null;

  return raw?.trim() || null;
}

export function cleanNotationCandidate(raw: string): string | null {
  let cleaned = raw.trim();
  if (!cleaned) return null;

  const codeBlockMatch = cleaned.match(/```(?:json|pgn|text)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) cleaned = codeBlockMatch[1].trim();

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed === "string") cleaned = parsed.trim();
    } catch {
      // fall through
    }
  }

  const firstLine =
    cleaned
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)[0] ?? "";

  const normalized = firstLine
    .replace(/^\s*\d+\s*[wb]?\.\s*/i, "")
    .replace(/^\s*turn(?:_notation)?\s*[:=]\s*/i, "")
    .replace(/^[-*]\s*/, "")
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .trim();

  return normalized || null;
}

export function extractTurnNotation(raw: string): string | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const parsed = extractTurnNotationFromObject(JSON.parse(jsonMatch[0]));
      if (parsed) return parsed;
    } catch {
      const fieldMatch = jsonMatch[0].match(
        /"(?:turn_notation|notation|move|action)"\s*:\s*"((?:\\.|[^"])*)"/s,
      );
      if (fieldMatch?.[1]) {
        try {
          return JSON.parse(`"${fieldMatch[1]}"`).trim();
        } catch {
          return fieldMatch[1].replace(/\\"/g, '"').trim();
        }
      }
      return null;
    }
  }

  return cleanNotationCandidate(raw);
}

export function addOptional(
  current: number | undefined,
  next: number | undefined,
): number | undefined {
  if (current == null) return next;
  if (next == null) return current;
  return current + next;
}

export function mergeAttemptResponses(attempts: TurnProposal[]): TurnProposal {
  const finalAttempt = attempts[attempts.length - 1];
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let reasoningTokens: number | undefined;
  let latencyMs = 0;

  for (const attempt of attempts) {
    promptTokens = addOptional(promptTokens, attempt.promptTokens);
    completionTokens = addOptional(completionTokens, attempt.completionTokens);
    reasoningTokens = addOptional(reasoningTokens, attempt.reasoningTokens);
    latencyMs += attempt.latencyMs;
  }

  const rawResponse =
    attempts.length === 1
      ? finalAttempt.rawResponse
      : attempts
          .map(
            (attempt, index) =>
              `[attempt ${index + 1}] ${attempt.rawResponse || "(empty response)"}`,
          )
          .join("\n\n");

  return {
    notation: finalAttempt.notation,
    rawResponse,
    promptTokens,
    completionTokens,
    reasoningTokens,
    latencyMs,
  };
}

const TRANSPORT_ERROR_PATTERN =
  /TypeError:\s*terminated|aborted|idle timeout|timed out|timeout|socket|stream disconnected|response\.complete|SyntaxError|Unexpected end|Unexpected token|JSON input|socket hang up|ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|Premature close|fetch failed|other side closed|EPIPE|network|rate.?limit|\b429\b|\b5\d\d\b|server_error|internal server error|service unavailable|bad gateway|gateway timeout|temporar(?:y|ily) unavailable|overloaded|connection error/i;

const RETRY_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000];

export function shouldRetryTurnProposal(proposal: TurnProposal): boolean {
  if (proposal.notation) return false;
  const raw = proposal.rawResponse.trim();
  if (!raw) return true;
  return TRANSPORT_ERROR_PATTERN.test(raw);
}

export function isTransportError(message: string): boolean {
  return TRANSPORT_ERROR_PATTERN.test(message);
}

export function getRetryBackoffMs(attemptIndex: number): number {
  return RETRY_BACKOFF_MS[Math.min(attemptIndex, RETRY_BACKOFF_MS.length - 1)];
}

export function errorToProposal(error: unknown, startedAt: number): TurnProposal {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    notation: null,
    rawResponse: err.stack ?? err.message ?? "request failed",
    latencyMs: Date.now() - startedAt,
  };
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
