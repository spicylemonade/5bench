import { createChessFromSetup, applyRawAction, exportPgn, summarizeBoards, getCurrentPlayer, getActionNumber } from "../src/lib/chess-node";
import { readFileSync } from "node:fs";

const r = JSON.parse(readFileSync("public/generated/benchmark-latest.json", "utf8"));
const g = r.games[0];
const chess = createChessFromSetup({ kind: "fresh", variant: "standard" });

const stopAfter = Number.parseInt(process.argv[2] ?? "10", 10);
for (let i = 0; i < stopAfter; i += 1) {
  applyRawAction(chess, g.turns[i].rawAction);
}

const history = exportPgn(chess)
  .trim()
  .split("\n")
  .filter(Boolean);
const recentHistory = history.slice(-8).join("\n");

console.log("================ Current player:", getCurrentPlayer(chess));
console.log("================ Action number:", getActionNumber(chess));
console.log("================ Recent 5DPGN context (last 8 lines sent to model):");
console.log(recentHistory);
console.log("================ summarizeBoards (multiverse board state sent to model):");
console.log(summarizeBoards(chess));
