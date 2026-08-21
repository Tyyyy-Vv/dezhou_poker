import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export type StoredHandAction = {
  name: string;
  text: string;
  time: string;
  type: string;
};

export type StoredPotAward = {
  label: string;
  amount: number;
  winnerIds: string[];
  isRefund?: boolean;
};

export const pokerHandHistories = sqliteTable(
  "poker_hand_histories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    clientHandId: text("client_hand_id").notNull(),
    playedAt: text("played_at").notNull(),
    displayTime: text("display_time").notNull(),
    handNumber: integer("hand_number").notNull(),
    handCode: integer("hand_code").notNull(),
    stakes: text("stakes").notNull(),
    heroCards: text("hero_cards").notNull(),
    board: text("board").notNull(),
    result: text("result").notNull(),
    delta: integer("delta").notNull(),
    actions: text("actions_json", { mode: "json" })
      .$type<StoredHandAction[]>()
      .notNull(),
    pots: text("pots_json", { mode: "json" })
      .$type<StoredPotAward[]>()
      .notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_poker_hands_user_client_hand").on(
      table.userId,
      table.clientHandId,
    ),
    index("idx_poker_hands_user_played_at").on(table.userId, table.playedAt),
  ],
);
