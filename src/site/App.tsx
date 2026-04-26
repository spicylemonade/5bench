import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  applyAction,
  applyRawAction,
  cloneChess,
  createChessFromSetup,
  createTruncatedChess,
  getAllTimelineBoards,
  getLegalActions,
  passTurn,
} from "../lib/chess-browser";
import type { GridBoard, MultiverseGrid } from "../lib/chess-browser";
import type { BenchmarkReport, GameRecord } from "../lib/types";

const REPORT_PATH = "/generated/benchmark-latest.json";
const PREVIEW_REPORT_PATH = "/generated/benchmark-preview.json";
const MISSING_REPORT_MESSAGE =
  "No generated benchmark report found yet. Run `npm run bench:smoke` or `npm run bench` first.";

function FiveBenchLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="8" height="8" rx="2" fill="#7c63f6" />
      <rect x="14" y="2" width="8" height="8" rx="2" fill="#b6a8ff" />
      <rect x="2" y="14" width="8" height="8" rx="2" fill="#cbbfff" />
      <rect x="14" y="14" width="8" height="8" rx="2" fill="#5f46e8" />
    </svg>
  );
}

function OpenAIIcon() {
  return (
    <svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z" />
    </svg>
  );
}

function AnthropicIcon() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fillRule="nonzero" />
    </svg>
  );
}

function GeminiIcon() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF" />
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gem-fill-0)" />
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gem-fill-1)" />
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gem-fill-2)" />
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id="gem-fill-0" x1="7" x2="11" y1="15.5" y2="12">
          <stop stopColor="#08B962" />
          <stop offset="1" stopColor="#08B962" stopOpacity="0" />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id="gem-fill-1" x1="8" x2="11.5" y1="5.5" y2="11">
          <stop stopColor="#F94543" />
          <stop offset="1" stopColor="#F94543" stopOpacity="0" />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id="gem-fill-2" x1="3.5" x2="17.5" y1="13.5" y2="12">
          <stop stopColor="#FABC12" />
          <stop offset=".46" stopColor="#FABC12" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function getProviderIcon(provider: string): ReactNode {
  const p = provider.toLowerCase();
  if (p.includes("openai")) return <OpenAIIcon />;
  if (p.includes("anthropic")) return <AnthropicIcon />;
  if (p.includes("google")) return <GeminiIcon />;
  return null;
}


const PIECE_MAP: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  U: "U",
  D: "D",
  S: "S",
  W: "W",
  C: "C",
  Y: "Y",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
  u: "u",
  d: "d",
  s: "s",
  w: "w",
  c: "c",
  y: "y",
  ".": "",
};

const DEFAULT_MULTIVERSE_ZOOM = 1;
const MIN_MULTIVERSE_ZOOM = 0.45;
const MAX_MULTIVERSE_ZOOM = 1.8;
const MULTIVERSE_ZOOM_STEP = 0.15;
const REPORT_REFRESH_MS = 10000;
const BOARD_SQUARE_PX = 16;
const BOARD_INSET_PX = 4;

type AppPage = "home" | "methodology";

interface RouteState {
  page: AppPage;
  anchor: string | null;
}

async function fetchReport(path: string): Promise<BenchmarkReport> {
  const response = await fetch(path, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });
  const rawReport = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const looksLikeHtml = rawReport.trimStart().startsWith("<");

  if (!response.ok || looksLikeHtml || !contentType.includes("application/json")) {
    throw new Error(MISSING_REPORT_MESSAGE);
  }

  return JSON.parse(rawReport) as BenchmarkReport;
}

