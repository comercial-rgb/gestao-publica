import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { semearSagresPoc } from "../prisma/seed/sagres-poc.js";
import { travar, destravar } from "../modules/m16-travamento/servico.js";
import { criarM05Deps } from "../modules/m05-despesa/adapter-prisma.js";
import { criarM05DepsComAlmoxarifado } from "../modules/m10-patrimonial/adapter-m05-almox.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../modules/m05-despesa/dominio.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import { criarM01Deps } from "../modules/m01-core-contabil/adapter-prisma.js";
import { registrarLancamento } from "../modules/m01-core-contabil/servico.js";
import { registrarIngressoExtra } from "../modules/m07-extraorcamentario/index.js";
import { confirmarImportacaoFolha } from "../modules/m20-importador/servico.js";

/**
 * PERÍODO FECHADO — o teste 11 do incremento.
 *
 * *"Período fechado bloqueia escrita por API, worker e rota alternativa exposta."*
 *
 * ═══ ⚠️ POR QUE TRÊS ROTAS, E NÃO UMA ═══
 * Um guard de período colocado na tela fecha a porta da frente. O mês fechado tem de
 * valer para **toda escrita que toca o razão**, e as escritas chegam por caminhos que não
 * se parecem entre si:
 *
 *   1. **API** — o caso de uso que a Server Action chama (`empenhar`).
 *   2. **WORKER** — o importador de folha (M20), que roda em lote, sem requisição, sem
 *      tela e sem ninguém olhando. É o caminho mais fácil de esquecer.
 *   3. **ROTA ALTERNATIVA** — dois caminhos que chegam ao razão SEM passar pelo M05: o
 *      lançamento manual do M01 (partidas arbitrárias — a chave-mestra) e o ingresso
 *      extraorçamentário do M07 (dinheiro de terceiro, que não é despesa).
 *
 * Se a proteção estivesse em cada caso de uso, seriam N lugares para lembrar e um para
 * esquecer. Ela está no FUNIL: `lancarNoRazao` é o único caminho para o razão (há
 * grep-teste que o prova, em `m01-funil.test.ts`), e é lá dentro que a competência é
 * conferida. Este arquivo mede a consequência disso pelas três rotas.
 *
 * ⚠️ O CORTE É PELA `dataTransacao` — a data do FATO —, nunca pelo `criadoEm`. Fechar
 * novembro tem de impedir um lançamento COM DATA de novembro feito hoje; um corte por
 * data de digitação deixaria exatamente essa porta aberta, que é a que interessa a quem
 * quer maquiar competência.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m05@cg.pb.gov.br";
const CONTA_BANCOS = "1.1.1.1.1.19.00";

const ROTEIROS = {
  empenho: roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" }),
  liquidacao: roteiroLiquidacao({ variacaoDiminutiva: "3.3.2.1.1.01.00", obrigacaoAPagar: "2.1.3.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" }),
  pagamento: roteiroPagamento({ obrigacaoAPagar: "2.1.3.1.1.00.00", disponibilidade: CONTA_BANCOS, creditoLiquidado: "6.2.2.1.3.03.00", creditoPago: "6.2.2.1.3.04.00" }),
};

const fixture = (nome: string): string =>
  readFileSync(fileURLToPath(new URL(`../docs/poc-fixtures/${nome}`, import.meta.url)), "utf8");

/** A folha de NOVEMBRO/2026 — é esta competência que os testes fecham. */
const COMPETENCIA_DA_FOLHA = "2026-11";
const DATA_NA_COMPETENCIA = new Date(Date.UTC(2026, 10, 5, 12));

const paramsFolha = () => ({
  nomeArquivo: "folha-poc-2026-11.csv",
  conteudo: fixture("folha-poc-2026-11.csv"),
  exercicio: 2026,
  dataEmpenho: DATA_NA_COMPETENCIA,
  dataLiquidacao: new Date(Date.UTC(2026, 10, 6, 12)),
  dataPagamento: new Date(Date.UTC(2026, 10, 10, 12)),
  contaBancaria: "CC-POC-A",
  contaDisponibilidade: CONTA_BANCOS,
  contaConsignacaoPorTipo: { INSS: "2.1.8.8.1.01.00", ISS: "2.1.8.8.1.02.00" },
  credorCpfCnpj: "12345678000199",
  criadoPor: POR,
});

