// Tries to abuse a real Supabase project the way an attacker with the public anon key would, and
// checks that every attempt is refused. Run it against a STAGING project, never production: it
// creates and deletes data and spends the rate limits of the two test accounts for 10 minutes.
//
// Setup (once): a second Supabase project with setup.sql applied, two confirmed test users, and,
// if CAPTCHA is on, Turnstile's testing secret key (1x0000000000000000000000000000000AA) in
// Authentication → Attack Protection, so the dummy token below is accepted.
//
// Run from the repository root:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=... \
//   A_EMAIL=a@test.com A_PASSWORD=... B_EMAIL=b@test.com B_PASSWORD=... \
//   node backend/supabase/tests/abuse.mjs
// Optional: SKIP_SLOW=1 skips the quota, rate limit and 100-file tests.
import { createRequire } from "node:module";

// supabase-js comes from the frontend's dependencies (npm ci --prefix frontend).
const require = createRequire(new URL("../../../frontend/package.json", import.meta.url));
const { createClient } = await import(require.resolve("@supabase/supabase-js"));

const env = (k) => process.env[k] ?? (console.error(`missing ${k}`), process.exit(2));
const URL_ = env("SUPABASE_URL");
const ANON = env("SUPABASE_ANON_KEY");
const captchaToken = process.env.CAPTCHA_TOKEN ?? "XXXX.DUMMY.TOKEN.XXXX";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};

async function signIn(email, password) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return { c, id: data.user.id, token: data.session.access_token };
}

const A = await signIn(env("A_EMAIL"), env("A_PASSWORD"));
const B = await signIn(env("B_EMAIL"), env("B_PASSWORD"));
const tag = `abuse-${Date.now()}`;

// ---------- one person can't reach another's data ----------
await A.c.from("records").upsert({ user_id: A.id, kind: "note", id: tag, data: { title: "segredo de A" } });
{
  const { data } = await B.c.from("records").select("user_id,id").eq("id", tag);
  check("B não lê os records de A", Array.isArray(data) && data.length === 0);
  const { error } = await B.c.from("records").insert({ user_id: A.id, kind: "note", id: tag + "-b", data: {} });
  check("B não grava como se fosse A", !!error, error?.message);
  const { data: upd } = await B.c.from("records").update({ data: { hacked: true } }).eq("id", tag).select();
  check("B não altera os records de A", !upd?.length);
  const { data: files } = await B.c.storage.from("anexos").list(A.id);
  check("B não lista os anexos de A", !files?.length);
  const up = await B.c.storage.from("anexos").upload(`${A.id}/${tag}`, new Blob(["x"], { type: "image/png" }));
  check("B não envia arquivo para a pasta de A", !!up.error, up.error?.message);
}

// ---------- internal tables and functions aren't reachable through the API ----------
for (const fn of ["due_reminders", "reminders_sent_today", "reminders_sent_total_today", "purge_old_data", "rate_hit", "records_usage", "anexos_room"]) {
  const { error } = await B.c.rpc(fn, {});
  check(`RPC ${fn} recusada`, !!error, error?.code);
}
for (const t of ["user_usage", "rate_windows"]) {
  const { data, error } = await B.c.from(t).select("*").limit(1);
  check(`tabela ${t} inacessível`, !!error || !data?.length, error?.code);
}

// ---------- server-side limits ----------
{
  const { error } = await A.c.from("records").upsert({ user_id: A.id, kind: "note", id: tag + "-big", data: { t: "x".repeat(600_000) } });
  check("linha de 600 KB recusada", /records_data_size/.test(error?.message ?? ""), error?.message);
  const { error: wa } = await A.c.from("reminders").insert({
    user_id: A.id, event_id: tag, send_at: new Date(Date.now() + 864e5).toISOString(),
    title: "t", when_label: "w", channel: "whatsapp", phone: "+5511999999999",
  });
  check("WhatsApp para número fora das configurações recusado", !!wa, wa?.message);
}

if (!process.env.SKIP_SLOW) {
  // Quota: 500 KB rows until the account's 10 MB run out.
  let quota = null;
  for (let i = 0; i < 25 && !quota; i++) {
    const { error } = await B.c.from("records").upsert({ user_id: B.id, kind: "note", id: `${tag}-q${i}`, data: { t: "q".repeat(500_000) } });
    if (error) quota = error.message;
  }
  check("cota de 10 MB recusa crescimento", quota === "ORG_QUOTA", quota ?? "nunca recusou");
  await B.c.from("records").delete().like("id", `${tag}-q%`);

  // Rate: 500-row batches rewritten until 20,000 rows in 10 minutes.
  const rows = Array.from({ length: 500 }, (_, i) => ({ user_id: B.id, kind: "item", id: `${tag}-r${i}`, data: { v: 0 } }));
  let rate = null;
  for (let n = 1; n <= 45 && !rate; n++) {
    const { error } = await B.c.from("records").upsert(rows.map((r) => ({ ...r, data: { v: n } })));
    if (error) rate = error.message;
  }
  check("limite de escrita recusa rajadas", rate === "ORG_RATE", rate ?? "nunca recusou");
  const { error: del } = await B.c.from("records").delete().like("id", `${tag}-r%`);
  check("apagar continua funcionando no limite", !del, del?.message);

  // Storage: 100 files at most.
  const png = new Blob([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), (c) => c.charCodeAt(0))], { type: "image/png" });
  const names = [];
  let refused = null;
  for (let i = 0; i < 101 && !refused; i++) {
    const name = `${B.id}/${tag}-f${i}`;
    const { error } = await B.c.storage.from("anexos").upload(name, png, { contentType: "image/png" });
    if (error) refused = error.message;
    else names.push(name);
  }
  check("101º anexo recusado", !!refused && names.length <= 100, refused ?? "aceitou 101");
  if (names.length) await B.c.storage.from("anexos").remove(names);
}

// ---------- Edge Functions ----------
{
  const fn = (name, init) => fetch(`${URL_}/functions/v1/${name}`, init);
  const sr = await fn("send-reminders", { method: "POST", headers: { apikey: ANON } });
  check("send-reminders sem o segredo → 401", sr.status === 401, String(sr.status));
  const srUser = await fn("send-reminders", { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${A.token}` } });
  check("send-reminders com sessão de usuário → 401", srUser.status === 401, String(srUser.status));
  const da = await fn("delete-account", { method: "POST", headers: { apikey: ANON } });
  check("delete-account sem sessão → 401", da.status === 401, String(da.status));
}

await A.c.from("records").delete().eq("id", tag);
await A.c.from("reminders").delete().eq("event_id", tag);
console.log(failures ? `\n${failures} FAIL` : "\nTodas as proteções responderam como esperado.");
process.exit(failures ? 1 : 0);
