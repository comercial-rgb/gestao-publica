import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { DIA_DE_BORDA } from "../../test/instantes.js";
import { extraorcamentarioPorFonte } from "./consultas.js";
import {
  registrarDispendioExtra,
  registrarIngressoExtra,
  estornarMovimentoExtra,
} from "./extraorcamentario.js";
import { roteiroDispendioExtra, roteiroIngressoExtra } from "./dominio.js";

/**
 * ═══ M07 — A FONTE MORA NO MOVIMENTO, NÃO NA CONTA ═══
 *
 * Fecha a pendência `M07-FONTE-NO-MOVIMENTO`.
 *
 * ⚠️ O DEFEITO ERA MAIS FUNDO DO QUE A PENDÊNCIA DIZIA. Ela dizia "o movimento
 * extraorçamentário não tem fonte, então o saldo por fonte tem um balde `(sem fonte
 * declarada)`" — o que descreve um buraco honesto, visível na tela. Medindo, o que havia
 * era pior: `extraorcamentarioPorFonte` atribuía **todos** os movimentos à fonte PADRÃO da
 * conta bancária (`contaBancaria.fonteId`).
 *
 * Numa conta de fonte única isso acerta por coincidência. Mas desde o ADR de 2026-09-10
 * uma conta admite um **rol** de fontes (`FonteDaContaBancaria`, TR 5.10.2.6) — a
 * cardinalidade um era o erro que a 5.10.2.6 trouxe à mesa. Numa conta multifonte, a fonte
 * padrão é um palpite; e o palpite estava justamente no número que existe para provar que
 * recurso vinculado não custeou outra coisa.
 *
 * ⚠️ O DISPÊNDIO JÁ CONFERIA A FONTE contra o rol da conta — e não a gravava. Conferir e
 * esquecer é o pior dos dois mundos: o guard roda, o operador declara a fonte certa, o dado
 * se perde, e a consulta responde pela conta de novo.
 */

const prisma = criarPrismaDeTeste();
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "TESTE";
const F_LIVRE = "fnt-500";
const F_FUNDEB = "fnt-540";

/** A conta MULTIFONTE — é ela que faz a pergunta ter duas respostas possíveis. */
const CONTA = "CC-MULTI";

const CAIXA = "1.1.1.1.2.00.00";
const PASSIVO = "2.1.8.8.1.01.00";
const R_IN = roteiroIngressoExtra({ disponibilidade: CAIXA, consignacaoAPagar: PASSIVO });
const R_OUT = roteiroDispendioExtra({ consignacaoAPagar: PASSIVO, disponibilidade: CAIXA });

let tipoId: string;

beforeEach(async () => {
  await exigirBanco(prisma);
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
      { id: "c-passivo", codigo: PASSIVO, nome: "Consignações a pagar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
    ],
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: F_LIVRE, codigo: "500", descricao: "Recursos ordinários", codigoTce: "500" },
      { id: F_FUNDEB, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });

  // ⚠️ A CONTA TEM FONTE PADRÃO 500 **E** UM ROL COM AS DUAS. É exatamente a conta que o
  // ente real tem: uma conta de cauções que recebe caução de obra custeada por fonte livre
  // e de obra custeada por FUNDEB. A fonte padrão não descreve nenhum dos dois movimentos.
  await prisma.contaBancaria.create({
    data: { id: "cb-multi", codigo: CONTA, descricao: "Cauções", fonteId: F_LIVRE },
  });
  await prisma.fonteDaContaBancaria.createMany({
    data: [
      { contaBancariaId: "cb-multi", fonteId: F_LIVRE, criadoPor: POR },
      { contaBancariaId: "cb-multi", fonteId: F_FUNDEB, criadoPor: POR },
    ],
  });

  const tipo = await prisma.tipoConsignacao.create({
    data: { codigo: "CAUCAO", descricao: "Caução", criadoPor: POR },
  });
  tipoId = tipo.id;
});

function ingresso(fonteId: string, valor: string, credor: string) {
  return {
    tipoConsignacaoId: tipoId,
    credorConsignatario: credor,
    contaBancaria: CONTA,
    fonteId,
    valor,
    data: DIA_DE_BORDA(2026, 5, 20),
    historico: `caução de ${credor}`,
    criadoPor: POR,
  };
}

