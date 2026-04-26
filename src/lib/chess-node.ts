import Chess from "5d-chess-js";
import { createChessApi } from "./chess-common";

export const {
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
  formatRawAction,
  getActionNumber,
  getBoardSnapshot,
  getCurrentPlayer,
  getLegalActions,
  getLegalSubmoves,
  getPendingRawAction,
  getTimelineBoards,
  matrixToAscii,
  parseSubmittedTurn,
  passTurn,
  resolveTerminalState,
  submitTurn,
  summarizeBoards,
} = createChessApi(Chess);

export type { MatrixTimeline, TerminalState } from "./chess-common";
