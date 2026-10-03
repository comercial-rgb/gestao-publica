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
  projetar,
  valorVigente,
} from "./proposta-orcamentaria.js";
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
