export type PlayerColor = "white" | "black";

export type EngineKind = "random" | "search";

export type CompetitorKind = "llm" | "engine";

export interface CompetitorConfig {
  id: string;
  label: string;
  provider: string;
  description: string;
  kind: CompetitorKind;
  model?: string;
  engineKind?: EngineKind;
  searchDepth?: number;
  beamWidth?: number;
}

export interface BenchmarkSeed {
  id: string;
  label: string;
  description: string;
  category: "arena" | "position";
  source: string;
  setup: SeedSetup;
  tags: string[];
}

export type SeedSetup =
  | {
      kind: "fresh";
      variant?: string;
    }
  | {
      kind: "pgn";
      pgn: string;
    }
  | {
      kind: "truncate";
      fullPgn: string;
      replayActions: number;
    };

export interface LegalAction {
  id: string;
  notation: string;
  raw: unknown;
}

export interface BoardPiece {
  position: {
    timeline: number;
    turn: number;
    player: PlayerColor;
    coordinate: string;
    rank: number;
    file: number;
  };
  piece: string;
  player: PlayerColor;
  hasMoved: boolean;
}

export interface BoardTurn {
  turn: number;
  player: PlayerColor;
  width: number;
  height: number;
  pieces: BoardPiece[];
}

export interface BoardTimeline {
  timeline: number;
  player: PlayerColor;
  active: boolean;
  present: boolean;
  turns: BoardTurn[];
}

export interface BoardSnapshot {
  action: number;
  player: PlayerColor;
  width: number;
  height: number;
  timelines: BoardTimeline[];
}

export interface ActionDecision {
  actionId: string;
  notation: string;
  validChoice: boolean;
  fallbackUsed: boolean;
  stepCount?: number;
  validStepCount?: number;
  confidence?: number;
  notes?: string;
  rawResponse?: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  latencyMs: number;
}

export interface TurnRecord {
  player: PlayerColor;
  competitorId: string;
  actionNumberBefore: number;
  decision: ActionDecision;
  rawAction?: unknown[] | null;
}

export interface GameRecord {
  id: string;
  seedId: string;
  seedLabel: string;
  whiteCompetitorId: string;
  blackCompetitorId: string;
  whiteCompetitorLabel: string;
  blackCompetitorLabel: string;
  startPgn: string;
  finalPgn: string;
  result: "1-0" | "0-1" | "1/2-1/2";
  termination: string;
  seedActions: number;
  additionalActionsPlayed: number;
  totalActions: number;
  turns: TurnRecord[];
  startedAt: string;
  completedAt: string;
}

export interface PositionRecord {
  seedId: string;
  seedLabel: string;
  competitorId: string;
  competitorLabel: string;
  playerToMove: PlayerColor;
  actionId: string;
  notation: string;
  normalizedScore: number;
  validChoice: boolean;
  fallbackUsed: boolean;
  oracleBestActionId: string;
  oracleBestNotation: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  latencyMs: number;
}

export interface LeaderboardEntry {
  rank: number;
  competitorId: string;
  label: string;
  provider: string;
  description: string;
  kind: CompetitorKind;
  arenaElo: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  scoreRate: number;
  reliability: number;
  avgLatencyMs: number;
}

export interface BenchmarkReport {
  generatedAt: string;
  benchmarkVersion: string;
  preset: string;
  progress?: {
    status: "running" | "complete" | "failed";
    completedGames: number;
    totalGames: number;
    completedPositions: number;
    totalPositions: number;
  };
  methodology: {
    arenaSummary: string;
    reliabilitySummary: string;
    notes: string[];
  };
  competitors: CompetitorConfig[];
  arenaSeeds: BenchmarkSeed[];
  positionSeeds: BenchmarkSeed[];
  leaderboard: LeaderboardEntry[];
  games: GameRecord[];
  positions: PositionRecord[];
}
