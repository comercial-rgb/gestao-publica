import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

/**
 * A ATUALIZAÇÃO NO SERVIDOR (V22) — ensaiada em simulação: o script imprime cada comando em vez de
 * executá-lo. O que se prova é a ORDEM, que é onde mora a garantia de "trocar sem derrubar":
 *
 *   · a compilação e as migrations acontecem ANTES de a versão nova receber tráfego;
 *   · a versão nova sobe na OUTRA porta, e o nginx só troca depois de ela responder o commit certo;
 *   · a versão antiga só para DEPOIS da troca;
 *   · se a nova não responde, NADA é trocado (o nginx não é tocado, a antiga segue no ar) e o
 *     script sai com o código 20.
 *
 * Instrumento com a prova de que acusa: t3 é a negação (a saúde falha) e afirma o motivo.
 */

const executar = promisify(execFile);
const SCRIPT = fileURLToPath(new URL("../scripts/atualizar-no-servidor.sh", import.meta.url)).replace(/\\/g, "/");
const COMMIT = "59ee6bbabcdef0123456789abcdef0123456789a";

async function simular(env: Record<string, string> = {}, args: readonly string[] = ["--commit", COMMIT]): Promise<{ codigo: number; saida: string }> {
  try {
    const r = await executar("bash", [SCRIPT, "--simular", ...args], { env: { ...process.env, ...env } });
    return { codigo: 0, saida: r.stdout };
  } catch (e) {
    const f = e as { code?: number; stdout?: string };
    return { codigo: f.code ?? -1, saida: f.stdout ?? "" };
  }
}

/** A posição (linha) da primeira linha que casa. */
function linha(saida: string, padrao: RegExp): number {
  const i = saida.split("\n").findIndex((l) => padrao.test(l));
  if (i < 0) throw new Error(`não achei ${padrao} na saída:\n${saida}`);
  return i;
}

describe("a atualização no servidor, em simulação", () => {
  it("t1: migrations e compilação ANTES da troca; a nova sobe na outra porta; a antiga para DEPOIS", async () => {
    const { codigo, saida } = await simular({ SIMULAR_PORTA_ATIVA: "3000" });
    expect(codigo).toBe(0);
    const migra = linha(saida, /prisma migrate deploy/);
    const compila = linha(saida, /next build/);
    const sobe = linha(saida, /systemctl restart gestao-publica@3001/);
    const confere = linha(saida, /curl http:\/\/127\.0\.0\.1:3001\/release \(esperando commit 59ee6bb\)/);
    const troca = linha(saida, /upstream gestao_publica .*3001/);
    const recarrega = linha(saida, /systemctl reload nginx/);
    const paraAntiga = linha(saida, /systemctl stop gestao-publica@3000/);
    expect(migra).toBeLessThan(compila);
    expect(compila).toBeLessThan(sobe);
    expect(sobe).toBeLessThan(confere);
    expect(confere).toBeLessThan(troca);
    expect(troca).toBeLessThan(recarrega);
    expect(recarrega).toBeLessThan(paraAntiga);
    expect(saida).toContain("ATUALIZADO: commit 59ee6bb no ar (porta 3001)");
  });

  it("t2: a porta alterna — se a no ar é a 3001, a nova vai para a 3000", async () => {
    const { saida } = await simular({ SIMULAR_PORTA_ATIVA: "3001" });
    expect(saida).toMatch(/systemctl restart gestao-publica@3000/);
    expect(saida).toMatch(/systemctl stop gestao-publica@3001/);
  });

  it("t3: a nova não responde — NADA é trocado, a antiga segue no ar, e o motivo é dito (código 20)", async () => {
    const { codigo, saida } = await simular({ SIMULAR_PORTA_ATIVA: "3000", SIMULAR_SAUDE: "falha" });
    expect(codigo).toBe(20);
    expect(saida).toContain("NADA FOI TROCADO: o site continua na porta 3000");
    expect(saida).not.toMatch(/reload nginx/);
    expect(saida).not.toMatch(/upstream gestao_publica/);
    expect(saida).not.toMatch(/systemctl stop gestao-publica@3000/);
    expect(saida).toMatch(/systemctl stop gestao-publica@3001/);
  });

  it("t4: o código vem do commit pedido, por git archive — e commit que não é sha é recusado", async () => {
    const { saida } = await simular();
    expect(saida).toMatch(/git -C '\/opt\/gestao-publica\/repositorio' archive '59ee6bbabcdef0123456789abcdef0123456789a'/);
    const ruim = await simular({}, ["--commit", "main; rm -rf /"]);
    expect(ruim.codigo).toBe(2);
    expect(ruim.saida).toMatch(/commit inválido/);
  });

  it("t5: com --compilado o servidor NÃO compila — confere o commit do pacote e extrai antes de subir", async () => {
    const { codigo, saida } = await simular({ SIMULAR_PORTA_ATIVA: "3000" }, ["--commit", COMMIT, "--compilado", "/tmp/c.tgz"]);
    expect(codigo).toBe(0);
    expect(saida).not.toMatch(/next build/);
    const confere = linha(saida, /conferir \.next\/COMMIT_COMPILADO de \/tmp\/c\.tgz contra 59ee6bbabcdef/);
    const extrai = linha(saida, /tar -xzf \/tmp\/c\.tgz -C \/opt\/gestao-publica\/versoes\/59ee6bb/);
    const migra = linha(saida, /prisma migrate deploy/);
    const sobe = linha(saida, /systemctl restart gestao-publica@3001/);
    expect(migra).toBeLessThan(confere);
    expect(confere).toBeLessThan(extrai);
    expect(extrai).toBeLessThan(sobe);
  });
});
