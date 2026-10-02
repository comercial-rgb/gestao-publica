import type { PrismaClient } from "../../../../prisma/generated/client/client.js";
import { vigenteNoCorte } from "../../../../modules/m02-planejamento/declaracao-da-unidade.js";
import { serializarArquivo, type LayoutArquivo } from "./registry.js";
import { nomeArquivo } from "./nomenclatura.js";
import { TIPO_ACAO_SAGRES } from "./dominios-2026v11.js";
import {
  LAYOUT_ACAO,
  LAYOUT_ORDENADOR,
  LAYOUT_PROGRAMAS,
  LAYOUT_RECEITA_PREVISTA,
  LAYOUT_RESPONSAVEL_SIAFIC,
  LAYOUT_SALDO_INICIAL,
  LAYOUT_RELACIONAMENTO_EMPENHO_LICITACAO,
  LAYOUT_ATUALIZACAO_ORCAMENTARIA,
  LAYOUT_DECRETOS_E_OFICIOS,
  LAYOUT_NORMAS_ORCAMENTARIAS,
  type AtualizacaoOrcamentariaFato,
  type DecretoOuOficioFato,
  type NormaOrcamentariaFato,
  type AcaoFato,
  type OrdenadorFato,
  type ProgramaFato,
  type ReceitaPrevistaFato,
  type ResponsavelSiaficFato,
  type SaldoInicialFato,
  type RelacionamentoEmpenhoLicitacaoFato,
} from "./layout-2026v11.js";
import { diaCivil } from "../../../../packages/datas/index.js";
import { toMoney } from "../../../../packages/contracts/index.js";
import { conciliacaoBancaria } from "../../../../modules/m09-tesouraria/conciliacao.js";
import { comDigito, exigirTripla } from "./gerador.js";
import { licitacaoNoTramita } from "../../../../modules/m11-licitacoes/identificacao-no-tramita.js";
import { lerArquivo } from "../../../../modules/m22-documentos/armazenamento.js";
import { TIPO_CONTA_CORRENTE } from "./layout-2026v11.js";

/**
 * V26 — AS TABELAS DO SAGRES QUE DEPENDIAM DE DECISÃO OU DE CADASTRO (ordem V26, item 2).
 *
 * Mesmo regime das V24/V25: cada arquivo sai do fato gravado, ou a recusa nomeia o que falta (o cadastro, o
 * documento, a declaração) e o arquivo fica FORA do pacote — o resto do pacote não para por isso.
 */

export interface ArquivoV26 {
  readonly nome: string;
  readonly conteudo: Buffer;
  readonly registros: number;
}

function empacotar<T>(layout: LayoutArquivo<T>, nome: string, fatos: readonly T[]): ArquivoV26 {
  return { nome, conteudo: serializarArquivo(layout, fatos), registros: fatos.length };
}

/** O último instante do mês da competência (UTC, o eixo do leiaute). */
function corteDoMes(competencia: Date): Date {
  return new Date(Date.UTC(competencia.getUTCFullYear(), competencia.getUTCMonth() + 1, 1) - 1);
}

// ── §4.2 Programas e §4.3 Acao: os do orçamento do exercício ───────────────────────────────────────

/** Os programas das fichas do exercício da competência, com a declaração vigente no fim do mês. */
export async function lerFatosProgramas(
  prisma: PrismaClient,
  p: { readonly codUnidadeGestora: string; readonly competencia: Date }
): Promise<ProgramaFato[]> {
  const exercicio = p.competencia.getUTCFullYear();
  const corte = corteDoMes(p.competencia);
  const programas = await prisma.programa.findMany({
    where: { fichas: { some: { exercicio } } },
    orderBy: { codigo: "asc" },
    select: { codigo: true, declaracoes: { select: { descricao: true, objetivo: true, tipoObjetivoMilenio: true, vigenteDesde: true, criadoEm: true } } },
  });
  const sem: string[] = [];
  const fatos: ProgramaFato[] = [];
  for (const g of programas) {
    const v = vigenteNoCorte(g.declaracoes, corte);
    if (v === null) {
      sem.push(g.codigo);
      continue;
    }
    fatos.push({ codUnidadeGestora: p.codUnidadeGestora, codigo: g.codigo, descricao: v.descricao, descObjetivo: v.objetivo, tipoObjetivoMilenio: v.tipoObjetivoMilenio });
  }
  if (sem.length > 0) {
    throw new Error(
      `SAGRES/Programas §4.2 — programa(s) do orçamento de ${exercicio} sem objetivo e objetivo da Agenda 2030 declarados até o fim do mês: ${sem.join(", ")}. ` +
        `Declare em Planejamento › Programas e ações.`
    );
  }
  return fatos;
}

