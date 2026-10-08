import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { lerPlanilha } from "../../packages/planilha/index.js";
import { lerEntradasDoZip } from "../../packages/zip/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { roteiroArrecadacao, roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m01-core-contabil/roteiros.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import {
  CO_DO_FUNDO,
  CONTAS_DOS_APORTES,
  CONTAS_DOS_BENS,
  RECEITA_DA_ADMINISTRACAO,
  RECEITA_DO_TESOURO,
  REGRAS_DA_RECEITA,
  SUBELEMENTOS_DO_BENEFICIO,
  anexo4,
  linhaDaDespesaPrevidenciaria,
} from "./rreo-anexo4.js";

/**
 * V35 — RREO ANEXO 4 (RPPS). Duas provas.
 *
 * 1) A TRANSCRIÇÃO CONTRA A FONTE. Cada lista de prefixos do código é conferida contra a célula da planilha oficial da
 *    STN, lida aqui de forma independente (zip → xlsx → linha), pelo número da linha que a regra declara. Se alguém
 *    trocar um prefixo no código, ou a STN mudar a célula, este teste acusa.
 *
 * 2) A APURAÇÃO, contas à mão. Fontes 800 (capitalização), 801 (repartição), 802 (administração) e 500.
 *    Receitas (todas em 2026; bimestre 3 = até 30/06):
 *      800 segurado ativo 12150111: 30.000 em 10/02 + 20.000 em 10/04 (+ 10.000 em 10/07, fora) → 50.000; previsto 120.000
 *      800 patronal ativo 12150211: 100.000 em 15/03; previsto 240.000
 *      800 valores mobiliários 13210041: 5.000; 800 compensação 19990311: 3.000
 *      800 aportes para déficit atuarial 19990111: 40.000 → linha (II), FORA do total (IV)
 *      801 segurado ativo 12150111: 7.000
 *      ⇒ capitalização (IV) realizada 158.000; prevista 360.000
 *    Despesas (empenho = liquidação; pagamento quando dito):
 *      A 319001 fonte 800, dotação 100.000: 10.000, pago 8.000                 → aposentadorias
 *      E 319001 fonte 500, CO 1111, subfunção 272, dotação 20.000: 2.000 pago   → aposentadorias (bloco do CO)
 *      B 319091 fonte 800 sem subelemento, dotação 5.000: 1.500 pago            → demais, com nota
 *      C 319003 fonte 801, dotação 50.000: 4.000 pago                           → pensões (repartição)
 *      D 339039 fonte 802, dotação 10.000: 900 pago                             → administração, demais correntes
 *      F 319001 fonte 500, sem CO, subfunção 122: 3.000                         → fora do demonstrativo
 *    ⇒ capitalização: aposentadorias dot 120.000 · emp 12.000 · liq 12.000 · pago 10.000; demais 1.500
 *      resultado executado = 158.000 − 13.500 = 144.500
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

// ═══ 1) a transcrição ═══
const PLANILHA = (() => {
  const zip = lerEntradasDoZip(readFileSync(resolve(import.meta.dirname, "../../docs/oficial/stn-sof/mapeamento-rreo-mdf15-msc2026.zip")));
  const nome = [...zip.keys()].find((n) => n.includes("ANEXO 04"));
  if (nome === undefined) throw new Error("o zip oficial não tem o Anexo 4");
  const aba = [...lerPlanilha(zip.get(nome)!).entries()].find(([n]) => n.includes("M e DF"));
  if (aba === undefined) throw new Error("o Anexo 4 oficial não tem a aba de Municípios");
  return aba[1];
})();
/** Os números da linha (1-base) da planilha oficial, como tokens de dígitos. */
const tokensDaLinha = (linha: number): ReadonlySet<string> => {
  const texto = (PLANILHA[linha - 1] ?? []).join(" ");
  // os números soltos ("começada por (Lista): 1215011,121503") e os códigos pontuados da coluna de critérios
  // ("NR: 1.2.1.5.01.2.0"), estes sem os pontos e sem os zeros finais — "1215012" é exatamente esse código, não um
  // pedaço dele. Um prefixo que só casasse com o começo de um código não passa.
  const soltos = texto.match(/\d+/g) ?? [];
  const pontuados = (texto.match(/\d(?:\.\d+)+/g) ?? []).map((c) => c.replace(/\./g, "").replace(/0+$/, ""));
  return new Set([...soltos, ...pontuados]);
};
const rotuloDaLinha = (linha: number): string => (PLANILHA[linha - 1]?.[0] ?? "").replace(/\s+/g, " ").trim();

