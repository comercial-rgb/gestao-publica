import type { PrismaClient } from "../../../../prisma/generated/client/client.js";
import { Decimal, toMoney } from "../../../../packages/contracts/index.js";
import { serializarArquivo, type LayoutArquivo } from "./registry.js";
import { nomeArquivo } from "./nomenclatura.js";
import { planoVigenteDoTribunal, type PlanoVigente } from "./plano-do-tribunal.js";
import { vigenteNoCorte } from "../../../../modules/m02-planejamento/declaracao-da-unidade.js";
import {
  conciliacaoBancaria,
  ConciliacaoNaoFechaError,
  MapeamentoContabilAusenteError,
} from "../../../../modules/m09-tesouraria/conciliacao.js";
import {
  EXERCICIO_FONTE_ATUAL,
  FONTES_RECURSO_EXTRA_SAGRES,
  LAYOUT_CADASTRO_CONTA,
  LAYOUT_DESPESA_EXTRA,
  LAYOUT_DOTACAO,
  LAYOUT_EMPENHOS,
  LAYOUT_LIQUIDACAO,
  LAYOUT_MOVIMENTACAO,
  LAYOUT_PAGAMENTOS,
  LAYOUT_ESTORNO_PAGAMENTO,
  LAYOUT_ESTORNOS,
  LAYOUT_ESTORNO_LIQUIDACAO,
  LAYOUT_UNIDADE_ORCAMENTARIA,
  DEPARA_ATO_JURIDICO_SAGRES,
  DEPARA_NATUREZA_JURIDICA_SAGRES,
  LAYOUT_CONCILIACAO_BANCARIA,
  tipoConciliacaoDe,
  LAYOUT_RECEITA_ORCAMENTARIA,
  LAYOUT_RETENCAO,
  LAYOUT_ESTORNO_RETENCAO,
  LAYOUT_ESTORNO_DESPESA_EXTRA,
  LAYOUT_RECEITA_EXTRA,
  LAYOUT_ESTORNO_RECEITA_EXTRA,
  LAYOUT_SALDO_MENSAL,
  MODALIDADE_SEM_LICITACAO,
  SITUACAO_CONTA_ATIVA,
  TIPO_CONTA_CORRENTE,
  type CadastroContaFato,
  type DespesaExtraFato,
  type DotacaoFato,
  type EmpenhoFato,
  type LiquidacaoFato,
  type MovimentacaoFato,
  type PagamentoFato,
  type EstornoPagamentoFato,
  type EstornoEmpenhoFato,
  type EstornoLiquidacaoFato,
  type UnidadeOrcamentariaFato,
  type ConciliacaoBancariaFato,
  type ReceitaOrcamentariaFato,
  type RetencaoFato,
  type EstornoRetencaoFato,
  type EstornoDespesaExtraFato,
  type ReceitaExtraFato,
  type EstornoReceitaExtraFato,
  type SaldoMensalFato,
} from "./layout-2026v11.js";

/**
 * GERADOR SAGRES — lê o razão/planejamento (Prisma) e produz o arquivo TXT. LEITURA PURA:
 * nenhum `create`/`update`/agregação-do-Prisma — só `findMany` e a serialização. O teste-invariante
 * (m15-sagres-gerador) varre este arquivo e falha se aparecer escrita (padrão do MANAD/M14).
 *
 * DOIS PASSOS SEPARADOS: `lerFatos*` (Prisma → DTO) e `gerar*` (DTO → arquivo). A porta (F4) usa os
 * `lerFatos*` para VALIDAR antes de serializar, e os `gerar*` para o download — sem ler o banco duas
 * vezes com lógica diferente.
 */

export interface ArquivoGerado {
  readonly nome: string;
  readonly conteudo: Buffer;
  readonly registros: number;
}

/** Decimal do Prisma → Money, pela borda de string (regra de ouro — nunca `number`). */
function money(d: { toFixed(casas: number): string }): ReturnType<typeof toMoney> {
  return toMoney(d.toFixed(2));
}

function intervaloDoDia(dia: Date): { gte: Date; lt: Date } {
  const gte = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), 0, 0, 0));
  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000);
  return { gte, lt };
}

/** Empacota fatos num arquivo (nome oficial + bytes + contagem). */
function empacotar<T>(layout: LayoutArquivo<T>, nome: string, fatos: readonly T[]): ArquivoGerado {
  return { nome, conteudo: serializarArquivo(layout, fatos), registros: fatos.length };
}

// ── DOTACAO (Mensal) — a fixação da LOA. Origem: FichaOrcamentaria. ──────────────
export async function lerFatosDotacao(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly exercicio: number }
): Promise<DotacaoFato[]> {
  const fichas = await prisma.fichaOrcamentaria.findMany({
    where: { exercicio: params.exercicio },
    include: { unidadeOrc: true, funcao: true, subfuncao: true, programa: true, acao: true, naturezaDespesa: true, fonte: true },
    orderBy: [{ unidadeOrcId: "asc" }, { numero: "asc" }], // determinístico
  });
  return fichas.map((f) => ({
    codUnidadeGestora: params.codUnidadeGestora,
    competencia: f.exercicio,
    codUnidadeOrcamentaria: f.unidadeOrc.codigo,
    codFuncao: f.funcao.codigo,
    codSubfuncao: f.subfuncao.codigo,
    codPrograma: f.programa.codigo,
    codAcao: f.acao.codigo,
    codCategoriaEconomica: f.naturezaDespesa.codCategoria,
    codNaturezaDespesa: f.naturezaDespesa.codNatureza,
    codModalidadeDespesa: f.naturezaDespesa.codModalidade,
    codElementoDespesa: f.naturezaDespesa.codElemento,
    exercicioFonteRecurso: f.exercicioFonte,
    codFonteRecurso: f.fonte.codigo,
    valor: money(f.valorDotado),
  }));
}

export async function gerarDotacao(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly exercicio: number; readonly competencia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosDotacao(prisma, params);
  return empacotar(LAYOUT_DOTACAO, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "MENSAL", entidade: "Dotacao", competencia: params.competencia }), fatos);
}

// ── EMPENHOS (Diário) — Origem: Empenho + FichaOrcamentaria. ─────────────────────
export async function lerFatosEmpenhos(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<EmpenhoFato[]> {
  const { gte, lt } = intervaloDoDia(params.dia);
  // O ORDENADOR é atributo do ente (S6): o empenho o herda daqui (quita o gap cpfOrdenador da S3).
  const ente = await prisma.enteConfig.findFirst({ select: { cpfOrdenador: true } });
  const cpfOrdenadorDoEnte = ente?.cpfOrdenador ?? null;
  // V23 — só EMPENHOS genuínos. A linha de anulação (inteira ou parcial) e o estorno de uma anulação
  // não são empenhos novos: vão a Estornos (§4.9), ou são recusados nomeando (`lerFatosEstornos`).
  const empenhos = await prisma.empenho.findMany({
    where: { data: { gte, lt }, estornoDeId: null, anulacaoParcialDeId: null },
    include: {
      subelemento: true,
      obra: true,
      ficha: { include: { unidadeOrc: true, funcao: true, subfuncao: true, programa: true, acao: true, naturezaDespesa: true, fonte: true, co: true } },
    },
    orderBy: [{ numero: "asc" }],
  });
  return empenhos.map((e) => {
    if (e.contratoId !== null) {
      // Empenho COM contrato: a modalidade sai do processo (m11), não mapeada nesta fatia. Para NÃO
      // inventar domínio (PATCH §4), recusa nomeando. A massa POC empenha sem contrato (modalidade "9").
      throw new Error(
        `SAGRES/Empenhos — empenho ${e.numero} tem contrato: a modalidade de licitação vem do ` +
          `processo (m11) e não está mapeada nesta fatia. Proibido inventar domínio (PATCH §4).`
      );
    }
    const f = e.ficha;
    return {
      codUnidadeGestora: params.codUnidadeGestora,
      anoEmissao: f.exercicio,
      codUnidadeOrcamentaria: f.unidadeOrc.codigo,
      codFuncao: f.funcao.codigo,
      codSubfuncao: f.subfuncao.codigo,
      codPrograma: f.programa.codigo,
      codAcao: f.acao.codigo,
      codCategoriaEconomica: f.naturezaDespesa.codCategoria,
      codNaturezaDespesa: f.naturezaDespesa.codNatureza,
      codModalidadeDespesa: f.naturezaDespesa.codModalidade,
      codElementoDespesa: f.naturezaDespesa.codElemento,
      codSubelemento: e.subelemento?.codigo ?? null,
      modalidadeLicitacao: MODALIDADE_SEM_LICITACAO,
      numLicitacao: null,
      numEmpenho: e.numero,
      tipoEmpenho: e.tipo,
      data: e.data,
      valor: money(e.valor),
      historico: e.historico,
      complementacaoHistorico: null,
      credorCpfCnpj: e.credorCpfCnpj,
      naturezaContratacao: e.categoriaOrdemCronologica,
      numObra: e.obra?.identificador ?? null,
      exercicioFonteRecurso: f.exercicioFonte,
      codFonteRecurso: f.fonte.codigo,
      cpfOrdenador: cpfOrdenadorDoEnte, // herdado do EnteConfig (S6) — quita o gap da S3
      co: f.co?.codigo ?? null,
    };
  });
}

export async function gerarEmpenhos(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosEmpenhos(prisma, params);
  return empacotar(LAYOUT_EMPENHOS, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "Empenhos", competencia: params.dia }), fatos);
}

