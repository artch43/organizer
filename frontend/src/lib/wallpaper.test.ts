import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyWallpaper, saveWallpaperImage, wallpaperShown } from "./appearance";

const storage = vi.hoisted(() => ({
  files: new Map<string, Blob>(),
  fail: false,
  user: null as string | null,
  upload: vi.fn(async () => ({ error: null })),
  download: vi.fn(async (): Promise<{ data: Blob | null }> => ({ data: null })),
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: storage.user ? { user: { id: storage.user } } : null } }) },
    storage: { from: () => ({ upload: storage.upload, download: storage.download }) },
  },
}));

vi.mock("./rename", () => ({
  openFilesDb: async () => ({
    transaction: () => ({
      objectStore: () => ({
        put: (blob: Blob, key: string) => {
          if (storage.fail) throw new Error("QuotaExceededError");
          storage.files.set(key, blob);
          const request = { result: key, onsuccess: null as (() => void) | null };
          queueMicrotask(() => request.onsuccess?.());
          return request;
        },
        get: (key: string) => {
          const request = { result: storage.files.get(key), onsuccess: null as (() => void) | null };
          queueMicrotask(() => request.onsuccess?.());
          return request;
        },
      }),
    }),
  }),
}));

beforeEach(() => {
  storage.files.clear();
  storage.fail = false;
  storage.user = null;
  storage.upload.mockClear();
  storage.download.mockReset();
  storage.download.mockResolvedValue({ data: null });
  // A large source photo must never be replaced by this reduced canvas export.
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 6000, height: 4000, close: vi.fn() })));
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (done: (blob: Blob) => void) => done(new Blob(["compressed"], { type: "image/webp" })),
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

function page() {
  const properties = new Map<string, string>();
  const classes = new Set<string>();
  vi.stubGlobal("document", { documentElement: {
    classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
    style: {
      setProperty: (key: string, value: string) => properties.set(key, value),
      removeProperty: (key: string) => properties.delete(key),
    },
  } });
  return { properties, classes };
}

describe("imagem de fundo personalizada", () => {
  it("preserva os bytes, o formato e a resolução da imagem original", async () => {
    const file = new File([new Uint8Array([0, 255, 17, 84])], "foto.png", { type: "image/png" });
    const id = await saveWallpaperImage(file);
    const saved = storage.files.get(`img:${id}`)!;
    expect(saved).toBe(file);
    expect(await saved.arrayBuffer()).toEqual(await file.arrayBuffer());
  });

  it("envia o mesmo original para os outros dispositivos", async () => {
    storage.user = "user";
    const file = new File(["source"], "foto.jpg", { type: "image/jpeg" });
    const id = await saveWallpaperImage(file);
    expect(storage.upload).toHaveBeenCalledWith(`user/wallpaper-${id}`, file, {
      contentType: "image/jpeg", upsert: false,
    });
  });

  it("avisa se não conseguiu salvar uma imagem sem conta", async () => {
    storage.fail = true;
    await expect(saveWallpaperImage(new File(["source"], "foto.png", { type: "image/png" })))
      .rejects.toThrow(/salvar/i);
  });

  it("mantém a cópia na conta mesmo se o cache local estiver cheio", async () => {
    storage.user = "user";
    storage.fail = true;
    await expect(saveWallpaperImage(new File(["source"], "foto.png", { type: "image/png" })))
      .resolves.toEqual(expect.any(String));
  });

  it("rejeita arquivos que não são imagens", async () => {
    await expect(saveWallpaperImage(new File(["text"], "arquivo.txt", { type: "text/plain" })))
      .rejects.toThrow(/imagem/);
  });

  it("explica o limite de 10 MB da conta sem recomprimir o original", async () => {
    storage.user = "user";
    const file = new File([], "foto.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });
    await expect(saveWallpaperImage(file)).rejects.toThrow(/10 MB/);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("permite mostrar a imagem inteira em intensidade e libera a URL ao remover", async () => {
    const id = await saveWallpaperImage(new File(["source"], "foto.png", { type: "image/png" }));
    const { properties, classes } = page();
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    await applyWallpaper({ kind: "image", image: id, strength: 1 }, false);
    const css = properties.get("--wallpaper")!;
    expect(css).toContain("center / cover no-repeat");
    expect(properties.get("--wallpaper-veil")).toBe("0");
    expect(classes.has("has-wallpaper")).toBe(true);
    await applyWallpaper(undefined, false);
    expect(classes.has("has-wallpaper")).toBe(false);
    expect(revoke).toHaveBeenCalled();
    revoke.mockRestore();
  });

  it("usa a imagem correspondente ao alternar os temas", async () => {
    const light = new File(["light"], "claro.png", { type: "image/png" });
    const dark = new File(["dark"], "escuro.png", { type: "image/png" });
    const lightId = await saveWallpaperImage(light);
    const darkId = await saveWallpaperImage(dark);
    page();
    const create = vi.spyOn(URL, "createObjectURL");
    try {
      const wallpaper = { kind: "image" as const, image: lightId, dark: { kind: "image" as const, image: darkId } };
      await applyWallpaper(wallpaper, false);
      expect(create).toHaveBeenLastCalledWith(light);
      await applyWallpaper(wallpaper, true);
      expect(create).toHaveBeenLastCalledWith(dark);
      await applyWallpaper(undefined, false);
    } finally {
      create.mockRestore();
    }
  });

  it("baixa o original da conta e o mantém em cache no outro aparelho", async () => {
    storage.user = "user";
    const original = new Blob([new Uint8Array([255, 99, 32])], { type: "image/png" });
    storage.download.mockResolvedValue({ data: original });
    page();
    await applyWallpaper({ kind: "image", image: "remote-photo" }, false);
    expect(storage.download).toHaveBeenCalledWith("user/wallpaper-remote-photo");
    expect(storage.files.get("img:remote-photo")).toBe(original);
    expect(wallpaperShown.get()).toBe(true);
    await applyWallpaper(undefined, false);
  });

  it("deixa o fundo escolhido disponível quando a imagem não pode ser baixada", async () => {
    storage.user = "user";
    const { classes, properties } = page();
    await applyWallpaper({ kind: "image", image: "unavailable" }, true);
    expect(wallpaperShown.get()).toBe(false);
    expect(classes.has("has-wallpaper")).toBe(false);
    expect(properties.has("--wallpaper")).toBe(false);
  });
});