export async function lerFatosAcao(
  prisma: PrismaClient,
  p: { readonly codUnidadeGestora: string; readonly competencia: Date }
): Promise<AcaoFato[]> {
  const exercicio = p.competencia.getUTCFullYear();
  const corte = corteDoMes(p.competencia);
  const acoes = await prisma.acao.findMany({
    where: { fichas: { some: { exercicio } } },
    orderBy: { codigo: "asc" },
    select: { codigo: true, tipo: true, declaracoes: { select: { descricao: true, descMeta: true, unidadeMedida: true, vigenteDesde: true, criadoEm: true } } },
  });
  const sem: string[] = [];
  const fatos: AcaoFato[] = [];
  for (const a of acoes) {
    const v = vigenteNoCorte(a.declaracoes, corte);
    if (v === null) {
      sem.push(a.codigo);
      continue;
    }
    fatos.push({ codUnidadeGestora: p.codUnidadeGestora, codigo: a.codigo, descricao: v.descricao, tipo: TIPO_ACAO_SAGRES[a.tipo], descMeta: v.descMeta, unidadeMedida: v.unidadeMedida });
  }
  if (sem.length > 0) {
    throw new Error(`SAGRES/Acao §4.3 — ação(ões) do orçamento de ${exercicio} sem denominação declarada até o fim do mês: ${sem.join(", ")}. Declare em Planejamento › Programas e ações.`);
  }
  return fatos;
}

export async function gerarProgramas(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly competencia: Date }): Promise<ArquivoV26> {
  return empacotar(LAYOUT_PROGRAMAS, nomeArquivo({ codUnidadeGestora: p.codUnidadeGestora, periodicidade: "MENSAL", entidade: "Programas", competencia: p.competencia }), await lerFatosProgramas(prisma, p));
}
export async function gerarAcao(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly competencia: Date }): Promise<ArquivoV26> {
  return empacotar(LAYOUT_ACAO, nomeArquivo({ codUnidadeGestora: p.codUnidadeGestora, periodicidade: "MENSAL", entidade: "Acao", competencia: p.competencia }), await lerFatosAcao(prisma, p));
}

// ── §4.36 Ordenador (diário) e §4.48 ResponsavelSiafic (balancete de janeiro) ───────────────────────

/** Os ordenadores cuja designação começa no dia (a relação do Tribunal cresce por designação, não por mês). */
export async function lerFatosOrdenador(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly dia: Date }): Promise<OrdenadorFato[]> {
  const dia = p.dia.toISOString().slice(0, 10);
  const todas = await prisma.designacaoDeOrdenador.findMany({ select: { cpf: true, nome: true, vigenteDesde: true }, orderBy: [{ cpf: "asc" }] });
  const doDia = todas.filter((g) => diaCivil(g.vigenteDesde) === dia);
  const porCpf = new Map<string, OrdenadorFato>();
  for (const g of doDia) if (!porCpf.has(g.cpf)) porCpf.set(g.cpf, { codUnidadeGestora: p.codUnidadeGestora, cpf: g.cpf, nome: g.nome });
  return [...porCpf.values()];
}
export async function gerarOrdenador(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly dia: Date }): Promise<ArquivoV26> {
  return empacotar(LAYOUT_ORDENADOR, nomeArquivo({ codUnidadeGestora: p.codUnidadeGestora, periodicidade: "DIARIO", entidade: "Ordenador", competencia: p.dia }), await lerFatosOrdenador(prisma, p));
}

