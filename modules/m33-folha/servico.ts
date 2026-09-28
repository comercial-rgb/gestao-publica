import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import {
  SELECAO_DE_TODOS,
  abrangenciaDeclarada,
  exigirAbrangenciaCompleta,
  selecionadosQueSumiriam,
  type LinhaDeAbrangencia,
  type SelecaoDoCalculo,
} from "./abrangencia.js";
import type { Prisma, PrismaClient } from "../../prisma/generated/client/client.js";
import { Decimal, emProsa, toMoney, sumMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
// ⚠️ V11 V9.3 — "PAGO" É LÍQUIDO DE ESTORNO E DE ANULAÇÃO PARCIAL, e quem sabe somar isso já
// existe. Reimplementar a regra aqui seria a segunda cópia que este repositório já pagou para
// não ter — e a cópia erraria justamente no caso que motivou esta rodada.
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
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
  RubricaDoAbatimentoSalarialAusenteError,
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
  exercicioDaFolha,
  imposicoesDaPessoa,
  TIPOS_QUE_COMPOEM_A_REMUNERACAO_MENSAL,
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
  type TipoDeFolha,
} from "./dominio.js";
import {
  calcularContrachequeComplementar,
  VERSAO_DO_MOTOR_COMPLEMENTAR,
  type ApuracaoAnteriorDaRubrica,
  type ContrachequeComplementar,
  type IdentidadeDaRubrica,
} from "./complementar.js";
import { escolherVersaoVigente, type VersaoLida } from "./rubrica-versionada.js";
import {
  avosDoExercicio,
  calcularContrachequeDoDecimoTerceiro,
  RubricaDaBaseSemVersaoError,
  RubricaDaParcelaSemVersaoError,
  VERSAO_DO_MOTOR_DO_13,
  type ContrachequeDoDecimoTerceiro,
  type EstadoMinimoDoAdiantamento,
  type ParcelaDaBase,
  type ProcedenciaDoAbatimento,
} from "./decimo-terceiro.js";
import { criterioDoAbatimentoNoCalculo, parametroVigenteDoExercicio } from "./decimo-terceiro-servico.js";
// V13 — o adiantamento salarial. Direção `servico.ts → aqui`, sem ciclo: nada dentro do M33
// importa `./servico.js`.
import {
  abatimentoDoAdiantamentoSalarialNaCompetencia,
  parametroVigenteDaCompetencia,
  type AbatimentoDaCompetencia,
} from "./adiantamento-salarial-servico.js";
import {
  calcularContrachequeDoAdiantamentoSalarial,
  BaseDoAdiantamentoSalarialAusenteError,
  RubricaDoAdiantamentoSalarialSemVersaoError,
  VERSAO_DO_MOTOR_DO_ADIANTAMENTO_SALARIAL,
  type AbatimentoDoAdiantamentoSalarial,
} from "./adiantamento-salarial.js";
// V11 V9.2 — a derivação da situação da certificação, para a PROCEDÊNCIA do abatimento na memória
// do contracheque. Aresta nova e sem ciclo: nada dentro do M33 importa `./servico.js`.
import { situacaoDaCertificacao, type FatoDaCertificacao } from "./certificacao.js";

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
  // A faixa isenta da tabela de redução (Lei 9.250/1995 art. 3º-A): renda e máximo juntos, e só sobre
  // o redutor linear, abaixo da renda máxima dele. O CHECK TabelaIrrf_redutor_faixa_isenta_chk repete
  // a regra no banco; aqui ela recusa antes de abrir a transação, com o motivo.
  const temRendaIsenta = d.redutorRendaDaFaixaIsenta !== null && d.redutorRendaDaFaixaIsenta !== undefined;
  const temMaximoIsenta = d.redutorMaximoNaFaixaIsenta !== null && d.redutorMaximoNaFaixaIsenta !== undefined;
  if (temRendaIsenta !== temMaximoIsenta) throw new Error("REDUTOR-FAIXA-ISENTA-INCOMPLETA: a faixa isenta do redutor vem com a renda e o valor máximo — os dois — ou não vem. Nada foi gravado.");
  if (temRendaIsenta && redutor !== 3) throw new Error("REDUTOR-FAIXA-ISENTA-SEM-REDUTOR: a faixa isenta só existe junto do redutor (base, fator e renda máxima). Nada foi gravado.");
  if (temRendaIsenta && !(d.redutorRendaDaFaixaIsenta as Decimal).lt(d.redutorRendaMaxima as Decimal)) throw new Error("REDUTOR-FAIXA-ISENTA-FORA: a renda da faixa isenta precisa ficar abaixo da renda máxima do redutor. Nada foi gravado.");
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
        redutorRendaDaFaixaIsenta: temRendaIsenta ? s2(d.redutorRendaDaFaixaIsenta as Decimal) : null,
        redutorMaximoNaFaixaIsenta: temMaximoIsenta ? s2(d.redutorMaximoNaFaixaIsenta as Decimal) : null,
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
    /**
     * ⚠️ A ORIENTAÇÃO TEM DE SER VERDADEIRA NO ESTADO EM QUE O OPERADOR ESTÁ (V11 V9.4b).
     *
     * Esta recusa dizia sempre **"Calcule-a"**. Quando a folha existente está FECHADA isso é um
     * REMÉDIO FALSO: `calcularFolha` recusa folha fechada, a barra nem apresenta o formulário, e
     * quem seguiu o conselho descobre duas telas adiante. É a mesma família do remédio falso que a
     * V11 V9.3 achou na barra do 13º — e no caso da MENSAL_COMPLEMENTAR é justamente o caso sem
     * saída de `SEGUNDA-COMPLEMENTAR-NA-MESMA-COMPETENCIA`: um segundo achado depois de a
     * complementar fechar não tem folha para entrar.
     *
     * ⚠️ E ISTO NÃO CONSTRÓI A SEGUNDA COMPLEMENTAR. A decisão de produto continua sendo UMA por
     * competência (`@@unique([competencia, tipo])`) e a pendência continua nomeada. O que muda é
     * a mensagem deixar de mentir sobre o que fazer.
     */
    const ja = await tx.folhaDePagamento.findUnique({
      where: { competencia_tipo: { competencia: d.competencia, tipo: d.tipo } },
      select: { id: true, fechamento: { select: { id: true } } },
    });
    if (ja !== null) {
      const aberta = ja.fechamento === null;
      throw new Error(
        `FOLHA-JA-ABERTA: a folha ${d.tipo} de ${d.competencia} já existe (${ja.id}) e está ` +
          (aberta ? `ABERTA` : `FECHADA`) +
          `. Existe UMA folha de cada tipo por competência, e ela não se abre duas vezes. ` +
          (aberta
            ? `O QUE FAZER: abra essa folha e RECALCULE — o cálculo seguinte absorve o que mudou no cadastro ` +
              `desde o anterior, e o número do cálculo avança sem folha nova.`
            : `⚠️ E ELA NÃO SE RECALCULA: fechar congela o cálculo, então não adianta abri-la para calcular de ` +
              `novo. O QUE FAZER: se o que falta é uma diferença ainda não apurada nesta competência, ela não ` +
              `tem folha onde entrar hoje — registre a pendência e trate o acerto fora deste caminho.`) +
          ` Nada foi gravado.`
      );
    }

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
    /**
     * ⚠️ V11 V9.4 — O EXERCÍCIO SAI DA CLASSIFICAÇÃO DO TIPO, não de uma comparação com `MENSAL`.
     * Isto era `d.tipo === "MENSAL" ? null : ...` — enumerava UM exemplar, e a mensal COMPLEMENTAR
     * teria nascido com exercício preenchido (coerente com o CHECK antigo e errada, porque ela
     * recorre dentro do ano). `exercicioDaFolha` e o CHECK `ck_folha_exercicio_por_tipo` derivam
     * agora da MESMA declaração, `NATUREZA_DO_TIPO_DE_FOLHA`.
     */
    const exercicio = exercicioDaFolha(d.tipo, d.competencia);
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
    tx.tabelaIrrf.findMany({ select: { id: true, competenciaInicio: true, competenciaFim: true, deducaoPorDependente: true, descontoSimplificado: true, isencaoMaior65: true, redutorBase: true, redutorFator: true, redutorRendaMaxima: true, redutorRendaDaFaixaIsenta: true, redutorMaximoNaFaixaIsenta: true, fundamentacaoLegal: true, faixas: { select: { ordem: true, ate: true, aliquota: true } } } }),
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
  const irrf = escolherVigente(irrfs.map((t) => ({ id: t.id, competenciaInicio: t.competenciaInicio, competenciaFim: t.competenciaFim, deducaoPorDependente: toMoney(t.deducaoPorDependente), descontoSimplificado: t.descontoSimplificado === null ? null : toMoney(t.descontoSimplificado), isencaoMaior65: t.isencaoMaior65 === null ? null : toMoney(t.isencaoMaior65), redutorBase: t.redutorBase === null ? null : toMoney(t.redutorBase), redutorFator: t.redutorFator === null ? null : new Decimal(t.redutorFator), redutorRendaMaxima: t.redutorRendaMaxima === null ? null : toMoney(t.redutorRendaMaxima), redutorRendaDaFaixaIsenta: t.redutorRendaDaFaixaIsenta === null ? null : toMoney(t.redutorRendaDaFaixaIsenta), redutorMaximoNaFaixaIsenta: t.redutorMaximoNaFaixaIsenta === null ? null : toMoney(t.redutorMaximoNaFaixaIsenta), fundamentacaoLegal: t.fundamentacaoLegal, faixas: t.faixas.map((f) => ({ ordem: f.ordem, ate: f.ate === null ? null : toMoney(f.ate), aliquota: new Decimal(f.aliquota) })) })), competencia, "IRRF");
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

/**
 * ═══ OS CONTRACHEQUES MENSAIS DE UMA COMPETÊNCIA — o motor mensal inteiro, sem gravar nada ═══
 *
 * ⚠️ ISTO SAIU DE DENTRO DE `calcularFolha` NA V11 V9.4, e a razão é a mesma que tirou
 * `resolvedorDeRubricas` de lá na V11 V9.1: a folha mensal COMPLEMENTAR precisa EXATAMENTE deste
 * cálculo, e de mais nada. Ela é a diferença entre o que este motor diz hoje e o que já foi
 * apurado — se a conta do "correto" fosse escrita de novo no caminho da complementar, as duas
 * divergiriam e cada uma teria o seu teste verde. É o defeito que a V8.16 custou com
 * `listarTiposConsignacao`.
 *
 * ⚠️ NENHUM `where` DE VÍNCULO AQUI, e a ausência é a garantia por construção de "todos os
 * vínculos vivos na competência" (ver o aviso do MODULO sobre o filtro de funcionários). O único
 * recorte é temporal.
 */
/**
 * A MENSAGEM DE `FOLHA-SEM-VINCULOS`, EM UM LUGAR SÓ.
 *
 * ⚠️ Ela é construída aqui, e não nos dois pontos que a lançam, pelo mesmo motivo que o "correto"
 * da complementar sai do motor mensal: duas redações do mesmo fato divergem, e cada uma fica com o
 * seu teste verde. O caminho MENSAL recusa dentro do motor; o COMPLEMENTAR recusa depois de
 * conferir o apurado — a recusa é a mesma, o momento é que muda.
 */
function motivoDeFolhaSemVinculos(
  competencia: string,
  selecao: SelecaoDoCalculo,
  excluidos: readonly LinhaDeAbrangencia[]
): string {
  // ⚠️ A MENSAGEM DISTINGUE OS DOIS CASOS, e a distinção não é cosmética: "o ente não tem
  // ninguém vivo nesta competência" e "os que você selecionou não são elegíveis" levam a
  // providências opostas, e a mensagem antiga diria a primeira coisa nos dois casos.
  const porQue =
    selecao.modo === "EXPLICITA"
      ? `nenhum dos ${new Set(selecao.vinculoIds).size} vínculo(s) SELECIONADO(S) é elegível em ${competencia} ` +
        `(${excluidos.map((e) => e.motivo).filter((m, i, a) => a.indexOf(m) === i).join(", ")})`
      : `nenhum vínculo vivo em ${competencia}`;
  return `FOLHA-SEM-VINCULOS: ${porQue}. Nada foi calculado.`;
}

