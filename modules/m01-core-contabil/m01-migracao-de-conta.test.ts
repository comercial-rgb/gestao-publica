import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  REPONTAMENTOS_DO_ENT05,
  repontarConta,
  saldoDaConta,
} from "./migracao-de-conta.js";
import { lancarNoRazao } from "./razao.js";

/**
 * ═══ ITEM 3 DO ENT05 — O REPONTAMENTO, NO REGIME DA CORREÇÃO DE EIXO ═══
 *
 * ⚠️ CARACTERIZAR PRIMEIRO, CORRIGIR DEPOIS. Os dois primeiros blocos deste arquivo
 * escrevem o COMPORTAMENTO ATUAL — o saldo como ele está, na conta como ela está — antes
 * de qualquer migração. Sem isso, "a migração funcionou" seria uma afirmação sobre um
 * estado que ninguém mediu.
 *
 * ⚠️ E A PROPRIEDADE QUE IMPORTA É A CONSERVAÇÃO: Σ(origem) + Σ(destino) tem de ser o
 * MESMO número antes e depois. Uma migração que "funciona" e muda o total é uma migração
 * que inventou ou perdeu dinheiro.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const SEM_PERMISSAO = "estagiario@cg.pb.gov.br";

const ORIGEM = "1.1.5.1.1.00.00"; // "Almoxarifado" no sistema; MERCADORIAS no PCASP
const DESTINO = "1.1.5.6.1.01.00"; // MATERIAL DE CONSUMO — o almoxarifado de verdade
const CREDORA_ORIGEM = "2.2.1.1.1.00.00";
const CREDORA_DESTINO = "2.2.2.1.1.02.98";
const SINTETICA = "1.1.2.2.0.00.00";
const CONTRAPARTIDA = "2.1.3.1.1.00.00";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-origem", codigo: ORIGEM, nome: "Almoxarifado", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-destino", codigo: DESTINO, nome: "MATERIAL DE CONSUMO", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" },
      { id: "c-cred-o", codigo: CREDORA_ORIGEM, nome: "Dívida Fundada Interna", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-cred-d", codigo: CREDORA_DESTINO, nome: "OUTROS CONTRATOS - EMPRÉSTIMOS INTERNOS", naturezaSaldo: "CREDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" },
      { id: "c-sint", codigo: SINTETICA, nome: "CLIENTES", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false },
      { id: "c-contra", codigo: CONTRAPARTIDA, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
    ],
  });

  const perfilVazio = await prisma.perfil.create({
    data: { nome: "SEM_PODERES", descricao: "Perfil sem permissão alguma", criadoPor: POR },
    select: { id: true },
  });
  const estagiario = await prisma.usuario.create({
    data: { identificador: SEM_PERMISSAO, nome: SEM_PERMISSAO, criadoPor: POR },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: estagiario.id, perfilId: perfilVazio.id, criadoPor: POR },
  });
}

/** Põe saldo na conta de origem por um lançamento comum — como a produção faria. */
async function lancar(
  contaDebito: string,
  contaCredito: string,
  valor: string,
  dia: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lancarNoRazao(tx, {
      numeroControle: `LC-${dia}-${valor}`,
      dataTransacao: new Date(`${dia}T12:00:00.000Z`),
      historico: "movimento anterior à migração",
      origemTipo: "TESTE",
      criadoPor: POR,
      partidas: [
        { contaId: contaDebito, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor },
        { contaId: contaCredito, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor },
      ],
    });
  });
}

beforeEach(semear);

describe("t0 · CARACTERIZAÇÃO — o comportamento atual, antes de mudar nada", () => {
  it("o saldo da conta de origem é Σ das partidas com o sinal da natureza", async () => {
    await lancar("c-origem", "c-contra", "5000.00", "2026-02-10");
    await lancar("c-contra", "c-origem", "1200.00", "2026-03-05");

    const saldo = await saldoDaConta(prisma, "c-origem", "DEVEDORA");
    expect(saldo.toFixed(2)).toBe("3800.00");
  });

  it("o corte por data responde o passado — e é ele que a migração usa", async () => {
    await lancar("c-origem", "c-contra", "5000.00", "2026-02-10");
    await lancar("c-origem", "c-contra", "2000.00", "2026-06-10");

    const em31de03 = await saldoDaConta(
      prisma, "c-origem", "DEVEDORA", new Date("2026-03-31T23:59:59.000Z")
    );
    expect(em31de03.toFixed(2)).toBe("5000.00");
  });

  it("o destino começa zerado — é isso que a migração vai preencher", async () => {
    await lancar("c-origem", "c-contra", "5000.00", "2026-02-10");
    expect((await saldoDaConta(prisma, "c-destino", "DEVEDORA")).toFixed(2)).toBe("0.00");
  });
});

