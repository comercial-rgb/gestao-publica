import type { PrismaClient } from "../../../../prisma/generated/client/client.js";
import { Decimal, toMoney } from "../../../../packages/contracts/index.js";
import { serializarArquivo, type LayoutArquivo } from "./registry.js";
import { nomeArquivo } from "./nomenclatura.js";
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
  LAYOUT_RECEITA_ORCAMENTARIA,
  LAYOUT_RETENCAO,
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
  type ReceitaOrcamentariaFato,
  type RetencaoFato,
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
  const empenhos = await prisma.empenho.findMany({
    where: { data: { gte, lt } },
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
  const liqs = await prisma.liquidacao.findMany({
    where: { data: { gte, lt } },
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
    include: { naturezaReceita: true, fonte: true, co: true },
    orderBy: [{ numeroReceita: "asc" }, { tipo: "asc" }],
  });
  return receitas.map((r) => ({
    codUnidadeGestora: params.codUnidadeGestora,
    numeroReceita: r.numeroReceita,
    codReceitaOrcamentaria: r.naturezaReceita.codigo,
    tipoLancamento: r.tipo,
    exercicioFonteRecurso: r.exercicioFonte,
    codFonteRecurso: r.fonte.codigo,
    valor: money(r.valor),
    data: r.dataArrecadacao,
    co: r.co?.codigo ?? null,
    numeroConta: comDigito(t.conta, conta.digitoConta),
    codBanco: t.banco,
    numeroAgencia: comDigito(t.agencia, conta.digitoAgencia),
    tipoContaBancaria: TIPO_CONTA_CORRENTE,
    cnpjGerencia: params.cnpjGerenciadora,
  }));
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

// ── DESPESAEXTRA (Diária) — Origem: MovimentoExtraorcamentario DISPENDIO. ───────────────────────
//
// NUMERAÇÃO: o §4.20 tem `numero` na CHAVE junto com `exercicio` — o número precisa ser único no
// EXERCÍCIO, não no dia. Por isso a leitura varre o exercício inteiro, numera 1..N na ordem
// determinística (data, id) e SÓ ENTÃO filtra o dia pedido: o mesmo dispêndio recebe sempre o mesmo
// número, seja qual for o dia exportado. Numerar dentro do dia daria números repetidos no exercício.
// O m07 não tem coluna de numeração própria — a derivação é determinística e vai nomeada na matriz.
export async function lerFatosDespesaExtra(
  prisma: PrismaClient,
  params: {
    readonly codUnidadeGestora: string;
    readonly cnpjGerenciadora: string;
    readonly codFonteRecursoExtra: string;
    readonly dia: Date;
  }
): Promise<DespesaExtraFato[]> {
  if (!(FONTES_RECURSO_EXTRA_SAGRES as readonly string[]).includes(params.codFonteRecursoExtra)) {
    throw new Error(
      `SAGRES/DespesaExtra §4.20 — a fonte de recurso "${params.codFonteRecursoExtra}" (parâmetro de ` +
        `exportação) não é uma das admitidas para movimentação extraorçamentária: ` +
        `${FONTES_RECURSO_EXTRA_SAGRES.join(", ")} (padrão STN).`
    );
  }
  const exercicio = params.dia.getUTCFullYear();
  const gteAno = new Date(Date.UTC(exercicio, 0, 1));
  const ltAno = new Date(Date.UTC(exercicio + 1, 0, 1));
  const doExercicio = await prisma.movimentoExtraorcamentario.findMany({
    where: { tipo: "DISPENDIO", data: { gte: gteAno, lt: ltAno } },
    include: {
      tipoConsignacao: true,
      contaBancaria: { include: { fonte: true } },
      lancamento: { include: { partidas: { include: { conta: true } } } },
    },
    orderBy: [{ data: "asc" }, { id: "asc" }],
  });

  const { gte, lt } = intervaloDoDia(params.dia);
  const fatos: DespesaExtraFato[] = [];
  doExercicio.forEach((m, i) => {
    if (m.data < gte || m.data >= lt) return; // numera no exercício, exporta só o dia.
    const t = exigirTripla(m.contaBancaria);
    // A conta contábil da despesa extra é a do DÉBITO patrimonial (baixa do passivo de consignação).
    const debito = m.lancamento.partidas.find((p) => p.tipo === "DEBITO" && p.subsistema === "PATRIMONIAL");
    if (debito === undefined) {
      throw new Error(
        `SAGRES/DespesaExtra — o dispêndio ${m.id} (lançamento ${m.lancamento.numeroControle}) não tem ` +
          `partida de DÉBITO patrimonial. O §4.20 exige a conta contábil da despesa extra.`
      );
    }
    fatos.push({
      codUnidadeGestora: params.codUnidadeGestora,
      numero: String(i + 1),
      codContaContabil: debito.conta.codigo.replaceAll(".", ""), // PCASP "2.1.8.8.1.02.00" → 9 dígitos.
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
  });
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
