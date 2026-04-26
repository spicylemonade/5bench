import type { TurnProposal } from "../llm-client";
import {
  errorToProposal,
  extractTurnNotation,
  sleep,
} from "./shared";

export interface OpenAiTurnConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_REASONING_EFFORT = "xhigh";
const POLL_INTERVAL_MS = 6_000;
const POLL_TIMEOUT_MS = 45 * 60_000;

function authHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
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

export async function requestOpenAiTurn(config: OpenAiTurnConfig): Promise<TurnProposal> {
  const startedAt = Date.now();

  try {
    const body: Record<string, unknown> = {
      model: config.model,
      input: [
        {
          type: "message",
          role: "system",
          content: [{ type: "input_text", text: config.systemPrompt }],
        },
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: config.userPrompt }],
        },
      ],
      reasoning: { effort: OPENAI_REASONING_EFFORT },
      background: true,
      store: true,
    };

    const createResp = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: authHeaders(config.apiKey),
      body: JSON.stringify(body),
    });

    if (!createResp.ok) {
      throw new Error(`OpenAI create error ${createResp.status}: ${await createResp.text()}`);
    }

    const createJson = (await createResp.json()) as Record<string, any>;
    const responseId: string | undefined = createJson?.id;
    if (!responseId) {
      throw new Error(`OpenAI create returned no response id; body head=${JSON.stringify(createJson).slice(0, 200)}`);
    }

    const pollUrl = `${OPENAI_RESPONSES_URL}/${responseId}`;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let final: Record<string, any> | null = null;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const pollResp = await fetch(pollUrl, {
        method: "GET",
        headers: authHeaders(config.apiKey),
      });

      if (!pollResp.ok) {
        const text = await pollResp.text();
        if (pollResp.status >= 500 || pollResp.status === 429) {
          continue;
        }
        throw new Error(`OpenAI poll error ${pollResp.status}: ${text}`);
      }

      const pollJson = (await pollResp.json()) as Record<string, any>;
      const status: string = pollJson?.status ?? "unknown";

      if (status === "completed" || status === "failed" || status === "cancelled" || status === "incomplete") {
        final = pollJson;
        break;
      }
    }

    if (!final) {
      throw new Error(`OpenAI poll timeout after ${POLL_TIMEOUT_MS}ms for response ${responseId}`);
    }

    const status = final.status;
    if (status === "failed" || status === "cancelled") {
      const err = final.error ?? final.incomplete_details ?? "unknown";
      throw new Error(`OpenAI response ${status}: ${JSON.stringify(err).slice(0, 500)}`);
    }

    const rawResponse = extractResponsesOutputText(final.output);
    const usage = final.usage ?? {};
    const outputDetails = usage?.output_tokens_details ?? {};

    if (status === "incomplete" && !rawResponse) {
      const reason = final.incomplete_details?.reason ?? "incomplete";
      throw new Error(`OpenAI response incomplete (${reason}) with no output text`);
    }

    return {
      notation: extractTurnNotation(rawResponse),
      rawResponse,
      promptTokens: usage?.input_tokens,
      completionTokens: usage?.output_tokens,
      reasoningTokens: outputDetails?.reasoning_tokens,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return errorToProposal(error, startedAt);
  }
}
