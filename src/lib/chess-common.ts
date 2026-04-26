import type {
  BoardSnapshot,
  BoardTimeline,
  BoardTurn,
  LegalAction,
  PlayerColor,
  SeedSetup,
} from "./types";

type ChessConstructor = new (input?: unknown, variant?: unknown) => any;
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

export interface GridBoard {
  timeline: number;
  turn: number;
  player: PlayerColor;
  active: boolean;
  present: boolean;
  width: number;
  height: number;
  matrix: string[][];
}

export interface MultiverseGrid {
  boards: GridBoard[];
  minTimeline: number;
  maxTimeline: number;
  minTurn: number;
  maxTurn: number;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function createChessApi(ChessCtor: ChessConstructor) {
  function createChessFromSetup(setup: SeedSetup): ChessInstance {
    switch (setup.kind) {
      case "fresh":
        return new ChessCtor(undefined, setup.variant ?? "standard");
      case "pgn":
        return new ChessCtor(setup.pgn);
      case "truncate":
        return createTruncatedChess(setup.fullPgn, setup.replayActions);
    }
  }

  function createTruncatedChess(fullPgn: string, replayActions: number): ChessInstance {
    const fullGame = new ChessCtor(fullPgn);
    const fullState = fullGame.state();
    const rawHistory = (fullGame.export("raw") as unknown[]).slice(0, replayActions);
    const seed = new ChessCtor();

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

  function cloneChess(chess: ChessInstance): ChessInstance {
    return chess.copy();
  }

  function exportPgn(chess: ChessInstance): string {
    return chess.export("5dpgn");
  }

  function getBoardSnapshot(chess: ChessInstance): BoardSnapshot {
    return chess.board as BoardSnapshot;
  }

  function getCurrentPlayer(chess: ChessInstance): PlayerColor {
    return chess.player as PlayerColor;
  }

  function getActionNumber(chess: ChessInstance): number {
    return chess.actionNumber as number;
  }

  function getRawLegalSubmoves(chess: ChessInstance): unknown[] {
    const state = chess.state();
    const rawMoves = chess.raw.boardFuncs.moves(
      state.rawBoard,
      state.rawAction,
      true,
      false,
      false,
      state.rawPromotionPieces,
    ) as unknown[];

    return rawMoves.filter((move) => chess.moveable(move, rawMoves));
  }

  function getLegalSubmoves(chess: ChessInstance): LegalAction[] {
    const state = chess.state();
    const rawMoves = getRawLegalSubmoves(chess);

    return rawMoves.map((raw: unknown, index: number) => ({
      id: `M${String(index + 1).padStart(2, "0")}`,
      notation: chess.raw.pgnFuncs
        .fromMove(raw, state.rawBoard, state.rawAction, "", false, false, false)
        .trim(),
      raw,
    }));
  }

  function getRawLegalActions(chess: ChessInstance): unknown[] {
    const state = chess.state();
    const { actionFuncs, boardFuncs } = chess.raw;

    // `5d-chess-js` wires `promotionPieces` into `boardFuncs.moves()` as the
    // `spatialOnly` argument, which silently drops time-travel moves. Mirror the
    // library's action recursion here with the corrected call signature.
    // This enumerates fully submitted turns and can explode combinatorially on
    // branched positions, so use it only when a full submitted-turn list is
    // explicitly needed.
    const collectActions = (fullBoard: unknown): unknown[][] => {
      const moves = boardFuncs.moves(
        fullBoard,
        state.rawAction,
        true,
        false,
        false,
        state.rawPromotionPieces,
      ) as unknown[];
      const actions: unknown[][] = [];

      for (const move of moves as any[]) {
        const moddedBoard = boardFuncs.copy(fullBoard);

        if (
          !actionFuncs.newTimelineIsActive(moddedBoard, state.rawAction) &&
          !boardFuncs.positionIsLatest(moddedBoard, move[1])
        ) {
          continue;
        }

        boardFuncs.move(moddedBoard, move);

        if (boardFuncs.present(moddedBoard, state.rawAction).length > 0) {
          const nextActions = collectActions(moddedBoard);

          if (nextActions.length === 0) {
            actions.push([move]);
            continue;
          }

          for (const nextAction of nextActions) {
            actions.push([move, ...nextAction]);
          }

          continue;
        }

        actions.push([move]);
      }

      return actions;
    };

    return collectActions(state.rawBoard).filter((action) => chess.actionable(action));
  }

  function getLegalActions(chess: ChessInstance): LegalAction[] {
    const state = chess.state();
    const rawActions = getRawLegalActions(chess);

    return rawActions.map((raw: unknown, index: number) => ({
      id: `A${String(index + 1).padStart(2, "0")}`,
      notation: chess.raw.pgnFuncs
        .fromAction(raw, state.rawBoard, state.rawAction, "", [], false, false, false)
        .trim(),
      raw,
    }));
  }

  function getPendingRawAction(chess: ChessInstance): unknown[] {
    const state = chess.state();
    return deepClone((state.rawMoveBuffer ?? []) as unknown[]);
  }

  function formatRawAction(chess: ChessInstance, rawAction: unknown[] | null | undefined): string {
    if (!rawAction || rawAction.length === 0) {
      return "pass";
    }

    const state = chess.state();
    return chess.raw.pgnFuncs
      .fromAction(rawAction, state.rawBoard, state.rawAction, "", [], false, false, false)
      .trim();
  }

  function parseSubmittedTurn(
    chess: ChessInstance,
    notation: string,
  ): { rawAction: unknown[] | null; notation: string } {
    const trimmed = notation.trim();
    if (!trimmed) {
      throw new Error("Turn notation was empty.");
    }

    if (/^pass$/i.test(trimmed)) {
      if (!canPassTurn(chess)) {
        throw new Error("Pass was not legal in this position.");
      }

      return {
        rawAction: null,
        notation: "pass",
      };
    }

    const beforeHistoryLength = ((chess.export("raw") as unknown[]) ?? []).length;
    const nextChess = cloneChess(chess);
    nextChess.action(trimmed);

    const afterHistory = nextChess.export("raw") as unknown[];
    const rawAction = afterHistory[beforeHistoryLength];
    if (!Array.isArray(rawAction)) {
      throw new Error(`Turn notation did not produce a submitted action: ${trimmed}`);
    }

    return {
      rawAction: deepClone(rawAction as unknown[]),
      notation: formatRawAction(chess, rawAction as unknown[]),
    };
  }

  function applyRawAction(chess: ChessInstance, rawAction: unknown[]): void {
    chess.action(rawAction);
  }

  function applyAction(chess: ChessInstance, action: LegalAction): void {
    chess.action(action.raw);
  }

  function applySubmove(chess: ChessInstance, action: LegalAction): void {
    chess.move(action.raw);
  }

  function canSubmitTurn(chess: ChessInstance): boolean {
    return chess.submittable();
  }

  function submitTurn(chess: ChessInstance): void {
    chess.submit();
  }

  function canPassTurn(chess: ChessInstance): boolean {
    return chess.passable();
  }

  function passTurn(chess: ChessInstance): void {
    chess.pass();
  }

  function resolveTerminalState(chess: ChessInstance): TerminalState {
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

    if (getLegalSubmoves(chess).length > 0 || canPassTurn(chess) || canSubmitTurn(chess)) {
      return {
        terminal: false,
        result: null,
        reason: "ongoing",
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

  function createBoardMatrix(turn: BoardTurn): string[][] {
    const matrix = Array.from({ length: turn.height }, () => Array.from({ length: turn.width }, () => "."));

    for (const piece of turn.pieces) {
      const rankIndex = turn.height - piece.position.rank;
      const fileIndex = piece.position.file - 1;
      const symbol = normalizePieceSymbol(piece.piece);
      matrix[rankIndex][fileIndex] = piece.player === "white" ? symbol : symbol.toLowerCase();
    }

    return matrix;
  }

  function getTimelineBoards(chess: ChessInstance): MatrixTimeline[] {
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

  function getAllTimelineBoards(chess: ChessInstance): MultiverseGrid {
    const snapshot = getBoardSnapshot(chess);

    const boards: GridBoard[] = [];
    let minTimeline = Infinity;
    let maxTimeline = -Infinity;
    let minTurn = Infinity;
    let maxTurn = -Infinity;

    for (const timeline of snapshot.timelines) {
      for (const turn of timeline.turns) {
        const board: GridBoard = {
          timeline: timeline.timeline,
          turn: turn.turn,
          player: turn.player,
          active: timeline.active,
          present: timeline.present,
          width: turn.width,
          height: turn.height,
          matrix: createBoardMatrix(turn),
        };
        boards.push(board);

        minTimeline = Math.min(minTimeline, timeline.timeline);
        maxTimeline = Math.max(maxTimeline, timeline.timeline);
        minTurn = Math.min(minTurn, turn.turn);
        maxTurn = Math.max(maxTurn, turn.turn);
      }
    }

    boards.sort((a, b) => a.timeline !== b.timeline ? a.timeline - b.timeline : a.turn - b.turn);

    return {
      boards,
      minTimeline,
      maxTimeline,
      minTurn,
      maxTurn,
    };
  }

  function matrixToAscii(matrix: string[][]): string {
    return matrix.map((row) => row.join(" ")).join("\n");
  }

  function summarizeBoards(chess: ChessInstance): string {
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

  return {
    applyAction,
    applyRawAction,
    applySubmove,
    canPassTurn,
    canSubmitTurn,
    cloneChess,
    createBoardMatrix,
    createChessFromSetup,
    createTruncatedChess,
    exportPgn,
    getActionNumber,
    getAllTimelineBoards,
    getBoardSnapshot,
    getCurrentPlayer,
    getLegalActions,
    getLegalSubmoves,
    getPendingRawAction,
    getTimelineBoards,
    matrixToAscii,
    formatRawAction,
    parseSubmittedTurn,
    passTurn,
    resolveTerminalState,
    submitTurn,
    summarizeBoards,
  };
}
