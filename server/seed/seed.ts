// Loads ./data: the shared SRD compendium, plus Arn and the non-SRD entries
// owned by BOOTSTRAP_USER_EMAIL. Other users' data is left alone.
// Usage: npm run seed (set SEED_CONFIRM=1 to replace the seed account's data)
import { db } from "../db";
import abilities from "./data/abilities";
import characters from "./data/characters";
import items from "./data/items";
import { skillSynergies, skills } from "./data/skills";
import spells from "./data/spells";

// Only SRD content is shared with every user. Everything else in the seed data
// belongs to the seed user.
const NON_SRD_SKILLS = new Set(["Perception", "Stealth"]);

const email = process.env.BOOTSTRAP_USER_EMAIL;
if (!email) {
  console.error(
    "Set BOOTSTRAP_USER_EMAIL to the account that should own the seed data.",
  );
  process.exit(1);
}

try {
  const existingOwner = await db("users")
    .whereRaw("lower(email) = lower(?)", [email])
    .first();
  const [{ count }] = existingOwner
    ? await db("characters")
        .where({ ownerId: existingOwner.id })
        .count({ count: "*" })
    : [{ count: 0 }];
  if (Number(count) > 0 && process.env.SEED_CONFIRM !== "1") {
    console.error(
      `Refusing to seed: ${email} has ${count} character(s) that would be replaced. ` +
        "Rerun with SEED_CONFIRM=1 to overwrite.",
    );
    process.exit(1);
  }

  const owner = await db.transaction(async (trx) => {
    const owner =
      existingOwner ?? (await trx("users").insert({ email }).returning("*"))[0];
    const ownerIf = (isOwned: boolean) => (isOwned ? owner.id : null);
    const json = (value: unknown) => value && JSON.stringify(value);

    // Only the seed account's rows are replaced. Other users' characters and
    // private entries are never touched.
    for (const table of [
      "characters",
      "skillSynergies",
      "skills",
      "abilities",
      "items",
      "spells",
    ]) {
      await trx(table).where({ ownerId: owner.id }).del();
    }

    // Skills go before the synergies that reference them.
    const compendium: [string, { id: string }[]][] = [
      [
        "skills",
        skills.map((s) => ({
          ...s,
          ownerId: ownerIf(NON_SRD_SKILLS.has(s.name)),
        })),
      ],
      [
        "abilities",
        abilities.map(({ effects, ...a }) => ({
          ...a,
          ownerId: owner.id,
          effects: json(effects),
        })),
      ],
      [
        "items",
        items.map(({ isSrd, effects, ...i }) => ({
          ...i,
          ownerId: ownerIf(!isSrd),
          effects: json(effects),
        })),
      ],
      [
        "spells",
        spells.map(({ isSrd, effects, ...s }) => ({
          ...s,
          ownerId: ownerIf(!isSrd),
          effects: json(effects),
        })),
      ],
      ["skillSynergies", skillSynergies.map((s) => ({ ...s, ownerId: null }))],
    ];

    for (const [table, rows] of compendium) {
      // SRD rows are updated in place rather than deleted and re-added, so
      // other users' rows that reference them (like synergies) survive.
      await trx(table).insert(rows).onConflict("id").merge();
      // Drop SRD rows that are no longer in the seed data.
      await trx(table)
        .whereNull("ownerId")
        .whereNotIn(
          "id",
          rows.map((r) => r.id),
        )
        .del();
    }

    await trx("characters").insert(
      characters.map(({ id, name, ...data }) => ({
        id,
        name,
        ownerId: owner.id,
        data: JSON.stringify(data),
      })),
    );
    return owner;
  });

  const counts = await Promise.all(
    [
      "skills",
      "skill_synergies",
      "abilities",
      "items",
      "spells",
      "characters",
    ].map(async (table) => {
      const [{ srd, owned }] = await db(table).select(
        db.raw("count(*) filter (where owner_id is null)::int as srd"),
        db.raw("count(*) filter (where owner_id = ?)::int as owned", [
          owner.id,
        ]),
      );
      return `${table}: ${srd} SRD, ${owned} owned by ${email}`;
    }),
  );
  console.log(`Seeded:\n  ${counts.join("\n  ")}`);
} finally {
  await db.destroy();
}
