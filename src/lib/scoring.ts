import type {
  BenchmarkReport,
  CompetitorConfig,
  GameRecord,
  LeaderboardEntry,
  PositionRecord,
} from "./types";

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function computeArenaElo(
  games: GameRecord[],
  competitors: CompetitorConfig[],
  anchorId = "search-d2",
  anchorRating = 1800,
): Map<string, number> {
  const ratings = new Map<string, number>();

  for (const competitor of competitors) {
    ratings.set(competitor.id, 1500);
  }

  const kFactor = 24;
  for (const game of games) {
    const whiteRating = ratings.get(game.whiteCompetitorId) ?? 1500;
    const blackRating = ratings.get(game.blackCompetitorId) ?? 1500;
    const expectedWhite = 1 / (1 + 10 ** ((blackRating - whiteRating) / 400));
    const scoreWhite = game.result === "1-0" ? 1 : game.result === "0-1" ? 0 : 0.5;
    const delta = kFactor * (scoreWhite - expectedWhite);

    ratings.set(game.whiteCompetitorId, whiteRating + delta);
    ratings.set(game.blackCompetitorId, blackRating - delta);
  }

  const anchor = ratings.get(anchorId);
  const shift = anchor != null ? anchorRating - anchor : 1500 - average([...ratings.values()]);

  for (const [key, value] of ratings) {
    ratings.set(key, value + shift);
  }

  return ratings;
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildLeaderboard(
  competitors: CompetitorConfig[],
  games: GameRecord[],
  _positions: PositionRecord[],
): LeaderboardEntry[] {
  const ratings = computeArenaElo(games, competitors);

  const leaderboard = competitors.map((competitor) => {
    const competitorGames = games.filter(
      (game) => game.whiteCompetitorId === competitor.id || game.blackCompetitorId === competitor.id,
    );
    const wins = competitorGames.filter((game) => {
      if (game.result === "1-0") {
        return game.whiteCompetitorId === competitor.id;
      }
      if (game.result === "0-1") {
        return game.blackCompetitorId === competitor.id;
      }
      return false;
    }).length;
    const draws = competitorGames.filter((game) => game.result === "1/2-1/2").length;
    const losses = competitorGames.length - wins - draws;
    const scoreRate = competitorGames.length ? (wins + draws * 0.5) / competitorGames.length : 0;

    const gameTurns = competitorGames.flatMap((game) =>
      game.turns.filter((turn) => turn.competitorId === competitor.id),
    );
    const reliabilityTotals = gameTurns.reduce(
      (totals, turn) => {
        const stepCount = turn.decision.stepCount ?? 1;
        const validStepCount =
          turn.decision.validStepCount ?? (turn.decision.validChoice ? stepCount : 0);
        return {
          totalSteps: totals.totalSteps + stepCount,
          validSteps: totals.validSteps + validStepCount,
        };
      },
      { totalSteps: 0, validSteps: 0 },
    );
    const latencySource = gameTurns.map((turn) => turn.decision.latencyMs);

    return {
      rank: 0,
      competitorId: competitor.id,
      label: competitor.label,
      provider: competitor.provider,
      description: competitor.description,
      kind: competitor.kind,
      arenaElo: round(ratings.get(competitor.id) ?? 1500, 0),
      games: competitorGames.length,
      wins,
      draws,
      losses,
      scoreRate: round(scoreRate * 100, 1),
      reliability: round(
        reliabilityTotals.totalSteps
          ? (reliabilityTotals.validSteps / reliabilityTotals.totalSteps) * 100
          : 0,
        1,
      ),
      avgLatencyMs: round(average(latencySource), 0),
    };
  });

  leaderboard.sort((left, right) => {
    if (right.arenaElo !== left.arenaElo) {
      return right.arenaElo - left.arenaElo;
    }
    if (right.scoreRate !== left.scoreRate) {
      return right.scoreRate - left.scoreRate;
    }
    return right.reliability - left.reliability;
  });

  leaderboard.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return leaderboard;
}

export function attachLeaderboard(report: Omit<BenchmarkReport, "leaderboard">): BenchmarkReport {
  return {
    ...report,
    leaderboard: buildLeaderboard(report.competitors, report.games, report.positions),
  };
}
