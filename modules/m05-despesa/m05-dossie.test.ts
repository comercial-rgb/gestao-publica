import "dotenv/config";
import { beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "./adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
  type RoteiroContabil,
} from "./dominio.js";
import { anularEmpenho, empenhar } from "./servico.js";
import { anularPagamento, liquidar, pagar } from "./servico-bloco2.js";
import { dossieDoEmpenho, type DossieDoEmpenho } from "./dossie.js";
import type { M05Deps } from "./ports.js";

/**
 * O DOSSIÊ DO EMPENHO — a conferência de UM empenho, do nascimento ao estorno.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA, E POR QUE CADA COISA IMPORTA ═══
 * (1) Que o dossiê responde com os MESMOS números do razão — e não com uma segunda
 *     aritmética que a tela inventou.
 * (2) Que o BRUTO e a SAÍDA DE CAIXA aparecem como grandezas SEPARADAS. É o ponto do
 *     cenário de aceite: pagar 1.000 retendo 100 tira 900 do banco.
 * (3) Que o ESTORNO devolve ao caixa 900 — o que saiu —, e não os 1.000 do bruto.
 *     Estornar pelo bruto INVENTARIA 100 reais de disponibilidade que nunca saíram, e o
 *     razão fecharia do mesmo jeito: os dois lados estariam errados na mesma medida. É
 *     exatamente o erro que nenhuma amarração de balancete pega.
 *
 * ⚠️ OS VALORES ESPERADOS ESTÃO ESCRITOS ANTES DE RODAR. Uma expectativa preenchida
 * depois de ver a saída não é expectativa — é transcrição, e transcreve o bug junto.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

// ── o cenário de aceite, §2.4 ───────────────────────────────────────────────
//
// ⚠️ VALORES DE ENGENHARIA. Não são alíquota legal nem tabela tributária de município
// algum: existem para separar bruto, líquido e a perna que carrega cada um.
const DOTACAO = "10000.00";
const EMPENHO = "1000.00";
const LIQUIDACAO = "1000.00";
const RETENCAO = "100.00";

/** O que a TELA tem de mostrar, conta a conta, ANTES de o teste rodar. */
const ESPERADO_DEPOIS_DO_PAGAMENTO = {
  valor: "1000.00",
  empenhadoLiquido: "1000.00",
  anulacoes: "0.00",
  liquidado: "1000.00",
  pago: "1000.00",
  saldoALiquidar: "0.00",
  saldoAPagar: "0.00",
  totalRetido: "100.00",
  saidaDeCaixa: "900.00",
  status: "PAGO",
} as const;

/**
 * Depois de ANULAR o pagamento: o empenho volta a dever 1.000, e nada foi retido.
 *
 * ⚠️ `pago` VOLTA A 0,00 PORQUE A SOMA É LÍQUIDA, não porque alguma linha foi apagada. O
 * pagamento original continua no banco, com o valor que teve — quem o zera é o estorno,
 * somado junto.
 */
const ESPERADO_DEPOIS_DO_ESTORNO = {
  valor: "1000.00",
  empenhadoLiquido: "1000.00",
  liquidado: "1000.00",
  pago: "0.00",
  saldoAPagar: "1000.00",
  totalRetido: "0.00",
  saidaDeCaixa: "0.00",
  status: "LIQUIDADO",
} as const;

/**
 * AS PERNAS DO ESTORNO DO PAGAMENTO — o coração deste arquivo.
 *
 * O estorno é o espelho do original: o que era CREDITO vira DEBITO, com o MESMO valor de
 * cada perna. Logo o caixa volta a receber **900**, e o passivo com o INSS morre por 100.
 * Um estorno que devolvesse 1.000 ao caixa criaria disponibilidade do nada.
 */
