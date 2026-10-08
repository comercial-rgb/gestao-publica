import { autorizarNo } from "../m16-travamento/escopo.js";
import { atribuirCodigoReduzidoNaTransacao } from "./codigo-reduzido.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  anoNoQuadrienio,
  zCriarAcaoPpaInput,
  zCriarAlienacaoBemLdoInput,
  zCriarAplicacaoAlienacaoLdoInput,
  zCriarAreaTematicaInput,
  zCriarDividaConsolidadaLdoInput,
  zCriarEixoInput,
  zCriarIndicadorProgramaInput,
  zCriarLdoInput,
  zCriarMacroacaoInput,
  zCriarMargemExpansaoLdoInput,
  zCriarMetaAnualLdoInput,
  zCriarPlanoPlurianualInput,
  zCriarPrevisaoReceitaPpaInput,
  zCriarPrioridadeLdoInput,
  zCriarProgramaPpaInput,
  zCriarProjecaoAtuarialRppsInput,
  zCriarPublicoAlvoInput,
  zCriarReceitaAnteriorPpaInput,
  zCriarRenunciaReceitaLdoInput,
  zCriarRiscoFiscalInput,
  type CriarAcaoPpaInput,
  type CriarAlienacaoBemLdoInput,
  type CriarAplicacaoAlienacaoLdoInput,
  type CriarAreaTematicaInput,
  type CriarDividaConsolidadaLdoInput,
  type CriarEixoInput,
  type CriarIndicadorProgramaInput,
  type CriarLdoInput,
  type CriarMacroacaoInput,
  type CriarMargemExpansaoLdoInput,
  type CriarMetaAnualLdoInput,
  type CriarPlanoPlurianualInput,
  type CriarPrevisaoReceitaPpaInput,
  type CriarPrioridadeLdoInput,
  type CriarProgramaPpaInput,
  type CriarProjecaoAtuarialRppsInput,
  type CriarPublicoAlvoInput,
  type CriarReceitaAnteriorPpaInput,
  type CriarRenunciaReceitaLdoInput,
  type CriarRiscoFiscalInput,
} from "./dominio.js";

/**
 * M02b — SERVIÇOS DE CRIAÇÃO do planejamento PLURIANUAL (PPA e LDO).
 *
 * ═══ ⚠️ POR QUE A CRIAÇÃO VEM PRIMEIRO, ANTES DE QUALQUER TELA ═══
 * No M10 descobrimos NOVE serviços que movimentavam o bem e NENHUM que o criava — os
 * únicos `create` de `BemPatrimonial` estavam no seed. Uma tabela que só o seed alcança
 * é uma tabela fora do censo: ninguém pode ser negado nela porque ninguém sabe que ela
 * existe. Aqui a ordem foi invertida de propósito.
 *
 * ═══ ⚠️ TODOS SÃO ESCOPO "ENTE" ═══
 * Nenhuma entidade do M02b tem `unidadeOrcId` — e não vai ter. Planejamento plurianual
 * é ato do ENTE por natureza: o PPA é lei municipal, não peça de unidade. Só a permissão
 * GLOBAL autoriza, e o domínio impõe isso sozinho ao ser chamado sem unidade
 * (`m16-travamento/autorizacao.ts:136-138`).
 *
 * ═══ ⚠️ AS AÇÕES SÃO AGRUPADAS PELOS ANEXOS DA LRF, NÃO UMA POR SERVIÇO ═══
 * São 20 serviços e 10 ações. O censo permite compartilhar ação (o precedente é
 * `encerrarExercicio`/`encerrarExercicioComRestos`), e aqui o agrupamento segue como o
 * trabalho REALMENTE se divide numa prefeitura: quem monta o Anexo de Metas Fiscais não
 * é quem monta o de Riscos, e quem cadastra a árvore temática do PPA não é quem lança
 * as previsões de receita. Uma ação por serviço daria 20 crachás que ninguém concede
 * separadamente; uma ação só daria o crachá que abre tudo.
 */

/** Qualquer coisa que fale Prisma: o client ou uma transação dele. */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** O plano existe? Devolve o quadriênio, que vários serviços precisam conferir. */
async function exigirPlano(
  tx: Tx,
  planoId: string
): Promise<{ readonly anoInicio: number; readonly anoFim: number }> {
  const p = await tx.planoPlurianual.findUnique({
    where: { id: planoId },
    select: { anoInicio: true, anoFim: true },
  });
  if (p === null) throw new Error(`Plano plurianual ${planoId} não existe.`);
  return p;
}