/** O responsável pelo sistema vigente no fim de janeiro do exercício. Sem declaração: recusa nomeada. */
export async function lerFatosResponsavelSiafic(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly exercicio: number }): Promise<ResponsavelSiaficFato[]> {
  const corte = new Date(Date.UTC(p.exercicio, 1, 1) - 1);
  const todas = await prisma.declaracaoDoResponsavelSiafic.findMany();
  const v = vigenteNoCorte(todas, corte);
  if (v === null) {
    throw new Error(`SAGRES/ResponsavelSiafic §4.48 — não há responsável pelo sistema declarado até 31/01/${p.exercicio}. Declare em Contabilidade › Ordenadores e responsável pelo sistema.`);
  }
  return [
    {
      codUnidadeGestora: p.codUnidadeGestora,
      cnpjEmpresa: v.cnpjEmpresa,
      nomeEmpresa: v.nomeEmpresa,
      telefoneEmpresa: v.telefoneEmpresa,
      emailEmpresa: v.emailEmpresa,
      denominacaoSiafic: v.denominacaoSiafic,
      cpfResponsavelTecnico: v.cpfResponsavelTecnico,
      nomeResponsavelTecnico: v.nomeResponsavelTecnico,
      emailResponsavelTecnico: v.emailResponsavelTecnico,
      telefoneResponsavelTecnico: v.telefoneResponsavelTecnico,
    },
  ];
}
export async function gerarResponsavelSiafic(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly exercicio: number }): Promise<ArquivoV26> {
  return empacotar(
    LAYOUT_RESPONSAVEL_SIAFIC,
    nomeArquivo({ codUnidadeGestora: p.codUnidadeGestora, periodicidade: "ANUAL", entidade: "ResponsavelSiafic", competencia: new Date(Date.UTC(p.exercicio, 0, 31)) }),
    await lerFatosResponsavelSiafic(prisma, p)
  );
}

// ── §4.7 ReceitaPrevista (anual — janeiro) ───────────────────────────────────────────────────────────

/**
 * O tipo do §5.23 de cada tipo interno. ORÇAMENTÁRIA e INTRAORÇAMENTÁRIA são lançamento de receita (1): a tabela não
 * tem tipo próprio para a intraorçamentária, e a natureza dela já a distingue (interpretação registrada, não regra do
 * Tribunal). A DEDUÇÃO tem três subtipos (3, 4, 5), que só o detalhe da linha diz — sem ele, recusa nomeando.
 */
const TIPO_RECEITA_SAGRES: Readonly<Record<"ORCAMENTARIA" | "INTRA_ORCAMENTARIA", string>> = { ORCAMENTARIA: "1", INTRA_ORCAMENTARIA: "1" };

export async function lerFatosReceitaPrevista(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly exercicio: number }): Promise<ReceitaPrevistaFato[]> {
  const linhas = await prisma.receitaPrevista.findMany({
    where: { exercicio: p.exercicio },
    orderBy: [{ naturezaReceita: { codigo: "asc" } }, { fonte: { codigo: "asc" } }],
    select: { exercicioFonte: true, tipoReceita: true, valorPrevisto: true, naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } }, detalhe: { select: { tipoDeducaoSagres: true } } },
  });
  const semSubtipo: string[] = [];
  const fatos: ReceitaPrevistaFato[] = [];
  for (const l of linhas) {
    const valor = toMoney(l.valorPrevisto.toFixed(2)).abs();
    if (valor.isZero()) continue; // §4.7: o valor deve ser maior que zero (a linha zerada da LOA não vai).
    let tipo: string;
    if (l.tipoReceita === "DEDUCAO") {
      const t = l.detalhe?.tipoDeducaoSagres ?? null;
      if (t === null) {
        semSubtipo.push(`${l.naturezaReceita.codigo}/${l.fonte.codigo}`);
        continue;
      }
      tipo = t;
    } else tipo = TIPO_RECEITA_SAGRES[l.tipoReceita];
    fatos.push({ codUnidadeGestora: p.codUnidadeGestora, competencia: p.exercicio, codReceitaOrcamentaria: l.naturezaReceita.codigo, exercicioFonteRecurso: l.exercicioFonte, codFonteRecurso: l.fonte.codigo, tipoReceita: tipo, valor });
  }
  if (semSubtipo.length > 0) {
    throw new Error(`SAGRES/ReceitaPrevista §4.7 — dedução(ões) de ${p.exercicio} sem o subtipo (Fundeb, rendimentos de investimentos ou outra): ${semSubtipo.join(", ")}. Detalhe em Planejamento › Receita prevista.`);
  }
  return fatos;
}
export async function gerarReceitaPrevista(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly exercicio: number }): Promise<ArquivoV26> {
  return empacotar(LAYOUT_RECEITA_PREVISTA, nomeArquivo({ codUnidadeGestora: p.codUnidadeGestora, periodicidade: "ANUAL", entidade: "ReceitaPrevista", competencia: new Date(Date.UTC(p.exercicio, 0, 31)) }), await lerFatosReceitaPrevista(prisma, p));
}