describe("M07 — a fonte do movimento extraorçamentário", () => {
  it("t1: duas cauções na MESMA conta, fontes DIFERENTES — e cada uma soma na sua", async () => {
    await registrarIngressoExtra(prisma, ingresso(F_LIVRE, "3000.00", "Alfa"), R_IN);
    await registrarIngressoExtra(prisma, ingresso(F_FUNDEB, "7000.00", "Beta"), R_IN);

    const porFonte = await extraorcamentarioPorFonte(prisma, {
      ate: DIA_DE_BORDA(2026, 12, 31),
    });

    // ⚠️ ESTE É O TESTE INTEIRO. Antes do ENT03c as DUAS linhas somavam em `fnt-500` — a
    // fonte padrão da conta — e o FUNDEB aparecia com saldo ZERO enquanto tinha 7.000,00
    // de terceiro no caixa. A aritmética é literal de propósito.
    expect(porFonte.get(F_LIVRE)?.caixaIngressoAvulso.toFixed(2)).toBe("3000.00");
    expect(porFonte.get(F_FUNDEB)?.caixaIngressoAvulso.toFixed(2)).toBe("7000.00");
    expect(porFonte.get(F_LIVRE)?.saldoARepassar.toFixed(2)).toBe("3000.00");
    expect(porFonte.get(F_FUNDEB)?.saldoARepassar.toFixed(2)).toBe("7000.00");
  });

  it("t2: fonte FORA do rol da conta é recusada no ingresso — e nada é gravado", async () => {
    const foraDoRol = await prisma.fonteRecurso.create({
      data: { codigo: "760", descricao: "Convênio federal", codigoTce: "760" },
    });

    await expect(
      registrarIngressoExtra(prisma, ingresso(foraDoRol.id, "1000.00", "Gama"), R_IN)
    ).rejects.toThrow(/rol|fonte/i);

    // ⚠️ ZERO ESCRITA — nem movimento, nem lançamento. O guard do dispêndio já existia; o
    // do ingresso não, e receber dinheiro vinculado numa conta que não comporta aquela
    // fonte é a mesma mistura que a saída já barrava.
    expect(await prisma.movimentoExtraorcamentario.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });

  it("t3: o ESTORNO herda a fonte do original — o saldo daquela fonte volta a zero", async () => {
    const { movimentoId } = await registrarIngressoExtra(
      prisma,
      ingresso(F_FUNDEB, "7000.00", "Beta"),
      R_IN
    );

    await estornarMovimentoExtra(prisma, {
      movimentoId,
      data: DIA_DE_BORDA(2026, 6, 10),
      motivo: "caução lançada na conta errada pelo operador",
      criadoPor: POR,
    });

    const estorno = await prisma.movimentoExtraorcamentario.findFirstOrThrow({
      where: { estornoDeId: movimentoId },
      select: { fonteId: true },
    });
    expect(estorno.fonteId).toBe(F_FUNDEB);

    const porFonte = await extraorcamentarioPorFonte(prisma, {
      ate: DIA_DE_BORDA(2026, 12, 31),
    });
    expect(porFonte.get(F_FUNDEB)?.caixaIngressoAvulso.toFixed(2)).toBe("0.00");
    expect(porFonte.get(F_FUNDEB)?.saldoARepassar.toFixed(2)).toBe("0.00");
  });

  it("t4: o DISPÊNDIO devolve na fonte que recebeu — e o saldo da OUTRA não se mexe", async () => {
    await registrarIngressoExtra(prisma, ingresso(F_LIVRE, "3000.00", "Alfa"), R_IN);
    await registrarIngressoExtra(prisma, ingresso(F_FUNDEB, "7000.00", "Beta"), R_IN);

    await registrarDispendioExtra(
      prisma,
      {
        tipoConsignacaoId: tipoId,
        credorConsignatario: "Beta",
        contaBancaria: CONTA,
        fonteId: F_FUNDEB,
        valor: "7000.00",
        data: DIA_DE_BORDA(2026, 7, 15),
        historico: "devolução da caução de Beta",
        criadoPor: POR,
      },
      R_OUT
    );

    const porFonte = await extraorcamentarioPorFonte(prisma, {
      ate: DIA_DE_BORDA(2026, 12, 31),
    });
    expect(porFonte.get(F_FUNDEB)?.caixaDispendio.toFixed(2)).toBe("7000.00");
    expect(porFonte.get(F_FUNDEB)?.saldoARepassar.toFixed(2)).toBe("0.00");
    // A fonte livre continua intacta: devolver FUNDEB não pode consumir recurso livre.
    expect(porFonte.get(F_LIVRE)?.saldoARepassar.toFixed(2)).toBe("3000.00");
    expect(porFonte.get(F_LIVRE)?.caixaDispendio.toFixed(2)).toBe("0.00");
  });
});