/** Fecha novembro/2026, globalmente. */
async function fecharNovembro(): Promise<void> {
  await travar(prisma, {
    competencia: COMPETENCIA_DA_FOLHA,
    motivo: "encerramento da competência para conferência",
    criadoPor: POR,
  });
}

/** Quantos lançamentos existem com data DENTRO da competência fechada. */
async function lancamentosEmNovembro(): Promise<number> {
  return prisma.lancamentoContabil.count({
    where: {
      dataTransacao: {
        gte: new Date(Date.UTC(2026, 10, 1)),
        lt: new Date(Date.UTC(2026, 11, 1)),
      },
    },
  });
}

beforeEach(async () => {
  await limparBanco(prisma);
  await semearSagresPoc(prisma, { criadoPor: POR });
});

describe("período fechado — as três rotas", () => {
  it("ROTA 1 (API): o caso de uso que a tela chama é recusado", async () => {
    const ficha = await prisma.fichaOrcamentaria.findFirstOrThrow({
      where: { exercicio: 2026 },
      select: { id: true },
    });
    await fecharNovembro();
    const antes = await lancamentosEmNovembro();

    await expect(
      empenhar(
        {
          fichaId: ficha.id, numero: "2026NE-FECHADO", tipo: "ORDINARIO",
          valor: "100.00", data: DATA_NA_COMPETENCIA,
          credorCpfCnpj: "12345678000199", historico: "empenho em mês fechado",
          categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
        },
        ROTEIROS.empenho,
        criarM05Deps(prisma)
      )
    ).rejects.toThrow(/travad|competência/i);

    expect(await lancamentosEmNovembro()).toBe(antes);
    expect(
      await prisma.empenho.count({ where: { numero: "2026NE-FECHADO" } }),
      "o fato operacional também não pode sobrar: a recusa é da transação inteira"
    ).toBe(0);
  });

  it("ROTA 2 (WORKER): o importador de folha em lote é recusado igual", async () => {
    // ⚠️ ESTE É O CAMINHO QUE SE ESQUECE. Ele não tem tela, não tem requisição e não tem
    // ninguém olhando quando roda. Um guard de período implementado na borda web o
    // deixaria passar — e a folha inteira de um mês fechado entraria em silêncio.
    await fecharNovembro();
    const antes = await lancamentosEmNovembro();
    const empenhosAntes = await prisma.empenho.count();

    await expect(
      confirmarImportacaoFolha(
        prisma,
        paramsFolha(),
        ROTEIROS,
        criarM05DepsComAlmoxarifado(prisma)
      )
    ).rejects.toThrow(/travad|competência/i);

    expect(await lancamentosEmNovembro()).toBe(antes);
    expect(
      await prisma.empenho.count(),
      "a folha tem 5 servidores: ou entram os 5, ou nenhum. Nada de meia folha."
    ).toBe(empenhosAntes);
  });

  it("ROTA 3a (ALTERNATIVA): o lançamento MANUAL do razão é recusado", async () => {
    // A chave-mestra: partidas arbitrárias, sem fato de origem. Se alguma rota fosse
    // deixar passar, seria esta — ela não passa por empenho, liquidação nem pagamento.
    await fecharNovembro();
    const antes = await lancamentosEmNovembro();

    await expect(
      registrarLancamento(
        {
          numeroControle: "MANUAL-FECHADO",
          dataTransacao: DATA_NA_COMPETENCIA,
          historico: "lançamento manual em mês fechado",
          origemTipo: "MANUAL",
          criadoPor: POR,
          partidas: [
            { conta: "1.1.1.1.1.19.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "10.00" },
            { conta: "2.1.3.1.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "10.00" },
          ],
        },
        criarM01Deps(prisma)
      )
    ).rejects.toThrow(/travad|competência/i);

    expect(await lancamentosEmNovembro()).toBe(antes);
  });

  it("ROTA 3b (ALTERNATIVA): o extraorçamentário, que nem despesa é, também é recusado", async () => {
    // Dinheiro de TERCEIRO. Não é receita, não é despesa, não toca dotação — e mesmo
    // assim toca o razão. Um guard preso ao "fluxo da despesa" o deixaria de fora.
    await fecharNovembro();
    const antes = await lancamentosEmNovembro();
    const tipo = await prisma.tipoConsignacao.findFirstOrThrow({ select: { id: true } });
    // A fonte vem da própria conta do cenário — o ingresso passou a exigi-la (ENT03c,
    // pendência M07-FONTE-NO-MOVIMENTO). O que este teste prova é a TRAVA DE COMPETÊNCIA,
    // e ela tem de disparar ANTES de qualquer conferência de fonte.
    const contaDoCenario = await prisma.contaBancaria.findFirstOrThrow({
      where: { codigo: "CC-POC-A" },
      select: { fonteId: true },
    });

    await expect(
      registrarIngressoExtra(
        prisma,
        {
          tipoConsignacaoId: tipo.id, credorConsignatario: "Caucionante",
          contaBancaria: "CC-POC-A", fonteId: contaDoCenario.fonteId,
          valor: "50.00", data: DATA_NA_COMPETENCIA,
          historico: "caução em mês fechado", criadoPor: POR,
        },
        [
          { conta: "1.1.1.1.1.19.00", tipo: "DEBITO", subsistema: "PATRIMONIAL" },
          { conta: "2.1.8.8.1.01.00", tipo: "CREDITO", subsistema: "PATRIMONIAL" },
        ]
      )
    ).rejects.toThrow(/travad|competência/i);

    expect(await lancamentosEmNovembro()).toBe(antes);
  });

  it("O CORTE É PELA DATA DO FATO: fechado novembro, dezembro continua escrevendo", async () => {
    // ⚠️ SEM ESTE PAR, os quatro testes acima passariam num sistema que simplesmente não
    // grava mais nada. A trava tem de ser CIRÚRGICA — ela fecha uma janela, não o sistema.
    const ficha = await prisma.fichaOrcamentaria.findFirstOrThrow({
      where: { exercicio: 2026 },
      select: { id: true },
    });
    await fecharNovembro();

    const r = await empenhar(
      {
        fichaId: ficha.id, numero: "2026NE-DEZEMBRO", tipo: "ORDINARIO",
        valor: "100.00", data: new Date(Date.UTC(2026, 11, 3, 12)),
        credorCpfCnpj: "12345678000199", historico: "empenho em mês ABERTO",
        categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
      },
      ROTEIROS.empenho,
      criarM05Deps(prisma)
    );
    expect(r.empenhoId).toBeTruthy();
  });

  it("DESTRAVAR reabre — e o motivo fica registrado para sempre", async () => {
    const ficha = await prisma.fichaOrcamentaria.findFirstOrThrow({
      where: { exercicio: 2026 },
      select: { id: true },
    });
    await fecharNovembro();
    await destravar(prisma, {
      competencia: COMPETENCIA_DA_FOLHA,
      motivo: "reabertura para correção de classificação apontada na conferência",
      criadoPor: POR,
    });

    const r = await empenhar(
      {
        fichaId: ficha.id, numero: "2026NE-REABERTO", tipo: "ORDINARIO",
        valor: "100.00", data: DATA_NA_COMPETENCIA,
        credorCpfCnpj: "12345678000199", historico: "empenho após reabertura",
        categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
      },
      ROTEIROS.empenho,
      criarM05Deps(prisma)
    );
    expect(r.empenhoId).toBeTruthy();

    // ⚠️ REABRIR NÃO APAGA O FECHAMENTO. Os dois eventos ficam, e é a sequência deles
    // que responde ao controle interno "quem reabriu novembro, e por quê?".
    const eventos = await prisma.movimentoTravamento.findMany({
      orderBy: { criadoEm: "asc" },
      select: { tipo: true, motivo: true },
    });
    expect(eventos.map((e) => e.tipo)).toEqual(["TRAVAR", "DESTRAVAR"]);
    expect(eventos[1]?.motivo ?? "").toMatch(/reabertura para correção/);
  });
});