describe("t1 · ⚠️ A MIGRAÇÃO CONSERVA O TOTAL — a propriedade que importa", () => {
  it("o saldo sai da origem e entra no destino, e a soma não muda", async () => {
    await lancar("c-origem", "c-contra", "5000.00", "2026-02-10");
    await lancar("c-contra", "c-origem", "1200.00", "2026-03-05");

    const antes = (await saldoDaConta(prisma, "c-origem", "DEVEDORA")).plus(
      await saldoDaConta(prisma, "c-destino", "DEVEDORA")
    );

    const r = await repontarConta(prisma, {
      codigoOrigem: ORIGEM, codigoDestino: DESTINO,
      data: new Date("2026-06-30T12:00:00.000Z"),
      motivo: "correção de eixo: a origem é MERCADORIAS PARA REVENDA, não almoxarifado",
      criadoPor: POR,
    });
    expect(r.saldoMigrado.toFixed(2)).toBe("3800.00");

    const origemDepois = await saldoDaConta(prisma, "c-origem", "DEVEDORA");
    const destinoDepois = await saldoDaConta(prisma, "c-destino", "DEVEDORA");
    expect(origemDepois.toFixed(2)).toBe("0.00");
    expect(destinoDepois.toFixed(2)).toBe("3800.00");
    expect(
      origemDepois.plus(destinoDepois).toFixed(2),
      "a migração mudou o TOTAL — ela inventou ou perdeu dinheiro, e isso é pior que " +
        "não ter migrado"
    ).toBe(antes.toFixed(2));
  });

  it("⚠️ O LANÇAMENTO EXISTE E EXPLICA — não é um UPDATE silencioso", async () => {
    await lancar("c-origem", "c-contra", "5000.00", "2026-02-10");
    const r = await repontarConta(prisma, {
      codigoOrigem: ORIGEM, codigoDestino: DESTINO,
      data: new Date("2026-06-30T12:00:00.000Z"),
      motivo: "correção de eixo do plano de contas, medida contra o PCASP oficial",
      criadoPor: POR,
    });

    expect(r.lancamentoId).not.toBeNull();
    const lanc = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: r.lancamentoId as string },
      select: { historico: true, origemTipo: true, partidas: { select: { tipo: true, valor: true } } },
    });
    expect(lanc.origemTipo).toBe("MIGRACAO_DE_CONTA");
    expect(lanc.historico).toContain("Repontamento de conta");
    expect(lanc.historico).toContain(ORIGEM);
    expect(lanc.historico).toContain(DESTINO);
    expect(lanc.partidas).toHaveLength(2);

    // O REGISTRO, que é o que distingue a correção de eixo de um fato do exercício.
    const mig = await prisma.migracaoDeConta.findUniqueOrThrow({
      where: { id: r.migracaoId },
      select: { saldoMigrado: true, motivo: true, data: true },
    });
    expect(mig.saldoMigrado.toFixed(2)).toBe("5000.00");
    expect(mig.motivo).toContain("correção de eixo");
  });

  it("conta CREDORA migra pelo lado certo — o saldo credor sai por débito", async () => {
    await lancar("c-contra", "c-cred-o", "8000.00", "2026-02-10");
    expect((await saldoDaConta(prisma, "c-cred-o", "CREDORA")).toFixed(2)).toBe("8000.00");

    await repontarConta(prisma, {
      codigoOrigem: CREDORA_ORIGEM, codigoDestino: CREDORA_DESTINO,
      data: new Date("2026-06-30T12:00:00.000Z"),
      motivo: "correção de eixo: a origem é PESSOAL A PAGAR, não dívida fundada",
      criadoPor: POR,
    });

    expect((await saldoDaConta(prisma, "c-cred-o", "CREDORA")).toFixed(2)).toBe("0.00");
    expect((await saldoDaConta(prisma, "c-cred-d", "CREDORA")).toFixed(2)).toBe("8000.00");
  });

  it("saldo ZERO não gera lançamento, mas gera o REGISTRO", async () => {
    const r = await repontarConta(prisma, {
      codigoOrigem: ORIGEM, codigoDestino: DESTINO,
      data: new Date("2026-06-30T12:00:00.000Z"),
      motivo: "correção de eixo numa instalação que ainda não lançou nada",
      criadoPor: POR,
    });
    expect(r.saldoMigrado.toFixed(2)).toBe("0.00");
    expect(
      r.lancamentoId,
      "um lançamento de valor zero polui o razão sem dizer nada"
    ).toBeNull();
    expect(await prisma.migracaoDeConta.count()).toBe(1);
  });
});

