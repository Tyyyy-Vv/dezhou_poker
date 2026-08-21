"use client";

import { useEffect, useRef, useState } from "react";

type View = "table" | "account";
type RecordTab = "funds" | "games";

type ActionType = "raise" | "call" | "check" | "fold" | "thinking" | "waiting" | "allin" | "win" | "out";

type PlayerAction = {
  label: string;
  type: ActionType;
  committed: number;
  folded?: boolean;
};

const players = [
  { id: "azhe", name: "阿哲", className: "seat top" },
  { id: "mia", name: "Mia", className: "seat right" },
  { id: "oldfox", name: "Old Fox", className: "seat left" },
  { id: "kai", name: "Kai", className: "seat bottom-left" },
  { id: "lynn", name: "Lynn", className: "seat bottom-right" },
];

const tableNames: Record<string, string> = {
  hero: "我",
  azhe: "阿哲",
  mia: "Mia",
  oldfox: "Old Fox",
  kai: "Kai",
  lynn: "Lynn",
};

const aiProfiles: Record<string, { aggression: number; looseness: number }> = {
  azhe: { aggression: .58, looseness: .48 },
  mia: { aggression: .78, looseness: .62 },
  oldfox: { aggression: .38, looseness: .3 },
  kai: { aggression: .68, looseness: .54 },
  lynn: { aggression: .52, looseness: .44 },
};

// Clockwise seat order around the felt, starting from the hero at the bottom.
const playerIds = ["hero", "kai", "oldfox", "azhe", "mia", "lynn"];
const initialStacks: Record<string, number> = Object.fromEntries(playerIds.map((id) => [id, 2000]));
const suits = ["♠", "♥", "♦", "♣"] as const;
const ranks = [
  { rank: "2", value: 2 }, { rank: "3", value: 3 }, { rank: "4", value: 4 },
  { rank: "5", value: 5 }, { rank: "6", value: 6 }, { rank: "7", value: 7 },
  { rank: "8", value: 8 }, { rank: "9", value: 9 }, { rank: "10", value: 10 },
  { rank: "J", value: 11 }, { rank: "Q", value: 12 }, { rank: "K", value: 13 }, { rank: "A", value: 14 },
];

type Card = { rank: string; value: number; suit: typeof suits[number] };
type Street = "preflop" | "flop" | "turn" | "river";
type PositionCode = "BTN" | "BTN/SB" | "SB" | "BB" | "UTG" | "HJ" | "CO";
type GamePhase = "betting" | "opponents" | "dealing" | "showdown" | "payout" | "gameover";
type ActionLogItem = { name: string; text: string; time: string; type: string };
type PotAward = { label: string; amount: number; winnerIds: string[]; isRefund?: boolean };
type HandResult = { winnerIds: string[]; label: string; amount: number; showdown: boolean; pots: PotAward[] };
type HandHistoryRecord = {
  id: string;
  playedAt?: string;
  time: string;
  handNumber: number;
  handCode: number;
  stakes: string;
  heroCards: string;
  board: string;
  result: string;
  delta: number;
  actions: ActionLogItem[];
  pots: PotAward[];
};

type AccountUser = {
  userId: string;
  displayName: string;
  email: string;
};

type HistoryStatus = "checking" | "local" | "syncing" | "synced" | "error";

type HistoryApiPayload = {
  authenticated?: boolean;
  user?: AccountUser;
  records?: HandHistoryRecord[];
  error?: string;
};

type GameState = {
  handNumber: number;
  handCode: number;
  bigBlind: number;
  positions: Partial<Record<string, PositionCode>>;
  dealerId: string;
  smallBlindId: string;
  bigBlindId: string;
  street: Street;
  stacks: Record<string, number>;
  startingStacks: Record<string, number>;
  hands: Record<string, Card[]>;
  board: Card[];
  visibleBoard: number;
  folded: Record<string, boolean>;
  actions: Record<string, PlayerAction>;
  handCommitted: Record<string, number>;
  acted: Record<string, boolean>;
  raiseRights: Record<string, boolean>;
  actingPlayer: string | null;
  pot: number;
  lastPot: number;
  callAmount: number;
  minRaise: number;
  hasFullBet: boolean;
  raisesThisStreet: number;
  phase: GamePhase;
  prompt: string;
  heroAction: string;
  log: ActionLogItem[];
  timeline: ActionLogItem[];
  result: HandResult | null;
  championId: string | null;
};

const seededRandom = (seed: number) => () => {
  seed |= 0;
  seed = seed + 0x6d2b79f5 | 0;
  let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
  value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
};

const createDeck = () => suits.flatMap((suit) => ranks.map(({ rank, value }) => ({ rank, value, suit })));

const shuffle = <T,>(items: T[], random: () => number = Math.random) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

const compareScores = (left: number[], right: number[]) => {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) - (right[index] ?? 0);
  }
  return 0;
};

const evaluateFive = (cards: Card[]) => {
  const values = cards.map((card) => card.value).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const unique = [...new Set(values)];
  if (unique.includes(14)) unique.push(1);
  let straightHigh = 0;
  for (let index = 0; index <= unique.length - 5; index += 1) {
    if (unique[index] - unique[index + 4] === 4) straightHigh = Math.max(straightHigh, unique[index]);
  }
  const flush = cards.every((card) => card.suit === cards[0].suit);

  if (flush && straightHigh) return { score: [8, straightHigh], label: "同花顺" };
  if (groups[0][1] === 4) return { score: [7, groups[0][0], groups[1][0]], label: "四条" };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { score: [6, groups[0][0], groups[1][0]], label: "葫芦" };
  if (flush) return { score: [5, ...values], label: "同花" };
  if (straightHigh) return { score: [4, straightHigh], label: "顺子" };
  if (groups[0][1] === 3) return { score: [3, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)], label: "三条" };
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    return { score: [2, ...pairs, groups.find(([, count]) => count === 1)?.[0] ?? 0], label: "两对" };
  }
  if (groups[0][1] === 2) return { score: [1, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)], label: "一对" };
  return { score: [0, ...values], label: "高牌" };
};

const bestHand = (cards: Card[]) => {
  if (cards.length < 5) {
    const values = cards.map((card) => card.value).sort((a, b) => b - a);
    if (cards.length === 2 && values[0] === values[1]) return { score: [1, values[0]], label: "口袋对子" };
    return { score: [0, ...values], label: "高牌" };
  }
  let best = { score: [-1], label: "高牌" };
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const result = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (compareScores(result.score, best.score) > 0) best = result;
          }
        }
      }
    }
  }
  return best;
};

const positionLabels: Record<PositionCode, string> = {
  BTN: "庄家 BTN",
  "BTN/SB": "庄家 / 小盲",
  SB: "小盲 SB",
  BB: "大盲 BB",
  UTG: "枪口 UTG",
  HJ: "劫持 HJ",
  CO: "关煞 CO",
};

const buildPositions = (activeIds: string[], handNumber: number, previousDealerId?: string) => {
  const nextDealerId = previousDealerId ? clockwiseAfter(previousDealerId, activeIds)[0] : activeIds[(handNumber - 1) % activeIds.length];
  const buttonIndex = Math.max(0, activeIds.indexOf(nextDealerId));
  const clockwise = [...activeIds.slice(buttonIndex), ...activeIds.slice(0, buttonIndex)];
  const labelsByCount: Record<number, PositionCode[]> = {
    2: ["BTN/SB", "BB"],
    3: ["BTN", "SB", "BB"],
    4: ["BTN", "SB", "BB", "CO"],
    5: ["BTN", "SB", "BB", "UTG", "CO"],
    6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  };
  const labels = labelsByCount[activeIds.length] ?? ["BTN"];
  const positions: Partial<Record<string, PositionCode>> = {};
  clockwise.forEach((id, index) => { positions[id] = labels[index]; });
  const headsUp = activeIds.length === 2;
  return {
    positions,
    dealerId: clockwise[0],
    smallBlindId: headsUp ? clockwise[0] : clockwise[1],
    bigBlindId: headsUp ? clockwise[1] : clockwise[2],
  };
};

const clockwiseAfter = (anchorId: string, eligibleIds: string[]) => {
  const anchorIndex = playerIds.indexOf(anchorId);
  return Array.from({ length: playerIds.length }, (_, offset) => playerIds[(anchorIndex + offset + 1) % playerIds.length])
    .filter((id) => eligibleIds.includes(id));
};

const actionOrderForStreet = (state: GameState) => {
  const dealtIds = playerIds.filter((id) => state.hands[id]);
  return clockwiseAfter(state.street === "preflop" ? state.bigBlindId : state.dealerId, dealtIds);
};

const needsAction = (state: GameState, id: string) => Boolean(
  state.hands[id]
  && !state.folded[id]
  && state.stacks[id] > 0
  && (!state.acted[id] || (state.actions[id]?.committed ?? 0) < state.callAmount)
);

const nextActorAfter = (state: GameState, actorId?: string) => {
  const order = actionOrderForStreet(state);
  if (!order.length) return null;
  const startIndex = actorId ? order.indexOf(actorId) : -1;
  for (let offset = 1; offset <= order.length; offset += 1) {
    const id = order[(startIndex + offset) % order.length];
    if (needsAction(state, id)) return id;
  }
  return null;
};