describe("RREO Anexo 4 — a transcrição das regras contra o mapeamento oficial da STN", () => {
  it("cada prefixo de receita está na célula da linha que a regra declara, e o rótulo confere", () => {
    for (const r of [...REGRAS_DA_RECEITA, RECEITA_DA_ADMINISTRACAO, RECEITA_DO_TESOURO]) {
      const tokens = tokensDaLinha(r.linha);
      for (const p of [...r.comeca, ...(r.exceto ?? [])]) expect(tokens.has(p), `${r.chave}: ${p} na linha ${String(r.linha)}`).toBe(true);
      expect(rotuloDaLinha(r.linha).startsWith(r.rotulo.slice(0, 20)), `${r.chave}: rótulo "${rotuloDaLinha(r.linha)}"`).toBe(true);
    }
  });

  it("os subelementos de aposentadoria e pensão e os códigos de acompanhamento estão nas linhas 47, 48, 103 e 104", () => {
    for (const e of ["91", "92", "94"] as const) {
      for (const s of SUBELEMENTOS_DO_BENEFICIO[e].aposentadoria) expect(tokensDaLinha(47).has(`${e}${s}`), `aposentadoria ${e}.${s}`).toBe(true);
      for (const s of SUBELEMENTOS_DO_BENEFICIO[e].pensao) expect(tokensDaLinha(48).has(`${e}${s}`), `pensão ${e}.${s}`).toBe(true);
    }
    for (const co of CO_DO_FUNDO.CAPITALIZACAO) expect(tokensDaLinha(47).has(co)).toBe(true);
    for (const co of CO_DO_FUNDO.REPARTICAO) expect(tokensDaLinha(103).has(co)).toBe(true);
  });

  it("as contas dos aportes e dos bens estão nas suas linhas", () => {
    const linhasDosAportes = { CAPITALIZACAO: [59, 60, 61, 62], REPARTICAO: [111, 112] } as const;
    for (const q of ["CAPITALIZACAO", "REPARTICAO"] as const) {
      CONTAS_DOS_APORTES[q].forEach((a, i) => {
        const l = linhasDosAportes[q][i]!;
        expect(rotuloDaLinha(l)).toBe(a.rotulo);
        for (const p of a.comeca) expect(tokensDaLinha(l).has(p), `${a.rotulo}: ${p}`).toBe(true);
      });
    }
    const linhasDosBens = { CAPITALIZACAO: [64, 65, 66], REPARTICAO: [114, 115, 116], ADMINISTRACAO: [139, 140] } as const;
    for (const q of ["CAPITALIZACAO", "REPARTICAO", "ADMINISTRACAO"] as const) {
      CONTAS_DOS_BENS[q].forEach((b, i) => {
        const l = linhasDosBens[q][i]!;
        expect(rotuloDaLinha(l)).toBe(b.rotulo);
        // "1136209.1136299" vem grudado por ponto na célula oficial: os dois tokens aparecem
        for (const p of b.comeca) expect(tokensDaLinha(l).has(p), `${q} ${b.rotulo}: ${p}`).toBe(true);
      });
    }
  });

  it("a classificação da despesa segue o elemento e, em 91/92/94, o subelemento", () => {
    expect(linhaDaDespesaPrevidenciaria("319001", null)).toBe("APOSENTADORIAS");
    expect(linhaDaDespesaPrevidenciaria("319003", "05")).toBe("PENSOES");
    expect(linhaDaDespesaPrevidenciaria("319091", "09")).toBe("APOSENTADORIAS");
    expect(linhaDaDespesaPrevidenciaria("319091", "10")).toBe("PENSOES");
    expect(linhaDaDespesaPrevidenciaria("319091", "40")).toBe("FORA");
    expect(linhaDaDespesaPrevidenciaria("319091", null)).toBe("DEMAIS_SEM_SUBELEMENTO");
    expect(linhaDaDespesaPrevidenciaria("319186", null)).toBe("COMPENSACAO");
    expect(linhaDaDespesaPrevidenciaria("319113", null)).toBe("FORA"); // intraorçamentária fora dos benefícios
    expect(linhaDaDespesaPrevidenciaria("339039", null)).toBe("DEMAIS");
  });
});

