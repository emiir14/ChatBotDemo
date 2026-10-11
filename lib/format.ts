/**
 * Formato local es-AR para el panel: teléfonos, tiempos relativos, moneda.
 */

/** 5493515550101 → "+54 9 351 555 0101". */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  const m = d.match(/^54?9?(\d{3})(\d{3})(\d{4})$/);
  if (!m) return phone;
  return `+54 9 ${m[1]} ${m[2]} ${m[3]}`;
}

/** "hace 5 min", "hace 2 h", "ayer", etc. */
export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffSec = Math.round((now.getTime() - t) / 1000);
  if (diffSec < 10) return "ahora mismo";
  const rtf = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });
  if (diffSec < 60) return rtf.format(-diffSec, "second");
  const min = Math.floor(diffSec / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.floor(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const days = Math.floor(h / 24);
  if (days < 7) return rtf.format(-days, "day");
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date(t));
}

/** Hora corta en Córdoba: "14:35". */
export function formatHourCordoba(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Cordoba",
  }).format(t);
}

/** Precio es-AR: USD 41.200 / $27.800.000. */
export function formatMoney(price: number, moneda: string): string {
  if (moneda === "USD") {
    return `USD ${new Intl.NumberFormat("es-AR").format(price)}`;
  }
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(price);
}
