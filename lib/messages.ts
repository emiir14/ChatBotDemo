import { getSupabaseAdmin } from "@/lib/supabase";
import type { SendResult } from "@/lib/meta";

/**
 * Guarda en `messages` un mensaje que el bot intentó enviar.
 *
 * Si Meta lo rechazó, el texto igual queda en el historial y el motivo se
 * persiste en `error_envio`: nunca se pierde el registro de un envío fallido.
 * Solo marca `last_bot_reply_at` cuando el envío salió bien.
 */
export async function saveBotMessage(
  leadId: string,
  texto: string,
  sent: SendResult,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("messages").insert({
    lead_id: leadId,
    rol: "bot",
    texto,
    wa_message_id: sent.metaMessageId ?? null,
    error_envio: sent.ok
      ? null
      : (sent.errorMessage ?? "Error desconocido al enviar."),
  });
  if (error) {
    console.error(
      `[messages] no se pudo guardar el mensaje del bot (lead ${leadId}): ${error.message}`,
    );
  }
  if (!sent.ok) return;
  await supabase
    .from("leads")
    .update({ last_bot_reply_at: new Date().toISOString() })
    .eq("id", leadId);
}
