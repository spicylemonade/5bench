import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ARENA_SEEDS, COMPETITORS } from "../data/catalog";
import { runBenchmark } from "../src/lib/benchmark";
import type { BenchmarkReport, GameRecord } from "../src/lib/types";

type Preset = "smoke" | "pilot";

const PUBLIC_COMPETITOR_IDS = [
  "openai-gpt-5.4",
  "openai-gpt-5.5",
  "anthropic-claude-opus-4.6",
  "anthropic-claude-opus-4.7",
  "google-gemini-3.1-pro-preview",
];

const RESUME_MIN_ACTIONS = 5;

function parsePreset(argv: string[]): Preset {
  const presetArgIndex = argv.findIndex((value) => value === "--preset");
  const preset = presetArgIndex >= 0 ? argv[presetArgIndex + 1] : "pilot";

  if (preset === "smoke" || preset === "pilot") {
    return preset;
  }

  throw new Error(`Unsupported preset "${preset}". Use --preset smoke or --preset pilot.`);
}

function parseResume(argv: string[]): boolean {
  return argv.includes("--resume");
}

function fixtureKey(seedId: string, whiteId: string, blackId: string): string {
  return `${seedId}::${whiteId}::${blackId}`;
}

function collectResumedGames(report: BenchmarkReport | null): {
  games: GameRecord[];
  keys: Set<string>;
} {
  if (!report || !Array.isArray(report.games)) {
    return { games: [], keys: new Set() };
  }

  const keep: GameRecord[] = [];
  const keys = new Set<string>();

  for (const game of report.games) {
    if ((game.totalActions ?? 0) < RESUME_MIN_ACTIONS) continue;
    if (game.termination === "invalid-turn" && (game.totalActions ?? 0) < RESUME_MIN_ACTIONS) continue;
    keep.push(game);
    keys.add(fixtureKey(game.seedId, game.whiteCompetitorId, game.blackCompetitorId));
  }

  return { games: keep, keys };
}

function timestampLabel(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "-",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

async function writeJsonAtomic(filePath: string, report: BenchmarkReport): Promise<void> {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, json, "utf8");
  await rename(tempPath, filePath);
}

async function readExistingReport(filePath: string): Promise<BenchmarkReport | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as BenchmarkReport;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    console.warn(`Unable to read existing report at ${filePath}; continuing with overwrite.`);
    return null;
  }
}

function getProgressSnapshot(report: BenchmarkReport) {
  return {
    completedGames: report.progress?.completedGames ?? report.games.length,
    completedPositions: report.progress?.completedPositions ?? report.positions.length,
    gamesLength: report.games.length,
    positionsLength: report.positions.length,
    status: report.progress?.status ?? "complete",
    generatedAtMs: Date.parse(report.generatedAt) || 0,
  };
}

function getStatusRank(status: "running" | "complete" | "failed"): number {
  switch (status) {
    case "running":
      return 0;
    case "failed":
      return 1;
    case "complete":
      return 2;
  }
}

function compareReportFreshness(next: BenchmarkReport, current: BenchmarkReport): number {
  const nextSnapshot = getProgressSnapshot(next);
  const currentSnapshot = getProgressSnapshot(current);

  if (nextSnapshot.completedGames !== currentSnapshot.completedGames) {
    return nextSnapshot.completedGames - currentSnapshot.completedGames;
  }

  if (nextSnapshot.completedPositions !== currentSnapshot.completedPositions) {
    return nextSnapshot.completedPositions - currentSnapshot.completedPositions;
  }

  if (nextSnapshot.gamesLength !== currentSnapshot.gamesLength) {
    return nextSnapshot.gamesLength - currentSnapshot.gamesLength;
  }

  if (nextSnapshot.positionsLength !== currentSnapshot.positionsLength) {
    return nextSnapshot.positionsLength - currentSnapshot.positionsLength;
  }

  if (nextSnapshot.status !== currentSnapshot.status) {
    return getStatusRank(nextSnapshot.status) - getStatusRank(currentSnapshot.status);
  }

  return nextSnapshot.generatedAtMs - currentSnapshot.generatedAtMs;
}

