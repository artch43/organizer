import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** null when the app runs without a backend (data stays in this browser only). */
export const supabase =
  url && key ? createClient(url, key, { auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true } }) : null;
export const cloudEnabled = supabase !== null;

/**
 * How this page was opened from an e-mail link, read before the client cleans up the URL.
 * - "recovery": the password-reset link (?tipo=recuperar), or the cross-device link (?token_hash=…&type=recovery).
 * - linkError: Supabase sends #error_code=otp_expired (or ?error_code=…) when a link expired or was already used.
 */
const query = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const hashQuery =
  typeof location !== "undefined" ? new URLSearchParams(location.hash.replace(/^#\/?/, "")) : new URLSearchParams();
export const authLink = {
  recovery: query.get("tipo") === "recuperar" || query.get("type") === "recovery",
  tokenHash: query.get("type") === "recovery" ? query.get("token_hash") : null,
  error: query.get("error_code") || hashQuery.get("error_code") || "",
};
/** Removes the link's leftovers (?tipo=…, #error=…) from the address bar. */
export function clearAuthLink() {
  history.replaceState(null, "", location.pathname + (authLink.error ? "" : location.hash));
}
