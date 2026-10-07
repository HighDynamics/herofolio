import type { Knex } from "knex";

// Compendium entries with a null owner are SRD content every user can see.
// Entries with an owner are that user's private additions.
function compendiumColumns(knex: Knex, t: Knex.CreateTableBuilder) {
  t.text("id").primary().defaultTo(knex.raw("gen_random_uuid()::text"));
  t.uuid("owner_id").references("id").inTable("users").onDelete("CASCADE");
  t.index("owner_id");
  t.text("name").notNullable();
}

export async function up(knex: Knex) {
  await knex.schema.createTable("users", (t) => {
    t.uuid("id").primary().defaultTo(knex.fn.uuid());
    t.text("email").notNullable();
    t.text("name");
    t.text("password_hash"); // set once accounts land
    t.timestamps(true, true);
  });
  await knex.raw(
    "create unique index users_email_unique on users (lower(email))",
  );

  await knex.schema.createTable("skills", (t) => {
    compendiumColumns(knex, t);
    t.text("ability").notNullable();
    t.boolean("armor_check").notNullable().defaultTo(false);
    t.boolean("is_default").notNullable().defaultTo(false);
  });

  await knex.schema.createTable("skill_synergies", (t) => {
    t.text("id").primary().defaultTo(knex.raw("gen_random_uuid()::text"));
    t.uuid("owner_id").references("id").inTable("users").onDelete("CASCADE");
    t.index("owner_id");
    t.text("from_skill_id")
      .notNullable()
      .references("id")
      .inTable("skills")
      .onDelete("CASCADE");
    t.text("to_skill_id")
      .notNullable()
      .references("id")
      .inTable("skills")
      .onDelete("CASCADE");
    t.integer("ranks_required").notNullable();
    t.integer("bonus").notNullable();
    t.text("condition");
    t.boolean("is_default").notNullable().defaultTo(false);
  });

  await knex.schema.createTable("abilities", (t) => {
    compendiumColumns(knex, t);
    t.text("description").notNullable().defaultTo("");
    t.jsonb("effects");
  });

  await knex.schema.createTable("items", (t) => {
    compendiumColumns(knex, t);
    t.float("weight");
    t.integer("caster_level");
    t.text("price");
    t.text("description").notNullable().defaultTo("");
    t.jsonb("effects");
  });

  await knex.schema.createTable("spells", (t) => {
    compendiumColumns(knex, t);
    t.text("school").notNullable();
    t.text("sub_school");
    t.text("descriptor");
    t.text("level").notNullable();
    t.text("components");
    t.text("casting_time");
    t.text("range");
    t.text("target");
    t.text("effect");
    t.text("area");
    t.text("target_or_area");
    t.text("duration");
    t.text("saving_throw");
    t.text("spell_resistance");
    t.text("description").notNullable().defaultTo("");
    t.jsonb("effects");
  });

  // The sheet's shape is still changing, so everything but id, owner, and
  // name lives in one jsonb document for now.
  await knex.schema.createTable("characters", (t) => {
    t.text("id").primary().defaultTo(knex.raw("gen_random_uuid()::text"));
    t.uuid("owner_id").references("id").inTable("users").onDelete("CASCADE");
    t.index("owner_id");
    t.text("name").notNullable();
    t.jsonb("data").notNullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex) {
  for (const table of [
    "characters",
    "spells",
    "items",
    "abilities",
    "skill_synergies",
    "skills",
    "users",
  ]) {
    await knex.schema.dropTable(table);
  }
}