const PERNAS_ESPERADAS_DO_ESTORNO: ReadonlyArray<{
  readonly conta: string;
  readonly tipo: "DEBITO" | "CREDITO";
  readonly subsistema: string;
  readonly valor: string;
}> = [
  { conta: "2.1.3.1.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1000.00" },
  { conta: "1.1.1.1.2.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "900.00" },
  { conta: "2.1.8.8.1.01.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "100.00" },
  { conta: "6.2.2.1.3.03.00", tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: "1000.00" },
  { conta: "6.2.2.1.3.04.00", tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: "1000.00" },
];

const CAIXA = "1.1.1.1.2.00.00";
const P_INSS = "2.1.8.8.1.01.00";

const CONTAS = [
  { id: "d-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "d-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "d-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "d-pago", codigo: "6.2.2.1.3.04.00", nome: "Crédito Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "d-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD - Serviços", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "d-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores a Pagar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "d-banco", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "d-inss", codigo: P_INSS, nome: "Consignações", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO: RoteiroContabil = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});
const R_LIQUIDACAO: RoteiroContabil = roteiroLiquidacao({
  variacaoDiminutiva: "3.3.2.1.1.01.00",
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
});
const R_PAGAMENTO: RoteiroContabil = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  disponibilidade: CAIXA,
  creditoLiquidado: "6.2.2.1.3.03.00",
  creditoPago: "6.2.2.1.3.04.00",
});

const CRIADO_POR = "ent01@cg.pb.gov.br";
const FICHA_ID = "ficha-dossie";
const FONTE = "fnt-dossie";

let deps: M05Deps;
let empenhoId: string;
let pagamentoId: string;

/** O dossiê só é útil se for o do EMPENHO — a variante de desvio tem teste próprio. */
async function dossie(): Promise<DossieDoEmpenho> {
  const d = await dossieDoEmpenho(prisma, empenhoId);
  if (d === null || "redirecionarPara" in d) {
    throw new Error("o dossiê do empenho original não foi montado");
  }
  return d;
}

beforeAll(async () => {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "d-org", codigo: "02", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "d-uo", codigo: "02001", descricao: "Saúde", orgaoId: "d-org" },
  });
  await prisma.funcao.create({ data: { id: "d-fun", codigo: "10", nome: "Saúde" } });
  await prisma.subfuncao.create({ data: { id: "d-sub", codigo: "301", nome: "Atenção Básica" } });
  await prisma.programa.create({ data: { id: "d-prg", codigo: "0010", descricao: "Saúde para Todos" } });
  await prisma.acao.create({
    data: { id: "d-aca", codigo: "2010", descricao: "Manutenção da Atenção Básica", tipo: "ATIVIDADE" },
  });
  await prisma.naturezaDespesa.create({
    data: {
      id: "d-nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "d-cb", codigo: "CC-DOS", descricao: "Conta livre", fonteId: FONTE },
  });
  await prisma.tipoConsignacao.create({
    data: {
      id: "d-tc", codigo: "INSS", descricao: "Retenção previdenciária - INSS",
      contaPassivoId: "d-inss", criadoPor: CRIADO_POR,
    },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA_ID, exercicio: 2026, numero: 7,
    orgaoId: "d-org", unidadeOrcId: "d-uo", funcaoId: "d-fun",
    subfuncaoId: "d-sub", programaId: "d-prg", acaoId: "d-aca",
    naturezaDespesaId: "d-nd", fonteId: FONTE, valorDotado: DOTACAO,
  });

  deps = criarM05Deps(prisma);

  const e = await empenhar(
    {
      fichaId: FICHA_ID, numero: "2026NE0007", tipo: "ORDINARIO", valor: EMPENHO,
      data: new Date("2026-04-10T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "empenho do dossiê", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: CRIADO_POR,
    },
    R_EMPENHO,
    deps
  );
  empenhoId = e.empenhoId;

  const l = await liquidar(
    {
      empenhoId, numero: "2026NL0007", valor: LIQUIDACAO,
      data: new Date("2026-05-01T12:00:00Z"), responsavelAtesto: "Fulano de Tal",
      historico: "liquidação do dossiê", criadoPor: CRIADO_POR,
    },
    R_LIQUIDACAO,
    deps
  );

  const p = await pagar(
    {
      liquidacaoId: l.liquidacaoId, numero: "2026OP0007", valor: LIQUIDACAO,
      data: new Date("2026-06-01T12:00:00Z"), contaBancaria: "CC-DOS", fonteId: FONTE,
      historico: "pagamento com retenção do dossiê", criadoPor: CRIADO_POR,
    },
    R_PAGAMENTO,
    deps,
    {
      contaDisponibilidade: CAIXA,
      retencoes: [
        {
          tipoConsignacaoId: "d-tc", credorConsignatario: "INSS",
          valor: RETENCAO, contaConsignacaoAPagar: P_INSS,
        },
      ],
    }
  );
  pagamentoId = p.pagamentoId;
});

describe("dossiê do empenho — a origem e os valores", () => {
  it("a origem traz a dotação inteira, não só o número da ficha", async () => {
    const d = await dossie();
    // Quem confere um empenho precisa da classificação COMPLETA: é ela que diz se a
    // despesa foi para onde o orçamento mandou. Só o número da ficha obrigaria a abrir
    // outra tela para responder a pergunta seguinte, que é sempre esta.
    expect(d.origem.unidadeCodigo).toBe("02001");
    expect(d.origem.funcaoCodigo).toBe("10");
    expect(d.origem.subfuncaoCodigo).toBe("301");
    expect(d.origem.programaCodigo).toBe("0010");
    expect(d.origem.acaoCodigo).toBe("2010");
    expect(d.origem.naturezaCodigo).toBe("339039");
    expect(d.origem.fonteCodigo).toBe("500");
  });

  it("os valores batem, um a um, com o que foi escrito antes de rodar", async () => {
    const d = await dossie();
    expect({
      valor: d.valor.toFixed(2),
      empenhadoLiquido: d.empenhadoLiquido.toFixed(2),
      anulacoes: d.anulacoes.toFixed(2),
      liquidado: d.liquidado.toFixed(2),
      pago: d.pago.toFixed(2),
      saldoALiquidar: d.saldoALiquidar.toFixed(2),
      saldoAPagar: d.saldoAPagar.toFixed(2),
      totalRetido: d.totalRetido.toFixed(2),
      saidaDeCaixa: d.saidaDeCaixa.toFixed(2),
      status: d.status,
    }).toEqual(ESPERADO_DEPOIS_DO_PAGAMENTO);
  });

  it("a saída de caixa do dossiê é a MESMA perna do razão — não uma segunda conta", async () => {
    const d = await dossie();
    // ⚠️ A CONFRONTAÇÃO É O TESTE. `saidaDeCaixa` podia estar certo por acaso (bruto −
    // retido dá 900 de qualquer jeito). O que prova que ele significa alguma coisa é
    // bater com a perna do CAIXA no lançamento de verdade.
    const pernaDoCaixa = await prisma.partidaContabil.findFirstOrThrow({
      where: {
        conta: { codigo: CAIXA },
        lancamento: { pagamento: { id: pagamentoId } },
      },
      select: { valor: true, tipo: true },
    });
    expect(pernaDoCaixa.tipo).toBe("CREDITO");
    expect(pernaDoCaixa.valor.toFixed(2)).toBe(d.saidaDeCaixa.toFixed(2));
    expect(d.saidaDeCaixa.toFixed(2)).toBe("900.00");
  });

  it("a retenção aparece PRESA ao pagamento, com o tipo e o consignatário", async () => {
    const d = await dossie();
    const pagamentos = d.liquidacoes.flatMap((l) => l.pagamentos);
    expect(pagamentos).toHaveLength(1);

    const p = pagamentos[0]!;
    expect(p.valor.toFixed(2), "o Pagamento é gravado pelo BRUTO").toBe("1000.00");
    expect(p.saidaDeCaixa.toFixed(2)).toBe("900.00");
    expect(p.retencoes).toHaveLength(1);
    expect(p.retencoes[0]?.tipoCodigo).toBe("INSS");
    expect(p.retencoes[0]?.credorConsignatario).toBe("INSS");
    expect(p.retencoes[0]?.valor.toFixed(2)).toBe("100.00");
    expect(p.retencoes[0]?.movimento).toBe("INGRESSO");
  });

  it("cada lançamento fecha DENTRO de cada subsistema", async () => {
    const d = await dossie();
    expect(d.lancamentos.length).toBeGreaterThanOrEqual(3);
    for (const l of d.lancamentos) {
      for (const t of l.totais) {
        expect(
          t.fecha,
          `${l.numeroControle}: ${t.subsistema} tem D=${t.debito.toFixed(2)} e ` +
            `C=${t.credito.toFixed(2)}. Fechar no TOTAL e não por subsistema é o furo ` +
            `que um balancete não pega.`
        ).toBe(true);
      }
    }
  });

  it("o lançamento do pagamento e o da retenção são UM SÓ — não dois", async () => {
    const d = await dossie();
    // A retenção COMPARTILHA o lançamento do pagamento: ela é perna do mesmo ato. Se o
    // dossiê listasse dois, alguém leria "houve um pagamento e um movimento extra
    // separado" — e a atomicidade dos dois deixaria de ser visível.
    const doPagamento = d.lancamentos.filter((l) =>
      l.partidas.some((p) => p.contaCodigo === P_INSS)
    );
    expect(doPagamento).toHaveLength(1);
    expect(
      doPagamento[0]?.partidas.some((p) => p.contaCodigo === CAIXA),
      "a perna do caixa e a do passivo do consignatário estão no MESMO lançamento"
    ).toBe(true);
  });
});

describe("dossiê do empenho — o estorno", () => {
  beforeAll(async () => {
    await anularPagamento(
      {
        pagamentoId,
        numero: "2026OP0007-A",
        data: new Date("2026-06-15T12:00:00Z"),
        historico: "anulação do pagamento do dossiê",
        criadoPor: CRIADO_POR,
      },
      deps
    );
  });

  it("o estorno devolve ao caixa os 900 que saíram — nunca os 1.000 do bruto", async () => {
    const estorno = await prisma.pagamento.findFirstOrThrow({
      where: { estornoDeId: pagamentoId },
      select: { lancamentoId: true },
    });

    const obtidas = (
      await prisma.partidaContabil.findMany({
        where: { lancamentoId: estorno.lancamentoId },
        select: {
          tipo: true,
          subsistema: true,
          valor: true,
          conta: { select: { codigo: true } },
        },
      })
    )
      .map((p) => ({
        conta: p.conta.codigo,
        tipo: p.tipo as "DEBITO" | "CREDITO",
        subsistema: String(p.subsistema),
        valor: p.valor.toFixed(2),
      }))
      .sort((a, b) => (a.conta + a.tipo).localeCompare(b.conta + b.tipo));

    const esperadas = [...PERNAS_ESPERADAS_DO_ESTORNO].sort((a, b) =>
      (a.conta + a.tipo).localeCompare(b.conta + b.tipo)
    );

    expect(
      obtidas,
      "estornar pelo BRUTO inventaria 100 reais de disponibilidade que nunca saíram — e o " +
        "lançamento fecharia igual, com os dois lados errados na mesma medida."
    ).toEqual(esperadas);
  });

  it("depois do estorno o dossiê volta a dever, e nada consta como retido", async () => {
    const d = await dossie();
    expect({
      valor: d.valor.toFixed(2),
      empenhadoLiquido: d.empenhadoLiquido.toFixed(2),
      liquidado: d.liquidado.toFixed(2),
      pago: d.pago.toFixed(2),
      saldoAPagar: d.saldoAPagar.toFixed(2),
      totalRetido: d.totalRetido.toFixed(2),
      saidaDeCaixa: d.saidaDeCaixa.toFixed(2),
      status: d.status,
    }).toEqual(ESPERADO_DEPOIS_DO_ESTORNO);
  });

  it("o pagamento original CONTINUA no dossiê — a correção acrescenta, não apaga", async () => {
    const d = await dossie();
    const p = d.liquidacoes.flatMap((l) => l.pagamentos);
    expect(p, "o pagamento anulado some da lista de ORIGINAIS? não: ele fica").toHaveLength(1);
    expect(p[0]?.anulado).toBe(true);
    expect(p[0]?.valor.toFixed(2), "com o valor que teve").toBe("1000.00");
    expect(p[0]?.pagoLiquido.toFixed(2), "mas valendo zero").toBe("0.00");
    // A cadeia mostra os DOIS: o original e o estorno dele.
    expect(p[0]?.cadeia).toHaveLength(2);
    expect(p[0]?.cadeia.map((f) => f.natureza)).toEqual(["ORIGINAL", "ANULACAO_TOTAL"]);
  });
});

describe("dossiê do empenho — as recusas", () => {
  it("id inexistente devolve nulo, e não um dossiê vazio que pareça um empenho", async () => {
    expect(await dossieDoEmpenho(prisma, "nao-existe")).toBeNull();
  });

  it("abrir uma ANULAÇÃO leva ao original em vez de fingir que ela é um empenho", async () => {
    // ⚠️ O EMPENHO ANULADO É CRIADO AQUI, DE PROPÓSITO. O do cenário principal está
    // liquidado e não pode ser anulado por inteiro — e um teste que "pulasse quando não
    // achasse anulação" ficaria verde sem provar nada, que é a pior espécie de teste.
    const outro = await empenhar(
      {
        fichaId: FICHA_ID, numero: "2026NE0008", tipo: "ORDINARIO", valor: "50.00",
        data: new Date("2026-07-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
        historico: "empenho que será anulado inteiro",
        categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: CRIADO_POR,
      },
      R_EMPENHO,
      deps
    );
    await anularEmpenho(
      {
        empenhoId: outro.empenhoId, numero: "2026NE0008-A",
        data: new Date("2026-07-02T12:00:00Z"),
        historico: "anulação total", criadoPor: CRIADO_POR,
      },
      deps
    );

    const anulacao = await prisma.empenho.findFirstOrThrow({
      where: { estornoDeId: outro.empenhoId },
      select: { id: true },
    });

    // A anulação tem valor positivo, ficha e um credor sentinela: aberta como empenho,
    // ela tem a cara de um empenho novo. O dossiê recusa e diz para onde ir.
    expect(await dossieDoEmpenho(prisma, anulacao.id)).toEqual({
      redirecionarPara: outro.empenhoId,
    });

    // E o ORIGINAL abre normalmente, mostrando-se anulado.
    const d = await dossieDoEmpenho(prisma, outro.empenhoId);
    if (d === null || "redirecionarPara" in d) throw new Error("o original tem de abrir");
    expect(d.anulado).toBe(true);
    expect(d.empenhadoLiquido.toFixed(2)).toBe("0.00");
    expect(d.anulacoes.toFixed(2)).toBe("50.00");
    expect(d.cadeia.map((f) => f.natureza)).toEqual(["ORIGINAL", "ANULACAO_TOTAL"]);
  });
});