// ═══ 2) a apuração ═══
const POR = "orcamento@cg.pb.gov.br";
const R_ARREC = roteiroArrecadacao({ naturezaDaFonte: "VINCULADOS", disponibilidade: "1.1.1.1.1.00.00", variacaoAumentativa: "4.1.1.2.1.01.00" });
const R_EMP = roteiroEmpenho();
// o roteiro patrimonial da liquidação não toca o Anexo 4, que lê a execução orçamentária: o de 39 serve à fixture
const R_LIQ = roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: "2.1.3.1.1.00.00" });
const R_PAG = roteiroPagamento({ obrigacaoAPagar: "2.1.3.1.1.00.00", disponibilidade: "1.1.1.1.1.00.00" });
const D = (iso: string) => new Date(`${iso}T12:00:00Z`);

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: "TESTE" } });
  await prisma.orgao.create({ data: { id: "org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo", codigo: "01001", descricao: "Previdência", orgaoId: "org" } });
  await prisma.funcao.create({ data: { id: "f09", codigo: "09", nome: "Previdência Social" } });
  await prisma.subfuncao.createMany({ data: [{ id: "s272", codigo: "272", nome: "Previdência do Regime Estatutário" }, { id: "s122", codigo: "122", nome: "Administração Geral" }, { id: "s997", codigo: "997", nome: "Reserva do RPPS" }] });
  await prisma.programa.create({ data: { id: "prg", codigo: "0009", descricao: "Previdência" } });
  await prisma.acao.createMany({ data: ["2001", "2002", "2003", "2004", "2005", "2006", "2007"].map((c) => ({ id: `a${c}`, codigo: c, descricao: `Ação ${c}`, tipo: "ATIVIDADE" as const })) });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-01", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "01", codigoCompleto: "319001", descricao: "Aposentadorias" },
      { id: "nd-03", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "03", codigoCompleto: "319003", descricao: "Pensões" },
      { id: "nd-91", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "91", codigoCompleto: "319091", descricao: "Sentenças judiciais" },
      { id: "nd-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
      { id: "nd-99", codCategoria: "9", codNatureza: "9", codModalidade: "99", codElemento: "99", codigoCompleto: "999999", descricao: "Reserva de Contingência" },
    ],
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: "fnt-800", codigo: "800", descricao: "RPPS - capitalização", codigoTce: "800" },
      { id: "fnt-801", codigo: "801", descricao: "RPPS - repartição", codigoTce: "801" },
      { id: "fnt-802", codigo: "802", descricao: "RPPS - taxa de administração", codigoTce: "802" },
      { id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
    ],
  });
  await prisma.codigoAcompanhamento.create({ data: { id: "co-1111", codigo: "1111", descricao: "Plano previdenciário" } });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-seg", codigo: "12150111", descricao: "Contribuição do servidor ativo ao RPPS" },
      { id: "nr-pat", codigo: "12150211", descricao: "Contribuição patronal de servidor ativo" },
      { id: "nr-mob", codigo: "13210041", descricao: "Remuneração de investimentos do RPPS" },
      { id: "nr-comp", codigo: "19990311", descricao: "Compensação previdenciária do RGPS para o RPPS" },
      { id: "nr-aporte", codigo: "19990111", descricao: "Aportes para amortização de déficit atuarial" },
    ],
  });
  await prisma.receitaPrevista.createMany({
    data: [
      { exercicio: 2026, naturezaReceitaId: "nr-seg", fonteId: "fnt-800", tipoReceita: "ORCAMENTARIA", valorPrevisto: "120000.00" },
      { exercicio: 2026, naturezaReceitaId: "nr-pat", fonteId: "fnt-800", tipoReceita: "ORCAMENTARIA", valorPrevisto: "240000.00" },
    ],
  });
  const base = { exercicio: 2026, orgaoId: "org", unidadeOrcId: "uo", funcaoId: "f09", programaId: "prg" };
  const fichas = [
    { id: "A", numero: 1, acaoId: "a2001", subfuncaoId: "s272", naturezaDespesaId: "nd-01", fonteId: "fnt-800", valorDotado: "100000.00" },
    { id: "E", numero: 2, acaoId: "a2002", subfuncaoId: "s272", naturezaDespesaId: "nd-01", fonteId: "fnt-500", coId: "co-1111", valorDotado: "20000.00" },
    { id: "B", numero: 3, acaoId: "a2003", subfuncaoId: "s272", naturezaDespesaId: "nd-91", fonteId: "fnt-800", valorDotado: "5000.00" },
    { id: "C", numero: 4, acaoId: "a2004", subfuncaoId: "s272", naturezaDespesaId: "nd-03", fonteId: "fnt-801", valorDotado: "50000.00" },
    { id: "Dd", numero: 5, acaoId: "a2005", subfuncaoId: "s122", naturezaDespesaId: "nd-39", fonteId: "fnt-802", valorDotado: "10000.00" },
    { id: "F", numero: 6, acaoId: "a2006", subfuncaoId: "s122", naturezaDespesaId: "nd-01", fonteId: "fnt-500", valorDotado: "30000.00" },
    { id: "R", numero: 7, acaoId: "a2007", subfuncaoId: "s997", naturezaDespesaId: "nd-99", fonteId: "fnt-800", valorDotado: "7000.00" },
  ];
  for (const f of fichas) await criarFichaDeTeste(prisma, { ...base, ...f });
}

