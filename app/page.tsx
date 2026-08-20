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

const playerIds = ["hero", "azhe", "mia", "oldfox", "kai", "lynn"];
const initialStacks: Record<string, number> = Object.fromEntries(playerIds.map((id) => [id, 2000]));
const suits = ["♠", "♥", "♦", "♣"] as const;
const ranks = [
  { rank: "2", value: 2 }, { rank: "3", value: 3 }, { rank: "4", value: 4 },
  { rank: "5", value: 5 }, { rank: "6", value: 6 }, { rank: "7", value: 7 },
  { rank: "8", value: 8 }, { rank: "9", value: 9 }, { rank: "10", value: 10 },
  { rank: "J", value: 11 }, { rank: "Q", value: 12 }, { rank: "K", value: 13 }, { rank: "A", value: 14 },
];

type Card = { rank: string; value: number; suit: typeof suits[number] };
type GamePhase = "betting" | "opponents" | "river" | "showdown" | "payout" | "gameover";
type ActionLogItem = { name: string; text: string; time: string; type: string };
type HandResult = { winnerIds: string[]; label: string; amount: number };

type GameState = {
  handNumber: number;
  handCode: number;
  bigBlind: number;
  stacks: Record<string, number>;
  hands: Record<string, Card[]>;
  board: Card[];
  visibleBoard: number;
  folded: Record<string, boolean>;
  actions: Record<string, PlayerAction>;
  actingPlayer: string | null;
  pot: number;
  lastPot: number;
  callAmount: number;
  phase: GamePhase;
  prompt: string;
  heroAction: string;
  log: ActionLogItem[];
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
  if (cards.length < 5) return { score: [0, ...cards.map((card) => card.value).sort((a, b) => b - a)], label: "高牌" };
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

const createHand = (previousStacks: Record<string, number>, handNumber: number, seed?: number): GameState => {
  const random = seed === undefined ? Math.random : seededRandom(seed);
  const activeIds = playerIds.filter((id) => previousStacks[id] > 0);
  const deck = shuffle(createDeck(), random);
  const hands: Record<string, Card[]> = {};
  activeIds.forEach((id) => { hands[id] = []; });
  for (let round = 0; round < 2; round += 1) activeIds.forEach((id) => hands[id].push(deck.pop()!));
  const board = Array.from({ length: 5 }, () => deck.pop()!);
  const bigBlind = Math.min(640, 40 * 2 ** Math.floor((handNumber - 1) / 4));
  const ante = Math.max(10, Math.floor(bigBlind / 2));
  const stacks = { ...previousStacks };
  const actions: Record<string, PlayerAction> = {};
  const folded: Record<string, boolean> = {};
  let pot = 0;

  playerIds.forEach((id) => {
    if (!activeIds.includes(id)) {
      folded[id] = true;
      actions[id] = { label: "已淘汰", type: "out", committed: 0, folded: true };
      return;
    }
    const paid = Math.min(ante, stacks[id]);
    stacks[id] -= paid;
    pot += paid;
    folded[id] = false;
    actions[id] = stacks[id] === 0
      ? { label: `前注全下 ¥${paid}`, type: "allin", committed: paid }
      : { label: `前注 ¥${paid}`, type: "waiting", committed: paid };
  });

  const heroCanAct = Boolean(hands.hero) && stacks.hero > 0;
  const callAmount = bigBlind;
  return {
    handNumber,
    handCode: 820000 + Math.floor(random() * 9999),
    bigBlind,
    stacks,
    hands,
    board,
    visibleBoard: 4,
    folded,
    actions,
    actingPlayer: heroCanAct ? "hero" : null,
    pot,
    lastPot: 0,
    callAmount,
    phase: "betting",
    prompt: heroCanAct ? `转牌圈 · 跟注 ¥${Math.min(callAmount, stacks.hero)}` : "你已淘汰 · 自动观战",
    heroAction: stacks.hero === 0 && hands.hero ? "前注全下" : "",
    log: [{ name: "系统", text: `第 ${handNumber} 手牌已发出`, time: "刚刚", type: "deal" }],
    result: null,
    championId: null,
  };
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

const chartData = [
  { day: "周四", value: 32, label: "+320" },
  { day: "周五", value: 61, label: "+610" },
  { day: "周六", value: -28, label: "-280" },
  { day: "周日", value: 86, label: "+860" },
  { day: "周一", value: 48, label: "+480" },
  { day: "周二", value: -41, label: "-410" },
  { day: "今天", value: 100, label: "+1,680" },
];

export default function Home() {
  const [view, setView] = useState<View>("table");
  const [recordTab, setRecordTab] = useState<RecordTab>("funds");
  const [showRaise, setShowRaise] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(120);
  const [notice, setNotice] = useState("");
  const [game, setGame] = useState<GameState>(() => createHand(initialStacks, 1, 829104));
  const actionTimers = useRef<number[]>([]);
  const clientShuffled = useRef(false);

  useEffect(() => {
    if (clientShuffled.current) return;
    clientShuffled.current = true;
    setGame(createHand(initialStacks, 1));
  }, []);

  useEffect(() => () => {
    actionTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const openRecords = (tab: RecordTab) => {
    setRecordTab(tab);
    setView("account");
  };

  const schedule = (callback: () => void, delay: number) => {
    actionTimers.current.push(window.setTimeout(callback, delay));
  };

  const resolveShowdown = (current: GameState): GameState => {
    const contenders = playerIds.filter((id) => current.hands[id] && !current.folded[id]);
    if (contenders.length === 0) return current;

    const ranked = contenders.map((id) => ({ id, ...bestHand([...current.hands[id], ...current.board]) }));
    ranked.sort((left, right) => compareScores(right.score, left.score));
    const winningScore = ranked[0].score;
    const winnerIds = ranked.filter((entry) => compareScores(entry.score, winningScore) === 0).map((entry) => entry.id);
    const stacks = { ...current.stacks };
    const share = Math.floor(current.pot / winnerIds.length);
    let remainder = current.pot - share * winnerIds.length;
    winnerIds.forEach((id) => {
      stacks[id] += share + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
    });

    const actions = { ...current.actions };
    ranked.forEach((entry) => {
      actions[entry.id] = {
        label: winnerIds.includes(entry.id) ? `${entry.label} · 赢得 ¥${current.pot}` : entry.label,
        type: winnerIds.includes(entry.id) ? "win" : "waiting",
        committed: actions[entry.id]?.committed ?? 0,
      };
    });
    const winnersText = winnerIds.map((id) => tableNames[id]).join("、");
    const resultLabel = contenders.length === 1 ? "其他玩家均已弃牌" : ranked[0].label;
    const alive = playerIds.filter((id) => stacks[id] > 0);

    return {
      ...current,
      stacks,
      actions,
      actingPlayer: null,
      visibleBoard: 5,
      lastPot: current.pot,
      pot: 0,
      phase: "payout",
      prompt: `${winnersText} 以${resultLabel}赢得 ¥${current.pot}`,
      result: { winnerIds, label: resultLabel, amount: current.pot },
      championId: alive.length === 1 ? alive[0] : null,
      log: [{ name: winnersText, text: `${resultLabel} · 赢得 ¥${current.pot}`, time: "刚刚", type: "win" }, ...current.log].slice(0, 6),
    };
  };

  const dealNextHand = () => {
    actionTimers.current.forEach((timer) => window.clearTimeout(timer));
    actionTimers.current = [];
    setShowRaise(false);
    setGame((current) => {
      const alive = playerIds.filter((id) => current.stacks[id] > 0);
      if (alive.length === 1) return { ...current, phase: "gameover", championId: alive[0], prompt: `${tableNames[alive[0]]} 赢得本场锦标赛` };
      return createHand(current.stacks, current.handNumber + 1);
    });
  };

  const applyOpponentDecision = (id: string) => {
    setGame((current) => {
      if (!current.hands[id] || current.folded[id] || current.stacks[id] === 0) return { ...current, actingPlayer: null };
      const handStrength = bestHand([...current.hands[id], ...current.board.slice(0, 4)]).score[0];
      const holePair = current.hands[id][0].value === current.hands[id][1].value;
      const contenders = playerIds.filter((playerId) => current.hands[playerId] && !current.folded[playerId]);
      const mustContinue = contenders.length <= 1;
      const foldChance = Math.max(.08, .34 - handStrength * .045 - (holePair ? .1 : 0));
      const shouldFold = !mustContinue && Math.random() < foldChance;
      const stacks = { ...current.stacks };
      const folded = { ...current.folded };
      const actions = { ...current.actions };
      let pot = current.pot;
      let text = "";
      let type: ActionType = "call";

      if (shouldFold) {
        folded[id] = true;
        text = "弃牌";
        type = "fold";
        actions[id] = { label: text, type, committed: actions[id].committed, folded: true };
      } else {
        const contribution = Math.min(current.callAmount, stacks[id]);
        stacks[id] -= contribution;
        pot += contribution;
        const allIn = stacks[id] === 0;
        text = allIn ? `全下 ¥${contribution}` : contribution > 0 ? `跟注 ¥${contribution}` : "过牌";
        type = allIn ? "allin" : contribution > 0 ? "call" : "check";
        actions[id] = { label: text, type, committed: actions[id].committed + contribution };
      }

      return {
        ...current,
        stacks,
        folded,
        actions,
        actingPlayer: null,
        pot,
        log: [{ name: tableNames[id], text, time: "刚刚", type }, ...current.log].slice(0, 6),
      };
    });
  };

  const beginOpponentSequence = (label: string, requestedContribution: number, foldHero = false) => {
    if (game.phase !== "betting") return;
    actionTimers.current.forEach((timer) => window.clearTimeout(timer));
    actionTimers.current = [];
    setShowRaise(false);
    const contribution = foldHero || !game.hands.hero ? 0 : Math.min(requestedContribution, game.stacks.hero);
    const opponentCall = requestedContribution > game.callAmount ? requestedContribution : game.callAmount;
    setGame((current) => {
      const stacks = { ...current.stacks, hero: current.stacks.hero - contribution };
      const folded = { ...current.folded, hero: foldHero || !current.hands.hero };
      const actions = {
        ...current.actions,
        hero: {
          label,
          type: foldHero ? "fold" : stacks.hero === 0 ? "allin" : contribution > 0 ? requestedContribution > current.callAmount ? "raise" : "call" : "waiting",
          committed: (current.actions.hero?.committed ?? 0) + contribution,
          folded: foldHero,
        } as PlayerAction,
      };
      return {
        ...current,
        stacks,
        folded,
        actions,
        phase: "opponents",
        actingPlayer: null,
        callAmount: opponentCall,
        heroAction: label,
        pot: current.pot + contribution,
        prompt: "其他玩家正在依次行动…",
        log: [{ name: "我", text: label, time: "刚刚", type: foldHero ? "fold" : "call" }, ...current.log].slice(0, 6),
      };
    });

    const opponentOrder = shuffle(players.map((player) => player.id).filter((id) => game.hands[id] && game.stacks[id] > 0));
    opponentOrder.forEach((id, index) => {
      const start = 450 + index * 1050;
      schedule(() => {
        setGame((current) => ({
          ...current,
          actingPlayer: id,
          actions: { ...current.actions, [id]: { ...current.actions[id], label: "思考中", type: "thinking" } },
        }));
      }, start);
      schedule(() => applyOpponentDecision(id), start + 700);
    });

    const riverDelay = 650 + opponentOrder.length * 1050;
    schedule(() => {
      setGame((current) => ({
        ...current,
        phase: "river",
        actingPlayer: null,
        visibleBoard: 5,
        prompt: `河牌 ${current.board[4].rank}${current.board[4].suit} 翻开 · 准备摊牌`,
        log: [{ name: "系统", text: `河牌 ${current.board[4].rank}${current.board[4].suit}`, time: "刚刚", type: "deal" }, ...current.log].slice(0, 6),
      }));
    }, riverDelay);
    schedule(() => setGame((current) => ({ ...current, phase: "showdown", prompt: "正在比较所有未弃牌玩家的最大五张牌…" })), riverDelay + 1200);
    schedule(() => setGame((current) => resolveShowdown(current)), riverDelay + 2200);
    schedule(() => dealNextHand(), riverDelay + 6600);
  };

  useEffect(() => {
    const heroCanAct = Boolean(game.hands.hero) && game.stacks.hero > 0;
    if (game.phase === "betting" && !heroCanAct) {
      const timer = window.setTimeout(() => beginOpponentSequence(game.hands.hero ? "前注全下" : "旁观", 0, !game.hands.hero), 800);
      actionTimers.current.push(timer);
    }
  // Each new hand should auto-run only when the user no longer has chips.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.handNumber]);

  useEffect(() => {
    setRaiseAmount(Math.min(game.stacks.hero, Math.max(game.callAmount * 2, game.bigBlind * 3)));
  }, [game.handNumber, game.bigBlind, game.callAmount, game.stacks.hero]);

  const restartMatch = () => {
    actionTimers.current.forEach((timer) => window.clearTimeout(timer));
    actionTimers.current = [];
    setShowRaise(false);
    setRaiseAmount(120);
    setGame(createHand(initialStacks, 1));
  };

  const heroCards = game.hands.hero ?? [];
  const heroBest = heroCards.length ? bestHand([...heroCards, ...game.board.slice(0, game.visibleBoard)]) : { score: [0], label: "旁观中" };
  const heroCallAmount = Math.min(game.callAmount, game.stacks.hero);
  const aliveCount = playerIds.filter((id) => game.stacks[id] > 0 || Boolean(game.hands[id])).length;
  const revealCards = game.phase === "showdown" || game.phase === "payout" || game.phase === "gameover";
  const isResolving = game.phase !== "betting";

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
        <button className="account-chip" onClick={() => openRecords("funds")} aria-label="打开账户记录">
          <span className="status-dot" />
          <span><small>可用筹码</small><b>¥ 12,840.00</b></span>
          <span className="avatar">陈</span>
        </button>
      </header>

      {view === "table" ? (
        <section className="game-layout">
          <aside className="left-panel panel">
            <p className="eyebrow">锦标赛 · SIT &amp; GO</p>
            <h1>赢家通吃</h1>
            <div className="room-meta"><span>{aliveCount} 人存活</span><span>¥{game.bigBlind / 2} / ¥{game.bigBlind}</span></div>
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
              <p>每 4 手盲注翻倍。淘汰所有对手、赢得全部 ¥12,000 筹码即可夺冠。</p>
            </div>
            <button className="leave-button" onClick={() => flash("每手随机洗牌，摊牌后自动结算并开启下一手")}>查看赛制说明</button>
          </aside>

          <section className="table-stage" aria-label="德州扑克牌桌">
            <div className="hand-code">#{game.handCode} <span>·</span> 第 {game.handNumber} 手 · 随机洗牌</div>
            <div className="table-light" />
            <div className="poker-table">
              <div className="felt-ring" />
              <span className="watermark">RIVER</span>
              {players.map((player) => {
                const action = game.actions[player.id];
                const isActing = game.actingPlayer === player.id;
                const wonHand = Boolean(game.result?.winnerIds.includes(player.id));
                const isOut = !game.hands[player.id];
                return (
                <div className={`${player.className} ${isActing ? "is-active" : ""} ${action.folded ? "is-folded" : ""} ${wonHand ? "is-winner" : ""} ${isOut ? "is-out" : ""}`} key={player.name}>
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
                ) : <div className="card-back" key={`hidden-${index}`}>?</div>)}
              </div>
              <div className="dealer-chip">D</div>
              <div className={`hero-seat ${game.actingPlayer === "hero" ? "is-active" : ""} ${game.result?.winnerIds.includes("hero") ? "is-winner" : ""}`}>
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
              {game.phase === "gameover" ? (
                <div className="action-buttons"><button className="primary" onClick={restartMatch}>重新开始锦标赛</button></div>
              ) : game.phase === "payout" ? (
                <div className="action-buttons"><button className="primary" onClick={dealNextHand}>立即下一手</button></div>
              ) : (
                <div className="action-buttons">
                  <button className="ghost" disabled={isResolving || !heroCards.length || game.stacks.hero === 0} onClick={() => beginOpponentSequence("弃牌", 0, true)}>弃牌</button>
                  <button className="ghost" disabled={isResolving} onClick={() => flash("当前有 ¥" + heroCallAmount + " 需要跟注")}>过牌</button>
                  <button className="primary" disabled={isResolving || !heroCards.length || game.stacks.hero === 0} onClick={() => beginOpponentSequence(heroCallAmount === game.stacks.hero ? `全下 ¥${heroCallAmount}` : `跟注 ¥${heroCallAmount}`, heroCallAmount)}>{heroCallAmount === game.stacks.hero ? "全下" : "跟注"} · ¥{heroCallAmount}</button>
                  <button className={showRaise ? "raise selected" : "raise"} disabled={isResolving || game.stacks.hero <= heroCallAmount} onClick={() => setShowRaise(!showRaise)}>加注</button>
                </div>
              )}
              {showRaise && game.phase === "betting" && (
                <div className="raise-tray">
                  <div className="raise-head"><span>加注金额</span><b>¥{raiseAmount.toLocaleString()}</b></div>
                  <input aria-label="选择加注金额" type="range" min={Math.min(game.stacks.hero, game.callAmount * 2)} max={game.stacks.hero} step={Math.max(10, game.bigBlind / 2)} value={Math.min(game.stacks.hero, Math.max(raiseAmount, Math.min(game.stacks.hero, game.callAmount * 2)))} onChange={(event) => setRaiseAmount(Number(event.target.value))} />
                  <div className="quick-bets">
                    <button onClick={() => setRaiseAmount(Math.min(game.stacks.hero, game.callAmount * 2))}>最小</button>
                    <button onClick={() => setRaiseAmount(Math.min(game.stacks.hero, Math.max(game.callAmount * 2, Math.floor(game.pot * .75))))}>3/4 底池</button>
                    <button onClick={() => setRaiseAmount(Math.min(game.stacks.hero, Math.max(game.callAmount * 2, game.pot)))}>满池</button>
                    <button onClick={() => setRaiseAmount(game.stacks.hero)}>全下</button>
                    <button className="confirm-bet" onClick={() => { const amount = Math.min(raiseAmount, game.stacks.hero); beginOpponentSequence(amount === game.stacks.hero ? `全下 ¥${amount}` : `加注至 ¥${amount}`, amount); }}>确认加注</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="right-panel panel">
            <p className="eyebrow">本手牌</p>
            <h2>{heroBest.label}</h2>
            <div className="equity"><div><span style={{ width: `${Math.min(94, 24 + heroBest.score[0] * 9 + (heroCards[0]?.value ?? 0))}%` }} /></div><b>{heroCards.length ? `${Math.min(94, 24 + heroBest.score[0] * 9 + (heroCards[0]?.value ?? 0))}%` : "--"}</b></div>
            <p className="muted">动态牌力估算 · {game.visibleBoard === 4 ? "等待河牌" : "五张公共牌已发完"}</p>
            <div className="hand-outs">
              <span><b>{aliveCount}</b><small>存活玩家</small></span>
              <span><b>¥{game.bigBlind}</b><small>当前大盲</small></span>
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
              <p>查看资金变化、牌局表现与结算明细。</p>
            </div>
            <div className="account-actions">
              <button onClick={() => flash("充值通道为演示功能")}>充值</button>
              <button className="outline" onClick={() => flash("提现申请为演示功能")}>提现</button>
            </div>
          </div>

          <div className="summary-grid">
            <article className="summary-card balance-card">
              <span>总账户余额</span>
              <strong>¥ 12,840.00</strong>
              <small><i /> 资金账户正常</small>
              <b className="card-symbol">¥</b>
            </article>
            <article className="summary-card">
              <span>近 30 天盈亏</span>
              <strong className="gain">+¥ 4,268.00</strong>
              <small className="positive-pill">↑ 18.6%</small>
            </article>
            <article className="summary-card">
              <span>总牌局场次</span>
              <strong>126 <em>场</em></strong>
              <small>3,842 手牌 · 胜率 56%</small>
            </article>
            <article className="summary-card">
              <span>当前等级</span>
              <strong className="gold-text">River III</strong>
              <small>距下一等级还需 1,480 XP</small>
            </article>
          </div>

          <div className="account-content-grid">
            <article className="performance-card">
              <div className="card-heading">
                <div><p className="eyebrow">PERFORMANCE</p><h2>近 7 天盈亏</h2></div>
                <strong>+¥3,260 <small>本周</small></strong>
              </div>
              <div className="chart" aria-label="近七天盈亏柱状图">
                <div className="zero-line" />
                {chartData.map((item) => (
                  <div className="chart-column" key={item.day}>
                    <span className={`bar-value ${item.value < 0 ? "negative" : ""}`}>{item.label}</span>
                    <div className={`chart-bar ${item.value < 0 ? "down" : ""}`} style={{ height: `${Math.abs(item.value) * .72}px` }} />
                    <small>{item.day}</small>
                  </div>
                ))}
              </div>
            </article>
            <aside className="profile-card">
              <div className="profile-top"><span className="profile-avatar">陈</span><div><b>陈先生</b><small>ID 8829 4106</small></div><i>已认证</i></div>
              <dl>
                <div><dt>常玩级别</dt><dd>¥5 / ¥10</dd></div>
                <div><dt>最大单场盈利</dt><dd className="gain">+¥6,420</dd></div>
                <div><dt>入池率 VPIP</dt><dd>27.8%</dd></div>
              </dl>
              <button onClick={() => flash("个人资料功能即将开放")}>管理账户 →</button>
            </aside>
          </div>

          <article className="records-card">
            <div className="records-toolbar">
              <div className="record-tabs" role="tablist" aria-label="记录类型">
                <button role="tab" aria-selected={recordTab === "funds"} className={recordTab === "funds" ? "active" : ""} onClick={() => setRecordTab("funds")}>资金流水</button>
                <button role="tab" aria-selected={recordTab === "games"} className={recordTab === "games" ? "active" : ""} onClick={() => setRecordTab("games")}>牌局记录</button>
              </div>
              <select aria-label="记录时间范围" defaultValue="30"><option value="7">近 7 天</option><option value="30">近 30 天</option><option value="90">近 3 个月</option></select>
            </div>

            {recordTab === "funds" ? (
              <div className="record-table funds-table" role="table" aria-label="资金流水">
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
                <div className="table-row table-head" role="row"><span>时间</span><span>牌桌</span><span>级别</span><span>手牌</span><span>带入</span><span>结果</span></div>
                {games.map((game) => (
                  <button className="table-row" role="row" key={`${game.time}-${game.room}`} onClick={() => flash(`${game.room} · 牌局详情为演示数据`)}>
                    <span className="time-cell">{game.time}</span><span className="room-cell"><i>♠</i>{game.room}</span><span>{game.stakes}</span><span>{game.hands}</span><span>{game.buyin}</span><strong className={game.kind === "win" ? "gain" : "loss"}>{game.result}</strong>
                  </button>
                ))}
              </div>
            )}
            <div className="table-footer"><span>显示最近 {recordTab === "funds" ? transactions.length : games.length} 条记录</span><button onClick={() => flash("没有更多记录了")}>加载更多</button></div>
          </article>
        </section>
      )}

      <div className={`toast ${notice ? "show" : ""}`} aria-live="polite"><span>✓</span>{notice}</div>
    </main>
  );
}
