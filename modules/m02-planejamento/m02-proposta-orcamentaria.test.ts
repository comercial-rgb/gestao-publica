import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearRoteiroOrcamentario } from "../../test/roteiro-orcamentario.js";
import { toMoney, toPercentual } from "../../packages/contracts/index.js";
import { registrarMovimentoDotacao } from "../m05-despesa/dotacao-razao.js";
import { criarM02Deps } from "./adapter-prisma.js";
import { criarFicha } from "./servico.js";
import {
  ajustarLinhaDaProposta,
  detalharPropostaOrcamentaria,
  efetivarPropostaOrcamentaria,
  elaborarPropostaOrcamentaria,
  incluirFichaNaProposta,
  incluirReceitaNaProposta,
  linhasNoRecorte,
  previaDaImportacaoDaProposta,
  previaDoReajusteDaProposta,
  projetar,
  reajustarLinhasDaProposta,
  realocarNaProposta,
  realocarValores,
  resumirLadoDaImportacao,
  valorVigente,
} from "./proposta-orcamentaria.js";
import { compararExercicios } from "./comparacao-de-exercicios.js";
import { conferirProposta, levantarFatosDoPlanejamento } from "./conferencia-da-proposta.js";
import {
  CLASSIFICACAO_VALIDA,
  SEED_ACOES,
  SEED_COS,
  SEED_FONTES,
  SEED_FUNCOES,
  SEED_NATUREZAS_DESPESA,
  SEED_ORGAOS,
  SEED_PROGRAMAS,
  SEED_SUBFUNCOES,
  SEED_UNIDADES,
} from "./seed-minimo.js";