const actorPrompt = (state: GameState, id: string) => {
  const position = state.positions[id] ? positionLabels[state.positions[id]!] : "";
  const committed = state.actions[id]?.committed ?? 0;
  const due = Math.min(state.stacks[id], Math.max(0, state.callAmount - committed));
  if (id !== "hero") return `${position} · ${tableNames[id]} 正在行动`;
  if (due > 0) return `${streetLabels[state.street]} · 需跟注 ¥${due}`;
  return `${streetLabels[state.street]} · 可以过牌或下注`;
};

const minimumRaiseTarget = (state: GameState) => state.hasFullBet
  ? state.callAmount + state.minRaise
  : state.bigBlind;

const preflopStrength = (cards: Card[]) => {
  const [first, second] = [...cards].sort((left, right) => right.value - left.value);
  if (first.value === second.value) return Math.min(.99, .56 + (first.value - 2) * .035);
  let strength = first.value / 14 * .43 + second.value / 14 * .2;
  if (first.suit === second.suit) strength += .07;
  const gap = first.value - second.value;
  if (gap === 1) strength += .06;
  else if (gap === 2) strength += .035;
  if (second.value >= 10) strength += .1;
  if (first.value === 14) strength += .04;
  return Math.max(.18, Math.min(.96, strength));
};

const estimateHandStrength = (state: GameState, id: string) => {
  const holeCards = state.hands[id];
  if (!holeCards) return 0;
  if (state.street === "preflop") return preflopStrength(holeCards);
  const visibleCards = [...holeCards, ...state.board.slice(0, state.visibleBoard)];
  const result = bestHand(visibleCards);
  const categoryBase = [.22, .46, .66, .76, .84, .89, .95, .985, 1][result.score[0]] ?? .2;
  const kicker = (result.score[1] ?? 0) / 14 * .05;
  const suitCounts = suits.map((suit) => visibleCards.filter((card) => card.suit === suit).length);
  const flushDraw = Math.max(...suitCounts) === 4 ? .07 : 0;
  const uniqueValues = [...new Set(visibleCards.map((card) => card.value).concat(visibleCards.some((card) => card.value === 14) ? [1] : []))].sort((a, b) => a - b);
  const straightDraw = uniqueValues.some((value, index) => uniqueValues.slice(index).some((high) => high - value <= 4 && uniqueValues.filter((candidate) => candidate >= value && candidate <= value + 4).length >= 4)) ? .045 : 0;
  return Math.min(1, categoryBase + kicker + flushDraw + straightDraw);
};

const cardKey = (card: Card) => `${card.rank}${card.suit}`;

const estimateShowdownEquity = (state: GameState, id: string, trials = 42) => {
  const holeCards = state.hands[id];
  if (!holeCards) return 0;
  const opponentCount = Math.max(1, playerIds.filter((playerId) => playerId !== id && state.hands[playerId] && !state.folded[playerId]).length);
  const visibleBoard = state.board.slice(0, state.visibleBoard);
  const known = new Set([...holeCards, ...visibleBoard].map(cardKey));
  const unseen = createDeck().filter((card) => !known.has(cardKey(card)));
  let equity = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const sample = shuffle(unseen);
    let cursor = 0;
    const runout = [...visibleBoard];
    while (runout.length < 5) runout.push(sample[cursor++]);
    const heroScore = bestHand([...holeCards, ...runout]).score;
    let beaten = false;
    let ties = 0;
    for (let opponent = 0; opponent < opponentCount; opponent += 1) {
      const opponentScore = bestHand([sample[cursor++], sample[cursor++], ...runout]).score;
      const comparison = compareScores(heroScore, opponentScore);
      if (comparison < 0) {
        beaten = true;
        break;
      }
      if (comparison === 0) ties += 1;
    }
    if (!beaten) equity += 1 / (ties + 1);
  }
  return equity / trials;
};

const createHand = (previousStacks: Record<string, number>, handNumber: number, seed?: number, previousDealerId?: string): GameState => {
  const random = seed === undefined ? Math.random : seededRandom(seed);
  const activeIds = playerIds.filter((id) => previousStacks[id] > 0);
  const deck = shuffle(createDeck(), random);
  const hands: Record<string, Card[]> = {};
  activeIds.forEach((id) => { hands[id] = []; });
  for (let round = 0; round < 2; round += 1) activeIds.forEach((id) => hands[id].push(deck.pop()!));
  const board = Array.from({ length: 5 }, () => deck.pop()!);
  const bigBlind = Math.min(640, 40 * 2 ** Math.floor((handNumber - 1) / 4));
  const smallBlind = bigBlind / 2;
  const { positions, dealerId, smallBlindId, bigBlindId } = buildPositions(activeIds, handNumber, previousDealerId);
  const stacks = { ...previousStacks };
  const actions: Record<string, PlayerAction> = {};
  const folded: Record<string, boolean> = {};
  const handCommitted: Record<string, number> = Object.fromEntries(playerIds.map((id) => [id, 0]));
  const acted: Record<string, boolean> = {};
  const raiseRights: Record<string, boolean> = {};
  let pot = 0;

  playerIds.forEach((id) => {
    if (!activeIds.includes(id)) {
      folded[id] = true;
      acted[id] = true;
      raiseRights[id] = false;
      actions[id] = { label: "已淘汰", type: "out", committed: 0, folded: true };
      return;
    }
    folded[id] = false;
    acted[id] = false;
    raiseRights[id] = stacks[id] > 0;
    actions[id] = { label: "等待行动", type: "waiting", committed: 0 };
  });

  const postBlind = (id: string, amount: number, label: string) => {
    const paid = Math.min(amount, stacks[id]);
    stacks[id] -= paid;
    pot += paid;
    handCommitted[id] += paid;
    if (stacks[id] === 0) {
      acted[id] = true;
      raiseRights[id] = false;
    }
    actions[id] = {
      label: stacks[id] === 0 ? `${label}全下 ¥${paid}` : `${label} ¥${paid}`,
      type: stacks[id] === 0 ? "allin" : "waiting",
      committed: paid,
    };
  };
  postBlind(smallBlindId, smallBlind, "小盲");
  postBlind(bigBlindId, bigBlind, "大盲");

  const callAmount = bigBlind;
  const playersWithChips = activeIds.filter((id) => stacks[id] > 0);
  const lonePlayerOwesBlind = playersWithChips.length === 1 && (actions[playersWithChips[0]]?.committed ?? 0) < callAmount;
  const actingPlayer = playersWithChips.length > 1 || lonePlayerOwesBlind
    ? clockwiseAfter(bigBlindId, activeIds).find((id) => stacks[id] > 0) ?? null
    : null;
  const initialTimeline: ActionLogItem[] = [
    { name: "系统", text: `第 ${handNumber} 手牌已发出 · ${tableNames[dealerId]}在庄位`, time: "刚刚", type: "deal" },
    { name: tableNames[smallBlindId], text: `小盲 ¥${Math.min(smallBlind, previousStacks[smallBlindId])}`, time: "刚刚", type: "call" },
    { name: tableNames[bigBlindId], text: `大盲 ¥${Math.min(bigBlind, previousStacks[bigBlindId])}`, time: "刚刚", type: "call" },
  ];
  const initialState: GameState = {
    handNumber,
    handCode: 820000 + Math.floor(random() * 9999),
    bigBlind,
    positions,
    dealerId,
    smallBlindId,
    bigBlindId,
    street: "preflop",
    stacks,
    startingStacks: { ...previousStacks },
    hands,
    board,
    visibleBoard: 0,
    folded,
    actions,
    handCommitted,
    acted,
    raiseRights,
    actingPlayer,
    pot,
    lastPot: 0,
    callAmount,
    minRaise: bigBlind,
    hasFullBet: true,
    raisesThisStreet: 0,
    phase: actingPlayer === "hero" ? "betting" : "opponents",
    prompt: actingPlayer ? `${positionLabels[positions[actingPlayer]!]} · ${tableNames[actingPlayer]} 率先行动` : "所有剩余玩家均已全下",
    heroAction: actions.hero?.committed > 0 ? actions.hero.label : "",
    log: [...initialTimeline].reverse(),
    timeline: initialTimeline,
    result: null,
    championId: null,
  };
  if (actingPlayer) initialState.prompt = actorPrompt(initialState, actingPlayer);
  return actingPlayer ? initialState : dealNextStreet(initialState);
};

const streetLabels: Record<Street, string> = {
  preflop: "翻牌前",
  flop: "翻牌圈",
  turn: "转牌圈",
  river: "河牌圈",
};

const dealNextStreet = (current: GameState): GameState => {
  const nextStreet: Street = current.street === "preflop" ? "flop" : current.street === "flop" ? "turn" : "river";
  const visibleBoard = nextStreet === "flop" ? 3 : nextStreet === "turn" ? 4 : 5;
  const cardsText = nextStreet === "flop"
    ? current.board.slice(0, 3).map((card) => `${card.rank}${card.suit}`).join(" ")
    : `${current.board[visibleBoard - 1].rank}${current.board[visibleBoard - 1].suit}`;
  const timelineEntry: ActionLogItem = { name: "系统", text: `${streetLabels[nextStreet]} ${cardsText}`, time: "刚刚", type: "deal" };

  return {
    ...current,
    street: nextStreet,
    phase: "dealing",
    visibleBoard,
    actingPlayer: null,
    prompt: `${streetLabels[nextStreet]} ${cardsText} 已发出`,
    log: [timelineEntry, ...current.log].slice(0, 6),
    timeline: [...current.timeline, timelineEntry],
  };
};

