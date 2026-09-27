import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { acrescentarFonteAoRol, removerFonteDoRol } from "./rol-de-fontes.js";
import { exigirFonteNoRolDaConta } from "../m05-despesa/guard-fonte.js";

/**
 * O ROL DE FONTES DA CONTA BANCÁRIA — o cadastro que faltava (TR 5.10.2.6, V16).
 *
 * ⚠️ O QUE ESTE TESTE DEFENDE, E POR QUE CADA RECUSA EXISTE.
 *
 * O vínculo `FonteDaContaBancaria` existe desde a ADR de 2026-09-10 e nunca teve cadastro. O guard
 * do movimento tem um FALLBACK: rol vazio admite a fonte PADRÃO da conta. Esse fallback é o que
 * torna as duas recusas necessárias — sem elas, "restringir a conta" produz o oposto do pedido:
 *
 *   · remover a ÚLTIMA fonte deixaria o rol vazio, e o guard voltaria a admitir a fonte padrão;
 *   · remover a fonte PADRÃO deixaria a coluna `ContaBancaria.fonteId` apontando para um recurso
 *     que a conta declara não comportar — duas verdades sobre a mesma conta.
 *
 * ⚠️ E O EFEITO É CONFERIDO NO GUARD, não no cadastro. Depois de acrescentar, a fonte nova TEM de
 * passar pelo `exigirFonteNoRolDaConta` (o mesmo que o pagamento, a movimentação, o recolhimento e
 * a arrecadação usam); antes, ela era recusada. É a ordem que prova o cadastro — ler a tabela que
 * acabamos de escrever provaria só que o INSERT aconteceu.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.fonteRecurso.createMany({
    data: [
      { id: "f500", codigo: "500", descricao: "Nao vinculados", codigoTce: "500" },
      { id: "f540", codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
      { id: "f600", codigo: "600", descricao: "Convenios", codigoTce: "600" },
    ],
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Conta unica", fonteId: "f500" },
  });
}

/** O guard aceita a fonte nesta conta? Devolve a mensagem quando recusa. */
async function guard(fonteId: string): Promise<string | "aceita"> {
  try {
    await exigirFonteNoRolDaConta(prisma, { codigo: "CC-001" }, fonteId, "o teste");
    return "aceita";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe("M09 V16 — o rol de fontes da conta bancaria (TR 5.10.2.6)", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: a fonte nova passa a ser ACEITA pelo guard — e antes era recusada", async () => {
    expect(await guard("f540")).toMatch(/FONTE FORA DO ROL/);

    const r = await acrescentarFonteAoRol(prisma, {
      contaCodigo: "CC-001",
      fonteCodigo: "540",
      criadoPor: POR,
    });
    // ⚠️ A FONTE PADRÃO ENTRA JUNTO. Sem isso, a primeira fonte acrescentada substituiria a padrão
    // no guard (rol não vazio deixa de cair no fallback) e a conta perderia, em silêncio, a fonte
    // com que sempre operou.
    expect(r.fontes).toEqual(["500", "540"]);

    expect(await guard("f540")).toBe("aceita");
    expect(await guard("f500")).toBe("aceita");
    expect(await guard("f600")).toMatch(/permitidas nesta conta são: 500, 540/);
  });

  it("t2: a MESMA fonte nao entra duas vezes, e a recusa a nomeia", async () => {
    await acrescentarFonteAoRol(prisma, { contaCodigo: "CC-001", fonteCodigo: "540", criadoPor: POR });
    await expect(
      acrescentarFonteAoRol(prisma, { contaCodigo: "CC-001", fonteCodigo: "540", criadoPor: POR })
    ).rejects.toThrow(/já comporta a fonte 540/);
    expect(await prisma.fonteDaContaBancaria.count()).toBe(2);
  });

  it("t3: fonte inexistente e conta inexistente recusam, nomeando o que falta", async () => {
    await expect(
      acrescentarFonteAoRol(prisma, { contaCodigo: "CC-001", fonteCodigo: "999", criadoPor: POR })
    ).rejects.toThrow(/A fonte 999 não está no cadastro/);
    await expect(
      acrescentarFonteAoRol(prisma, { contaCodigo: "CC-404", fonteCodigo: "540", criadoPor: POR })
    ).rejects.toThrow(/Conta bancária CC-404 não cadastrada/);
    expect(await prisma.fonteDaContaBancaria.count()).toBe(0);
  });

  it("t4: a ULTIMA fonte do rol nao sai — esvaziar o rol devolveria o guard a fonte padrao", async () => {
    // Um rol de UMA linha, criado à mão, é o que uma fixture ou um seed produzem.
    await prisma.fonteDaContaBancaria.create({
      data: { contaBancariaId: "cb1", fonteId: "f540", criadoPor: POR },
    });
    await expect(
      removerFonteDoRol(prisma, { contaCodigo: "CC-001", fonteCodigo: "540", criadoPor: POR })
    ).rejects.toThrow(/é a ÚNICA do rol da conta CC-001/);
    expect(await prisma.fonteDaContaBancaria.count()).toBe(1);
  });

  it("t5: a fonte PADRAO da conta nao sai do rol", async () => {
    await acrescentarFonteAoRol(prisma, { contaCodigo: "CC-001", fonteCodigo: "540", criadoPor: POR });
    await expect(
      removerFonteDoRol(prisma, { contaCodigo: "CC-001", fonteCodigo: "500", criadoPor: POR })
    ).rejects.toThrow(/é a fonte PADRÃO da conta CC-001 e não sai do rol/);
    // E a NÃO padrão sai, para a negativa acima não passar por vacuidade.
    const r = await removerFonteDoRol(prisma, {
      contaCodigo: "CC-001",
      fonteCodigo: "540",
      criadoPor: POR,
    });
    expect(r.fontes).toEqual(["500"]);
    expect(await guard("f540")).toMatch(/FONTE FORA DO ROL/);
  });

  it("t6: remover uma fonte fora do rol recusa dizendo QUAIS estao no rol", async () => {
    await acrescentarFonteAoRol(prisma, { contaCodigo: "CC-001", fonteCodigo: "540", criadoPor: POR });
    await expect(
      removerFonteDoRol(prisma, { contaCodigo: "CC-001", fonteCodigo: "600", criadoPor: POR })
    ).rejects.toThrow(/não tem a fonte 600 no rol. As fontes do rol são: 500, 540/);
  });
});