// ── LIQUIDACAO (Diário) — Origem: Liquidacao + Empenho + Ficha. ──────────────────
export async function lerFatosLiquidacao(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<LiquidacaoFato[]> {
  const { gte, lt } = intervaloDoDia(params.dia);
  // V23 — só LIQUIDAÇÕES genuínas; as anulações vão a EstornoLiquidacao (§4.11).
  const liqs = await prisma.liquidacao.findMany({
    where: { data: { gte, lt }, estornoDeId: null, anulacaoParcialDeId: null },
    include: { empenho: { include: { ficha: { include: { unidadeOrc: true } } } } },
    orderBy: [{ empenhoId: "asc" }, { numero: "asc" }],
  });
  return liqs.map((l) => ({
    codUnidadeGestora: params.codUnidadeGestora,
    anoEmissaoEmpenho: l.empenho.ficha.exercicio,
    codUnidadeOrcamentaria: l.empenho.ficha.unidadeOrc.codigo,
    numEmpenho: l.empenho.numero,
    numero: l.numero,
    data: l.data,
    notaFiscal:
      l.notaFiscalChave !== null && l.notaFiscalData !== null && l.notaFiscalValor !== null
        ? { tipo: "02", chave: l.notaFiscalChave, numero: l.notaFiscalNum ?? "", serie: l.notaFiscalSerie ?? "", data: l.notaFiscalData, valor: money(l.notaFiscalValor) }
        : null,
    valor: money(l.valor),
    codAgrupamentoFolha: null,
  }));
}

export async function gerarLiquidacao(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosLiquidacao(prisma, params);
  return empacotar(LAYOUT_LIQUIDACAO, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "Liquidacao", competencia: params.dia }), fatos);
}

// ── A conta bancária com a tripla, ou o erro que nomeia o que falta. ─────────────
function exigirTripla(c: { codigo: string; banco: string | null; agencia: string | null; conta: string | null }): {
  banco: string;
  agencia: string;
  conta: string;
} {
  if (c.banco === null || c.agencia === null || c.conta === null) {
    throw new Error(
      `SAGRES/ContaBancaria — a conta "${c.codigo}" não tem a identificação bancária (banco/agência/conta) ` +
        `preenchida. O SAGRES a exige (CadastroContaBancaria §4.23). Cadastre a tripla antes de exportar.`
    );
  }
  return { banco: c.banco, agencia: c.agencia, conta: c.conta };
}

/** Conta + dígito (dado cru, só dígitos concatenados — a máscara BR é da UI). */
function comDigito(numero: string, digito: string | null): string {
  return `${numero}${digito ?? ""}`;
}

// ── CADASTROCONTABANCARIA (Diário) — Origem: ContaBancaria (a tripla). ───────────
export async function lerFatosCadastroConta(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string }
): Promise<CadastroContaFato[]> {
  const contas = await prisma.contaBancaria.findMany({ orderBy: [{ codigo: "asc" }] });
  return contas.map((c) => {
    const t = exigirTripla(c);
    return {
      codUnidadeGestora: params.codUnidadeGestora,
      numeroConta: comDigito(t.conta, c.digitoConta),
      situacao: SITUACAO_CONTA_ATIVA,
      banco: t.banco,
      numeroAgencia: comDigito(t.agencia, c.digitoAgencia),
      descricao: c.descricao,
      tipo: TIPO_CONTA_CORRENTE,
      cnpjGerencia: params.cnpjGerenciadora,
    };
  });
}

export async function gerarCadastroContaBancaria(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string; readonly dia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosCadastroConta(prisma, params);
  return empacotar(LAYOUT_CADASTRO_CONTA, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "CadastroContaBancaria", competencia: params.dia }), fatos);
}

// ── SALDOMENSAL (Mensal) — saldo por soma do extrato até o fim do mês. ───────────
export async function lerFatosSaldoMensal(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string; readonly competencia: Date }
): Promise<SaldoMensalFato[]> {
  const fimDoMes = new Date(Date.UTC(params.competencia.getUTCFullYear(), params.competencia.getUTCMonth() + 1, 1, 0, 0, 0));
  const contas = await prisma.contaBancaria.findMany({ orderBy: [{ codigo: "asc" }] });
  const fatos: SaldoMensalFato[] = [];
  for (const c of contas) {
    const t = exigirTripla(c);
    // Saldo na EXPORTAÇÃO (não há coluna materializada): Σcrédito − Σdébito até o fim do mês.
    // Leitura pura (findMany) + soma em JS via Decimal — a agregação fica no gerador, não no Prisma.
    const linhas = await prisma.lancamentoExtrato.findMany({
      where: { contaBancariaId: c.id, dataPostagem: { lt: fimDoMes } },
      select: { valor: true, natureza: true },
    });
    const saldo = linhas.reduce((acc, l) => (l.natureza === "CREDITO" ? acc.plus(l.valor) : acc.minus(l.valor)), new Decimal(0));
    fatos.push({
      codUnidadeGestora: params.codUnidadeGestora,
      numeroConta: comDigito(t.conta, c.digitoConta),
      numeroAgencia: comDigito(t.agencia, c.digitoAgencia),
      banco: t.banco,
      valor: toMoney(saldo.toFixed(2)),
      tipo: TIPO_CONTA_CORRENTE,
      cnpjGerencia: params.cnpjGerenciadora,
    });
  }
  return fatos;
}

export async function gerarSaldoMensal(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string; readonly competencia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosSaldoMensal(prisma, params);
  return empacotar(LAYOUT_SALDO_MENSAL, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "MENSAL", entidade: "SaldoMensal", competencia: params.competencia }), fatos);
}