/**
 * O QUE FAZER QUANDO NENHUM VÍNCULO SOBRA — e por que isso é do CHAMADOR, não do motor.
 *
 * `RECUSAR` é o comportamento do caminho MENSAL e continua sendo o padrão: sem vínculo elegível
 * não há folha, e não há mais nada a conferir.
 *
 * `DEVOLVER_VAZIO` existe para o caminho COMPLEMENTAR, onde "nenhum contracheque" NÃO é o fim da
 * história: pode haver vínculo com valor JÁ APURADO em folha fechada, e aí o fato que importa é o
 * dinheiro a repor ao erário, não a ausência de contracheque. Ver
 * `APURADO-A-REPOR-ENCOBERTO-POR-FOLHA-SEM-VINCULOS`.
 */
type AoFicarSemVinculos = "RECUSAR" | "DEVOLVER_VAZIO";

/**
 * ═══ ⚠️ V13 — O VALE ENTRA NA CONTA DO MÊS, OU NÃO ENTRA, E QUEM DECIDE É O CHAMADOR ═══
 *
 * `APLICAR` é o comportamento da MENSAL e da COMPLEMENTAR, e é o padrão: o que o adiantamento
 * salarial da competência já pagou tem de ser abatido, ou o ente paga a remuneração duas vezes.
 *
 * `IGNORAR` existe para UM chamador só: o motor do PRÓPRIO adiantamento salarial, quando a base
 * declarada pelo ente é `REMUNERACAO_PROJETADA_DO_MES`. Ele usa esta função para projetar a
 * remuneração da competência — e, se o abatimento fosse aplicado ali, a primeira coisa que
 * aconteceria seria a guarda `ADIANTAMENTO-SALARIAL-NAO-FECHADO` recusar o cálculo do vale por
 * causa da folha do próprio vale, que obviamente ainda não fechou. Beco sem saída na primeira
 * tentativa de usar a funcionalidade.
 *
 * ⚠️ E O PADRÃO É `APLICAR` DE PROPÓSITO: um caminho novo que esqueça de declarar abate. O
 * esquecimento seguro é o que desconta, nunca o que paga de novo.
 */
type AbatimentoDoVale = "APLICAR" | "IGNORAR";

