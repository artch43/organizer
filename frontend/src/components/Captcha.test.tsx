// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Captcha, SCRIPT_URL } from "./Captcha";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete window.turnstile;
  document.head.querySelectorAll("script").forEach((s) => s.remove());
  vi.unstubAllGlobals();
});

/** A stand-in for Cloudflare's widget that records what the component asks of it. */
function fakeTurnstile() {
  let opts: Record<string, unknown> = {};
  const api = {
    render: vi.fn((_el: HTMLElement, o: Record<string, unknown>) => {
      opts = o;
      return "w1";
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = api;
  return {
    api,
    pass: (t: string) => (opts.callback as (t: string) => void)(t),
    expire: () => (opts["expired-callback"] as () => void)(),
  };
}

const flush = () => act(async () => {});

describe("Captcha", () => {
  it("sem chave do site não mostra nada nem carrega script", async () => {
    const onToken = vi.fn();
    act(() => root.render(<Captcha onToken={onToken} siteKey="" />));
    await flush();
    expect(host.innerHTML).toBe("");
    expect(document.head.querySelector("script")).toBeNull();
  });

  it("entrega o token quando a verificação passa e null quando expira", async () => {
    const t = fakeTurnstile();
    const onToken = vi.fn();
    act(() => root.render(<Captcha onToken={onToken} siteKey="site-key" />));
    await flush();
    expect(t.api.render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ sitekey: "site-key" }));
    t.pass("tok-1");
    expect(onToken).toHaveBeenLastCalledWith("tok-1");
    t.expire();
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("pede um token novo a cada tentativa (cada token vale uma vez)", async () => {
    const t = fakeTurnstile();
    const onToken = vi.fn();
    act(() => root.render(<Captcha onToken={onToken} siteKey="site-key" resetKey={0} />));
    await flush();
    act(() => root.render(<Captcha onToken={onToken} siteKey="site-key" resetKey={1} />));
    expect(t.api.reset).toHaveBeenCalledWith("w1");
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("remove o widget ao sair da tela", async () => {
    const t = fakeTurnstile();
    act(() => root.render(<Captcha onToken={() => {}} siteKey="site-key" />));
    await flush();
    act(() => root.render(<></>));
    expect(t.api.remove).toHaveBeenCalledWith("w1");
  });

  it("carrega o script da Cloudflare só quando precisa", async () => {
    act(() => root.render(<Captcha onToken={() => {}} siteKey="site-key" />));
    await flush();
    expect(document.head.querySelector(`script[src="${SCRIPT_URL}"]`)).not.toBeNull();
  });
});