// ── CONCILIACAOBANCARIA (Mensal, V21) — o saldo do extrato e as pendências do fim do mês. ──────
// O corte é o MESMO do SaldoMensal (fim do mês, formato externo em UTC): a linha tipo 1 tem de ser o
// mesmo número que o SaldoMensal manda para a mesma conta.
export async function lerFatosConciliacaoBancaria(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string; readonly competencia: Date }
): Promise<ConciliacaoBancariaFato[]> {
  const fimDoMes = new Date(Date.UTC(params.competencia.getUTCFullYear(), params.competencia.getUTCMonth() + 1, 1, 0, 0, 0));
  const corte = new Date(fimDoMes.getTime() - 1);
  const contas = await prisma.contaBancaria.findMany({ orderBy: [{ codigo: "asc" }] });
  const fatos: ConciliacaoBancariaFato[] = [];
  for (const c of contas) {
    const t = exigirTripla(c);
    const r = await conciliacaoBancaria(prisma, c.id, corte);
    const comum = {
      codUnidadeGestora: params.codUnidadeGestora,
      numeroConta: comDigito(t.conta, c.digitoConta),
      numeroAgencia: comDigito(t.agencia, c.digitoAgencia),
      banco: t.banco,
      tipoContaBancaria: TIPO_CONTA_CORRENTE,
      cnpjGerencia: params.cnpjGerenciadora,
    };
    let numero = 1;
    fatos.push({ ...comum, numero, tipoConciliacao: "1", descricao: "Saldo conforme extrato bancario", data: corte, valor: toMoney(toMoney(r.saldoExtrato).abs().toFixed(2)) });
    const pendencias = [
      ...r.noExtratoSemVinculo.map((l) => ({ l, lado: "EXTRATO" as const })),
      ...r.internoSemVinculo.map((l) => ({ l, lado: "RAZAO" as const })),
    ].sort((a, b) => a.l.data.getTime() - b.l.data.getTime() || (a.l.id < b.l.id ? -1 : a.l.id > b.l.id ? 1 : 0));
    for (const { l, lado } of pendencias) {
      numero += 1;
      const residual = toMoney(l.residual);
      fatos.push({ ...comum, numero, tipoConciliacao: tipoConciliacaoDe(lado, residual), descricao: l.descricao, data: l.data, valor: toMoney(residual.abs().toFixed(2)) });
    }
  }
  return fatos;
}

export async function gerarConciliacaoBancaria(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string; readonly competencia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosConciliacaoBancaria(prisma, params);
  return empacotar(LAYOUT_CONCILIACAO_BANCARIA, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "MENSAL", entidade: "ConciliacaoBancaria", competencia: params.competencia }), fatos);
}

/**
 * O arquivo, OU a recusa nomeada — para o PACOTE (V21).
 *
 * ⚠️ POR QUE O PACOTE NÃO CAI JUNTO. A conciliação recusa, com razão, a conta que não fecha ou que não
 * tem conta contábil. Deixar essa recusa derrubar o pacote mensal inteiro esconderia os outros onze
 * arquivos atrás de um problema de UMA conta; omitir a conciliação em silêncio seria pior. O pacote
 * sai SEM este arquivo e a prévia diz por quê. Só as duas recusas conhecidas são convertidas; qualquer
 * outro erro sobe.
 */
export async function gerarConciliacaoBancariaOuRecusa(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string; readonly competencia: Date }
): Promise<{ readonly arquivo: ArquivoGerado; readonly fatos: ConciliacaoBancariaFato[] } | { readonly recusa: string }> {
  try {
    const fatos = await lerFatosConciliacaoBancaria(prisma, params);
    const arquivo = empacotar(LAYOUT_CONCILIACAO_BANCARIA, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "MENSAL", entidade: "ConciliacaoBancaria", competencia: params.competencia }), fatos);
    return { arquivo, fatos };
  } catch (e) {
    if (e instanceof ConciliacaoNaoFechaError || e instanceof MapeamentoContabilAusenteError) {
      return { recusa: e.message };
    }
    throw e;
  }
}

// ── MOVIMENTACAOENTRECONTASBANCARIAS (Diário) — Origem: TransferenciaEntreContas (F1). ──
export async function lerFatosMovimentacao(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<MovimentacaoFato[]> {
  const { gte, lt } = intervaloDoDia(params.dia);
  const transfers = await prisma.transferenciaEntreContas.findMany({
    where: { data: { gte, lt } },
    include: { contaOrigem: true, contaDestino: true },
    orderBy: [{ codigo: "asc" }],
  });
  return transfers.map((t) => {
    const o = exigirTripla(t.contaOrigem);
    const d = exigirTripla(t.contaDestino);
    return {
      codUnidadeGestora: params.codUnidadeGestora,
      codBancoOrigem: o.banco,
      numAgenciaOrigem: comDigito(o.agencia, t.contaOrigem.digitoAgencia),
      numeroCtaOrigem: comDigito(o.conta, t.contaOrigem.digitoConta),
      tipoCtaOrigem: TIPO_CONTA_CORRENTE,
      codBancoDestino: d.banco,
      numAgenciaDestino: comDigito(d.agencia, t.contaDestino.digitoAgencia),
      numeroCtaDestino: comDigito(d.conta, t.contaDestino.digitoConta),
      tipoCtaDestino: TIPO_CONTA_CORRENTE,
      valor: money(t.valor),
      data: t.data,
      codigo: t.codigo,
    };
  });
}

export async function gerarMovimentacaoEntreContas(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosMovimentacao(prisma, params);
  return empacotar(LAYOUT_MOVIMENTACAO, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "MovimentacaoEntreContasBancarias", competencia: params.dia }), fatos);
}

// ── PAGAMENTOS (Diário) — Origem: Pagamento + Liquidacao + Empenho + Ficha + a conta pagadora. ──
export async function lerFatosPagamentos(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string; readonly dia: Date }
): Promise<PagamentoFato[]> {
  const { gte, lt } = intervaloDoDia(params.dia);
  // Só PAGAMENTOS genuínos: um registro com estorno/anulação-parcial não é pagamento (vai a 4.13/4.x).
  const pagamentos = await prisma.pagamento.findMany({
    where: { data: { gte, lt }, estornoDeId: null, anulacaoParcialDeId: null },
    include: {
      fonte: true,
      liquidacao: { include: { empenho: { include: { ficha: { include: { unidadeOrc: true } } } } } },
    },
    orderBy: [{ numero: "asc" }],
  });
  // A conta pagadora vem pelo CÓDIGO em Pagamento.contaBancaria (a tripla da S2). Mapa por código.
  const codigos = [...new Set(pagamentos.map((p) => p.contaBancaria))];
  const contas = await prisma.contaBancaria.findMany({ where: { codigo: { in: codigos } } });
  const porCodigo = new Map(contas.map((c) => [c.codigo, c]));

  return pagamentos.map((p) => {
    const conta = porCodigo.get(p.contaBancaria);
    if (conta === undefined) {
      throw new Error(`SAGRES/Pagamentos — pagamento ${p.numero} referencia a conta "${p.contaBancaria}", que não existe em ContaBancaria.`);
    }
    const t = exigirTripla(conta);
    const ficha = p.liquidacao.empenho.ficha;
    return {
      codUnidadeGestora: params.codUnidadeGestora,
      anoEmissaoEmpenho: ficha.exercicio,
      codUnidadeOrcamentaria: ficha.unidadeOrc.codigo,
      numEmpenho: p.liquidacao.empenho.numero,
      numero: p.numero,
      data: p.data,
      valor: money(p.valor),
      numeroContaDebito: comDigito(t.conta, conta.digitoConta),
      numeroAgenciaDebito: comDigito(t.agencia, conta.digitoAgencia),
      codBancoDebito: t.banco,
      exercicioFonteRecurso: ficha.exercicioFonte,
      codFonteRecurso: p.fonte.codigo,
      tipoContaBancaria: TIPO_CONTA_CORRENTE,
      cnpjGerencia: params.cnpjGerenciadora,
    };
  });
}

export async function gerarPagamentos(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string; readonly dia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosPagamentos(prisma, params);
  return empacotar(LAYOUT_PAGAMENTOS, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "Pagamentos", competencia: params.dia }), fatos);
}

// ── UNIDADEORCAMENTARIA (Mensal, V21) — a unidade + a declaração vigente no fim do mês. ─────────
/** Recusa conhecida do §4.1: vira violação da prévia, e o arquivo fica fora do pacote. */
export class UnidadeSemDadosParaPrestacaoError extends Error {}

