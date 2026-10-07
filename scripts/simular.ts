#!/usr/bin/env tsx
/**
 * Simula un mensaje entrante de WhatsApp contra el webhook local.
 * Envía un payload idéntico al de Meta, firmado con META_APP_SECRET.
 *
 * Uso:
 *   npm run simular -- --telefono=5493515550199 --texto="Hola, me interesa la Hilux"
 *   npm run simular -- --telefono=5493515550199 --texto="reiniciar demo"
 *   npm run simular -- --telefono=5493515550199 --tipo=audio   (prueba no-textual)
 *
 * Requiere el dev server corriendo (npm run dev) y META_APP_SECRET igual
 * en .env.local (vale cualquier string, ej. "pendiente", siempre que ambos
 * lados usen el mismo: el script firma con ese valor y el webhook valida
 * contra el mismo).
 */
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadLocalEnv(): void {
  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    break;
  }
}

function arg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return fallback;
}

async function main(): Promise<void> {
  loadLocalEnv();

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const telefono =
    arg("telefono") ?? positional[0] ?? process.env.SIMULAR_TELEFONO;
  const tipo = arg("tipo", "text") ?? "text";
  const texto =
    arg("texto") ??
    (positional.length > 1 ? positional.slice(1).join(" ") : undefined) ??
    "Hola, ¿qué autos tienen?";
  const base =
    arg("base") ?? process.env.SIMULAR_BASE ?? "http://localhost:3000";

  if (!telefono) {
    console.error(
      "Falta el teléfono. Ejemplo:\n  npm run simular -- --telefono=5493515550199 --texto=\"Hola\"",
    );
    process.exit(1);
  }
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error(
      "Falta META_APP_SECRET en .env.local (vale cualquier string para simular, ej. META_APP_SECRET=pendiente).",
    );
    process.exit(1);
  }

  const waId = `wamid.sim-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message =
    tipo === "text"
      ? {
          from: telefono,
          id: waId,
          timestamp,
          type: "text",
          text: { body: texto },
        }
      : {
          from: telefono,
          id: waId,
          timestamp,
          type: tipo,
          [tipo]: { mime_type: "audio/ogg", id: "fake-media-id" },
        };

  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1234567890",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5493510000000",
                phone_number_id: "test-phone-id",
              },
              contacts: [
                { profile: { name: "Demo Local" }, wa_id: telefono },
              ],
              messages: [message],
            },
          },
        ],
      },
    ],
  };

  const rawBody = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;

  console.log(`→ POST ${base}/api/whatsapp  (${telefono}, ${tipo})`);
  const res = await fetch(`${base}/api/whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": signature,
    },
    body: rawBody,
  });
  console.log(`← ${res.status} ${await res.text()}`);
  console.log(
    "Revisá la terminal del dev server para ver el procesamiento en background.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
