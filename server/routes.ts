import express from "express";
import type { Knex } from "knex";

import { changePassword, login, logout, me, requireAuth, signUp } from "./auth";
import { db } from "./db";

// SRD entries (no owner) plus the user's own.
const visibleTo = (userId: string) => (qb: Knex.QueryBuilder) =>
  qb.whereNull("ownerId").orWhere("ownerId", userId);

// Match the shapes the frontend already uses: `isSrd` instead of `ownerId`, and
// optional fields omitted rather than null.
function toEntry({ ownerId, ...row }: Record<string, unknown>) {
  const fields = Object.entries(row).filter(([, v]) => v !== null);
  return { ...Object.fromEntries(fields), isSrd: ownerId === null };
}

function toCharacter({
  id,
  name,
  data,
}: {
  id: string;
  name: string;
  data: Omit<ICharacter, "id" | "name">;
}): ICharacter {
  return { ...data, id, name };
}

export const api = express.Router();

// Sign-in endpoints sit in front of requireAuth so you can reach them signed out.
api.post("/auth/signup", signUp);
api.post("/auth/login", login);
api.post("/auth/logout", logout);
api.get("/auth/me", me);

api.use(requireAuth);

api.post("/auth/password", changePassword);

for (const [path, table, key, orderBy] of [
  ["/abilities", "abilities", "abilities", "name"],
  ["/items", "items", "items", "name"],
  ["/spells", "spells", "spells", "name"],
  ["/skills", "skills", "skills", "name"],
  ["/skill-synergies", "skillSynergies", "skillSynergies", "id"],
] as const) {
  api.get(path, async (req, res) => {
    const rows = await db(table).where(visibleTo(req.userId)).orderBy(orderBy);
    res.json({ [key]: rows.map(toEntry) });
  });
}

api.get("/characters", async (req, res) => {
  const rows = await db("characters")
    .where("ownerId", req.userId)
    .orderBy("name");
  res.json({ characters: rows.map(toCharacter) });
});

api.get("/characters/:id", async (req, res) => {
  const row = await db("characters")
    .where({ id: req.params.id, ownerId: req.userId })
    .first();
  if (!row) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  res.json({ character: toCharacter(row) });
});

api.put("/characters/:id", async (req, res) => {
  const { id: _id, name, ...data } = req.body as ICharacter;
  const [row] = await db("characters")
    .where({ id: req.params.id, ownerId: req.userId })
    .update({ name, data: JSON.stringify(data), updatedAt: db.fn.now() })
    .returning("*");
  if (!row) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  res.json({ character: toCharacter(row) });
});

api.post("/skills", async (req, res) => {
  const { name, ability, armorCheck } = req.body as IServer.PostSkill.Request;
  const [row] = await db("skills")
    .insert({ name, ability, armorCheck, ownerId: req.userId })
    .returning("*");
  res.status(201).json({ skill: toEntry(row) });
});

// Only the user's own skills can be edited; SRD skills are read-only.
api.put("/skills/:id", async (req, res) => {
  const { name, ability, armorCheck } = req.body as IServer.PutSkill.Request;
  const [row] = await db("skills")
    .where({ id: req.params.id, ownerId: req.userId })
    .update({ name, ability, armorCheck })
    .returning("*");
  if (!row) {
    res.status(404).json({ error: "Skill not found or not editable" });
    return;
  }
  res.json({ skill: toEntry(row) });
});

api.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});
