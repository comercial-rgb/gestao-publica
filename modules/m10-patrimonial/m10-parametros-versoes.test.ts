import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { definirParametroDeAtualizacao, parametroVigente, versoesDoParametro } from "./parametros.js";
import { atualizarCompetencia, preverCompetencia, registrarEntradaAvulsa, valorContabilDaClasse } from "./patrimonio.js";

/**
 * O PARÂMETRO DE ATUALIZAÇÃO VERSIONADO, A PRÉVIA E A MEMÓRIA (V3, pacote 2, unidade 3).
 *
 * Os literais são os do `m10-competencia.test.ts` t1 (base 12.000, residual 10%, vida 24 →
 * parcela 450,00) — a régua não mudou de lugar; ganhou versão, prévia e memória.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "patrimonio@cg.pb.gov.br";
/** Um perfil que só LÊ o patrimônio — é quem prova que definir parâmetro cobra crachá próprio. */
const LEITOR = "leitor.patrimonio@cg.pb.gov.br";
const CLASSE = "cl-veiculos";
const CLASSE_LEGADA = "cl-legada";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-imob", codigo: "1.2.3.1.1.01.00", nome: "Veículos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-dep-acum", codigo: "1.2.3.8.1.01.00", nome: "Depreciação acumulada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: "4.5.9.1.1.00.00", nome: "VPA incorporação", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd-dep", codigo: "3.3.3.1.1.00.00", nome: "VPD depreciação", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.classeDeBens.createMany({
    data: [
      { id: CLASSE, codigo: "1.2.3.1.1.01", descricao: "Veículos", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR },
      { id: CLASSE_LEGADA, codigo: "1.2.3.1.1.02", descricao: "Móveis (parâmetro de origem)", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR },
    ],
  });
  await prisma.roteiroPatrimonial.createMany({
    data: [
      { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "DEPRECIACAO", contaDebitoId: "c-vpd-dep", contaCreditoId: "c-dep-acum", criadoPor: POR },
    ],
  });
  for (const classeDeBensId of [CLASSE, CLASSE_LEGADA]) {
    await registrarEntradaAvulsa(prisma, {
      classeDeBensId, tipo: "AVALIACAO_INICIAL", valor: "12000.00",
      dataMovimento: new Date("2026-01-15T12:00:00Z"), motivo: "Avaliação inicial da fixture.", criadoPor: POR,
    });
  }
  // A classe LEGADA só tem a linha antiga — o caso da instalação que ainda não versionou.
  await prisma.parametroAtualizacaoClasse.create({
    data: { classeDeBensId: CLASSE_LEGADA, metodo: "DEPRECIACAO", vidaUtilMeses: 24, percentualResidual: "0.100000", criadoPor: POR },
  });
  // ⚠️ O perfil EXECUCAO da fixture tem TODAS as ações fora da administração — inclusive esta.
  // A negação se prova com um perfil que só consulta o patrimônio.
  const leitor = await prisma.perfil.create({
    data: { nome: "LEITOR_PATRIMONIO", descricao: "só consulta", criadoPor: POR, permissoes: { create: [{ acao: "CONSULTAR_PATRIMONIO", criadoPor: POR }] } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: LEITOR, nome: LEITOR, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: leitor.id, criadoPor: POR } });
}

const V1 = { classeDeBensId: CLASSE, metodo: "DEPRECIACAO" as const, vidaUtilMeses: 24, percentualResidual: "0.100000", motivo: "Vida útil de veículos conforme NBC TSP 07 e laudo da comissão.", criadoPor: POR };

