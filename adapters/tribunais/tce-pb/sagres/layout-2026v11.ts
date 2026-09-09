import type { Money } from "../../../../packages/contracts/index.js";
import type { CampoLayout, LayoutArquivo } from "./registry.js";

/**
 * LAYOUT SAGRES CONTABILIDADE TCE-PB — versão 2026 v1.1 (12/12/2025).
 *
 * Fonte: `docs/oficial/tce-pb/layout-contabilidade-2026-v1.1-12122025.html` (sha256 no MANIFEST.json).
 * Cada posição (`posInicial`/`posFinal`) e cada domínio abaixo foram COPIADOS do layout local — nada
 * inventado (PATCH §4). A conferência `validarLayout` (registry.ts) garante que as posições formam um
 * registro contíguo; os testes golden conferem byte a byte contra a expectativa montada à mão.
 *
 * ENTIDADES DESTA FATIA (gate de escopo, PATCH §5 — dotação→empenho→liquidação, 1 mensal + 2 diários):
 *   · Dotacao   (§4.4,  Mensal)  — a fixação da LOA. Origem: FichaOrcamentaria (o `@@unique` do modelo
 *                                  se chama "uq_ficha_sagres" — a ficha FOI desenhada como esta tabela).
 *   · Empenhos  (§4.8,  Diário)  — o empenho. Origem: Empenho + FichaOrcamentaria.
 *   · Liquidacao(§4.10, Diário)  — a liquidação. Origem: Liquidacao + Empenho + Ficha.
 *
 * As demais 10 entidades da vertical slice pedida estão na MATRIZ DE COBERTURA (MODULO.md), com o
 * status de origem de cada uma — nunca linha vazia falsa (PATCH §5).
 */

const VERSAO = "2026 v1.1 (12/12/2025)";

// ═══ DOMÍNIOS INTERNOS (copiados do layout §5/§6) ═══════════════════════════════

/** §5.17 TipoEmpenho — 1=Ordinário, 2=Estimativo, 3=Global (a ordem NÃO é alfabética; conferida). */
export const TIPO_EMPENHO_SAGRES: Record<"ORDINARIO" | "ESTIMATIVO" | "GLOBAL", string> = {
  ORDINARIO: "1",
  ESTIMATIVO: "2",
  GLOBAL: "3",
};

/** §5.19 NaturezaContratacao — art. 141 da Lei 14.133/2021 (0=Outros não tem equivalente no modelo). */
export const NATUREZA_CONTRATACAO_SAGRES: Record<
  "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS",
  string
> = {
  FORNECIMENTO_BENS: "1",
  LOCACAO: "2",
  PRESTACAO_SERVICOS: "3",
  REALIZACAO_OBRAS: "4",
};

/** §5.30 TipoNotaFiscal — "00" = Sem Nota Fiscal (o preenchimento quando a liquidação não tem NF). */
export const TIPO_NOTA_FISCAL_SEM = "00";

/** §6.2 ModalidadesLicitações — "9" = Sem Licitação (empenho sem contrato/processo). */
export const MODALIDADE_SEM_LICITACAO = "9";

// ═══ 4.4 DOTACAO (Mensal) ══════════════════════════════════════════════════════

export interface DotacaoFato {
  readonly codUnidadeGestora: string; // parâmetro de exportação (UG selecionada)
  readonly competencia: number; //        FichaOrcamentaria.exercicio
  readonly codUnidadeOrcamentaria: string; // ficha.unidadeOrc.codigo
  readonly codFuncao: string; //          ficha.funcao.codigo
  readonly codSubfuncao: string; //       ficha.subfuncao.codigo
  readonly codPrograma: string; //        ficha.programa.codigo
  readonly codAcao: string; //            ficha.acao.codigo
  readonly codCategoriaEconomica: string; // ficha.naturezaDespesa.codCategoria
  readonly codNaturezaDespesa: string; //    ficha.naturezaDespesa.codNatureza
  readonly codModalidadeDespesa: string; //  ficha.naturezaDespesa.codModalidade
  readonly codElementoDespesa: string; //    ficha.naturezaDespesa.codElemento
  readonly exercicioFonteRecurso: number; // ficha.exercicioFonte (1=atual, 2=anterior)
  readonly codFonteRecurso: string; //    ficha.fonte.codigo
  readonly valor: Money; //               ficha.valorDotado
}

