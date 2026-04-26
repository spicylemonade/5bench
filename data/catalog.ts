import type { BenchmarkSeed, CompetitorConfig } from "../src/lib/types";

export const COMPETITORS: CompetitorConfig[] = [
  {
    id: "openai-gpt-5.4",
    label: "GPT-5.4",
    provider: "OpenAI via OpenRouter",
    description: "XHigh reasoning via OpenRouter",
    kind: "llm",
    model: "openai/gpt-5.4",
  },
  {
    id: "openai-gpt-5.5",
    label: "GPT-5.5",
    provider: "OpenAI via OpenRouter",
    description: "XHigh reasoning via OpenRouter",
    kind: "llm",
    model: "openai/gpt-5.5",
  },
  {
    id: "anthropic-claude-opus-4.6",
    label: "Claude Opus 4.6",
    provider: "Anthropic via OpenRouter",
    description: "XHigh reasoning via OpenRouter",
    kind: "llm",
    model: "anthropic/claude-opus-4.6",
  },
  {
    id: "anthropic-claude-opus-4.7",
    label: "Claude Opus 4.7",
    provider: "Anthropic via OpenRouter",
    description: "XHigh reasoning via OpenRouter",
    kind: "llm",
    model: "anthropic/claude-opus-4.7",
  },
  {
    id: "google-gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    provider: "Google via OpenRouter",
    description: "XHigh reasoning via OpenRouter",
    kind: "llm",
    model: "google/gemini-3.1-pro-preview",
  },
  {
    id: "search-d1",
    label: "SearchBot d1",
    provider: "Local engine",
    description: "Material-plus-mobility heuristic, depth 1",
    kind: "engine",
    engineKind: "search",
    searchDepth: 1,
    beamWidth: 10,
  },
  {
    id: "search-d2",
    label: "SearchBot d2",
    provider: "Local engine",
    description: "Material-plus-mobility heuristic, depth 2 with narrow beam",
    kind: "engine",
    engineKind: "search",
    searchDepth: 2,
    beamWidth: 3,
  },
  {
    id: "random",
    label: "Random",
    provider: "Local engine",
    description: "Uniform random legal action",
    kind: "engine",
    engineKind: "random",
  },
];

const STANDARD_LADDER = `[Board "Standard"]
[Mode "5D"]

1. e4 / c6
2. c3 / Nf6
3. e5 / Ne4
4. Qf3 / Ng5
5. Qh5 / e6
6. d4 / Qc7`;

const HALF_REFLECTED_PREFIX = `[Mode "5D"]
[Board "Standard - Half Reflected"]
[Size "8x8"]
[White "Shad Amethyst"]
[Black "PseudoAbstractMeta"]
[Date "2021.01.22"]
[Result "1-0"]

1. f4 / e5
2. f5 / f6
3. g3 / Bd6
4. b3 / Qh5
5. Bh3 / Qg5
6. Nf3 / (0T6)Qg5>>x(0T4)g3+~
7. (-1T5)hxg3 / (-1T5)e4
8. (-1T6)e3 / (-1T6)g6
9. (0T7)Bh3>>x(0T5)h5~ / (1T5)Nc6
10. (1T6)Be8+ / (1T6)Kxe8
11. (-1T7)Ne2 (1T7)e3 / (-1T7)gxf5 (0T7)Ne7 (1T7)h5
12. (0T8)Nf3>x(-1T8)f5 (1T8)Nh3 / (-1T8)Qg6 (0T8)Bd6>(1T8)d5
13. (1T9)Nh3>>x(1T8)h5~ / (2T8)Kd8
14. (0T9)Rf1 (-1T9)Nxd6 (2T9)Qg4 / (-1T9)cxd6 (0T9)Ng8 (1T9)Nd4 (2T9)b6
15. (-1T10)Ba3 (0T10)Ba3 (1T10)exd4 (2T10)Ne2 / (-1T10)f5 (0T10)d6 (1T10)b6 (2T10)Nge7
16. (-1T11)Rg1 (0T11)Qd1>(2T11)f3 (1T11)Nc3 / (-1T11)Nc6 (0T11)Nc6 (1T11)Bxh1 (2T11)Bb7
17. (-1T12)Nf4 (0T12)Nc3 (2T12)Rh1>x(1T12)h1 / (-1T12)Qg6>>x(-1T9)d6~ (>L-2)
18. (-2T10)Rg1 / (-2T10)h5`;

export const ARENA_SEEDS: BenchmarkSeed[] = [
  {
    id: "standard-start",
    label: "Standard Start",
    description: "Fresh standard 8x8 position from move one.",
    category: "arena",
    source: "FiveBench",
    setup: { kind: "fresh", variant: "standard" },
    tags: ["opening", "standard", "white-to-move"],
  },
];

export const POSITION_SEEDS: BenchmarkSeed[] = [
  {
    id: "standard-ladder-white",
    label: "Standard Ladder White",
    description: "A grounded standard position from a forcing opening ladder, white to move.",
    category: "position",
    source: "FiveBench",
    setup: {
      kind: "pgn",
      pgn: STANDARD_LADDER,
    },
    tags: ["standard", "opening", "white-to-move", "8x8"],
  },
  {
    id: "standard-ladder-black",
    label: "Standard Ladder Black",
    description: "Black to move in the same forcing opening ladder.",
    category: "position",
    source: "FiveBench",
    setup: {
      kind: "truncate",
      fullPgn: STANDARD_LADDER,
      replayActions: 11,
    },
    tags: ["standard", "opening", "black-to-move", "8x8"],
  },
  {
    id: "half-reflected-early",
    label: "Half-Reflected Early",
    description: "White to move in an early multiverse branch with several legal jumps available.",
    category: "position",
    source: "Shad Amethyst vs PseudoAbstractMeta",
    setup: {
      kind: "truncate",
      fullPgn: HALF_REFLECTED_PREFIX,
      replayActions: 14,
    },
    tags: ["multiverse", "white-to-move", "8x8"],
  },
  {
    id: "half-reflected-black",
    label: "Half-Reflected Black",
    description: "Black to move in an already branched 8x8 multiverse position.",
    category: "position",
    source: "Shad Amethyst vs PseudoAbstractMeta",
    setup: {
      kind: "truncate",
      fullPgn: HALF_REFLECTED_PREFIX,
      replayActions: 17,
    },
    tags: ["multiverse", "black-to-move", "8x8"],
  },
  {
    id: "half-reflected-white",
    label: "Half-Reflected White",
    description: "White to move in a dense 8x8 multiverse position.",
    category: "position",
    source: "Shad Amethyst vs PseudoAbstractMeta",
    setup: {
      kind: "truncate",
      fullPgn: HALF_REFLECTED_PREFIX,
      replayActions: 18,
    },
    tags: ["multiverse", "white-to-move", "8x8"],
  },
];