export async function lerFatosUnidadeOrcamentaria(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly competencia: Date }
): Promise<UnidadeOrcamentariaFato[]> {
  const fimDoMes = new Date(Date.UTC(params.competencia.getUTCFullYear(), params.competencia.getUTCMonth() + 1, 1, 0, 0, 0));
  const corte = new Date(fimDoMes.getTime() - 1);
  const unidades = await prisma.unidadeOrcamentaria.findMany({
    orderBy: { codigo: "asc" },
    select: {
      codigo: true,
      descricao: true,
      declaracoes: {
        select: { naturezaJuridica: true, nomeSecretario: true, cpfSecretario: true, atoDeNomeacao: true, vigenteDesde: true, criadoEm: true },
      },
    },
  });
  const semDeclaracao: string[] = [];
  const descricaoLonga: string[] = [];
  const fatos: UnidadeOrcamentariaFato[] = [];
  for (const u of unidades) {
    const v = vigenteNoCorte(u.declaracoes, corte);
    if (v === null) {
      semDeclaracao.push(u.codigo + " " + u.descricao);
      continue;
    }
    if (u.descricao.trim().length > 50) {
      descricaoLonga.push(u.codigo + " (" + String(u.descricao.trim().length) + " caracteres)");
      continue;
    }
    fatos.push({
      codUnidadeGestora: params.codUnidadeGestora,
      codigo: u.codigo,
      descricao: u.descricao,
      nomeSecretario: v.nomeSecretario,
      cpfSecretario: v.cpfSecretario,
      atoAdministrativo: DEPARA_ATO_JURIDICO_SAGRES[v.atoDeNomeacao],
      tipoNaturezaJuridica: DEPARA_NATUREZA_JURIDICA_SAGRES[v.naturezaJuridica],
    });
  }
  if (semDeclaracao.length > 0 || descricaoLonga.length > 0) {
    throw new UnidadeSemDadosParaPrestacaoError(
      (semDeclaracao.length > 0
        ? "Unidade(s) sem natureza jurídica e secretário declarados até o fim do mês: " +
          semDeclaracao.join("; ") +
          ". Declare em Planejamento › Unidades orçamentárias. "
        : "") +
        (descricaoLonga.length > 0
          ? "Unidade(s) com descrição acima dos 50 caracteres que o arquivo aceita: " + descricaoLonga.join("; ") + "."
          : "")
    );
  }
  return fatos;
}

export async function gerarUnidadeOrcamentariaOuRecusa(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly competencia: Date }
): Promise<{ readonly arquivo: ArquivoGerado; readonly fatos: UnidadeOrcamentariaFato[] } | { readonly recusa: string }> {
  try {
    const fatos = await lerFatosUnidadeOrcamentaria(prisma, params);
    const arquivo = empacotar(LAYOUT_UNIDADE_ORCAMENTARIA, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "MENSAL", entidade: "UnidadeOrcamentaria", competencia: params.competencia }), fatos);
    return { arquivo, fatos };
  } catch (e) {
    if (e instanceof UnidadeSemDadosParaPrestacaoError) return { recusa: e.message.trim() };
    throw e;
  }
}

export async function gerarUnidadeOrcamentaria(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly competencia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosUnidadeOrcamentaria(prisma, params);
  return empacotar(LAYOUT_UNIDADE_ORCAMENTARIA, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "MENSAL", entidade: "UnidadeOrcamentaria", competencia: params.competencia }), fatos);
}

// ── ESTORNOPAGAMENTO (Diário, V21) — a linha de anulação + o pagamento anulado + a cadeia. ────
export async function lerFatosEstornoPagamento(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<EstornoPagamentoFato[]> {
  const { gte, lt } = intervaloDoDia(params.dia);
  const anulacoes = await prisma.pagamento.findMany({
    where: {
      data: { gte, lt },
      OR: [{ estornoDeId: { not: null } }, { anulacaoParcialDeId: { not: null } }],
    },
    include: {
      estornoDe: { select: { numero: true, estornoDeId: true, anulacaoParcialDeId: true } },
      anulacaoParcialDe: { select: { numero: true } },
      liquidacao: { include: { empenho: { include: { ficha: { include: { unidadeOrc: true } } } } } },
    },
    orderBy: [{ numero: "asc" }],
  });
  return anulacoes.map((a) => {
    const anulado = a.estornoDe ?? a.anulacaoParcialDe;
    if (anulado === null) {
      throw new Error(`SAGRES/EstornoPagamento — a anulação ${a.numero} não aponta o pagamento anulado.`);
    }
    // V23 — o registro que DESFAZ uma anulação parcial não é estorno de pagamento: antes, ele saía
    // aqui como se a própria anulação fosse uma parcela paga.
    if (a.estornoDe !== null && (a.estornoDe.estornoDeId !== null || a.estornoDe.anulacaoParcialDeId !== null)) {
      throw recusaDoEstornoDeAnulacao("EstornoPagamento", "pagamento", a.numero, anulado.numero);
    }
    if (a.motivo === null || a.motivo.trim() === "") {
      throw new Error(
        `SAGRES/EstornoPagamento — a anulação ${a.numero} (do pagamento ${anulado.numero}) foi gravada ` +
          `sem motivo, antes de o sistema guardá-lo. O campo é obrigatório no leiaute e não se inventa ` +
          `texto para ele. Nada foi gerado.`
      );
    }
    const ficha = a.liquidacao.empenho.ficha;
    return {
      codUnidadeGestora: params.codUnidadeGestora,
      anoEmissaoEmpenho: ficha.exercicio,
      codUnidadeOrcamentaria: ficha.unidadeOrc.codigo,
      numEmpenho: a.liquidacao.empenho.numero,
      numPagamento: anulado.numero,
      data: a.data,
      motivo: a.motivo,
      despesaLiquidada: "S",
      valor: money(a.valor),
      numero: a.numero,
    };
  });
}

export async function gerarEstornoPagamento(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosEstornoPagamento(prisma, params);
  return empacotar(LAYOUT_ESTORNO_PAGAMENTO, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "EstornoPagamento", competencia: params.dia }), fatos);
}

/**
 * V23 — o leiaute não tem registro para DESFAZER uma anulação parcial (o "estorno do estorno"): ela
 * restabelece o documento, e nenhuma das tabelas de estorno a descreve. Omiti-la deixaria o saldo do
 * tribunal diferente do nosso sem aviso; exportá-la como estorno diria o contrário do que aconteceu.
 * O dia é recusado nomeando o registro.
 */
function recusaDoEstornoDeAnulacao(arquivo: string, doc: string, numero: string, anulacao: string): Error {
  return new Error(
    `SAGRES/${arquivo} — o registro ${numero} desfaz a anulação ${anulacao} de um ${doc}. O leiaute do ` +
      `Tribunal de Contas não tem registro para desfazer uma anulação, e ela não pode ser omitida nem ` +
      `enviada como estorno. Nada foi gerado para este dia.`
  );
}

/** O motivo gravado, conferido pela mesma regra da entrada (V21/V23). O registro antigo fora dela é recusado. */
function motivoExportavel(arquivo: string, numero: string, motivo: string | null): string {
  const m = (motivo ?? "").trim();
  if (m === "") {
    throw new Error(
      `SAGRES/${arquivo} — a anulação ${numero} foi gravada sem motivo, antes de o sistema guardá-lo. ` +
        `O campo é obrigatório no leiaute e não se inventa texto para ele. Nada foi gerado.`
    );
  }
  if (m.length > 120 || /[\u0000-\u001f]/.test(m) || m.includes("'") || m.includes('"')) {
    throw new Error(
      `SAGRES/${arquivo} — o motivo da anulação ${numero} tem ${String(m.length)} caracteres, quebra de ` +
        `linha ou aspas; o leiaute aceita até 120 caracteres numa linha, sem aspas. Nada foi gerado.`
    );
  }
  return m;
}