// ── §4.25 SaldoInicial (janeiro) ──────────────────────────────────────────────────────────────────

/**
 * O SALDO DE ABERTURA "JÁ CONCILIADO" (interpretação registrada, ordem V26 2.7): o saldo CONTÁBIL da conta em 31/12 do
 * exercício anterior, sustentado pela conciliação daquele dezembro ENCERRADA — que guarda o saldo do extrato, as
 * pendências justificadas, quem encerrou e quando. Não é o saldo do extrato (esse é o do SaldoMensal §4.26), e nada
 * é somado de novo: os ajustes já estão no razão. Conta sem a conciliação de dezembro encerrada: recusa nomeada.
 */
export async function lerFatosSaldoInicial(
  prisma: PrismaClient,
  p: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string; readonly exercicio: number }
): Promise<SaldoInicialFato[]> {
  const corte = new Date(Date.UTC(p.exercicio, 0, 1) - 1);
  const diaDoCorte = `${p.exercicio - 1}-12-31`;
  const contas = await prisma.contaBancaria.findMany({
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, banco: true, agencia: true, conta: true, digitoAgencia: true, digitoConta: true, conciliacoes: { select: { periodoFim: true, movimentos: { select: { tipo: true } } } } },
  });
  const semConciliacao: string[] = [];
  const fatos: SaldoInicialFato[] = [];
  for (const c of contas) {
    const encerradaEmDezembro = c.conciliacoes.some((x) => diaCivil(x.periodoFim) === diaDoCorte && x.movimentos.some((m) => m.tipo === "ENCERRAR"));
    if (!encerradaEmDezembro) {
      semConciliacao.push(c.codigo);
      continue;
    }
    const t = exigirTripla(c);
    const r = await conciliacaoBancaria(prisma, c.id, corte);
    fatos.push({
      codUnidadeGestora: p.codUnidadeGestora,
      numContaBancaria: comDigito(t.conta, c.digitoConta),
      numAgencia: comDigito(t.agencia, c.digitoAgencia),
      codBanco: t.banco,
      valor: toMoney(toMoney(r.saldoContabil).abs().toFixed(2)),
      tipoContaBancaria: TIPO_CONTA_CORRENTE,
      cnpjGerenciaContaBancaria: p.cnpjGerenciadora,
    });
  }
  if (semConciliacao.length > 0) {
    throw new Error(`SAGRES/SaldoInicial §4.25 — conta(s) sem a conciliação de 31/12/${p.exercicio - 1} encerrada: ${semConciliacao.join(", ")}. O saldo de abertura é o conciliado; encerre a conciliação de dezembro em Financeiro › Conciliação por período.`);
  }
  return fatos;
}
export async function gerarSaldoInicial(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string; readonly exercicio: number }): Promise<ArquivoV26> {
  return empacotar(LAYOUT_SALDO_INICIAL, nomeArquivo({ codUnidadeGestora: p.codUnidadeGestora, periodicidade: "ANUAL", entidade: "SaldoInicial", competencia: new Date(Date.UTC(p.exercicio, 0, 31)) }), await lerFatosSaldoInicial(prisma, p));
}

// ── §4.38 RelacionamentoEmpenhoLicitacao (mensal) ───────────────────────────────────────────────────