const prepareStreetBetting = (current: GameState): GameState => {
  const callAmount = 0;
  const actions: Record<string, PlayerAction> = {};
  const acted: Record<string, boolean> = {};
  const raiseRights: Record<string, boolean> = {};
  playerIds.forEach((id) => {
    const canAct = Boolean(current.hands[id]) && !current.folded[id] && current.stacks[id] > 0;
    acted[id] = !canAct;
    raiseRights[id] = canAct;
    if (!current.hands[id]) actions[id] = { label: "已淘汰", type: "out", committed: 0, folded: true };
    else if (current.folded[id]) actions[id] = { label: "本手已弃牌", type: "fold", committed: 0, folded: true };
    else if (current.stacks[id] === 0) actions[id] = { label: "全下等待", type: "allin", committed: 0 };
    else actions[id] = { label: "等待行动", type: "waiting", committed: 0 };
  });
  const prepared: GameState = {
    ...current,
    actions,
    acted,
    raiseRights,
    callAmount,
    minRaise: current.bigBlind,
    hasFullBet: false,
    raisesThisStreet: 0,
    phase: "opponents",
    actingPlayer: null,
    heroAction: current.folded.hero ? "本手已弃牌" : current.stacks.hero === 0 && current.hands.hero ? "全下等待" : "",
    prompt: `${streetLabels[current.street]} · 等待首位玩家行动`,
  };
  const contenders = playerIds.filter((id) => prepared.hands[id] && !prepared.folded[id]);
  if (contenders.length <= 1) return { ...prepared, phase: "showdown", prompt: "其他玩家均已弃牌 · 正在结算" };
  const playersWithChips = contenders.filter((id) => prepared.stacks[id] > 0);
  if (playersWithChips.length <= 1) {
    if (prepared.street === "river") return { ...prepared, phase: "showdown", prompt: "全下牌局 · 正在摊牌" };
    return dealNextStreet(prepared);
  }
  const actingPlayer = nextActorAfter(prepared) ?? null;
  if (!actingPlayer) {
    if (prepared.street === "river") return { ...prepared, phase: "showdown", prompt: "所有玩家均已全下 · 正在摊牌" };
    return dealNextStreet(prepared);
  }
  return {
    ...prepared,
    actingPlayer,
    phase: actingPlayer === "hero" ? "betting" : "opponents",
    prompt: actorPrompt(prepared, actingPlayer),
  };
};

const advanceBetting = (current: GameState, actorId: string): GameState => {
  const contenders = playerIds.filter((id) => current.hands[id] && !current.folded[id]);
  if (contenders.length <= 1) {
    return { ...current, actingPlayer: null, phase: "showdown", prompt: "其他玩家均已弃牌 · 正在结算" };
  }
  const nextActor = nextActorAfter(current, actorId);
  if (nextActor) {
    return {
      ...current,
      actingPlayer: nextActor,
      phase: nextActor === "hero" ? "betting" : "opponents",
      prompt: actorPrompt(current, nextActor),
    };
  }
  if (current.street === "river") {
    return { ...current, actingPlayer: null, phase: "showdown", prompt: "河牌行动结束 · 正在比较最佳五张牌" };
  }
  return dealNextStreet(current);
};

type BettingChoice = { kind: "fold" | "check" | "call" | "raise"; target?: number };

const applyBettingChoice = (current: GameState, id: string, choice: BettingChoice): GameState => {
  if (current.actingPlayer !== id || !current.hands[id] || current.folded[id] || current.stacks[id] <= 0) return current;
  const stacks = { ...current.stacks };
  const folded = { ...current.folded };
  const actions = { ...current.actions };
  const handCommitted = { ...current.handCommitted };
  const acted = { ...current.acted };
  const raiseRights = { ...current.raiseRights };
  const committed = actions[id]?.committed ?? 0;
  const toCall = Math.max(0, current.callAmount - committed);
  let callAmount = current.callAmount;
  let minRaise = current.minRaise;
  let hasFullBet = current.hasFullBet;
  let raisesThisStreet = current.raisesThisStreet;
  let contribution = 0;
  let label = "";
  let actionType: ActionType = "check";
  let fullRaise = false;
  let shortAllInRaise = false;

  if (choice.kind === "fold") {
    folded[id] = true;
    acted[id] = true;
    raiseRights[id] = false;
    label = "弃牌";
    actionType = "fold";
    actions[id] = { label, type: actionType, committed, folded: true };
  } else if (choice.kind === "raise" && raiseRights[id] && committed + stacks[id] > current.callAmount) {
    const maximumTarget = committed + stacks[id];
    const minimumTarget = minimumRaiseTarget(current);
    let target = Math.min(maximumTarget, Math.max(current.callAmount + 1, choice.target ?? minimumTarget));
    if (target < minimumTarget && target < maximumTarget) target = Math.min(maximumTarget, minimumTarget);
    contribution = target - committed;
    const raiseSize = target - current.callAmount;
    fullRaise = current.hasFullBet ? raiseSize >= current.minRaise : target >= current.bigBlind;
    shortAllInRaise = !fullRaise && target === maximumTarget;
    if (!fullRaise && !shortAllInRaise) {
      target = Math.min(maximumTarget, minimumTarget);
      contribution = target - committed;
      fullRaise = current.hasFullBet ? target - current.callAmount >= current.minRaise : target >= current.bigBlind;
    }
    stacks[id] -= contribution;
    handCommitted[id] += contribution;
    callAmount = target;
    if (fullRaise) {
      minRaise = current.hasFullBet ? raiseSize : target;
      hasFullBet = true;
    }
    raisesThisStreet += 1;
    const allIn = stacks[id] === 0;
    label = allIn ? `全下至 ¥${target}` : current.callAmount === 0 ? `下注 ¥${target}` : `加注至 ¥${target}`;
    actionType = allIn ? "allin" : "raise";
    actions[id] = { label, type: actionType, committed: target };

    if (fullRaise) {
      playerIds.forEach((playerId) => {
        const canRespond = playerId !== id && current.hands[playerId] && !folded[playerId] && stacks[playerId] > 0;
        if (canRespond) {
          acted[playerId] = false;
          raiseRights[playerId] = true;
        }
      });
    } else {
      playerIds.forEach((playerId) => {
        const owesShortRaise = playerId !== id && current.hands[playerId] && !folded[playerId] && stacks[playerId] > 0
          && (actions[playerId]?.committed ?? 0) < callAmount;
        if (owesShortRaise) {
          acted[playerId] = false;
          // A first wager always creates a new decision; a short re-raise does not reopen raising rights.
          if (current.callAmount === 0) raiseRights[playerId] = true;
        }
      });
    }
    acted[id] = true;
    raiseRights[id] = false;
  } else {
    contribution = choice.kind === "check" ? 0 : Math.min(stacks[id], toCall);
    if (toCall > 0 && contribution === 0) return current;
    stacks[id] -= contribution;
    handCommitted[id] += contribution;
    const allIn = stacks[id] === 0;
    label = contribution === 0 ? "过牌" : allIn ? `全下跟注 ¥${contribution}` : `跟注 ¥${contribution}`;
    actionType = contribution === 0 ? "check" : allIn ? "allin" : "call";
    actions[id] = { label, type: actionType, committed: committed + contribution };
    acted[id] = true;
    raiseRights[id] = false;
  }

  const timelineEntry: ActionLogItem = { name: tableNames[id], text: `${current.positions[id] ? positionLabels[current.positions[id]!] : ""} · ${label}`, time: "刚刚", type: actionType };
  const next: GameState = {
    ...current,
    stacks,
    folded,
    actions,
    handCommitted,
    acted,
    raiseRights,
    actingPlayer: null,
    pot: current.pot + contribution,
    callAmount,
    minRaise,
    hasFullBet,
    raisesThisStreet,
    heroAction: id === "hero" ? label : current.heroAction,
    log: [timelineEntry, ...current.log].slice(0, 6),
    timeline: [...current.timeline, timelineEntry],
  };
  return advanceBetting(next, id);
};

const transactions = [
  { time: "今天 22:16", title: "牌局结算", detail: "#NLH-829104 · 午夜河牌", amount: "+¥1,680.00", balance: "¥12,840.00", kind: "win" },
  { time: "今天 21:04", title: "带入牌桌", detail: "#NLH-829104 · 午夜河牌", amount: "-¥2,000.00", balance: "¥11,160.00", kind: "out" },
  { time: "今天 18:32", title: "每日任务奖励", detail: "连续登录第 7 天", amount: "+¥188.00", balance: "¥13,160.00", kind: "win" },
  { time: "8月19日 23:48", title: "牌局结算", detail: "#NLH-828775 · 深夜食堂", amount: "-¥760.00", balance: "¥12,972.00", kind: "loss" },
  { time: "8月19日 20:12", title: "账户充值", detail: "银联卡 · 尾号 0826", amount: "+¥5,000.00", balance: "¥13,732.00", kind: "win" },
  { time: "8月18日 14:06", title: "余额提现", detail: "处理中 · 预计 1 个工作日", amount: "-¥3,000.00", balance: "¥8,732.00", kind: "out" },
];