// ── ESTORNOS (§4.9, Diário, V23) — a anulação (inteira ou parcial) do empenho. ──────────────────
export async function lerFatosEstornos(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<EstornoEmpenhoFato[]> {
  const { gte, lt } = intervaloDoDia(params.dia);
  const anulacoes = await prisma.empenho.findMany({
    where: { data: { gte, lt }, OR: [{ estornoDeId: { not: null } }, { anulacaoParcialDeId: { not: null } }] },
    include: {
      estornoDe: { select: { id: true, numero: true, estornoDeId: true, anulacaoParcialDeId: true } },
      anulacaoParcialDe: { select: { id: true, numero: true } },
      ficha: { include: { unidadeOrc: true } },
    },
    orderBy: [{ numero: "asc" }],
  });
  const fatos: EstornoEmpenhoFato[] = [];
  for (const a of anulacoes) {
    const anulado = a.estornoDe ?? a.anulacaoParcialDe;
    if (anulado === null) throw new Error(`SAGRES/Estornos — a anulação ${a.numero} não aponta o empenho anulado.`);
    if (a.estornoDe !== null && (a.estornoDe.estornoDeId !== null || a.estornoDe.anulacaoParcialDeId !== null)) {
      throw recusaDoEstornoDeAnulacao("Estornos", "empenho", a.numero, anulado.numero);
    }
    // "A despesa já foi liquidada": o LIQUIDADO LÍQUIDO do empenho na data do estorno. A anulação só
    // alcança o saldo não liquidado (guarda do M05), mas o empenho pode ter sido liquidado em parte.
    const liqs = await prisma.liquidacao.findMany({
      where: { empenhoId: anulado.id, data: { lte: a.data } },
      select: { valor: true, estornoDeId: true, anulacaoParcialDeId: true, estornoDe: { select: { anulacaoParcialDeId: true } } },
    });
    let liquidado = new Decimal(0);
    for (const l of liqs) {
      const genuina = l.estornoDeId === null && l.anulacaoParcialDeId === null;
      const desfazParcial = l.estornoDe !== null && l.estornoDe.anulacaoParcialDeId !== null;
      liquidado = genuina || desfazParcial ? liquidado.plus(l.valor.toFixed(2)) : liquidado.minus(l.valor.toFixed(2));
    }
    fatos.push({
      codUnidadeGestora: params.codUnidadeGestora,
      anoEmissaoEmpenho: a.ficha.exercicio,
      codUnidadeOrcamentaria: a.ficha.unidadeOrc.codigo,
      numEmpenho: anulado.numero,
      numero: a.numero,
      data: a.data,
      valor: money(a.valor),
      motivo: motivoExportavel("Estornos", a.numero, a.historico),
      despesaLiquidada: liquidado.greaterThan(0) ? "S" : "N",
    });
  }
  return fatos;
}

export async function gerarEstornos(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosEstornos(prisma, params);
  return empacotar(LAYOUT_ESTORNOS, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "Estornos", competencia: params.dia }), fatos);
}

// ── ESTORNOLIQUIDACAO (§4.11, Diário, V23) — a anulação (inteira ou parcial) da liquidação. ─────
export async function lerFatosEstornoLiquidacao(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<EstornoLiquidacaoFato[]> {
  const { gte, lt } = intervaloDoDia(params.dia);
  const anulacoes = await prisma.liquidacao.findMany({
    where: { data: { gte, lt }, OR: [{ estornoDeId: { not: null } }, { anulacaoParcialDeId: { not: null } }] },
    include: {
      estornoDe: { select: { numero: true, estornoDeId: true, anulacaoParcialDeId: true } },
      anulacaoParcialDe: { select: { numero: true } },
      empenho: { include: { ficha: { include: { unidadeOrc: true } } } },
    },
    orderBy: [{ empenhoId: "asc" }, { numero: "asc" }],
  });
  return anulacoes.map((a) => {
    const anulado = a.estornoDe ?? a.anulacaoParcialDe;
    if (anulado === null) throw new Error(`SAGRES/EstornoLiquidacao — a anulação ${a.numero} não aponta a liquidação anulada.`);
    if (a.estornoDe !== null && (a.estornoDe.estornoDeId !== null || a.estornoDe.anulacaoParcialDeId !== null)) {
      throw recusaDoEstornoDeAnulacao("EstornoLiquidacao", "liquidação", a.numero, anulado.numero);
    }
    return {
      codUnidadeGestora: params.codUnidadeGestora,
      anoEmissaoEmpenho: a.empenho.ficha.exercicio,
      codUnidadeOrcamentaria: a.empenho.ficha.unidadeOrc.codigo,
      numEmpenho: a.empenho.numero,
      numLiquidacao: anulado.numero,
      numero: a.numero,
      data: a.data,
      motivo: motivoExportavel("EstornoLiquidacao", a.numero, a.motivo),
      valor: money(a.valor),
    };
  });
}

export async function gerarEstornoLiquidacao(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosEstornoLiquidacao(prisma, params);
  return empacotar(LAYOUT_ESTORNO_LIQUIDACAO, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "EstornoLiquidacao", competencia: params.dia }), fatos);
}

// ── ESTORNORETENCAO (§4.15, Diário, V23) — o ESTORNO_INGRESSO de uma retenção (pagamento anulado). ──
export async function lerFatosEstornoRetencao(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<EstornoRetencaoFato[]> {
  const numeros = await numeracaoNoExercicio(prisma, { tipo: "ESTORNO_INGRESSO", comPagamento: true }, params.dia.getUTCFullYear());
  const { gte, lt } = intervaloDoDia(params.dia);
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    where: { tipo: "ESTORNO_INGRESSO", pagamentoId: { not: null }, data: { gte, lt } },
    include: {
      tipoConsignacao: true,
      pagamento: { include: { liquidacao: { include: { empenho: { include: { ficha: { include: { unidadeOrc: true } } } } } } } },
    },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
  });
  return movs.map((m) => {
    const numero = numeros.get(m.id);
    if (m.pagamento === null || numero === undefined) {
      throw new Error(`SAGRES/EstornoRetencao — o estorno ${m.id} não aponta o pagamento de origem, ou ficou fora da numeração.`);
    }
    const ficha = m.pagamento.liquidacao.empenho.ficha;
    return {
      codUnidadeGestora: params.codUnidadeGestora,
      anoEmissaoEmpenho: ficha.exercicio,
      codUnidadeOrcamentaria: ficha.unidadeOrc.codigo,
      numEmpenho: m.pagamento.liquidacao.empenho.numero,
      numPagamento: m.pagamento.numero,
      tipoConsignacaoCodigo: m.tipoConsignacao.codigo,
      numero,
      valor: money(m.valor),
    };
  });
}

export async function gerarEstornoRetencao(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosEstornoRetencao(prisma, params);
  return empacotar(LAYOUT_ESTORNO_RETENCAO, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "EstornoRetencao", competencia: params.dia }), fatos);
}

// ── ESTORNODESPESAEXTRA (§4.22, Diário, V23) — o ESTORNO_DISPENDIO. ────────────────────────────
export async function lerFatosEstornoDespesaExtra(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<EstornoDespesaExtraFato[]> {
  const { gte, lt } = intervaloDoDia(params.dia);
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    where: { tipo: "ESTORNO_DISPENDIO", data: { gte, lt } },
    include: { estornoDe: { select: { id: true, data: true } } },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
  });
  if (movs.length === 0) return [];
  const numerosDosEstornos = await numeracaoNoExercicio(prisma, { tipo: "ESTORNO_DISPENDIO" }, params.dia.getUTCFullYear());
  // O dispêndio estornado pode ser de outro exercício (estorno em janeiro do recolhimento de dezembro):
  // o número dele é o do exercício DELE.
  const cacheDosDispendios = new Map<number, ReadonlyMap<string, string>>();
  const fatos: EstornoDespesaExtraFato[] = [];
  for (const m of movs) {
    if (m.estornoDe === null) throw new Error(`SAGRES/EstornoDespesaExtra — o estorno ${m.id} não aponta o dispêndio estornado.`);
    const ano = m.estornoDe.data.getUTCFullYear();
    let dispendios = cacheDosDispendios.get(ano);
    if (dispendios === undefined) {
      dispendios = await numeracaoNoExercicio(prisma, { tipo: "DISPENDIO" }, ano);
      cacheDosDispendios.set(ano, dispendios);
    }
    const numDespesaExtra = dispendios.get(m.estornoDe.id);
    const numero = numerosDosEstornos.get(m.id);
    if (numDespesaExtra === undefined || numero === undefined) {
      throw new Error(`SAGRES/EstornoDespesaExtra — o estorno ${m.id} ou o dispêndio que ele desfaz ficou fora da numeração.`);
    }
    fatos.push({
      codUnidadeGestora: params.codUnidadeGestora,
      numDespesaExtra,
      numero,
      data: m.data,
      valor: money(m.valor),
      motivo: motivoExportavelExtra(m.id, m.motivo),
    });
  }
  return fatos;
}