/** Os empenhos do mês com contrato, cada um com a licitação do processo como cadastrada no Tramita. */
export async function lerFatosRelacionamentoEmpenhoLicitacao(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly competencia: Date }): Promise<RelacionamentoEmpenhoLicitacaoFato[]> {
  const ano = p.competencia.getUTCFullYear();
  const mes = p.competencia.getUTCMonth();
  const empenhos = await prisma.empenho.findMany({
    where: { data: { gte: new Date(Date.UTC(ano, mes, 1)), lt: new Date(Date.UTC(ano, mes + 1, 1)) }, estornoDeId: null, anulacaoParcialDeId: null, contratoId: { not: null } },
    orderBy: { numero: "asc" },
    select: { numero: true, ficha: { select: { unidadeOrc: { select: { codigo: true } } } }, contrato: { select: { processoId: true, processo: { select: { numeroProcesso: true } } } } },
  });
  const sem: string[] = [];
  const fatos: RelacionamentoEmpenhoLicitacaoFato[] = [];
  for (const e of empenhos) {
    if (e.contrato === null) continue;
    const t = await licitacaoNoTramita(prisma, e.contrato.processoId);
    if (t === null) {
      sem.push(`empenho ${e.numero} (processo ${e.contrato.processo.numeroProcesso})`);
      continue;
    }
    fatos.push({ codUnidadeGestora: p.codUnidadeGestora, codUnidadeOrcamentaria: e.ficha.unidadeOrc.codigo, numEmpenho: e.numero, codUnidadeGestoraLicitacao: t.codUnidadeGestora, numLicitacao: t.numeroNoTramita, modalidadeLicitacao: t.modalidadeSagres });
  }
  if (sem.length > 0) {
    throw new Error(`SAGRES/RelacionamentoEmpenhoLicitacao §4.38 — sem o número da licitação no Tramita: ${sem.join("; ")}. Informe em Licitações › o processo.`);
  }
  return fatos;
}
export async function gerarRelacionamentoEmpenhoLicitacao(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly competencia: Date }): Promise<ArquivoV26> {
  return empacotar(LAYOUT_RELACIONAMENTO_EMPENHO_LICITACAO, nomeArquivo({ codUnidadeGestora: p.codUnidadeGestora, periodicidade: "MENSAL", entidade: "RelacionamentoEmpenhoLicitacao", competencia: p.competencia }), await lerFatosRelacionamentoEmpenhoLicitacao(prisma, p));
}

// ── §4.5 AtualizacaoOrcamentaria, §4.6 DecretoseOficios (com o PDF), §4.49 NormasOrcamentarias (diários) ──────────

/**
 * §5.13 TipoAlteracaoOrcamentaria — transcrição da tabela: o tipo do crédito da lei × a origem do recurso do decreto, e o
 * item que ANULA dotação (11). O 5 (reserva de contingência), o 12/13 (transposição) e o 14/15 (ofício) não saem daqui.
 */
const TIPO_ALTERACAO: Readonly<Record<"SUPLEMENTAR" | "ESPECIAL", Readonly<Record<string, string>>>> = {
  SUPLEMENTAR: { OPERACAO_CREDITO: "1", SUPERAVIT_FINANCEIRO: "2", EXCESSO_ARRECADACAO: "3", ANULACAO: "4" },
  ESPECIAL: { OPERACAO_CREDITO: "6", SUPERAVIT_FINANCEIRO: "7", ANULACAO: "8", EXCESSO_ARRECADACAO: "9" },
};

/** NNNNN + AAAA (o número do ato com 5 posições e o ano), ou a recusa: o campo tem 9 dígitos. */
function numeroComAno(numero: string, ano: number, posicoes: number, oque: string): string {
  const n = numero.replace(/\D/g, "");
  if (n === "" || n.length > posicoes) throw new Error(`SAGRES — o número ${numero} do ${oque} não cabe em ${posicoes} dígitos mais o ano.`);
  return `${n.padStart(posicoes, "0")}${String(ano)}`;
}

async function decretosDoDia(prisma: PrismaClient, dia: Date) {
  const d = dia.toISOString().slice(0, 10);
  const todos = await prisma.decretoCredito.findMany({
    where: { data: { gte: new Date(`${d}T00:00:00.000Z`), lt: new Date(new Date(`${d}T00:00:00.000Z`).getTime() + 86_400_000 + 3 * 3_600_000) } },
    orderBy: [{ ano: "asc" }, { numero: "asc" }],
    select: {
      id: true,
      numero: true,
      ano: true,
      data: true,
      origemRecurso: true,
      lei: { select: { numero: true, ano: true, tipoCredito: true } },
      anexos: { select: { id: true, sha256: true, mimeType: true }, orderBy: { criadoEm: "desc" } },
      itens: {
        where: { estornoDeId: null },
        select: {
          tipo: true,
          valor: true,
          fonte: { select: { codigo: true } },
          ficha: { select: { exercicioFonte: true, unidadeOrc: { select: { codigo: true } }, funcao: { select: { codigo: true } }, subfuncao: { select: { codigo: true } }, programa: { select: { codigo: true } }, acao: { select: { codigo: true } }, naturezaDespesa: { select: { codCategoria: true, codNatureza: true, codModalidade: true, codElemento: true } } } },
        },
      },
    },
  });
  // O decreto é do dia civil dele (a data é meio-dia civil): o recorte acima é largo, o filtro é exato.
  return todos.filter((x) => diaCivil(x.data) === d);
}

