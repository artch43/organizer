import { describe, expect, it } from "vitest";
import { classifySyncError, problemNotice, retryDelay, sendIsolating } from "./syncErrors";

const pg = (message: string, code = "P0001") => ({ message, code, details: "" });
const tooBig = pg('new row for relation "records" violates check constraint "records_data_size"', "23514");

describe("classifySyncError", () => {
  it("reconhece a cota e o limite de taxa do banco", () => {
    expect(classifySyncError(pg("ORG_QUOTA"))).toBe("quota");
    expect(classifySyncError(pg("ORG_RATE"))).toBe("rate");
  });
  it("reconhece linha grande demais só pela constraint de tamanho", () => {
    expect(classifySyncError(tooBig)).toBe("row_too_large");
    expect(classifySyncError(pg('violates check constraint "records_kind_check"', "23514"))).toBe("other");
  });
  it("trata falha de rede como rede", () => {
    expect(classifySyncError(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifySyncError({ message: "TypeError: Load failed" })).toBe("network");
  });
  it("o resto é 'other'", () => {
    expect(classifySyncError(pg("permission denied for table records", "42501"))).toBe("other");
    expect(classifySyncError(undefined)).toBe("other");
  });
});

describe("retryDelay", () => {
  it("dobra a espera no limite de taxa, até 10 minutos", () => {
    expect(retryDelay("rate", 1)).toBe(30_000);
    expect(retryDelay("rate", 2)).toBe(60_000);
    expect(retryDelay("rate", 10)).toBe(600_000);
  });
  it("cota cheia espera 10 minutos; rede, 10 segundos", () => {
    expect(retryDelay("quota", 1)).toBe(600_000);
    expect(retryDelay("network", 7)).toBe(10_000);
  });
  it("outros erros crescem até 5 minutos", () => {
    expect(retryDelay("other", 1)).toBe(10_000);
    expect(retryDelay("other", 20)).toBe(300_000);
  });
  it("só avisa a pessoa sobre cota e taxa", () => {
    expect(problemNotice("quota")).toMatch(/10 MB/);
    expect(problemNotice("rate")).toBeTruthy();
    expect(problemNotice("network")).toBeNull();
  });
});

describe("sendIsolating", () => {
  /** A fake server: refuses any batch holding a row marked big, and records what it saved. */
  function server() {
    const saved: number[] = [];
    let calls = 0;
    const send = async (rows: { id: number; big?: boolean }[]) => {
      calls++;
      if (rows.some((r) => r.big)) return tooBig;
      saved.push(...rows.map((r) => r.id));
      return null;
    };
    return { saved, send, calls: () => calls };
  }

  it("envia tudo de uma vez quando não há problema", async () => {
    const s = server();
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: i }));
    expect(await sendIsolating(rows, s.send)).toEqual([]);
    expect(s.saved).toHaveLength(500);
    expect(s.calls()).toBe(1);
  });

  it("isola as linhas grandes e salva todas as outras", async () => {
    const s = server();
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: i, big: i === 17 || i === 400 }));
    const refused = await sendIsolating(rows, s.send);
    expect(refused.map((r) => r.id)).toEqual([17, 400]);
    expect(s.saved.sort((a, b) => a - b)).toEqual(rows.filter((r) => !r.big).map((r) => r.id));
    // Halving finds each bad row in about log2(500) ≈ 9 steps, not 500 requests.
    expect(s.calls()).toBeLessThan(40);
  });

  it("repassa qualquer outro erro sem dividir o lote", async () => {
    let calls = 0;
    const send = async () => {
      calls++;
      return pg("ORG_RATE");
    };
    await expect(sendIsolating([{ id: 1 }, { id: 2 }], send)).rejects.toMatchObject({ message: "ORG_RATE" });
    expect(calls).toBe(1);
  });
});