/**
 * V29 — A PROPOSTA ORÇAMENTÁRIA DO EXERCÍCIO SEGUINTE: importar 2026, alterar, efetivar 2027.
 *
 * Fixture N=2 nos dois lados: duas receitas previstas (fontes diferentes, uma com reprevisão) e
 * duas fichas em unidades orçamentárias DIFERENTES (é o que a autorização por unidade precisa
 * para não passar por vacuidade). Toda recusa afirma o MOTIVO e que nada foi gravado.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const ADMIN = "m02@cg.pb.gov.br";

const NATUREZAS_RECEITA = [
  { id: "nr-a", codigo: "11125001", descricao: "Imposto sobre a Propriedade Predial e Territorial Urbana" },
  { id: "nr-b", codigo: "17515001", descricao: "Transferências do FUNDEB" },
] as const;

let fichaUm = "";
let fichaDois = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearRoteiroOrcamentario(prisma);
  await prisma.exercicio.create({ data: { ano: 2026, criadoPor: "TESTE" } });
  await prisma.orgao.createMany({ data: [...SEED_ORGAOS] });
  await prisma.unidadeOrcamentaria.createMany({
    data: [...SEED_UNIDADES, { id: "uo-02", codigo: "01002", descricao: "Secretaria de Saúde", orgaoId: "org-01" }],
  });
  await prisma.funcao.createMany({ data: [...SEED_FUNCOES] });
  await prisma.subfuncao.createMany({ data: [...SEED_SUBFUNCOES] });
  await prisma.programa.createMany({ data: [...SEED_PROGRAMAS] });
  await prisma.acao.createMany({ data: [...SEED_ACOES] });
  await prisma.naturezaDespesa.createMany({ data: [...SEED_NATUREZAS_DESPESA] });
  await prisma.fonteRecurso.createMany({ data: [...SEED_FONTES] });
  await prisma.codigoAcompanhamento.createMany({ data: [...SEED_COS] });
  await prisma.naturezaReceita.createMany({ data: [...NATUREZAS_RECEITA] });

  const deps = criarM02Deps(prisma);
  fichaUm = await criarFicha(
    { exercicio: 2026, numero: 1, classificacao: { ...CLASSIFICACAO_VALIDA }, exercicioFonte: 1, valorDotado: "1000000.00", criadoPor: ADMIN },
    deps
  );
  fichaDois = await criarFicha(
    {
      exercicio: 2026,
      numero: 7,
      classificacao: { ...CLASSIFICACAO_VALIDA, unidadeOrc: "01002", fonte: "540" },
      exercicioFonte: 1,
      valorDotado: "400000.00",
      criadoPor: ADMIN,
    },
    deps
  );
  // Empenho na ficha 1 (o empenho não tem perna própria aqui: quem lança é o `empenhar()`).
  await registrarMovimentoDotacao(prisma, {
    fichaId: fichaUm,
    tipo: "EMPENHO",
    valor: "300000.00",
    origemTipo: "TESTE",
    criadoPor: ADMIN,
    data: new Date("2026-03-10T15:00:00Z"),
  });

  await prisma.receitaPrevista.createMany({
    data: [
      { exercicio: 2026, naturezaReceitaId: "nr-a", fonteId: "fnt-500", exercicioFonte: 1, tipoReceita: "ORCAMENTARIA", valorPrevisto: "2000000.00" },
      { exercicio: 2026, naturezaReceitaId: "nr-b", fonteId: "fnt-540", exercicioFonte: 1, tipoReceita: "ORCAMENTARIA", valorPrevisto: "800000.00" },
    ],
  });
  // Reprevisão só na natureza A (LRF art. 12): a base ATUALIZADA tem de pegá-la, e só nela.
  await prisma.receitaReprevista.create({
    data: {
      exercicio: 2026,
      naturezaCodigo: "11125001",
      fonteCodigo: "500",
      tipoReceita: "ORCAMENTARIA",
      valorAjuste: "100000.00",
      motivo: "Reestimativa do IPTU",
      data: new Date("2026-05-15T15:00:00Z"),
      criadoPor: ADMIN,
    },
  });
}

async function elaborarPadrao(por = ADMIN): Promise<string> {
  const r = await elaborarPropostaOrcamentaria(prisma, {
    exercicio: 2027,
    exercicioDeOrigem: 2026,
    descricao: "Proposta inicial 2027",
    baseDaReceita: "PREVISAO_ATUALIZADA",
    percentualDaReceita: "10",
    baseDaDespesa: "EMPENHADO",
    percentualDaDespesa: "5",
    aproveitaReceitas: true,
    aproveitaFichas: true,
    reajustaProjetos: true,
    incluiFichasAbertasPorCredito: false,
    criadoPor: por,
  });
  return r.id;
}

/** Usuário FORA do censo das fixtures, com as ações dadas (globais ou numa unidade). */
async function usuarioCom(
  identificador: string,
  permissoes: readonly { readonly acao: "CADASTRAR_LOA" | "CRIAR_FICHA" | "CRIAR_RECEITA_PREVISTA"; readonly unidadeOrcId?: string }[]
): Promise<string> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "TESTE" }, select: { id: true } });
  const p = await prisma.perfil.create({
    data: {
      nome: `PERFIL-${identificador}`,
      descricao: "perfil restrito do teste",
      criadoPor: "TESTE",
      permissoes: { create: permissoes.map((x) => ({ acao: x.acao, unidadeOrcId: x.unidadeOrcId ?? null, criadoPor: "TESTE" })) },
    },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
  return identificador;
}

describe("V29 — a aritmética da proposta (pura)", () => {
  it("projeta base × (1 + percentual/100) em 2 casas, half-even", () => {
    // Valores conferidos à mão, não pela própria função.
    expect(projetar(toMoney("1000000.00"), toPercentual("4.5")).toFixed(2)).toBe("1045000.00");
    expect(projetar(toMoney("333.33"), toPercentual("10")).toFixed(2)).toBe("366.66"); // 366,663
    expect(projetar(toMoney("0.50"), toPercentual("5")).toFixed(2)).toBe("0.52"); // 0,525 -> par 0,52
    expect(projetar(toMoney("0.70"), toPercentual("5")).toFixed(2)).toBe("0.74"); // 0,735 -> par 0,74
    expect(projetar(toMoney("800000.00"), toPercentual("-2.5")).toFixed(2)).toBe("780000.00");
    expect(projetar(toMoney("123.45"), toPercentual("0")).toFixed(2)).toBe("123.45");
  });

  it("o vigente é o ajuste mais recente, chegue na ordem que chegar; sem ajuste, o projetado", () => {
    const projetado = toMoney("100.00");
    expect(valorVigente(projetado, []).toFixed(2)).toBe("100.00");
    const a1 = { id: "a", valor: toMoney("150.00"), criadoEm: new Date("2026-10-01T10:00:00Z") };
    const a2 = { id: "b", valor: toMoney("90.00"), criadoEm: new Date("2026-10-02T10:00:00Z") };
    expect(valorVigente(projetado, [a1, a2]).toFixed(2)).toBe("90.00");
    expect(valorVigente(projetado, [a2, a1]).toFixed(2)).toBe("90.00");
  });
});

describe("V29 — proposta orçamentária no banco", () => {
  beforeEach(async () => {
    await semear();
  }, 60_000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("IMPORTA as duas receitas e as duas fichas com a base e o percentual, sem criar ficha nem tocar o razão", async () => {
    const lancamentosAntes = await prisma.lancamentoContabil.count();
    const id = await elaborarPadrao();

    const p = await detalharPropostaOrcamentaria(prisma, id);
    expect(p).not.toBeNull();
    // Receita: A = (2.000.000 + 100.000 reprevistos) × 1,10; B = 800.000 × 1,10.
    expect(p!.receitas.map((r) => [r.naturezaCodigo, r.valorBase, r.valorProjetado])).toEqual([
      ["11125001", "2100000.00", "2310000.00"],
      ["17515001", "800000.00", "880000.00"],
    ]);
    // Despesa pelo EMPENHADO: ficha 1 = 300.000 × 1,05; ficha 7 sem empenho = 0.
    expect(p!.despesas.map((d) => [d.numero, d.unidadeCodigo, d.valorBase, d.valorProjetado])).toEqual([
      [1, "01001", "300000.00", "315000.00"],
      [7, "01002", "0.00", "0.00"],
    ]);
    expect(p!.totalDaReceita).toEqual({ lei: "2800000.00", base: "2900000.00", projetado: "3190000.00", vigente: "3190000.00" });
    // A coluna de comparação é a lei de origem, qualquer que seja a base.
    expect(p!.despesas.map((d) => d.valorNaLeiDeOrigem)).toEqual(["1000000.00", "400000.00"]);

    expect(await prisma.fichaOrcamentaria.count({ where: { exercicio: 2027 } })).toBe(0);
    expect(await prisma.receitaPrevista.count({ where: { exercicio: 2027 } })).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(lancamentosAntes);
  });

  it("a base INICIAL ignora a reprevisão e o empenho: lê o valor da LOA de origem", async () => {
    const r = await elaborarPropostaOrcamentaria(prisma, {
      exercicio: 2027,
      exercicioDeOrigem: 2026,
      descricao: "Pela LOA",
      baseDaReceita: "PREVISAO_INICIAL",
      percentualDaReceita: "0",
      baseDaDespesa: "DOTACAO_INICIAL",
      percentualDaDespesa: "0",
      aproveitaReceitas: true,
      aproveitaFichas: true,
      reajustaProjetos: true,
      incluiFichasAbertasPorCredito: false,
      criadoPor: ADMIN,
    });
    const p = await detalharPropostaOrcamentaria(prisma, r.id);
    expect(p!.receitas.map((x) => x.valorBase)).toEqual(["2000000.00", "800000.00"]);
    expect(p!.despesas.map((x) => x.valorBase)).toEqual(["1000000.00", "400000.00"]);
  });

  it("ALTERA por ajuste append-only: o último vale e o histórico fica", async () => {
    const id = await elaborarPadrao();
    const p0 = await detalharPropostaOrcamentaria(prisma, id);
    const linha7 = p0!.despesas.find((d) => d.numero === 7)!;

    await ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", linhaId: linha7.id, valor: "500000.00", motivo: "Nova unidade de saúde", criadoPor: ADMIN });
    await ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", linhaId: linha7.id, valor: "450000", motivo: "Corte pedido pela Fazenda", criadoPor: ADMIN });

    const p = await detalharPropostaOrcamentaria(prisma, id);
    const l = p!.despesas.find((d) => d.numero === 7)!;
    expect(l.valorProjetado).toBe("0.00");
    expect(l.valorVigente).toBe("450000.00");
    expect(l.ajustes.map((a) => [a.valor, a.motivo])).toEqual([
      ["450000.00", "Corte pedido pela Fazenda"],
      ["500000.00", "Nova unidade de saúde"],
    ]);
    expect(p!.totalDaDespesa.vigente).toBe("765000.00");
  });

  // ═══ V38 — LINHAS NOVAS E REAJUSTE EM LOTE (o que a contadora pediu: "puxar do anterior e só fazer as alterações") ═══

  it("V38 — INCLUI ficha e receita novas (N=2 cada): entram nos totais, depois das importadas; a repetida, o componente inexistente, o valor zero e a dedução são recusados com o motivo", async () => {
    const id = await elaborarPadrao();
    const antes = (await detalharPropostaOrcamentaria(prisma, id))!;
    await incluirFichaNaProposta(prisma, { propostaOrcamentariaId: id, classificacao: { ...CLASSIFICACAO_VALIDA, unidadeOrc: "01002", fonte: "500" }, valor: "50000.00", motivo: "Posto de saúde novo no distrito", criadoPor: ADMIN });
    await incluirFichaNaProposta(prisma, { propostaOrcamentariaId: id, classificacao: { ...CLASSIFICACAO_VALIDA, fonte: "540" }, valor: "20000.00", motivo: "Transporte escolar com recurso vinculado", criadoPor: ADMIN });
    await expect(incluirFichaNaProposta(prisma, { propostaOrcamentariaId: id, classificacao: { ...CLASSIFICACAO_VALIDA, unidadeOrc: "01002", fonte: "500" }, valor: "1.00", motivo: "Repetida de propósito", criadoPor: ADMIN })).rejects.toThrow(/já tem uma linha com esta classificação \(incluída nela\)/);
    // A classificação da ficha 1 importada também é recusada: a pessoa altera o valor dela.
    await expect(incluirFichaNaProposta(prisma, { propostaOrcamentariaId: id, classificacao: { ...CLASSIFICACAO_VALIDA }, valor: "1.00", motivo: "Repetida da importada", criadoPor: ADMIN })).rejects.toThrow(/a ficha 1 importada/);
    await expect(incluirFichaNaProposta(prisma, { propostaOrcamentariaId: id, classificacao: { ...CLASSIFICACAO_VALIDA, unidadeOrc: "09999" }, valor: "1.00", motivo: "Unidade que não existe", criadoPor: ADMIN })).rejects.toThrow(/inexistente.*unidade "09999"/);
    await expect(incluirFichaNaProposta(prisma, { propostaOrcamentariaId: id, classificacao: { ...CLASSIFICACAO_VALIDA, fonte: "540", unidadeOrc: "01002" }, valor: "0.00", motivo: "Valor zero de propósito", criadoPor: ADMIN })).rejects.toThrow(/maior que zero/);

    await incluirReceitaNaProposta(prisma, { propostaOrcamentariaId: id, naturezaReceita: "17515001", fonte: "500", tipoReceita: "ORCAMENTARIA", valor: "70000.00", motivo: "Transferência nova da União", criadoPor: ADMIN });
    await incluirReceitaNaProposta(prisma, { propostaOrcamentariaId: id, naturezaReceita: "1.1.1.2.5.0.01", fonte: "540", tipoReceita: "ORCAMENTARIA", valor: "30000.00", motivo: "IPTU vinculado", criadoPor: ADMIN });
    await expect(incluirReceitaNaProposta(prisma, { propostaOrcamentariaId: id, naturezaReceita: "11125001", fonte: "500", tipoReceita: "ORCAMENTARIA", valor: "1.00", motivo: "Repetida da importada", criadoPor: ADMIN })).rejects.toThrow(/já tem uma linha com esta natureza, fonte e tipo/);
    await expect(incluirReceitaNaProposta(prisma, { propostaOrcamentariaId: id, naturezaReceita: "17515001", fonte: "500", tipoReceita: "DEDUCAO", valor: "1.00", motivo: "Dedução de propósito", criadoPor: ADMIN })).rejects.toThrow(/dedução da receita não entra como linha nova/);

    const p = (await detalharPropostaOrcamentaria(prisma, id))!;
    expect(p.despesas.map((d) => [d.nova, d.numero, d.unidadeCodigo, d.fonteCodigo, d.valorVigente, d.motivo])).toEqual([
      [false, 1, "01001", "500", antes.despesas[0]!.valorVigente, null],
      [false, 7, "01002", "540", antes.despesas[1]!.valorVigente, null],
      [true, 0, "01002", "500", "50000.00", "Posto de saúde novo no distrito"],
      [true, 0, "01001", "540", "20000.00", "Transporte escolar com recurso vinculado"],
    ]);
    expect(p.receitas.filter((r) => r.nova).map((r) => [r.naturezaCodigo, r.fonteCodigo, r.valorVigente])).toEqual([["11125001", "540", "30000.00"], ["17515001", "500", "70000.00"]]);
    expect(p.totalDaDespesa.vigente).toBe(toMoney(antes.totalDaDespesa.vigente).plus("70000.00").toFixed(2));
    expect(p.totalDaReceita.vigente).toBe(toMoney(antes.totalDaReceita.vigente).plus("100000.00").toFixed(2));
    // A linha nova se altera como as outras.
    const nova = p.despesas.find((d) => d.nova && d.fonteCodigo === "540")!;
    await ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", linhaId: nova.id, valor: "25000.00", motivo: "Mais uma rota", criadoPor: ADMIN });
    expect((await detalharPropostaOrcamentaria(prisma, id))!.despesas.find((d) => d.id === nova.id)!.valorVigente).toBe("25000.00");
    // O banco barra o INSERT direto sem origem e sem classificação (e com as duas): o CHECK, não só o serviço.
    await expect(prisma.linhaDeDespesaDaProposta.create({ data: { propostaOrcamentariaId: id, valorNaLeiDeOrigem: "0.00", valorBase: "0.00", valorProjetado: "1.00" } })).rejects.toThrow(/ck_linha_de_despesa_da_proposta_origem_ou_nova/);
    await expect(prisma.linhaDeReceitaDaProposta.create({ data: { propostaOrcamentariaId: id, valorNaLeiDeOrigem: "0.00", valorBase: "0.00", valorProjetado: "1.00" } })).rejects.toThrow(/ck_linha_de_receita_da_proposta_origem_ou_nova/);
  });

  it("V38 — REAJUSTA em lote com recorte e prévia (N=2 lados): só as linhas do recorte mudam, e o ato grava o que a prévia mostrou", async () => {
    const id = await elaborarPadrao();
    const p0 = (await detalharPropostaOrcamentaria(prisma, id))!;
    const ficha7 = p0.despesas.find((d) => d.numero === 7)!;
    const ficha1 = p0.despesas.find((d) => d.numero === 1)!;
    // Só a fonte 540 (a ficha 7, que está zerada na base EMPENHADO): primeiro um valor, depois o reajuste.
    await ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", linhaId: ficha7.id, valor: "400000.00", motivo: "Partida da Saúde", criadoPor: ADMIN });
    const previa = await previaDoReajusteDaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", percentual: "10", recorte: { fonte: "540" } });
    expect(previa).toEqual({ linhas: 1, totalAntes: "400000.00", totalDepois: "440000.00" });
    const r = await reajustarLinhasDaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", percentual: "10", recorte: { fonte: "540" }, motivo: "Piso da saúde", criadoPor: ADMIN });
    expect(r).toEqual(previa);
    const p1 = (await detalharPropostaOrcamentaria(prisma, id))!;
    expect(p1.despesas.find((d) => d.numero === 7)!.valorVigente).toBe("440000.00");
    expect(p1.despesas.find((d) => d.numero === 7)!.ajustes[0]!.motivo).toBe("Piso da saúde (reajuste em lote de 10%)");
    expect(p1.despesas.find((d) => d.numero === 1)!.valorVigente).toBe(ficha1.valorVigente);

    // A receita, por prefixo da natureza (só o IPTU, 1112...), com percentual negativo.
    const iptu = p0.receitas.find((x) => x.naturezaCodigo === "11125001")!;
    const pr = await reajustarLinhasDaProposta(prisma, { propostaOrcamentariaId: id, lado: "RECEITA", percentual: "-5", recorte: { naturezaPrefixo: "1112" }, motivo: "Queda da arrecadação", criadoPor: ADMIN });
    expect(pr.linhas).toBe(1);
    expect(pr.totalDepois).toBe(projetar(toMoney(iptu.valorVigente), toPercentual("-5")).toFixed(2));
    const p2 = (await detalharPropostaOrcamentaria(prisma, id))!;
    expect(p2.receitas.find((x) => x.naturezaCodigo === "17515001")!.valorVigente).toBe(p0.receitas.find((x) => x.naturezaCodigo === "17515001")!.valorVigente);

    // Recorte sem linha: recusa, nada gravado.
    await expect(reajustarLinhasDaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", percentual: "3", recorte: { fonte: "999" }, motivo: "Fonte que não existe", criadoPor: ADMIN })).rejects.toThrow(/Nenhuma linha da proposta está no recorte/);
    expect(await prisma.ajusteDeDespesaDaProposta.count()).toBe(2);

    // O recorte é puro e cada critério restringe (E).
    const linhas = [
      { fonte: "500", unidade: "01001", natureza: "339039", tipoDaAcao: "ATIVIDADE", tipoReceita: "" },
      { fonte: "540", unidade: "01002", natureza: "449052", tipoDaAcao: "PROJETO", tipoReceita: "" },
    ];
    expect(linhasNoRecorte(linhas, {}).length).toBe(2);
    expect(linhasNoRecorte(linhas, { naturezaPrefixo: "4", tipoDaAcao: "PROJETO" }).map((l) => l.fonte)).toEqual(["540"]);
    expect(linhasNoRecorte(linhas, { naturezaPrefixo: "4", unidadeOrc: "01001" })).toEqual([]);
  });

  it("V38 — EFETIVA com linhas novas: a ficha nova recebe o número seguinte ao maior importado, a receita nova entra; 2026 fica intacto (somas e movimentos)", async () => {
    const id = await elaborarPadrao();
    const p0 = (await detalharPropostaOrcamentaria(prisma, id))!;
    await ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", linhaId: p0.despesas.find((d) => d.numero === 7)!.id, valor: "450000.00", motivo: "Partida da Saúde", criadoPor: ADMIN });
    await incluirFichaNaProposta(prisma, { propostaOrcamentariaId: id, classificacao: { ...CLASSIFICACAO_VALIDA, unidadeOrc: "01002", fonte: "500" }, valor: "50000.00", motivo: "Posto de saúde novo", criadoPor: ADMIN });
    await incluirFichaNaProposta(prisma, { propostaOrcamentariaId: id, classificacao: { ...CLASSIFICACAO_VALIDA, fonte: "540" }, valor: "20000.00", motivo: "Transporte escolar", criadoPor: ADMIN });
    await incluirReceitaNaProposta(prisma, { propostaOrcamentariaId: id, naturezaReceita: "17515001", fonte: "500", tipoReceita: "ORCAMENTARIA", valor: "70000.00", motivo: "Transferência nova", criadoPor: ADMIN });

    const de2026 = async () => ({
      fichas: await prisma.fichaOrcamentaria.aggregate({ where: { exercicio: 2026 }, _count: { _all: true }, _sum: { valorDotado: true } }),
      receitas: await prisma.receitaPrevista.aggregate({ where: { exercicio: 2026 }, _count: { _all: true }, _sum: { valorPrevisto: true } }),
      movimentos: await prisma.movimentoDotacao.aggregate({ where: { ficha: { exercicio: 2026 } }, _count: { _all: true }, _sum: { valor: true } }),
    });
    const antes = await de2026();
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: "TESTE" } });
    const r = await efetivarPropostaOrcamentaria(prisma, { propostaOrcamentariaId: id, criadoPor: ADMIN });
    expect([r.fichasCriadas, r.receitasCriadas]).toEqual([4, 3]);
    const fichas = await prisma.fichaOrcamentaria.findMany({ where: { exercicio: 2027 }, orderBy: { numero: "asc" }, select: { numero: true, valorDotado: true, unidadeOrc: { select: { codigo: true } }, fonte: { select: { codigo: true } } } });
    expect(fichas.map((f) => [f.numero, f.unidadeOrc.codigo, f.fonte.codigo, f.valorDotado.toFixed(2)])).toEqual([
      [1, "01001", "500", p0.despesas.find((d) => d.numero === 1)!.valorVigente],
      [7, "01002", "540", "450000.00"],
      [8, "01002", "500", "50000.00"],
      [9, "01001", "540", "20000.00"],
    ]);
    const receitas = await prisma.receitaPrevista.findMany({ where: { exercicio: 2027 }, select: { valorPrevisto: true, naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } } } });
    expect(receitas.map((x) => [x.naturezaReceita.codigo, x.fonte.codigo, x.valorPrevisto.toFixed(2)]).sort()).toEqual([
      ["11125001", "500", p0.receitas.find((x) => x.naturezaCodigo === "11125001")!.valorVigente],
      ["17515001", "500", "70000.00"],
      ["17515001", "540", p0.receitas.find((x) => x.naturezaCodigo === "17515001")!.valorVigente],
    ]);
    // A origem não muda: mesmas contagens e somas em 2026, inclusive os movimentos de dotação.
    expect(await de2026()).toEqual(antes);
    // Depois de gerado, a proposta não aceita linha nova.
    await expect(incluirFichaNaProposta(prisma, { propostaOrcamentariaId: id, classificacao: { ...CLASSIFICACAO_VALIDA, fonte: "540", unidadeOrc: "01002" }, valor: "1.00", motivo: "Tarde demais", criadoPor: ADMIN })).rejects.toThrow(/já foi efetivada/);
  });

  it("EFETIVA: cria as duas fichas e as receitas de 2027 com o valor vigente; linha zerada não entra", async () => {
    const id = await elaborarPadrao();
    const p0 = await detalharPropostaOrcamentaria(prisma, id);
    const linha7 = p0!.despesas.find((d) => d.numero === 7)!;
    const linhaB = p0!.receitas.find((r) => r.naturezaCodigo === "17515001")!;
    await ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", linhaId: linha7.id, valor: "450000.00", motivo: "Nova unidade de saúde", criadoPor: ADMIN });
    await ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "RECEITA", linhaId: linhaB.id, valor: "0", motivo: "Fonte extinta em 2027", criadoPor: ADMIN });

    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: "TESTE" } });
    const r = await efetivarPropostaOrcamentaria(prisma, { propostaOrcamentariaId: id, criadoPor: ADMIN });
    expect(r).toEqual({ exercicio: 2027, fichasCriadas: 2, receitasCriadas: 1 });

    const fichas = await prisma.fichaOrcamentaria.findMany({
      where: { exercicio: 2027 },
      orderBy: { numero: "asc" },
      select: { id: true, numero: true, unidadeOrcId: true, fonteId: true, valorDotado: true, saldoAutorizado: true },
    });
    expect(fichas.map((f) => [f.numero, f.unidadeOrcId, f.fonteId, f.valorDotado.toFixed(2), f.saldoAutorizado.toFixed(2)])).toEqual([
      [1, "uo-01", "fnt-500", "315000.00", "315000.00"],
      [7, "uo-02", "fnt-540", "450000.00", "450000.00"],
    ]);
    // A dotação nasce como na criação manual: um DOTACAO_INICIAL por ficha, em 1º de janeiro de 2027.
    const movs = await prisma.movimentoDotacao.findMany({
      where: { fichaId: { in: fichas.map((f) => f.id) } },
      select: { tipo: true, valor: true, competencia: true },
    });
    expect(movs).toHaveLength(2);
    expect(movs.every((m) => m.tipo === "DOTACAO_INICIAL")).toBe(true);
    expect(movs.every((m) => m.competencia.getUTCFullYear() === 2027 && m.competencia.getUTCMonth() === 0)).toBe(true);

    const receitas = await prisma.receitaPrevista.findMany({ where: { exercicio: 2027 }, select: { naturezaReceitaId: true, valorPrevisto: true } });
    expect(receitas.map((x) => [x.naturezaReceitaId, x.valorPrevisto.toFixed(2)])).toEqual([["nr-a", "2310000.00"]]);

    // A origem não mudou.
    expect(await prisma.fichaOrcamentaria.count({ where: { exercicio: 2026 } })).toBe(2);
    expect(await prisma.receitaPrevista.count({ where: { exercicio: 2026 } })).toBe(2);
  }, 60_000);

  it("RECUSA efetivar sem o exercício de destino aberto — e não grava nada", async () => {
    const id = await elaborarPadrao();
    await expect(efetivarPropostaOrcamentaria(prisma, { propostaOrcamentariaId: id, criadoPor: ADMIN })).rejects.toThrow(
      /Exercício 2027 não existe/
    );
    expect(await prisma.efetivacaoDaProposta.count()).toBe(0);
    expect(await prisma.receitaPrevista.count({ where: { exercicio: 2027 } })).toBe(0);
  });

  it("RECUSA efetivar duas vezes, ajustar depois de efetivada e importar de novo para o mesmo exercício", async () => {
    const id = await elaborarPadrao();
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: "TESTE" } });
    await efetivarPropostaOrcamentaria(prisma, { propostaOrcamentariaId: id, criadoPor: ADMIN });

    await expect(efetivarPropostaOrcamentaria(prisma, { propostaOrcamentariaId: id, criadoPor: ADMIN })).rejects.toThrow(/já foi efetivada/);
    const p = await detalharPropostaOrcamentaria(prisma, id);
    await expect(
      ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", linhaId: p!.despesas[0]!.id, valor: "1", motivo: "depois do fato", criadoPor: ADMIN })
    ).rejects.toThrow(/já foi efetivada/);
    await expect(elaborarPadrao()).rejects.toThrow(/O orçamento de 2027 já foi gerado/);
    // Sem ajuste, a ficha 7 (empenhado 0 em 2026) projeta 0 e não entra: só a ficha 1 nasceu.
    expect(await prisma.fichaOrcamentaria.count({ where: { exercicio: 2027 } })).toBe(1);
  }, 60_000);

  it("RECUSA efetivar quando o destino já tem ficha cadastrada à mão — nomeando a contagem", async () => {
    const id = await elaborarPadrao();
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: "TESTE" } });
    await criarFicha(
      { exercicio: 2027, numero: 99, classificacao: { ...CLASSIFICACAO_VALIDA }, exercicioFonte: 1, valorDotado: "10.00", criadoPor: ADMIN },
      criarM02Deps(prisma)
    );
    await expect(efetivarPropostaOrcamentaria(prisma, { propostaOrcamentariaId: id, criadoPor: ADMIN })).rejects.toThrow(
      /já tem 1 ficha\(s\) e 0 receita\(s\) prevista\(s\)/
    );
    expect(await prisma.efetivacaoDaProposta.count()).toBe(0);
    expect(await prisma.receitaPrevista.count({ where: { exercicio: 2027 } })).toBe(0);
  });

  it("RECUSA ajustar linha de outra proposta", async () => {
    const a = await elaborarPadrao();
    const b = await elaborarPadrao();
    const pb = await detalharPropostaOrcamentaria(prisma, b);
    await expect(
      ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: a, lado: "RECEITA", linhaId: pb!.receitas[0]!.id, valor: "1", motivo: "linha alheia", criadoPor: ADMIN })
    ).rejects.toThrow(/não pertence a esta proposta/);
    expect(await prisma.ajusteDeReceitaDaProposta.count()).toBe(0);
  });

  it("RECUSA valor no formato de tela no domínio (a conversão é da tela) — e não grava", async () => {
    const id = await elaborarPadrao();
    const p = await detalharPropostaOrcamentaria(prisma, id);
    await expect(
      ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "RECEITA", linhaId: p!.receitas[0]!.id, valor: "1.250.000,00", motivo: "formato de tela", criadoPor: ADMIN })
    ).rejects.toThrow(/com até duas casas/);
    expect(await prisma.ajusteDeReceitaDaProposta.count()).toBe(0);
  });

  it("AUTORIZAÇÃO: sem CADASTRAR_LOA não importa — e o motivo é a ação", async () => {
    const quem = await usuarioCom("so-ficha@teste.local", [{ acao: "CRIAR_FICHA" }]);
    await expect(elaborarPadrao(quem)).rejects.toThrow(/nenhum dos perfis dele concede CADASTRAR_LOA/);
    expect(await prisma.propostaOrcamentaria.count()).toBe(0);
  });

  it("AUTORIZAÇÃO: quem cria ficha só na Educação não gera o orçamento que também cria ficha na Saúde", async () => {
    const quem = await usuarioCom("so-educacao@teste.local", [
      { acao: "CADASTRAR_LOA" },
      { acao: "CRIAR_RECEITA_PREVISTA" },
      { acao: "CRIAR_FICHA", unidadeOrcId: "uo-01" },
    ]);
    const id = await elaborarPadrao(quem);
    const p0 = await detalharPropostaOrcamentaria(prisma, id);
    await ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", linhaId: p0!.despesas.find((d) => d.numero === 7)!.id, valor: "10.00", motivo: "linha da Saúde com valor", criadoPor: quem });
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: "TESTE" } });

    await expect(efetivarPropostaOrcamentaria(prisma, { propostaOrcamentariaId: id, criadoPor: quem })).rejects.toThrow(
      /O ESCOPO — ele TEM a ação CRIAR_FICHA, mas só em: uo-01/
    );
    expect(await prisma.fichaOrcamentaria.count({ where: { exercicio: 2027 } })).toBe(0);
    expect(await prisma.receitaPrevista.count({ where: { exercicio: 2027 } })).toBe(0);

    // O PAR POSITIVO, sobre o mesmo cenário: com a Saúde no escopo, a mesma efetivação passa.
    const perfil = await prisma.perfil.findFirstOrThrow({ where: { nome: `PERFIL-${quem}` }, select: { id: true } });
    await prisma.permissaoDePerfil.create({ data: { perfilId: perfil.id, acao: "CRIAR_FICHA", unidadeOrcId: "uo-02", criadoPor: "TESTE" } });
    const r = await efetivarPropostaOrcamentaria(prisma, { propostaOrcamentariaId: id, criadoPor: quem });
    expect(r.fichasCriadas).toBe(2);
  }, 60_000);
  it("AUTORIZAÇÃO: quem cria ficha mas não prevê receita não gera o orçamento com receita — e o motivo é essa ação", async () => {
    const quem = await usuarioCom("sem-receita@teste.local", [{ acao: "CADASTRAR_LOA" }, { acao: "CRIAR_FICHA" }]);
    const id = await elaborarPadrao(quem);
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: "TESTE" } });
    await expect(efetivarPropostaOrcamentaria(prisma, { propostaOrcamentariaId: id, criadoPor: quem })).rejects.toThrow(
      /nenhum dos perfis dele concede CRIAR_RECEITA_PREVISTA/
    );
    expect(await prisma.fichaOrcamentaria.count({ where: { exercicio: 2027 } })).toBe(0);
    expect(await prisma.receitaPrevista.count({ where: { exercicio: 2027 } })).toBe(0);
    expect(await prisma.efetivacaoDaProposta.count()).toBe(0);
  }, 60_000);

  it("AUTORIZAÇÃO: sem CADASTRAR_LOA não altera linha — e o motivo é a ação", async () => {
    const id = await elaborarPadrao();
    const p = await detalharPropostaOrcamentaria(prisma, id);
    const quem = await usuarioCom("so-receita@teste.local", [{ acao: "CRIAR_RECEITA_PREVISTA" }]);
    await expect(
      ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "RECEITA", linhaId: p!.receitas[0]!.id, valor: "1.00", motivo: "sem poder", criadoPor: quem })
    ).rejects.toThrow(/nenhum dos perfis dele concede CADASTRAR_LOA/);
    expect(await prisma.ajusteDeReceitaDaProposta.count()).toBe(0);
  });

  it("a DEDUÇÃO entra no total com sinal negativo: a receita da proposta é a líquida", async () => {
    await prisma.receitaPrevista.create({
      data: { exercicio: 2026, naturezaReceitaId: "nr-b", fonteId: "fnt-540", exercicioFonte: 1, tipoReceita: "DEDUCAO", valorPrevisto: "160000.00" },
    });
    const r = await elaborarPropostaOrcamentaria(prisma, {
      exercicio: 2027,
      exercicioDeOrigem: 2026,
      descricao: "Com dedução",
      aproveitaReceitas: true,
      aproveitaFichas: false,
      baseDaReceita: "PREVISAO_INICIAL",
      percentualDaReceita: "0",
      baseDaDespesa: "DOTACAO_INICIAL",
      percentualDaDespesa: "0",
      reajustaProjetos: true,
      incluiFichasAbertasPorCredito: false,
      criadoPor: ADMIN,
    });
    const p = await detalharPropostaOrcamentaria(prisma, r.id);
    // Bruta 2.000.000 + 800.000; dedução 160.000; líquida 2.640.000.
    expect(p!.receitaBruta.vigente).toBe("2800000.00");
    expect(p!.deducoesDaReceita.vigente).toBe("160000.00");
    expect(p!.totalDaReceita.vigente).toBe("2640000.00");
    // Só receitas: nenhuma ficha importada.
    expect(p!.despesas).toHaveLength(0);
    expect(r.linhasDeDespesa).toBe(0);
  });

  it("PROJETO sem reajuste quando pedido; ficha de EXERCÍCIO ANTERIOR fica de fora por padrão e entra quando pedida", async () => {
    await prisma.acao.create({ data: { id: "aca-1001", codigo: "1001", descricao: "Construção de escola", tipo: "PROJETO" } });
    const deps = criarM02Deps(prisma);
    await criarFicha(
      { exercicio: 2026, numero: 9, classificacao: { ...CLASSIFICACAO_VALIDA, acao: "1001" }, exercicioFonte: 1, valorDotado: "200000.00", criadoPor: ADMIN },
      deps
    );
    await criarFicha(
      { exercicio: 2026, numero: 12, classificacao: { ...CLASSIFICACAO_VALIDA, unidadeOrc: "01002" }, exercicioFonte: 2, valorDotado: "50000.00", criadoPor: ADMIN },
      deps
    );
    const base = {
      exercicio: 2027,
      exercicioDeOrigem: 2026,
      descricao: "Projetos",
      aproveitaReceitas: false,
      aproveitaFichas: true,
      baseDaReceita: "PREVISAO_INICIAL" as const,
      percentualDaReceita: "0",
      baseDaDespesa: "DOTACAO_INICIAL" as const,
      percentualDaDespesa: "10",
      reajustaProjetos: false,
      criadoPor: ADMIN,
    };
    const sem = await elaborarPropostaOrcamentaria(prisma, { ...base, incluiFichasAbertasPorCredito: false });
    expect(sem.fichasAbertasPorCreditoDeixadas).toBe(1);
    const ps = await detalharPropostaOrcamentaria(prisma, sem.id);
    expect(ps!.receitas).toHaveLength(0);
    expect(ps!.despesas.map((d) => [d.numero, d.valorProjetado])).toEqual([
      [1, "1100000.00"], // atividade: +10 %
      [7, "440000.00"],
      [9, "200000.00"], // projeto: sem reajuste
    ]);
    const com = await elaborarPropostaOrcamentaria(prisma, { ...base, incluiFichasAbertasPorCredito: true });
    const pc = await detalharPropostaOrcamentaria(prisma, com.id);
    expect(pc!.despesas.map((d) => d.numero)).toEqual([1, 7, 9, 12]);
  }, 60_000);

  it("SÓ A ESTRUTURA: as linhas vêm com valor zero, e a lei de origem fica na comparação", async () => {
    const r = await elaborarPropostaOrcamentaria(prisma, {
      exercicio: 2027,
      exercicioDeOrigem: 2026,
      descricao: "Estrutura",
      aproveitaReceitas: true,
      aproveitaFichas: true,
      baseDaReceita: "SEM_VALOR",
      percentualDaReceita: "10",
      baseDaDespesa: "SEM_VALOR",
      percentualDaDespesa: "10",
      reajustaProjetos: true,
      incluiFichasAbertasPorCredito: false,
      criadoPor: ADMIN,
    });
    const p = await detalharPropostaOrcamentaria(prisma, r.id);
    expect(p!.totalDaReceita).toEqual({ lei: "2800000.00", base: "0.00", projetado: "0.00", vigente: "0.00" });
    expect(p!.totalDaDespesa).toEqual({ lei: "1400000.00", base: "0.00", projetado: "0.00", vigente: "0.00" });
  });

  // ═══ V38 3ª leva — a PRÉVIA DA IMPORTAÇÃO (AUD-103) e a REALOCAÇÃO com o total preservado (AUD-113) ═══

  it("V38 — PRÉVIA DA IMPORTAÇÃO: diz o que vem, o que fica de fora, o que vai sem reajuste e o que pede complemento; não grava; e o ato grava o que ela mostrou", async () => {
    await prisma.acao.create({ data: { id: "aca-1001", codigo: "1001", descricao: "Construção de escola", tipo: "PROJETO" } });
    const deps = criarM02Deps(prisma);
    await criarFicha({ exercicio: 2026, numero: 9, classificacao: { ...CLASSIFICACAO_VALIDA, acao: "1001" }, exercicioFonte: 1, valorDotado: "200000.00", criadoPor: ADMIN }, deps);
    await criarFicha({ exercicio: 2026, numero: 12, classificacao: { ...CLASSIFICACAO_VALIDA, unidadeOrc: "01002" }, exercicioFonte: 2, valorDotado: "50000.00", criadoPor: ADMIN }, deps);
    // N=2 deduções: uma SEM o tipo da dedução (no exercício novo, vai pedir complemento) e uma COM o tipo (não conta).
    await prisma.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId: "nr-b", fonteId: "fnt-500", exercicioFonte: 1, tipoReceita: "DEDUCAO", valorPrevisto: "100000.00" } });
    const comTipo = await prisma.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId: "nr-a", fonteId: "fnt-540", exercicioFonte: 1, tipoReceita: "DEDUCAO", valorPrevisto: "60000.00" }, select: { id: true } });
    await prisma.detalheDaReceitaPrevista.create({ data: { receitaPrevistaId: comTipo.id, tipoDeducaoSagres: "5", documento: "LOA (fixture)", criadoPor: ADMIN } });
    const escolhas = {
      exercicio: 2027,
      exercicioDeOrigem: 2026,
      aproveitaReceitas: true,
      aproveitaFichas: true,
      baseDaReceita: "PREVISAO_INICIAL" as const,
      percentualDaReceita: "10",
      baseDaDespesa: "DOTACAO_INICIAL" as const,
      percentualDaDespesa: "10",
      reajustaProjetos: false,
      incluiFichasAbertasPorCredito: false,
    };
    const previa = await previaDaImportacaoDaProposta(prisma, escolhas);
    // Valores conferidos à mão: fichas 1 (1.000.000, +10 %), 7 (400.000, +10 %), 9 (projeto 200.000, sem reajuste); a 12
    // (recurso de exercício anterior) fica de fora. Receitas líquidas: 2.000.000 + 800.000 − 100.000 − 60.000, +10 %.
    expect(previa).toEqual({
      exercicio: 2027,
      exercicioDeOrigem: 2026,
      recusa: null,
      receitas: { linhas: 4, naOrigem: 4, lei: "2640000.00", partida: "2640000.00", comReajuste: "2904000.00", semValor: 0, deducoesSemTipo: 1 },
      fichas: { linhas: 3, naOrigem: 4, lei: "1600000.00", partida: "1600000.00", comReajuste: "1740000.00", semValor: 0, deixadasDeFora: 1, semReajuste: 1 },
    });
    // A prévia não grava.
    expect(await prisma.propostaOrcamentaria.count()).toBe(0);

    // O ato grava o que a prévia mostrou: as mesmas contagens e os mesmos totais.
    const r = await elaborarPropostaOrcamentaria(prisma, { ...escolhas, descricao: "Conferida pela prévia", criadoPor: ADMIN });
    const p = (await detalharPropostaOrcamentaria(prisma, r.id))!;
    expect([p.receitas.length, p.despesas.length, r.fichasAbertasPorCreditoDeixadas]).toEqual([previa.receitas.linhas, previa.fichas.linhas, previa.fichas.deixadasDeFora]);
    expect([p.totalDaReceita.lei, p.totalDaReceita.projetado]).toEqual([previa.receitas.lei, previa.receitas.comReajuste]);
    expect([p.totalDaDespesa.lei, p.totalDaDespesa.projetado]).toEqual([previa.fichas.lei, previa.fichas.comReajuste]);
    // E o "o que veio e o que não veio" da página lê a origem de hoje.
    expect(p.naOrigem).toEqual({ fichas: 4, receitas: 4 });

    // Só a estrutura: tudo chega sem valor, e a prévia diz quantas linhas pedem valor.
    const estrutura = await previaDaImportacaoDaProposta(prisma, { ...escolhas, baseDaReceita: "SEM_VALOR", baseDaDespesa: "SEM_VALOR" });
    expect([estrutura.receitas.semValor, estrutura.fichas.semValor, estrutura.fichas.comReajuste]).toEqual([4, 3, "0.00"]);

    // Recusa antecipada com o motivo do ato: nada a aproveitar em 2025.
    const vazia = await previaDaImportacaoDaProposta(prisma, { ...escolhas, exercicio: 2026, exercicioDeOrigem: 2025, aproveitaFichas: false });
    expect(vazia.recusa).toBe("O exercício 2025 não tem receita prevista a aproveitar.");
    // Escolha inválida: o motivo, e nada gravado.
    await expect(previaDaImportacaoDaProposta(prisma, { ...escolhas, exercicio: 2026 })).rejects.toThrow(/tem de ser posterior/);
    expect(await prisma.propostaOrcamentaria.count()).toBe(1);
  }, 60_000);

  it("V38 — o resumo da prévia é puro (N=2): soma lei, partida e reajuste; a dedução subtrai; conta a linha sem valor", () => {
    const m = (v: string) => toMoney(v);
    expect(
      resumirLadoDaImportacao([
        { valorNaLei: m("100.00"), valor: m("90.00"), projetado: m("99.00") },
        { valorNaLei: m("50.00"), valor: m("0.00"), projetado: m("0.00") },
      ])
    ).toEqual({ linhas: 2, lei: "150.00", partida: "90.00", comReajuste: "99.00", semValor: 1 });
    expect(
      resumirLadoDaImportacao([
        { valorNaLei: m("100.00"), valor: m("100.00"), projetado: m("110.00"), tipoReceita: "ORCAMENTARIA" },
        { valorNaLei: m("20.00"), valor: m("20.00"), projetado: m("22.00"), tipoReceita: "DEDUCAO" },
      ])
    ).toEqual({ linhas: 2, lei: "80.00", partida: "80.00", comReajuste: "88.00", semValor: 0 });
  });

  it("V38 — REALOCA entre fichas (N=2) com o total preservado e o histórico nas duas; recusa passar do valor da origem, a mesma linha e linha de outra proposta, com o motivo", async () => {
    const id = await elaborarPadrao();
    const p0 = (await detalharPropostaOrcamentaria(prisma, id))!;
    const ficha1 = p0.despesas.find((d) => d.numero === 1)!;
    const ficha7 = p0.despesas.find((d) => d.numero === 7)!;
    // Base EMPENHADO com 5 %: a ficha 1 parte de 300.000 e vai a 315.000; a 7 parte de zero.
    expect([ficha1.valorVigente, ficha7.valorVigente, p0.totalDaDespesa.vigente]).toEqual(["315000.00", "0.00", "315000.00"]);

    const r = await realocarNaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", deLinhaId: ficha1.id, paraLinhaId: ficha7.id, valor: "15000.00", motivo: "Saúde precisa de partida", criadoPor: ADMIN });
    expect(r).toEqual({
      de: { rotulo: "ficha 1", antes: "315000.00", depois: "300000.00" },
      para: { rotulo: "ficha 7", antes: "0.00", depois: "15000.00" },
      totalAntes: "315000.00",
      totalDepois: "315000.00",
    });
    const p1 = (await detalharPropostaOrcamentaria(prisma, id))!;
    expect(p1.despesas.find((d) => d.numero === 1)!.valorVigente).toBe("300000.00");
    expect(p1.despesas.find((d) => d.numero === 7)!.valorVigente).toBe("15000.00");
    expect(p1.totalDaDespesa.vigente).toBe(p0.totalDaDespesa.vigente);
    expect(p1.despesas.find((d) => d.numero === 1)!.ajustes[0]!.motivo).toBe("Saúde precisa de partida (realocação: 15000.00 para ficha 7)");
    expect(p1.despesas.find((d) => d.numero === 7)!.ajustes[0]!.motivo).toBe("Saúde precisa de partida (realocação: 15000.00 vindos de ficha 1)");

    // Tirar exatamente tudo vale (a origem fica com zero); um centavo a mais, não.
    await realocarNaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", deLinhaId: ficha7.id, paraLinhaId: ficha1.id, valor: "15000.00", motivo: "Devolve tudo", criadoPor: ADMIN });
    await expect(
      realocarNaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", deLinhaId: ficha7.id, paraLinhaId: ficha1.id, valor: "0.01", motivo: "Um centavo", criadoPor: ADMIN })
    ).rejects.toThrow("O valor a realocar (0.01) passa do valor da linha de origem na proposta (0.00). Nada foi gravado.");
    expect(await prisma.ajusteDeDespesaDaProposta.count()).toBe(4);

    await expect(
      realocarNaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", deLinhaId: ficha1.id, paraLinhaId: ficha1.id, valor: "1.00", motivo: "Mesma linha", criadoPor: ADMIN })
    ).rejects.toThrow(/são a mesma: escolha duas linhas diferentes/);
    const outra = await elaborarPadrao();
    const daOutra = (await detalharPropostaOrcamentaria(prisma, outra))!.despesas[0]!;
    await expect(
      realocarNaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", deLinhaId: ficha1.id, paraLinhaId: daOutra.id, valor: "1.00", motivo: "Outra proposta", criadoPor: ADMIN })
    ).rejects.toThrow("A linha de destino não pertence a esta proposta nas fichas. Nada foi gravado.");
    // Linha de receita no lado das fichas também não pertence.
    await expect(
      realocarNaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", deLinhaId: p0.receitas[0]!.id, paraLinhaId: ficha1.id, valor: "1.00", motivo: "Lado trocado", criadoPor: ADMIN })
    ).rejects.toThrow("A linha de origem não pertence a esta proposta nas fichas. Nada foi gravado.");
    expect(await prisma.ajusteDeDespesaDaProposta.count()).toBe(4);
  }, 60_000);

  it("V38 — REALOCA entre receitas mantendo a receita líquida; recusa entre dedução e receita (mudaria a líquida); sem CADASTRAR_LOA, recusa pela ação", async () => {
    await prisma.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId: "nr-b", fonteId: "fnt-500", exercicioFonte: 1, tipoReceita: "DEDUCAO", valorPrevisto: "100000.00" } });
    const id = await elaborarPadrao();
    const p0 = (await detalharPropostaOrcamentaria(prisma, id))!;
    const iptu = p0.receitas.find((x) => x.naturezaCodigo === "11125001")!;
    const fundeb = p0.receitas.find((x) => x.naturezaCodigo === "17515001" && x.tipoReceita === "ORCAMENTARIA")!;
    const deducao = p0.receitas.find((x) => x.tipoReceita === "DEDUCAO")!;

    const r = await realocarNaProposta(prisma, { propostaOrcamentariaId: id, lado: "RECEITA", deLinhaId: iptu.id, paraLinhaId: fundeb.id, valor: "10000.00", motivo: "Reestimativa entre fontes", criadoPor: ADMIN });
    expect(r.totalDepois).toBe(r.totalAntes);
    expect(r.totalAntes).toBe(p0.totalDaReceita.vigente);
    expect((await detalharPropostaOrcamentaria(prisma, id))!.totalDaReceita.vigente).toBe(p0.totalDaReceita.vigente);

    await expect(
      realocarNaProposta(prisma, { propostaOrcamentariaId: id, lado: "RECEITA", deLinhaId: iptu.id, paraLinhaId: deducao.id, valor: "1000.00", motivo: "Para a dedução", criadoPor: ADMIN })
    ).rejects.toThrow(/é dedução da receita e a outra não: realocar entre elas mudaria a receita líquida/);
    expect(await prisma.ajusteDeReceitaDaProposta.count()).toBe(2);

    const quem = await usuarioCom("so-ficha@teste.local", [{ acao: "CRIAR_FICHA" }]);
    await expect(
      realocarNaProposta(prisma, { propostaOrcamentariaId: id, lado: "RECEITA", deLinhaId: iptu.id, paraLinhaId: fundeb.id, valor: "1.00", motivo: "sem poder", criadoPor: quem })
    ).rejects.toThrow(/nenhum dos perfis dele concede CADASTRAR_LOA/);
    expect(await prisma.ajusteDeReceitaDaProposta.count()).toBe(2);
  }, 60_000);

  it("V38 — a realocação é pura: a soma não muda, e a origem não fica negativa", () => {
    const m = (v: string) => toMoney(v);
    const r = realocarValores(m("100.00"), m("50.00"), m("30.00"));
    expect([r.de.toFixed(2), r.para.toFixed(2)]).toEqual(["70.00", "80.00"]);
    const tudo = realocarValores(m("100.00"), m("0.00"), m("100.00"));
    expect([tudo.de.toFixed(2), tudo.para.toFixed(2)]).toEqual(["0.00", "100.00"]);
    expect(() => realocarValores(m("100.00"), m("0.00"), m("100.01"))).toThrow(/passa do valor da linha de origem na proposta \(100.00\)/);
  });

  it("RECUSA importar sem escolher o que aproveitar — e não grava", async () => {
    await expect(
      elaborarPropostaOrcamentaria(prisma, {
        exercicio: 2027,
        exercicioDeOrigem: 2026,
        descricao: "Nada",
        aproveitaReceitas: false,
        aproveitaFichas: false,
        baseDaReceita: "PREVISAO_INICIAL",
        percentualDaReceita: "0",
        baseDaDespesa: "DOTACAO_INICIAL",
        percentualDaDespesa: "0",
        reajustaProjetos: true,
        incluiFichasAbertasPorCredito: false,
        criadoPor: ADMIN,
      })
    ).rejects.toThrow(/Escolha o que aproveitar/);
    expect(await prisma.propostaOrcamentaria.count()).toBe(0);
  });
});

