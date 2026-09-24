import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { Decimal, toMoney, sumMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import {
  dataDeDesligamento,
  baixaEfetiva,
  dependenteValeEm,
  gratificacoesVigentesEm,
  regimeVigenteEm,
  salarioBaseVigenteEm,
  type EventoDoVinculo,
} from "../m32-pessoal/dominio.js";
import {
  NATUREZAS_SISTEMICAS,
  RubricaSistemicaAusenteError,
  TabelaAusenteError,
  VencimentoAusenteError,
  VERSAO_DO_MOTOR,
  VinculoSemRegimeError,
  bordasDaCompetencia,
  calcularContracheque,
  conferirFaixas,
  diasComputados,
  escolherVigente,
  imposicoesDaPessoa,
  sha256Canonico,
  zAbrirFolhaInput,
  zCadastrarRubricaInput,
  zCadastrarTabelaDeContribuicaoInput,
  zCadastrarTabelaIrrfInput,
  zCadastrarTabelaSalarioFamiliaInput,
  zCalcularFolhaInput,
  zCancelarCalculoInput,
  zFecharFolhaInput,
  zLancarNaFolhaInput,
  type AbrirFolhaInput,
  type CadastrarRubricaInput,
  type CadastrarTabelaDeContribuicaoInput,
  type CadastrarTabelaIrrfInput,
  type CadastrarTabelaSalarioFamiliaInput,
  type CalcularFolhaInput,
  type CancelarCalculoInput,
  type ContrachequeCalculado,
  type DependenteParaSalarioFamilia,
  type EntradaDoContracheque,
  type FecharFolhaInput,
  type ImposicoesDaPessoa,
  type LancarNaFolhaInput,
  type RegimePrevidenciario,
  type RubricaLida,
  type TabelaDeContribuicaoLida,
  type TabelaIrrfLida,
  type TabelaSalarioFamiliaLida,
} from "./dominio.js";
import { escolherVersaoVigente, type VersaoLida } from "./rubrica-versionada.js";
import {
  avosDoExercicio,
  calcularContrachequeDoDecimoTerceiro,
  RubricaDaBaseSemVersaoError,
  RubricaDaParcelaSemVersaoError,
  VERSAO_DO_MOTOR_DO_13,
  type ContrachequeDoDecimoTerceiro,
  type ParcelaDaBase,
} from "./decimo-terceiro.js";
import { parametroVigenteDoExercicio } from "./decimo-terceiro-servico.js";

/**
 * ═══ M33 — OS SERVIÇOS DA FOLHA (V6 P2.3) ═══
 *
 * Todos são atos do ENTE (a folha é do ente; o vínculo não tem ficha orçamentária). O cálculo é
 * um fato numerado por folha; o cancelamento e o fechamento são fatos; nada aqui apaga ou
 * reescreve. As tabelas são lidas TODAS de uma vez e a vigente é escolhida pelo domínio
 * (`escolherVigente`), fail-closed: sem tabela, o cálculo recusa nomeando a competência.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const s2 = (v: Money | Decimal): string => v.toFixed(2);

// ═══════════════════════════════════════════════════════════════════════════════
// AS TABELAS DO ENTE
// ═══════════════════════════════════════════════════════════════════════════════

export async function cadastrarTabelaDeContribuicao(prisma: PrismaClient, input: CadastrarTabelaDeContribuicaoInput): Promise<{ readonly tabelaId: string }> {
  const d = zCadastrarTabelaDeContribuicaoInput.parse(input);
  const faixas = conferirFaixas(d.faixas.map((f) => ({ ordem: f.ordem, ate: f.ate ?? null, aliquota: f.aliquota })), `de contribuição ${d.regime} ${d.competenciaInicio}`);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarTabelaDeContribuicao, "ENTE");
    const gemea = await tx.tabelaDeContribuicao.findFirst({ where: { regime: d.regime, competenciaInicio: d.competenciaInicio }, select: { id: true } });
    if (gemea !== null) throw new Error(`TABELA-AMBIGUA: já existe tabela de contribuição ${d.regime} começando em ${d.competenciaInicio}. Duas com o mesmo início diriam duas verdades; se a anterior está errada, cadastre a nova com início posterior. Nada foi gravado.`);
    const t = await tx.tabelaDeContribuicao.create({
      data: {
        regime: d.regime, competenciaInicio: d.competenciaInicio, competenciaFim: d.competenciaFim ?? null,
        teto: d.teto === null || d.teto === undefined ? null : s2(d.teto),
        aliquotaPatronal: d.aliquotaPatronal === null || d.aliquotaPatronal === undefined ? null : d.aliquotaPatronal.toFixed(4),
        fundamentacaoLegal: d.fundamentacaoLegal, criadoPor: d.criadoPor,
        faixas: { create: faixas.map((f) => ({ ordem: f.ordem, ate: f.ate === null ? null : s2(f.ate), aliquota: f.aliquota.toFixed(4) })) },
      },
      select: { id: true },
    });
    return { tabelaId: t.id };
  });
}

export async function cadastrarTabelaIrrf(prisma: PrismaClient, input: CadastrarTabelaIrrfInput): Promise<{ readonly tabelaId: string }> {
  const d = zCadastrarTabelaIrrfInput.parse(input);
  const faixas = conferirFaixas(d.faixas.map((f) => ({ ordem: f.ordem, ate: f.ate ?? null, aliquota: f.aliquota })), `IRRF ${d.competenciaInicio}`);
  const redutor = [d.redutorBase, d.redutorFator, d.redutorRendaMaxima].filter((x) => x !== null && x !== undefined).length;
  if (redutor !== 0 && redutor !== 3) throw new Error("REDUTOR-INCOMPLETO: o redutor vem com base, fator e renda máxima — os três — ou não vem. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarTabelaIrrf, "ENTE");
    const gemea = await tx.tabelaIrrf.findFirst({ where: { competenciaInicio: d.competenciaInicio }, select: { id: true } });
    if (gemea !== null) throw new Error(`TABELA-AMBIGUA: já existe tabela de IRRF começando em ${d.competenciaInicio}. Nada foi gravado.`);
    const t = await tx.tabelaIrrf.create({
      data: {
        competenciaInicio: d.competenciaInicio, competenciaFim: d.competenciaFim ?? null,
        deducaoPorDependente: s2(d.deducaoPorDependente),
        descontoSimplificado: d.descontoSimplificado === null || d.descontoSimplificado === undefined ? null : s2(d.descontoSimplificado),
        isencaoMaior65: d.isencaoMaior65 === null || d.isencaoMaior65 === undefined ? null : s2(d.isencaoMaior65),
        redutorBase: d.redutorBase === null || d.redutorBase === undefined ? null : s2(d.redutorBase),
        redutorFator: d.redutorFator === null || d.redutorFator === undefined ? null : d.redutorFator.toFixed(8),
        redutorRendaMaxima: d.redutorRendaMaxima === null || d.redutorRendaMaxima === undefined ? null : s2(d.redutorRendaMaxima),
        fundamentacaoLegal: d.fundamentacaoLegal, criadoPor: d.criadoPor,
        faixas: { create: d.faixas.map((f) => ({ ordem: f.ordem, ate: f.ate === null || f.ate === undefined ? null : s2(f.ate), aliquota: f.aliquota.toFixed(4), parcelaADeduzir: s2(f.parcelaADeduzir ?? toMoney(0)) })) },
      },
      select: { id: true },
    });
    void faixas;
    return { tabelaId: t.id };
  });
}

export async function cadastrarTabelaSalarioFamilia(prisma: PrismaClient, input: CadastrarTabelaSalarioFamiliaInput): Promise<{ readonly tabelaId: string }> {
  const d = zCadastrarTabelaSalarioFamiliaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarTabelaSalarioFamilia, "ENTE");
    const gemea = await tx.tabelaSalarioFamilia.findFirst({ where: { competenciaInicio: d.competenciaInicio }, select: { id: true } });
    if (gemea !== null) throw new Error(`TABELA-AMBIGUA: já existe tabela de salário-família começando em ${d.competenciaInicio}. Nada foi gravado.`);
    const t = await tx.tabelaSalarioFamilia.create({
      data: { competenciaInicio: d.competenciaInicio, competenciaFim: d.competenciaFim ?? null, rendaMaxima: s2(d.rendaMaxima), valorPorDependente: s2(d.valorPorDependente), idadeLimite: d.idadeLimite, fundamentacaoLegal: d.fundamentacaoLegal, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { tabelaId: t.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUBRICAS E LANÇAMENTOS
// ═══════════════════════════════════════════════════════════════════════════════

export async function cadastrarRubrica(prisma: PrismaClient, input: CadastrarRubricaInput): Promise<{ readonly rubricaId: string }> {
  const d = zCadastrarRubricaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarRubrica, "ENTE");
    if (NATUREZAS_SISTEMICAS.includes(d.natureza)) {
      const ja = await tx.rubrica.findFirst({ where: { natureza: d.natureza }, select: { codigo: true } });
      if (ja !== null) throw new Error(`RUBRICA-SISTEMICA-DUPLICADA: a natureza ${d.natureza} já é da rubrica ${ja.codigo}; ela existe uma vez. Nada foi gravado.`);
    }
    const codigo = await tx.rubrica.findUnique({ where: { codigo: d.codigo }, select: { id: true } });
    if (codigo !== null) throw new Error(`RUBRICA-REPETIDA: o código ${d.codigo} já existe. Nada foi gravado.`);
    const r = await tx.rubrica.create({
      data: {
        codigo: d.codigo, descricao: d.descricao, tipo: d.tipo, natureza: d.natureza,
        percentual: d.percentual === null || d.percentual === undefined ? null : d.percentual.toFixed(4),
        incideContribuicao: d.incideContribuicao, incideIrrf: d.incideIrrf, proporcionalAosDias: d.proporcionalAosDias,
        ordem: d.ordem, fundamentacaoLegal: d.fundamentacaoLegal, criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    /**
     * ⚠️ A VERSÃO 1 NASCE COM A RUBRICA (V11 V1.1). A versão é a autoridade do cálculo; uma
     * rubrica sem versão vigente não participa de contracheque nenhum — e se for sistêmica, a
     * folha inteira recusa. Criar a rubrica e deixar a versão para "depois" produziria um
     * cadastro que existe na tela e não calcula nada, que é exatamente o defeito que a
     * migração de dados desta mesma entrega precisou consertar para as rubricas antigas.
     *
     * Ela nasce APROVADA e vigente desde `1900-01` porque é o que o cadastro anterior queria
     * dizer: a rubrica vale desde sempre, até que alguém escreva uma versão nova. O aprovador é
     * quem cadastrou — é o registro verdadeiro, não uma assinatura inventada.
     */
    //
    // ⚠️ EXCEÇÃO: A RUBRICA DE FÓRMULA NASCE SEM VERSÃO, e isto foi um defeito real achado pelo
    // teste d3. Criar a versão 1 automaticamente também para ela produzia uma versão APROVADA
    // com `formula` nula — e o motor, ao encontrá-la, recusava a folha INTEIRA nomeando a
    // rubrica. Uma rubrica de fórmula só passa a existir para o cálculo quando alguém escreve a
    // expressão e OUTRA pessoa a aprova, que é exatamente o ponto de ela ser versionada.
    if (d.natureza !== "FORMULA") await tx.versaoDaRubrica.create({
      data: {
        rubricaId: r.id, versao: 1, competenciaInicio: "1900-01", competenciaFim: null, formula: null,
        percentual: d.percentual === null || d.percentual === undefined ? null : d.percentual.toFixed(4),
        incideContribuicao: d.incideContribuicao, incideIrrf: d.incideIrrf,
        proporcionalAosDias: d.proporcionalAosDias, casasDecimais: 2, regime: "TODOS",
        fundamentacaoLegal: d.fundamentacaoLegal, situacao: "APROVADA",
        criadoPor: d.criadoPor, aprovadoPor: d.criadoPor, aprovadoEm: new Date(),
      },
      select: { id: true },
    });
    return { rubricaId: r.id };
  });
}

