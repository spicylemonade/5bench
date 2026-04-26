import { chooseCompetitorTurn } from "./bots";
import {
  applyRawAction,
  createChessFromSetup,
  exportPgn,
  getCurrentPlayer,
  passTurn,
  resolveTerminalState,
} from "./chess-node";
import { LlmClient } from "./llm-client";
import { attachLeaderboard } from "./scoring";
import type {
  BenchmarkReport,
  BenchmarkSeed,
  CompetitorConfig,
  GameRecord,
  PositionRecord,
} from "./types";

interface RunBenchmarkOptions {
  preset: string;
  competitors: CompetitorConfig[];
  arenaSeeds: BenchmarkSeed[];
  positionSeeds: BenchmarkSeed[];
  openRouterApiKey?: string;
  siteUrl?: string;
  existingGames?: GameRecord[];
  skipFixtureKeys?: Set<string>;
  onProgress?: (message: string) => void;
  onCheckpoint?: (report: BenchmarkReport) => Promise<void> | void;
}

function fixtureKey(seedId: string, whiteId: string, blackId: string): string {
  return `${seedId}::${whiteId}::${blackId}`;
}

function createArenaFixtures(competitors: CompetitorConfig[]): Array<[CompetitorConfig, CompetitorConfig]> {
  const fixtures: Array<[CompetitorConfig, CompetitorConfig]> = [];

  for (let left = 0; left < competitors.length; left += 1) {
    for (let right = left + 1; right < competitors.length; right += 1) {
      fixtures.push([competitors[left], competitors[right]]);
      fixtures.push([competitors[right], competitors[left]]);
    }
  }

  return fixtures;
}

function buildReport(
  options: RunBenchmarkOptions,
  games: GameRecord[],
  positions: PositionRecord[],
  completedGames: number,
  totalGames: number,
  completedPositions: number,
  totalPositions: number,
  status: "running" | "complete" | "failed",
): BenchmarkReport {
  return attachLeaderboard({
    generatedAt: new Date().toISOString(),
    benchmarkVersion: "fivebench-v1",
    preset: options.preset,
    progress: {
      status,
      completedGames,
      totalGames,
      completedPositions,
      totalPositions,
    },
    methodology: {
      arenaSummary:
        "Arena Elo comes from full head-to-head games between frontier models. Each pairing is played twice with colors swapped, and every arena game starts from the normal initial 5D chess board.",
      reliabilitySummary:
        "Legal Reliability measures how often a model returns a valid submitted 5DPGN sub-turn that the engine accepts during live arena games.",
      notes: [
        "v1 currently scores arena performance using head-to-head Elo plus valid-turn reliability.",
        "Arena play uses only the standard starting board to avoid start-position bias between models.",
        "The public leaderboard excludes internal engine baselines and updates incrementally as games finish.",
        "LLMs generate full 5DPGN turns directly from the board state with no enumerated legal-action list.",
        "If a model returns an invalid submitted turn, the engine rejects it and that model forfeits the game.",
      ],
    },
    competitors: options.competitors,
    arenaSeeds: options.arenaSeeds,
    positionSeeds: options.positionSeeds,
    games,
    positions,
  });
}

