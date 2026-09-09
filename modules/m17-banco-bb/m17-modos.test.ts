import { describe, expect, it } from "vitest";
import { estadoDoModoBb, mascararAgencia, mascararConta, credencialBbConfigurada } from "./modos.js";

/**
 * F2 (S6) — os modos do cliente BB: o modo que a tela mostra é o que executa; SANDBOX sem credencial
 * responde CREDENTIAL_NOT_CONFIGURED (nunca cai em MOCK). E as máscaras BR de agência/conta.
 */

const ENV_SEM = {} as NodeJS.ProcessEnv;
const ENV_COM = { BB_APP_A_APP_KEY: "k", BB_APP_A_CLIENT_ID: "i", BB_APP_A_CLIENT_SECRET: "s" } as unknown as NodeJS.ProcessEnv;

describe("F2 — modos BB (MOCK/SANDBOX/LIVE)", () => {
  it("MOCK sempre DISPONIVEL (fixtures, sem chamada externa)", () => {
    expect(estadoDoModoBb("MOCK", ENV_SEM).estado).toBe("DISPONIVEL");
  });

  it("SANDBOX sem credencial → CREDENTIAL_NOT_CONFIGURED (nunca MOCK)", () => {
    const e = estadoDoModoBb("SANDBOX", ENV_SEM);
    expect(e.estado).toBe("CREDENTIAL_NOT_CONFIGURED");
    expect(e.mensagem).toMatch(/credencial/i);
  });

  it("SANDBOX com credencial → DISPONIVEL", () => {
    expect(credencialBbConfigurada(ENV_COM)).toBe(true);
    expect(estadoDoModoBb("SANDBOX", ENV_COM).estado).toBe("DISPONIVEL");
  });

  it("LIVE → BLOQUEADO (nenhuma chamada financeira real)", () => {
    expect(estadoDoModoBb("LIVE", ENV_SEM).estado).toBe("BLOQUEADO");
  });
});

describe("F2 — máscaras BR (agência/conta)", () => {
  it("agência mostra 2 primeiros e o último; conta só os 2 últimos", () => {
    expect(mascararAgencia("1234")).toBe("12•4");
    expect(mascararConta("123456")).toBe("••••56");
    expect(mascararConta("12")).toBe("••"); // curto → tudo mascarado
  });
});