/** A LDO existe? A mensagem é DESTE serviço — o resolvedor de escopo não a sequestra. */
async function exigirLdo(tx: Tx, ldoId: string): Promise<void> {
  const l = await tx.leiDiretrizesOrcamentarias.findUnique({
    where: { id: ldoId },
    select: { id: true },
  });
  if (l === null) throw new Error(`LDO ${ldoId} não existe.`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PPA — O PLANO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ O QUADRIÊNIO É CONFERIDO EM TRÊS CAMADAS, e não é redundância burra:
 * o Zod recusa nomeando (a mensagem que o usuário lê), o CHECK do banco barra o INSERT
 * direto (script, correção manual, seed apressado), e a `@@unique([anoInicio])` impede
 * dois planos no mesmo período. Cada uma pega um caminho que as outras não alcançam.
 */
export async function criarPlanoPlurianual(
  prisma: PrismaClient,
  input: CriarPlanoPlurianualInput
): Promise<{ readonly planoId: string }> {
  const dados = zCriarPlanoPlurianualInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarPlanoPlurianual, "ENTE");

    const criado = await tx.planoPlurianual.create({
      data: {
        anoInicio: dados.anoInicio,
        anoFim: dados.anoFim,
        leiRef: dados.leiRef,
        dataPublicacao: dados.dataPublicacao,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { planoId: criado.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PPA — A ÁRVORE TEMÁTICA (uma ação para os quatro: é o mesmo ato)
// ═══════════════════════════════════════════════════════════════════════════

export async function criarEixoEstruturante(
  prisma: PrismaClient,
  input: CriarEixoInput
): Promise<{ readonly eixoId: string }> {
  const dados = zCriarEixoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarEixoEstruturante, "ENTE");

    const criado = await tx.eixoEstruturante.create({
      data: { codigo: dados.codigo, descricao: dados.descricao, criadoPor: dados.criadoPor },
      select: { id: true },
    });
    return { eixoId: criado.id };
  });
}

export async function criarAreaTematica(
  prisma: PrismaClient,
  input: CriarAreaTematicaInput
): Promise<{ readonly areaTematicaId: string }> {
  const dados = zCriarAreaTematicaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarAreaTematica, "ENTE");

    const eixo = await tx.eixoEstruturante.findUnique({
      where: { id: dados.eixoId },
      select: { id: true },
    });
    if (eixo === null) throw new Error(`Eixo estruturante ${dados.eixoId} não existe.`);

    const criada = await tx.areaTematica.create({
      data: {
        codigo: dados.codigo,
        descricao: dados.descricao,
        eixoId: dados.eixoId,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { areaTematicaId: criada.id };
  });
}

export async function criarPublicoAlvo(
  prisma: PrismaClient,
  input: CriarPublicoAlvoInput
): Promise<{ readonly publicoAlvoId: string }> {
  const dados = zCriarPublicoAlvoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarPublicoAlvo, "ENTE");

    const criado = await tx.publicoAlvo.create({
      data: { codigo: dados.codigo, descricao: dados.descricao, criadoPor: dados.criadoPor },
      select: { id: true },
    });
    return { publicoAlvoId: criado.id };
  });
}