describe("t2 · ⚠️ AS NEGAÇÕES — o que a migração RECUSA", () => {
  it("repontar duas vezes RECUSA — moveria um saldo já movido", async () => {
    await lancar("c-origem", "c-contra", "5000.00", "2026-02-10");
    const base = {
      codigoOrigem: ORIGEM, codigoDestino: DESTINO,
      data: new Date("2026-06-30T12:00:00.000Z"),
      motivo: "correção de eixo do plano de contas", criadoPor: POR,
    };
    await repontarConta(prisma, base);
    await expect(repontarConta(prisma, base)).rejects.toThrow(/JÁ FOI FEITA/);

    // E o destino NÃO ficou com o dobro.
    expect((await saldoDaConta(prisma, "c-destino", "DEVEDORA")).toFixed(2)).toBe("5000.00");
  });

  it("destino SINTÉTICO recusa — sintética não recebe partida", async () => {
    await expect(
      repontarConta(prisma, {
        codigoOrigem: ORIGEM, codigoDestino: SINTETICA,
        data: new Date("2026-06-30T12:00:00.000Z"),
        motivo: "migração para conta sintética", criadoPor: POR,
      })
    ).rejects.toThrow(/é SINTÉTICA/);
  });

  it("naturezas opostas recusam — inverteriam o saldo em vez de movê-lo", async () => {
    await expect(
      repontarConta(prisma, {
        codigoOrigem: ORIGEM, codigoDestino: CREDORA_DESTINO,
        data: new Date("2026-06-30T12:00:00.000Z"),
        motivo: "migração entre naturezas opostas", criadoPor: POR,
      })
    ).rejects.toThrow(/INVERTERIA o saldo/);
  });

  it("⚠️ saldo INVERTIDO recusa — não se esconde defeito dentro de correção", async () => {
    // A conta é DEVEDORA e ficou com saldo credor: isso é um defeito ANTERIOR, e migrá-lo
    // o levaria para a conta nova disfarçado de correção de eixo.
    await lancar("c-contra", "c-origem", "900.00", "2026-02-10");
    await expect(
      repontarConta(prisma, {
        codigoOrigem: ORIGEM, codigoDestino: DESTINO,
        data: new Date("2026-06-30T12:00:00.000Z"),
        motivo: "correção de eixo sobre saldo invertido", criadoPor: POR,
      })
    ).rejects.toThrow(/conserte a causa primeiro/);
  });

  it("conta de destino inexistente recusa, nomeando o seed", async () => {
    await expect(
      repontarConta(prisma, {
        codigoOrigem: ORIGEM, codigoDestino: "9.9.9.9.9.99.99",
        data: new Date("2026-06-30T12:00:00.000Z"),
        motivo: "migração para conta que não existe", criadoPor: POR,
      })
    ).rejects.toThrow(/seed:pcasp-oficial/);
  });

  it("usuário sem a ação é recusado, e nada é gravado", async () => {
    await lancar("c-origem", "c-contra", "5000.00", "2026-02-10");
    const antes = await prisma.lancamentoContabil.count();
    await expect(
      repontarConta(prisma, {
        codigoOrigem: ORIGEM, codigoDestino: DESTINO,
        data: new Date("2026-06-30T12:00:00.000Z"),
        motivo: "migração sem permissão", criadoPor: SEM_PERMISSAO,
      })
    ).rejects.toThrow();
    expect(await prisma.lancamentoContabil.count()).toBe(antes);
    expect(await prisma.migracaoDeConta.count()).toBe(0);
  });
});

describe("t3 · a tabela de repontamentos é a decisão, e ela é conferida", () => {
  it("as quatro linhas estão declaradas, com origem, destino e o porquê", () => {
    expect(REPONTAMENTOS_DO_ENT05).toHaveLength(4);
    for (const r of REPONTAMENTOS_DO_ENT05) {
      expect(r.origem, "origem vazia").not.toBe("");
      expect(r.destino, "destino vazio").not.toBe("");
      expect(
        r.porque.length,
        `o repontamento ${r.origem} -> ${r.destino} não explica POR QUÊ — e é o porquê ` +
          `que distingue correção de eixo de troca de conta por capricho`
      ).toBeGreaterThan(40);
      expect(r.origem).not.toBe(r.destino);
    }
  });

  it("nenhuma conta é origem de dois repontamentos", () => {
    const origens = REPONTAMENTOS_DO_ENT05.map((r) => r.origem);
    expect(new Set(origens).size).toBe(origens.length);
  });
});