describe("o parâmetro versionado, a prévia e a memória", () => {
  beforeEach(semear);

  it("t1: v1 vira o vigente; a prévia calcula 450,00 sem escrever; processar grava movimento + memória apontando para v1", async () => {
    expect(await parametroVigente(prisma, CLASSE)).toBeNull();
    const semParametro = await preverCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03" });
    expect(semParametro.situacao).toBe("SEM_PARAMETRO");
    expect(semParametro.recusa).toMatch(/NÃO TEM PARÂMETRO/);

    const v1 = await definirParametroDeAtualizacao(prisma, V1);
    expect(v1.numero).toBe(1);
    expect(await parametroVigente(prisma, CLASSE)).toMatchObject({ versaoId: v1.versaoId, numero: 1, vidaUtilMeses: 24, origem: "VERSAO", ativo: true });

    const movs = await prisma.movimentoPatrimonial.count();
    const lancs = await prisma.lancamentoContabil.count();
    const previa = await preverCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03" });
    expect(previa.situacao).toBe("PRONTA");
    expect(previa.tipo).toBe("DEPRECIACAO");
    expect(previa.base.toFixed(2)).toBe("12000.00");
    expect(previa.calculo?.valorResidual.toFixed(2)).toBe("1200.00");
    expect(previa.calculo?.parcelaCheia.toFixed(2)).toBe("450.00");
    expect(previa.calculo?.valorDaParcela.toFixed(2)).toBe("450.00");
    // a prévia NÃO escreve
    expect(await prisma.movimentoPatrimonial.count()).toBe(movs);
    expect(await prisma.lancamentoContabil.count()).toBe(lancs);
    expect(await prisma.memoriaDeAtualizacao.count()).toBe(0);

    const r = await atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03", criadoPor: POR });
    expect(r.valorDaParcela.toFixed(2)).toBe("450.00");
    expect(r.versaoDeParametroId).toBe(v1.versaoId);
    const memoria = await prisma.memoriaDeAtualizacao.findUniqueOrThrow({ where: { movimentoId: r.movimentoId } });
    expect(memoria.id).toBe(r.memoriaId);
    expect(memoria.versaoDeParametroId).toBe(v1.versaoId);
    expect(memoria.vidaUtilMeses).toBe(24);
    expect(memoria.percentualResidual.toFixed(6)).toBe("0.100000");
    expect(memoria.base.toFixed(2)).toBe("12000.00");
    expect(memoria.valorContabilAntes.toFixed(2)).toBe("12000.00");
    expect(memoria.valorResidual.toFixed(2)).toBe("1200.00");
    expect(memoria.parcelaCheia.toFixed(2)).toBe("450.00");
    expect(memoria.teto.toFixed(2)).toBe("10800.00");
    expect(memoria.valorDaParcela.toFixed(2)).toBe("450.00");
    expect((await valorContabilDaClasse(prisma, CLASSE)).toFixed(2)).toBe("11550.00");
    // e a prévia da MESMA competência agora diz "já processada", com o mesmo texto da recusa
    const depois = await preverCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03" });
    expect(depois.situacao).toBe("JA_ATUALIZADA");
    await expect(atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03", criadoPor: POR })).rejects.toThrow(depois.recusa ?? "x");
  });

  it("t2: v2 muda a régua para as competências SEGUINTES; a memória da anterior continua dizendo v1 (N=2 versões)", async () => {
    const v1 = await definirParametroDeAtualizacao(prisma, V1);
    const marco = await atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03", criadoPor: POR });
    const v2 = await definirParametroDeAtualizacao(prisma, { ...V1, vidaUtilMeses: 12, percentualResidual: "0.000000", motivo: "Revisão da vida útil pela comissão de 2026." });
    expect(v2.numero).toBe(2);
    expect((await parametroVigente(prisma, CLASSE))?.versaoId).toBe(v2.versaoId);

    // base 12.000 (bruto), contábil 11.550, residual 0 → parcela cheia 1.000, teto 11.550 → 1.000,00
    const abril = await atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-04", criadoPor: POR });
    expect(abril.valorDaParcela.toFixed(2)).toBe("1000.00");
    expect(abril.versaoDeParametroId).toBe(v2.versaoId);
    const memMarco = await prisma.memoriaDeAtualizacao.findUniqueOrThrow({ where: { movimentoId: marco.movimentoId } });
    expect(memMarco.versaoDeParametroId).toBe(v1.versaoId);
    expect(memMarco.vidaUtilMeses).toBe(24);

    const versoes = await versoesDoParametro(prisma, CLASSE);
    expect(versoes.map((v) => [v.numero, v.vigente, v.atualizacoes])).toEqual([[1, false, 1], [2, true, 1]]);
    expect(versoes[0]?.vigenciaFim?.getTime()).toBe(versoes[1]?.criadoEm.getTime());
    expect(versoes[1]?.vigenciaFim).toBeNull();
  });

  it("t3: versão idêntica à vigente recusa; regra inválida não nasce; concorrência não sobrescreve", async () => {
    await definirParametroDeAtualizacao(prisma, V1);
    await expect(definirParametroDeAtualizacao(prisma, { ...V1, motivo: "de novo, igual" })).rejects.toThrow(/VERSÃO IDÊNTICA À VIGENTE/);
    await expect(definirParametroDeAtualizacao(prisma, { ...V1, vidaUtilMeses: 0 })).rejects.toThrow(/Vida útil inválida/);
    await expect(definirParametroDeAtualizacao(prisma, { ...V1, percentualResidual: "1.000000" })).rejects.toThrow(/Percentual residual inválido/);
    expect(await prisma.versaoDeParametroDeAtualizacao.count({ where: { classeDeBensId: CLASSE } })).toBe(1);

    const corrida = await Promise.allSettled([
      definirParametroDeAtualizacao(prisma, { ...V1, vidaUtilMeses: 36, motivo: "proposta A da corrida" }),
      definirParametroDeAtualizacao(prisma, { ...V1, vidaUtilMeses: 48, motivo: "proposta B da corrida" }),
    ]);
    const ok = corrida.filter((r) => r.status === "fulfilled").length;
    for (const r of corrida) if (r.status === "rejected") expect(String(r.reason)).toMatch(/CONCORRÊNCIA|VERSÃO IDÊNTICA/);
    // o que entrou tem número próprio: nada foi sobrescrito
    const numeros = (await prisma.versaoDeParametroDeAtualizacao.findMany({ where: { classeDeBensId: CLASSE }, select: { numero: true }, orderBy: { numero: "asc" } })).map((v) => v.numero);
    expect(numeros).toEqual(Array.from({ length: 1 + ok }, (_, i) => i + 1));
  });

  it("t4: encerrar é uma versão com ativo = false — a prévia diz INATIVO, processar recusa, nada é gravado", async () => {
    await definirParametroDeAtualizacao(prisma, V1);
    const fim = await definirParametroDeAtualizacao(prisma, { ...V1, ativo: false, motivo: "Classe passou a ser controlada fora do ativo imobilizado." });
    expect(fim.numero).toBe(2);
    const previa = await preverCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03" });
    expect(previa.situacao).toBe("PARAMETRO_INATIVO");
    const movs = await prisma.movimentoPatrimonial.count();
    await expect(atualizarCompetencia(prisma, { classeDeBensId: CLASSE, competencia: "2026-03", criadoPor: POR })).rejects.toThrow(/INATIVO/);
    expect(await prisma.movimentoPatrimonial.count()).toBe(movs);
    expect(await prisma.memoriaDeAtualizacao.count()).toBe(0);
  });

  it("t5: a classe com parâmetro de ORIGEM (sem versão) continua atualizando; a memória grava versão nula", async () => {
    expect(await parametroVigente(prisma, CLASSE_LEGADA)).toMatchObject({ versaoId: null, numero: null, origem: "LEGADO", vidaUtilMeses: 24 });
    const r = await atualizarCompetencia(prisma, { classeDeBensId: CLASSE_LEGADA, competencia: "2026-03", criadoPor: POR });
    expect(r.valorDaParcela.toFixed(2)).toBe("450.00");
    expect(r.versaoDeParametroId).toBeNull();
    const memoria = await prisma.memoriaDeAtualizacao.findUniqueOrThrow({ where: { movimentoId: r.movimentoId } });
    expect(memoria.versaoDeParametroId).toBeNull();
    expect(memoria.vidaUtilMeses).toBe(24);
    // versionar a classe legada é a PRIMEIRA versão — mesmo que repita a origem (a origem não é versão)
    const v1 = await definirParametroDeAtualizacao(prisma, { ...V1, classeDeBensId: CLASSE_LEGADA, motivo: "Versionando o parâmetro de origem, sem mudar a régua." });
    expect(v1.numero).toBe(1);
    expect((await parametroVigente(prisma, CLASSE_LEGADA))?.origem).toBe("VERSAO");
  });

  it("t6: quem só consulta o patrimônio não define parâmetro — recusa nomeando a ação, e nada nasce", async () => {
    await expect(definirParametroDeAtualizacao(prisma, { ...V1, criadoPor: LEITOR })).rejects.toThrow(/ACESSO NEGADO[\s\S]*DEFINIR_PARAMETRO_DE_ATUALIZACAO/);
    expect(await prisma.versaoDeParametroDeAtualizacao.count()).toBe(0);
    await expect(definirParametroDeAtualizacao(prisma, { ...V1, classeDeBensId: "nao-existe" })).rejects.toThrow(/CLASSE INEXISTENTE/);
  });
});