/** O motivo do estorno extra (255 no leiaute §4.21/§4.22), pela regra da entrada. O legado fora dela é recusado. */
function motivoExportavelExtra(id: string, motivo: string | null, arquivo = "EstornoDespesaExtra"): string {
  const m = (motivo ?? "").trim();
  if (m === "" || m.length > 255 || /[\u0000-\u001f]/.test(m) || m.includes("'") || m.includes('"')) {
    throw new Error(
      `SAGRES/${arquivo} — o motivo do estorno ${id} está vazio, passa de 255 caracteres, tem ` +
        `quebra de linha ou aspas (gravado antes de o sistema conferir). O leiaute não aceita, e o texto não ` +
        `se inventa. Nada foi gerado.`
    );
  }
  return m;
}

export async function gerarEstornoDespesaExtra(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosEstornoDespesaExtra(prisma, params);
  return empacotar(LAYOUT_ESTORNO_DESPESA_EXTRA, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "EstornoDespesaExtra", competencia: params.dia }), fatos);
}

// ── RECEITAEXTRA (§4.19, Diária, V23) — o INGRESSO extraorçamentário: a retenção e o avulso. ─────
//
// ⚠️ O ARQUIVO OU A RECUSA NOMEADA (o regime da conciliação e da unidade): a receita extra depende do
// PLANO DO TRIBUNAL importado para o exercício (quais contas exigem o vínculo com a retenção). Sem ele,
// ou com um ingresso que não se descreve inteiro, o arquivo fica FORA do pacote e a prévia diz por
// quê — o pacote do dia não cai por causa dele, e nada é omitido em silêncio.
export type ReceitaExtraOuRecusa =
  | { readonly arquivo: ArquivoGerado; readonly fatos: readonly ReceitaExtraFato[] }
  | { readonly recusa: string };

/** A conta do PASSIVO que o ingresso creditou (9 dígitos) — ou o erro que diz por que não se sabe. */
function contaDoIngresso(m: {
  id: string;
  valor: { toFixed(c: number): string };
  tipoConsignacao: { codigo: string; contaPassivo: { codigo: string } | null };
  lancamento: { numeroControle: string; partidas: readonly { tipo: string; subsistema: string; valor: { toFixed(c: number): string }; conta: { codigo: string } }[] };
}): string {
  const candidatas = [
    ...new Set(
      m.lancamento.partidas
        .filter((p) => p.tipo === "CREDITO" && p.subsistema === "PATRIMONIAL" && p.conta.codigo.startsWith("2") && p.valor.toFixed(2) === m.valor.toFixed(2))
        .map((p) => p.conta.codigo)
    ),
  ];
  if (candidatas.length === 1) return candidatas[0]!.replaceAll(".", "");
  const doTipo = m.tipoConsignacao.contaPassivo?.codigo;
  if (doTipo !== undefined && candidatas.includes(doTipo)) return doTipo.replaceAll(".", "");
  throw new Error(
    `o ingresso ${m.id} (lançamento ${m.lancamento.numeroControle}) não permite saber qual conta do passivo ele ` +
      `creditou (${String(candidatas.length)} candidata(s)).`
  );
}

export async function gerarReceitaExtraOuRecusa(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string; readonly codFonteRecursoExtra: string; readonly dia: Date }
): Promise<ReceitaExtraOuRecusa> {
  const nome = nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "ReceitaExtra", competencia: params.dia });
  const { gte, lt } = intervaloDoDia(params.dia);
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    where: { tipo: "INGRESSO", data: { gte, lt } },
    include: {
      tipoConsignacao: { select: { codigo: true, contaPassivo: { select: { codigo: true } } } },
      contaBancaria: true,
      lancamento: { include: { partidas: { include: { conta: true } } } },
      pagamento: { include: { liquidacao: { include: { empenho: { include: { ficha: { include: { unidadeOrc: true } } } } } } } },
    },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
  });
  if (movs.length === 0) return { arquivo: empacotar(LAYOUT_RECEITA_EXTRA, nome, []), fatos: [] };
  if (!(FONTES_RECURSO_EXTRA_SAGRES as readonly string[]).includes(params.codFonteRecursoExtra)) {
    return { recusa: `A fonte de recurso "${params.codFonteRecursoExtra}" não é uma das admitidas para movimentação extraorçamentária (${FONTES_RECURSO_EXTRA_SAGRES.join(", ")}).` };
  }
  const exercicio = params.dia.getUTCFullYear();
  const plano = await planoVigenteDoTribunal(prisma, exercicio);
  if (plano === null) {
    return {
      recusa:
        `O plano de contas do Tribunal para ${String(exercicio)} não foi importado: sem ele não se sabe quais contas exigem ` +
        `o vínculo da receita extra com a retenção.`,
    };
  }
  try {
    const numeros = await numeracaoNoExercicio(prisma, { tipo: "INGRESSO" }, exercicio);
    const fatos = movs.map((m): ReceitaExtraFato => {
      const numero = numeros.get(m.id);
      if (numero === undefined) throw new Error(`o ingresso ${m.id} ficou fora da numeração do exercício.`);
      const codConta = contaDoIngresso(m);
      const exig = plano.contas.get(codConta);
      if (exig === undefined) throw new Error(`a conta ${codConta} não está no plano do Tribunal importado para ${String(exercicio)} (tabela de ${String(plano.anoDaTabela)}).`);
      const empenho = m.pagamento?.liquidacao.empenho ?? null;
      const documento = empenho !== null ? empenho.credorCpfCnpj : m.documentoDoContribuinte;
      if (documento === null || documento.trim() === "") {
        throw new Error(`o ingresso ${numero} (${m.credorConsignatario}) foi gravado sem o CPF/CNPJ de quem entregou o valor, e o campo é obrigatório.`);
      }
      if (exig.exigeRetencao && (m.pagamento === null || empenho === null)) {
        throw new Error(`a conta ${codConta} exige o vínculo com a retenção, e o ingresso ${numero} não nasceu de um pagamento.`);
      }
      const t = exigirTripla(m.contaBancaria);
      return {
        codUnidadeGestora: params.codUnidadeGestora,
        numero,
        codContaContabil: codConta,
        data: m.data,
        cpfCnpjContribuinte: documento,
        exercicioFonteRecurso: EXERCICIO_FONTE_ATUAL,
        codFonteRecursoExtra: params.codFonteRecursoExtra,
        numeroConta: comDigito(t.conta, m.contaBancaria.digitoConta),
        numeroAgencia: comDigito(t.agencia, m.contaBancaria.digitoAgencia),
        codBanco: t.banco,
        tipoContaBancaria: TIPO_CONTA_CORRENTE,
        valor: money(m.valor),
        historico: m.historico,
        tipoConsignacaoCodigo: m.tipoConsignacao.codigo,
        exercicio: m.data.getUTCFullYear(),
        retencao:
          exig.exigeRetencao && m.pagamento !== null && empenho !== null
            ? {
                codUnidadeGestora: params.codUnidadeGestora,
                codUnidadeOrcamentaria: empenho.ficha.unidadeOrc.codigo,
                anoEmissaoEmpenho: empenho.ficha.exercicio,
                numEmpenho: empenho.numero,
                numPagamento: m.pagamento.numero,
                tipoConsignacaoCodigo: m.tipoConsignacao.codigo,
              }
            : null,
        cnpjGerencia: params.cnpjGerenciadora,
      };
    });
    return { arquivo: empacotar(LAYOUT_RECEITA_EXTRA, nome, fatos), fatos };
  } catch (e) {
    return { recusa: `Receita extra de ${params.dia.toISOString().slice(0, 10)}: ${(e as Error).message}` };
  }
}

// ── ESTORNORECEITAEXTRA (§4.21, Diária, V23) — o ESTORNO_INGRESSO (retenção desfeita ou avulso). ───
// No mesmo regime: ele aponta a ReceitaExtra estornada, que só existe se o plano do exercício DELA foi
// importado — sem isso, apontaria um número que o tribunal nunca recebeu.
export type EstornoReceitaExtraOuRecusa =
  | { readonly arquivo: ArquivoGerado; readonly fatos: readonly EstornoReceitaExtraFato[] }
  | { readonly recusa: string };

