import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  state: text("state").notNull(),
  version: integer("version").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull(),
  profile: text("profile").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  hash: text("hash").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const invites = sqliteTable("invites", {
  hash: text("hash").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedBy: text("used_by"),
  revoked: integer("revoked").notNull().default(0),
});
export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  result: text("result").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at").notNull(),
});
export const connections = sqliteTable("connections", {
  actor: text("actor")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  settings: text("settings").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