export async function lerFatosAtualizacaoOrcamentaria(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly dia: Date }): Promise<AtualizacaoOrcamentariaFato[]> {
  const fatos: AtualizacaoOrcamentariaFato[] = [];
  for (const dec of await decretosDoDia(prisma, p.dia)) {
    const numero = numeroComAno(dec.numero, dec.ano, 5, "decreto");
    for (const it of dec.itens) {
      let tipo: string;
      if (it.tipo === "ANULACAO") tipo = "11";
      else if (dec.lei.tipoCredito === "EXTRAORDINARIO") tipo = "10";
      else {
        const t = TIPO_ALTERACAO[dec.lei.tipoCredito][dec.origemRecurso];
        if (t === undefined) throw new Error(`SAGRES/AtualizacaoOrcamentaria §4.5 — o decreto ${dec.numero}/${dec.ano} tem origem ${dec.origemRecurso}, sem tipo na tabela do Tribunal.`);
        tipo = t;
      }
      if (dec.origemRecurso === "SUPERAVIT_FINANCEIRO" && it.tipo !== "ANULACAO" && it.ficha.exercicioFonte !== 2) {
        throw new Error(`SAGRES/AtualizacaoOrcamentaria §4.5 — o decreto ${dec.numero}/${dec.ano} abre crédito por superávit financeiro em ficha de fonte do exercício atual; o Tribunal exige a fonte do exercício anterior (tipo 2).`);
      }
      const n = it.ficha.naturezaDespesa;
      fatos.push({
        codUnidadeGestora: p.codUnidadeGestora,
        competencia: dec.ano,
        codUnidadeOrcamentaria: it.ficha.unidadeOrc.codigo,
        codFuncao: it.ficha.funcao.codigo,
        codSubfuncao: it.ficha.subfuncao.codigo,
        codPrograma: it.ficha.programa.codigo,
        codAcao: it.ficha.acao.codigo,
        numDecretoOficio: numero,
        tipoDecretoOficio: "1",
        tipoAlteracao: tipo,
        codCategoriaEconomica: n.codCategoria,
        codNaturezaDespesa: n.codNatureza,
        codModalidadeDespesa: n.codModalidade,
        codElementoDespesa: n.codElemento,
        exercicioFonteRecurso: it.ficha.exercicioFonte,
        codFonteRecurso: it.fonte.codigo,
        valor: toMoney(it.valor.toFixed(2)),
      });
    }
  }
  return fatos;
}