export async function gerarEstornoReceitaExtraOuRecusa(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<EstornoReceitaExtraOuRecusa> {
  const nome = nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "EstornoReceitaExtra", competencia: params.dia });
  const { gte, lt } = intervaloDoDia(params.dia);
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    where: { tipo: "ESTORNO_INGRESSO", data: { gte, lt } },
    include: { estornoDe: { select: { id: true, data: true } } },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
  });
  if (movs.length === 0) return { arquivo: empacotar(LAYOUT_ESTORNO_RECEITA_EXTRA, nome, []), fatos: [] };
  try {
    const numeros = await numeracaoNoExercicio(prisma, { tipo: "ESTORNO_INGRESSO" }, params.dia.getUTCFullYear());
    const planos = new Map<number, PlanoVigente | null>();
    const receitas = new Map<number, ReadonlyMap<string, string>>();
    const fatos: EstornoReceitaExtraFato[] = [];
    for (const m of movs) {
      if (m.estornoDe === null) throw new Error(`o estorno ${m.id} não aponta o ingresso estornado.`);
      const ano = m.estornoDe.data.getUTCFullYear();
      if (!planos.has(ano)) planos.set(ano, await planoVigenteDoTribunal(prisma, ano));
      if (planos.get(ano) === null) throw new Error(`o plano de contas do Tribunal para ${String(ano)} não foi importado, e a receita extra estornada é desse exercício.`);
      let nums = receitas.get(ano);
      if (nums === undefined) {
        nums = await numeracaoNoExercicio(prisma, { tipo: "INGRESSO" }, ano);
        receitas.set(ano, nums);
      }
      const numReceitaExtra = nums.get(m.estornoDe.id);
      const numero = numeros.get(m.id);
      if (numReceitaExtra === undefined || numero === undefined) throw new Error(`o estorno ${m.id} ou o ingresso que ele desfaz ficou fora da numeração.`);
      fatos.push({ codUnidadeGestora: params.codUnidadeGestora, numReceitaExtra, numero, data: m.data, valor: money(m.valor), motivo: motivoExportavelExtra(m.id, m.motivo, "EstornoReceitaExtra") });
    }
    return { arquivo: empacotar(LAYOUT_ESTORNO_RECEITA_EXTRA, nome, fatos), fatos };
  } catch (e) {
    return { recusa: `Estorno de receita extra de ${params.dia.toISOString().slice(0, 10)}: ${(e as Error).message}` };
  }
}

// ── RECEITAORCAMENTARIA (Diária) — Origem: ReceitaArrecadada + natureza/fonte/co. ───────────────
// A CONTA ARRECADADORA é PARÂMETRO de exportação (designação da UG) — o modelo não amarra receita a
// conta ("a receita é do ENTE", art. 167). Fail-closed nomeando se a conta designada não existir.
export async function lerFatosReceitaOrcamentaria(
  prisma: PrismaClient,
  params: {
    readonly codUnidadeGestora: string;
    readonly cnpjGerenciadora: string;
    readonly codContaArrecadadora: string;
    readonly dia: Date;
  }
): Promise<ReceitaOrcamentariaFato[]> {
  const { gte, lt } = intervaloDoDia(params.dia);
  const conta = await prisma.contaBancaria.findFirst({ where: { codigo: params.codContaArrecadadora } });
  if (conta === null) {
    throw new Error(`SAGRES/ReceitaOrcamentaria — a conta arrecadadora "${params.codContaArrecadadora}" (parâmetro de exportação) não existe em ContaBancaria.`);
  }
  const t = exigirTripla(conta);
  const receitas = await prisma.receitaArrecadada.findMany({
    where: { dataArrecadacao: { gte, lt } },
    include: {
      naturezaReceita: true,
      fonte: true,
      co: true,
      // ⚠️ V16/C30 — UMA LINHA POR (GUIA, FONTE), e é o que o leiaute espera. O registro
      // §4.16 tem `numeroReceita`, `codFonteRecurso`, `exercicioFonteRecurso` e `valor`, e
      // NENHUM campo de total: duas linhas com o mesmo número de guia e fontes diferentes é a
      // forma que o TCE recebe uma guia repartida. Quem não tinha como repartir era o modelo.
      distribuicao: { include: { fonte: true }, orderBy: { criadoEm: "asc" } },
    },
    orderBy: [{ numeroReceita: "asc" }, { tipo: "asc" }],
  });
  return receitas.flatMap((r) => {
    const parcelas =
      r.distribuicao.length > 0
        ? r.distribuicao.map((d) => ({
            codFonteRecurso: d.fonte.codigo,
            exercicioFonteRecurso: d.exercicioFonte,
            valor: money(d.valor),
          }))
        : [
            {
              codFonteRecurso: r.fonte.codigo,
              exercicioFonteRecurso: r.exercicioFonte,
              valor: money(r.valor),
            },
          ];
    return parcelas.map((parcela) => ({
      codUnidadeGestora: params.codUnidadeGestora,
      numeroReceita: r.numeroReceita,
      codReceitaOrcamentaria: r.naturezaReceita.codigo,
      tipoLancamento: r.tipo,
      exercicioFonteRecurso: parcela.exercicioFonteRecurso,
      codFonteRecurso: parcela.codFonteRecurso,
      valor: parcela.valor,
      data: r.dataArrecadacao,
      co: r.co?.codigo ?? null,
      numeroConta: comDigito(t.conta, conta.digitoConta),
      codBanco: t.banco,
      numeroAgencia: comDigito(t.agencia, conta.digitoAgencia),
      tipoContaBancaria: TIPO_CONTA_CORRENTE,
      cnpjGerencia: params.cnpjGerenciadora,
    }));
  });
}

export async function gerarReceitaOrcamentaria(
  prisma: PrismaClient,
  params: {
    readonly codUnidadeGestora: string;
    readonly cnpjGerenciadora: string;
    readonly codContaArrecadadora: string;
    readonly dia: Date;
  }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosReceitaOrcamentaria(prisma, params);
  return empacotar(LAYOUT_RECEITA_ORCAMENTARIA, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "ReceitaOrcamentaria", competencia: params.dia }), fatos);
}

// ── RETENCAO (Diário) — Origem: MovimentoExtraorcamentario INGRESSO com pagamentoId. ────────────
// O filtro é o MESMO de `listarRetencoes` (m07/consultas.ts): a retenção é o ingresso que NASCEU
// dentro de um pagamento. Ingresso avulso (caução, depósito) não é retenção — não entra no §4.14.
export async function lerFatosRetencao(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<RetencaoFato[]> {
  const { gte, lt } = intervaloDoDia(params.dia);
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    where: { tipo: "INGRESSO", pagamentoId: { not: null }, data: { gte, lt } },
    include: {
      tipoConsignacao: true,
      pagamento: { include: { liquidacao: { include: { empenho: { include: { ficha: { include: { unidadeOrc: true } } } } } } } },
    },
    orderBy: [{ data: "asc" }, { id: "asc" }],
  });
  return movs.map((m) => {
    // O `where` já exige pagamentoId != null; o Prisma tipa a relação como opcional. Fail-closed.
    if (m.pagamento === null) {
      throw new Error(`SAGRES/Retencao — o movimento ${m.id} tem pagamentoId mas a relação não carregou.`);
    }
    const ficha = m.pagamento.liquidacao.empenho.ficha;
    return {
      codUnidadeGestora: params.codUnidadeGestora,
      anoEmissaoEmpenho: ficha.exercicio,
      codUnidadeOrcamentaria: ficha.unidadeOrc.codigo,
      numEmpenho: m.pagamento.liquidacao.empenho.numero,
      numPagamento: m.pagamento.numero,
      valor: money(m.valor),
      tipoConsignacaoCodigo: m.tipoConsignacao.codigo,
    };
  });
}

