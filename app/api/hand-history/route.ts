import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  pokerHandHistories,
  type StoredHandAction,
  type StoredPotAward,
} from "../../../db/schema";
import { getChatGPTUser, type ChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

const MAX_HISTORY_RECORDS = 100;
const INSERT_BATCH_SIZE = 20;

type IncomingHand = {
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
  actions: StoredHandAction[];
  pots: StoredPotAward[];
};

function userSummary(user: ChatGPTUser) {
  return {
    userId: user.userId,
    displayName: user.displayName,
    email: user.email,
  };
}

function unauthorized() {
  return Response.json(
    { authenticated: false, error: "请先登录后再访问账号手牌记录。" },
    { status: 401 },
  );
}

function routeFailure(user: ChatGPTUser, error: unknown) {
  console.error("hand-history API failed", error);
  return Response.json(
    {
      authenticated: true,
      user: userSummary(user),
      error: "账号手牌记录暂时不可用，请稍后重试。",
    },
    { status: 500 },
  );
}

function requiredString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") throw new Error(`${field} 必须是字符串`);
  const result = value.trim();
  if (!result || result.length > maxLength) throw new Error(`${field} 无效`);
  return result;
}

function requiredInteger(value: unknown, field: string, min: number, max: number) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${field} 无效`);
  }
  return value as number;
}

function parseActions(value: unknown): StoredHandAction[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error("actions 无效");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("actions 无效");
    const action = item as Record<string, unknown>;
    return {
      name: requiredString(action.name, "action.name", 80),
      text: requiredString(action.text, "action.text", 240),
      time: requiredString(action.time, "action.time", 40),
      type: requiredString(action.type, "action.type", 40),
    };
  });
}

function parsePots(value: unknown): StoredPotAward[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error("pots 无效");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("pots 无效");
    const pot = item as Record<string, unknown>;
    if (!Array.isArray(pot.winnerIds) || pot.winnerIds.length > 10) {
      throw new Error("pot.winnerIds 无效");
    }
    return {
      label: requiredString(pot.label, "pot.label", 80),
      amount: requiredInteger(pot.amount, "pot.amount", 0, 1_000_000_000),
      winnerIds: pot.winnerIds.map((id) => requiredString(id, "winnerId", 80)),
      ...(typeof pot.isRefund === "boolean" ? { isRefund: pot.isRefund } : {}),
    };
  });
}

function parseIncomingHand(value: unknown, fallbackTimestamp: number): IncomingHand {
  if (!value || typeof value !== "object") throw new Error("手牌记录无效");
  const hand = value as Record<string, unknown>;
  const suppliedPlayedAt = typeof hand.playedAt === "string" ? hand.playedAt : "";
  const parsedTime = suppliedPlayedAt ? Date.parse(suppliedPlayedAt) : Number.NaN;
  const playedAt = Number.isFinite(parsedTime)
    ? new Date(parsedTime).toISOString()
    : new Date(fallbackTimestamp).toISOString();

  return {
    id: requiredString(hand.id, "id", 160),
    playedAt,
    time: requiredString(hand.time, "time", 80),
    handNumber: requiredInteger(hand.handNumber, "handNumber", 1, 1_000_000),
    handCode: requiredInteger(hand.handCode, "handCode", 1, 1_000_000_000),
    stakes: requiredString(hand.stakes, "stakes", 80),
    heroCards: requiredString(hand.heroCards, "heroCards", 80),
    board: requiredString(hand.board, "board", 160),
    result: requiredString(hand.result, "result", 240),
    delta: requiredInteger(hand.delta, "delta", -1_000_000_000, 1_000_000_000),
    actions: parseActions(hand.actions),
    pots: parsePots(hand.pots),
  };
}

async function listHands(userId: string) {
  const rows = await getDb()
    .select()
    .from(pokerHandHistories)
    .where(eq(pokerHandHistories.userId, userId))
    .orderBy(desc(pokerHandHistories.playedAt), desc(pokerHandHistories.id))
    .limit(MAX_HISTORY_RECORDS);

  return rows.map((row) => ({
    id: row.clientHandId,
    playedAt: row.playedAt,
    time: row.displayTime,
    handNumber: row.handNumber,
    handCode: row.handCode,
    stakes: row.stakes,
    heroCards: row.heroCards,
    board: row.board,
    result: row.result,
    delta: row.delta,
    actions: row.actions,
    pots: row.pots,
  }));
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();

  try {
    return Response.json({
      authenticated: true,
      user: userSummary(user),
      records: await listHands(user.userId),
    });
  } catch (error) {
    return routeFailure(user, error);
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();

  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 1_000_000) {
      return Response.json({ error: "同步数据过大。" }, { status: 413 });
    }

    const rawPayload = await request.text();
    if (rawPayload.length > 1_000_000) {
      return Response.json({ error: "同步数据过大。" }, { status: 413 });
    }
    const payload = JSON.parse(rawPayload) as { records?: unknown };
    if (!Array.isArray(payload.records) || payload.records.length > MAX_HISTORY_RECORDS) {
      return Response.json(
        { error: `records 必须是最多 ${MAX_HISTORY_RECORDS} 条记录的数组。` },
        { status: 400 },
      );
    }

    const now = Date.now();
    const records = payload.records.map((record, index) =>
      parseIncomingHand(record, now - index),
    );
    const db = getDb();

    for (let index = 0; index < records.length; index += INSERT_BATCH_SIZE) {
      const batch = records.slice(index, index + INSERT_BATCH_SIZE);
      if (!batch.length) continue;
      await db
        .insert(pokerHandHistories)
        .values(batch.map((record) => ({
          userId: user.userId,
          clientHandId: record.id,
          playedAt: record.playedAt!,
          displayTime: record.time,
          handNumber: record.handNumber,
          handCode: record.handCode,
          stakes: record.stakes,
          heroCards: record.heroCards,
          board: record.board,
          result: record.result,
          delta: record.delta,
          actions: record.actions,
          pots: record.pots,
        })))
        .onConflictDoNothing({
          target: [pokerHandHistories.userId, pokerHandHistories.clientHandId],
        });
    }

    return Response.json({
      authenticated: true,
      user: userSummary(user),
      records: await listHands(user.userId),
    });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && /无效|必须/.test(error.message))) {
      return Response.json(
        { error: error instanceof Error ? error.message : "请求数据无效。" },
        { status: 400 },
      );
    }
    return routeFailure(user, error);
  }
}