function getRouteState(hash: string): RouteState {
  if (hash.startsWith("#/methodology")) {
    return { page: "methodology", anchor: null };
  }

  if (hash.startsWith("#/")) {
    return { page: "home", anchor: null };
  }

  const anchor = hash.replace(/^#/, "") || null;
  return { page: "home", anchor };
}

function useReport() {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestReportRef = useRef<BenchmarkReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function loadReport() {
      if (inFlight) {
        return;
      }

      inFlight = true;
      try {
        let data: BenchmarkReport;

        try {
          data = await fetchReport(REPORT_PATH);
        } catch {
          data = await fetchReport(PREVIEW_REPORT_PATH);
        }

        if (!cancelled) {
          setReport(data);
          latestReportRef.current = data;
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled && !latestReportRef.current) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        inFlight = false;
      }
    }

    void loadReport();

    const intervalId = window.setInterval(() => {
      void loadReport();
    }, REPORT_REFRESH_MS);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadReport();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return { report, error };
}

function useRoute() {
  const [route, setRoute] = useState<RouteState>(() => getRouteState(window.location.hash));

  useEffect(() => {
    const handleHashChange = () => setRoute(getRouteState(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return route;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatTermination(reason: string): string {
  switch (reason) {
    case "checkmate":
      return "Checkmate";
    case "stalemate":
      return "Stalemate";
    case "invalid-turn":
      return "Invalid turn forfeit";
    case "no-legal-actions":
      return "No legal actions";
    case "action-cap-draw":
      return "Adjudicated at cap: draw";
    case "action-cap-white-advantage":
      return "Adjudicated at cap: white advantage";
    case "action-cap-black-advantage":
      return "Adjudicated at cap: black advantage";
    default:
      return reason;
  }
}

interface ReplayMovePoint {
  timeline: number;
  turn: number;
  player: GridBoard["player"];
  coordinate: string;
  rank: number;
  file: number;
}

interface ReplayMoveTrace {
  start: ReplayMovePoint;
  end: ReplayMovePoint;
  realEnd: ReplayMovePoint;
  player: GridBoard["player"];
  multiverse: boolean;
}

function getBoardSlot(turn: number, player: GridBoard["player"]): number {
  return (turn - 1) * 2 + (player === "black" ? 1 : 0);
}

function getBoardSlotForGrid(board: GridBoard): number {
  return getBoardSlot(board.turn, board.player);
}

function getBoardId(timeline: number, slot: number): string {
  return `${timeline}:${slot}`;
}

function getBoardIdForGrid(board: GridBoard): string {
  return getBoardId(board.timeline, getBoardSlotForGrid(board));
}

function MiniBoard({ board, boardId }: { board: GridBoard; boardId: string }) {
  return (
    <div
      className="board-grid"
      style={{ gridTemplateColumns: `repeat(${board.width}, var(--sq, 18px))` }}
    >
      {board.matrix.flatMap((row, rowIndex) =>
        row.map((square, columnIndex) => {
          const dark = (rowIndex + columnIndex) % 2 === 1;
          const rank = board.height - rowIndex;
          const file = columnIndex + 1;
          return (
            <div
              className={`board-square ${dark ? "board-square--dark" : "board-square--light"}`}
              key={`${rowIndex}-${columnIndex}`}
              data-square={`${boardId}:${rank}:${file}`}
            >
              {PIECE_MAP[square] ?? square}
            </div>
          );
        }),
      )}
    </div>
  );
}

interface Arrow {
  kind: "line" | "curve";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  opacity: number;
  strokeWidth: number;
  markerId: string;
  path?: string;
}

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
}

function getSquareCenter(boardEl: HTMLDivElement, board: GridBoard, point: ReplayMovePoint): { x: number; y: number } {
  return {
    x: boardEl.offsetLeft + BOARD_INSET_PX + (point.file - 0.5) * BOARD_SQUARE_PX,
    y: boardEl.offsetTop + BOARD_INSET_PX + (board.height - point.rank + 0.5) * BOARD_SQUARE_PX,
  };
}

function createCurvedArrowPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  direction: 1 | -1,
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const normalX = (-dy / length) * direction;
  const normalY = (dx / length) * direction;
  const arc = Math.max(28, Math.min(120, length * 0.24));
  const controlX = midX + normalX * arc;
  const controlY = midY + normalY * arc;
  return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}

function MultiverseView({ grid, moveTraces }: { grid: MultiverseGrid; moveTraces: ReplayMoveTrace[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<PanState | null>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(DEFAULT_MULTIVERSE_ZOOM);
  const [isPanning, setIsPanning] = useState(false);
  const markerNamespace = useId().replace(/:/g, "");
  const timelineMarkerId = `${markerNamespace}-timeline`;
  const whiteMarkerId = `${markerNamespace}-white`;
  const blackMarkerId = `${markerNamespace}-black`;

  const boardsByKey = useMemo(() => {
    const map = new Map<string, GridBoard>();
    for (const board of grid.boards) {
      map.set(getBoardIdForGrid(board), board);
    }
    return map;
  }, [grid.boards]);

  const timelineIds = useMemo(() => {
    const set = new Set<number>();
    for (const board of grid.boards) set.add(board.timeline);
    return [...set].sort((a, b) => a - b);
  }, [grid.boards]);

  const slotRange = useMemo(() => {
    const turns = new Set<number>();
    for (const board of grid.boards) turns.add(getBoardSlotForGrid(board));
    const sorted = [...turns].sort((a, b) => a - b);
    return sorted;
  }, [grid.boards]);

  const slotsByTimeline = useMemo(() => {
    const map = new Map<number, number[]>();

    for (const board of grid.boards) {
      const slots = map.get(board.timeline) ?? [];
      slots.push(getBoardSlotForGrid(board));
      map.set(board.timeline, slots);
    }

    for (const [timeline, slots] of map.entries()) {
      map.set(
        timeline,
        [...new Set(slots)].sort((left, right) => left - right),
      );
    }

    return map;
  }, [grid.boards]);

  const computeArrows = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const nextArrows: Arrow[] = [];

    for (const board of grid.boards) {
      const boardSlot = getBoardSlotForGrid(board);
      const timelineSlots = slotsByTimeline.get(board.timeline) ?? [];
      const nextSlot = timelineSlots[timelineSlots.indexOf(boardSlot) + 1];
      if (nextSlot === undefined) continue;
      const hasNext = boardsByKey.has(getBoardId(board.timeline, nextSlot));
      if (!hasNext) continue;

      const fromEl = el.querySelector(`[data-board="${getBoardId(board.timeline, boardSlot)}"]`) as HTMLDivElement | null;
      const toEl = el.querySelector(`[data-board="${getBoardId(board.timeline, nextSlot)}"]`) as HTMLDivElement | null;
      if (!fromEl || !toEl) continue;

      nextArrows.push({
        kind: "line",
        x1: fromEl.offsetLeft + fromEl.offsetWidth,
        y1: fromEl.offsetTop + fromEl.offsetHeight / 2,
        x2: toEl.offsetLeft,
        y2: toEl.offsetTop + toEl.offsetHeight / 2,
        color: "#6b7280",
        opacity: 0.58,
        strokeWidth: 1.5,
        markerId: timelineMarkerId,
      });
    }

    for (const trace of moveTraces) {
      if (!trace.multiverse) {
        continue;
      }

      const fromBoardId = getBoardId(trace.start.timeline, getBoardSlot(trace.start.turn, trace.start.player));
      const toBoardId = getBoardId(trace.realEnd.timeline, getBoardSlot(trace.realEnd.turn, trace.realEnd.player));
      const fromBoardEl = el.querySelector(`[data-board="${fromBoardId}"]`) as HTMLDivElement | null;
      const toBoardEl = el.querySelector(`[data-board="${toBoardId}"]`) as HTMLDivElement | null;
      const fromBoard = boardsByKey.get(fromBoardId);
      const toBoard = boardsByKey.get(toBoardId);

      if (!fromBoardEl || !toBoardEl || !fromBoard || !toBoard) {
        continue;
      }

      const from = getSquareCenter(fromBoardEl, fromBoard, trace.start);
      const to = getSquareCenter(toBoardEl, toBoard, trace.realEnd);

      const isBlack = trace.player === "black";
      const path = createCurvedArrowPath(from, to, isBlack ? -1 : 1);

      nextArrows.push({
        kind: "curve",
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        color: isBlack ? "#c26a5a" : "#6f85b8",
        opacity: 0.92,
        strokeWidth: 2.4,
        markerId: isBlack ? blackMarkerId : whiteMarkerId,
        path,
      });
    }

    setSvgSize({ width: el.scrollWidth, height: el.scrollHeight });
    setArrows(nextArrows);
  }, [grid.boards, boardsByKey, slotsByTimeline, moveTraces, timelineMarkerId, whiteMarkerId, blackMarkerId]);

  useLayoutEffect(() => {
    computeArrows();
  }, [computeArrows, zoom]);

  useEffect(() => {
    const observer = new ResizeObserver(() => computeArrows());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [computeArrows]);

  const totalColumns = slotRange.length;
  const totalRows = timelineIds.length;
  const zoomPercent = Math.round(zoom * 100);

  const updateZoom = useCallback(
    (nextZoom: number, resetPan = false) => {
      const viewport = viewportRef.current;
      const clampedZoom = Math.min(MAX_MULTIVERSE_ZOOM, Math.max(MIN_MULTIVERSE_ZOOM, nextZoom));

      if (!viewport) {
        setZoom(clampedZoom);
        return;
      }

      if (Math.abs(clampedZoom - zoom) < 0.001) {
        if (resetPan) {
          viewport.scrollLeft = 0;
          viewport.scrollTop = 0;
        }
        return;
      }

      const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
      const centerY = viewport.scrollTop + viewport.clientHeight / 2;
      const ratio = clampedZoom / zoom;

      setZoom(clampedZoom);

      requestAnimationFrame(() => {
        if (resetPan) {
          viewport.scrollLeft = 0;
          viewport.scrollTop = 0;
          return;
        }

        viewport.scrollLeft = Math.max(0, centerX * ratio - viewport.clientWidth / 2);
        viewport.scrollTop = Math.max(0, centerY * ratio - viewport.clientHeight / 2);
      });
    },
    [zoom],
  );

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current;
    const container = containerRef.current;
    if (!viewport || !container) return;
    const naturalWidth = container.scrollWidth / zoom;
    const naturalHeight = container.scrollHeight / zoom;
    const availW = viewport.clientWidth - 24;
    const availH = viewport.clientHeight - 24;
    const nextZoom = Math.min(availW / naturalWidth, availH / naturalHeight);
    updateZoom(nextZoom, true);
  }, [updateZoom, zoom]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };

    setIsPanning(true);
    event.preventDefault();
    viewport.setPointerCapture?.(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const panState = panStateRef.current;
    if (!viewport || !panState || panState.pointerId !== event.pointerId) {
      return;
    }

    viewport.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
    viewport.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
  }, []);

  const stopPanning = useCallback((event?: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (event && viewport && panStateRef.current?.pointerId === event.pointerId) {
      viewport.releasePointerCapture?.(event.pointerId);
    }

    panStateRef.current = null;
    setIsPanning(false);
  }, []);

  const containerStyle = useMemo(
    () =>
      ({
        "--sq": "16px",
        "--sq-font": "11px",
        display: "grid",
        gridTemplateColumns: `32px repeat(${totalColumns}, auto)`,
        gridTemplateRows: `24px repeat(${totalRows}, auto)`,
        gap: "4px 10px",
        position: "relative",
        alignItems: "center",
        justifyItems: "center",
        transform: `scale(${zoom})`,
        transformOrigin: "0 0",
      }) as CSSProperties,
    [totalColumns, totalRows, zoom],
  );

  return (
    <div className="multiverse-wrapper">
      <div className="multiverse-toolbar">
        <div className="multiverse-axis-labels">
          <span className="multiverse-axis multiverse-axis--x">Turns &rarr;</span>
          <span className="multiverse-axis multiverse-axis--y">&darr; Timelines</span>
        </div>
        <div className="multiverse-controls">
          <span className="multiverse-hint">Drag to pan</span>
          <button
            className="multiverse-button"
            disabled={zoom <= MIN_MULTIVERSE_ZOOM + 0.001}
            onClick={() => updateZoom(zoom - MULTIVERSE_ZOOM_STEP)}
            type="button"
          >
            -
          </button>
          <button className="multiverse-button" onClick={() => updateZoom(DEFAULT_MULTIVERSE_ZOOM, true)} type="button">
            100%
          </button>
          <button
            className="multiverse-button"
            disabled={zoom >= MAX_MULTIVERSE_ZOOM - 0.001}
            onClick={() => updateZoom(zoom + MULTIVERSE_ZOOM_STEP)}
            type="button"
          >
            +
          </button>
          <button className="multiverse-button" onClick={fitToView} type="button">
            Fit
          </button>
          <span className="multiverse-zoom-label">{`${zoomPercent}%`}</span>
        </div>
      </div>
      <div
        className={`multiverse-scroll ${isPanning ? "multiverse-scroll--dragging" : ""}`}
        onDragStart={(event) => event.preventDefault()}
        onPointerCancel={stopPanning}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
        ref={viewportRef}
      >
        <div className="multiverse-container" ref={containerRef} style={containerStyle}>
          {/* Column headers (turn numbers) */}
          <div />
          {slotRange.map((slot) => (
            <div className="multiverse-col-header" key={`ch-${slot}`}>
              <span>{`T${Math.floor(slot / 2) + 1}`}</span>
              <small>{slot % 2 === 0 ? "W" : "B"}</small>
            </div>
          ))}

          {/* Rows */}
          {timelineIds.map((tl) => (
            <Fragment key={`tl-${tl}`}>
              <div className="multiverse-row-header" key={`rh-${tl}`}>
                L{tl}
              </div>
              {slotRange.map((slot) => {
                const board = boardsByKey.get(getBoardId(tl, slot));
                if (!board) {
                  return <div key={`empty-${tl}-${slot}`} />;
                }
                const boardId = getBoardId(tl, slot);
                return (
                  <div
                    className={`multiverse-cell ${board.present ? "multiverse-cell--present" : ""}`}
                    key={`${tl}-${slot}`}
                    data-board={boardId}
                  >
                    <MiniBoard board={board} boardId={boardId} />
                  </div>
                );
              })}
            </Fragment>
          ))}

          {/* Arrow overlay */}
          {arrows.length > 0 && (
            <svg
              className="multiverse-arrows"
              width={svgSize.width}
              height={svgSize.height}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                pointerEvents: "none",
              }}
            >
              <defs>
                <marker
                  id={timelineMarkerId}
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="#9ca3af" />
                </marker>
                <marker
                  id={whiteMarkerId}
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="#6f85b8" />
                </marker>
                <marker
                  id={blackMarkerId}
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="#c26a5a" />
                </marker>
              </defs>
              {arrows.map((a, i) =>
                a.kind === "curve" && a.path ? (
                  <path
                    key={i}
                    d={a.path}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={a.strokeWidth}
                    strokeLinecap="round"
                    markerEnd={`url(#${a.markerId})`}
                    opacity={a.opacity}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : (
                  <line
                    key={i}
                    x1={a.x1}
                    y1={a.y1}
                    x2={a.x2}
                    y2={a.y2}
                    stroke={a.color}
                    strokeWidth={a.strokeWidth}
                    strokeLinecap="round"
                    markerEnd={`url(#${a.markerId})`}
                    opacity={a.opacity}
                    vectorEffect="non-scaling-stroke"
                  />
                ),
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

function buildReplayGrid(game: GameRecord, actionIndex: number, seedActions: number): MultiverseGrid {
  const shouldUseTurnReplay = actionIndex >= seedActions;

  if (shouldUseTurnReplay) {
    try {
      const chess = createChessFromSetup({ kind: "pgn", pgn: game.startPgn });
      const replayedTurns = Math.min(game.turns.length, Math.max(0, actionIndex - seedActions));

      for (const turn of game.turns.slice(0, replayedTurns)) {
        if (turn.rawAction === null) {
          passTurn(chess);
          continue;
        }

        if (turn.rawAction) {
          applyRawAction(chess, turn.rawAction);
          continue;
        }

        const legalActions = getLegalActions(chess);
        const action =
          legalActions.find((candidate) => candidate.id === turn.decision.actionId) ??
          legalActions.find((candidate) => candidate.notation === turn.decision.notation);

        if (!action) {
          throw new Error(`Replay action not found for ${turn.decision.actionId} / ${turn.decision.notation}`);
        }

        applyAction(chess, action);
      }

      return getAllTimelineBoards(chess);
    } catch {
      // Fall back to PGN truncation for older reports that don't replay cleanly from turn records.
    }
  }

  const chess = createTruncatedChess(game.finalPgn, actionIndex);
  return getAllTimelineBoards(chess);
}

function buildReplayFrames(game: GameRecord, seedActions: number): Map<number, MultiverseGrid> {
  const frames = new Map<number, MultiverseGrid>();

  if (seedActions > 0) {
    for (let actionIndex = 0; actionIndex < seedActions; actionIndex += 1) {
      frames.set(actionIndex, buildReplayGrid(game, actionIndex, seedActions));
    }
  }

  try {
    const chess = createChessFromSetup({ kind: "pgn", pgn: game.startPgn });
    frames.set(seedActions, getAllTimelineBoards(chess));

    for (let index = 0; index < game.turns.length; index += 1) {
      const turn = game.turns[index];

      if (turn.rawAction === null) {
        passTurn(chess);
        frames.set(seedActions + index + 1, getAllTimelineBoards(chess));
        continue;
      }

      if (turn.rawAction) {
        applyRawAction(chess, turn.rawAction);
        frames.set(seedActions + index + 1, getAllTimelineBoards(chess));
        continue;
      }

      const legalActions = getLegalActions(chess);
      const action =
        legalActions.find((candidate) => candidate.id === turn.decision.actionId) ??
        legalActions.find((candidate) => candidate.notation === turn.decision.notation);

      if (!action) {
        throw new Error(`Replay action not found for ${turn.decision.actionId} / ${turn.decision.notation}`);
      }

      applyAction(chess, action);
      frames.set(seedActions + index + 1, getAllTimelineBoards(chess));
    }
  } catch {
    for (let actionIndex = seedActions; actionIndex <= game.totalActions; actionIndex += 1) {
      if (!frames.has(actionIndex)) {
        frames.set(actionIndex, buildReplayGrid(game, actionIndex, seedActions));
      }
    }
  }

  return frames;
}

interface ReplaySession {
  rawHistory: Array<unknown[] | null>;
  chessByAction: Map<number, any>;
  moveTracesByAction: Map<number, ReplayMoveTrace[]>;
}

function collectMoveTracesFromRawAction(chess: any, rawAction: unknown[] | null): ReplayMoveTrace[] | null {
  if (rawAction == null || rawAction.length === 0) {
    passTurn(chess);
    return [];
  }

  const traces: ReplayMoveTrace[] = [];

  for (const rawMove of rawAction) {
    const state = chess.state();
    const isTurnZero = chess.raw.boardFuncs.isTurnZero(state.rawBoard);
    const parsed = chess.raw.parseFuncs.fromMove(state.rawBoard, rawMove, isTurnZero);

    if (!parsed?.start || !parsed?.end || !parsed?.realEnd || !parsed?.player) {
      return null;
    }

    traces.push({
      start: parsed.start,
      end: parsed.end,
      realEnd: parsed.realEnd,
      player: parsed.player,
      multiverse: parsed.start.timeline !== parsed.end.timeline || parsed.end.turn < parsed.start.turn,
    });

    chess.move(rawMove);
  }

  chess.submit();
  return traces;
}

function getReplayRawHistory(game: GameRecord, seedActions: number): Array<unknown[] | null> | null {
  const turnsCoverReplay = game.turns.length === Math.max(0, game.totalActions - seedActions);
  const hasTurnRawHistory = game.turns.every((turn) => turn.rawAction === null || Array.isArray(turn.rawAction));

  if (turnsCoverReplay && hasTurnRawHistory) {
    return game.turns.map((turn) => turn.rawAction ?? null);
  }

  try {
    const fullGame = createChessFromSetup({ kind: "pgn", pgn: game.finalPgn });
    const fullRawHistory = fullGame.export("raw") as unknown[];
    return fullRawHistory.slice(seedActions).map((rawAction) => (Array.isArray(rawAction) ? rawAction : null));
  } catch {
    return null;
  }
}

function createReplaySession(
  game: GameRecord,
  seedActions: number,
  replayFrames: Map<number, MultiverseGrid>,
): ReplaySession | null {
  try {
    const startChess = createChessFromSetup({ kind: "pgn", pgn: game.startPgn });
    const rawHistory = getReplayRawHistory(game, seedActions);
    if (!rawHistory) {
      return null;
    }

    replayFrames.set(seedActions, getAllTimelineBoards(startChess));

    return {
      rawHistory,
      chessByAction: new Map([[seedActions, startChess]]),
      moveTracesByAction: new Map([[seedActions, []]]),
    };
  } catch {
    return null;
  }
}

function buildReplayGridFromSession(
  session: ReplaySession,
  replayFrames: Map<number, MultiverseGrid>,
  actionIndex: number,
  seedActions: number,
): MultiverseGrid | null {
  const cached = replayFrames.get(actionIndex);
  if (cached) {
    return cached;
  }

  if (actionIndex < seedActions) {
    return null;
  }

  const rawCountNeeded = actionIndex - seedActions;
  if (rawCountNeeded > session.rawHistory.length) {
    return null;
  }

  let nearestIndex = Number.NEGATIVE_INFINITY;
  let nearestChess: any | null = null;
  for (const [cachedIndex, cachedChess] of session.chessByAction.entries()) {
    if (cachedIndex <= actionIndex && cachedIndex > nearestIndex) {
      nearestIndex = cachedIndex;
      nearestChess = cachedChess;
    }
  }

  if (!nearestChess) {
    return null;
  }

  if (nearestIndex === actionIndex) {
    const grid = getAllTimelineBoards(nearestChess);
    replayFrames.set(actionIndex, grid);
    return grid;
  }

  const workingChess = cloneChess(nearestChess);
  for (let rawIndex = nearestIndex - seedActions; rawIndex < rawCountNeeded; rawIndex += 1) {
    const rawAction = session.rawHistory[rawIndex];
    if (rawAction === undefined) {
      return null;
    }

    if (rawAction == null || rawAction.length === 0) {
      passTurn(workingChess);
    } else {
      workingChess.action(rawAction);
    }

    const nextActionIndex = seedActions + rawIndex + 1;
    if (!session.chessByAction.has(nextActionIndex)) {
      session.chessByAction.set(nextActionIndex, cloneChess(workingChess));
    }

    if (!replayFrames.has(nextActionIndex)) {
      replayFrames.set(nextActionIndex, getAllTimelineBoards(workingChess));
    }
  }

  return replayFrames.get(actionIndex) ?? null;
}

function buildReplayMoveTracesFromSession(
  session: ReplaySession,
  actionIndex: number,
  seedActions: number,
): ReplayMoveTrace[] | null {
  const cached = session.moveTracesByAction.get(actionIndex);
  if (cached) {
    return cached;
  }

  if (actionIndex < seedActions) {
    return [];
  }

  const rawCountNeeded = actionIndex - seedActions;
  if (rawCountNeeded > session.rawHistory.length) {
    return null;
  }

  let nearestIndex = Number.NEGATIVE_INFINITY;
  let nearestTraces: ReplayMoveTrace[] | null = null;

  for (const [cachedIndex, cachedTraces] of session.moveTracesByAction.entries()) {
    if (cachedIndex <= actionIndex && cachedIndex > nearestIndex) {
      nearestIndex = cachedIndex;
      nearestTraces = cachedTraces;
    }
  }

  const nearestChess = session.chessByAction.get(nearestIndex) ?? null;

  if (!nearestChess || !nearestTraces) {
    return null;
  }

  if (nearestIndex === actionIndex) {
    return nearestTraces;
  }

  const workingChess = cloneChess(nearestChess);
  const workingTraces = nearestTraces.slice();

  for (let rawIndex = nearestIndex - seedActions; rawIndex < rawCountNeeded; rawIndex += 1) {
    const rawAction = session.rawHistory[rawIndex];
    const actionTraces = collectMoveTracesFromRawAction(workingChess, rawAction);

    if (actionTraces == null) {
      return null;
    }

    workingTraces.push(...actionTraces);

    const nextActionIndex = seedActions + rawIndex + 1;
    if (!session.chessByAction.has(nextActionIndex)) {
      session.chessByAction.set(nextActionIndex, cloneChess(workingChess));
    }
    if (!session.moveTracesByAction.has(nextActionIndex)) {
      session.moveTracesByAction.set(nextActionIndex, workingTraces.slice());
    }
  }

  return session.moveTracesByAction.get(actionIndex) ?? workingTraces;
}

function GameReplay({ game }: { game: GameRecord }) {
  const seedActions = game.seedActions ?? Math.max(0, game.totalActions - game.additionalActionsPlayed);
  const [actionIndex, setActionIndex] = useState<number>(seedActions);
  const [replaySession, setReplaySession] = useState<ReplaySession | null>(null);
  const replayFramesRef = useRef<Map<number, MultiverseGrid>>(new Map());
  const replayFrameRafRef = useRef<number | null>(null);
  const pendingActionIndexRef = useRef<number>(seedActions);

  useEffect(() => {
    setActionIndex(seedActions);
    pendingActionIndexRef.current = seedActions;
  }, [seedActions, game.id]);

  useEffect(() => {
    const replayFrames = new Map<number, MultiverseGrid>();
    replayFramesRef.current = replayFrames;
    setReplaySession(createReplaySession(game, seedActions, replayFrames));

    return () => {
      if (replayFrameRafRef.current != null) {
        window.cancelAnimationFrame(replayFrameRafRef.current);
        replayFrameRafRef.current = null;
      }
    };
  }, [game.id, game.startPgn, game.finalPgn, game.totalActions, game.completedAt, seedActions]);

  const grid = useMemo(() => {
    const cached = replayFramesRef.current.get(actionIndex);
    if (cached) {
      return cached;
    }

    if (replaySession) {
      const sessionGrid = buildReplayGridFromSession(replaySession, replayFramesRef.current, actionIndex, seedActions);
      if (sessionGrid) {
        return sessionGrid;
      }
    }

    const computed = buildReplayGrid(game, actionIndex, seedActions);
    replayFramesRef.current.set(actionIndex, computed);
    return computed;
  }, [actionIndex, replaySession, game.id, game.startPgn, game.finalPgn, game.totalActions, game.completedAt, seedActions]);

  const moveTraces = useMemo(() => {
    if (!replaySession) {
      return [];
    }

    return buildReplayMoveTracesFromSession(replaySession, actionIndex, seedActions) ?? [];
  }, [actionIndex, replaySession, game.id, game.startPgn, game.finalPgn, game.totalActions, game.completedAt, seedActions]);

  const handleReplaySliderChange = useCallback((nextActionIndex: number) => {
    pendingActionIndexRef.current = nextActionIndex;

    if (replayFrameRafRef.current != null) {
      return;
    }

    replayFrameRafRef.current = window.requestAnimationFrame(() => {
      replayFrameRafRef.current = null;
      setActionIndex(pendingActionIndexRef.current);
    });
  }, []);

  return (
    <div className="replay-panel">
      <div className="replay-meta">
        <div>
          <h3>{game.seedLabel}</h3>
          <p>{`${game.whiteCompetitorLabel} vs ${game.blackCompetitorLabel}`}</p>
        </div>
        <div className="replay-meta__stats">
          <span>{`Result ${game.result}`}</span>
          <span>{`Termination ${formatTermination(game.termination)}`}</span>
          <span>{`Played after seed ${game.additionalActionsPlayed}`}</span>
          {seedActions > 0 && <span>{`Seed actions ${seedActions}`}</span>}
          <span>{`Total actions ${game.totalActions}`}</span>
        </div>
      </div>

      <label className="slider-label" htmlFor="replay-slider">
        {`Replay total action ${actionIndex} / ${game.totalActions}`}
      </label>
      <input
        id="replay-slider"
        type="range"
        min={0}
        max={game.totalActions}
        value={actionIndex}
        onChange={(event) => handleReplaySliderChange(Number(event.target.value))}
      />

      <MultiverseView grid={grid} moveTraces={moveTraces} />

      <div className="game-turns">
        <h4>Benchmark Decisions</h4>
        <div className="game-turns__list">
          {game.turns.map((turn, index) => (
            <div className="turn-row" key={`${game.id}-${index}`}>
              <div className="turn-row__index">{turn.actionNumberBefore}</div>
              <div className="turn-row__body">
                <div className="turn-row__title">
                  <strong>{turn.competitorId}</strong>
                  <span>{turn.decision.notation}</span>
                </div>
                <div className="turn-row__meta">
                  <span>{turn.decision.validChoice ? "Valid" : "Invalid"}</span>
                  <span>{`${turn.decision.latencyMs} ms`}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopNav({ page }: { page: AppPage }) {
  return (
    <nav className="top-nav">
      <a className="brand" href="#">
        <span className="brand-logo">
          <FiveBenchLogo />
        </span>
        FiveBench
      </a>
      <div className="top-nav__links">
        {page === "methodology" ? (
          <>
            <a href="#">Home</a>
            <a aria-current="page" href="#/methodology">
              Methodology
            </a>
          </>
        ) : (
          <>
            <a href="#leaderboard">Leaderboard</a>
            <a href="#games">Games</a>
            <a href="#/methodology">Methodology</a>
          </>
        )}
      </div>
    </nav>
  );
}

function MethodologyPage({ report }: { report: BenchmarkReport }) {
  return (
    <main className="page page--narrow">
      <section className="page-title">
        <h1>Methodology</h1>
        <p>How FiveBench scores full 5D chess play.</p>
      </section>

      <section className="card methodology">
        <div className="methodology-grid">
          <article>
            <h3>Arena Elo</h3>
            <p>{report.methodology.arenaSummary}</p>
          </article>
          <article>
            <h3>Legal Reliability</h3>
            <p>{report.methodology.reliabilitySummary}</p>
          </article>
        </div>
        <div className="notes">
          {report.methodology.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

export function App() {
  const { report, error } = useReport();
  const route = useRoute();
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  useEffect(() => {
    if (!report) {
      return;
    }

    const topCompetitor = report.leaderboard[0]?.competitorId ?? null;
    setSelectedCompetitorId((current) => current ?? topCompetitor);
  }, [report]);

  const filteredGames = useMemo(() => {
    if (!report || !selectedCompetitorId) {
      return [];
    }

    return report.games.filter(
      (game) =>
        game.whiteCompetitorId === selectedCompetitorId || game.blackCompetitorId === selectedCompetitorId,
    );
  }, [report, selectedCompetitorId]);

  useEffect(() => {
    if (!filteredGames.length) {
      setSelectedGameId(null);
      return;
    }

    setSelectedGameId((current) => {
      if (current && filteredGames.some((game) => game.id === current)) {
        return current;
      }
      return filteredGames[0].id;
    });
  }, [filteredGames]);

  const selectedGame = filteredGames.find((game) => game.id === selectedGameId) ?? filteredGames[0] ?? null;
  const isLegacyCappedReport = Boolean(report?.games.some((game) => game.termination.startsWith("action-cap")));
  const liveProgress = report?.progress ?? null;
  const isRunning = liveProgress?.status === "running";
  const completedGames = Math.max(report?.games.length ?? 0, liveProgress?.completedGames ?? 0);
  const completedPositions = Math.max(report?.positions.length ?? 0, liveProgress?.completedPositions ?? 0);
  const totalPositions = liveProgress?.totalPositions ?? report?.positions.length ?? 0;
  const hasPositions = totalPositions > 0 || completedPositions > 0;
  const hasReport = Boolean(report);
  const selectedCompetitorLabel =
    report?.leaderboard.find((entry) => entry.competitorId === selectedCompetitorId)?.label ?? null;

  useEffect(() => {
    if (route.page === "methodology") {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    if (!route.anchor) {
      return;
    }

    const anchor = route.anchor;
    requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }, [route.page, route.anchor, hasReport]);

  if (error) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <h1>FiveBench</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <h1>FiveBench</h1>
          <p>Loading benchmark report&hellip;</p>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <TopNav page={route.page} />

      {route.page === "methodology" ? (
        <MethodologyPage report={report} />
      ) : (
        <main className="page">
          <section className="page-title">
            <h1>5D Chess</h1>
            <p>Frontier models playing full 5D chess games with replayable multiverse boards.</p>
            <div className="page-title__meta">
              <span>{`${completedGames}${liveProgress ? `/${liveProgress.totalGames}` : ""} games`}</span>
              {hasPositions && (
                <span>{`${completedPositions}${liveProgress ? `/${liveProgress.totalPositions}` : ""} positions`}</span>
              )}
              <span>{new Date(report.generatedAt).toLocaleString()}</span>
              {isRunning && <span>Live</span>}
            </div>
          </section>

          {isLegacyCappedReport && (
            <section className="legacy-warning">
              <strong>Report needs rerun</strong>
              <p>
                This saved JSON was generated before full-game arena mode and still contains capped
                benchmark episodes. Re-run the benchmark to populate true full games.
              </p>
            </section>
          )}

          <section className="card" id="leaderboard">
            <div className="section-heading">
              <div>
                <h2>Leaderboard</h2>
                <p>
                  {hasPositions
                    ? liveProgress
                      ? `${completedGames}/${liveProgress.totalGames} arena games • ${completedPositions}/${liveProgress.totalPositions} scored positions`
                      : `${report.games.length} arena games • ${report.positions.length} scored positions`
                    : liveProgress
                      ? `${completedGames}/${liveProgress.totalGames} arena games`
                      : `${report.games.length} arena games`}
                </p>
              </div>
            </div>

            <div className="leaderboard-table">
              <div className="leaderboard-table__head">
                <span>#</span>
                <span>Model</span>
                <span>5D Elo</span>
                <span>Reliability</span>
              </div>
              {report.leaderboard.map((entry) => (
                <button
                  className={`leaderboard-row ${
                    selectedCompetitorId === entry.competitorId ? "leaderboard-row--selected" : ""
                  }`}
                  key={entry.competitorId}
                  onClick={() => setSelectedCompetitorId(entry.competitorId)}
                  type="button"
                >
                  <span>
                    <span
                      className={`rank-badge ${entry.rank === 1 ? "rank-badge--1" : entry.rank === 2 ? "rank-badge--2" : "rank-badge--other"}`}
                    >
                      {entry.rank}
                    </span>
                  </span>
                  <span className="leaderboard-row__model">
                    <span className="model-icon">{getProviderIcon(entry.provider)}</span>
                    <span className="leaderboard-row__model-info">
                      <strong>{entry.label}</strong>
                      <small>{entry.provider}</small>
                    </span>
                  </span>
                  <span>{entry.arenaElo}</span>
                  <span>{formatPercent(entry.reliability)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="card" id="games">
            <div className="section-heading section-heading--stack">
              <div>
                <h2>Games</h2>
                <p>
                  {selectedCompetitorLabel
                    ? `${filteredGames.length} visible for ${selectedCompetitorLabel} • ${completedGames} total completed`
                    : `${completedGames} completed games`}
                </p>
              </div>
              <div className="filters">
                <label>
                  <span>Competitor</span>
                  <select
                    value={selectedCompetitorId ?? ""}
                    onChange={(event) => setSelectedCompetitorId(event.target.value)}
                  >
                    {report.leaderboard.map((entry) => (
                      <option key={entry.competitorId} value={entry.competitorId}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Game</span>
                  <select
                    value={selectedGame?.id ?? ""}
                    onChange={(event) => setSelectedGameId(event.target.value)}
                  >
                    {filteredGames.map((game) => (
                      <option key={game.id} value={game.id}>
                        {`${game.whiteCompetitorLabel} vs ${game.blackCompetitorLabel}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {selectedGame ? <GameReplay game={selectedGame} /> : <p>No games found for this competitor.</p>}
          </section>
        </main>
      )}
    </div>
  );
}