/** Os decretos do dia e o PDF de cada um (o Tribunal exige o arquivo). Sem o PDF, a recusa nomeia o decreto. */
export async function lerFatosDecretosEOficios(
  prisma: PrismaClient,
  p: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<{ readonly fatos: DecretoOuOficioFato[]; readonly pdfs: { readonly nome: string; readonly anexoId: string; readonly sha256: string }[] }> {
  const fatos: DecretoOuOficioFato[] = [];
  const pdfs: { nome: string; anexoId: string; sha256: string }[] = [];
  const semPdf: string[] = [];
  for (const dec of await decretosDoDia(prisma, p.dia)) {
    const numero = numeroComAno(dec.numero, dec.ano, 5, "decreto");
    const pdf = dec.anexos.find((a) => a.mimeType === "application/pdf");
    if (pdf === undefined) {
      semPdf.push(`${dec.numero}/${dec.ano}`);
      continue;
    }
    fatos.push({ codUnidadeGestora: p.codUnidadeGestora, competencia: dec.ano, numero, numLei: numeroComAno(dec.lei.numero, dec.lei.ano, 4, "lei"), data: dec.data, tipo: "1" });
    // §3: o nome do PDF é [Decreto|Oficio][UG][Número] — ex.: Oficio20113900012018.pdf.
    pdfs.push({ nome: `Decreto${p.codUnidadeGestora}${numero}.pdf`, anexoId: pdf.id, sha256: pdf.sha256 });
  }
  if (semPdf.length > 0) {
    throw new Error(`SAGRES/DecretoseOficios §4.6 — decreto(s) sem o PDF anexado (o Tribunal exige o arquivo de cada um): ${semPdf.join(", ")}. Anexe em Planejamento › Créditos adicionais.`);
  }
  return { fatos, pdfs };
}

/** §5.36 Tipo de lei. */
const TIPO_DE_LEI: Readonly<Record<"LOA" | "CREDITO_SUPLEMENTAR" | "CREDITO_ESPECIAL" | "TRANSPOSICAO", string>> = { LOA: "0", CREDITO_SUPLEMENTAR: "1", CREDITO_ESPECIAL: "2", TRANSPOSICAO: "3" };

/**
 * As normas publicadas no dia, com o protocolo do banco de legislação do TCE-PB. Uma lei de crédito ou a LOA publicada no
 * dia sem a norma registrada (sem protocolo) é nomeada na recusa — sem protocolo inventado.
 */
export async function lerFatosNormasOrcamentarias(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly dia: Date }): Promise<NormaOrcamentariaFato[]> {
  const d = p.dia.toISOString().slice(0, 10);
  const [normas, leis, loas] = await Promise.all([
    prisma.normaOrcamentariaNoTce.findMany({ orderBy: [{ ano: "asc" }, { numero: "asc" }] }),
    prisma.leiCredito.findMany({ where: { tipoCredito: { in: ["SUPLEMENTAR", "ESPECIAL"] } }, select: { numero: true, ano: true, dataPublicacao: true } }),
    prisma.aprovacaoDaLeiOrcamentaria.findMany({ select: { numeroDaLei: true, dataDaPublicacao: true, lei: { select: { exercicio: true } } } }),
  ]);
  const doDia = normas.filter((n) => diaCivil(n.dataPublicacao) === d);
  // A LOA casa pelo número e pelo tipo (o ano da publicação não é, por regra, o exercício anterior); a lei de crédito, pelo número e ano.
  const pendentes = [
    ...leis
      .filter((l) => diaCivil(l.dataPublicacao) === d && !normas.some((n) => n.tipo !== "LOA" && n.numero === l.numero.replace(/\D/g, "") && n.ano === l.ano))
      .map((l) => `${l.numero}/${l.ano}`),
    ...loas
      .filter((l) => diaCivil(l.dataDaPublicacao) === d && !normas.some((n) => n.tipo === "LOA" && n.numero === l.numeroDaLei.replace(/\D/g, "")))
      .map((l) => `${l.numeroDaLei} (LOA de ${String(l.lei.exercicio)})`),
  ];
  if (pendentes.length > 0) {
    throw new Error(`SAGRES/NormasOrcamentarias §4.49 — lei(s) publicada(s) no dia sem o protocolo do banco de legislação do TCE-PB: ${pendentes.join(", ")}. Registre em Planejamento › Créditos adicionais › Normas no Tribunal.`);
  }
  return doDia.map((n) => ({
    codUnidadeGestora: p.codUnidadeGestora,
    competencia: n.ano,
    numero: numeroComAno(n.numero, n.ano, 5, "lei"),
    data: n.dataPublicacao,
    tipo: TIPO_DE_LEI[n.tipo],
    protocoloTCE: n.protocoloTce,
    tipoAutorizacao: n.autorizacaoPercentual ? "1" : "0",
    valor: toMoney(n.valor.toFixed(2)),
  }));
}

export async function gerarAtualizacaoOrcamentaria(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly dia: Date }): Promise<ArquivoV26> {
  return empacotar(LAYOUT_ATUALIZACAO_ORCAMENTARIA, nomeArquivo({ codUnidadeGestora: p.codUnidadeGestora, periodicidade: "DIARIO", entidade: "AtualizacaoOrcamentaria", competencia: p.dia }), await lerFatosAtualizacaoOrcamentaria(prisma, p));
}
/** O arquivo da §4.6 e os PDFs dos decretos, conferidos pelo hash na leitura. */
export async function gerarDecretosEOficios(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly dia: Date }): Promise<readonly ArquivoV26[]> {
  const { fatos, pdfs } = await lerFatosDecretosEOficios(prisma, p);
  const arquivo = empacotar(LAYOUT_DECRETOS_E_OFICIOS, nomeArquivo({ codUnidadeGestora: p.codUnidadeGestora, periodicidade: "DIARIO", entidade: "DecretoseOficios", competencia: p.dia }), fatos);
  const anexos: ArquivoV26[] = [];
  for (const pdf of pdfs) anexos.push({ nome: pdf.nome, conteudo: Buffer.from(await lerArquivo(pdf.anexoId, pdf.sha256)), registros: 1 });
  return [arquivo, ...anexos];
}
export async function gerarNormasOrcamentarias(prisma: PrismaClient, p: { readonly codUnidadeGestora: string; readonly dia: Date }): Promise<ArquivoV26> {
  return empacotar(LAYOUT_NORMAS_ORCAMENTARIAS, nomeArquivo({ codUnidadeGestora: p.codUnidadeGestora, periodicidade: "DIARIO", entidade: "NormasOrcamentarias", competencia: p.dia }), await lerFatosNormasOrcamentarias(prisma, p));
}

