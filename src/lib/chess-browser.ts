import { createChessApi } from "./chess-common";

declare global {
  interface Window {
    Chess?: any;
  }
}

function getBrowserChess() {
  if (typeof window === "undefined" || !window.Chess) {
    throw new Error("Browser Chess engine was not loaded.");
  }

  return window.Chess;
}

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
  getAllTimelineBoards,
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
} = createChessApi(getBrowserChess());

export type { GridBoard, MatrixTimeline, MultiverseGrid, TerminalState } from "./chess-common";