async function contrachequesMensaisDaCompetencia(
  tx: Tx,
  competencia: string,
  selecao: SelecaoDoCalculo = SELECAO_DE_TODOS,
  aoFicarSemVinculos: AoFicarSemVinculos = "RECUSAR",
  abatimentoDoVale: AbatimentoDoVale = "APLICAR"
): Promise<{
  readonly finais: readonly ContrachequeCalculado[];
  readonly matriculaPorVinculo: ReadonlyMap<string, string>;
  readonly considerados: readonly string[];
  readonly excluidos: readonly LinhaDeAbrangencia[];
}> {
  const { inicio, fim } = bordasDaCompetencia(competencia);

  const tabelas = await lerTabelas(tx, competencia);
  const rubricasDoRegime = await resolvedorDeRubricas(tx, competencia);

  /**
   * ⚠️ V13 — O ADIANTAMENTO SALARIAL DESTA COMPETÊNCIA, LIDO AQUI E NÃO NUM MOTOR SEPARADO.
   *
   * O sítio é obrigatório, e a razão é a COMPLEMENTAR: ela chama esta mesma função para calcular
   * o "correto". Fora daqui, a mensal direta e o recálculo da complementar divergiriam — a
   * segunda aritmética sobre o mesmo dinheiro que este repositório existe para evitar. Com o
   * abatimento dentro, a mesma linha aparece nos DOIS lados da subtração da complementar (no
   * correto e no já apurado) e o delta dela é exatamente zero: a complementar segue funcionando
   * numa competência com vale, em vez de recusá-la.
   *
   * As guardas 1, 2, 4 e 5 (parâmetro ausente, vale não fechado, estado exigido não satisfeito)
   * moram dentro da leitura; a guarda 3 — o vínculo com vale que não aparece entre os finais —
   * roda logo abaixo, ANTES da recusa trivial por ausência de vínculo.
   */
  const abatimento: AbatimentoDaCompetencia | null =
    abatimentoDoVale === "IGNORAR" ? null : await abatimentoDoAdiantamentoSalarialNaCompetencia(tx, competencia);

  /**
   * ⚠️ V11 V9.5 — AQUI ESTÁ O `where` QUE NÃO EXISTIA, E COM ELE FOI EMBORA A GARANTIA POR
   * CONSTRUÇÃO. Até aqui a ausência de `where` era o que fazia "todos os vínculos vivos" ser
   * verdade sem que ninguém precisasse afirmá-lo. **Uma promessa mantida por construção some
   * junto com a construção** — a partir daqui quem promete é `exigirAbrangenciaCompleta`, e a
   * promessa mudou para "exatamente os selecionados e elegíveis, com cada exclusão nomeada".
   *
   * ⚠️ E O `where` SÓ RECORTA NO MODO EXPLÍCITO. Em `TODOS_OS_ELEGIVEIS` ele é `{}` — não por
   * economia, mas porque um `in` com a lista inteira dos vínculos do ente daria o mesmo resultado
   * por um caminho que envelhece: bastaria alguém admitir um servidor entre a montagem da lista e
   * esta consulta para o "todos" deixar de ser todos, em silêncio.
   */
  const recorte: Prisma.VinculoWhereInput =
    selecao.modo === "EXPLICITA" ? { id: { in: [...new Set(selecao.vinculoIds)] } } : {};

  const vinculos = await tx.vinculo.findMany({
    where: recorte,
    select: {
      id: true, matricula: true, dataAdmissao: true, regimePrevidenciario: true, servidorId: true,
      servidor: { select: { dataNascimento: true, dependentes: { select: { id: true, nome: true, dataNascimento: true, invalidezPermanente: true, finalidades: { select: { finalidade: true, dataInicio: true, limiteIdadeAnos: true, dataBaixa: true, encerramento: { select: { dataEfeito: true } } } } } } } },
      eventos: { select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true, regimePrevidenciario: true, gratificacaoDescricao: true, gratificacaoValor: true } },
      lancamentosDaFolha: { where: { competenciaInicio: { lte: competencia }, OR: [{ competenciaFim: null }, { competenciaFim: { gte: competencia } }] }, select: { id: true, rubricaId: true, tipo: true, valor: true } },
    },
    orderBy: { matricula: "asc" },
  });

  /**
   * ⚠️ V11 V9.5 — A REVALIDAÇÃO NO INSTANTE DO CÁLCULO, e não a confiança na tela. A seleção veio
   * de uma tela que pode ter envelhecido; entre ela e aqui um vínculo pode ter deixado de existir.
   * Ele NÃO some em silêncio: vira exclusão com motivo `VINCULO_INEXISTENTE`, gravada no fato do
   * cálculo e recuperável para sempre.
   */
  const { aConsiderar } = abrangenciaDeclarada(selecao, vinculos.map((v) => v.id));
  const excluidos: LinhaDeAbrangencia[] = [];

  const entradas: EntradaDoContracheque[] = [];
  for (const v of vinculos) {
    const eventos = v.eventos.map(paraEvento);
    const desligamento = dataDeDesligamento(eventos);
    // ⚠️ OS DOIS DESCARTES ABAIXO ERAM `continue` MUDOS ATÉ A V11 V9.5: o vínculo sumia e ninguém
    // sabia que ele havia passado por aqui. Com a seleção isso ficou MAIS grave, não menos — o
    // operador DECLAROU que queria aquele vínculo e não recebeu contracheque. Exclusão sem motivo
    // registrado é irmã de "existe como linha ≠ produziu efeito".
    if (diaCivil(v.dataAdmissao) > diaCivil(fim)) {
      excluidos.push({ vinculoId: v.id, calculado: false, motivo: "ADMITIDO_APOS_A_COMPETENCIA" });
      continue;
    }
    if (desligamento !== null && diaCivil(desligamento) < diaCivil(inicio)) {
      excluidos.push({ vinculoId: v.id, calculado: false, motivo: "DESLIGADO_ANTES_DA_COMPETENCIA" });
      continue;
    }
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
    /**
     * ⚠️ V13 — A RUBRICA DO ABATIMENTO É RESOLVIDA POR REGIME, AQUI, E A AUSÊNCIA É RECUSA.
     *
     * `resolvedorDeRubricas` só devolve rubricas com VERSÃO VIGENTE para o regime do vínculo. Se
     * a rubrica que o parâmetro declara não tiver versão aprovada, ela não entra na lista, o
     * motor puro nunca emite a linha e o vale seria pago duas vezes — uma no adiantamento, outra
     * na mensal inteira — com a folha fechando e os totais batendo.
     *
     * A recusa é aqui porque só aqui se sabe o regime. `calcularContracheque` tem uma guarda
     * parecida, afirmada pelo EFEITO ("saiu linha para esta rubrica?").
     *
     * ⚠️ E A MEDIÇÃO DESMENTIU O QUE SERIA CÔMODO AFIRMAR: aquela guarda **NÃO** é defesa em
     * profundidade para ESTE caso. Mutação da V13 rodada 2 (`servico.ts` 441ba831 → 1a2f7ed4,
     * revertida com checksum): trocar o `throw` abaixo por um `if (rAbat !== undefined)` deixa
     * `abatimentoDoAdiantamentoSalarial` INDEFINIDO na entrada, e a guarda do domínio — que só
     * dispara quando o abatimento foi PEDIDO — nem chega a olhar. O caso `u2` de
     * `m33-adiantamento-salarial-pago.test.ts` ficou vermelho **sozinho**: este `throw` é a ÚNICA
     * coisa entre a rubrica revogada e o ente pagar a remuneração inteira a quem já recebeu 40%.
     *
     * A guarda do domínio cobre outra coisa, e continua valendo por ela: a rubrica está na lista,
     * foi passada na entrada, e mesmo assim não produziu linha — o caso de ela ter mudado de
     * natureza entre o parâmetro e o cálculo.
     */
    let abatimentoDoVinculo: AbatimentoDoAdiantamentoSalarial | undefined;
    const adiantado = abatimento?.porVinculo.get(v.id);
    if (abatimento !== null && adiantado !== undefined && adiantado.gt(0)) {
      const rAbat = rubricasDoRegime(regime).find((r) => r.id === abatimento.rubricaDoAbatimentoId);
      if (rAbat === undefined) throw new RubricaDoAbatimentoSalarialAusenteError(v.matricula, competencia, adiantado);
      abatimentoDoVinculo = { rubrica: rAbat, valor: adiantado, procedencia: abatimento.procedencia };
    }

    entradas.push({
      competencia,
      vinculo: { id: v.id, matricula: v.matricula, regime, dataNascimento: v.servidor.dataNascimento },
      ...(abatimentoDoVinculo === undefined ? {} : { abatimentoDoAdiantamentoSalarial: abatimentoDoVinculo }),
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
  /**
   * ═══ ⚠️ V13, GUARDA 3 — O VALE PAGO QUE NINGUÉM VAI ABATER, E ELA FALA ANTES DA TRIVIAL ═══
   *
   * ⚠️ A ORDEM É O PONTO, e ela é a lição de `APURADO-A-REPOR-ENCOBERTO-POR-FOLHA-SEM-VINCULOS`
   * aplicada ANTES de o defeito nascer, em vez de depois. Se a recusa trivial ("nenhum vínculo
   * elegível") estourasse primeiro, o operador leria "não há ninguém para calcular" e iria embora
   * — com dinheiro do ente adiantado a alguém e nenhuma folha para descontá-lo. A informação
   * grave é "há vale pago que ninguém vai abater", e é ela que tem de chegar primeiro.
   *
   * ⚠️ E O CONJUNTO É `considerados`, NUNCA A LISTA INTEIRA DE QUEM RECEBEU VALE. Esta é a
   * diferença entre uma guarda e um bloqueio indiscriminado: num cálculo com seleção EXPLÍCITA,
   * todo vínculo NÃO selecionado que tenha recebido vale cairia no filtro, e o operador que pediu
   * duas matrículas receberia uma recusa citando as outras novecentas. O que se acusa é quem o
   * operador PEDIU e o motor não alcançou — não quem ele não pediu.
   *
   * ⚠️ E O LADO CERTO É "PRODUZIU CONTRACHEQUE", NÃO "EXISTE COMO LINHA": `entradas` é quem
   * chegou ao cálculo; `vinculos` inclui os que o laço pulou com motivo. Confundir os dois é como
   * a guarda irmã da complementar nasceu INERTE, e foi o teste que a pegou.
   */
  if (abatimento !== null && abatimento.porVinculo.size > 0) {
    const chegaram = new Set(entradas.map((e) => e.vinculo.id));
    const considerados = new Set(aConsiderar);
    const orfaos = [...abatimento.porVinculo.keys()].filter((id) => considerados.has(id) && !chegaram.has(id));
    if (orfaos.length > 0) {
      const nomes = orfaos.map((id) => abatimento.matriculaPorVinculo.get(id) ?? id).sort();
      const total = sumMoney(orfaos.map((id) => abatimento.porVinculo.get(id)!));
      throw new Error(
        `VINCULO-DO-ADIANTAMENTO-SALARIAL-FORA-DA-MENSAL: a(s) matrícula(s) ${nomes.join(", ")} receberam ` +
          `${emProsa(total.toFixed(2))} de adiantamento salarial em ${competencia} e NÃO entram no cálculo da ` +
          `folha mensal desta competência (vida funcional alterada depois do vale — um desligamento com data ` +
          `retroativa, por exemplo). Para elas não há de onde abater o que já foi adiantado, e seguir sem elas ` +
          `pagaria os demais e calaria sobre este valor, com os totais fechando. Isso é dinheiro a repor ao ` +
          `erário, ato próprio que não existe neste sistema. Trate-as fora desta folha. Nada foi calculado.`
      );
    }
  }

  if (entradas.length === 0 && aoFicarSemVinculos === "RECUSAR") {
    throw new Error(motivoDeFolhaSemVinculos(competencia, selecao, excluidos));
  }

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

  return {
    finais,
    matriculaPorVinculo: new Map(vinculos.map((v) => [v.id, v.matricula])),
    considerados: aConsiderar,
    excluidos,
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
    /**
     * ═══ ⚠️ V11 V9.5 — A SEGUNDA COBRANÇA, E SÓ QUEM RECORTA A PAGA ═══
     *
     * `CALCULAR_FOLHA` autoriza calcular; `SELECIONAR_VINCULOS_DA_FOLHA` autoriza **recortar quem
     * entra**. São autoridades diferentes: a primeira decide QUANDO pagar, a segunda decide QUEM
     * fica de fora — e um recorte errado produz folha parcial que fecha com o total, o empenho e a
     * liquidação batendo.
     *
     * ⚠️ E A SEPARAÇÃO PRODUZ O PADRÃO CONSERVADOR, não um estado pela metade: quem tem apenas
     * `CALCULAR_FOLHA` continua podendo calcular TODOS. É o contrário do que aconteceria com
     * `cadastrarFuncao` sob uma ação própria, onde separar deixaria o ente podendo criar cargo
     * sem poder criar função — estrutura pela metade. O critério é o mesmo (é a MESMA
     * autoridade?), e nos dois casos a resposta é que decide, não a conveniência.
     *
     * ⚠️ NUNCA `CONSULTAR_PESSOAL`. Quem pode VER a lista de servidores não pode, por isso,
     * escolher quem o ente paga — é a segregação do TR 6.4, e reusar a ação de leitura aqui a
     * furaria em silêncio.
     */
    const selecao: SelecaoDoCalculo =
      d.selecao === undefined ? SELECAO_DE_TODOS : { modo: d.selecao.modo, vinculoIds: d.selecao.vinculoIds };
    if (selecao.modo === "EXPLICITA") {
      // ⚠️ A AÇÃO VAI DIRETA, E NÃO POR `ACAO_DO_SERVICO`, PORQUE NÃO HÁ SERVIÇO NOVO. Aquele mapa
      // é serviço → ação, e `selecionar` não é um serviço: é uma SEGUNDA COBRANÇA dentro de
      // `calcularFolha`. Inventar uma chave lá para "ficar simétrico" poria no censo de serviços
      // um nome que nenhuma função exporta — e o censo deixaria de descrever o que existe.
      await autorizarNo(tx, d.criadoPor, "SELECIONAR_VINCULOS_DA_FOLHA", "ENTE");
    }
    const folha = await tx.folhaDePagamento.findUnique({ where: { id: d.folhaId }, select: { id: true, competencia: true, tipo: true, exercicio: true, folhaDoAdiantamentoId: true, fechamento: { select: { id: true, calculo: { select: { numero: true } } } }, calculos: { select: { numero: true }, orderBy: { numero: "desc" }, take: 1 } } });
    if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi calculado.`);
    if (folha.fechamento !== null) throw new Error(`FOLHA-FECHADA: a folha ${folha.tipo} de ${folha.competencia} foi fechada sobre o cálculo nº ${folha.fechamento.calculo.numero}; não se recalcula. Nada foi calculado.`);
    /**
     * ═══ QUAL MOTOR CALCULA ESTA FOLHA — e a escolha é EXAUSTIVA, não um `!== "MENSAL"` ═══
     *
     * ⚠️ ISTO ERA `if (folha.tipo !== "MENSAL") return <motor do 13º>`, e era a MESMA forma errada
     * do CHECK que a V11 V9.4 substituiu: enumerava um exemplar e jogava todo o resto no `!==`.
     * Com ela, a folha mensal COMPLEMENTAR teria caído no motor do 13º — que exigiria o parâmetro
     * do exercício e recusaria com `PARAMETRO-DO-13-AUSENTE`, uma mensagem que não tem nada a ver
     * com o que o operador pediu.
     *
     * ⚠️ O `never` DO `default` É A IMPOSSIBILIDADE: um valor novo em `TipoDeFolha` faz este
     * arquivo DEIXAR DE COMPILAR até ganhar motor. E o `throw` continua ali para o caso que o
     * compilador não alcança — um valor que chegue do BANCO sem estar no enum do TypeScript —,
     * fail-closed, em vez de escorregar para o motor mensal e calcular a folha errada em silêncio.
     */
    const tipoDaFolha = folha.tipo as TipoDeFolha;
    switch (tipoDaFolha) {
      case "ADIANTAMENTO_DECIMO_TERCEIRO":
      case "DECIMO_TERCEIRO":
        // V11 V9.1 — as duas folhas de 13º têm outro motor: a medida é o avo do exercício, não o
        // dia do mês. Tudo o mais (numeração do cálculo, cancelamento, fechamento, atesto,
        // empenho) é o mesmo, porque opera sobre `CalculoDaFolha` e `Contracheque`.
        /**
         * ⚠️ O MOTOR DO 13º AINDA NÃO RECORTA, E A RECUSA É DELIBERADA — nunca aceitar e ignorar.
         *
         * Aceitar a seleção aqui e calculá-la por inteiro gravaria `modoDeSelecao = EXPLICITA`
         * numa folha que processou TODOS: o registro de abrangência diria uma coisa e o cálculo
         * teria feito outra. Seria pior que a ausência da funcionalidade — uma folha que MENTE
         * sobre o próprio recorte, e o operador sairia convencido de que recortou.
         *
         * Fica nomeada como `SELECAO-NO-13-NAO-CONSTRUIDA` no MODULO do M33. O motor do 13º tem o
         * próprio `findMany` e a própria medida (o avo do exercício, não o dia do mês); levá-lo
         * junto exigiria repetir aqui a guarda de completude e a revalidação, e isso é unidade
         * própria — não apêndice desta.
         */
        if (selecao.modo === "EXPLICITA") {
          throw new Error(
            `SELECAO-NAO-SUPORTADA-NESTE-TIPO: a folha ${folha.tipo} de ${folha.competencia} calcula ` +
              `todos os vínculos com avos no exercício; o recorte por seleção ainda não foi construído ` +
              `para ela. Calcule sem seleção, ou use a folha MENSAL. Nada foi calculado.`
          );
        }
        return calcularFolhaDoDecimoTerceiroNaTx(tx, folha, d.motivo ?? null, d.criadoPor);
      case "MENSAL_COMPLEMENTAR":
        // V11 V9.4 — o motor MENSAL inteiro, menos o que já foi apurado nesta competência.
        return calcularFolhaComplementarNaTx(tx, folha, d.motivo ?? null, d.criadoPor, selecao);
      case "ADIANTAMENTO_SALARIAL":
        // V13 — o vale do mês: percentual do parâmetro sobre a base que o ente declarou.
        return calcularFolhaDoAdiantamentoSalarialNaTx(tx, folha, d.motivo ?? null, d.criadoPor, selecao);
      case "MENSAL":
        break;
      default: {
        const semMotor: never = tipoDaFolha;
        throw new Error(
          `TIPO-DE-FOLHA-SEM-MOTOR: a folha ${String(semMotor)} de ${folha.competencia} é de um tipo ` +
            `que este motor não sabe calcular. Nada foi calculado.`
        );
      }
    }
    const competencia = folha.competencia;
    const { finais, considerados, excluidos } = await contrachequesMensaisDaCompetencia(tx, competencia, selecao);

    /**
     * ═══ ⚠️ A GUARDA DE COMPLETUDE — o que substituiu a ausência de `where` ═══
     *
     * Afirma que TODO vínculo considerado terminou em exatamente um dos dois lados: produziu
     * contracheque, ou tem exclusão NOMEADA. Não é `contracheques.length === considerados.length`
     * — essa igualdade passa quando um selecionado some e um intruso entra. A conferência é de
     * CONJUNTO, e é a propriedade que a construção anterior sustentava sozinha.
     */
    exigirAbrangenciaCompleta(considerados, finais.map((c) => c.vinculoId), excluidos);

    // gravar
    const numero = (folha.calculos[0]?.numero ?? 0) + 1;
    const totalProventos = sumMoney(finais.map((c) => c.totais.proventos));
    const totalDescontos = sumMoney(finais.map((c) => c.totais.descontos));
    const totalLiquido = toMoney(totalProventos.minus(totalDescontos));
    const sha256 = sha256Canonico({ motor: VERSAO_DO_MOTOR, competencia, contracheques: finais.map((c) => c.sha256).sort() });
    const calculo = await tx.calculoDaFolha.create({
      data: { folhaId: folha.id, numero, motivo: d.motivo ?? null, totalProventos: s2(totalProventos), totalDescontos: s2(totalDescontos), totalLiquido: s2(totalLiquido), contracheques: finais.length, sha256, versaoDoMotor: VERSAO_DO_MOTOR, modoDeSelecao: selecao.modo, criadoPor: d.criadoPor },
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
    // ⚠️ O FATO DE ABRANGÊNCIA, GRAVADO NA MESMA TRANSAÇÃO DOS CONTRACHEQUES. Fora dela, uma falha
    // entre as duas gravações deixaria um cálculo cujo registro de quem entrou não corresponde a
    // quem tem contracheque — e a guarda de completude, que roda ANTES, não alcançaria isso.
    await gravarAbrangencia(tx, calculo.id, finais.map((c) => c.vinculoId), excluidos);

    return { calculoId: calculo.id, numero, contracheques: finais.length, totalProventos, totalDescontos, totalLiquido, sha256 };
  }, { timeout: 120000 });
}

/**
 * GRAVA O FATO DE ABRANGÊNCIA — uma linha por vínculo considerado, calculado ou excluído.
 *
 * ⚠️ O CHECK `ck_abrangencia_motivo_bicondicional` É QUEM IMPEDE A EXCLUSÃO MUDA: `calculado` e
 * `motivo IS NULL` têm de coincidir. Sem ele, gravar `calculado = false, motivo = null` seria o
 * `continue` mudo de volta — agora com uma linha no banco para PARECER que há registro, que é
 * pior do que não ter linha nenhuma.
 */
async function gravarAbrangencia(
  tx: Tx,
  calculoId: string,
  calculados: readonly string[],
  excluidos: readonly LinhaDeAbrangencia[]
): Promise<void> {
  for (const vinculoId of calculados) {
    await tx.abrangenciaDoCalculo.create({ data: { calculoId, vinculoId, calculado: true, motivo: null } });
  }
  for (const e of excluidos) {
    await tx.abrangenciaDoCalculo.create({ data: { calculoId, vinculoId: e.vinculoId, calculado: false, motivo: e.motivo } });
  }
}

/**
 * ═══ A FOLHA MENSAL COMPLEMENTAR — "pagar o que faltou" (V11 V9.4, TR 5.12.50) ═══
 *
 * ⚠️ NENHUMA CONTA NOVA. O "correto" sai de `contrachequesMensaisDaCompetencia`, que é o motor
 * mensal inteiro — as mesmas tabelas vigentes, as mesmas versões de rubrica, a mesma
 * proporcionalidade de dias, a mesma agregação por pessoa. O que este caminho acrescenta é a
 * SUBTRAÇÃO, e ela é por rubrica (`complementar.ts`, domínio puro).
 *
 * ⚠️ O QUE ENTRA NO "JÁ APURADO" É DECLARADO, NÃO DEDUZIDO: as folhas FECHADAS desta competência
 * cujo tipo `compoeARemuneracaoMensal` (`NATUREZA_DO_TIPO_DE_FOLHA`). A folha de ADIANTAMENTO do
 * 13º de 2026-06 é uma folha DA competência 2026-06 e NÃO entra — somá-la faria a complementar de
 * junho abater do salário metade do 13º do servidor, com os totais fechando.
 *
 * ⚠️ E SÓ CÁLCULO FECHADO CONTA — nunca o vivo, nunca o cancelado. É a mesma regra de
 * `fecharFolha`: o que vale é o cálculo que FECHOU a folha. Ler um cálculo vivo faria a
 * complementar subtrair um número que ainda pode mudar; ler um cancelado subtrairia o que ninguém
 * deve.
 */
async function calcularFolhaComplementarNaTx(
  tx: Tx,
  folha: { readonly id: string; readonly competencia: string; readonly tipo: string; readonly calculos: readonly { readonly numero: number }[] },
  motivo: string | null,
  criadoPor: string,
  selecao: SelecaoDoCalculo = SELECAO_DE_TODOS
): Promise<ResultadoDoCalculo> {
  const competencia = folha.competencia;

  // ── (1) o que já foi apurado nesta competência, e por qual folha ────────────
  const daCompetencia = await tx.folhaDePagamento.findMany({
    where: { competencia },
    select: {
      id: true,
      tipo: true,
      fechamento: { select: { calculoId: true, calculo: { select: { numero: true } } } },
    },
  });
  const mensal = daCompetencia.find((f) => f.tipo === "MENSAL") ?? null;
  /**
   * ⚠️ SEM MENSAL FECHADA NÃO HÁ COMPLEMENTO — HÁ DUPLICAÇÃO. O delta é "o correto menos o já
   * apurado"; com nada apurado, o delta é o valor INTEIRO, e a complementar pagaria a folha do mês
   * de novo. Os totais fechariam, o empenho fecharia, a liquidação fecharia e nenhuma etapa
   * adiante acusaria — que é a forma exata de defeito que este módulo já pagou três vezes.
   *
   * ⚠️ E A RECUSA É NA MENSAL ESPECIFICAMENTE, não em "alguma folha fechada": uma competência em
   * que só houvesse uma complementar fechada é estado que este serviço nunca produz, e aceitá-lo
   * seria aceitar um buraco que ninguém sabe como se abriu.
   */
  if (mensal === null || mensal.fechamento === null) {
    throw new Error(
      `MENSAL-NAO-FECHADA: a folha mensal de ${competencia} ` +
        (mensal === null ? `não existe` : `existe (${mensal.id}) e ainda não foi fechada`) +
        `. A folha COMPLEMENTAR paga a DIFERENÇA entre o correto e o que já foi apurado — sem a ` +
        `mensal fechada não há o que completar, e o cálculo pagaria a competência INTEIRA uma ` +
        `segunda vez, com os totais fechando e nada acusando adiante. ` +
        (mensal === null
          ? `Abra e feche a folha mensal de ${competencia} antes.`
          : `Feche a folha mensal de ${competencia} antes; enquanto ela está aberta, o certo é corrigir NELA e recalcular.`) +
        ` Nada foi calculado.`
    );
  }

  const fechadasQueCompoem = daCompetencia.filter(
    (f) =>
      f.id !== folha.id &&
      f.fechamento !== null &&
      (TIPOS_QUE_COMPOEM_A_REMUNERACAO_MENSAL as readonly string[]).includes(f.tipo)
  );
  const fechamentoPorCalculo = new Map(
    fechadasQueCompoem.map((f) => [f.fechamento!.calculoId, { tipo: f.tipo, numero: f.fechamento!.calculo.numero }])
  );

  const linhasApuradas = await tx.linhaDoContracheque.findMany({
    where: { contracheque: { calculoId: { in: [...fechamentoPorCalculo.keys()] } } },
    select: {
      valor: true,
      rubricaId: true,
      contracheque: { select: { calculoId: true, vinculoId: true, vinculo: { select: { matricula: true } } } },
    },
  });

  type ApuradoMutavel = { total: Money; parcelas: { folhaTipo: string; competencia: string; calculoNumero: number; valor: Money }[] };
  const apuradoPorVinculo = new Map<string, Map<string, ApuradoMutavel>>();
  const matriculaApurada = new Map<string, string>();
  for (const l of linhasApuradas) {
    const vinculoId = l.contracheque.vinculoId;
    matriculaApurada.set(vinculoId, l.contracheque.vinculo.matricula);
    const deste = apuradoPorVinculo.get(vinculoId) ?? new Map<string, ApuradoMutavel>();
    const atual = deste.get(l.rubricaId) ?? { total: toMoney(0), parcelas: [] };
    const fonte = fechamentoPorCalculo.get(l.contracheque.calculoId)!;
    atual.total = toMoney(atual.total.plus(toMoney(l.valor)));
    atual.parcelas.push({ folhaTipo: fonte.tipo, competencia, calculoNumero: fonte.numero, valor: toMoney(l.valor) });
    deste.set(l.rubricaId, atual);
    apuradoPorVinculo.set(vinculoId, deste);
  }

  // ── (2) o CORRETO, pelo motor mensal, sem uma linha de conta nova ───────────
  /**
   * ═══ ⚠️ `DEVOLVER_VAZIO` — A ORDEM DAS GUARDAS, E O DINHEIRO QUE ELA DEIXAVA DE MOSTRAR ═══
   *
   * Até aqui este caminho recebia `FOLHA-SEM-VINCULOS` de DENTRO do motor, e a guarda de
   * `VINCULO-APURADO-FORA-DO-RECALCULO` logo abaixo nunca chegava a rodar. Quando o único vínculo
   * selecionado é inelegível E tem valor apurado em folha fechada, a recusa trivial ("nenhum
   * vínculo elegível") estourava primeiro e CALAVA sobre o valor a repor ao erário: o operador
   * lia "não há ninguém para calcular" e ia embora, com dinheiro do ente pendente e sem nome.
   *
   * As duas recusas continuam existindo, e nenhuma virou aviso. O que mudou é a ORDEM: primeiro se
   * confere o que foi apurado e não volta ao recálculo, depois se recusa por ausência de vínculo.
   * A mais grave fala primeiro, e ela é a que traz a pendência financeira junto.
   */
  const { finais, matriculaPorVinculo, considerados, excluidos } = await contrachequesMensaisDaCompetencia(tx, competencia, selecao, "DEVOLVER_VAZIO");

  /**
   * ⚠️ QUEM FOI APURADO E NÃO ENTRA MAIS NO RECÁLCULO É RECUSA, NÃO OMISSÃO.
   *
   * Um vínculo pago em maio e que o recálculo de hoje não alcança (desligamento registrado depois,
   * com data retroativa, por exemplo) tem "correto = 0" e "apurado > 0" — diferença NEGATIVA. Se
   * a iteração fosse só pelos contracheques corretos, ele sumiria do cálculo e a complementar
   * sairia normal, pagando as diferenças dos outros e calando sobre o único caso em que o ente
   * tem dinheiro a receber de volta. Recusar aqui devolve a decisão a quem pode tomá-la.
   */
  /**
   * ⚠️ E O CONJUNTO CERTO É O DE QUEM PRODUZIU CONTRACHEQUE, NÃO O DE QUEM EXISTE COMO LINHA —
   * esta guarda nasceu INERTE e foi o teste que a pegou.
   *
   * A primeira versão filtrava por `matriculaPorVinculo`, que é montado sobre TODOS os vínculos
   * do `findMany` — inclusive os que o laço pula com `continue` (admitido depois do fim da
   * competência, desligado antes do início). `has(id)` era verdadeiro para qualquer vínculo que
   * ainda existisse no banco, então a recusa NUNCA disparava: a folha calculava normalmente e
   * calava sobre o único caso em que o ente tem a receber de volta.
   *
   * ⚠️ E `matriculaPorVinculo` CONTINUA COMPLETO DE PROPÓSITO: é dele que sai o nome da matrícula
   * na mensagem, e as matrículas que a mensagem precisa nomear são justamente as PULADAS. Trocar
   * a fonte dos dois teria consertado a guarda e quebrado a mensagem.
   *
   * "Existe como linha" e "produziu efeito" são coisas diferentes, e confundi-las é a doença
   * desta rodada — a mesma que deixou um guard verde por casar com o censo que nomeia o serviço.
   */
  const comContracheque = new Set(finais.map((c) => c.vinculoId));
  /**
   * ═══ ⚠️ V11 V9.5 — A RECONCILIAÇÃO COM A SELEÇÃO, E O RISCO DE ELA NASCER INERTE ═══
   *
   * Até aqui esta guarda percorria `apuradoPorVinculo` INTEIRO. Com seleção isso acusaria em massa
   * uma coisa que não aconteceu: **todo** vínculo não selecionado cairia no filtro. Ela colapsava
   * três fatos distintos num só, e agora eles se separam:
   *
   *   · FORA DA SELEÇÃO — o operador não pediu. Não é anomalia; é exclusão registrada em (c).
   *   · SELECIONADO E INELEGÍVEL — vira exclusão com motivo, e é MAIS grave que antes, porque o
   *     operador declarou que queria.
   *   · SELECIONADO, APURADO EM FOLHA FECHADA E FORA DO RECÁLCULO — continua acusando: correto
   *     zero, apurado maior, valor a repor ao erário.
   *
   * ═══ ⚠️ E AQUI ESTÁ O QUE A MUTAÇÃO MEDIU, contra o que este comentário ia afirmar ═══
   *
   * A intenção era escrever que trocar `considerados` por `matriculaPorVinculo` mataria a guarda —
   * a mesma forma com que ela nasceu inerte da primeira vez. **A mutação foi feita e NÃO acusou:
   * 13/13 verdes com o conjunto trocado.** E a causa é boa notícia, não defeito:
   *
   * **O `where` do `findMany` já fez a reconciliação.** No modo EXPLICITA o motor lê SÓ os
   * selecionados, então `matriculaPorVinculo` e `considerados` são o mesmo conjunto — a filtragem
   * por `consideradoAgora` é **redundante enquanto o `where` existir**.
   *
   * ⚠️ ENTÃO ELA FICA COMO DEFESA EM PROFUNDIDADE, DECLARADA COMO TAL — e não como guarda provada.
   * Ela existe para o dia em que alguém remover o `where` (por desempenho, por refactor, por um
   * caminho novo que leia todos e filtre em memória): nesse dia ela passa a ser a única coisa
   * separando "não foi selecionado" de "sumiu do recálculo". **O que está provado é a guarda em
   * si** — mutá-la inteira (`if (false && …)`) deixa o caso real vermelho. O que NÃO está provado
   * é esta linha, e dizer isso é a diferença entre documentar e atestar pela papelada.
   */
  const consideradoAgora = new Set(considerados);
  const semRecalculo = [...apuradoPorVinculo.keys()]
    .filter((id) => consideradoAgora.has(id))
    .filter((id) => !comContracheque.has(id));
  if (semRecalculo.length > 0) {
    const nomes = semRecalculo.map((id) => matriculaApurada.get(id) ?? id).sort();
    throw new Error(
      `VINCULO-APURADO-FORA-DO-RECALCULO: a(s) matrícula(s) ${nomes.join(", ")} têm valores apurados ` +
        `em folha fechada de ${competencia} e NÃO entram no recálculo desta competência (vida ` +
        `funcional alterada depois do fechamento). Para elas o correto é ZERO e o já apurado é ` +
        `maior — isso é valor a repor ao erário, ato próprio que não existe neste sistema. ` +
        `Seguir sem elas pagaria as diferenças dos demais e calaria sobre estas, com os totais ` +
        `fechando. Trate-as fora desta folha. Nada foi calculado.`
    );
  }

  /**
   * ⚠️ AGORA SIM, A AUSÊNCIA DE VÍNCULO — depois de o apurado ter tido a sua chance de falar.
   *
   * Chegar aqui com `finais` vazio significa as duas coisas ao mesmo tempo: nenhum selecionado é
   * elegível E nenhum deles tem valor apurado em folha fechada pendurado. Aí a recusa por ausência
   * é o motivo VERDADEIRO, e é a mesma mensagem que o caminho mensal dá — não uma segunda redação.
   *
   * ⚠️ E ELA É RECUSA, NÃO COMPLEMENTAR VAZIA. Seguir com zero contracheques criaria um cálculo de
   * folha sem nenhuma linha, que fecha, empenha e liquida sem nada acusar adiante.
   */
  if (finais.length === 0) {
    throw new Error(motivoDeFolhaSemVinculos(competencia, selecao, excluidos));
  }

  // ── (3) a identidade de toda rubrica citada, inclusive as que só o passado tem ──
  const identidade = new Map<string, IdentidadeDaRubrica>();
  for (const c of finais) {
    for (const l of c.linhas) {
      identidade.set(l.rubricaId, { id: l.rubricaId, codigo: l.codigo, descricao: l.descricao, tipo: l.tipo, natureza: l.natureza, ordem: l.ordem });
    }
  }
  const soNoPassado = [...new Set(linhasApuradas.map((l) => l.rubricaId))].filter((id) => !identidade.has(id));
  if (soNoPassado.length > 0) {
    const rs = await tx.rubrica.findMany({ where: { id: { in: soNoPassado } }, select: { id: true, codigo: true, descricao: true, tipo: true, natureza: true, ordem: true } });
    for (const r of rs) {
      identidade.set(r.id, { id: r.id, codigo: r.codigo, descricao: r.descricao, tipo: r.tipo as IdentidadeDaRubrica["tipo"], natureza: r.natureza as IdentidadeDaRubrica["natureza"], ordem: r.ordem });
    }
  }

  // ── (4) a diferença, vínculo a vínculo ─────────────────────────────────────
  const calculados: ContrachequeComplementar[] = [];
  for (const correto of finais) {
    const matricula = matriculaPorVinculo.get(correto.vinculoId)!;
    const jaApurado: Map<string, ApuracaoAnteriorDaRubrica> = new Map(
      [...(apuradoPorVinculo.get(correto.vinculoId) ?? new Map<string, ApuradoMutavel>())].map(
        ([rubricaId, a]): [string, ApuracaoAnteriorDaRubrica] => [rubricaId, { total: a.total, parcelas: a.parcelas }]
      )
    );
    const c = calcularContrachequeComplementar({ competencia, matricula, correto, jaApurado, identidadeDaRubrica: identidade });
    // Diferença zero não é contracheque de zero: é contracheque que não existe. Gravar uma linha
    // zerada faria a lista de quem recebeu complementar mentir sobre quem recebeu.
    if (c !== null) calculados.push(c);
  }

  if (calculados.length === 0) {
    throw new Error(
      `COMPLEMENTAR-SEM-DIFERENCA: o recálculo de ${competencia} com o cadastro de hoje chega ` +
        `EXATAMENTE ao que as folhas fechadas desta competência já apuraram, para todos os ` +
        `vínculos — não há o que complementar. Se havia uma correção a fazer, ela ainda não está ` +
        `no cadastro: lance a rubrica, corrija a remuneração ou registre o evento, e calcule de ` +
        `novo. Nada foi calculado.`
    );
  }

  // ── (5) gravar, pelos mesmos fatos de sempre ───────────────────────────────
  const numero = (folha.calculos[0]?.numero ?? 0) + 1;
  const totalProventos = sumMoney(calculados.map((c) => c.totais.proventos));
  const totalDescontos = sumMoney(calculados.map((c) => c.totais.descontos));
  const totalLiquido = toMoney(totalProventos.minus(totalDescontos));
  const sha256 = sha256Canonico({ motor: VERSAO_DO_MOTOR_COMPLEMENTAR, competencia, tipo: folha.tipo, contracheques: calculados.map((c) => c.sha256).sort() });
  const calculo = await tx.calculoDaFolha.create({
    data: { folhaId: folha.id, numero, motivo, totalProventos: s2(totalProventos), totalDescontos: s2(totalDescontos), totalLiquido: s2(totalLiquido), contracheques: calculados.length, sha256, versaoDoMotor: VERSAO_DO_MOTOR_COMPLEMENTAR, modoDeSelecao: selecao.modo, criadoPor },
    select: { id: true },
  });
  for (const c of calculados) {
    await tx.contracheque.create({
      data: {
        calculoId: calculo.id, vinculoId: c.vinculoId, regime: c.regime,
        /**
         * ⚠️ `diasComputados` É O DA COMPETÊNCIA e `avosComputados` FICA NULO. O CHECK
         * `ck_contracheque_avos_ou_dias` exige exatamente uma das duas medidas, e a medida da
         * complementar é a mesma da mensal: ela é diferença de uma folha mensal, não de um 13º.
         */
        diasComputados: c.diasComputados,
        totalProventos: s2(c.totais.proventos), totalDescontos: s2(c.totais.descontos), liquido: s2(c.totais.liquido),
        baseContribuicao: s2(c.totais.baseContribuicao), contribuicao: s2(c.totais.contribuicao), baseIrrf: s2(c.totais.baseIrrf), irrf: s2(c.totais.irrf),
        memoria: c.memoria as object, sha256: c.sha256,
        linhas: { create: c.linhas.map((l) => ({ rubricaId: l.rubricaId, ordem: l.ordem, tipo: l.tipo, valorBase: s2(l.valorBase), fator: l.fator.toFixed(6), valor: s2(l.valor), incideContribuicao: l.incideContribuicao, incideIrrf: l.incideIrrf, memoria: l.memoria })) },
      },
    });
  }
  /**
   * ⚠️ NA COMPLEMENTAR HÁ UM QUARTO DESTINO, e ele não existia como conceito antes desta unidade:
   * quem foi CONSIDERADO, é ELEGÍVEL e produziu contracheque no motor mensal, mas cujo correto
   * COINCIDE com o já apurado — não há diferença a pagar. Antes ele simplesmente não aparecia no
   * resultado, e "não apareceu" era indistinguível de "não foi considerado".
   *
   * Agora ele é exclusão NOMEADA (`SEM_DIFERENCA_A_PAGAR`), que é a resposta certa e a mais útil:
   * é ela que permite ao operador conferir que o vínculo FOI olhado e estava correto, em vez de
   * ficar sem saber se foi esquecido.
   */
  const pagos = new Set(calculados.map((c) => c.vinculoId));
  const semDiferenca: LinhaDeAbrangencia[] = finais
    .filter((c) => !pagos.has(c.vinculoId))
    .map((c) => ({ vinculoId: c.vinculoId, calculado: false, motivo: "SEM_DIFERENCA_A_PAGAR" as const }));
  const todasAsExclusoes = [...excluidos, ...semDiferenca];

  exigirAbrangenciaCompleta(considerados, [...pagos], todasAsExclusoes);
  await gravarAbrangencia(tx, calculo.id, [...pagos], todasAsExclusoes);

  return { calculoId: calculo.id, numero, contracheques: calculados.length, totalProventos, totalDescontos, totalLiquido, sha256 };
}

/**
 * ═══ A RÉGUA DO AVO — os campos do parâmetro que as DUAS parcelas têm de compartilhar ═══
 *
 * ⚠️ SÃO TRÊS, E A LISTA É CURTA DE PROPÓSITO. A guarda exige que o minuendo e o subtraendo da
 * mesma conta venham da mesma régua — e a régua é o que decide QUANTOS avos e SOBRE QUE HORIZONTE:
 *   · `diasMinimosDoAvo`          — quantos dias fazem um mês contar
 *   · `avosNoExercicio`           — o denominador
 *   · `baseDosAvosDoAdiantamento` — até que mês os avos da 1ª parcela contam
 *
 * ⚠️ E O QUE FICA DE FORA FICA POR DECISÃO. Incidências, ato, percentual da 1ª parcela e as
 * rubricas NÃO entram: mudá-los depois do adiantamento não torna a subtração incoerente — o
 * abatimento é o valor APURADO, que já está materializado. Incluí-los transformaria a guarda
 * numa proibição de corrigir a ementa de um ato, que é zelo virado obstáculo.
 *
 * ⚠️ A COMPARAÇÃO É POR VALOR, NÃO POR IDENTIDADE DO REGISTRO, e isto foi uma CORREÇÃO: a
 * primeira versão desta guarda comparava o `id` do parâmetro. Ela era mais estrita e estava
 * ERRADA — recadastrar exatamente o mesmo critério gera outro `id`, então a saída que a própria
 * mensagem oferece ("cadastre a versão de novo") não funcionaria, e o ente ficaria sem saída
 * nenhuma dentro do exercício. Comparar a régua é o que o fundamento pede, e nem um campo a mais.
 */
const CAMPOS_DA_REGUA_DO_AVO: readonly string[] = ["diasMinimosDoAvo", "avosNoExercicio", "baseDosAvosDoAdiantamento"];

/** A régua em forma canônica e comparável — mesma ordem, mesma serialização nos dois lados. */
function reguaCanonica(campo: (nome: string) => unknown): string {
  return CAMPOS_DA_REGUA_DO_AVO.map((nome) => `${nome}=${String(campo(nome))}`).join("; ");
}

/**
 * A RÉGUA DO AVO QUE PRODUZIU UM CÁLCULO — lida da MEMÓRIA do contracheque.
 *
 * ⚠️ O FATO JÁ EXISTE E NÃO SE INVENTOU NADA PARA ESTA GUARDA. `calcularContrachequeDoDecimoTerceiro`
 * grava `parametro.id` e `parametro.versao` na memória de todo contracheque de 13º desde a V11
 * V9.1 (é o que permite ao contracheque se explicar anos depois). `CalculoDaFolha` não tem coluna
 * nem Json para isso, e criar uma seria DDL — o fato está recuperável onde está.
 *
 * ⚠️ UM CONTRACHEQUE BASTA, e a razão é local e visível: `calcularFolhaDoDecimoTerceiroNaTx` lê o
 * parâmetro UMA vez (`parametroVigenteDoExercicio`, antes do laço) e passa o MESMO objeto a todos
 * os contracheques daquele cálculo. Ler todas as memórias para conferir uma igualdade garantida
 * por construção custaria dezenas de MB numa folha de mil servidores — o `select` de um `Json`
 * traz a memória INTEIRA, com os doze meses e todas as linhas.
 *
 * ⚠️ E FALHA FECHADO. Memória ausente, ilegível ou sem a versão não vira "segue sem conferir":
 * vira recusa nomeada. Uma guarda que se desliga sozinha quando não entende o dado é pior que
 * guarda nenhuma, porque parece que está lá.
 */
async function reguaDoParametroNoCalculo(
  tx: Tx,
  calculoId: string,
  competencia: string
): Promise<{ readonly versao: number; readonly regua: string }> {
  const c = await tx.contracheque.findFirst({
    where: { calculoId },
    select: { memoria: true },
    orderBy: { id: "asc" },
  });
  const irrecuperavel = (porque: string): never => {
    throw new Error(
      `PARAMETRO-DO-ADIANTAMENTO-IRRECUPERAVEL: não foi possível recuperar qual versão do parâmetro ` +
        `do 13º apurou a folha de adiantamento de ${competencia} — ${porque}. Sem isso não dá para ` +
        `garantir que as duas parcelas do mesmo 13º saíram da mesma régua, e calcular assim poderia ` +
        `abater um adiantamento medido por outro critério. Nada foi calculado.`
    );
  };
  if (c === null) irrecuperavel("o cálculo que fechou aquela folha não tem contracheque nenhum");
  const memoria = (c as { readonly memoria: unknown }).memoria;
  if (typeof memoria !== "object" || memoria === null) irrecuperavel("a memória do contracheque não é um objeto");
  const p = (memoria as Record<string, unknown>)["parametro"];
  if (typeof p !== "object" || p === null) irrecuperavel("a memória não traz o bloco `parametro`");
  const campo = (nome: string): unknown => (p as Record<string, unknown>)[nome];
  const versao = campo("versao");
  if (typeof versao !== "number" || !Number.isInteger(versao)) irrecuperavel("a memória não traz o número da versão do parâmetro");
  for (const nome of CAMPOS_DA_REGUA_DO_AVO) {
    if (campo(nome) === undefined) irrecuperavel(`a memória não traz \`${nome}\``);
  }
  return { versao: versao as number, regua: reguaCanonica(campo) };
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
  /**
   * V11 V9.2 — DE ONDE veio o abatimento, para a memória do contracheque.
   *
   * ⚠️ ISTO NÃO MUDA UMA CONDIÇÃO SEQUER. A única guarda continua sendo `fechamento === null`
   * logo abaixo; a certificação é lida para ser ESCRITA, não para decidir. O motivo está no
   * MODULO (`ESTADO-EXIGIDO-DO-ADIANTAMENTO-SEM-FONTE`): qual estado torna o adiantamento
   * abatível é questão normativa não levantada, e decidi-la por dentro seria inventar a norma do
   * ente — o mesmo erro que expulsou os "15 dias" e os "50%" deste motor.
   */
  let procedenciaDoAbatimento: ProcedenciaDoAbatimento | null = null;
  if (!eAdiantamento) {
    const existente = await tx.folhaDePagamento.findFirst({
      where: { exercicio, tipo: "ADIANTAMENTO_DECIMO_TERCEIRO" },
      select: {
        id: true,
        competencia: true,
        fechamento: { select: { calculoId: true, calculo: { select: { numero: true } } } },
        certificacoes: { select: { tipo: true, calculoId: true, criadoEm: true } },
      },
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
      /**
       * ═══ V11 V9.2 — AS DUAS PARCELAS TÊM DE SAIR DA MESMA RÉGUA ═══
       *
       * ⚠️ ISTO NÃO DECIDE NORMA NENHUMA, E É POR ISSO QUE PODE EXISTIR. O sistema continua sem
       * opinião sobre qual critério de avo é o certo — isso é do ente, e é o que o parâmetro
       * existe para declarar. O que esta guarda exige é MENOS e mais duro: que o minuendo e o
       * subtraendo da MESMA conta venham da MESMA régua. Abater 990,41 apurados sobre 9 avos de
       * um total apurado sobre 10 avos é incoerência ARITMÉTICA interna; nenhuma fonte externa
       * precisa ser consultada para saber que essa subtração não significa nada. É a mesma
       * família do balanceamento por subsistema: uma identidade que o próprio sistema deve a si.
       *
       * O DANO QUE ELA EVITA, medido no teste: baixar `diasMinimosDoAvo` de 15 para 10 entre as
       * parcelas leva quem foi admitido em março de 9 para 10 avos. A 2ª parcela sai sobre 10 e
       * abate o que foi apurado sobre 9 — e a folha FECHA, o total bate, o empenho bate, a
       * liquidação bate. Não há etapa adiante que acuse; é o dano que a atualização de permissões
       * v28 descreve para esta ação, e até aqui a ÚNICA defesa era a concessão restrita.
       *
       * ⚠️ SEM MECANISMO DE DISPENSA, deliberadamente. Um ente que precise legitimamente divergir
       * (corrigir a ementa do ato entre as parcelas, por exemplo) é RECUSADO aqui — e isso volta
       * como pergunta de produto, com a matrícula e as duas versões na mão, em vez de virar uma
       * caixa "ignorar" que ninguém sabe quem marcou.
       */
      const doAdiantamento = await reguaDoParametroNoCalculo(tx, existente.fechamento.calculoId, existente.competencia);
      const reguaVigente = reguaCanonica((nome) => (cfg.parametro as unknown as Record<string, unknown>)[nome]);
      if (doAdiantamento.regua !== reguaVigente) {
        throw new Error(
          `PARAMETRO-TROCADO-ENTRE-AS-PARCELAS: a 1ª parcela (folha de ${existente.competencia}) foi apurada ` +
            `pela VERSÃO ${doAdiantamento.versao} do parâmetro do 13º de ${exercicio}, com ${doAdiantamento.regua}; ` +
            `a versão vigente agora é a ${cfg.parametro.versao}, com ${reguaVigente}. Calcular a parcela final ` +
            `assim abateria um adiantamento medido por outro critério — as duas metades do mesmo 13º sairiam ` +
            `de réguas diferentes, e os totais fechariam mesmo assim. ` +
            `Para seguir neste exercício, cadastre a versão seguinte do parâmetro com o critério da versão ` +
            `${doAdiantamento.versao} (o parâmetro é append-only: a nova passa a ser a vigente). Se a mudança ` +
            `de critério é para valer, ela vale a partir do próximo exercício — o 13º deste sai pela régua com ` +
            `que foi adiantado. Nada foi calculado.`
        );
      }
      procedenciaDoAbatimento = {
        competencia: existente.competencia,
        calculoNumero: existente.fechamento.calculo.numero,
        // A situação é DERIVADA do último fato daquele cálculo — nunca uma coluna `situacao`.
        // Reusa `situacaoDaCertificacao` em vez de reimplementar a derivação: duas cópias da
        // mesma regra é exatamente o que este repositório já pagou para não ter.
        situacaoDaCertificacao: situacaoDaCertificacao(existente.certificacoes as readonly FatoDaCertificacao[], existente.fechamento.calculoId),
        versaoDoParametro: doAdiantamento.versao,
        // Preenchidos logo abaixo, depois da conferência do critério — o objeto é remontado ali
        // em vez de mutado, para que o retrato que vai à memória seja o do estado JÁ verificado.
        estadoExigido: cfg.parametro.estadoMinimoDoAdiantamentoParaAbater,
        estadoVerificado: "FECHADO",
      };
      const linhas = await tx.linhaDoContracheque.findMany({
        where: { contracheque: { calculoId: existente.fechamento.calculoId }, rubricaId: cfg.rubricaDoAdiantamentoId },
        select: { valor: true, contracheque: { select: { vinculoId: true, vinculo: { select: { matricula: true } } } } },
      });
      for (const l of linhas) adiantamentoPorVinculo.set(l.contracheque.vinculoId, toMoney(l.valor));

      /**
       * ═══ V11 V9.3 — O ESTADO QUE O ENTE EXIGIU, CONFERIDO AQUI ═══
       *
       * ⚠️ ATÉ A V11 V9.2 ESTE BLOCO NÃO EXISTIA e o motor exigia FECHADO, cravado. A V11 V9.3
       * levantou a fonte: a Lei 4.749/1965, art. 1º e o Decreto 57.155/1965, art. 3º, § 3º mandam
       * compensar o que o empregado "houver RECEBIDO" — mas governam o CELETISTA, e o ente tem
       * regime plural por exigência do TR. Qualquer valor único aqui é norma inventada, inclusive
       * o FECHADO que estava. Quem declara é o ente, no parâmetro versionado, com ato.
       *
       * ⚠️ SEM DECLARAÇÃO NADA É BLOQUEADO AQUI. O cálculo sai, como SIMULAÇÃO identificada (a
       * memória do contracheque afirma, em `procedenciaDoAbatimento.natureza`), e quem recusa é a
       * APROPRIAÇÃO — a efetivação correspondente. Lacuna normativa bloqueia a efetivação, não a
       * construção.
       *
       * ⚠️ E NÃO SATISFEITO É RECUSA, NUNCA "ABATE ZERO". Seguir sem abater pagaria o 13º INTEIRO
       * a quem já recebeu metade, que é o dano que as quatro recusas desta seção existem para
       * evitar. A recusa nomeia a matrícula e os dois valores.
       */
      const exigido = cfg.parametro.estadoMinimoDoAdiantamentoParaAbater;
      let verificado: EstadoMinimoDoAdiantamento = "FECHADO";

      if (exigido === "CERTIFICADO") {
        const sit = situacaoDaCertificacao(existente.certificacoes as readonly FatoDaCertificacao[], existente.fechamento.calculoId);
        if (sit !== "CERTIFICADA") {
          throw new Error(
            `ADIANTAMENTO-NAO-CERTIFICADO: o parâmetro do 13º de ${exercicio} (versão ${cfg.parametro.versao}) ` +
              `exige que o adiantamento esteja ao menos CERTIFICADO para ser abatido — ` +
              `${cfg.parametro.ato.tipo} ${cfg.parametro.ato.numero}/${cfg.parametro.ato.ano}, ` +
              `${cfg.parametro.ato.dispositivo}. A folha de adiantamento de ${existente.competencia} está ` +
              `${sit}. ` +
              (sit === "DEVOLVIDA"
                ? `Devolvida para correção é o caso que este critério existe para pegar: ela nunca será ` +
                  `liquidada nem paga, e até a V11 V9.2 era abatida assim mesmo. `
                : `Quem o ente designou precisa atestar o cálculo antes. `) +
              `Nada foi calculado.`
          );
        }
        verificado = "CERTIFICADO";
      }

      if (exigido === "PAGO") {
        /**
         * ⚠️ A CADEIA INTEIRA, E ELA SÓ EXISTE COM `porServidor = true`. O cadastro do parâmetro
         * já recusou o critério quando o grupo não empenha por servidor
         * (`ESTADO-PAGO-NAO-VERIFICAVEL`); aqui se confere de novo, fail-closed, porque entre
         * cadastrar e calcular passa um exercício inteiro.
         */
        const noGrupo = await tx.rubricaDoGrupoDeEmpenho.findUnique({
          where: { rubricaId: cfg.rubricaDoAdiantamentoId },
          select: { grupoId: true, grupo: { select: { codigo: true, porServidor: true } } },
        });
        if (noGrupo === null || !noGrupo.grupo.porServidor) {
          throw new Error(
            `ADIANTAMENTO-PAGO-NAO-VERIFICAVEL: o parâmetro do 13º de ${exercicio} exige PAGO, e a ` +
              `rubrica do adiantamento ${noGrupo === null ? "não está em grupo de empenho nenhum" : `está no grupo ${noGrupo.grupo.codigo}, que emite UM empenho para o grupo inteiro (porServidor = false)`}. ` +
              `"Quanto foi pago a cada servidor" não existe como fato no banco nessa configuração — e ` +
              `abater assim seria supor. Cadastre a versão seguinte do parâmetro com FECHADO ou ` +
              `CERTIFICADO, ou empenhe a 1ª parcela por servidor. Nada foi calculado.`
          );
        }
        const empenhos = await tx.empenhoDaFolha.findMany({
          where: { apropriacao: { folhaId: existente.id }, grupoId: noGrupo.grupoId },
          select: { empenhoId: true, vinculoId: true },
        });
        const empenhoDoVinculo = new Map<string, string>();
        for (const e2 of empenhos) if (e2.vinculoId !== null) empenhoDoVinculo.set(e2.vinculoId, e2.empenhoId);

        const pagamentos = empenhos.length === 0 ? [] : await tx.pagamento.findMany({
          where: { liquidacao: { empenhoId: { in: empenhos.map((e2) => e2.empenhoId) } } },
          select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, liquidacao: { select: { empenhoId: true } } },
        });
        const porEmpenho = new Map<string, { id: string; valor: Money; estornoDeId: string | null; anulacaoParcialDeId: string | null }[]>();
        for (const pg of pagamentos) {
          const chave = pg.liquidacao.empenhoId;
          const lista = porEmpenho.get(chave) ?? [];
          lista.push({ id: pg.id, valor: toMoney(pg.valor), estornoDeId: pg.estornoDeId, anulacaoParcialDeId: pg.anulacaoParcialDeId });
          porEmpenho.set(chave, lista);
        }

        for (const l of linhas) {
          const apurado = toMoney(l.valor);
          if (apurado.lte(0)) continue;
          const matricula = l.contracheque.vinculo.matricula;
          const empenhoId = empenhoDoVinculo.get(l.contracheque.vinculoId);
          const pago = empenhoId === undefined ? toMoney(0) : somaLiquidaEstornaveis(porEmpenho.get(empenhoId) ?? []);
          /**
           * ⚠️ PAGAMENTO PARCIAL NÃO SATISFAZ, E ESTE É O CASO QUE NINGUÉM TINHA OLHADO. O gate é
           * "o apurado foi pago", não "houve pagamento": com meia parcela paga, abater o inteiro
           * descontaria de dezembro dinheiro que nunca saiu em junho. Recusar nomeando os dois
           * valores devolve a decisão a quem pode tomá-la.
           */
          if (pago.lt(apurado)) {
            throw new Error(
              `ADIANTAMENTO-NAO-PAGO: o parâmetro do 13º de ${exercicio} (versão ${cfg.parametro.versao}) exige ` +
                `que o adiantamento esteja PAGO para ser abatido — ${cfg.parametro.ato.tipo} ` +
                `${cfg.parametro.ato.numero}/${cfg.parametro.ato.ano}, ${cfg.parametro.ato.dispositivo}. ` +
                `A matrícula ${matricula} teve ${emProsa(apurado.toFixed(2))} apurados na folha de ` +
                `${existente.competencia} e ${emProsa(pago.toFixed(2))} pagos (líquido de estorno e de anulação ` +
                `parcial)` +
                (empenhoId === undefined
                  ? ` — não há empenho por servidor dessa folha para esta matrícula.`
                  : pago.isZero()
                    ? ` — nenhum pagamento registrado.`
                    : `: pagamento PARCIAL não satisfaz o critério, e abater o apurado inteiro descontaria de dezembro o que não saiu em junho.`) +
                ` Pague o saldo, ou cadastre a versão seguinte do parâmetro com o critério que o ato ` +
                `do ente de fato exige. Nada foi calculado.`
            );
          }
        }
        verificado = "PAGO";
      }

      /**
       * ⚠️ O RETRATO QUE VAI À MEMÓRIA É O DO ESTADO JÁ VERIFICADO, e por isso ele é REMONTADO em
       * vez de mutado: `ProcedenciaDoAbatimento` é `readonly` campo a campo, e um objeto mutável
       * viajando até a memória canônica seria a porta para alguém "ajustar" um fato depois de ele
       * ter sido conferido.
       */
      procedenciaDoAbatimento = { ...procedenciaDoAbatimento, estadoVerificado: verificado };

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
        base.push({ codigo: r.codigo, descricao: r.descricao, natureza: r.natureza, valor: vencimento, memoria: `vencimento-base vigente em ${competencia} = ${emProsa(vencimento.toFixed(2))}` });
      } else if (r.natureza === "GRATIFICACOES_DO_VINCULO") {
        const total = sumMoney(gratificacoes.map((g) => g.valor));
        base.push({ codigo: r.codigo, descricao: r.descricao, natureza: r.natureza, valor: total, memoria: gratificacoes.length === 0 ? "nenhuma gratificação vigente" : `gratificações vigentes: ${gratificacoes.map((g) => `${g.descricao} ${emProsa(g.valor.toFixed(2))}`).join(" + ")}` });
      } else {
        const pct = r.percentual ?? new Decimal(0);
        base.push({ codigo: r.codigo, descricao: r.descricao, natureza: r.natureza, valor: toMoney(vencimento.times(pct)), memoria: `${pct.times(100).toFixed(2)}% × vencimento-base ${emProsa(vencimento.toFixed(2))}` });
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
      adiantamentoApuradoEmFolhaFechada: adiantamentoPorVinculo.get(v.id) ?? toMoney(0),
      procedenciaDoAbatimento,
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
  /**
   * ⚠️ O 13º GRAVA ABRANGÊNCIA MESMO SEM SELEÇÃO, e a razão é o FECHAMENTO, não o recorte.
   *
   * A guarda `SELECIONADOS-QUE-SUMIRIAM` de `fecharFolha` pergunta ao registro de abrangência
   * quem foi calculado nos cálculos vivos. Se este motor não gravasse nada, a guarda leria lista
   * vazia e **passaria por vacuidade** em toda folha de 13º — o pior desfecho possível para uma
   * guarda: silenciosa e indistinguível de "não há problema". Dois recálculos de 13º entre os
   * quais alguém foi desligado produzem conjuntos diferentes, e o fechamento precisa enxergar.
   *
   * ⚠️ E NÃO SE CHAMA `exigirAbrangenciaCompleta` AQUI, de propósito: este motor não constrói o
   * conjunto de CONSIDERADOS (ele pula quem não alcançou avo sem registrar motivo). Afirmar
   * completude sobre um conjunto que não foi apurado seria afirmar o que não se sabe — a guarda
   * passaria sempre, e uma guarda que sempre passa é a que já nasceu inerte neste módulo. Fica
   * nomeado: `ABRANGENCIA-DO-13-SEM-EXCLUSOES-NOMEADAS`.
   */
  await gravarAbrangencia(tx, calculo.id, calculados.map((c) => c.vinculoId), []);

  return { calculoId: calculo.id, numero, contracheques: calculados.length, totalProventos, totalDescontos, totalLiquido, sha256 };
}

/**
 * ═══ V13 (TR 5.12.50) — O CÁLCULO DA FOLHA DE ADIANTAMENTO SALARIAL ═══
 *
 * Roda DENTRO da transação de `calcularFolha`, sob a mesma autorização (`CALCULAR_FOLHA`, mais
 * `SELECIONAR_VINCULOS_DA_FOLHA` quando há recorte) e gravando nos mesmos `CalculoDaFolha` e
 * `Contracheque`. O que muda é a CONTA: percentual do parâmetro sobre a base que o ENTE declarou.
 *
 * ⚠️ AS DUAS BASES LEEM FATOS DIFERENTES, E É POR ISSO QUE SÃO DOIS CAMINHOS E NÃO UM `if`
 * cosmético dentro de um caminho só:
 *
 *   · `REMUNERACAO_PROJETADA_DO_MES` roda o motor mensal da competência CORRENTE — a mesma
 *     função que a mensal e a complementar usam, sem uma linha de conta nova;
 *   · `REMUNERACAO_DO_MES_ANTERIOR` lê o que a folha mensal FECHADA do mês anterior APUROU. Não
 *     recalcula nada: o fato já existe, e recalculá-lo daria outro número sempre que o cadastro
 *     tivesse mudado desde então — o que é exatamente o contrário do que "mês anterior" significa.
 *
 * ⚠️ E A DIFERENÇA ENTRE AS DUAS APARECE NO ABATIMENTO DA MENSAL, não aqui: dois servidores com
 * o mesmo percentual e bases diferentes têm vales diferentes, e a mensal desconta valores
 * diferentes. Com N=1 um motor que abatesse um valor fixo passaria — é o cenário obrigatório da
 * varredura.
 */
async function calcularFolhaDoAdiantamentoSalarialNaTx(
  tx: Tx,
  folha: { readonly id: string; readonly competencia: string; readonly tipo: string; readonly calculos: readonly { readonly numero: number }[] },
  motivo: string | null,
  criadoPor: string,
  selecao: SelecaoDoCalculo = SELECAO_DE_TODOS
): Promise<ResultadoDoCalculo> {
  const competencia = folha.competencia;

  // ── guarda 1: sem parâmetro vigente, nada acontece ──────────────────────────
  const cfg = await parametroVigenteDaCompetencia(tx, competencia);
  const parametro = cfg.parametro;

  const tabelas = await lerTabelas(tx, competencia);
  const rubricasDoRegime = await resolvedorDeRubricas(tx, competencia);

  type Candidato = {
    readonly vinculoId: string;
    readonly matricula: string;
    readonly regime: RegimePrevidenciario;
    readonly diasComputados: number;
    readonly base: Money;
    readonly explicacao: string;
  };

  const candidatos: Candidato[] = [];
  let considerados: readonly string[] = [];
  let excluidos: readonly LinhaDeAbrangencia[] = [];

  if (parametro.baseDoAdiantamento === "REMUNERACAO_PROJETADA_DO_MES") {
    /**
     * ⚠️ `IGNORAR` NO ABATIMENTO, E SEM ISSO A FUNCIONALIDADE NÃO EXISTIRIA.
     *
     * A projeção é do motor mensal, e o motor mensal abate o vale DESTA competência. Chamá-lo com
     * o padrão aqui faria a guarda `ADIANTAMENTO-SALARIAL-NAO-FECHADO` recusar o cálculo do vale
     * por causa da folha do PRÓPRIO vale, que obviamente ainda não fechou — beco sem saída na
     * primeira tentativa de usar a funcionalidade, e do tipo que não tem contorno pela tela.
     *
     * ⚠️ `DEVOLVER_VAZIO` porque a recusa por ausência de vínculo é dada aqui embaixo, com a
     * mensagem deste tipo de folha. A recusa do motor mensal falaria de outra coisa.
     */
    const proj = await contrachequesMensaisDaCompetencia(tx, competencia, selecao, "DEVOLVER_VAZIO", "IGNORAR");
    considerados = proj.considerados;
    excluidos = proj.excluidos;
    for (const c of proj.finais) {
      const matricula = proj.matriculaPorVinculo.get(c.vinculoId) ?? c.vinculoId;
      candidatos.push({
        vinculoId: c.vinculoId,
        matricula,
        regime: c.regime,
        diasComputados: c.diasComputados,
        base: c.totais.proventos,
        explicacao:
          `base = remuneração PROJETADA de ${competencia} pelo motor mensal (tabelas e versões de rubrica ` +
          `vigentes): proventos ${emProsa(c.totais.proventos.toFixed(2))}`,
      });
    }
  } else {
    /**
     * ═══ A BASE É UM FATO JÁ APURADO, E A RECUSA É NOMEADA ═══
     *
     * ⚠️ SEM A MENSAL ANTERIOR FECHADA NÃO HÁ BASE — e projetar por conta própria trocaria a
     * regra que o ente DECLAROU por outra, em silêncio, com a folha fechando normalmente.
     */
    const anterior = competenciaAnterior(competencia);
    const mensalAnterior = await tx.folhaDePagamento.findUnique({
      where: { competencia_tipo: { competencia: anterior, tipo: "MENSAL" } },
      select: { id: true, fechamento: { select: { calculoId: true, calculo: { select: { numero: true } } } } },
    });
    if (mensalAnterior === null || mensalAnterior.fechamento === null) {
      throw new Error(
        `MENSAL-ANTERIOR-NAO-FECHADA: o parâmetro de ${competencia} (versão ${parametro.versao}) declara que o ` +
          `adiantamento salarial se calcula sobre a REMUNERAÇÃO DO MÊS ANTERIOR, e a folha mensal de ${anterior} ` +
          (mensalAnterior === null ? `não existe` : `existe (${mensalAnterior.id}) e ainda não foi fechada`) +
          `. Sem ela não há base: o que essa prática manda ler é o que aquela folha APUROU, e projetar um valor ` +
          `aqui trocaria a regra que o ente declarou por outra, com a folha fechando normalmente. ` +
          (mensalAnterior === null
            ? `Abra e feche a folha mensal de ${anterior} antes.`
            : `Feche a folha mensal de ${anterior} antes.`) +
          ` (Se a intenção do ente é calcular sobre o próprio mês, a opção é REMUNERACAO_PROJETADA_DO_MES, ` +
          `cadastrada na versão seguinte do parâmetro.) Nada foi calculado.`
      );
    }

    const linhasAnteriores = await tx.linhaDoContracheque.findMany({
      where: { contracheque: { calculoId: mensalAnterior.fechamento.calculoId }, tipo: "PROVENTO" },
      select: { valor: true, contracheque: { select: { vinculoId: true } } },
    });
    const apurado = new Map<string, Money>();
    for (const l of linhasAnteriores) {
      const atual = apurado.get(l.contracheque.vinculoId) ?? toMoney(0);
      apurado.set(l.contracheque.vinculoId, toMoney(atual.plus(toMoney(l.valor))));
    }

    const recorte: Prisma.VinculoWhereInput =
      selecao.modo === "EXPLICITA" ? { id: { in: [...new Set(selecao.vinculoIds)] } } : {};
    const vinculos = await tx.vinculo.findMany({
      where: recorte,
      select: {
        id: true, matricula: true, dataAdmissao: true, regimePrevidenciario: true,
        eventos: { select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true, regimePrevidenciario: true } },
      },
      orderBy: { matricula: "asc" },
    });
    const declarada = abrangenciaDeclarada(selecao, vinculos.map((v) => v.id));
    considerados = declarada.aConsiderar;
    const fora: LinhaDeAbrangencia[] = [];
    const { inicio, fim } = bordasDaCompetencia(competencia);
    for (const v of vinculos) {
      const eventos = v.eventos.map(paraEvento);
      const desligamento = dataDeDesligamento(eventos);
      if (diaCivil(v.dataAdmissao) > diaCivil(fim)) {
        fora.push({ vinculoId: v.id, calculado: false, motivo: "ADMITIDO_APOS_A_COMPETENCIA" });
        continue;
      }
      if (desligamento !== null && diaCivil(desligamento) < diaCivil(inicio)) {
        fora.push({ vinculoId: v.id, calculado: false, motivo: "DESLIGADO_ANTES_DA_COMPETENCIA" });
        continue;
      }
      const regime = regimeVigenteEm(eventos, v.regimePrevidenciario as RegimePrevidenciario | null, fim);
      if (regime === null) throw new VinculoSemRegimeError(v.matricula);
      if (regime !== "ISENTO" && tabelas.contribuicao[regime] === null) {
        throw new TabelaAusenteError("CONTRIBUICAO", competencia, `regime ${regime}, exigido pela matrícula ${v.matricula}`);
      }
      const base = apurado.get(v.id) ?? toMoney(0);
      // ⚠️ QUEM NÃO TEM BASE NÃO VIRA CONTRACHEQUE DE ZERO. Admitido na própria competência não
      // tem folha anterior para ler, e arbitrar uma base seria inventar a regra do ente.
      if (base.lte(0)) continue;
      candidatos.push({
        vinculoId: v.id,
        matricula: v.matricula,
        regime,
        diasComputados: diasComputados({ dataAdmissao: v.dataAdmissao, dataDesligamento: desligamento, afastamentos: afastamentosDe(eventos) }, competencia).dias,
        base,
        explicacao:
          `base = remuneração APURADA na folha mensal FECHADA de ${anterior} ` +
          `(cálculo nº ${mensalAnterior.fechamento.calculo.numero}): proventos ${emProsa(base.toFixed(2))}`,
      });
    }
    excluidos = fora;
  }

  if (candidatos.length === 0) {
    throw new Error(
      `FOLHA-SEM-BASE-PARA-O-ADIANTAMENTO: nenhum vínculo tem base para o adiantamento salarial de ` +
        `${competencia} pela prática declarada no parâmetro (${parametro.baseDoAdiantamento}). ` +
        (selecao.modo === "EXPLICITA"
          ? `Foram considerados ${new Set(selecao.vinculoIds).size} vínculo(s) SELECIONADO(S). `
          : ``) +
        `Nada foi calculado.`
    );
  }

  const calculados: ContrachequeCalculado[] = [];
  for (const c of candidatos) {
    const doRegime = rubricasDoRegime(c.regime);
    const rubrica = doRegime.find((r) => r.id === cfg.rubricaDoAdiantamentoId);
    if (rubrica === undefined) {
      const codigo = (await tx.rubrica.findUnique({ where: { id: cfg.rubricaDoAdiantamentoId }, select: { codigo: true } }))?.codigo ?? cfg.rubricaDoAdiantamentoId;
      throw new RubricaDoAdiantamentoSalarialSemVersaoError(codigo, c.regime, competencia);
    }
    calculados.push(
      calcularContrachequeDoAdiantamentoSalarial({
        competencia,
        parametro,
        vinculo: { id: c.vinculoId, matricula: c.matricula, regime: c.regime },
        base: { valor: c.base, explicacao: c.explicacao },
        rubricaDoAdiantamento: rubrica,
        diasComputados: c.diasComputados,
        tabelas: { contribuicao: c.regime === "ISENTO" ? null : tabelas.contribuicao[c.regime], irrf: tabelas.irrf },
      })
    );
  }

  const numero = (folha.calculos[0]?.numero ?? 0) + 1;
  const totalProventos = sumMoney(calculados.map((c) => c.totais.proventos));
  const totalDescontos = sumMoney(calculados.map((c) => c.totais.descontos));
  const totalLiquido = toMoney(totalProventos.minus(totalDescontos));
  const sha256 = sha256Canonico({
    motor: VERSAO_DO_MOTOR_DO_ADIANTAMENTO_SALARIAL,
    competencia,
    tipo: folha.tipo,
    contracheques: calculados.map((c) => c.sha256).sort(),
  });
  const calculo = await tx.calculoDaFolha.create({
    data: {
      folhaId: folha.id, numero, motivo,
      totalProventos: s2(totalProventos), totalDescontos: s2(totalDescontos), totalLiquido: s2(totalLiquido),
      contracheques: calculados.length, sha256, versaoDoMotor: VERSAO_DO_MOTOR_DO_ADIANTAMENTO_SALARIAL,
      modoDeSelecao: selecao.modo, criadoPor,
    },
    select: { id: true },
  });
  for (const c of calculados) {
    await tx.contracheque.create({
      data: {
        calculoId: calculo.id, vinculoId: c.vinculoId, regime: c.regime, diasComputados: c.diasComputados,
        totalProventos: s2(c.totais.proventos), totalDescontos: s2(c.totais.descontos), liquido: s2(c.totais.liquido),
        baseContribuicao: s2(c.totais.baseContribuicao), contribuicao: s2(c.totais.contribuicao),
        baseIrrf: s2(c.totais.baseIrrf), irrf: s2(c.totais.irrf),
        memoria: c.memoria as object, sha256: c.sha256,
        linhas: { create: c.linhas.map((l) => ({ rubricaId: l.rubricaId, ordem: l.ordem, tipo: l.tipo, valorBase: s2(l.valorBase), fator: l.fator.toFixed(6), valor: s2(l.valor), incideContribuicao: l.incideContribuicao, incideIrrf: l.incideIrrf, memoria: l.memoria })) },
      },
    });
  }

  /**
   * ⚠️ A ABRANGÊNCIA É GRAVADA, E A COMPLETUDE **NÃO** É AFIRMADA — a distinção é deliberada.
   *
   * Gravar é obrigatório: a guarda `SELECIONADOS-QUE-SUMIRIAM` de `fecharFolha` pergunta ao
   * registro de abrangência quem foi calculado. Sem linha nenhuma ela leria lista vazia e passaria
   * POR VACUIDADE em toda folha de vale — o pior desfecho possível para uma guarda.
   *
   * ⚠️ E `exigirAbrangenciaCompleta` NÃO É CHAMADA, pelo mesmo motivo do motor do 13º: quem não
   * tem base para o vale (admitido na própria competência, na prática REMUNERACAO_DO_MES_ANTERIOR)
   * é pulado SEM motivo nomeado — `MotivoDaExclusao` não tem um valor para isso, e inventar um
   * pede migration de enum e entrada no `EXCLUSAO_FOI_PEDIDA`. Afirmar completude sobre um
   * conjunto que não foi apurado faria a guarda passar sempre, e uma guarda que sempre passa é a
   * que já nasceu inerte neste módulo. Fica NOMEADO:
   * `ABRANGENCIA-DO-ADIANTAMENTO-SALARIAL-SEM-BASE-NAO-NOMEADA` (MODULO.md do M33).
   */
  await gravarAbrangencia(tx, calculo.id, calculados.map((c) => c.vinculoId), excluidos.filter((e) => considerados.includes(e.vinculoId)));

  return { calculoId: calculo.id, numero, contracheques: calculados.length, totalProventos, totalDescontos, totalLiquido, sha256 };
}

/**
 * A COMPETÊNCIA ANTERIOR, EM "AAAA-MM" — aritmética de calendário, não de fuso.
 *
 * ⚠️ NÃO USA `Date`, E É DE PROPÓSITO. "O mês anterior a 2026-01" é 2025-12 em qualquer fuso do
 * mundo; construir uma data para descobrir isso reintroduziria a pergunta "em que fuso?" numa
 * conta que não tem fuso nenhum. `packages/datas` é a régua da DATA CIVIL do ente, e esta não é
 * uma data civil: é um rótulo de competência.
 */
function competenciaAnterior(competencia: string): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
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

    /**
     * ═══ ⚠️ A GUARDA DA SUBTRAÇÃO SILENCIOSA — o risco que ninguém procuraria ═══
     *
     * Todo mundo vigia "pagar duas vezes". Com seleção o perigo é o OPOSTO, e ele é invisível:
     * `fecharFolha` congela **UM** cálculo, o último não cancelado. Se o cálculo nº1 processou
     * {A,B} e o nº2 processou {C,D}, fechar leva só {C,D} — **A e B não recebem**, sem erro, sem
     * aviso, com o total, o empenho e a liquidação batendo.
     *
     * ⚠️ E O CANCELAMENTO É A SAÍDA LEGÍTIMA, por isso ele entra na conta: um cálculo cancelado
     * declara "isto não vale", e quem estava só nele deixou de ser prometido POR ATO. O que esta
     * guarda impede é o ESQUECIMENTO, não a decisão — quem quiser mesmo excluir A e B cancela o
     * nº1, ou recalcula com a seleção acumulada. As duas saídas são explícitas e ficam gravadas.
     */
    const calculadosNosVivos = await tx.abrangenciaDoCalculo.findMany({
      where: { calculado: true, calculo: { folhaId: folha.id, cancelamento: null } },
      select: { vinculoId: true, calculo: { select: { numero: true } } },
    });
    const noQueVaiFechar = calculadosNosVivos.filter((x) => x.calculo.numero === vivo.numero).map((x) => x.vinculoId);
    const sumiriam = selecionadosQueSumiriam(calculadosNosVivos.map((x) => x.vinculoId), noQueVaiFechar);
    if (sumiriam.length > 0) {
      const matriculas = await tx.vinculo.findMany({ where: { id: { in: [...sumiriam] } }, select: { matricula: true } });
      const nomes = matriculas.map((m) => m.matricula).sort();
      throw new Error(
        `SELECIONADOS-QUE-SUMIRIAM: a(s) matrícula(s) ${nomes.join(", ")} foram calculadas em cálculo ` +
          `VIVO desta folha e NÃO estão no cálculo nº ${vivo.numero}, que é o que o fechamento ` +
          `congelaria. Fechar assim deixaria essas pessoas sem contracheque na folha ${folha.tipo} de ` +
          `${folha.competencia} — sem erro, com o total, o empenho e a liquidação batendo, e ninguém ` +
          `acusando adiante. Recalcule incluindo-as, ou cancele o cálculo que as processou para ` +
          `declarar que elas não entram. Nada foi gravado.`
      );
    }
    /**
     * ⚠️ V11 V9.3 — A PRÉ-CONDIÇÃO ANTES DA GRAVAÇÃO QUE ENVENENA.
     *
     * Fechar CONGELA o cálculo, e congelado ele não volta: `calcularFolha` recusa folha fechada
     * (a guarda `FOLHA-FECHADA` acima) e `cancelarCalculoDaFolha` recusa o cálculo que fechou.
     * Congelar um 13º apurado sob critério NÃO DECLARADO criava um estado sem saída — nem
     * apropriável, nem liquidável, nem recalculável —, e recusa sem saída não é fail-closed.
     *
     * ⚠️ NADA ANTERIOR É DESFEITO: folhas já congeladas em simulação continuam como estão, e a
     * saída delas é `RETIFICACAO-DA-FOLHA`, que não existe e não se inventa aqui (MODULO).
     */
    if (folha.tipo === "DECIMO_TERCEIRO") {
      const criterio = await criterioDoAbatimentoNoCalculo(tx, vivo.id);
      if (criterio.abateu && criterio.criterioDeclarado === null) {
        throw new Error(
          `ABATIMENTO-SEM-CRITERIO-DECLARADO: o cálculo nº ${vivo.numero} do 13º de ${folha.competencia} ` +
            `abateu ${criterio.totalAbatido} de 1ª parcela, e o parâmetro do 13º sob o qual ele rodou NÃO ` +
            `declara qual estado o adiantamento precisa ter alcançado para ser abatido. Fechar CONGELA ` +
            `esse número, e cálculo congelado não se recalcula — a folha ficaria sem apropriação, sem ` +
            `liquidação e sem correção possível. ` +
            `O que destrava: o ente cadastra a versão seguinte do parâmetro declarando o critério ` +
            `(FECHADO, CERTIFICADO ou PAGO) com o ato que o fundamenta, em Folha > Parâmetros do 13º, e a ` +
            `folha é RECALCULADA antes de fechar — enquanto ela não fecha, recalcular é possível. ` +
            `Não há dispensa nem confirmação que substitua o ato. Nada foi gravado.`
        );
      }
    }
    const f = await tx.fechamentoDaFolha.create({ data: { folhaId: folha.id, calculoId: vivo.id, sha256: vivo.sha256, criadoPor: d.criadoPor }, select: { id: true } });
    return { fechamentoId: f.id, calculoId: vivo.id, numero: vivo.numero };
  });
}