// ── O grupo ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Os arquivos da V26 que entram no pacote do dia (os mensais pelo mês de referência), cada um por si: o que tem
 * recusa nomeada (mensagem que começa por "SAGRES") fica fora e vira violação na prévia; o resto entra.
 */
export async function gerarArquivosDaV26(
  prisma: PrismaClient,
  p: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string; readonly dia: Date; readonly competencia: Date }
): Promise<{ readonly arquivos: readonly { readonly arquivo: ArquivoV26; readonly layout: LayoutArquivo<never> }[]; readonly recusas: readonly { readonly arquivo: string; readonly detalhe: string }[] }> {
  const mensal = { codUnidadeGestora: p.codUnidadeGestora, competencia: p.competencia };
  const tarefas: readonly { readonly entidade: string; readonly layout: LayoutArquivo<never>; readonly gerar: () => Promise<ArquivoV26 | readonly ArquivoV26[]> }[] = [
    // Os diários das alterações orçamentárias: os itens dos decretos do dia, os decretos com o PDF, as leis com o protocolo.
    { entidade: "AtualizacaoOrcamentaria", layout: LAYOUT_ATUALIZACAO_ORCAMENTARIA as LayoutArquivo<never>, gerar: () => gerarAtualizacaoOrcamentaria(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }) },
    { entidade: "DecretoseOficios", layout: LAYOUT_DECRETOS_E_OFICIOS as LayoutArquivo<never>, gerar: () => gerarDecretosEOficios(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }) },
    { entidade: "NormasOrcamentarias", layout: LAYOUT_NORMAS_ORCAMENTARIAS as LayoutArquivo<never>, gerar: () => gerarNormasOrcamentarias(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }) },
    { entidade: "Programas", layout: LAYOUT_PROGRAMAS as LayoutArquivo<never>, gerar: () => gerarProgramas(prisma, mensal) },
    { entidade: "Acao", layout: LAYOUT_ACAO as LayoutArquivo<never>, gerar: () => gerarAcao(prisma, mensal) },
    { entidade: "RelacionamentoEmpenhoLicitacao", layout: LAYOUT_RELACIONAMENTO_EMPENHO_LICITACAO as LayoutArquivo<never>, gerar: () => gerarRelacionamentoEmpenhoLicitacao(prisma, mensal) },
    { entidade: "Ordenador", layout: LAYOUT_ORDENADOR as LayoutArquivo<never>, gerar: () => gerarOrdenador(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }) },
    // O balancete de janeiro: só no pacote de janeiro.
    ...(p.competencia.getUTCMonth() === 0
      ? [
          { entidade: "ResponsavelSiafic", layout: LAYOUT_RESPONSAVEL_SIAFIC as LayoutArquivo<never>, gerar: () => gerarResponsavelSiafic(prisma, { codUnidadeGestora: p.codUnidadeGestora, exercicio: p.competencia.getUTCFullYear() }) },
          { entidade: "SaldoInicial", layout: LAYOUT_SALDO_INICIAL as LayoutArquivo<never>, gerar: () => gerarSaldoInicial(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, exercicio: p.competencia.getUTCFullYear() }) },
          { entidade: "ReceitaPrevista", layout: LAYOUT_RECEITA_PREVISTA as LayoutArquivo<never>, gerar: () => gerarReceitaPrevista(prisma, { codUnidadeGestora: p.codUnidadeGestora, exercicio: p.competencia.getUTCFullYear() }) },
        ]
      : []),
  ];
  const arquivos: { arquivo: ArquivoV26; layout: LayoutArquivo<never> }[] = [];
  const recusas: { arquivo: string; detalhe: string }[] = [];
  for (const t of tarefas) {
    try {
      // A §4.6 devolve o arquivo e os PDFs dos decretos: o arquivo da tabela é o primeiro; os PDFs viajam com ele.
      const gerado = await t.gerar();
      for (const a of "nome" in gerado ? [gerado] : gerado) arquivos.push({ arquivo: a, layout: t.layout });
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith("SAGRES")) throw e;
      recusas.push({ arquivo: t.entidade, detalhe: e.message });
    }
  }
  return { arquivos, recusas };
}