const games = [
  { time: "今天 22:16", room: "午夜河牌", stakes: "¥10 / ¥20", hands: "42", buyin: "¥2,000", result: "+¥1,680", kind: "win" },
  { time: "8月19日 23:48", room: "深夜食堂", stakes: "¥5 / ¥10", hands: "87", buyin: "¥2,000", result: "-¥760", kind: "loss" },
  { time: "8月18日 01:20", room: "海港之夜", stakes: "¥10 / ¥20", hands: "64", buyin: "¥4,000", result: "+¥2,320", kind: "win" },
  { time: "8月16日 21:42", room: "周末快桌", stakes: "¥2 / ¥5", hands: "118", buyin: "¥1,000", result: "+¥485", kind: "win" },
  { time: "8月15日 20:08", room: "翡翠厅", stakes: "¥5 / ¥10", hands: "51", buyin: "¥2,000", result: "-¥1,120", kind: "loss" },
];

const LOCAL_HISTORY_KEY = "river-poker-hand-history-v1";
const PENDING_HISTORY_PREFIX = "river-poker-hand-history-pending-v1:";
const LOCAL_SOUND_KEY = "river-poker-sound-enabled";
const HERO_TURN_SECONDS = 15;

const pendingHistoryKey = (userId: string) => `${PENDING_HISTORY_PREFIX}${encodeURIComponent(userId)}`;

const dedupeHistory = (records: HandHistoryRecord[]) => {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (!record?.id || seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  }).slice(0, 100);
};

const readLocalHistory = (key: string) => {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    const now = Date.now();
    return value.filter((item): item is HandHistoryRecord => Boolean(
      item
      && typeof item === "object"
      && typeof (item as HandHistoryRecord).id === "string"
      && typeof (item as HandHistoryRecord).handNumber === "number"
      && typeof (item as HandHistoryRecord).handCode === "number"
      && typeof (item as HandHistoryRecord).delta === "number"
      && Array.isArray((item as HandHistoryRecord).actions)
      && Array.isArray((item as HandHistoryRecord).pots),
    )).slice(0, 100).map((record, index) => ({
      ...record,
      playedAt: record.playedAt && Number.isFinite(Date.parse(record.playedAt))
        ? record.playedAt
        : new Date(now - index).toISOString(),
    }));
  } catch {
    return [];
  }
};

const writeLocalHistory = (key: string, records: HandHistoryRecord[]) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(dedupeHistory(records)));
    return true;
  } catch {
    return false;
  }
};

const buildWeeklyChart = (records: HandHistoryRecord[]) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const values = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    const value = records.reduce((sum, record) => {
      const timestamp = record.playedAt ? Date.parse(record.playedAt) : Number.NaN;
      return Number.isFinite(timestamp) && timestamp >= date.getTime() && timestamp < next.getTime()
        ? sum + record.delta
        : sum;
    }, 0);
    return {
      day: index === 6 ? "今天" : date.toLocaleDateString("zh-CN", { weekday: "short" }),
      value,
      label: `${value >= 0 ? "+" : ""}${value.toLocaleString()}`,
    };
  });
  const max = Math.max(1, ...values.map((item) => Math.abs(item.value)));
  return values.map((item) => ({ ...item, height: `${Math.max(4, Math.round(Math.abs(item.value) / max * 76))}px` }));
};