const camposDotacao: readonly CampoLayout<DotacaoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "competencia", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "FichaOrcamentaria.exercicio", extrair: (f) => f.competencia },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "codFuncao", posInicial: 16, posFinal: 17, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.funcao.codigo", extrair: (f) => f.codFuncao },
  { nome: "codSubfuncao", posInicial: 18, posFinal: 20, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.subfuncao.codigo", extrair: (f) => f.codSubfuncao },
  { nome: "codPrograma", posInicial: 21, posFinal: 24, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.programa.codigo", extrair: (f) => f.codPrograma },
  { nome: "codAcao", posInicial: 25, posFinal: 28, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.acao.codigo", extrair: (f) => f.codAcao },
  { nome: "reservado", posInicial: 29, posFinal: 34, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
  { nome: "codCategoriaEconomica", posInicial: 35, posFinal: 35, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.naturezaDespesa.codCategoria", extrair: (f) => f.codCategoriaEconomica },
  { nome: "codNaturezaDespesa", posInicial: 36, posFinal: 36, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.naturezaDespesa.codNatureza", extrair: (f) => f.codNaturezaDespesa },
  { nome: "codModalidadeDespesa", posInicial: 37, posFinal: 38, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.naturezaDespesa.codModalidade", extrair: (f) => f.codModalidadeDespesa },
  { nome: "codElementoDespesa", posInicial: 39, posFinal: 40, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.naturezaDespesa.codElemento", extrair: (f) => f.codElementoDespesa },
  { nome: "exercicioFonteRecurso", posInicial: 41, posFinal: 41, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.exercicioFonte", extrair: (f) => f.exercicioFonteRecurso },
  { nome: "codFonteRecurso", posInicial: 42, posFinal: 44, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.fonte.codigo", extrair: (f) => f.codFonteRecurso },
  { nome: "valor", posInicial: 45, posFinal: 60, tipo: "VALOR", obrigatorio: true, origem: "ficha.valorDotado", extrair: (f) => f.valor },
  { nome: "reservado2", posInicial: 61, posFinal: 66, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];

export const LAYOUT_DOTACAO: LayoutArquivo<DotacaoFato> = {
  entidade: "Dotacao",
  periodicidade: "MENSAL",
  versao: VERSAO,
  campos: camposDotacao,
};

// ═══ 4.10 LIQUIDACAO (Diário) ══════════════════════════════════════════════════

export interface NotaFiscalFato {
  readonly tipo: string; //  §5.30 TipoNotaFiscal
  readonly chave: string;
  readonly numero: string;
  readonly serie: string;
  readonly data: Date;
  readonly valor: Money;
}

export interface LiquidacaoFato {
  readonly codUnidadeGestora: string; //  parâmetro export
  readonly anoEmissaoEmpenho: number; //  empenho.ficha.exercicio
  readonly codUnidadeOrcamentaria: string; // empenho.ficha.unidadeOrc.codigo
  readonly numEmpenho: string; //         empenho.numero
  readonly numero: string; //             liquidacao.numero
  readonly data: Date; //                 liquidacao.data
  readonly notaFiscal: NotaFiscalFato | null; // liquidacao.notaFiscal* (opcional)
  readonly valor: Money; //               liquidacao.valor
  readonly codAgrupamentoFolha: string | null; // sem origem no modelo (folha) → espaços
}

const camposLiquidacao: readonly CampoLayout<LiquidacaoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numero", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "liquidacao.numero", extrair: (f) => f.numero },
  { nome: "data", posInicial: 30, posFinal: 37, tipo: "DATA", obrigatorio: true, origem: "liquidacao.data", extrair: (f) => f.data },
  { nome: "tipoNotaFiscal", posInicial: 38, posFinal: 39, tipo: "NUMERICO", obrigatorio: false, origem: "liquidacao.notaFiscal.tipo (00=sem NF)", extrair: (f) => f.notaFiscal?.tipo ?? TIPO_NOTA_FISCAL_SEM },
  { nome: "numChaveNotaFiscal", posInicial: 40, posFinal: 83, tipo: "NUMERICO", obrigatorio: false, origem: "liquidacao.notaFiscalChave", extrair: (f) => f.notaFiscal?.chave ?? null },
  { nome: "numNotaFiscal", posInicial: 84, posFinal: 98, tipo: "ALFA", obrigatorio: false, origem: "liquidacao.notaFiscalNum", extrair: (f) => f.notaFiscal?.numero ?? null },
  { nome: "serieNotaFiscal", posInicial: 99, posFinal: 110, tipo: "ALFA", obrigatorio: false, origem: "liquidacao.notaFiscalSerie", extrair: (f) => f.notaFiscal?.serie ?? null },
  { nome: "dataNotaFiscal", posInicial: 111, posFinal: 118, tipo: "DATA", obrigatorio: false, origem: "liquidacao.notaFiscalData", extrair: (f) => f.notaFiscal?.data ?? null },
  { nome: "valorNotaFiscal", posInicial: 119, posFinal: 134, tipo: "VALOR", obrigatorio: false, origem: "liquidacao.notaFiscalValor", extrair: (f) => f.notaFiscal?.valor ?? null },
  { nome: "valor", posInicial: 135, posFinal: 150, tipo: "VALOR", obrigatorio: true, origem: "liquidacao.valor", extrair: (f) => f.valor },
  { nome: "codAgrupamentoFolha", posInicial: 151, posFinal: 160, tipo: "ALFA", obrigatorio: false, origem: "sem origem no modelo (folha) → espaços", extrair: (f) => f.codAgrupamentoFolha },
  { nome: "reservado", posInicial: 161, posFinal: 166, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];

export const LAYOUT_LIQUIDACAO: LayoutArquivo<LiquidacaoFato> = {
  entidade: "Liquidacao",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposLiquidacao,
};

// ═══ 4.8 EMPENHOS (Diário) ═════════════════════════════════════════════════════

export interface EmpenhoFato {
  readonly codUnidadeGestora: string; //  parâmetro export
  readonly anoEmissao: number; //         empenho.ficha.exercicio
  readonly codUnidadeOrcamentaria: string; // empenho.ficha.unidadeOrc.codigo
  readonly codFuncao: string;
  readonly codSubfuncao: string;
  readonly codPrograma: string;
  readonly codAcao: string;
  readonly codCategoriaEconomica: string;
  readonly codNaturezaDespesa: string;
  readonly codModalidadeDespesa: string;
  readonly codElementoDespesa: string;
  readonly codSubelemento: string | null; // empenho.subelemento?.codigo (nullable) → zeros
  readonly modalidadeLicitacao: string; //  contrato→processo, ou "9" (sem licitação)
  readonly numLicitacao: string | null; //  contrato→processo, ou zeros
  readonly numEmpenho: string; //          empenho.numero
  readonly tipoEmpenho: "ORDINARIO" | "ESTIMATIVO" | "GLOBAL"; // → §5.17
  readonly data: Date; //                  empenho.data
  readonly valor: Money; //                empenho.valor
  readonly historico: string; //           empenho.historico
  readonly complementacaoHistorico: string | null; // sem origem (o modelo tem 1 histórico) → espaços
  readonly credorCpfCnpj: string; //       empenho.credorCpfCnpj
  readonly naturezaContratacao: "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS"; // → §5.19
  readonly numObra: string | null; //      empenho.obra?.numero → zeros
  readonly exercicioFonteRecurso: number; // empenho.ficha.exercicioFonte
  readonly codFonteRecurso: string; //     empenho.ficha.fonte.codigo
  readonly cpfOrdenador: string | null; // ordenador da UG (ente-config) — sem origem por-empenho
  readonly co: string | null; //           empenho.ficha.co?.codigo → zeros
}

const camposEmpenhos: readonly CampoLayout<EmpenhoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissao", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissao },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "codFuncao", posInicial: 16, posFinal: 17, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.funcao.codigo", extrair: (f) => f.codFuncao },
  { nome: "codSubfuncao", posInicial: 18, posFinal: 20, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.subfuncao.codigo", extrair: (f) => f.codSubfuncao },
  { nome: "codPrograma", posInicial: 21, posFinal: 24, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.programa.codigo", extrair: (f) => f.codPrograma },
  { nome: "codAcao", posInicial: 25, posFinal: 28, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.acao.codigo", extrair: (f) => f.codAcao },
  { nome: "reservado", posInicial: 29, posFinal: 34, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
  { nome: "codCategoriaEconomica", posInicial: 35, posFinal: 35, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.naturezaDespesa.codCategoria", extrair: (f) => f.codCategoriaEconomica },
  { nome: "codNaturezaDespesa", posInicial: 36, posFinal: 36, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.naturezaDespesa.codNatureza", extrair: (f) => f.codNaturezaDespesa },
  { nome: "codModalidadeDespesa", posInicial: 37, posFinal: 38, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.naturezaDespesa.codModalidade", extrair: (f) => f.codModalidadeDespesa },
  { nome: "codElementoDespesa", posInicial: 39, posFinal: 40, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.naturezaDespesa.codElemento", extrair: (f) => f.codElementoDespesa },
  { nome: "codSubelementoDespesa", posInicial: 41, posFinal: 43, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.subelemento?.codigo (nullable→zeros)", extrair: (f) => f.codSubelemento },
  { nome: "modalidadeLicitacao", posInicial: 44, posFinal: 45, tipo: "NUMERICO", obrigatorio: true, origem: "processo (ou §6.2 '9' sem licitação)", extrair: (f) => f.modalidadeLicitacao },
  { nome: "numLicitacao", posInicial: 46, posFinal: 54, tipo: "NUMERICO", obrigatorio: true, origem: "processo.numero (nullable→zeros)", extrair: (f) => f.numLicitacao },
  { nome: "numEmpenho", posInicial: 55, posFinal: 61, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "tipo", posInicial: 62, posFinal: 62, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.tipo → §5.17", extrair: (f) => TIPO_EMPENHO_SAGRES[f.tipoEmpenho] },
  { nome: "data", posInicial: 63, posFinal: 70, tipo: "DATA", obrigatorio: true, origem: "empenho.data", extrair: (f) => f.data },
  { nome: "valor", posInicial: 71, posFinal: 86, tipo: "VALOR", obrigatorio: true, origem: "empenho.valor", extrair: (f) => f.valor },
  { nome: "historico", posInicial: 87, posFinal: 341, tipo: "ALFA", obrigatorio: true, origem: "empenho.historico", extrair: (f) => f.historico },
  // complementaçãoHistorico é COMPLEMENTO do histórico — vazio é válido (o modelo tem 1 histórico só).
  { nome: "complementacaoHistorico", posInicial: 342, posFinal: 596, tipo: "ALFA", obrigatorio: false, origem: "sem origem (modelo tem 1 histórico) → espaços", extrair: (f) => f.complementacaoHistorico },
  { nome: "cpfCnpjFornecedor", posInicial: 597, posFinal: 610, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.credorCpfCnpj", extrair: (f) => f.credorCpfCnpj },
  { nome: "NaturezaContratacao", posInicial: 611, posFinal: 611, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.categoriaOrdemCronologica → §5.19", extrair: (f) => NATUREZA_CONTRATACAO_SAGRES[f.naturezaContratacao] },
  { nome: "numObra", posInicial: 612, posFinal: 619, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.obra?.numero (nullable→zeros)", extrair: (f) => f.numObra },
  { nome: "exercicioFonteRecurso", posInicial: 620, posFinal: 620, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.exercicioFonte", extrair: (f) => f.exercicioFonteRecurso },
  { nome: "codFonteRecurso", posInicial: 621, posFinal: 623, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.fonte.codigo", extrair: (f) => f.codFonteRecurso },
  { nome: "cpfOrdenador", posInicial: 624, posFinal: 634, tipo: "NUMERICO", obrigatorio: true, origem: "ordenador da UG (ente-config, POC)", extrair: (f) => f.cpfOrdenador },
  { nome: "co", posInicial: 635, posFinal: 638, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.co?.codigo (nullable→zeros)", extrair: (f) => f.co },
];

export const LAYOUT_EMPENHOS: LayoutArquivo<EmpenhoFato> = {
  entidade: "Empenhos",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposEmpenhos,
};

/** §5.31 TipoContaBancaria — "1" = Conta Corrente (o default POC; o modelo não distingue tipo). */
export const TIPO_CONTA_CORRENTE = "1";
/** Situação da conta (§4.23) — "1" = Ativa (o modelo não tem inativação de conta). */
export const SITUACAO_CONTA_ATIVA = "1";

// ═══ 4.23 CADASTROCONTABANCARIA (Diário) ═══════════════════════════════════════

export interface CadastroContaFato {
  readonly codUnidadeGestora: string; //  parâmetro export
  readonly numeroConta: string; //        ContaBancaria.conta + digitoConta (com dígito)
  readonly situacao: string; //           "1" (ativa) — o modelo não inativa conta
  readonly banco: string; //              ContaBancaria.banco (FEBRABAN 3)
  readonly numeroAgencia: string; //      ContaBancaria.agencia + digitoAgencia
  readonly descricao: string; //          ContaBancaria.descricao
  readonly tipo: string; //               "1" (Conta Corrente) — default POC
  readonly cnpjGerencia: string; //       EnteConfig.cnpj (ente que gerencia)
}

const camposCadastroConta: readonly CampoLayout<CadastroContaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "numero", posInicial: 7, posFinal: 19, tipo: "ALFA", obrigatorio: true, origem: "ContaBancaria.conta+digitoConta", extrair: (f) => f.numeroConta },
  { nome: "situacao", posInicial: 20, posFinal: 20, tipo: "NUMERICO", obrigatorio: true, origem: "1=Ativa (modelo não inativa)", extrair: (f) => f.situacao },
  { nome: "codBanco", posInicial: 21, posFinal: 23, tipo: "NUMERICO", obrigatorio: true, origem: "ContaBancaria.banco (FEBRABAN)", extrair: (f) => f.banco },
  { nome: "numAgencia", posInicial: 24, posFinal: 29, tipo: "ALFA", obrigatorio: true, origem: "ContaBancaria.agencia+digitoAgencia", extrair: (f) => f.numeroAgencia },
  { nome: "descricao", posInicial: 30, posFinal: 89, tipo: "ALFA", obrigatorio: true, origem: "ContaBancaria.descricao", extrair: (f) => f.descricao },
  { nome: "tipo", posInicial: 90, posFinal: 90, tipo: "NUMERICO", obrigatorio: true, origem: "§5.31 (default 1=Conta Corrente)", extrair: (f) => f.tipo },
  { nome: "cnpjGerencia", posInicial: 91, posFinal: 104, tipo: "NUMERICO", obrigatorio: true, origem: "EnteConfig.cnpj", extrair: (f) => f.cnpjGerencia },
];

export const LAYOUT_CADASTRO_CONTA: LayoutArquivo<CadastroContaFato> = {
  entidade: "CadastroContaBancaria",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposCadastroConta,
};

// ═══ 4.26 SALDOMENSAL (Mensal) ═════════════════════════════════════════════════

export interface SaldoMensalFato {
  readonly codUnidadeGestora: string; //  parâmetro export
  readonly numeroConta: string; //        ContaBancaria.conta + digitoConta
  readonly numeroAgencia: string; //      ContaBancaria.agencia + digitoAgencia
  readonly banco: string; //              ContaBancaria.banco
  readonly valor: Money; //               SUM(extrato) até o fim do mês — calculado na exportação
  readonly tipo: string; //               "1" (Conta Corrente)
  readonly cnpjGerencia: string; //       EnteConfig.cnpj
}

const camposSaldoMensal: readonly CampoLayout<SaldoMensalFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "numContaBancaria", posInicial: 7, posFinal: 19, tipo: "ALFA", obrigatorio: true, origem: "ContaBancaria.conta+digitoConta", extrair: (f) => f.numeroConta },
  { nome: "numAgencia", posInicial: 20, posFinal: 25, tipo: "ALFA", obrigatorio: true, origem: "ContaBancaria.agencia+digitoAgencia", extrair: (f) => f.numeroAgencia },
  { nome: "codBanco", posInicial: 26, posFinal: 28, tipo: "ALFA", obrigatorio: true, origem: "ContaBancaria.banco", extrair: (f) => f.banco },
  { nome: "valor", posInicial: 29, posFinal: 44, tipo: "VALOR", obrigatorio: true, origem: "SUM(LancamentoExtrato) até fim do mês", extrair: (f) => f.valor },
  { nome: "tipoContaBancaria", posInicial: 45, posFinal: 45, tipo: "NUMERICO", obrigatorio: true, origem: "§5.31 (default 1)", extrair: (f) => f.tipo },
  { nome: "cnpjGerenciaContaBancaria", posInicial: 46, posFinal: 59, tipo: "NUMERICO", obrigatorio: true, origem: "EnteConfig.cnpj", extrair: (f) => f.cnpjGerencia },
];

export const LAYOUT_SALDO_MENSAL: LayoutArquivo<SaldoMensalFato> = {
  entidade: "SaldoMensal",
  periodicidade: "MENSAL",
  versao: VERSAO,
  campos: camposSaldoMensal,
};

// ═══ 4.59 MOVIMENTACAOENTRECONTASBANCARIAS (Diário) ════════════════════════════
// ⚠️ O layout tem larguras ASSIMÉTRICAS: conta-origem ocupa 14 posições (16–29) e conta-destino 13
// (40–52), embora o rótulo de ambas diga "Caractere(13)". As POSIÇÕES oficiais definem os bytes —
// é o que a auto-validação da registry confere; sigo-as fielmente.

export interface MovimentacaoFato {
  readonly codUnidadeGestora: string; //  parâmetro export
  readonly codBancoOrigem: string; //     contaOrigem.banco
  readonly numAgenciaOrigem: string; //   contaOrigem.agencia+digito
  readonly numeroCtaOrigem: string; //    contaOrigem.conta+digito
  readonly tipoCtaOrigem: string; //      "1" (Conta Corrente)
  readonly codBancoDestino: string; //    contaDestino.banco
  readonly numAgenciaDestino: string; //  contaDestino.agencia+digito
  readonly numeroCtaDestino: string; //   contaDestino.conta+digito
  readonly tipoCtaDestino: string; //     "1"
  readonly valor: Money; //               transferencia.valor
  readonly data: Date; //                 transferencia.data
  readonly codigo: string; //             transferencia.codigo (controle, 7)
}

const camposMovimentacao: readonly CampoLayout<MovimentacaoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codBancoOrigem", posInicial: 7, posFinal: 9, tipo: "NUMERICO", obrigatorio: true, origem: "contaOrigem.banco", extrair: (f) => f.codBancoOrigem },
  { nome: "numAgenciaOrigem", posInicial: 10, posFinal: 15, tipo: "ALFA", obrigatorio: true, origem: "contaOrigem.agencia+digito", extrair: (f) => f.numAgenciaOrigem },
  { nome: "numeroCtaOrigem", posInicial: 16, posFinal: 29, tipo: "ALFA", obrigatorio: true, origem: "contaOrigem.conta+digito", extrair: (f) => f.numeroCtaOrigem },
  { nome: "tipoCtaOrigem", posInicial: 30, posFinal: 30, tipo: "NUMERICO", obrigatorio: true, origem: "§5.31 (default 1)", extrair: (f) => f.tipoCtaOrigem },
  { nome: "codBancoDestino", posInicial: 31, posFinal: 33, tipo: "NUMERICO", obrigatorio: true, origem: "contaDestino.banco", extrair: (f) => f.codBancoDestino },
  { nome: "numAgenciaDestino", posInicial: 34, posFinal: 39, tipo: "ALFA", obrigatorio: true, origem: "contaDestino.agencia+digito", extrair: (f) => f.numAgenciaDestino },
  { nome: "numeroCtaDestino", posInicial: 40, posFinal: 52, tipo: "ALFA", obrigatorio: true, origem: "contaDestino.conta+digito", extrair: (f) => f.numeroCtaDestino },
  { nome: "tipoCtaDestino", posInicial: 53, posFinal: 53, tipo: "NUMERICO", obrigatorio: true, origem: "§5.31 (default 1)", extrair: (f) => f.tipoCtaDestino },
  { nome: "valorTransferencia", posInicial: 54, posFinal: 69, tipo: "VALOR", obrigatorio: true, origem: "transferencia.valor", extrair: (f) => f.valor },
  { nome: "dataMovimentacao", posInicial: 70, posFinal: 77, tipo: "DATA", obrigatorio: true, origem: "transferencia.data", extrair: (f) => f.data },
  { nome: "codigoMovimentacao", posInicial: 78, posFinal: 84, tipo: "ALFA", obrigatorio: true, origem: "transferencia.codigo", extrair: (f) => f.codigo },
];

export const LAYOUT_MOVIMENTACAO: LayoutArquivo<MovimentacaoFato> = {
  entidade: "MovimentacaoEntreContasBancarias",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposMovimentacao,
};

// ═══ 4.12 PAGAMENTOS (Diário) ══════════════════════════════════════════════════
// Origem: Pagamento + Liquidacao + Empenho + Ficha + a ContaBancaria pagadora (débito), resolvida
// pelo CÓDIGO em Pagamento.contaBancaria (a tripla estruturada na S2). Os 5 campos do CRÉDITO ao
// credor (cheque/doc/banco-agência-conta-crédito) NÃO têm origem no modelo (o pagamento guarda a
// conta de DÉBITO, não a do favorecido) → opcionais, preenchidos com espaços. Reportado no MODULO.

export interface PagamentoFato {
  readonly codUnidadeGestora: string; //  parâmetro export
  readonly anoEmissaoEmpenho: number; //  pag.liquidacao.empenho.ficha.exercicio
  readonly codUnidadeOrcamentaria: string; // ...unidadeOrc.codigo
  readonly numEmpenho: string; //         pag.liquidacao.empenho.numero
  readonly numero: string; //             pagamento.numero (parcela)
  readonly data: Date; //                 pagamento.data
  readonly valor: Money; //               pagamento.valor
  readonly numeroContaDebito: string; //  contaPagadora.conta+digito
  readonly numeroAgenciaDebito: string; // contaPagadora.agencia+digito
  readonly codBancoDebito: string; //     contaPagadora.banco
  readonly exercicioFonteRecurso: number; // ficha.exercicioFonte
  readonly codFonteRecurso: string; //    pagamento.fonte.codigo (TR 5.23 = fonte da conta)
  readonly tipoContaBancaria: string; //  "1" (Conta Corrente)
  readonly cnpjGerencia: string; //       EnteConfig.cnpj (parâmetro export)
}

const camposPagamentos: readonly CampoLayout<PagamentoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "pag.liquidacao.empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "pag.liquidacao.empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numero", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "pagamento.numero (parcela)", extrair: (f) => f.numero },
  { nome: "data", posInicial: 30, posFinal: 37, tipo: "DATA", obrigatorio: true, origem: "pagamento.data", extrair: (f) => f.data },
  { nome: "valor", posInicial: 38, posFinal: 53, tipo: "VALOR", obrigatorio: true, origem: "pagamento.valor", extrair: (f) => f.valor },
  { nome: "numContaBancaria", posInicial: 54, posFinal: 66, tipo: "ALFA", obrigatorio: true, origem: "contaPagadora.conta+digito", extrair: (f) => f.numeroContaDebito },
  { nome: "numAgencia", posInicial: 67, posFinal: 72, tipo: "ALFA", obrigatorio: true, origem: "contaPagadora.agencia+digito", extrair: (f) => f.numeroAgenciaDebito },
  { nome: "codBanco", posInicial: 73, posFinal: 75, tipo: "ALFA", obrigatorio: true, origem: "contaPagadora.banco", extrair: (f) => f.codBancoDebito },
  // Os 5 campos do CRÉDITO ao credor — sem origem no modelo (o pagamento guarda o DÉBITO) → espaços.
  { nome: "numCheque", posInicial: 76, posFinal: 81, tipo: "ALFA", obrigatorio: false, origem: "sem origem no modelo → espaços", extrair: () => null },
  { nome: "numDocDebito", posInicial: 82, posFinal: 92, tipo: "ALFA", obrigatorio: false, origem: "sem origem no modelo → espaços", extrair: () => null },
  { nome: "codBancoCred", posInicial: 93, posFinal: 95, tipo: "ALFA", obrigatorio: false, origem: "sem origem no modelo → espaços", extrair: () => null },
  { nome: "numAgenciaCred", posInicial: 96, posFinal: 101, tipo: "ALFA", obrigatorio: false, origem: "sem origem no modelo → espaços", extrair: () => null },
  { nome: "numContaBancariaCred", posInicial: 102, posFinal: 114, tipo: "ALFA", obrigatorio: false, origem: "sem origem no modelo → espaços", extrair: () => null },
  { nome: "exercicioFonteRecurso", posInicial: 115, posFinal: 115, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.exercicioFonte", extrair: (f) => f.exercicioFonteRecurso },
  { nome: "codFonteRecurso", posInicial: 116, posFinal: 118, tipo: "NUMERICO", obrigatorio: true, origem: "pagamento.fonte.codigo", extrair: (f) => f.codFonteRecurso },
  { nome: "tipoContaBancaria", posInicial: 119, posFinal: 119, tipo: "NUMERICO", obrigatorio: true, origem: "§5.31 (default 1)", extrair: (f) => f.tipoContaBancaria },
  { nome: "cnpjGerenciaContaBancaria", posInicial: 120, posFinal: 133, tipo: "NUMERICO", obrigatorio: true, origem: "EnteConfig.cnpj", extrair: (f) => f.cnpjGerencia },
];

export const LAYOUT_PAGAMENTOS: LayoutArquivo<PagamentoFato> = {
  entidade: "Pagamentos",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposPagamentos,
};

// ═══ 4.16 RECEITAORCAMENTARIA (Diária) ═════════════════════════════════════════
// Origem: ReceitaArrecadada (m04) + naturezaReceita + fonte + co. A CONTA ARRECADADORA é PARÂMETRO
// DE EXPORTAÇÃO (a designação da UG), não vínculo por-guia: o modelo NÃO amarra receita a conta —
// "a receita é do ENTE" (art. 167, IV; servico.ts). Mesmo tratamento de `codUnidadeGestora`.

/** §5.18 TipoLancamento — 1=Ordinário, 2=Estorno. Mapeia o `tipo` da ReceitaArrecadada. */
export const TIPO_LANCAMENTO_RECEITA_SAGRES: Record<"ARRECADACAO" | "ANULACAO" | "RETIFICACAO", string> = {
  ARRECADACAO: "1",
  RETIFICACAO: "1",
  ANULACAO: "2",
};

/** §5.23 TipoReceitaLancada — "1" = Lançamento de Receita. As deduções (3/4/5, Fundeb etc.) não são
 * modeladas: a POC lança receita normal. Constante nomeada (limitação no MODULO). */
export const TIPO_RECEITA_LANCAMENTO_NORMAL = "1";

export interface ReceitaOrcamentariaFato {
  readonly codUnidadeGestora: string; //  parâmetro export
  readonly numeroReceita: string; //      receita.numeroReceita (nº da guia)
  readonly codReceitaOrcamentaria: string; // receita.naturezaReceita.codigo (STN, 8)
  readonly tipoLancamento: "ARRECADACAO" | "ANULACAO" | "RETIFICACAO"; // → §5.18
  readonly exercicioFonteRecurso: number; // receita.exercicioFonte
  readonly codFonteRecurso: string; //    receita.fonte.codigo
  readonly valor: Money; //               receita.valor
  readonly data: Date; //                 receita.dataArrecadacao
  readonly co: string | null; //          receita.co?.codigo (obrigatório no layout)
  readonly numeroConta: string; //        contaArrecadadora.conta+digito (parâmetro export)
  readonly codBanco: string; //           contaArrecadadora.banco
  readonly numeroAgencia: string; //      contaArrecadadora.agencia+digito
  readonly tipoContaBancaria: string; //  "1" (Conta Corrente)
  readonly cnpjGerencia: string; //       EnteConfig.cnpj (parâmetro export)
}

const camposReceitaOrcamentaria: readonly CampoLayout<ReceitaOrcamentariaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "numeroReceita", posInicial: 7, posFinal: 13, tipo: "NUMERICO", obrigatorio: true, origem: "receita.numeroReceita (guia)", extrair: (f) => f.numeroReceita },
  { nome: "codReceitaOrcamentaria", posInicial: 14, posFinal: 21, tipo: "NUMERICO", obrigatorio: true, origem: "naturezaReceita.codigo (STN)", extrair: (f) => f.codReceitaOrcamentaria },
  { nome: "tipoLancamento", posInicial: 22, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "receita.tipo → §5.18", extrair: (f) => TIPO_LANCAMENTO_RECEITA_SAGRES[f.tipoLancamento] },
  { nome: "exercicioFonteRecurso", posInicial: 23, posFinal: 23, tipo: "NUMERICO", obrigatorio: true, origem: "receita.exercicioFonte", extrair: (f) => f.exercicioFonteRecurso },
  { nome: "codFonteRecurso", posInicial: 24, posFinal: 26, tipo: "NUMERICO", obrigatorio: true, origem: "receita.fonte.codigo", extrair: (f) => f.codFonteRecurso },
  { nome: "tipoReceita", posInicial: 27, posFinal: 27, tipo: "NUMERICO", obrigatorio: true, origem: "§5.23 (default 1=Lançamento de Receita)", extrair: () => TIPO_RECEITA_LANCAMENTO_NORMAL },
  { nome: "valor", posInicial: 28, posFinal: 43, tipo: "VALOR", obrigatorio: true, origem: "receita.valor", extrair: (f) => f.valor },
  { nome: "data", posInicial: 44, posFinal: 51, tipo: "DATA", obrigatorio: true, origem: "receita.dataArrecadacao", extrair: (f) => f.data },
  { nome: "co", posInicial: 52, posFinal: 55, tipo: "NUMERICO", obrigatorio: true, origem: "receita.co?.codigo", extrair: (f) => f.co },
  { nome: "numeroConta", posInicial: 56, posFinal: 68, tipo: "ALFA", obrigatorio: true, origem: "contaArrecadadora.conta+digito (param export)", extrair: (f) => f.numeroConta },
  { nome: "codBanco", posInicial: 69, posFinal: 71, tipo: "NUMERICO", obrigatorio: true, origem: "contaArrecadadora.banco (FEBRABAN)", extrair: (f) => f.codBanco },
  { nome: "numAgencia", posInicial: 72, posFinal: 77, tipo: "ALFA", obrigatorio: true, origem: "contaArrecadadora.agencia+digito", extrair: (f) => f.numeroAgencia },
  { nome: "tipoContaBancaria", posInicial: 78, posFinal: 78, tipo: "NUMERICO", obrigatorio: true, origem: "§5.31 (default 1)", extrair: (f) => f.tipoContaBancaria },
  { nome: "cnpjGerencia", posInicial: 79, posFinal: 92, tipo: "NUMERICO", obrigatorio: true, origem: "EnteConfig.cnpj", extrair: (f) => f.cnpjGerencia },
];

export const LAYOUT_RECEITA_ORCAMENTARIA: LayoutArquivo<ReceitaOrcamentariaFato> = {
  entidade: "ReceitaOrcamentaria",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposReceitaOrcamentaria,
};

// ═══ 4.14 RETENCAO (Diário) ════════════════════════════════════════════════════
// Origem: MovimentoExtraorcamentario (m07) com `tipo: INGRESSO` e `pagamentoId != null` — a retenção
// NASCEU dentro de um pagamento (é o mesmo filtro de `listarRetencoes`, m07/consultas.ts). O empenho,
// a unidade orçamentária e o exercício vêm pelo drill `pagamento.liquidacao.empenho.ficha`, o mesmo
// caminho já usado por `lerFatosPagamentos`.

/**
 * §5.24 TipoRetencao — DE-PARA EXPLÍCITO `TipoConsignacao.codigo` (m07) → código do layout.
 *
 * As duas listas NÃO são a mesma coisa e não podem ser confundidas:
 *   · `TipoConsignacao` é TABELA no m07 — rol ABERTO, o ente cria tipos próprios (plano de saúde,
 *     sindicato, associação). É o cadastro do MUNICÍPIO.
 *   · `TipoRetencao` é DOMÍNIO FECHADO do layout §5.24 — 8 códigos, definidos pelo TCE-PB.
 *
 * Por isso o de-para é uma tabela EXPLÍCITA e não um `parseInt` do código: um tipo próprio do ente
 * sem correspondência tem de FALHAR NOMEANDO (`tipoRetencaoDe`), nunca cair num "5 = Outras" por
 * omissão — o TCE receberia uma classificação inventada. Os 7 tipos do seed POC
 * (`prisma/seed/dados/tipos-consignacao.ts`) estão todos aqui; o 8º e o 4º códigos do layout
 * (Previdência Própria, RPPS de outro ente) não têm tipo correspondente no cadastro POC.
 *
 * Conferido campo a campo contra o layout local §5.24 (HTML, linha 19185).
 */
export const DEPARA_TIPO_RETENCAO_SAGRES: Readonly<Record<string, string>> = {
  ISS: "1", //                     §5.24 1 = ISS
  IRRF: "2", //                    §5.24 2 = IRRF
  INSS: "3", //                    §5.24 3 = INSS
  // §5.24 4 = Previdência Própria — sem tipo correspondente no cadastro POC.
  CAUCAO: "5", //                  §5.24 5 = Outras Consignações
  RETENCAO_CONTRATUAL: "5", //     §5.24 5 = Outras Consignações
  CONSIGNACAO_EMPRESTIMO: "6", //  §5.24 6 = Consignação de empréstimos consignados
  PENSAO_ALIMENTICIA: "7", //      §5.24 7 = Consignação pensão alimentícia
  // §5.24 8 = Consignação p/ RPPS de outro ente — sem tipo correspondente no cadastro POC.
};

/** O código §5.24 do tipo de consignação — ou o erro que NOMEIA o tipo sem de-para. Fail-closed. */
export function tipoRetencaoDe(codigoTipoConsignacao: string): string {
  const codigo = DEPARA_TIPO_RETENCAO_SAGRES[codigoTipoConsignacao];
  if (codigo === undefined) {
    throw new Error(
      `SAGRES/Retencao §4.14 — o tipo de consignação "${codigoTipoConsignacao}" não tem de-para para ` +
        `TipoRetencao (§5.24). O rol do m07 é ABERTO e o do layout é FECHADO (8 códigos): um tipo novo ` +
        `precisa ser mapeado explicitamente em DEPARA_TIPO_RETENCAO_SAGRES. Mapeados hoje: ` +
        `${Object.keys(DEPARA_TIPO_RETENCAO_SAGRES).join(", ")}.`
    );
  }
  return codigo;
}

export interface RetencaoFato {
  readonly codUnidadeGestora: string; //     parâmetro export (UG)
  readonly anoEmissaoEmpenho: number; //     mov.pagamento.liquidacao.empenho.ficha.exercicio
  readonly codUnidadeOrcamentaria: string; // ...ficha.unidadeOrc.codigo
  readonly numEmpenho: string; //            ...empenho.numero
  readonly numPagamento: string; //          mov.pagamento.numero (nº da parcela)
  readonly valor: Money; //                  mov.valor
  readonly tipoConsignacaoCodigo: string; // mov.tipoConsignacao.codigo → §5.24 pelo de-para
}

const camposRetencao: readonly CampoLayout<RetencaoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "mov.pagamento.liquidacao.empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "mov.pagamento.liquidacao.empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numPagamento", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "mov.pagamento.numero (parcela)", extrair: (f) => f.numPagamento },
  { nome: "valor", posInicial: 30, posFinal: 45, tipo: "VALOR", obrigatorio: true, origem: "mov.valor", extrair: (f) => f.valor },
  { nome: "tipo", posInicial: 46, posFinal: 46, tipo: "NUMERICO", obrigatorio: true, origem: "mov.tipoConsignacao.codigo → §5.24 (de-para)", extrair: (f) => tipoRetencaoDe(f.tipoConsignacaoCodigo) },
  { nome: "reservado", posInicial: 47, posFinal: 52, tipo: "RESERVADO", obrigatorio: false, origem: "RESERVADO AO TCE = ZEROS" },
];

export const LAYOUT_RETENCAO: LayoutArquivo<RetencaoFato> = {
  entidade: "Retencao",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposRetencao,
};

// ═══ 4.20 DESPESAEXTRA (Diária) ════════════════════════════════════════════════
// Origem: MovimentoExtraorcamentario (m07) com `tipo: DISPENDIO` — o recolhimento/repasse ao
// consignatário (é o filtro de `listarDispendios`). Largura 637; o campo `historico` sozinho ocupa 500.
//
// TRÊS GAPS NOMEADOS (nenhum inventado — DIRETIVA "campo sem origem = espaços ou nomeado"):
//   1. `cpfCnpjFornecedor` — o m07 guarda `credorConsignatario` como NOME LIVRE (string), não
//      documento. Não há CPF/CNPJ do consignatário no modelo → ZEROS, gap na matriz.
//   2. `co` (detalhamento da fonte que paga) — o dispêndio extra não carrega CO no modelo → ZEROS.
//   3. `codFonteRecurso` — o layout EXIGE 860/861/862/869 (padrão STN de movimentação
//      extraorçamentária). O `FonteRecurso` da POC é 500: não é a mesma dimensão. É PARÂMETRO DE
//      EXPORTAÇÃO (`codFonteRecursoExtra`), no mesmo espírito de `codContaArrecadadora`/`codUnidadeGestora`.
// O vínculo com ReceitaExtra (607-623) NÃO é exigido nesta POC → ESPAÇOS (ASCII 32), como manda o layout.

/** §5.3 CodigoDespesaExtra — as fontes STN admitidas em `codFonteRecurso` da DespesaExtra (§4.20). */
export const FONTES_RECURSO_EXTRA_SAGRES = ["860", "861", "862", "869"] as const;

/**
 * §5.3 CodigoDespesaExtra — de-para `TipoConsignacao.codigo` → natureza da despesa extra.
 * CAUÇÃO é DEPÓSITO (20000018), não consignação: o dinheiro é garantia, não retenção na fonte.
 * O default para todo tipo mapeado em §5.24 é 20000017 (Consignações).
 */
export const CODIGO_DESPESA_EXTRA_CONSIGNACOES = "20000017";
export const CODIGO_DESPESA_EXTRA_DEPOSITOS = "20000018";
export function codigoDespesaExtraDe(codigoTipoConsignacao: string): string {
  tipoRetencaoDe(codigoTipoConsignacao); // fail-closed: tipo sem de-para não vira despesa extra silenciosa.
  return codigoTipoConsignacao === "CAUCAO" ? CODIGO_DESPESA_EXTRA_DEPOSITOS : CODIGO_DESPESA_EXTRA_CONSIGNACOES;
}

/** §4.20 exercicioFonteRecurso — 1 = Atual, 2 = Anterior. A POC exporta o exercício corrente. */
export const EXERCICIO_FONTE_ATUAL = 1;

export interface DespesaExtraFato {
  readonly codUnidadeGestora: string; //      parâmetro export (UG)
  readonly numero: string; //                 sequencial determinístico no exercício (ver gerador)
  readonly codContaContabil: string; //       partida DEBITO do lançamento → ContaPcasp.codigo (sem pontos)
  readonly data: Date; //                     mov.data
  readonly exercicioFonteRecurso: number; //  1 = Atual
  readonly codFonteRecursoExtra: string; //   parâmetro export (860/861/862/869)
  readonly numeroConta: string; //            mov.contaBancaria.conta+digito
  readonly numeroAgencia: string; //          mov.contaBancaria.agencia+digito
  readonly codBanco: string; //               mov.contaBancaria.banco
  readonly tipoContaBancaria: string; //      "1" (Conta Corrente)
  readonly valor: Money; //                   mov.valor
  readonly historico: string; //              mov.historico
  readonly tipoConsignacaoCodigo: string; //  → §5.3 pelo de-para
  readonly exercicio: number; //              ano de mov.data
  readonly codFonteRecursoPagamento: string; // mov.contaBancaria.fonte.codigo (a fonte REAL que paga)
  readonly cnpjGerencia: string; //           parâmetro export (CNPJ gerenciador)
}

const camposDespesaExtra: readonly CampoLayout<DespesaExtraFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "numero", posInicial: 7, posFinal: 13, tipo: "NUMERICO", obrigatorio: true, origem: "sequencial determinístico no exercício (data,id)", extrair: (f) => f.numero },
  { nome: "codContaContabil", posInicial: 14, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "partida DEBITO → ContaPcasp.codigo (sem pontos)", extrair: (f) => f.codContaContabil },
  { nome: "data", posInicial: 23, posFinal: 30, tipo: "DATA", obrigatorio: true, origem: "mov.data", extrair: (f) => f.data },
  // GAP 1 — o m07 guarda o consignatário como NOME, não documento. Sem origem → ZEROS (nomeado).
  { nome: "cpfCnpjFornecedor", posInicial: 31, posFinal: 44, tipo: "NUMERICO", obrigatorio: true, origem: "GAP: m07.credorConsignatario é nome livre, não CPF/CNPJ → zeros", extrair: () => null },
  { nome: "exercicioFonteRecurso", posInicial: 45, posFinal: 45, tipo: "NUMERICO", obrigatorio: true, origem: "1 = Atual", extrair: (f) => f.exercicioFonteRecurso },
  { nome: "codFonteRecurso", posInicial: 46, posFinal: 48, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (860/861/862/869 — STN)", extrair: (f) => f.codFonteRecursoExtra },
  { nome: "numContaBancaria", posInicial: 49, posFinal: 61, tipo: "ALFA", obrigatorio: true, origem: "mov.contaBancaria.conta+digito", extrair: (f) => f.numeroConta },
  { nome: "numAgencia", posInicial: 62, posFinal: 67, tipo: "ALFA", obrigatorio: true, origem: "mov.contaBancaria.agencia+digito", extrair: (f) => f.numeroAgencia },
  { nome: "codBanco", posInicial: 68, posFinal: 70, tipo: "NUMERICO", obrigatorio: true, origem: "mov.contaBancaria.banco (FEBRABAN)", extrair: (f) => f.codBanco },
  { nome: "tipoContaBancaria", posInicial: 71, posFinal: 71, tipo: "NUMERICO", obrigatorio: true, origem: "§5.31 (default 1)", extrair: (f) => f.tipoContaBancaria },
  { nome: "valor", posInicial: 72, posFinal: 87, tipo: "VALOR", obrigatorio: true, origem: "mov.valor", extrair: (f) => f.valor },
  { nome: "historico", posInicial: 88, posFinal: 587, tipo: "ALFA", obrigatorio: true, origem: "mov.historico", extrair: (f) => f.historico },
  { nome: "codDespesaExtra", posInicial: 588, posFinal: 595, tipo: "NUMERICO", obrigatorio: true, origem: "mov.tipoConsignacao.codigo → §5.3 (de-para)", extrair: (f) => codigoDespesaExtraDe(f.tipoConsignacaoCodigo) },
  { nome: "exercicio", posInicial: 596, posFinal: 599, tipo: "NUMERICO", obrigatorio: true, origem: "ano de mov.data", extrair: (f) => f.exercicio },
  { nome: "codFonteRecursoPagamento", posInicial: 600, posFinal: 602, tipo: "NUMERICO", obrigatorio: true, origem: "mov.contaBancaria.fonte.codigo (fonte real)", extrair: (f) => f.codFonteRecursoPagamento },
  // GAP 2 — o dispêndio extra não carrega CO no modelo. Sem origem → ZEROS (nomeado).
  { nome: "co", posInicial: 603, posFinal: 606, tipo: "NUMERICO", obrigatorio: true, origem: "GAP: dispêndio extra não tem CO no modelo → zeros", extrair: () => null },
  // Vínculo com ReceitaExtra NÃO exigido nesta POC → ESPAÇOS (ASCII 32), como o layout manda.
  { nome: "codUnidadeGestoraReceitaExtra", posInicial: 607, posFinal: 612, tipo: "ALFA", obrigatorio: false, origem: "vínculo ReceitaExtra não exigido → espaços", extrair: () => null },
  { nome: "exercicioReceitaExtra", posInicial: 613, posFinal: 616, tipo: "ALFA", obrigatorio: false, origem: "vínculo ReceitaExtra não exigido → espaços", extrair: () => null },
  { nome: "numReceitaExtra", posInicial: 617, posFinal: 623, tipo: "ALFA", obrigatorio: false, origem: "vínculo ReceitaExtra não exigido → espaços", extrair: () => null },
  { nome: "cnpjGerenciaContaBancaria", posInicial: 624, posFinal: 637, tipo: "NUMERICO", obrigatorio: true, origem: "EnteConfig.cnpj (parâmetro export)", extrair: (f) => f.cnpjGerencia },
];

export const LAYOUT_DESPESA_EXTRA: LayoutArquivo<DespesaExtraFato> = {
  entidade: "DespesaExtra",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposDespesaExtra,
};

/** Todos os layouts desta versão, para a auto-validação em lote e a matriz. */
export const LAYOUTS_2026V11 = [
  LAYOUT_DOTACAO,
  LAYOUT_EMPENHOS,
  LAYOUT_LIQUIDACAO,
  LAYOUT_CADASTRO_CONTA,
  LAYOUT_SALDO_MENSAL,
  LAYOUT_MOVIMENTACAO,
  LAYOUT_PAGAMENTOS,
  LAYOUT_RECEITA_ORCAMENTARIA,
  LAYOUT_RETENCAO,
  LAYOUT_DESPESA_EXTRA,
] as const;