export async function lancarNaFolha(prisma: PrismaClient, input: LancarNaFolhaInput): Promise<{ readonly lancamentoId: string }> {
  const d = zLancarNaFolhaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.lancarNaFolha, "ENTE");
    const v = await tx.vinculo.findUnique({ where: { id: d.vinculoId }, select: { id: true, matricula: true, eventos: { select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true } } } });
    if (v === null) throw new Error(`Vínculo ${d.vinculoId} não existe. Nada foi gravado.`);
    const desligado = dataDeDesligamento(v.eventos.map(paraEvento));
    if (desligado !== null && diaCivil(desligado).slice(0, 7) < d.competenciaInicio) {
      throw new Error(`VINCULO-DESLIGADO: a matrícula ${v.matricula} foi desligada em ${diaCivil(desligado)}; não recebe lançamento em ${d.competenciaInicio}. Nada foi gravado.`);
    }
    const r = await tx.rubrica.findUnique({ where: { id: d.rubricaId }, select: { codigo: true, natureza: true } });
    if (r === null) throw new Error(`Rubrica ${d.rubricaId} não existe. Nada foi gravado.`);
    if (r.natureza !== "VALOR_INFORMADO") throw new Error(`RUBRICA-NAO-INFORMAVEL: a rubrica ${r.codigo} é ${r.natureza} — o valor dela é calculado, não informado. Nada foi gravado.`);
    const fim = d.tipo === "VARIAVEL" ? d.competenciaInicio : (d.competenciaFim ?? null);
    const l = await tx.lancamentoDaFolha.create({
      data: { vinculoId: v.id, rubricaId: d.rubricaId, tipo: d.tipo, competenciaInicio: d.competenciaInicio, competenciaFim: fim, valor: s2(d.valor), observacao: d.observacao ?? null, atoLegal: d.atoLegal ?? null, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { lancamentoId: l.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A FOLHA — abrir, calcular, cancelar o cálculo, fechar
// ═══════════════════════════════════════════════════════════════════════════════

export async function abrirFolha(prisma: PrismaClient, input: AbrirFolhaInput): Promise<{ readonly folhaId: string }> {
  const d = zAbrirFolhaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.abrirFolha, "ENTE");
    const ja = await tx.folhaDePagamento.findUnique({ where: { competencia_tipo: { competencia: d.competencia, tipo: d.tipo } }, select: { id: true } });
    if (ja !== null) throw new Error(`FOLHA-JA-ABERTA: a folha ${d.tipo} de ${d.competencia} já existe (${ja.id}). Calcule-a; não se abre duas vezes. Nada foi gravado.`);

    /**
     * ⚠️ V11 V9.1 — O EXERCÍCIO E O ELO, RESOLVIDOS AQUI E NÃO DIGITADOS.
     *
     * O exercício sai do ano da competência (o CHECK `ck_folha_exercicio_por_tipo` confere que os
     * dois coincidem, e nulo na mensal). Já o elo com o adiantamento é o ponto delicado: apontar
     * à mão qual folha abater permitiria abater a do ano passado. Como só existe UM adiantamento
     * por exercício (`@@unique([exercicio, tipo])`), o serviço o resolve — e o CÁLCULO confere de
     * novo, porque entre abrir e calcular alguém pode ter aberto o adiantamento que aqui não
     * existia.
     */
    const exercicio = d.tipo === "MENSAL" ? null : Number(d.competencia.slice(0, 4));
    let folhaDoAdiantamentoId: string | null = null;
    if (d.tipo === "DECIMO_TERCEIRO") {
      const adiantamento = await tx.folhaDePagamento.findFirst({
        where: { exercicio, tipo: "ADIANTAMENTO_DECIMO_TERCEIRO" },
        select: { id: true },
      });
      folhaDoAdiantamentoId = adiantamento?.id ?? null;
    }

    const f = await tx.folhaDePagamento.create({
      data: { competencia: d.competencia, tipo: d.tipo, exercicio, folhaDoAdiantamentoId, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { folhaId: f.id };
  });
}

function paraEvento(e: { readonly data: Date; readonly criadoEm: Date; readonly tipo: string; readonly cargoId: string | null; readonly lotacaoId: string | null; readonly salarioBase: Decimal | null; readonly regimePrevidenciario?: string | null }): EventoDoVinculo {
  return { data: e.data, criadoEm: e.criadoEm, tipo: e.tipo as EventoDoVinculo["tipo"], cargoId: e.cargoId, lotacaoId: e.lotacaoId, salarioBase: e.salarioBase === null ? null : toMoney(e.salarioBase), regimePrevidenciario: (e.regimePrevidenciario ?? null) as RegimePrevidenciario | null };
}

/** Os períodos de afastamento (AFASTAMENTO → RETORNO seguinte), na ordem dos fatos. */
function afastamentosDe(eventos: readonly EventoDoVinculo[]): readonly { readonly inicio: Date; readonly fim: Date | null }[] {
  const ordenados = [...eventos].sort((a, b) => a.data.getTime() - b.data.getTime() || a.criadoEm.getTime() - b.criadoEm.getTime());
  const saida: { inicio: Date; fim: Date | null }[] = [];
  let aberto: { inicio: Date; fim: Date | null } | null = null;
  for (const e of ordenados) {
    if (e.tipo === "AFASTAMENTO" && aberto === null) aberto = { inicio: e.data, fim: null };
    if (e.tipo === "RETORNO_AFASTAMENTO" && aberto !== null) {
      aberto.fim = e.data;
      saida.push(aberto);
      aberto = null;
    }
  }
  if (aberto !== null) saida.push(aberto);
  return saida;
}

async function lerTabelas(tx: Tx, competencia: string): Promise<{
  readonly contribuicao: Readonly<Record<"RGPS" | "RPPS", TabelaDeContribuicaoLida | null>>;
  readonly irrf: TabelaIrrfLida;
  readonly salarioFamilia: TabelaSalarioFamiliaLida | null;
}> {
  const [contribs, irrfs, sfs] = await Promise.all([
    tx.tabelaDeContribuicao.findMany({ select: { id: true, regime: true, competenciaInicio: true, competenciaFim: true, teto: true, fundamentacaoLegal: true, faixas: { select: { ordem: true, ate: true, aliquota: true } } } }),
    tx.tabelaIrrf.findMany({ select: { id: true, competenciaInicio: true, competenciaFim: true, deducaoPorDependente: true, descontoSimplificado: true, isencaoMaior65: true, redutorBase: true, redutorFator: true, redutorRendaMaxima: true, fundamentacaoLegal: true, faixas: { select: { ordem: true, ate: true, aliquota: true } } } }),
    tx.tabelaSalarioFamilia.findMany({ select: { id: true, competenciaInicio: true, competenciaFim: true, rendaMaxima: true, valorPorDependente: true, idadeLimite: true, fundamentacaoLegal: true } }),
  ]);
  const contribuicaoDo = (regime: "RGPS" | "RPPS"): TabelaDeContribuicaoLida | null => {
    const candidatas = contribs.filter((t) => t.regime === regime).map((t) => ({ id: t.id, regime: t.regime as RegimePrevidenciario, competenciaInicio: t.competenciaInicio, competenciaFim: t.competenciaFim, teto: t.teto === null ? null : toMoney(t.teto), fundamentacaoLegal: t.fundamentacaoLegal, faixas: t.faixas.map((f) => ({ ordem: f.ordem, ate: f.ate === null ? null : toMoney(f.ate), aliquota: new Decimal(f.aliquota) })) }));
    try {
      return escolherVigente(candidatas, competencia, "CONTRIBUICAO");
    } catch (e) {
      if (candidatas.filter((c) => c.competenciaInicio <= competencia && (c.competenciaFim === null || c.competenciaFim >= competencia)).length > 1) throw e;
      return null; // ausente: só é erro se algum vínculo do regime aparecer
    }
  };
  const irrf = escolherVigente(irrfs.map((t) => ({ id: t.id, competenciaInicio: t.competenciaInicio, competenciaFim: t.competenciaFim, deducaoPorDependente: toMoney(t.deducaoPorDependente), descontoSimplificado: t.descontoSimplificado === null ? null : toMoney(t.descontoSimplificado), isencaoMaior65: t.isencaoMaior65 === null ? null : toMoney(t.isencaoMaior65), redutorBase: t.redutorBase === null ? null : toMoney(t.redutorBase), redutorFator: t.redutorFator === null ? null : new Decimal(t.redutorFator), redutorRendaMaxima: t.redutorRendaMaxima === null ? null : toMoney(t.redutorRendaMaxima), fundamentacaoLegal: t.fundamentacaoLegal, faixas: t.faixas.map((f) => ({ ordem: f.ordem, ate: f.ate === null ? null : toMoney(f.ate), aliquota: new Decimal(f.aliquota) })) })), competencia, "IRRF");
  const sfCandidatas = sfs.map((t) => ({ id: t.id, competenciaInicio: t.competenciaInicio, competenciaFim: t.competenciaFim, rendaMaxima: toMoney(t.rendaMaxima), valorPorDependente: toMoney(t.valorPorDependente), idadeLimite: t.idadeLimite, fundamentacaoLegal: t.fundamentacaoLegal }));
  let salarioFamilia: TabelaSalarioFamiliaLida | null;
  try {
    salarioFamilia = escolherVigente(sfCandidatas, competencia, "SALARIO_FAMILIA");
  } catch (e) {
    if (sfCandidatas.filter((c) => c.competenciaInicio <= competencia && (c.competenciaFim === null || c.competenciaFim >= competencia)).length > 1) throw e;
    salarioFamilia = null;
  }
  return { contribuicao: { RGPS: contribuicaoDo("RGPS"), RPPS: contribuicaoDo("RPPS") }, irrf, salarioFamilia };
}

/**
 * ⚠️ AS RUBRICAS SÃO RESOLVIDAS POR COMPETÊNCIA E POR REGIME (V11 V1.1), e por isso não são uma
 * lista só para a folha inteira. Percentual, incidências, proporcionalidade, fundamentação e
 * fórmula vêm da VERSÃO vigente — as colunas antigas da `Rubrica` registram como ela nasceu e não
 * são mais lidas. Sem versão vigente para o regime do vínculo, a rubrica simplesmente não
 * participa daquele contracheque; se a que falta for sistêmica, o motor recusa nomeando-a.
 *
 * ⚠️ V11 V9.1 — ELE SAIU DE DENTRO DE `calcularFolha` para virar função de módulo, porque o 13º
 * precisa EXATAMENTE da mesma resolução. Duplicar a regra em dois lugares é o defeito que a V8.16
 * custou: `listarTiposConsignacao` tinha a leitura escrita à mão e divergia das outras duas, e a
 * suíte inteira ficava verde porque cada uma tinha o seu teste.
 */
async function resolvedorDeRubricas(tx: Tx, competencia: string): Promise<(regime: RegimePrevidenciario) => readonly RubricaLida[]> {
  const rubricasBrutas = await tx.rubrica.findMany({
    select: {
      id: true, codigo: true, descricao: true, tipo: true, natureza: true, ordem: true,
      versoes: { select: { id: true, versao: true, competenciaInicio: true, competenciaFim: true, formula: true, percentual: true, incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, casasDecimais: true, regime: true, fundamentacaoLegal: true, situacao: true } },
    },
  });
  return (regime: RegimePrevidenciario): readonly RubricaLida[] => {
    const saida: RubricaLida[] = [];
    for (const r of rubricasBrutas) {
      const versoes: VersaoLida[] = r.versoes.map((v) => ({ ...v, percentual: v.percentual === null ? null : new Decimal(v.percentual), regime: v.regime as VersaoLida["regime"], situacao: v.situacao as VersaoLida["situacao"] }));
      const vigente = escolherVersaoVigente(r.codigo, versoes, competencia, regime);
      if (vigente === null) continue;
      saida.push({
        id: r.id, codigo: r.codigo, descricao: r.descricao, ordem: r.ordem,
        tipo: r.tipo as RubricaLida["tipo"], natureza: r.natureza as RubricaLida["natureza"],
        percentual: vigente.percentual, incideContribuicao: vigente.incideContribuicao,
        incideIrrf: vigente.incideIrrf, proporcionalAosDias: vigente.proporcionalAosDias,
        fundamentacaoLegal: vigente.fundamentacaoLegal, versao: vigente.versao,
        formula: vigente.formula, casasDecimais: vigente.casasDecimais,
      });
    }
    return saida;
  };
}

export interface ResultadoDoCalculo {
  readonly calculoId: string;
  readonly numero: number;
  readonly contracheques: number;
  readonly totalProventos: Money;
  readonly totalDescontos: Money;
  readonly totalLiquido: Money;
  readonly sha256: string;
}

/**
 * CALCULA A FOLHA: todos os vínculos vivos na competência, com regime, vencimento e tabelas
 * vigentes — ou recusa nomeando o primeiro que falta. Dois passos: cada contracheque sozinho;
 * depois a agregação por pessoa (TR 5.12.79) reimpõe contribuição e IRRF a quem tem duas
 * matrículas. Grava o cálculo (numero+1), os contracheques com a memória e o sha256 do conjunto.
 */
export async function calcularFolha(prisma: PrismaClient, input: CalcularFolhaInput): Promise<ResultadoDoCalculo> {
  const d = zCalcularFolhaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.calcularFolha, "ENTE");
    const folha = await tx.folhaDePagamento.findUnique({ where: { id: d.folhaId }, select: { id: true, competencia: true, tipo: true, exercicio: true, folhaDoAdiantamentoId: true, fechamento: { select: { id: true, calculo: { select: { numero: true } } } }, calculos: { select: { numero: true }, orderBy: { numero: "desc" }, take: 1 } } });
    if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi calculado.`);
    if (folha.fechamento !== null) throw new Error(`FOLHA-FECHADA: a folha ${folha.tipo} de ${folha.competencia} foi fechada sobre o cálculo nº ${folha.fechamento.calculo.numero}; não se recalcula. Nada foi calculado.`);
    // V11 V9.1 — as duas folhas de 13º têm outro motor: a medida é o avo do exercício, não o dia
    // do mês. Tudo o mais (numeração do cálculo, cancelamento, fechamento, atesto, empenho) é o
    // mesmo, porque opera sobre `CalculoDaFolha` e `Contracheque`, que não mudaram.
    if (folha.tipo !== "MENSAL") {
      return calcularFolhaDoDecimoTerceiroNaTx(tx, folha, d.motivo ?? null, d.criadoPor);
    }
    const competencia = folha.competencia;
    const { inicio, fim } = bordasDaCompetencia(competencia);

    const tabelas = await lerTabelas(tx, competencia);
    const rubricasDoRegime = await resolvedorDeRubricas(tx, competencia);

    const vinculos = await tx.vinculo.findMany({
      select: {
        id: true, matricula: true, dataAdmissao: true, regimePrevidenciario: true, servidorId: true,
        servidor: { select: { dataNascimento: true, dependentes: { select: { id: true, nome: true, dataNascimento: true, invalidezPermanente: true, finalidades: { select: { finalidade: true, dataInicio: true, limiteIdadeAnos: true, dataBaixa: true, encerramento: { select: { dataEfeito: true } } } } } } } },
        eventos: { select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true, regimePrevidenciario: true, gratificacaoDescricao: true, gratificacaoValor: true } },
        lancamentosDaFolha: { where: { competenciaInicio: { lte: competencia }, OR: [{ competenciaFim: null }, { competenciaFim: { gte: competencia } }] }, select: { id: true, rubricaId: true, tipo: true, valor: true } },
      },
      orderBy: { matricula: "asc" },
    });

    const entradas: EntradaDoContracheque[] = [];
    for (const v of vinculos) {
      const eventos = v.eventos.map(paraEvento);
      const desligamento = dataDeDesligamento(eventos);
      if (diaCivil(v.dataAdmissao) > diaCivil(fim)) continue;
      if (desligamento !== null && diaCivil(desligamento) < diaCivil(inicio)) continue;
      // ⚠️ O REGIME É DERIVADO NA COMPETÊNCIA, não lido da coluna: quem migrou ao RPPS em junho
      // contribuiu ao RGPS em maio, e o recálculo de maio tem de aplicar a tabela de maio.
      const regime = regimeVigenteEm(eventos, v.regimePrevidenciario as RegimePrevidenciario | null, fim);
      if (regime === null) throw new VinculoSemRegimeError(v.matricula);
      if (regime !== "ISENTO" && tabelas.contribuicao[regime] === null) {
        throw new TabelaAusenteError("CONTRIBUICAO", competencia, `regime ${regime}, exigido pela matrícula ${v.matricula}`);
      }
      const dependentesSf: DependenteParaSalarioFamilia[] = v.servidor.dependentes.map((dep) => ({
        id: dep.id, nome: dep.nome, dataNascimento: dep.dataNascimento, invalidezPermanente: dep.invalidezPermanente,
        finalidadeVigente: dep.finalidades.some((f) => f.finalidade === "SALARIO_FAMILIA" && f.dataInicio.getTime() <= fim.getTime() && (baixaEfetiva(f) === null || (baixaEfetiva(f) as Date).getTime() > inicio.getTime())),
      })).filter((dep) => v.servidor.dependentes.find((x) => x.id === dep.id)?.finalidades.some((f) => f.finalidade === "SALARIO_FAMILIA") === true);
      const dependentesIr = v.servidor.dependentes.filter((dep) => dep.finalidades.some((f) => f.finalidade === "IMPOSTO_RENDA" && dependenteValeEm({ dataNascimento: dep.dataNascimento, invalidezPermanente: dep.invalidezPermanente, dataInicio: f.dataInicio, limiteIdadeAnos: f.limiteIdadeAnos, dataBaixa: baixaEfetiva(f) }, fim))).length;
      entradas.push({
        competencia,
        vinculo: { id: v.id, matricula: v.matricula, regime, dataNascimento: v.servidor.dataNascimento },
        vencimentoBase: salarioBaseVigenteEm(eventos, fim),
        gratificacoes: gratificacoesVigentesEm(v.eventos.map((e) => ({ ...paraEvento(e), gratificacaoDescricao: e.gratificacaoDescricao, gratificacaoValor: e.gratificacaoValor === null ? null : toMoney(e.gratificacaoValor) })), fim).map((g) => ({ descricao: g.descricao, valor: g.valor })),
        dias: diasComputados({ dataAdmissao: v.dataAdmissao, dataDesligamento: desligamento, afastamentos: afastamentosDe(eventos) }, competencia),
        lancamentos: v.lancamentosDaFolha.map((l) => ({ id: l.id, rubricaId: l.rubricaId, tipo: l.tipo as "FIXO" | "VARIAVEL", valor: toMoney(l.valor) })),
        dependentesSalarioFamilia: dependentesSf,
        dependentesIr,
        pensaoAlimenticia: toMoney(0),
        rubricas: rubricasDoRegime(regime),
        tabelas: { contribuicao: regime === "ISENTO" ? null : tabelas.contribuicao[regime], irrf: tabelas.irrf, salarioFamilia: tabelas.salarioFamilia },
      });
    }
    if (entradas.length === 0) throw new Error(`FOLHA-SEM-VINCULOS: nenhum vínculo vivo em ${competencia}. Nada foi calculado.`);

    // passo 1 — cada um sozinho
    const primeiro = new Map<string, ContrachequeCalculado>();
    for (const e of entradas) primeiro.set(e.vinculo.id, calcularContracheque(e));

    // passo 2 — a mesma pessoa com mais de uma matrícula
    const porServidor = new Map<string, typeof vinculos>();
    for (const v of vinculos) {
      if (!primeiro.has(v.id)) continue;
      porServidor.set(v.servidorId, [...(porServidor.get(v.servidorId) ?? []), v]);
    }
    const imposicoes = new Map<string, ImposicoesDaPessoa>();
    for (const [, vs] of porServidor) {
      if (vs.length < 2) continue;
      const e0 = entradas.find((e) => e.vinculo.id === vs[0]!.id)!;
      const regimes = vs.map((v) => v.regimePrevidenciario as RegimePrevidenciario);
      const tabelaContrib = regimes.includes("RGPS") ? tabelas.contribuicao.RGPS : null;
      const imp = imposicoesDaPessoa({
        competencia,
        vinculos: vs.map((v) => { const c = primeiro.get(v.id)!; return { id: v.id, matricula: v.matricula, regime: v.regimePrevidenciario as RegimePrevidenciario, baseContribuicao: c.contribuicao.baseAntesDoTeto, contribuicaoSozinho: c.totais.contribuicao, rendaTributavel: c.irrf.rendaTributavel }; }),
        dataNascimento: e0.vinculo.dataNascimento,
        dependentesIr: e0.dependentesIr,
        pensaoAlimenticia: e0.pensaoAlimenticia,
        tabelas: { contribuicao: tabelaContrib, irrf: tabelas.irrf },
      });
      for (const [k, v] of imp) imposicoes.set(k, v);
    }
    const finais: ContrachequeCalculado[] = entradas.map((e) => {
      const imp = imposicoes.get(e.vinculo.id);
      return imp === undefined ? primeiro.get(e.vinculo.id)! : calcularContracheque({ ...e, imposicoes: imp });
    });

    // gravar
    const numero = (folha.calculos[0]?.numero ?? 0) + 1;
    const totalProventos = sumMoney(finais.map((c) => c.totais.proventos));
    const totalDescontos = sumMoney(finais.map((c) => c.totais.descontos));
    const totalLiquido = toMoney(totalProventos.minus(totalDescontos));
    const sha256 = sha256Canonico({ motor: VERSAO_DO_MOTOR, competencia, contracheques: finais.map((c) => c.sha256).sort() });
    const calculo = await tx.calculoDaFolha.create({
      data: { folhaId: folha.id, numero, motivo: d.motivo ?? null, totalProventos: s2(totalProventos), totalDescontos: s2(totalDescontos), totalLiquido: s2(totalLiquido), contracheques: finais.length, sha256, versaoDoMotor: VERSAO_DO_MOTOR, criadoPor: d.criadoPor },
      select: { id: true },
    });
    for (const c of finais) {
      await tx.contracheque.create({
        data: {
          calculoId: calculo.id, vinculoId: c.vinculoId, regime: c.regime, diasComputados: c.diasComputados,
          totalProventos: s2(c.totais.proventos), totalDescontos: s2(c.totais.descontos), liquido: s2(c.totais.liquido),
          baseContribuicao: s2(c.totais.baseContribuicao), contribuicao: s2(c.totais.contribuicao), baseIrrf: s2(c.totais.baseIrrf), irrf: s2(c.totais.irrf),
          memoria: c.memoria as object, sha256: c.sha256,
          linhas: { create: c.linhas.map((l) => ({ rubricaId: l.rubricaId, ordem: l.ordem, tipo: l.tipo, valorBase: s2(l.valorBase), fator: l.fator.toFixed(6), valor: s2(l.valor), incideContribuicao: l.incideContribuicao, incideIrrf: l.incideIrrf, memoria: l.memoria })) },
        },
      });
    }
    return { calculoId: calculo.id, numero, contracheques: finais.length, totalProventos, totalDescontos, totalLiquido, sha256 };
  }, { timeout: 120000 });
}

/**
 * ═══ V11 V9.1 — O CÁLCULO DAS DUAS FOLHAS DE 13º ═══
 *
 * Roda DENTRO da transação de `calcularFolha`, sob a mesma autorização (`CALCULAR_FOLHA`) e
 * gravando nos mesmos `CalculoDaFolha` e `Contracheque`. O que muda é a CONTA: a base vem das
 * rubricas que o parâmetro lista, e a proporção vem dos AVOS do exercício, não dos dias do mês.
 *
 * ⚠️ TRÊS RECUSAS ACONTECEM ANTES DE QUALQUER GRAVAÇÃO, e as três existem por um dano concreto:
 *   1. sem parâmetro do exercício, o 13º sairia com os números de quem escreveu o motor;
 *   2. com adiantamento ABERTO (não fechado), o abatimento leria valores que ainda vão mudar;
 *   3. com adiantamento que APARECEU depois da abertura desta folha, o elo estaria nulo e o
 *      abatimento seria zero — o ente pagaria o 13º inteiro a quem já recebeu metade.
 */
async function calcularFolhaDoDecimoTerceiroNaTx(
  tx: Tx,
  folha: { readonly id: string; readonly competencia: string; readonly tipo: string; readonly exercicio: number | null; readonly folhaDoAdiantamentoId: string | null; readonly calculos: readonly { readonly numero: number }[] },
  motivo: string | null,
  criadoPor: string
): Promise<ResultadoDoCalculo> {
  const competencia = folha.competencia;
  const exercicio = folha.exercicio as number; // o CHECK do banco garante não nulo fora da mensal
  const eAdiantamento = folha.tipo === "ADIANTAMENTO_DECIMO_TERCEIRO";
  const { fim } = bordasDaCompetencia(competencia);

  const cfg = await parametroVigenteDoExercicio(tx, exercicio);
  const parametro = cfg.parametro;

  // ── (2) e (3): o adiantamento que esta folha abate ──────────────────────────
  const adiantamentoPorVinculo = new Map<string, Money>();
  if (!eAdiantamento) {
    const existente = await tx.folhaDePagamento.findFirst({
      where: { exercicio, tipo: "ADIANTAMENTO_DECIMO_TERCEIRO" },
      select: { id: true, competencia: true, fechamento: { select: { calculoId: true } } },
    });
    if (existente !== null && folha.folhaDoAdiantamentoId !== existente.id) {
      throw new Error(
        `ADIANTAMENTO-APARECEU-DEPOIS: quando esta folha de 13º foi aberta não havia folha de ` +
          `adiantamento no exercício ${exercicio}, e agora há (${existente.competencia}). Calcular ` +
          `assim pagaria o 13º inteiro a quem já recebeu a 1ª parcela. Abra a folha de 13º de novo, ` +
          `para que ela nasça ligada ao adiantamento. Nada foi calculado.`
      );
    }
    if (existente !== null) {
      if (existente.fechamento === null) {
        throw new Error(
          `ADIANTAMENTO-NAO-FECHADO: a folha de adiantamento de ${existente.competencia} ainda não foi ` +
            `fechada. Abater valores de um cálculo que ainda pode mudar deixaria o 13º errado assim que ` +
            `alguém recalculasse o adiantamento. Feche-a antes. Nada foi calculado.`
        );
      }
      const linhas = await tx.linhaDoContracheque.findMany({
        where: { contracheque: { calculoId: existente.fechamento.calculoId }, rubricaId: cfg.rubricaDoAdiantamentoId },
        select: { valor: true, contracheque: { select: { vinculoId: true } } },
      });
      for (const l of linhas) adiantamentoPorVinculo.set(l.contracheque.vinculoId, toMoney(l.valor));
    }
  }

  const tabelas = await lerTabelas(tx, competencia);
  const rubricasDoRegime = await resolvedorDeRubricas(tx, competencia);

  const vinculos = await tx.vinculo.findMany({
    select: {
      id: true, matricula: true, dataAdmissao: true, regimePrevidenciario: true, servidorId: true,
      servidor: { select: { dataNascimento: true, dependentes: { select: { id: true, dataNascimento: true, invalidezPermanente: true, finalidades: { select: { finalidade: true, dataInicio: true, limiteIdadeAnos: true, dataBaixa: true, encerramento: { select: { dataEfeito: true } } } } } } } },
      eventos: { select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true, regimePrevidenciario: true, gratificacaoDescricao: true, gratificacaoValor: true } },
    },
    orderBy: { matricula: "asc" },
  });

  /**
   * ⚠️ ATÉ QUE MÊS OS AVOS CONTAM — e quem decide é o ENTE, não este arquivo. Há município que
   * paga metade do que já foi ganho até a competência do adiantamento, e há o que paga metade do
   * 13º projetado para o ano inteiro. As duas práticas existem e o TR não fixa uma; escolher por
   * dentro seria inventar a norma do ente. Na 2ª parcela não há escolha: o 13º é do ANO.
   */
  const ultimoMes = eAdiantamento && parametro.baseDosAvosDoAdiantamento === "ATE_A_COMPETENCIA"
    ? competencia
    : `${exercicio}-12`;

  const calculados: ContrachequeDoDecimoTerceiro[] = [];
  for (const v of vinculos) {
    const eventos = v.eventos.map(paraEvento);
    const desligamento = dataDeDesligamento(eventos);
    const regime = regimeVigenteEm(eventos, v.regimePrevidenciario as RegimePrevidenciario | null, fim);
    if (regime === null) throw new VinculoSemRegimeError(v.matricula);

    const avos = avosDoExercicio(
      { dataAdmissao: v.dataAdmissao, dataDesligamento: desligamento, afastamentos: afastamentosDe(eventos) },
      { exercicio, ultimoMes, diasMinimos: parametro.diasMinimosDoAvo }
    );
    // Zero avo não é contracheque de zero: é contracheque que não existe. Gravar uma linha zerada
    // para quem não tem direito faria a lista de contracheques mentir sobre quem recebeu 13º.
    if (avos.avos === 0) continue;

    if (regime !== "ISENTO" && tabelas.contribuicao[regime] === null) {
      throw new TabelaAusenteError("CONTRIBUICAO", competencia, `regime ${regime}, exigido pela matrícula ${v.matricula}`);
    }
    const doRegime = rubricasDoRegime(regime);
    const porId = new Map(doRegime.map((r) => [r.id, r]));

    const vencimento = salarioBaseVigenteEm(eventos, fim);
    if (vencimento === null) throw new VencimentoAusenteError(v.matricula, competencia);
    const gratificacoes = gratificacoesVigentesEm(
      v.eventos.map((e) => ({ ...paraEvento(e), gratificacaoDescricao: e.gratificacaoDescricao, gratificacaoValor: e.gratificacaoValor === null ? null : toMoney(e.gratificacaoValor) })),
      fim
    );

    // ── a base, rubrica a rubrica, INTEGRAL (os avos entram depois, uma vez só) ──
    const base: ParcelaDaBase[] = [];
    for (const rubricaId of cfg.rubricasDaBase) {
      const r = porId.get(rubricaId);
      if (r === undefined) {
        const codigo = (await tx.rubrica.findUnique({ where: { id: rubricaId }, select: { codigo: true } }))?.codigo ?? rubricaId;
        throw new RubricaDaBaseSemVersaoError(codigo, regime, competencia);
      }
      if (r.natureza === "VENCIMENTO_BASE") {
        base.push({ codigo: r.codigo, descricao: r.descricao, natureza: r.natureza, valor: vencimento, memoria: `vencimento-base vigente em ${competencia} = ${vencimento.toFixed(2)}` });
      } else if (r.natureza === "GRATIFICACOES_DO_VINCULO") {
        const total = sumMoney(gratificacoes.map((g) => g.valor));
        base.push({ codigo: r.codigo, descricao: r.descricao, natureza: r.natureza, valor: total, memoria: gratificacoes.length === 0 ? "nenhuma gratificação vigente" : `gratificações vigentes: ${gratificacoes.map((g) => `${g.descricao} ${g.valor.toFixed(2)}`).join(" + ")}` });
      } else {
        const pct = r.percentual ?? new Decimal(0);
        base.push({ codigo: r.codigo, descricao: r.descricao, natureza: r.natureza, valor: toMoney(vencimento.times(pct)), memoria: `${pct.times(100).toFixed(2)}% × vencimento-base ${vencimento.toFixed(2)}` });
      }
    }

    const idDaParcela = eAdiantamento ? cfg.rubricaDoAdiantamentoId : cfg.rubricaDoDecimoTerceiroId;
    const rubricaDaParcela = porId.get(idDaParcela);
    if (rubricaDaParcela === undefined) {
      const codigo = (await tx.rubrica.findUnique({ where: { id: idDaParcela }, select: { codigo: true } }))?.codigo ?? idDaParcela;
      throw new RubricaDaParcelaSemVersaoError(codigo, regime, competencia);
    }
    const rContrib = doRegime.find((r) => r.natureza === "CONTRIBUICAO_PREVIDENCIARIA");
    const rIrrf = doRegime.find((r) => r.natureza === "IMPOSTO_DE_RENDA");
    if (rContrib === undefined) throw new RubricaSistemicaAusenteError("CONTRIBUICAO_PREVIDENCIARIA", "é ela que desconta a contribuição");
    if (rIrrf === undefined) throw new RubricaSistemicaAusenteError("IMPOSTO_DE_RENDA", "é ela que retém o imposto");

    const dependentesIr = v.servidor.dependentes.filter((dep) => dep.finalidades.some((f) => f.finalidade === "IMPOSTO_RENDA" && dependenteValeEm({ dataNascimento: dep.dataNascimento, invalidezPermanente: dep.invalidezPermanente, dataInicio: f.dataInicio, limiteIdadeAnos: f.limiteIdadeAnos, dataBaixa: baixaEfetiva(f) }, fim))).length;

    calculados.push(calcularContrachequeDoDecimoTerceiro({
      parcela: eAdiantamento ? "ADIANTAMENTO" : "DECIMO_TERCEIRO",
      competencia,
      parametro,
      vinculo: { id: v.id, matricula: v.matricula, regime, dataNascimento: v.servidor.dataNascimento },
      avos,
      base,
      rubricaDaParcela,
      rubricaDoAbatimento: porId.get(cfg.rubricaDoAbatimentoId) ?? null,
      adiantamentoPago: adiantamentoPorVinculo.get(v.id) ?? toMoney(0),
      rubricaDaContribuicao: rContrib,
      rubricaDoIrrf: rIrrf,
      dependentesIr,
      pensaoAlimenticia: toMoney(0),
      tabelas: { contribuicao: regime === "ISENTO" ? null : tabelas.contribuicao[regime], irrf: tabelas.irrf },
    }));
  }

  if (calculados.length === 0) {
    throw new Error(
      `FOLHA-SEM-AVOS: nenhum vínculo alcançou um avo sequer no exercício ${exercicio} ` +
        `(mínimo de ${parametro.diasMinimosDoAvo} dias por mês). Nada foi calculado.`
    );
  }

  const numero = (folha.calculos[0]?.numero ?? 0) + 1;
  const totalProventos = sumMoney(calculados.map((c) => c.totais.proventos));
  const totalDescontos = sumMoney(calculados.map((c) => c.totais.descontos));
  const totalLiquido = toMoney(totalProventos.minus(totalDescontos));
  const sha256 = sha256Canonico({ motor: VERSAO_DO_MOTOR_DO_13, competencia, tipo: folha.tipo, contracheques: calculados.map((c) => c.sha256).sort() });
  const calculo = await tx.calculoDaFolha.create({
    data: { folhaId: folha.id, numero, motivo, totalProventos: s2(totalProventos), totalDescontos: s2(totalDescontos), totalLiquido: s2(totalLiquido), contracheques: calculados.length, sha256, versaoDoMotor: VERSAO_DO_MOTOR_DO_13, criadoPor },
    select: { id: true },
  });
  for (const c of calculados) {
    await tx.contracheque.create({
      data: {
        calculoId: calculo.id, vinculoId: c.vinculoId, regime: c.regime,
        diasComputados: c.diasComputados, avosComputados: c.avosComputados,
        totalProventos: s2(c.totais.proventos), totalDescontos: s2(c.totais.descontos), liquido: s2(c.totais.liquido),
        baseContribuicao: s2(c.totais.baseContribuicao), contribuicao: s2(c.totais.contribuicao), baseIrrf: s2(c.totais.baseIrrf), irrf: s2(c.totais.irrf),
        memoria: c.memoria as object, sha256: c.sha256,
        linhas: { create: c.linhas.map((l) => ({ rubricaId: l.rubricaId, ordem: l.ordem, tipo: l.tipo, valorBase: s2(l.valorBase), fator: l.fator.toFixed(6), valor: s2(l.valor), incideContribuicao: l.incideContribuicao, incideIrrf: l.incideIrrf, memoria: l.memoria })) },
      },
    });
  }
  return { calculoId: calculo.id, numero, contracheques: calculados.length, totalProventos, totalDescontos, totalLiquido, sha256 };
}

export async function cancelarCalculoDaFolha(prisma: PrismaClient, input: CancelarCalculoInput): Promise<{ readonly cancelamentoId: string }> {
  const d = zCancelarCalculoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cancelarCalculoDaFolha, "ENTE");
    const c = await tx.calculoDaFolha.findUnique({ where: { id: d.calculoId }, select: { id: true, numero: true, folha: { select: { competencia: true } }, cancelamento: { select: { id: true } }, fechamento: { select: { id: true } } } });
    if (c === null) throw new Error(`Cálculo ${d.calculoId} não existe. Nada foi gravado.`);
    if (c.fechamento !== null) throw new Error(`CALCULO-FECHADO: o cálculo nº ${c.numero} de ${c.folha.competencia} é o que fechou a folha; não se cancela. Nada foi gravado.`);
    if (c.cancelamento !== null) throw new Error(`CALCULO-JA-CANCELADO: o cálculo nº ${c.numero} de ${c.folha.competencia} já está cancelado. Nada foi gravado.`);
    const r = await tx.cancelamentoDoCalculo.create({ data: { calculoId: c.id, motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
    return { cancelamentoId: r.id };
  });
}

export async function fecharFolha(prisma: PrismaClient, input: FecharFolhaInput): Promise<{ readonly fechamentoId: string; readonly calculoId: string; readonly numero: number }> {
  const d = zFecharFolhaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.fecharFolha, "ENTE");
    const folha = await tx.folhaDePagamento.findUnique({ where: { id: d.folhaId }, select: { id: true, competencia: true, tipo: true, fechamento: { select: { id: true } }, calculos: { where: { cancelamento: null }, orderBy: { numero: "desc" }, take: 1, select: { id: true, numero: true, sha256: true } } } });
    if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi gravado.`);
    if (folha.fechamento !== null) throw new Error(`FOLHA-JA-FECHADA: a folha ${folha.tipo} de ${folha.competencia} já está fechada. Nada foi gravado.`);
    const vivo = folha.calculos[0];
    if (vivo === undefined) throw new Error(`FOLHA-SEM-CALCULO-VIVO: a folha ${folha.tipo} de ${folha.competencia} não tem cálculo (ou todos foram cancelados). Calcule antes de fechar. Nada foi gravado.`);
    const f = await tx.fechamentoDaFolha.create({ data: { folhaId: folha.id, calculoId: vivo.id, sha256: vivo.sha256, criadoPor: d.criadoPor }, select: { id: true } });
    return { fechamentoId: f.id, calculoId: vivo.id, numero: vivo.numero };
  });
}