export default function Home() {
  const [view, setView] = useState<View>("table");
  const [recordTab, setRecordTab] = useState<RecordTab>("funds");
  const [showRaise, setShowRaise] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(120);
  const [notice, setNotice] = useState("");
  const [game, setGame] = useState<GameState>(() => createHand(initialStacks, 1, 829104));
  const [handHistory, setHandHistory] = useState<HandHistoryRecord[]>([]);
  const [selectedHand, setSelectedHand] = useState<HandHistoryRecord | null>(null);
  const [accountUser, setAccountUser] = useState<AccountUser | null>(null);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("checking");
  const [historyReady, setHistoryReady] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [turnSeconds, setTurnSeconds] = useState(0);
  const actionTimers = useRef<number[]>([]);
  const clientShuffled = useRef(false);
  const historyLoaded = useRef(false);
  const historySyncInFlight = useRef(false);
  const recordedHands = useRef(new Set<string>());
  const previousSoundState = useRef({ visibleBoard: 0, phase: "" });

  const playTone = (frequency: number, duration = .08, force = false) => {
    if (!force && !soundEnabled) return;
    try {
      const context = new window.AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(.055, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
      oscillator.addEventListener("ended", () => void context.close(), { once: true });
    } catch {
      // Sound is optional and some browsers block audio before user interaction.
    }
  };

  const synchronizeHistory = async () => {
    if (historySyncInFlight.current) return;
    historySyncInFlight.current = true;
    const anonymousRecords = readLocalHistory(LOCAL_HISTORY_KEY);
    let knownUser = accountUser;
    let remoteRecords = knownUser ? handHistory : [];
    let pendingRecords: HandHistoryRecord[] = [];

    try {
      const response = await fetch("/api/hand-history", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as HistoryApiPayload;

      if (response.status === 401) {
        setAccountUser(null);
        setHandHistory(anonymousRecords);
        setHistoryStatus("local");
        return;
      }

      if (payload.user) {
        knownUser = payload.user;
        setAccountUser(payload.user);
      }
      if (knownUser) pendingRecords = readLocalHistory(pendingHistoryKey(knownUser.userId));
      if (!response.ok || !knownUser) throw new Error(payload.error ?? "读取账号手牌失败");

      remoteRecords = Array.isArray(payload.records) ? payload.records : [];
      const recordsToSync = dedupeHistory([...anonymousRecords, ...pendingRecords]);

      if (recordsToSync.length > 0) {
        setHistoryStatus("syncing");
        const syncResponse = await fetch("/api/hand-history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ records: recordsToSync }),
        });
        const syncPayload = await syncResponse.json().catch(() => ({})) as HistoryApiPayload;
        if (!syncResponse.ok || !Array.isArray(syncPayload.records)) {
          throw new Error(syncPayload.error ?? "同步账号手牌失败");
        }
        remoteRecords = syncPayload.records;
        window.localStorage.removeItem(LOCAL_HISTORY_KEY);
        window.localStorage.removeItem(pendingHistoryKey(knownUser.userId));
      }

      setHandHistory(dedupeHistory(remoteRecords));
      setHistoryStatus("synced");
    } catch {
      if (knownUser) {
        const queued = dedupeHistory([...anonymousRecords, ...pendingRecords]);
        if (queued.length > 0 && writeLocalHistory(pendingHistoryKey(knownUser.userId), queued)) {
          window.localStorage.removeItem(LOCAL_HISTORY_KEY);
        }
        setHandHistory(dedupeHistory([...queued, ...remoteRecords]));
      } else {
        setHandHistory(anonymousRecords);
      }
      setHistoryStatus("error");
    } finally {
      historyLoaded.current = true;
      setHistoryReady(true);
      historySyncInFlight.current = false;
    }
  };

  useEffect(() => {
    if (clientShuffled.current) return;
    clientShuffled.current = true;
    setGame(createHand(initialStacks, 1));
  }, []);

  useEffect(() => {
    const soundTimer = window.setTimeout(() => {
      setSoundEnabled(window.localStorage.getItem(LOCAL_SOUND_KEY) === "true");
    }, 0);
    const historyTimer = window.setTimeout(() => void synchronizeHistory(), 0);
    const viewTimer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("view") === "account") {
        setRecordTab("games");
        setView("account");
      }
    }, 0);
    return () => {
      window.clearTimeout(soundTimer);
      window.clearTimeout(historyTimer);
      window.clearTimeout(viewTimer);
    };
  // Authentication and history are resolved once on first load; account entry can refresh them later.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    actionTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    window.localStorage.setItem(LOCAL_SOUND_KEY, String(next));
    if (next) playTone(620, .11, true);
    flash(next ? "牌桌音效已开启" : "牌桌音效已关闭");
  };

  useEffect(() => {
    if (!historyLoaded.current || !historyReady || game.phase !== "payout" || !game.result || !game.hands.hero) return;
    const handKey = `${game.handCode}-${game.handNumber}`;
    if (recordedHands.current.has(handKey)) return;
    recordedHands.current.add(handKey);
    const delta = game.stacks.hero - game.startingStacks.hero;
    const playedAt = new Date();
    const record: HandHistoryRecord = {
      id: `${handKey}-${playedAt.getTime()}`,
      playedAt: playedAt.toISOString(),
      time: playedAt.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      handNumber: game.handNumber,
      handCode: game.handCode,
      stakes: `¥${game.bigBlind / 2} / ¥${game.bigBlind}`,
      heroCards: (game.hands.hero ?? []).map(cardKey).join(" ") || "旁观",
      board: game.board.slice(0, game.visibleBoard).map(cardKey).join(" ") || "未发公共牌",
      result: `${game.result.label} · ${delta >= 0 ? "+" : ""}¥${delta}`,
      delta,
      actions: game.timeline,
      pots: game.result.pots,
    };
    setHandHistory((current) => dedupeHistory([record, ...current]));

    if (!accountUser) {
      writeLocalHistory(LOCAL_HISTORY_KEY, [record, ...readLocalHistory(LOCAL_HISTORY_KEY)]);
      return;
    }

    const pendingKey = pendingHistoryKey(accountUser.userId);
    const recordsToSync = dedupeHistory([
      record,
      ...readLocalHistory(pendingKey),
      ...readLocalHistory(LOCAL_HISTORY_KEY),
    ]);
    void fetch("/api/hand-history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ records: recordsToSync }),
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as HistoryApiPayload;
      if (!response.ok || !Array.isArray(payload.records)) throw new Error(payload.error ?? "同步失败");
      setHandHistory(dedupeHistory(payload.records));
      window.localStorage.removeItem(pendingKey);
      window.localStorage.removeItem(LOCAL_HISTORY_KEY);
      setHistoryStatus("synced");
    }).catch(() => {
      if (writeLocalHistory(pendingKey, recordsToSync)) window.localStorage.removeItem(LOCAL_HISTORY_KEY);
      setHistoryStatus("error");
    });
  }, [historyReady, accountUser, game.phase, game.handCode, game.result, game.stacks.hero, game.startingStacks.hero, game.timeline, game.visibleBoard, game.board, game.hands.hero, game.handNumber, game.bigBlind]);

  useEffect(() => {
    if (game.phase !== "betting" || game.actingPlayer !== "hero") {
      const resetTimer = window.setTimeout(() => setTurnSeconds(0), 0);
      return () => window.clearTimeout(resetTimer);
    }
    const deadline = Date.now() + HERO_TURN_SECONDS * 1000;
    const startTimer = window.setTimeout(() => setTurnSeconds(HERO_TURN_SECONDS), 0);
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTurnSeconds(remaining);
      if (remaining > 0) return;
      window.clearInterval(timer);
      setShowRaise(false);
      setGame((current) => {
        if (current.phase !== "betting" || current.actingPlayer !== "hero") return current;
        const committed = current.actions.hero?.committed ?? 0;
        const choice: BettingChoice = current.callAmount > committed ? { kind: "fold" } : { kind: "check" };
        return applyBettingChoice(current, "hero", choice);
      });
      flash("行动超时，系统已自动过牌或弃牌");
    }, 250);
    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(timer);
    };
  // Restart the clock only when the turn actually changes.
  }, [game.handNumber, game.street, game.phase, game.actingPlayer, game.raisesThisStreet]);

  useEffect(() => {
    const previous = previousSoundState.current;
    if (soundEnabled && game.visibleBoard > previous.visibleBoard) playTone(500 + game.visibleBoard * 35, .09);
    if (soundEnabled && game.phase === "payout" && previous.phase !== "payout") playTone(game.result?.winnerIds.includes("hero") ? 780 : 320, .16);
    previousSoundState.current = { visibleBoard: game.visibleBoard, phase: game.phase };
  // Sound follows visible card and payout transitions only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.visibleBoard, game.phase, soundEnabled]);

  const openRecords = (tab: RecordTab) => {
    setRecordTab(tab);
    setView("account");
    void synchronizeHistory();
  };

  const resolveShowdown = (current: GameState): GameState => {
    const contenders = playerIds.filter((id) => current.hands[id] && !current.folded[id]);
    if (contenders.length === 0) return current;

    const ranked = contenders.map((id) => ({ id, ...bestHand([...current.hands[id], ...current.board]) }));
    ranked.sort((left, right) => compareScores(right.score, left.score));
    const stacks = { ...current.stacks };
    const payouts: Record<string, number> = Object.fromEntries(playerIds.map((id) => [id, 0]));
    const levels = [...new Set(playerIds.map((id) => current.handCommitted[id] ?? 0).filter((amount) => amount > 0))].sort((a, b) => a - b);
    const awards: PotAward[] = [];
    let previousLevel = 0;
    let contestedPotCount = 0;

    levels.forEach((level) => {
      const contributors = playerIds.filter((id) => (current.handCommitted[id] ?? 0) >= level);
      const amount = (level - previousLevel) * contributors.length;
      previousLevel = level;
      if (amount <= 0) return;
      if (contributors.length === 1) {
        payouts[contributors[0]] += amount;
        awards.push({ label: "未跟注退回", amount, winnerIds: [contributors[0]], isRefund: true });
        return;
      }
      const eligible = contributors.filter((id) => current.hands[id] && !current.folded[id]);
      const pool = eligible.length ? eligible : contenders;
      const poolRanked = pool.map((id) => ranked.find((entry) => entry.id === id)!).filter(Boolean);
      poolRanked.sort((left, right) => compareScores(right.score, left.score));
      const winningScore = poolRanked[0].score;
      const potWinners = poolRanked.filter((entry) => compareScores(entry.score, winningScore) === 0).map((entry) => entry.id);
      const oddChipOrder = clockwiseAfter(current.dealerId, playerIds).filter((id) => potWinners.includes(id));
      const share = Math.floor(amount / potWinners.length);
      let remainder = amount - share * potWinners.length;
      potWinners.forEach((id) => { payouts[id] += share; });
      oddChipOrder.forEach((id) => {
        if (remainder <= 0) return;
        payouts[id] += 1;
        remainder -= 1;
      });
      awards.push({ label: contestedPotCount === 0 ? "主池" : `边池 ${contestedPotCount}`, amount, winnerIds: potWinners });
      contestedPotCount += 1;
    });

    playerIds.forEach((id) => { stacks[id] += payouts[id]; });
    const winnerIds = [...new Set(awards.filter((award) => !award.isRefund).flatMap((award) => award.winnerIds))];

    const actions = { ...current.actions };
    ranked.forEach((entry) => {
      actions[entry.id] = {
        label: winnerIds.includes(entry.id) ? `${entry.label} · 赢得 ¥${payouts[entry.id]}` : payouts[entry.id] > 0 ? `退回未跟注 ¥${payouts[entry.id]}` : entry.label,
        type: winnerIds.includes(entry.id) ? "win" : "waiting",
        committed: actions[entry.id]?.committed ?? 0,
      };
    });
    const winnersText = winnerIds.map((id) => tableNames[id]).join("、");
    const resultLabel = contenders.length === 1 ? "其他玩家均已弃牌" : ranked[0].label;
    const alive = playerIds.filter((id) => stacks[id] > 0);
    const contestedAwards = awards.filter((award) => !award.isRefund);
    const potSummary = contestedAwards.length > 1 ? `主池与 ${contestedAwards.length - 1} 个边池已分别结算` : "主池已结算";
    const timelineEntry: ActionLogItem = { name: winnersText, text: `${resultLabel} · ${potSummary} ¥${current.pot}`, time: "刚刚", type: "win" };

    return {
      ...current,
      stacks,
      actions,
      actingPlayer: null,
      visibleBoard: contenders.length > 1 ? 5 : current.visibleBoard,
      lastPot: current.pot,
      pot: 0,
      phase: "payout",
      prompt: `${winnersText} 获得筹码 · ${potSummary}`,
      result: { winnerIds, label: resultLabel, amount: current.pot, showdown: contenders.length > 1, pots: awards },
      championId: alive.length === 1 ? alive[0] : null,
      log: [timelineEntry, ...current.log].slice(0, 6),
      timeline: [...current.timeline, timelineEntry],
    };
  };

  const dealNextHand = () => {
    setGame((current) => {
      if (current.phase !== "payout" && current.phase !== "gameover") return current;
      actionTimers.current.forEach((timer) => window.clearTimeout(timer));
      actionTimers.current = [];
      setShowRaise(false);
      const alive = playerIds.filter((id) => current.stacks[id] > 0);
      if (alive.length === 1) return { ...current, phase: "gameover", championId: alive[0], prompt: `${tableNames[alive[0]]} 赢得本场锦标赛` };
      return createHand(current.stacks, current.handNumber + 1, undefined, current.dealerId);
    });
  };

  const chooseOpponentAction = (current: GameState, id: string): BettingChoice => {
    const profile = aiProfiles[id] ?? { aggression: .5, looseness: .5 };
    const position = current.positions[id] ?? "UTG";
    const positionBonus: Partial<Record<PositionCode, number>> = { BTN: .08, "BTN/SB": .05, CO: .065, HJ: .025, UTG: -.045, SB: -.01, BB: 0 };
    const handStrength = estimateHandStrength(current, id);
    const showdownEquity = estimateShowdownEquity(current, id, current.street === "preflop" ? 34 : 46);
    const committed = current.actions[id]?.committed ?? 0;
    const toCall = Math.min(current.stacks[id], Math.max(0, current.callAmount - committed));
    const potOdds = toCall / Math.max(1, current.pot + toCall);
    const decisionScore = handStrength * .55 + showdownEquity * .62 + (positionBonus[position] ?? 0) + (profile.looseness - .5) * .11 + (Math.random() - .5) * .1;
    const foldThreshold = .3 + potOdds * .56 - profile.looseness * .08;
    if (toCall > 0 && decisionScore < foldThreshold && Math.random() < .9) return { kind: "fold" };

    const maximumTarget = committed + current.stacks[id];
    const canRaise = current.raiseRights[id] && maximumTarget > current.callAmount;
    const latePosition = position === "BTN" || position === "BTN/SB" || position === "CO";
    const bluffRaise = latePosition && toCall === 0 && Math.random() < .045 + profile.aggression * .07;
    const valueThreshold = current.street === "preflop" ? .68 : .64;
    const shouldRaise = canRaise && (decisionScore > valueThreshold - profile.aggression * .08 || bluffRaise);
    if (shouldRaise) {
      const unit = Math.max(10, current.bigBlind / 2);
      const minimumTarget = minimumRaiseTarget(current);
      const rawTarget = current.callAmount === 0
        ? Math.max(current.bigBlind, current.pot * (.45 + profile.aggression * .35))
        : Math.max(minimumTarget, current.callAmount + current.pot * (.35 + profile.aggression * .25));
      let target = Math.ceil(rawTarget / unit) * unit;
      if (current.stacks[id] <= current.pot * .9 || (handStrength > .93 && Math.random() < .22)) target = maximumTarget;
      return { kind: "raise", target: Math.min(maximumTarget, Math.max(Math.min(minimumTarget, maximumTarget), target)) };
    }
    return toCall > 0 ? { kind: "call" } : { kind: "check" };
  };

  const applyOpponentDecision = (id: string) => {
    setGame((current) => current.actingPlayer === id ? applyBettingChoice(current, id, chooseOpponentAction(current, id)) : current);
  };

  const handleHeroAction = (choice: BettingChoice) => {
    setShowRaise(false);
    playTone(choice.kind === "raise" ? 690 : choice.kind === "fold" ? 260 : 520, .075);
    setGame((current) => current.actingPlayer === "hero" ? applyBettingChoice(current, "hero", choice) : current);
  };

  useEffect(() => {
    if (game.phase !== "opponents" || !game.actingPlayer || game.actingPlayer === "hero") return;
    const actorId = game.actingPlayer;
    const thinkingTimer = window.setTimeout(() => {
      setGame((current) => current.actingPlayer === actorId ? {
        ...current,
        actions: { ...current.actions, [actorId]: { ...current.actions[actorId], label: "思考中", type: "thinking" } },
      } : current);
    }, 220);
    const actionTimer = window.setTimeout(() => applyOpponentDecision(actorId), 900);
    actionTimers.current.push(thinkingTimer, actionTimer);
    return () => {
      window.clearTimeout(thinkingTimer);
      window.clearTimeout(actionTimer);
    };
  // AI acts one player at a time in the exact table order.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.handNumber, game.street, game.phase, game.actingPlayer]);

  useEffect(() => {
    if (game.phase !== "dealing" && game.phase !== "showdown" && game.phase !== "payout") return;
    const delay = game.phase === "dealing" ? 1150 : game.phase === "showdown" ? 900 : 5200;
    const timer = window.setTimeout(() => {
      if (game.phase === "dealing") setGame((current) => current.phase === "dealing" ? prepareStreetBetting(current) : current);
      else if (game.phase === "showdown") setGame((current) => current.phase === "showdown" ? resolveShowdown(current) : current);
      else dealNextHand();
    }, delay);
    actionTimers.current.push(timer);
    return () => window.clearTimeout(timer);
  // Street transitions and payouts are intentionally paced for card animations.
  }, [game.handNumber, game.street, game.phase]);

  useEffect(() => {
    const committed = game.actions.hero?.committed ?? 0;
    const allInTotal = committed + game.stacks.hero;
    const minimumTarget = game.hasFullBet ? game.callAmount + game.minRaise : game.bigBlind;
    const timer = window.setTimeout(() => {
      setRaiseAmount(Math.min(allInTotal, Math.max(minimumTarget, game.bigBlind * 3)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [game.handNumber, game.street, game.bigBlind, game.callAmount, game.minRaise, game.hasFullBet, game.stacks.hero, game.actions.hero?.committed]);

  const restartMatch = () => {
    actionTimers.current.forEach((timer) => window.clearTimeout(timer));
    actionTimers.current = [];
    setShowRaise(false);
    setRaiseAmount(120);
    setGame(createHand(initialStacks, 1));
  };

  const heroCards = game.hands.hero ?? [];
  const heroBest = heroCards.length ? bestHand([...heroCards, ...game.board.slice(0, game.visibleBoard)]) : { score: [0], label: "旁观中" };
  const heroCommitted = game.actions.hero?.committed ?? 0;
  const heroCallAmount = Math.min(game.stacks.hero, Math.max(0, game.callAmount - heroCommitted));
  const heroAllInTotal = heroCommitted + game.stacks.hero;
  const minimumRaise = Math.min(heroAllInTotal, minimumRaiseTarget(game));
  const canHeroAct = game.phase === "betting" && game.actingPlayer === "hero" && heroCards.length > 0 && !game.folded.hero && game.stacks.hero > 0;
  const canHeroRaise = canHeroAct && Boolean(game.raiseRights.hero) && heroAllInTotal > game.callAmount;
  const aliveCount = playerIds.filter((id) => game.stacks[id] > 0 || Boolean(game.hands[id])).length;
  const showdownContenderCount = playerIds.filter((id) => game.hands[id] && !game.folded[id]).length;
  const revealCards = (game.phase === "showdown" && showdownContenderCount > 1 && game.visibleBoard === 5)
    || ((game.phase === "payout" || game.phase === "gameover") && Boolean(game.result?.showdown));
  const isResolving = game.phase !== "betting";
  const boardProgressText = game.visibleBoard === 0 ? "等待翻牌" : game.visibleBoard === 3 ? "等待转牌" : game.visibleBoard === 4 ? "等待河牌" : "五张公共牌已发完";
  const historyProfit = handHistory.reduce((sum, hand) => sum + hand.delta, 0);
  const weeklyChart = buildWeeklyChart(handHistory);
  const weeklyProfit = weeklyChart.reduce((sum, item) => sum + item.value, 0);
  const bestResult = Math.max(0, ...handHistory.map((hand) => hand.delta));
  const historyStatusText: Record<HistoryStatus, string> = {
    checking: "正在确认登录状态",
    local: "未登录 · 本机演示",
    syncing: "正在同步账号记录",
    synced: "账号记录已同步",
    error: accountUser ? "同步中断 · 记录已安全排队" : "离线 · 本机演示可用",
  };
  const accountAvatar = accountUser?.displayName.trim().slice(0, 1) || "游";

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("table")} aria-label="River 德州扑克首页">
          <span className="brand-mark">R</span>
          <span>RIVER <small>德扑竞技</small></span>
        </button>
        <nav className="main-nav" aria-label="主导航">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>牌桌</button>
          <button className={view === "account" ? "active" : ""} onClick={() => openRecords("games")}>战绩</button>
          <button onClick={() => flash("俱乐部功能即将开放")}>俱乐部</button>
        </nav>
        <button className={`sound-toggle ${soundEnabled ? "on" : ""}`} aria-pressed={soundEnabled} onClick={toggleSound}>{soundEnabled ? "♪ 音效开" : "♪ 音效关"}</button>
        <button className="account-chip" onClick={() => openRecords("games")} aria-label="打开账户记录">
          <span className="status-dot" />
          <span><small>{accountUser ? "账号手牌" : "本机演示"}</small><b>{accountUser?.displayName ?? "未登录"}</b></span>
          <span className="avatar">{accountAvatar}</span>
        </button>
      </header>

      {view === "table" ? (
        <section className="game-layout">
          <aside className="left-panel panel">
            <p className="eyebrow">锦标赛 · SIT &amp; GO</p>
            <h1>赢家通吃</h1>
            <div className="room-meta"><span>{aliveCount} 人存活</span><span>¥{game.bigBlind / 2} / ¥{game.bigBlind}</span><span>{tableNames[game.dealerId]} · 庄位</span></div>
            <div className="divider" />
            <p className="label">赛事进度</p>
            <div className="stat-grid">
              <div><strong>{game.handNumber}</strong><span>当前手牌</span></div>
              <div><strong className="gain">{aliveCount} / 6</strong><span>剩余玩家</span></div>
            </div>
            <div className="session-progress">
              <span><b>盲注级别</b><em>¥{game.bigBlind / 2} / ¥{game.bigBlind}</em></span>
              <div><i style={{ width: `${Math.min(100, 18 + game.handNumber * 4)}%` }} /></div>
              <span><b>总筹码</b><em>¥12,000</em></span>
              <div><i style={{ width: "100%" }} /></div>
            </div>
            <div className="tip-card">
              <span>赛事规则</span>
              <p>庄位、大小盲与枪口位每手顺时针轮换。对手会结合底牌、公共牌、位置、底池赔率和下注压力决策。</p>
            </div>
            <button className="leave-button" onClick={() => flash("每手随机洗牌，摊牌后自动结算并开启下一手")}>查看赛制说明</button>
          </aside>

          <section className="table-stage" aria-label="德州扑克牌桌">
            <div className="hand-code">#{game.handCode} <span>·</span> 第 {game.handNumber} 手 · {streetLabels[game.street]} · 随机洗牌</div>
            <div className="table-light" />
            <div className="poker-table">
              <div className="felt-ring" />
              <span className="watermark">RIVER</span>
              {players.map((player) => {
                const action = game.actions[player.id];
                const isActing = game.actingPlayer === player.id;
                 const wonHand = Boolean(game.result?.winnerIds.includes(player.id));
                 const isOut = !game.hands[player.id];
                 const position = game.positions[player.id];
                 return (
                 <div className={`${player.className} ${isActing ? "is-active" : ""} ${action.folded ? "is-folded" : ""} ${wonHand ? "is-winner" : ""} ${isOut ? "is-out" : ""}`} key={player.name}>
                   {position && <div className={`position-badge ${position.includes("BTN") ? "button-position" : ""}`}>{positionLabels[position]}</div>}
                  {game.hands[player.id] && (
                    <div className={`opponent-cards ${revealCards && !game.folded[player.id] ? "revealed" : ""}`} aria-label={`${player.name} 的两张${revealCards ? "摊牌" : "未公开"}手牌`}>
                      {game.hands[player.id].map((card, cardIndex) => (
                        <span className={card.suit === "♥" || card.suit === "♦" ? "red" : ""} key={`${card.rank}-${card.suit}-${cardIndex}`}>
                          {revealCards && !game.folded[player.id] && <><b>{card.rank}</b><small>{card.suit}</small></>}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mini-avatar">{player.name.slice(0, 1)}</div>
                  <div className="seat-copy"><b>{player.name}</b><span>¥{game.stacks[player.id].toLocaleString()}</span></div>
                  <div className={`action-bubble ${action.type}`}>
                    {action.type === "thinking" && <span className="thinking-dots"><i /><i /><i /></span>}
                    {action.label}
                  </div>
                  {action.committed > 0 && (
                    <div className="wager-marker" aria-label={`${player.name} 已投入 ${action.committed} 元`}>
                      <span className="chip-stack"><i /><i /><i /></span>
                      <b>¥{action.committed}</b>
                    </div>
                  )}
                </div>
              )})}
              <div className="pot"><span>{game.phase === "payout" ? "已派奖" : "底池"}</span><strong>¥ {(game.phase === "payout" ? game.lastPot : game.pot).toLocaleString()}</strong></div>
              <div className="community-cards" aria-label="公共牌">
                {game.board.map((card, index) => index < game.visibleBoard ? (
                  <div className={card.suit === "♥" || card.suit === "♦" ? "red card-reveal" : "card-reveal"} key={`${card.rank}-${card.suit}-${index}`}>
                    <b>{card.rank}</b><span>{card.suit}</span>
                  </div>
                ) : <div className="empty-card-slot" aria-hidden="true" key={`hidden-${index}`} />)}
              </div>
              <div className={`hero-seat ${game.actingPlayer === "hero" ? "is-active" : ""} ${game.result?.winnerIds.includes("hero") ? "is-winner" : ""}`}>
                {game.positions.hero && <div className={`position-badge hero-position ${game.positions.hero.includes("BTN") ? "button-position" : ""}`}>{positionLabels[game.positions.hero]}</div>}
                {heroCards.length > 0 ? (
                  <div className="hole-cards">
                    {heroCards.map((card, index) => <div className={card.suit === "♥" || card.suit === "♦" ? "red" : ""} key={`${card.rank}-${card.suit}-${index}`}><b>{card.rank}</b><span>{card.suit}</span></div>)}
                  </div>
                ) : <div className="spectator-cards">旁观</div>}
                <div className="hero-info"><b>我</b><span>¥{game.stacks.hero.toLocaleString()}</span></div>
                {game.heroAction && <div className="hero-action">{game.heroAction}</div>}
              </div>
              {game.result && game.phase === "payout" && (
                <div className="showdown-banner">
                  <small>SHOWDOWN · 自动结算</small>
                  <strong>{game.result.winnerIds.map((id) => tableNames[id]).join("、")} 获胜</strong>
                  <span>{game.result.label} · +¥{game.result.amount.toLocaleString()}</span>
                  {game.result.pots.length > 1 && <div className="pot-awards">{game.result.pots.map((pot) => <em key={pot.label}>{pot.label} ¥{pot.amount} → {pot.winnerIds.map((id) => tableNames[id]).join("、")}</em>)}</div>}
                  <i>下一手即将自动开始</i>
                </div>
              )}
              {game.phase === "gameover" && game.championId && (
                <div className="showdown-banner champion-banner">
                  <small>TOURNAMENT CHAMPION</small>
                  <strong>{tableNames[game.championId]} 赢得整场比赛</strong>
                  <span>独揽全部 ¥12,000 筹码</span>
                  <i>点击下方按钮可重新开赛</i>
                </div>
              )}
            </div>

            <div className={`action-bar phase-${game.phase}`}>
              <div className="action-copy">
                <span>{game.phase === "gameover" ? "赛事结束" : game.phase === "payout" ? "本手已结算" : isResolving ? "牌局自动进行中" : "轮到你行动"} <i /></span>
                <b>{game.prompt}</b>
              </div>
              {canHeroAct && <div className={`time-bank ${turnSeconds <= 5 ? "danger" : ""}`} aria-label={`剩余行动时间 ${turnSeconds} 秒`}><b>{turnSeconds}</b><span>秒</span><i><em style={{ width: `${turnSeconds / HERO_TURN_SECONDS * 100}%` }} /></i></div>}
              {game.phase === "gameover" ? (
                <div className="action-buttons"><button className="primary" onClick={restartMatch}>重新开始锦标赛</button></div>
              ) : game.phase === "payout" ? (
                <div className="action-buttons"><button className="primary" onClick={dealNextHand}>立即下一手</button></div>
              ) : (
                <div className="action-buttons">
                  <button className="ghost" disabled={!canHeroAct} onClick={() => handleHeroAction({ kind: "fold" })}>弃牌</button>
                  <button className="ghost" disabled={!canHeroAct || heroCallAmount > 0} onClick={() => handleHeroAction({ kind: "check" })}>过牌</button>
                  <button className="primary" disabled={!canHeroAct || heroCallAmount === 0} onClick={() => handleHeroAction({ kind: "call" })}>{heroCallAmount === game.stacks.hero ? "全下跟注" : "跟注"} · ¥{heroCallAmount}</button>
                  <button className={showRaise ? "raise selected" : "raise"} disabled={!canHeroRaise} onClick={() => setShowRaise(!showRaise)}>{game.callAmount === 0 ? "下注" : game.raiseRights.hero ? "加注" : "仅可跟注"}</button>
                </div>
              )}
              {showRaise && game.phase === "betting" && (
                <div className="raise-tray">
                  <div className="raise-head"><span>加注至 · 最低 ¥{minimumRaise.toLocaleString()}</span><b>¥{raiseAmount.toLocaleString()}</b></div>
                  <input aria-label="选择加注金额" type="range" min={minimumRaise} max={heroAllInTotal} step={Math.max(10, game.bigBlind / 2)} value={Math.min(heroAllInTotal, Math.max(raiseAmount, minimumRaise))} onChange={(event) => setRaiseAmount(Number(event.target.value))} />
                  <div className="quick-bets">
                    <button onClick={() => setRaiseAmount(minimumRaise)}>最小</button>
                    <button onClick={() => setRaiseAmount(Math.min(heroAllInTotal, Math.max(minimumRaise, game.callAmount + Math.floor(game.pot * .75))))}>3/4 底池</button>
                    <button onClick={() => setRaiseAmount(Math.min(heroAllInTotal, Math.max(minimumRaise, game.callAmount + game.pot)))}>满池</button>
                    <button onClick={() => setRaiseAmount(heroAllInTotal)}>全下</button>
                    <button className="confirm-bet" onClick={() => handleHeroAction({ kind: "raise", target: Math.min(raiseAmount, heroAllInTotal) })}>确认{heroAllInTotal < minimumRaiseTarget(game) ? "全下" : game.callAmount === 0 ? "下注" : "加注"}</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="right-panel panel">
            <p className="eyebrow">本手牌</p>
            <h2>{heroBest.label}</h2>
            <div className="equity"><div><span style={{ width: `${Math.min(94, 24 + heroBest.score[0] * 9 + (heroCards[0]?.value ?? 0))}%` }} /></div><b>{heroCards.length ? `${Math.min(94, 24 + heroBest.score[0] * 9 + (heroCards[0]?.value ?? 0))}%` : "--"}</b></div>
            <p className="muted">动态牌力估算 · {boardProgressText}</p>
            <div className="hand-outs">
              <span><b>{aliveCount}</b><small>存活玩家</small></span>
              <span><b>¥{game.bigBlind}</b><small>当前大盲</small></span>
              <span><b>¥{game.callAmount}</b><small>本轮最高注额</small></span>
              <span><b>¥{minimumRaiseTarget(game)}</b><small>最小加注至</small></span>
            </div>
            <div className="divider" />
            <div className="activity-title"><span>牌桌动态</span><button onClick={() => openRecords("games")}>全部记录</button></div>
            <ul className="activity-list">
              {game.log.map((item, index) => (
                <li className={index === 0 ? "latest-action" : ""} key={`${item.name}-${item.text}-${index}`}>
                  <span className={`activity-icon ${item.type === "fold" ? "muted-icon" : ""} ${item.type === "raise" || item.type === "deal" || item.type === "win" ? "gold-icon" : ""}`}>
                    {item.type === "fold" ? "×" : item.type === "raise" ? "↑" : item.type === "deal" ? "D" : item.type === "win" ? "★" : "●"}
                  </span>
                  <p><b>{item.name}</b> {item.text}<small>{item.time}</small></p>
                </li>
              ))}
            </ul>
          </aside>
        </section>
      ) : (
        <section className="account-page">
          <div className="account-heading">
            <div>
              <button className="back-link" onClick={() => setView("table")}>← 返回牌桌</button>
              <p className="eyebrow">ACCOUNT CENTER</p>
              <h1>账户与记录</h1>
              <p>{accountUser ? `正在查看 ${accountUser.displayName} 的云端手牌与完整行动回放。` : "未登录时牌局保存在本机；登录后会自动同步到你的账号。"}</p>
            </div>
            <div className="account-actions">
              {accountUser ? (
                <>
                  <button onClick={() => void synchronizeHistory()}>同步记录</button>
                  <a className="outline" href="/signout-with-chatgpt?return_to=%2F%3Fview%3Daccount">退出登录</a>
                </>
              ) : (
                <a href="/signin-with-chatgpt?return_to=%2F%3Fview%3Daccount">登录并同步</a>
              )}
            </div>
          </div>

          <div className="summary-grid">
            <article className="summary-card balance-card">
              <span>记录模式</span>
              <strong>{accountUser ? "账号云端" : "本机演示"}</strong>
              <small><i /> {historyStatusText[historyStatus]}</small>
              <b className="card-symbol">♠</b>
            </article>
            <article className="summary-card">
              <span>{accountUser ? "账号累计盈亏" : "本机实战盈亏"}</span>
              <strong className={historyProfit >= 0 ? "gain" : "loss"}>{historyProfit >= 0 ? "+" : ""}¥ {historyProfit.toLocaleString()}</strong>
              <small className={historyProfit >= 0 ? "positive-pill" : "loss"}>来自已保存的真实牌局</small>
            </article>
            <article className="summary-card">
              <span>{accountUser ? "账号已记录" : "本机已记录"}</span>
              <strong>{handHistory.length} <em>手</em></strong>
              <small>每手均可查看完整行动线</small>
            </article>
            <article className="summary-card">
              <span>最大单手盈利</span>
              <strong className="gold-text">+¥ {bestResult.toLocaleString()}</strong>
              <small>按当前记录实时计算</small>
            </article>
          </div>

          <div className="account-content-grid">
            <article className="performance-card">
              <div className="card-heading">
                <div><p className="eyebrow">PERFORMANCE</p><h2>近 7 天盈亏</h2></div>
                <strong className={weeklyProfit >= 0 ? "gain" : "loss"}>{weeklyProfit >= 0 ? "+" : ""}¥{weeklyProfit.toLocaleString()} <small>真实手牌</small></strong>
              </div>
              <div className="chart" aria-label="近七天盈亏柱状图">
                <div className="zero-line" />
                {weeklyChart.map((item) => (
                  <div className="chart-column" key={item.day}>
                    <span className={`bar-value ${item.value < 0 ? "negative" : ""}`}>{item.label}</span>
                    <div className={`chart-bar ${item.value < 0 ? "down" : ""}`} style={{ height: item.height }} />
                    <small>{item.day}</small>
                  </div>
                ))}
              </div>
            </article>
            <aside className="profile-card">
              <div className="profile-top"><span className="profile-avatar">{accountAvatar}</span><div><b>{accountUser?.displayName ?? "未登录访客"}</b><small>{accountUser?.email ?? "当前为本机演示模式"}</small></div><i>{accountUser ? "已登录" : "本机"}</i></div>
              <dl>
                <div><dt>记录归属</dt><dd>{accountUser ? "当前账号" : "当前浏览器"}</dd></div>
                <div><dt>累计盈亏</dt><dd className={historyProfit >= 0 ? "gain" : "loss"}>{historyProfit >= 0 ? "+" : ""}¥{historyProfit.toLocaleString()}</dd></div>
                <div><dt>可回放手牌</dt><dd>{handHistory.length} 手</dd></div>
              </dl>
              <a href={accountUser ? "/signout-with-chatgpt?return_to=%2F%3Fview%3Daccount" : "/signin-with-chatgpt?return_to=%2F%3Fview%3Daccount"}>{accountUser ? "退出当前账号" : "登录并同步本机记录"} →</a>
            </aside>
          </div>

          <article className="records-card">
            <div className="records-toolbar">
              <div className="record-tabs" role="tablist" aria-label="记录类型">
                <button role="tab" aria-selected={recordTab === "funds"} className={recordTab === "funds" ? "active" : ""} onClick={() => setRecordTab("funds")}>演示资金</button>
                <button role="tab" aria-selected={recordTab === "games"} className={recordTab === "games" ? "active" : ""} onClick={() => setRecordTab("games")}>牌局记录</button>
              </div>
              <span className={`local-record-badge ${historyStatus === "error" ? "error" : ""}`}>{historyStatusText[historyStatus]} · {handHistory.length} 手</span>
              <select aria-label="记录时间范围" defaultValue="30"><option value="7">近 7 天</option><option value="30">近 30 天</option><option value="90">近 3 个月</option></select>
            </div>

            {recordTab === "funds" ? (
              <div className="record-table funds-table" role="table" aria-label="演示资金流水">
                <div className="table-row table-head" role="row"><span>时间</span><span>类型 / 说明</span><span>金额</span><span>余额</span></div>
                {transactions.map((item) => (
                  <div className="table-row" role="row" key={`${item.time}-${item.title}`}>
                    <span className="time-cell">{item.time}</span>
                    <span className="record-name"><i className={item.kind}>{item.kind === "win" ? "+" : "−"}</i><b>{item.title}<small>{item.detail}</small></b></span>
                    <strong className={item.kind === "win" ? "gain" : item.kind === "loss" ? "loss" : ""}>{item.amount}</strong>
                    <span>{item.balance}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="record-table games-table" role="table" aria-label="牌局记录">
                <div className="table-row table-head" role="row"><span>时间</span><span>牌桌</span><span>级别</span><span>手数</span><span>我的底牌</span><span>结果</span></div>
                {handHistory.length > 0 ? handHistory.map((hand) => (
                  <button className="table-row" role="row" key={hand.id} onClick={() => setSelectedHand(hand)}>
                    <span className="time-cell">{hand.time}</span><span className="room-cell"><i>♠</i>{accountUser ? "账号" : "本机"}锦标赛 #{hand.handCode}</span><span>{hand.stakes}</span><span>第 {hand.handNumber} 手</span><span>{hand.heroCards}</span><strong className={hand.delta >= 0 ? "gain" : "loss"}>{hand.delta >= 0 ? "+" : ""}¥{hand.delta}</strong>
                  </button>
                )) : accountUser ? (
                  <div className="empty-history" role="row">{historyStatus === "checking" || historyStatus === "syncing" ? "正在加载账号手牌…" : "这个账号还没有已保存的手牌，完成一手后会自动出现在这里。"}</div>
                ) : games.map((demoGame) => (
                  <button className="table-row" role="row" key={`${demoGame.time}-${demoGame.room}`} onClick={() => flash("完成一手当前锦标赛后，这里会出现可回放的真实记录") }>
                    <span className="time-cell">{demoGame.time}</span><span className="room-cell"><i>♠</i>{demoGame.room} · 示例</span><span>{demoGame.stakes}</span><span>{demoGame.hands}</span><span>—</span><strong className={demoGame.kind === "win" ? "gain" : "loss"}>{demoGame.result}</strong>
                  </button>
                ))}
              </div>
            )}
            <div className="table-footer"><span>{recordTab === "funds" ? `显示 ${transactions.length} 条演示流水` : `显示最近 ${handHistory.length || (accountUser ? 0 : games.length)} 条记录`}</span><button onClick={() => void synchronizeHistory()}>{accountUser ? "刷新云端" : "检查登录"}</button></div>
          </article>
        </section>
      )}

      {selectedHand && (
        <div className="replay-backdrop">
          <button className="replay-dismiss-layer" aria-label="关闭回放" onClick={() => setSelectedHand(null)} />
          <section className="replay-panel" role="dialog" aria-modal="true" aria-label={`第 ${selectedHand.handNumber} 手牌回放`}>
            <div className="replay-heading">
              <div><p className="eyebrow">HAND REPLAY</p><h2>第 {selectedHand.handNumber} 手 · #{selectedHand.handCode}</h2></div>
              <button aria-label="关闭回放" onClick={() => setSelectedHand(null)}>×</button>
            </div>
            <div className="replay-summary">
              <span><small>我的底牌</small><b>{selectedHand.heroCards}</b></span>
              <span><small>公共牌</small><b>{selectedHand.board}</b></span>
              <span><small>结算</small><b className={selectedHand.delta >= 0 ? "gain" : "loss"}>{selectedHand.result}</b></span>
            </div>
            {selectedHand.pots.length > 0 && <div className="replay-pots">{selectedHand.pots.map((pot) => <span key={`${pot.label}-${pot.amount}`}>{pot.label} ¥{pot.amount} → {pot.winnerIds.map((id) => tableNames[id]).join("、")}</span>)}</div>}
            <ol className="replay-timeline">
              {selectedHand.actions.map((action, index) => <li key={`${action.name}-${action.text}-${index}`}><i>{index + 1}</i><p><b>{action.name}</b><span>{action.text}</span></p></li>)}
            </ol>
          </section>
        </div>
      )}

      <div className={`toast ${notice ? "show" : ""}`} aria-live="polite"><span>✓</span>{notice}</div>
    </main>
  );
}