export async function criarMacroacao(
  prisma: PrismaClient,
  input: CriarMacroacaoInput
): Promise<{ readonly macroacaoId: string }> {
  const dados = zCriarMacroacaoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarMacroacao, "ENTE");

    const criada = await tx.macroacao.create({
      data: { codigo: dados.codigo, descricao: dados.descricao, criadoPor: dados.criadoPor },
      select: { id: true },
    });
    return { macroacaoId: criada.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PPA — O PROGRAMA NO PLANO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ ELE NÃO RECEBE `objetivo`. O objetivo é do `Programa` (M02,
 * `m02-planejamento.prisma:121`) e não se repete por plano: um programa tem UM objetivo,
 * e duplicá-lo criaria duas respostas para a mesma pergunta. O que varia por plano é a
 * ESTRATÉGIA — e essa, sim, é campo deste model.
 */
export async function criarProgramaPpa(
  prisma: PrismaClient,
  input: CriarProgramaPpaInput
): Promise<{ readonly programaPpaId: string }> {
  const dados = zCriarProgramaPpaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarProgramaPpa, "ENTE");

    await exigirPlano(tx, dados.planoId);

    const programa = await tx.programa.findUnique({
      where: { id: dados.programaId },
      select: { id: true },
    });
    if (programa === null) throw new Error(`Programa ${dados.programaId} não existe.`);

    const area = await tx.areaTematica.findUnique({
      where: { id: dados.areaTematicaId },
      select: { id: true },
    });
    if (area === null) throw new Error(`Área temática ${dados.areaTematicaId} não existe.`);

    const criado = await tx.programaPpa.create({
      data: {
        planoId: dados.planoId,
        programaId: dados.programaId,
        areaTematicaId: dados.areaTematicaId,
        publicoAlvoId: dados.publicoAlvoId ?? null,
        estrategia: dados.estrategia ?? null,
        valorPrevisto: dados.valorPrevisto.toFixed(2),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { programaPpaId: criado.id };
  });
}

export async function criarIndicadorPrograma(
  prisma: PrismaClient,
  input: CriarIndicadorProgramaInput
): Promise<{ readonly indicadorId: string }> {
  const dados = zCriarIndicadorProgramaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarIndicadorPrograma, "ENTE");

    const pp = await tx.programaPpa.findUnique({
      where: { id: dados.programaPpaId },
      select: { id: true },
    });
    if (pp === null) {
      throw new Error(`Programa do PPA ${dados.programaPpaId} não existe.`);
    }

    const criado = await tx.indicadorPrograma.create({
      data: {
        programaPpaId: dados.programaPpaId,
        descricao: dados.descricao,
        unidadeMedida: dados.unidadeMedida,
        // ⚠️ 6 casas: indicador NÃO é dinheiro. Uma taxa de 12,3456 por mil perderia
        // significado arredondada a dois decimais.
        situacaoInicial: dados.situacaoInicial.toFixed(6),
        situacaoModificada: dados.situacaoModificada.toFixed(6),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { indicadorId: criado.id };
  });
}

export async function criarAcaoPpa(
  prisma: PrismaClient,
  input: CriarAcaoPpaInput
): Promise<{ readonly acaoPpaId: string; readonly codigoReduzido: number }> {
  const dados = zCriarAcaoPpaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarAcaoPpa, "ENTE");

    const pp = await tx.programaPpa.findUnique({
      where: { id: dados.programaPpaId },
      select: { id: true, planoId: true, programaId: true },
    });
    if (pp === null) {
      throw new Error(`Programa do PPA ${dados.programaPpaId} não existe.`);
    }

    const acao = await tx.acao.findUnique({
      where: { id: dados.acaoId },
      select: { id: true },
    });
    if (acao === null) throw new Error(`Ação ${dados.acaoId} não existe.`);

    const [unidade, funcao, subfuncao] = await Promise.all([
      tx.unidadeOrcamentaria.findUnique({ where: { id: dados.unidadeExecutoraId }, select: { id: true } }),
      tx.funcao.findUnique({ where: { id: dados.funcaoId }, select: { id: true } }),
      tx.subfuncao.findUnique({ where: { id: dados.subfuncaoId }, select: { id: true } }),
    ]);
    if (unidade === null) throw new Error(`Unidade executora ${dados.unidadeExecutoraId} não existe.`);
    if (funcao === null) throw new Error(`Função ${dados.funcaoId} não existe.`);
    if (subfuncao === null) throw new Error(`Subfunção ${dados.subfuncaoId} não existe.`);

    const criada = await tx.acaoPpa.create({
      data: {
        programaPpaId: dados.programaPpaId,
        acaoId: dados.acaoId,
        macroacaoId: dados.macroacaoId ?? null,
        unidadeExecutoraId: dados.unidadeExecutoraId,
        funcaoId: dados.funcaoId,
        subfuncaoId: dados.subfuncaoId,
        produto: dados.produto,
        unidadeMedida: dados.unidadeMedida,
        regiaoAtendida: dados.regiaoAtendida ?? null,
        // ⚠️ Meta física com 6 casas: "3,5 km" e "0,25 do sistema" são metas legítimas.
        metaFisica: dados.metaFisica.toFixed(6),
        metaFinanceira: dados.metaFinanceira.toFixed(2),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    // V36 (TR 5.9.1.8) — o código reduzido da combinação, na mesma transação: a ação nasce com ele.
    const codigo = await atribuirCodigoReduzidoNaTransacao(tx, {
      planoId: pp.planoId,
      unidadeExecutoraId: dados.unidadeExecutoraId,
      funcaoId: dados.funcaoId,
      subfuncaoId: dados.subfuncaoId,
      programaId: pp.programaId,
      acaoId: dados.acaoId,
      criadoPor: dados.criadoPor,
    });
    return { acaoPpaId: criada.id, codigoReduzido: codigo.numero };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PPA — A RECEITA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ O ANO TEM DE ESTAR DENTRO DO QUADRIÊNIO, e isso NÃO dá para pôr num CHECK: a
 * validação cruza duas tabelas (`PrevisaoReceitaPpa.ano` contra
 * `PlanoPlurianual.anoInicio/anoFim`), e CHECK não atravessa tabelas. É a mesma razão
 * pela qual a bicondicional da hipótese de dispensa mora no PROCESSO e não no contrato
 * (M11). O guard vive aqui, dentro da transação, lendo o plano.
 */
export async function criarPrevisaoReceitaPpa(
  prisma: PrismaClient,
  input: CriarPrevisaoReceitaPpaInput
): Promise<{ readonly previsaoId: string }> {
  const dados = zCriarPrevisaoReceitaPpaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarPrevisaoReceitaPpa, "ENTE");

    const plano = await exigirPlano(tx, dados.planoId);
    if (!anoNoQuadrienio(plano.anoInicio, plano.anoFim, dados.ano)) {
      throw new Error(
        `ANO FORA DO QUADRIÊNIO: ${dados.ano} não está entre ${plano.anoInicio} e ` +
          `${plano.anoFim}. Uma previsão fora do plano não seria somada por relatório ` +
          `nenhum — ela existiria no banco e em lugar nenhum mais.`
      );
    }

    const criada = await tx.previsaoReceitaPpa.create({
      data: {
        planoId: dados.planoId,
        naturezaReceitaId: dados.naturezaReceitaId,
        fonteId: dados.fonteId,
        ano: dados.ano,
        valor: dados.valor.toFixed(2),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { previsaoId: criada.id };
  });
}

/**
 * ⚠️ AQUI O ANO TEM DE SER **ANTERIOR** AO QUADRIÊNIO — é a série histórica que
 * INSTRUI a projeção. Um "histórico" dentro do próprio plano seria a previsão se
 * justificando com ela mesma.
 */
export async function criarReceitaAnteriorPpa(
  prisma: PrismaClient,
  input: CriarReceitaAnteriorPpaInput
): Promise<{ readonly receitaAnteriorId: string }> {
  const dados = zCriarReceitaAnteriorPpaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarReceitaAnteriorPpa, "ENTE");

    const plano = await exigirPlano(tx, dados.planoId);
    if (dados.ano >= plano.anoInicio) {
      throw new Error(
        `ANO NÃO É ANTERIOR AO PLANO: ${dados.ano} não precede ${plano.anoInicio}. ` +
          `A série histórica existe para JUSTIFICAR a projeção — um "histórico" dentro ` +
          `do próprio quadriênio seria a previsão se justificando com ela mesma.`
      );
    }

    const criada = await tx.receitaAnteriorPpa.create({
      data: {
        planoId: dados.planoId,
        naturezaReceitaId: dados.naturezaReceitaId,
        ano: dados.ano,
        valor: dados.valor.toFixed(2),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { receitaAnteriorId: criada.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LDO
// ═══════════════════════════════════════════════════════════════════════════

export async function criarLdo(
  prisma: PrismaClient,
  input: CriarLdoInput
): Promise<{ readonly ldoId: string }> {
  const dados = zCriarLdoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarLdo, "ENTE");

    const criada = await tx.leiDiretrizesOrcamentarias.create({
      data: {
        exercicio: dados.exercicio,
        inicioVigencia: dados.inicioVigencia,
        fimVigencia: dados.fimVigencia,
        dataEnvioLegislativo: dados.dataEnvioLegislativo ?? null,
        dataDevolucaoExecutivo: dados.dataDevolucaoExecutivo ?? null,
        numeroProtocolo: dados.numeroProtocolo ?? null,
        dataSancao: dados.dataSancao ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { ldoId: criada.id };
  });
}

export async function criarPrioridadeLdo(
  prisma: PrismaClient,
  input: CriarPrioridadeLdoInput
): Promise<{ readonly prioridadeId: string }> {
  const dados = zCriarPrioridadeLdoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarPrioridadeLdo, "ENTE");

    await exigirLdo(tx, dados.ldoId);

    if (dados.acaoId !== undefined) {
      const acao = await tx.acao.findUnique({
        where: { id: dados.acaoId },
        select: { id: true },
      });
      if (acao === null) throw new Error(`Ação ${dados.acaoId} não existe.`);
    }

    const criada = await tx.prioridadeLdo.create({
      data: {
        ldoId: dados.ldoId,
        acaoId: dados.acaoId ?? null,
        descricaoAcao: dados.descricaoAcao,
        produto: dados.produto,
        unidadeMedida: dados.unidadeMedida,
        meta: dados.meta.toFixed(6),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { prioridadeId: criada.id };
  });
}

/**
 * ⚠️ `resultadoPrimario` NÃO ENTRA NA GRAVAÇÃO — ele é derivado das duas parcelas
 * primárias por `resultadoPrimario()` (dominio.ts). Gravá-lo seria cache de dinheiro:
 * no dia em que alguém corrigisse a receita primária e esquecesse o resultado, a LDO
 * declararia um superávit que as próprias parcelas dela desmentem.
 */
export async function criarMetaAnualLdo(
  prisma: PrismaClient,
  input: CriarMetaAnualLdoInput
): Promise<{ readonly metaAnualId: string }> {
  const dados = zCriarMetaAnualLdoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarMetaAnualLdo, "ENTE");

    await exigirLdo(tx, dados.ldoId);

    const criada = await tx.metaAnualLdo.create({
      data: {
        ldoId: dados.ldoId,
        ano: dados.ano,
        receitaTotal: dados.receitaTotal.toFixed(2),
        receitaPrimaria: dados.receitaPrimaria.toFixed(2),
        despesaTotal: dados.despesaTotal.toFixed(2),
        despesaPrimaria: dados.despesaPrimaria.toFixed(2),
        resultadoNominal: dados.resultadoNominal.toFixed(2),
        dividaPublicaConsolidada: dados.dividaPublicaConsolidada.toFixed(2),
        dividaConsolidadaLiquida: dados.dividaConsolidadaLiquida.toFixed(2),
        receitaPrimariaPpp: dados.receitaPrimariaPpp.toFixed(2),
        despesaPrimariaPpp: dados.despesaPrimariaPpp.toFixed(2),
        impactoSaldoPpp: dados.impactoSaldoPpp.toFixed(2),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { metaAnualId: criada.id };
  });
}

export async function criarRiscoFiscal(
  prisma: PrismaClient,
  input: CriarRiscoFiscalInput
): Promise<{ readonly riscoId: string }> {
  const dados = zCriarRiscoFiscalInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarRiscoFiscal, "ENTE");

    await exigirLdo(tx, dados.ldoId);

    const criado = await tx.riscoFiscal.create({
      data: {
        ldoId: dados.ldoId,
        codigoPassivo: dados.codigoPassivo,
        descricaoPassivo: dados.descricaoPassivo,
        valorPassivo: dados.valorPassivo.toFixed(2),
        descricaoProvidencia: dados.descricaoProvidencia,
        valorProvidencia: dados.valorProvidencia.toFixed(2),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { riscoId: criado.id };
  });
}

export async function criarRenunciaReceitaLdo(
  prisma: PrismaClient,
  input: CriarRenunciaReceitaLdoInput
): Promise<{ readonly renunciaId: string }> {
  const dados = zCriarRenunciaReceitaLdoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarRenunciaReceitaLdo, "ENTE");

    await exigirLdo(tx, dados.ldoId);

    const criada = await tx.renunciaReceitaLdo.create({
      data: {
        ldoId: dados.ldoId,
        descricao: dados.descricao,
        valor: dados.valor.toFixed(2),
        descricaoCompensacao: dados.descricaoCompensacao,
        valorCompensacao: dados.valorCompensacao.toFixed(2),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { renunciaId: criada.id };
  });
}

export async function criarAlienacaoBemLdo(
  prisma: PrismaClient,
  input: CriarAlienacaoBemLdoInput
): Promise<{ readonly alienacaoId: string }> {
  const dados = zCriarAlienacaoBemLdoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarAlienacaoBemLdo, "ENTE");

    await exigirLdo(tx, dados.ldoId);

    const criada = await tx.alienacaoBemLdo.create({
      data: {
        ldoId: dados.ldoId,
        descricaoBem: dados.descricaoBem,
        valorAlienacao: dados.valorAlienacao.toFixed(2),
        numeroLaudo: dados.numeroLaudo ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { alienacaoId: criada.id };
  });
}

/**
 * ⚠️ A APLICAÇÃO NÃO EXISTE SEM A ALIENAÇÃO PAI — e a FK do banco já impede o órfão.
 * O guard aqui existe pela MENSAGEM: sem ele, o usuário levaria um erro de constraint
 * do Postgres em vez de "a alienação X não existe".
 */
export async function criarAplicacaoAlienacaoLdo(
  prisma: PrismaClient,
  input: CriarAplicacaoAlienacaoLdoInput
): Promise<{ readonly aplicacaoId: string }> {
  const dados = zCriarAplicacaoAlienacaoLdoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      dados.criadoPor,
      ACAO_DO_SERVICO.criarAplicacaoAlienacaoLdo,
      "ENTE"
    );

    const alienacao = await tx.alienacaoBemLdo.findUnique({
      where: { id: dados.alienacaoId },
      select: { id: true },
    });
    if (alienacao === null) {
      throw new Error(
        `Alienação ${dados.alienacaoId} não existe. A aplicação do produto (LRF art. 44) ` +
          `é sempre DE uma alienação — sem ela, não há produto a aplicar.`
      );
    }

    const criada = await tx.aplicacaoAlienacaoLdo.create({
      data: {
        alienacaoId: dados.alienacaoId,
        tipoAplicacao: dados.tipoAplicacao,
        anoAplicacao: dados.anoAplicacao,
        descricao: dados.descricao,
        valor: dados.valor.toFixed(2),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { aplicacaoId: criada.id };
  });
}

export async function criarDividaConsolidadaLdo(
  prisma: PrismaClient,
  input: CriarDividaConsolidadaLdoInput
): Promise<{ readonly dividaId: string }> {
  const dados = zCriarDividaConsolidadaLdoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarDividaConsolidadaLdo, "ENTE");

    await exigirLdo(tx, dados.ldoId);

    const criada = await tx.dividaConsolidadaLdo.create({
      data: {
        ldoId: dados.ldoId,
        ano: dados.ano,
        dividaConsolidada: dados.dividaConsolidada.toFixed(2),
        deducoes: dados.deducoes.toFixed(2),
        receitaCorrenteLiquida: dados.receitaCorrenteLiquida.toFixed(2),
        // ⚠️ 6 casas: é ÍNDICE, não dinheiro. O limite do Senado (Resolução 40) é 1,2 da
        // RCL para municípios, e dois decimais perderiam a casa que separa o cumprimento
        // do descumprimento.
        percentualRcl: dados.percentualRcl.toFixed(6),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { dividaId: criada.id };
  });
}

export async function criarProjecaoAtuarialRpps(
  prisma: PrismaClient,
  input: CriarProjecaoAtuarialRppsInput
): Promise<{ readonly projecaoId: string }> {
  const dados = zCriarProjecaoAtuarialRppsInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarProjecaoAtuarialRpps, "ENTE");

    await exigirLdo(tx, dados.ldoId);

    const criada = await tx.projecaoAtuarialRpps.create({
      data: {
        ldoId: dados.ldoId,
        ano: dados.ano,
        receitasPrevidenciarias: dados.receitasPrevidenciarias.toFixed(2),
        despesasPrevidenciarias: dados.despesasPrevidenciarias.toFixed(2),
        // ⚠️ PODEM SER NEGATIVOS — um RPPS deficitário é exatamente o que a projeção
        // atuarial existe para revelar. Nenhum guard de sinal.
        resultadoPrevidenciario: dados.resultadoPrevidenciario.toFixed(2),
        saldoFinanceiro: dados.saldoFinanceiro.toFixed(2),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { projecaoId: criada.id };
  });
}

export async function criarMargemExpansaoLdo(
  prisma: PrismaClient,
  input: CriarMargemExpansaoLdoInput
): Promise<{ readonly margemId: string }> {
  const dados = zCriarMargemExpansaoLdoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.criarMargemExpansaoLdo, "ENTE");

    await exigirLdo(tx, dados.ldoId);

    const criada = await tx.margemExpansaoLdo.create({
      data: {
        ldoId: dados.ldoId,
        ano: dados.ano,
        aumentoPermanenteReceita: dados.aumentoPermanenteReceita.toFixed(2),
        reducaoPermanenteDespesa: dados.reducaoPermanenteDespesa.toFixed(2),
        novasDespesasObrigatorias: dados.novasDespesasObrigatorias.toFixed(2),
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { margemId: criada.id };
  });
}
