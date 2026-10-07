// Valida el SQL shipped contra PGlite (Postgres real en WASM).
// Uso: npx tsx scripts/validar-sql.ts  (solo desarrollo, no se commitea su efecto)
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();

async function run(file: string): Promise<void> {
  const sql = readFileSync(file, "utf8");
  await db.exec(sql);
  console.log("OK:", file);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FALLA:", msg);
    process.exitCode = 1;
  } else {
    console.log("verifica:", msg);
  }
}

async function one<T>(q: string): Promise<T> {
  const r = await db.query<{ v: T }>(q);
  return (r.rows[0] as { v: T }).v;
}

async function main(): Promise<void> {
  // pgcrypto puede no venir precargado: shim solo para validación local.
  // (En Supabase existe por defecto; el SQL shipped no cambia.)
  await db.exec(
    "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
  ).catch(async () => {
    await db.exec(`CREATE OR REPLACE FUNCTION gen_random_uuid() RETURNS uuid
      LANGUAGE sql AS $$ SELECT md5(random()::text || clock_timestamp()::text)::uuid $$;`);
  });

  await run("supabase/schema.sql");
  await run("supabase/seed_vehicles.sql");
  await run("supabase/seed_demo_leads.sql");
  // Shims solo locales: en Supabase estos roles ya existen.
  await db.exec("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;");
  await run("supabase/migration_dashboard.sql");
  await run("supabase/migration_stock.sql");

  // Stock: códigos únicos, settings y change log
  const cods = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM vehicles WHERE codigo IS NULL",
  );
  assert((cods.rows[0] as { n: number }).n === 0, "todos los vehículos con código");
  const dup = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM (SELECT codigo FROM vehicles GROUP BY 1 HAVING count(*) > 1) t",
  );
  assert((dup.rows[0] as { n: number }).n === 0, "códigos únicos");
  const st = await db.query("SELECT * FROM stock_settings WHERE id = 1");
  assert(st.rows.length === 1, "stock_settings con fila única");
  await db.exec(
    "INSERT INTO stock_changes (codigo, accion, detalle) VALUES ('STK-001', 'estado', 'test');",
  );
  assert(true, "stock_changes acepta inserts");
  assert((await one<number>("SELECT count(*)::int AS v FROM vehicles")) === 20, "20 vehículos");
  assert((await one<number>("SELECT count(*)::int AS v FROM leads WHERE origen_demo")) === 12, "12 leads demo iniciales");

  await run("supabase/refresh_demo_data.sql");
  const n = await one<number>("SELECT count(*)::int AS v FROM leads WHERE origen_demo");
  assert(n >= 60 && n <= 80, `~70 leads demo (hay ${n})`);
  assert((await one<number>("SELECT count(*)::int AS v FROM leads WHERE NOT origen_demo")) === 0, "no toca reales (0 reales)");

  // (a) primera respuesta 5-20 s
  const mm = await db.query<{ mn: number; mx: number }>(
    `SELECT min(s) AS mn, max(s) AS mx FROM (
       SELECT extract(epoch FROM (m.created_at - l.first_message_at)) AS s
       FROM leads l JOIN messages m ON m.lead_id = l.id AND m.rol = 'bot'
       WHERE l.origen_demo AND m.wa_message_id LIKE 'demo-refresh-%-b1') t`,
  );
  const { mn, mx } = mm.rows[0] as { mn: number; mx: number };
  assert(mn >= 5 && mx <= 20, `primera respuesta 5-20 s (min=${mn} max=${mx})`);

  // (b) noche/domingo
  const off = await one<number>(
    "SELECT count(*)::int AS v FROM leads WHERE origen_demo AND is_outside_business_hours(first_message_at)",
  );
  assert(off >= 10, `suficientes fuera de horario (${off})`);

  // (c) variedad de modelos
  const mods = await one<number>(
    "SELECT count(DISTINCT auto_interes)::int AS v FROM leads WHERE origen_demo",
  );
  assert(mods >= 10, `variedad de modelos (${mods})`);

  // Funciones del panel
  const sum = await db.query("SELECT dashboard_summary(now() - interval '30 days', now()) AS s");
  const s = (sum.rows[0] as { s: Record<string, unknown> }).s;
  console.log("summary:", JSON.stringify(s).slice(0, 400));
  assert(typeof s === "object" && s !== null, "dashboard_summary devuelve JSON");
  const heat = await db.query("SELECT * FROM dashboard_heatmap(now() - interval '7 days', now())");
  assert(heat.rows.length > 0, `heatmap con celdas (${heat.rows.length})`);
  const daily = await db.query("SELECT * FROM dashboard_daily(now() - interval '7 days', now())");
  assert(daily.rows.length > 0, `daily con días (${daily.rows.length})`);
  const models = await db.query("SELECT * FROM dashboard_models(now() - interval '30 days', now())");
  assert(models.rows.length > 3, `modelos (${models.rows.length})`);

  // TZ: domingo → fuera de horario
  assert(
    await one<boolean>("SELECT is_outside_business_hours('2026-10-04T14:00:00Z'::timestamptz) AS v"),
    "domingo 11h Córdoba = fuera de horario",
  );
  assert(
    !(await one<boolean>("SELECT is_outside_business_hours('2026-10-07T12:00:00Z'::timestamptz) AS v")),
    "miércoles 09h Córdoba = en horario",
  );

  // Idempotencia: correr refresh de nuevo no duplica
  await run("supabase/refresh_demo_data.sql");
  const n2 = await one<number>("SELECT count(*)::int AS v FROM leads WHERE origen_demo");
  assert(n2 === n, `refresh idempotente (${n} → ${n2})`);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
