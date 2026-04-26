import {
  applyAction,
  cloneChess,
  exportPgn,
  getActionNumber,
  getBoardSnapshot,
  getCurrentPlayer,
  getLegalActions,
  resolveTerminalState,
} from "./chess-node";
import type { BoardTimeline, BoardTurn, LegalAction, PlayerColor } from "./types";

const PIECE_VALUES: Record<string, number> = {
  P: 1,
  N: 3.1,
  B: 3.25,
  R: 5,
  Q: 9,
  K: 0,
  U: 7,
  D: 7,
  S: 8,
  W: 1.2,
  C: 0,
  Y: 10,
};

function normalizePiece(piece: string): string {
  return piece === "" ? "P" : piece;
}

function evaluateTurn(turn: BoardTurn, weight: number): number {
  let score = 0;

  for (const piece of turn.pieces) {
    const value = PIECE_VALUES[normalizePiece(piece.piece)] ?? 0;
    score += piece.player === "white" ? value * weight : -value * weight;
  }

  return score;
}

function evaluateTimeline(timeline: BoardTimeline): number {
  const turn = timeline.turns[timeline.turns.length - 1];
  const weight = timeline.present ? 1 : timeline.active ? 0.9 : 0.8;
  return evaluateTurn(turn, weight);
}

export function evaluateState(chess: any, perspective: PlayerColor = "white"): number {
  const terminal = resolveTerminalState(chess);

  if (terminal.terminal) {
    if (terminal.result === "1/2-1/2") {
      return 0;
    }

    const whiteTerminal = terminal.result === "1-0" ? 10000 : -10000;
    return perspective === "white" ? whiteTerminal : -whiteTerminal;
  }

  const snapshot = getBoardSnapshot(chess);
  let whiteScore = snapshot.timelines.reduce((sum: number, timeline: BoardTimeline) => sum + evaluateTimeline(timeline), 0);

  const legalCount = getLegalActions(chess).length;
  const mobilityScore = Math.log2(legalCount + 1) * 0.2;
  whiteScore += getCurrentPlayer(chess) === "white" ? mobilityScore : -mobilityScore;

  if (chess.inCheck) {
    whiteScore += getCurrentPlayer(chess) === "white" ? -0.75 : 0.75;
  }

  whiteScore += (snapshot.timelines.filter((timeline: BoardTimeline) => timeline.present).length - 1) * 0.08;
  whiteScore += (getActionNumber(chess) - 1) * 0.01;

  return perspective === "white" ? whiteScore : -whiteScore;
}

interface SearchOptions {
  depth: number;
  beamWidth: number;
  cache?: Map<string, number>;
}

export interface RankedAction {
  action: LegalAction;
  score: number;
}

export interface OracleComparison {
  bestAction: LegalAction;
  bestScore: number;
  worstScore: number;
  chosenScore: number;
  normalized: number;
  ranked: RankedAction[];
}

function cacheKey(chess: any, depth: number, perspective: PlayerColor): string {
  return `${exportPgn(chess)}|${getCurrentPlayer(chess)}|${depth}|${perspective}`;
}

function orderActions(chess: any, perspective: PlayerColor, beamWidth: number): Array<{ action: LegalAction; next: any; shallow: number }> {
  const maximizing = getCurrentPlayer(chess) === perspective;

  return getLegalActions(chess)
    .map((action) => {
      const next = cloneChess(chess);
      applyAction(next, action);
      return {
        action,
        next,
        shallow: evaluateState(next, perspective),
      };
    })
    .sort((left, right) => (maximizing ? right.shallow - left.shallow : left.shallow - right.shallow))
    .slice(0, beamWidth);
}

export function searchValue(chess: any, perspective: PlayerColor, options: SearchOptions): number {
  const { depth, beamWidth } = options;
  const cache = options.cache;
  const key = cache ? cacheKey(chess, depth, perspective) : "";

  if (cache && cache.has(key)) {
    return cache.get(key)!;
  }

  const terminal = resolveTerminalState(chess);
  if (terminal.terminal || depth <= 0) {
    const value = evaluateState(chess, perspective);
    if (cache) {
      cache.set(key, value);
    }
    return value;
  }

  const ordered = orderActions(chess, perspective, beamWidth);
  if (ordered.length === 0) {
    const value = evaluateState(chess, perspective);
    if (cache) {
      cache.set(key, value);
    }
    return value;
  }

  const maximizing = getCurrentPlayer(chess) === perspective;
  let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;

  for (const candidate of ordered) {
    const score = depth === 1
      ? candidate.shallow
      : searchValue(candidate.next, perspective, {
          depth: depth - 1,
          beamWidth,
          cache,
        });

    if (maximizing) {
      best = Math.max(best, score);
    } else {
      best = Math.min(best, score);
    }
  }

  if (cache) {
    cache.set(key, best);
  }

  return best;
}

export function rankActions(chess: any, depth: number, beamWidth: number): RankedAction[] {
  const perspective = getCurrentPlayer(chess);
  const cache = new Map<string, number>();

  return getLegalActions(chess)
    .map((action) => {
      const next = cloneChess(chess);
      applyAction(next, action);
      return {
        action,
        score: searchValue(next, perspective, {
          depth: Math.max(depth - 1, 0),
          beamWidth,
          cache,
        }),
      };
    })
    .sort((left, right) => right.score - left.score);
}

export function pickSearchAction(chess: any, depth: number, beamWidth: number): LegalAction {
  const ranked = rankActions(chess, depth, beamWidth);

  if (ranked.length === 0) {
    throw new Error("No legal actions available for search bot.");
  }

  return ranked[0].action;
}

export function compareAgainstOracle(
  chess: any,
  chosenActionId: string,
  depth: number,
  beamWidth: number,
): OracleComparison {
  const ranked = rankActions(chess, depth, beamWidth);

  if (ranked.length === 0) {
    throw new Error("Cannot score a terminal position against the oracle.");
  }

  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const chosen = ranked.find((entry) => entry.action.id === chosenActionId) ?? worst;
  const spread = Math.max(best.score - worst.score, 1e-9);

  return {
    bestAction: best.action,
    bestScore: best.score,
    worstScore: worst.score,
    chosenScore: chosen.score,
    normalized: Number(((chosen.score - worst.score) / spread).toFixed(4)),
    ranked,
  };
}
