// Supabase Edge Function: deletes the signed-in person's account (LGPD: right to erasure).
// Called by the app from Configurações → Dados → "Apagar todos os meus dados", with the person's own
// session. Their rows in `records` and `reminders` go with the account (on delete cascade), and their
// attached files are removed here too, in case the app couldn't do it first.
// Deploy WITH JWT verification (the default): npx supabase functions deploy delete-account
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Any origin may call it: it only acts with the caller's own session token (no cookies are involved),
// so another site can't make a visitor delete their account.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "method not allowed" });

  // Who is asking: read from their session token, never from the request body.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, { error: "unauthorized" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  const id = who?.user?.id;
  if (whoErr || !id) return reply(401, { error: "unauthorized" });

  // Attached files: everything under the person's folder.
  const bucket = admin.storage.from("anexos");
  for (;;) {
    const { data: files, error } = await bucket.list(id, { limit: 1000 });
    if (error) return reply(500, { error: "could not list attachments" });
    if (!files?.length) break;
    const { error: rmErr } = await bucket.remove(files.map((f) => `${id}/${f.name}`));
    if (rmErr) return reply(500, { error: "could not remove attachments" });
    if (files.length < 1000) break;
  }

  // The rows go too, explicitly (the cascade does the same; this keeps it true even if a table changes).
  const rec = await admin.from("records").delete().eq("user_id", id);
  const rem = await admin.from("reminders").delete().eq("user_id", id);
  if (rec.error || rem.error) return reply(500, { error: "could not delete data" });

  const { error: delErr } = await admin.auth.admin.deleteUser(id);
  if (delErr) return reply(500, { error: "could not delete account" });
  return reply(200, { deleted: true });
});