describe("V31 — a comparação de exercícios e a conferência da proposta, no banco", () => {
  beforeEach(async () => {
    await semear();
  }, 60_000);

  it("a comparação fecha com a proposta: a dotação autorizada de 2026 é a mesma que a proposta leu, e a linha que não virou receita aparece com zero", async () => {
    const id = await elaborarPadrao();
    const p0 = await detalharPropostaOrcamentaria(prisma, id);
    const linha7 = p0!.despesas.find((d) => d.numero === 7)!;
    const linhaB = p0!.receitas.find((r) => r.naturezaCodigo === "17515001")!;
    await ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "DESPESA", linhaId: linha7.id, valor: "450000.00", motivo: "Nova unidade", criadoPor: ADMIN });
    await ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: id, lado: "RECEITA", linhaId: linhaB.id, valor: "0", motivo: "Fonte extinta", criadoPor: ADMIN });
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: "TESTE" } });
    await efetivarPropostaOrcamentaria(prisma, { propostaOrcamentariaId: id, criadoPor: ADMIN });

    const lancamentosAntes = await prisma.lancamentoContabil.count();
    const d = await compararExercicios(prisma, { exercicioA: 2026, exercicioB: 2027, lado: "despesa", agrupamento: "unidade" });
    expect(d.linhas.map((l) => [l.chave, l.a.atualizado, l.a.executado, l.b.inicial, l.b.atualizado])).toEqual([
      ["01001", "1000000.00", "300000.00", "315000.00", "315000.00"],
      ["01002", "400000.00", "0.00", "450000.00", "450000.00"],
    ]);
    // O total de 2027 é o total vigente da proposta efetivada — a mesma verdade nas duas telas.
    expect(d.total.b.atualizado).toBe((await detalharPropostaOrcamentaria(prisma, id))!.totalDaDespesa.vigente);

    const r = await compararExercicios(prisma, { exercicioA: 2026, exercicioB: 2027, lado: "receita", agrupamento: "natureza" });
    expect(r.linhas.map((l) => [l.chave, l.a.inicial, l.a.atualizado, l.b.atualizado])).toEqual([
      ["11125001", "2000000.00", "2100000.00", "2310000.00"],
      ["17515001", "800000.00", "800000.00", "0.00"],
    ]);
    // Comparar não grava nada.
    expect(await prisma.lancamentoContabil.count()).toBe(lancamentosAntes);
  }, 60_000);

  it("a conferência lê a meta da LDO do PRÓPRIO exercício (N=2 anos na mesma LDO) e a prioridade sem valor", async () => {
    const id = await elaborarPadrao();
    const vazio = await levantarFatosDoPlanejamento(prisma, 2027);
    // Negação com motivo: sem LDO e sem PPA, os fatos dizem isso — não um "conforme" vazio.
    expect(vazio).toEqual({ metaDaLdo: { ldoRegistrada: false }, prioridadesDaLdo: [], plano: null });

    const metas = (ano: number, receita: string, despesa: string) => ({
      ano,
      receitaTotal: receita,
      receitaPrimaria: receita,
      despesaTotal: despesa,
      despesaPrimaria: despesa,
      resultadoNominal: "0",
      dividaPublicaConsolidada: "0",
      dividaConsolidadaLiquida: "0",
      receitaPrimariaPpp: "0",
      despesaPrimariaPpp: "0",
      impactoSaldoPpp: "0",
      criadoPor: "TESTE",
    });
    await prisma.leiDiretrizesOrcamentarias.create({
      data: {
        exercicio: 2027,
        inicioVigencia: new Date("2026-07-01T03:00:00Z"),
        fimVigencia: new Date("2027-12-31T03:00:00Z"),
        criadoPor: "TESTE",
        metasAnuais: { create: [metas(2027, "3190000.00", "315000.00"), metas(2028, "9.00", "9.00")] },
        prioridades: {
          create: [
            { acaoId: "aca-2001", descricaoAcao: "Ensino fundamental", produto: "aluno", unidadeMedida: "un", meta: "1", criadoPor: "TESTE" },
            { acaoId: null, descricaoAcao: "Ação ainda sem cadastro", produto: "x", unidadeMedida: "un", meta: "1", criadoPor: "TESTE" },
          ],
        },
      },
    });
    const fatos = await levantarFatosDoPlanejamento(prisma, 2027);
    expect(fatos.metaDaLdo).toEqual({ ldoRegistrada: true, meta: { receitaTotal: toMoney("3190000.00"), despesaTotal: toMoney("315000.00"), ajustes: 0 } });
    expect(fatos.prioridadesDaLdo).toEqual([
      { acaoCodigo: "2001", descricao: "Ensino fundamental" },
      { acaoCodigo: null, descricao: "Ação ainda sem cadastro" },
    ]);

    const c = conferirProposta((await detalharPropostaOrcamentaria(prisma, id))!, fatos);
    // Receita e despesa (pelo empenhado: 315.000) coincidem com a meta de 2027 — e não com a de 2028.
    expect(c.verificacoes.find((v) => v.codigo === "LDO")?.situacao).toBe("CONFORME");
    // A ação 2001 tem valor na proposta: a prioridade está atendida.
    expect(c.verificacoes.find((v) => v.codigo === "PRIORIDADES_DA_LDO")?.situacao).toBe("CONFORME");
    // Mas 3.190.000 de receita para 315.000 de despesa não é equilíbrio.
    expect(c.verificacoes.find((v) => v.codigo === "EQUILIBRIO")?.situacao).toBe("ATENCAO");
  }, 60_000);
});
