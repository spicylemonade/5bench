import {
  exportPgn,
  getLegalActions,
  parseSubmittedTurn,
} from "./chess-node";
import { pickSearchAction } from "./eval";
import { LlmClient } from "./llm-client";
import type { TurnProposal } from "./llm-client";
import type { ActionDecision, CompetitorConfig } from "./types";

interface BotTurnInput {
  competitor: CompetitorConfig;
  chess: any;
  seedLabel: string;
  seedDescription: string;
  llmClient?: LlmClient;
}

export interface ChosenTurn {
  decision: ActionDecision;
  rawAction?: unknown[] | null;
  forfeit?: boolean;
  forfeitReason?: string;
}

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0) % length;
}

export async function chooseCompetitorAction(input: BotTurnInput): Promise<ActionDecision> {
  const turn = await chooseCompetitorTurn(input);
  return turn.decision;
}

function cloneRaw<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function buildInvalidTurnDecision(
  proposal: TurnProposal,
  notation: string | null,
  reason: string,
): ActionDecision {
  return {
    actionId: "INVALID",
    notation: notation ?? "(no turn returned)",
    validChoice: false,
    fallbackUsed: false,
    stepCount: 1,
    validStepCount: 0,
    notes: reason,
    rawResponse: proposal.rawResponse,
    promptTokens: proposal.promptTokens,
    completionTokens: proposal.completionTokens,
    reasoningTokens: proposal.reasoningTokens,
    latencyMs: proposal.latencyMs,
  };
}

async function chooseLlmTurn(input: BotTurnInput): Promise<ChosenTurn> {
  if (!input.llmClient) {
    throw new Error(`LLM client is required for competitor ${input.competitor.id}.`);
  }

  const proposal = await input.llmClient.pickTurn({
    competitor: input.competitor,
    seedLabel: input.seedLabel,
    seedDescription: input.seedDescription,
    chess: input.chess,
  });
  const proposedNotation = proposal.notation?.trim() || null;

  if (!proposedNotation) {
    return {
      forfeit: true,
      forfeitReason: "invalid-turn",
      decision: buildInvalidTurnDecision(
        proposal,
        null,
        "Model did not return a submitted 5DPGN turn.",
      ),
    };
  }

  try {
    const parsedTurn = parseSubmittedTurn(input.chess, proposedNotation);
    return {
      rawAction: parsedTurn.rawAction ? cloneRaw(parsedTurn.rawAction) : null,
      decision: {
        actionId: parsedTurn.rawAction ? "TURN" : "PASS",
        notation: parsedTurn.notation,
        validChoice: true,
        fallbackUsed: false,
        stepCount: 1,
        validStepCount: 1,
        rawResponse: proposal.rawResponse,
        promptTokens: proposal.promptTokens,
        completionTokens: proposal.completionTokens,
        reasoningTokens: proposal.reasoningTokens,
        latencyMs: proposal.latencyMs,
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      forfeit: true,
      forfeitReason: "invalid-turn",
      decision: buildInvalidTurnDecision(proposal, proposedNotation, reason),
    };
  }
}

export async function chooseCompetitorTurn(input: BotTurnInput): Promise<ChosenTurn> {
  if (input.competitor.kind === "llm") {
    return chooseLlmTurn(input);
  }

  const startedAt = Date.now();

  const legalActions = getLegalActions(input.chess);

  if (legalActions.length === 0) {
    throw new Error(`No legal actions available for competitor ${input.competitor.id}.`);
  }

  if (input.competitor.engineKind === "search") {
    const action = pickSearchAction(
      input.chess,
      input.competitor.searchDepth ?? 1,
      input.competitor.beamWidth ?? 12,
    );

    return {
      rawAction: cloneRaw(action.raw as unknown[]),
      decision: {
        actionId: action.id,
        notation: action.notation,
        validChoice: true,
        fallbackUsed: false,
        stepCount: 1,
        validStepCount: 1,
        notes: `search depth ${input.competitor.searchDepth ?? 1}`,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  const index = stableIndex(`${input.competitor.id}:${exportPgn(input.chess)}`, legalActions.length);
  const action = legalActions[index];

  return {
    rawAction: cloneRaw(action.raw as unknown[]),
    decision: {
      actionId: action.id,
      notation: action.notation,
      validChoice: true,
      fallbackUsed: false,
      stepCount: 1,
      validStepCount: 1,
      notes: "deterministic random baseline",
      latencyMs: Date.now() - startedAt,
    },
  };
}
