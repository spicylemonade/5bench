import Chess from "5d-chess-js";
import type {
  BoardSnapshot,
  BoardTimeline,
  BoardTurn,
  LegalAction,
  PlayerColor,
  SeedSetup,
} from "./types";

type ChessInstance = any;

export interface MatrixTimeline {
  timeline: number;
  active: boolean;
  present: boolean;
  turn: number;
  player: PlayerColor;
  width: number;
  height: number;
  matrix: string[][];
}

export interface TerminalState {
  terminal: boolean;
  result: "1-0" | "0-1" | "1/2-1/2" | null;
  reason: string;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function createChessFromSetup(setup: SeedSetup): ChessInstance {
  switch (setup.kind) {
    case "fresh":
      return new Chess(undefined, setup.variant ?? "standard");
    case "pgn":
      return new Chess(setup.pgn);
    case "truncate":
      return createTruncatedChess(setup.fullPgn, setup.replayActions);
  }
}

export function createTruncatedChess(fullPgn: string, replayActions: number): ChessInstance {
  const fullGame = new Chess(fullPgn);
  const fullState = fullGame.state();
  const rawHistory = (fullGame.export("raw") as unknown[]).slice(0, replayActions);
  const seed = new Chess();

  seed.state({
    checkmateTimeout: fullState.checkmateTimeout,
    skipDetection: fullState.skipDetection,
    enableConsole: fullState.enableConsole,
    checkmateCache: [],
    metadata: deepClone(fullState.metadata),
    rawAction: fullState.rawStartingAction,
    rawStartingAction: fullState.rawStartingAction,
    rawBoardHistory: [deepClone(fullState.rawBoardHistory[0])],
    rawBoard: deepClone(fullState.rawBoardHistory[0]),
    rawActionHistory: [],
    rawMoveBuffer: [],
    rawPromotionPieces: deepClone(fullState.rawPromotionPieces),
  });

  for (const action of rawHistory) {
    seed.action(action);
  }

  return seed;
}

export function cloneChess(chess: ChessInstance): ChessInstance {
  return chess.copy();
}

export function exportPgn(chess: ChessInstance): string {
  return chess.export("5dpgn");
}

export function getBoardSnapshot(chess: ChessInstance): BoardSnapshot {
  return chess.board as BoardSnapshot;
}

export function getCurrentPlayer(chess: ChessInstance): PlayerColor {
  return chess.player as PlayerColor;
}

export function getActionNumber(chess: ChessInstance): number {
  return chess.actionNumber as number;
}

export function getLegalActions(chess: ChessInstance): LegalAction[] {
  const state = chess.state();
  const rawActions = chess.raw.actionFuncs
    .actions(
      state.rawBoard,
      state.rawAction,
      true,
      true,
      true,
      state.rawPromotionPieces,
    )
    .filter((action: unknown) => chess.actionable(action));

  return rawActions.map((raw: unknown, index: number) => ({
    id: `A${String(index + 1).padStart(2, "0")}`,
    notation: chess.raw.pgnFuncs
      .fromAction(raw, state.rawBoard, state.rawAction, "", [], false, false, false)
      .trim(),
    raw,
  }));
}

export function applyAction(chess: ChessInstance, action: LegalAction): void {
  chess.action(action.raw);
}

export function resolveTerminalState(chess: ChessInstance): TerminalState {
  const legalActions = getLegalActions(chess);

  if (legalActions.length > 0) {
    return {
      terminal: false,
      result: null,
      reason: "ongoing",
    };
  }

  if (chess.inCheckmate) {
    return {
      terminal: true,
      result: chess.player === "white" ? "0-1" : "1-0",
      reason: "checkmate",
    };
  }

  if (chess.inStalemate) {
    return {
      terminal: true,
      result: "1/2-1/2",
      reason: "stalemate",
    };
  }

  return {
    terminal: true,
    result: "1/2-1/2",
    reason: "no-legal-actions",
  };
}

function normalizePieceSymbol(piece: string): string {
  return piece === "" ? "P" : piece;
}

export function createBoardMatrix(turn: BoardTurn): string[][] {
  const matrix = Array.from({ length: turn.height }, () => Array.from({ length: turn.width }, () => "."));

  for (const piece of turn.pieces) {
    const rankIndex = turn.height - piece.position.rank;
    const fileIndex = piece.position.file - 1;
    const symbol = normalizePieceSymbol(piece.piece);
    matrix[rankIndex][fileIndex] = piece.player === "white" ? symbol : symbol.toLowerCase();
  }

  return matrix;
}

export function getTimelineBoards(chess: ChessInstance): MatrixTimeline[] {
  const snapshot = getBoardSnapshot(chess);

  return snapshot.timelines
    .map((timeline: BoardTimeline) => {
      const currentTurn = timeline.turns[timeline.turns.length - 1];
      return {
        timeline: timeline.timeline,
        active: timeline.active,
        present: timeline.present,
        turn: currentTurn.turn,
        player: currentTurn.player,
        width: currentTurn.width,
        height: currentTurn.height,
        matrix: createBoardMatrix(currentTurn),
      };
    })
    .sort((a, b) => a.timeline - b.timeline);
}

export function matrixToAscii(matrix: string[][]): string {
  return matrix.map((row) => row.join(" ")).join("\n");
}

export function summarizeBoards(chess: ChessInstance): string {
  const boards = getTimelineBoards(chess);

  return boards
    .map((board) => {
      const flags = [board.present ? "present" : null, board.active ? "active" : null]
        .filter(Boolean)
        .join(", ");
      return `Timeline ${board.timeline}, T${board.turn}, ${board.player} board${flags ? ` (${flags})` : ""}\n${matrixToAscii(board.matrix)}`;
    })
    .join("\n\n");
}