async function cenario(): Promise<void> {
  const m04 = criarM04Deps(prisma);
  let n = 0;
  const arrec = async (natureza: string, fonte: string, valor: string, data: string) => {
    n += 1;
    await registrarArrecadacao({ exercicio: 2026, naturezaReceita: natureza, fonte, valor, dataArrecadacao: D(data), numeroReceita: `G${String(n)}`, criadoPor: POR }, R_ARREC, m04);
  };
  await arrec("12150111", "800", "30000.00", "2026-02-10");
  await arrec("12150111", "800", "20000.00", "2026-04-10");
  await arrec("12150111", "800", "10000.00", "2026-07-10");
  await arrec("12150211", "800", "100000.00", "2026-03-15");
  await arrec("13210041", "800", "5000.00", "2026-03-20");
  await arrec("19990311", "800", "3000.00", "2026-05-05");
  await arrec("19990111", "800", "40000.00", "2026-05-06");
  await arrec("12150111", "801", "7000.00", "2026-02-11");

  const deps = criarM05Deps(prisma);
  const fonteDa: Record<string, string> = { A: "fnt-800", E: "fnt-500", B: "fnt-800", C: "fnt-801", Dd: "fnt-802", F: "fnt-500" };
  // A liquidação da B é de 31/03, antes da da A (01/04): a A é paga em parte (8.000 de 10.000) e, na mesma fonte 800,
  // continuaria na cabeça da fila do art. 141 e barraria o pagamento da B. Na ordem natural do número (f84ad1e7), a NL-9
  // vem antes da NL-11; a fixture contava com a ordem de texto antiga.
  const executa = async (ficha: string, valor: string, pago: string | null, liquidadaEm = "2026-04-01") => {
    n += 1;
    const e = await empenhar(
      { fichaId: ficha, numero: `NE-${String(n)}`, tipo: "ORDINARIO", valor, data: D("2026-03-01"), credorCpfCnpj: "11144477735", historico: "fixture", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR },
      R_EMP,
      deps
    );
    const l = await liquidar({ empenhoId: e.empenhoId, numero: `NL-${String(n)}`, valor, data: D(liquidadaEm), responsavelAtesto: "F", historico: "l", criadoPor: POR }, R_LIQ, deps);
    if (pago !== null) {
      await pagar({ liquidacaoId: l.liquidacaoId, numero: `NP-${String(n)}`, valor: pago, data: D("2026-05-01"), contaBancaria: `CC-${fonteDa[ficha]!}`, fonteId: fonteDa[ficha]!, historico: "p", criadoPor: POR }, R_PAG, deps);
    }
  };
  for (const fonte of ["fnt-800", "fnt-801", "fnt-802", "fnt-500"]) {
    await prisma.contaBancaria.create({ data: { codigo: `CC-${fonte}`, descricao: `Conta da ${fonte}`, fonteId: fonte } });
  }
  await executa("A", "10000.00", "8000.00");
  await executa("E", "2000.00", "2000.00");
  await executa("B", "1500.00", "1500.00", "2026-03-31");
  await executa("C", "4000.00", "4000.00");
  await executa("Dd", "900.00", "900.00");
  await executa("F", "3000.00", null);
}