export async function playGame(
  seed: BenchmarkSeed,
  whiteCompetitor: CompetitorConfig,
  blackCompetitor: CompetitorConfig,
  llmClient?: LlmClient,
): Promise<GameRecord> {
  const chess = createChessFromSetup(seed.setup);
  const startPgn = exportPgn(chess);
  const startedAt = new Date().toISOString();
  const turns: GameRecord["turns"] = [];
  const seedActions = (chess.export("raw") as unknown[]).length;
  let additionalActionsPlayed = 0;

  while (true) {
    const terminal = resolveTerminalState(chess);
    if (terminal.terminal) {
      return {
        id: `${seed.id}-${whiteCompetitor.id}-vs-${blackCompetitor.id}`,
        seedId: seed.id,
        seedLabel: seed.label,
        whiteCompetitorId: whiteCompetitor.id,
        blackCompetitorId: blackCompetitor.id,
        whiteCompetitorLabel: whiteCompetitor.label,
        blackCompetitorLabel: blackCompetitor.label,
        startPgn,
        finalPgn: exportPgn(chess),
        result: terminal.result ?? "1/2-1/2",
        termination: terminal.reason,
        seedActions,
        additionalActionsPlayed,
        totalActions: (chess.export("raw") as unknown[]).length,
        turns,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }

    const currentPlayer = getCurrentPlayer(chess);
    const competitor = currentPlayer === "white" ? whiteCompetitor : blackCompetitor;
    const turn = await chooseCompetitorTurn({
      competitor,
      chess,
      seedLabel: seed.label,
      seedDescription: seed.description,
      llmClient,
    });

    turns.push({
      player: currentPlayer,
      competitorId: competitor.id,
      actionNumberBefore: chess.board.action as number,
      decision: turn.decision,
      rawAction: turn.rawAction,
    });

    if (turn.forfeit) {
      return {
        id: `${seed.id}-${whiteCompetitor.id}-vs-${blackCompetitor.id}`,
        seedId: seed.id,
        seedLabel: seed.label,
        whiteCompetitorId: whiteCompetitor.id,
        blackCompetitorId: blackCompetitor.id,
        whiteCompetitorLabel: whiteCompetitor.label,
        blackCompetitorLabel: blackCompetitor.label,
        startPgn,
        finalPgn: exportPgn(chess),
        result: currentPlayer === "white" ? "0-1" : "1-0",
        termination: turn.forfeitReason ?? "invalid-turn",
        seedActions,
        additionalActionsPlayed,
        totalActions: (chess.export("raw") as unknown[]).length,
        turns,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }

    if (turn.rawAction) {
      applyRawAction(chess, turn.rawAction);
    } else {
      passTurn(chess);
    }
    additionalActionsPlayed += 1;
  }
}

export async function runBenchmark(options: RunBenchmarkOptions): Promise<BenchmarkReport> {
  const llmCompetitors = options.competitors.filter((c) => c.kind === "llm");

  if (llmCompetitors.length > 0 && !options.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is required for LLM competitors.");
  }

  const client = llmCompetitors.length > 0
    ? new LlmClient({
        openRouterApiKey: options.openRouterApiKey,
        siteUrl: options.siteUrl,
      })
    : undefined;

  const games: GameRecord[] = [...(options.existingGames ?? [])];
  const positions: PositionRecord[] = [];
  const fixtures = createArenaFixtures(options.competitors);
  const skipKeys = options.skipFixtureKeys ?? new Set<string>();
  let completedGames = games.length;
  let completedPositions = 0;
  const totalGames = options.arenaSeeds.length * fixtures.length;
  const totalPositions = 0;

  if (options.onCheckpoint) {
    await options.onCheckpoint(
      buildReport(
        options,
        games,
        positions,
        completedGames,
        totalGames,
        completedPositions,
        totalPositions,
        "running",
      ),
    );
  }

  for (const seed of options.arenaSeeds) {
    for (const [white, black] of fixtures) {
      const key = fixtureKey(seed.id, white.id, black.id);
      if (skipKeys.has(key)) {
        options.onProgress?.(
          `Skipping arena game (resumed): ${seed.label} :: ${white.label} vs ${black.label}`,
        );
        continue;
      }

      options.onProgress?.(
        `Arena game ${completedGames + 1}/${totalGames}: ${seed.label} :: ${white.label} vs ${black.label}`,
      );
      games.push(await playGame(seed, white, black, client));
      completedGames += 1;
      if (options.onCheckpoint) {
        await options.onCheckpoint(
          buildReport(
            options,
            games,
            positions,
            completedGames,
            totalGames,
            completedPositions,
            totalPositions,
            "running",
          ),
        );
      }
    }
  }

  return buildReport(
    options,
    games,
    positions,
    completedGames,
    totalGames,
    completedPositions,
    totalPositions,
    "complete",
  );
}
