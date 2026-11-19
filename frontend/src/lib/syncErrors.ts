/**
 * What went wrong when saving to the cloud, and what to do about it. The database refuses writes on
 * its own (see backend/supabase/migrations 010 and 011), so the app must tell these cases apart:
 * retrying a full account every 10 seconds would only hammer the server, and one oversized row must
 * not hold back the 499 others sent with it.
 */
export type SyncProblem = "quota" | "rate" | "row_too_large" | "network" | "other";

type ErrorLike = { message?: string; code?: string; details?: string } | null | undefined;

export function classifySyncError(e: unknown): SyncProblem {
  const err = e as ErrorLike;
  const msg = err?.message ?? "";
  if (msg === "ORG_QUOTA") return "quota";
  if (msg === "ORG_RATE") return "rate";
  if (err?.code === "23514" && /records_data_size/.test(msg)) return "row_too_large";
  // fetch() failing (offline, DNS, CORS) reaches supabase-js as a TypeError, or as an error without a code.
  if (e instanceof TypeError || /failed to fetch|network|load failed|fetch failed/i.test(msg)) return "network";
  return "other";
}

const SEC = 1000;
const MIN = 60 * SEC;

/** How long to wait before trying again, after `attempt` failures in a row (1 = first failure). */
export function retryDelay(problem: SyncProblem, attempt: number): number {
  const n = Math.max(1, attempt);
  switch (problem) {
    case "network":
      return 10 * SEC;
    case "rate":
      // 30 s, 1 min, 2 min, ... up to the length of the server's window (10 min).
      return Math.min(10 * MIN, 30 * SEC * 2 ** (n - 1));
    case "quota":
      // Nothing changes until the person frees space; check now and then in case they did elsewhere.
      return 10 * MIN;
    default:
      return Math.min(5 * MIN, 10 * SEC * 2 ** (n - 1));
  }
}

/** The line shown under the account name while the problem lasts. */
export function problemLabel(problem: SyncProblem): string {
  switch (problem) {
    case "quota":
      return "Espaço na nuvem cheio";
    case "rate":
      return "Muitas alterações seguidas: aguardando";
    case "network":
      return "Sem conexão";
    default:
      return "Tentando salvar";
  }
}

/** A one-time notice for problems the person can act on (or should know won't fix itself right away). */
export function problemNotice(problem: SyncProblem): string | null {
  if (problem === "quota")
    return "Seu espaço na nuvem acabou (10 MB). As alterações continuam neste aparelho; apague itens ou esvazie a lixeira para voltar a salvar.";
  if (problem === "rate") return "Muitas alterações em pouco tempo. O app volta a salvar sozinho em alguns minutos.";
  return null;
}

/**
 * Sends `rows`; if the server refuses the batch because a row is too big, splits it in halves until
 * the oversized rows are found, sends everything else, and returns the refused rows.
 * Any other error is thrown, as is. Refused statements are rolled back whole on the server, so
 * re-sending the halves never writes anything twice.
 */
export async function sendIsolating<T>(rows: T[], send: (rows: T[]) => Promise<unknown>): Promise<T[]> {
  if (!rows.length) return [];
  const error = await send(rows);
  if (!error) return [];
  if (classifySyncError(error) !== "row_too_large") throw error;
  if (rows.length === 1) return rows;
  const mid = Math.ceil(rows.length / 2);
  const left = await sendIsolating(rows.slice(0, mid), send);
  const right = await sendIsolating(rows.slice(mid), send);
  return [...left, ...right];
}