describe("RREO Anexo 4 — a apuração", () => {
  beforeEach(async () => {
    await semear();
  });

  it("separa os fundos pela fonte, leva o benefício de outra fonte pelo código de acompanhamento e deixa fora o que não é previdenciário", async () => {
    await cenario();
    const a = await anexo4(prisma, { exercicio: 2026, bimestre: 3 });
    const rec = (f: typeof a.capitalizacao, k: string) => f.receitas.find((l) => l.chave === k)!;
    const desp = (ls: readonly { chave: string }[], k: string) => ls.find((l) => l.chave === k) as (typeof a.capitalizacao.despesas)[number];

    expect(rec(a.capitalizacao, "SEG_ATIVO")).toMatchObject({ previsaoAtualizada: "120000.00", realizadaAteBimestre: "50000.00" });
    expect(rec(a.capitalizacao, "PAT_ATIVO")).toMatchObject({ previsaoAtualizada: "240000.00", realizadaAteBimestre: "100000.00" });
    expect(rec(a.capitalizacao, "MOBILIARIOS").realizadaAteBimestre).toBe("5000.00");
    expect(rec(a.capitalizacao, "COMPENSACAO").realizadaAteBimestre).toBe("3000.00");
    expect(rec(a.capitalizacao, "APORTES").realizadaAteBimestre).toBe("40000.00");
    expect(rec(a.capitalizacao, "TOTAL")).toMatchObject({ previsaoAtualizada: "360000.00", realizadaAteBimestre: "158000.00" });
    expect(rec(a.reparticao, "SEG_ATIVO").realizadaAteBimestre).toBe("7000.00");

    expect(desp(a.capitalizacao.despesas, "APOSENTADORIAS")).toMatchObject({ dotacaoAtualizada: "120000.00", empenhadaAteBimestre: "12000.00", liquidadaAteBimestre: "12000.00", pagaAteBimestre: "10000.00" });
    expect(desp(a.capitalizacao.despesas, "DEMAIS")).toMatchObject({ dotacaoAtualizada: "5000.00", liquidadaAteBimestre: "1500.00" });
    expect(desp(a.capitalizacao.despesas, "TOTAL").liquidadaAteBimestre).toBe("13500.00");
    expect(a.capitalizacao.resultado.executado).toBe("144500.00");
    // a reserva do RPPS (999999 na fonte 800) é a reserva orçamentária, e não despesa previdenciária
    expect(a.capitalizacao.reservaOrcamentaria).toBe("7000.00");
    expect(desp(a.capitalizacao.despesas, "TOTAL").dotacaoAtualizada).toBe("125000.00"); // 100.000 + 20.000 + 5.000
    expect(desp(a.reparticao.despesas, "PENSOES")).toMatchObject({ dotacaoAtualizada: "50000.00", empenhadaAteBimestre: "4000.00", pagaAteBimestre: "4000.00" });
    expect(desp(a.administracao.despesas, "DEMAIS_CORRENTES")).toMatchObject({ dotacaoAtualizada: "10000.00", pagaAteBimestre: "900.00" });
    // a ficha F (fonte 500, sem código de acompanhamento) não aparece em quadro nenhum
    const totalGeral = [desp(a.capitalizacao.despesas, "TOTAL"), desp(a.reparticao.despesas, "TOTAL"), desp(a.administracao.despesas, "ADM_TOTAL")]
      .reduce((s, l) => toMoney(s.plus(l.empenhadaAteBimestre)), toMoney("0.00"));
    expect(totalGeral.toFixed(2)).toBe("18400.00"); // 12.000 + 1.500 + 4.000 + 900; os 3.000 da ficha F ficam fora
    expect(a.notas.some((n) => n.includes("sem subelemento") && n.includes("1 empenho"))).toBe(true);
  });
});
