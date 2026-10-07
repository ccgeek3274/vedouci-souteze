/** Admin push notifications via ntfy.sh.
 *
 * NTFY_TOPIC names a topic on the public ntfy.sh server; the (random, secret)
 * topic name is the only credential. Unset topic = notifications disabled
 * (typical local dev). Callers run this via executionCtx.waitUntil — it must
 * never throw into the request path, so all failures are swallowed.
 */
export async function notifyAdmin(
  topic: string | undefined,
  title: string,
  message: string,
  clickUrl?: string
): Promise<void> {
  if (!topic) return;
  try {
    // JSON publishing endpoint: UTF-8 safe (plain POST puts the title in an
    // HTTP header, which mangles Czech diacritics).
    await fetch('https://ntfy.sh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title, message, click: clickUrl, tags: ['bust_in_silhouette'] }),
    });
  } catch {
    // Notification failure must never affect the triggering request.
  }
}
