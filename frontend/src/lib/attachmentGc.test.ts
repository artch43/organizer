import { describe, expect, it } from "vitest";
import { MIN_AGE_MS, orphanFiles, referencedIds } from "./attachmentGc";
import { attachmentMarkdown, uploadErrorMessage } from "./attachments";

const NOW = Date.parse("2026-11-18T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const OLD = ago(MIN_AGE_MS + 1);

describe("referencedIds", () => {
  it("acha imagens e PDFs no texto das notas, mesmo dentro de JSON", () => {
    const note = `Foto ${attachmentMarkdown({ id: "abc123", name: "praia.jpg", kind: "image" })} e ${attachmentMarkdown({ id: "pdf9", name: "boleto.pdf", kind: "pdf" })}`;
    expect([...referencedIds([JSON.stringify({ notes: { n1: { body: note } } })])].sort()).toEqual(["abc123", "pdf9"]);
  });
  it("junta as referências de vários textos (área de trabalho e lixeira)", () => {
    expect(referencedIds(["![a](anexo:x1)", "[📄 b](anexo:x2)"])).toEqual(new Set(["x1", "x2"]));
  });
});

describe("orphanFiles", () => {
  it("apaga só o que não é citado e tem mais de uma semana", () => {
    const files = [
      { name: "usado", created_at: OLD },
      { name: "solto-antigo", created_at: OLD },
      { name: "solto-novo", created_at: ago(60_000) },
    ];
    expect(orphanFiles(files, new Set(["usado"]), NOW)).toEqual(["solto-antigo"]);
  });
  it("nunca apaga papéis de parede nem arquivos sem data", () => {
    const files = [
      { name: "wallpaper-abc", created_at: OLD },
      { name: "sem-data", created_at: null },
    ];
    expect(orphanFiles(files, new Set(), NOW)).toEqual([]);
  });
});

describe("uploadErrorMessage", () => {
  it("explica a cota quando a regra de acesso recusa o envio", () => {
    expect(uploadErrorMessage('new row violates row-level security policy for table "objects"')).toMatch(/limite de anexos/);
  });
  it("mantém as mensagens de tipo e tamanho", () => {
    expect(uploadErrorMessage("mime type image/svg+xml is not supported")).toMatch(/tipo de arquivo/);
    expect(uploadErrorMessage("The object exceeded the maximum allowed size")).toMatch(/tamanho/);
    expect(uploadErrorMessage("Bucket not found")).toMatch(/setup\.sql/);
    expect(uploadErrorMessage("boom")).toMatch(/Tente de novo/);
  });
});