async function writeLatestReport(filePath: string, report: BenchmarkReport): Promise<void> {
  const existing = await readExistingReport(filePath);

  if (existing && compareReportFreshness(report, existing) < 0) {
    const nextSnapshot = getProgressSnapshot(report);
    const existingSnapshot = getProgressSnapshot(existing);
    console.warn(
      [
        `Skipping stale write to ${path.basename(filePath)}.`,
        `Existing progress: ${existingSnapshot.completedGames} games, ${existingSnapshot.completedPositions} positions, ${existingSnapshot.status}.`,
        `Incoming progress: ${nextSnapshot.completedGames} games, ${nextSnapshot.completedPositions} positions, ${nextSnapshot.status}.`,
      ].join(" "),
    );
    return;
  }

  await writeJsonAtomic(filePath, report);
}

function getPresetConfig(preset: Preset) {
  if (preset === "smoke") {
    return {
      competitors: COMPETITORS.filter((competitor) =>
        ["openai-gpt-5.4", "anthropic-claude-opus-4.6"].includes(competitor.id),
      ),
      arenaSeeds: ARENA_SEEDS.filter((seed) => seed.id === "standard-start"),
      positionSeeds: [],
    };
  }

  return {
    competitors: COMPETITORS.filter((competitor) => PUBLIC_COMPETITOR_IDS.includes(competitor.id)),
    arenaSeeds: ARENA_SEEDS.filter((seed) => seed.id === "standard-start"),
    positionSeeds: [],
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const preset = parsePreset(argv);
  const resume = parseResume(argv);
  const config = getPresetConfig(preset);
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const root = process.cwd();
  const archiveDir = path.join(root, "public", "generated", "archive");
  const latestPath = path.join(root, "public", "generated", "benchmark-latest.json");

  await mkdir(archiveDir, { recursive: true });

  let resumedGames: GameRecord[] = [];
  let skipFixtureKeys: Set<string> = new Set();
  if (resume) {
    const existing = await readExistingReport(latestPath);
    const collected = collectResumedGames(existing);
    resumedGames = collected.games;
    skipFixtureKeys = collected.keys;
    console.log(
      `[resume] Keeping ${resumedGames.length} existing game(s) with >= ${RESUME_MIN_ACTIONS} actions; re-running everything else.`,
    );
    for (const game of resumedGames) {
      console.log(`[resume] keep ${game.id} (${game.totalActions} actions, ${game.result})`);
    }
  }

  const report = await runBenchmark({
    preset,
    competitors: config.competitors,
    arenaSeeds: config.arenaSeeds,
    positionSeeds: config.positionSeeds,
    openRouterApiKey,
    existingGames: resumedGames,
    skipFixtureKeys,
    onProgress: (message) => {
      console.log(`[progress] ${message}`);
    },
    onCheckpoint: async (partialReport) => {
      const isFreshRunReset =
        partialReport.progress?.status === "running" &&
        (partialReport.progress?.completedGames ?? 0) === 0 &&
        (partialReport.progress?.completedPositions ?? 0) === 0 &&
        partialReport.games.length === 0 &&
        partialReport.positions.length === 0;

      if (isFreshRunReset) {
        await writeJsonAtomic(latestPath, partialReport);
        return;
      }

      await writeLatestReport(latestPath, partialReport);
    },
  });

  const archivePath = path.join(archiveDir, `benchmark-${timestampLabel()}.json`);

  await writeLatestReport(latestPath, report);
  await writeJsonAtomic(archivePath, report);

  const summary = report.leaderboard
    .map(
      (entry) =>
        `${entry.rank}. ${entry.label} | Elo ${entry.arenaElo} | Reliability ${entry.reliability}%`,
    )
    .join("\n");

  console.log(`Saved benchmark report to ${latestPath}`);
  console.log(`Archived benchmark report at ${archivePath}`);
  console.log(summary);
}

main().catch(async (error) => {
  const latestPath = path.join(process.cwd(), "public", "generated", "benchmark-latest.json");
  const existing = await readExistingReport(latestPath);

  if (existing?.progress?.status === "running") {
    await writeLatestReport(latestPath, {
      ...existing,
      generatedAt: new Date().toISOString(),
      progress: {
        ...existing.progress,
        status: "failed",
      },
    });
  }

  console.error(error);
  process.exitCode = 1;
});