export async function gerarRetencao(
  prisma: PrismaClient,
  params: { readonly codUnidadeGestora: string; readonly dia: Date }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosRetencao(prisma, params);
  return empacotar(LAYOUT_RETENCAO, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "Retencao", competencia: params.dia }), fatos);
}

/**
 * NUMERAÇÃO DERIVADA DOS MOVIMENTOS EXTRAORÇAMENTÁRIOS (DespesaExtra §4.20, EstornoRetencao §4.15,
 * EstornoDespesaExtra §4.22). O m07 não numera o movimento, e o leiaute põe `numero` na chave junto
 * com o exercício: numera-se 1..N no EXERCÍCIO (pela data do fato) e só então se filtra o dia.
 *
 * ⚠️ V23 — A ORDEM É A DE GRAVAÇÃO (criadoEm, id), NÃO A DA DATA. Numerar pela data renumeraria os
 * dispêndios já exportados sempre que alguém lançasse depois um fato com data anterior — o número que
 * o tribunal recebeu ontem passaria a apontar outro movimento. A tabela é append-only: a ordem de
 * gravação de um conjunto já gravado nunca muda, e o fato novo sempre entra depois.
 */
async function numeracaoNoExercicio(
  prisma: PrismaClient,
  where: { readonly tipo: "INGRESSO" | "DISPENDIO" | "ESTORNO_INGRESSO" | "ESTORNO_DISPENDIO"; readonly comPagamento?: boolean },
  exercicio: number
): Promise<ReadonlyMap<string, string>> {
  const doExercicio = await prisma.movimentoExtraorcamentario.findMany({
    where: {
      tipo: where.tipo,
      data: { gte: new Date(Date.UTC(exercicio, 0, 1)), lt: new Date(Date.UTC(exercicio + 1, 0, 1)) },
      ...(where.comPagamento === true ? { pagamentoId: { not: null } } : {}),
    },
    select: { id: true },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
  });
  return new Map(doExercicio.map((m, i) => [m.id, String(i + 1)]));
}

// ── DESPESAEXTRA (Diária) — Origem: MovimentoExtraorcamentario DISPENDIO. ───────────────────────
// NUMERAÇÃO: `numeracaoNoExercicio` (acima) — a mesma que o EstornoDespesaExtra usa para apontar o
// dispêndio estornado.
export async function lerFatosDespesaExtra(
  prisma: PrismaClient,
  params: {
    readonly codUnidadeGestora: string;
    readonly cnpjGerenciadora: string;
    readonly codFonteRecursoExtra: string;
    readonly dia: Date;
  }
): Promise<DespesaExtraFato[]> {
  // V23 — o plano do Tribunal diz se a conta da despesa extra EXIGE o vínculo com a receita extra.
  // Sem plano importado para o exercício o vínculo sai em espaços, e a prévia avisa (`lib/portas/sagres`).
  const plano = await planoVigenteDoTribunal(prisma, params.dia.getUTCFullYear());
  const numerosDasReceitas = new Map<number, ReadonlyMap<string, string>>();
  if (!(FONTES_RECURSO_EXTRA_SAGRES as readonly string[]).includes(params.codFonteRecursoExtra)) {
    throw new Error(
      `SAGRES/DespesaExtra §4.20 — a fonte de recurso "${params.codFonteRecursoExtra}" (parâmetro de ` +
        `exportação) não é uma das admitidas para movimentação extraorçamentária: ` +
        `${FONTES_RECURSO_EXTRA_SAGRES.join(", ")} (padrão STN).`
    );
  }
  const numeros = await numeracaoNoExercicio(prisma, { tipo: "DISPENDIO" }, params.dia.getUTCFullYear());
  const { gte, lt } = intervaloDoDia(params.dia);
  const doDia = await prisma.movimentoExtraorcamentario.findMany({
    where: { tipo: "DISPENDIO", data: { gte, lt } },
    include: {
      tipoConsignacao: true,
      contaBancaria: { include: { fonte: true } },
      lancamento: { include: { partidas: { include: { conta: true } } } },
      alocacoesFeitas: { select: { ingresso: { select: { id: true, data: true } } } },
    },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
  });

  const fatos: DespesaExtraFato[] = [];
  for (const m of doDia) {
    const numero = numeros.get(m.id);
    if (numero === undefined) throw new Error(`SAGRES/DespesaExtra — o dispêndio ${m.id} ficou fora da numeração do exercício.`);
    const t = exigirTripla(m.contaBancaria);
    // A conta contábil da despesa extra é a do DÉBITO patrimonial (baixa do passivo de consignação).
    const debito = m.lancamento.partidas.find((p) => p.tipo === "DEBITO" && p.subsistema === "PATRIMONIAL");
    if (debito === undefined) {
      throw new Error(
        `SAGRES/DespesaExtra — o dispêndio ${m.id} (lançamento ${m.lancamento.numeroControle}) não tem ` +
          `partida de DÉBITO patrimonial. O §4.20 exige a conta contábil da despesa extra.`
      );
    }
    const codConta = debito.conta.codigo.replaceAll(".", ""); // PCASP "2.1.8.8.1.02.00" → 9 dígitos.
    let receitaExtra: DespesaExtraFato["receitaExtra"] = null;
    if (plano !== null && plano.contas.get(codConta)?.exigeReceitaExtra === true) {
      // "Não poderá existir uma despesa extra para várias receitas extraorçamentárias" (§4.20): o
      // recolhimento tem de dizer QUAL retenção quita, e uma só.
      if (m.alocacoesFeitas.length !== 1) {
        throw new Error(
          `SAGRES/DespesaExtra — o recolhimento ${numero} (${m.valor.toFixed(2)}) está na conta ${codConta}, que o plano ` +
            `do Tribunal manda relacionar a UMA receita extra, e ele compõe ${String(m.alocacoesFeitas.length)} retenção(ões). ` +
            `Registre um recolhimento por retenção. Nada foi gerado.`
        );
      }
      const ingresso = m.alocacoesFeitas[0]!.ingresso;
      const ano = ingresso.data.getUTCFullYear();
      let nums = numerosDasReceitas.get(ano);
      if (nums === undefined) {
        nums = await numeracaoNoExercicio(prisma, { tipo: "INGRESSO" }, ano);
        numerosDasReceitas.set(ano, nums);
      }
      const n = nums.get(ingresso.id);
      if (n === undefined) throw new Error(`SAGRES/DespesaExtra — a receita extra do recolhimento ${numero} ficou fora da numeração.`);
      receitaExtra = { codUnidadeGestora: params.codUnidadeGestora, exercicio: ano, numero: n };
    }
    fatos.push({
      codUnidadeGestora: params.codUnidadeGestora,
      numero,
      receitaExtra,
      codContaContabil: codConta,
      data: m.data,
      exercicioFonteRecurso: EXERCICIO_FONTE_ATUAL,
      codFonteRecursoExtra: params.codFonteRecursoExtra,
      numeroConta: comDigito(t.conta, m.contaBancaria.digitoConta),
      numeroAgencia: comDigito(t.agencia, m.contaBancaria.digitoAgencia),
      codBanco: t.banco,
      tipoContaBancaria: TIPO_CONTA_CORRENTE,
      valor: money(m.valor),
      historico: m.historico,
      tipoConsignacaoCodigo: m.tipoConsignacao.codigo,
      exercicio: m.data.getUTCFullYear(),
      codFonteRecursoPagamento: m.contaBancaria.fonte.codigo,
      cnpjGerencia: params.cnpjGerenciadora,
    });
  }
  return fatos;
}

export async function gerarDespesaExtra(
  prisma: PrismaClient,
  params: {
    readonly codUnidadeGestora: string;
    readonly cnpjGerenciadora: string;
    readonly codFonteRecursoExtra: string;
    readonly dia: Date;
  }
): Promise<ArquivoGerado> {
  const fatos = await lerFatosDespesaExtra(prisma, params);
  return empacotar(LAYOUT_DESPESA_EXTRA, nomeArquivo({ codUnidadeGestora: params.codUnidadeGestora, periodicidade: "DIARIO", entidade: "DespesaExtra", competencia: params.dia }), fatos);
}
