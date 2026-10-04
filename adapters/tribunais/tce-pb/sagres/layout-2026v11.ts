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
 * ⚠️ ESTE CABEÇALHO DESCREVIA TRÊS ENTIDADES E O ARQUIVO TEM DEZ. Ele foi escrito quando a fatia
 * era dotação→empenho→liquidação e não acompanhou as ampliações (S2, S7 e S-fechamento). Ficou
 * assim tempo suficiente para um inventário desta obra concluir, pelo comentário, que o SAGRES
 * cobria três tabelas — quando `LAYOUTS_2026V11`, o `index.ts` e o `MODULO.md` diziam dez. Comentário
 * desatualizado sobre COBERTURA não é imprecisão de estilo: é a papelada contradizendo o código no
 * exato ponto em que alguém decide o que falta construir.
 *
 * AS DEZ ENTIDADES QUE ESTE ARQUIVO EXPORTA (8 diárias + 2 mensais):
 *   · Dotacao                        (§4.4,  Mensal) — a fixação da LOA. Origem: FichaOrcamentaria
 *                                    (o `@@unique` se chama "uq_ficha_sagres": a ficha FOI desenhada
 *                                    como esta tabela).
 *   · SaldoMensal                    (§4.26, Mensal) — saldo por conta, somado do extrato.
 *   · Empenhos                       (§4.8,  Diário) — Empenho + FichaOrcamentaria.
 *   · Liquidacao                     (§4.10, Diário) — Liquidacao + Empenho + Ficha.
 *   · Pagamentos                     (§4.12, Diário) — Pagamento + a cadeia até a ficha.
 *   · ReceitaOrcamentaria            (§4.16, Diária) — ReceitaArrecadada + natureza + fonte.
 *   · Retencao                       (§4.14, Diária) — MovimentoExtraorcamentario nascido no pagamento.
 *   · DespesaExtra                   (§4.20, Diária) — o dispêndio extraorçamentário.
 *   · CadastroContaBancaria          (§4.23, Diário) — a tripla banco/agência/conta.
 *   · MovimentacaoEntreContasBancarias (§4.59, Diária) — TransferenciaEntreContas.
 *
 * AS TRÊS QUE NÃO EXPORTAM, cada uma por gap NOMEADO no modelo (detalhe na MATRIZ DE COBERTURA do
 * `MODULO.md`) — nunca linha vazia falsa (PATCH §5):
 *   · UnidadeOrcamentaria  (§4.1,  Mensal) — faltam `nomeSecretario`, `cpfSecretario`,
 *     `atoAdministrativo` e `tipoNaturezaJuridica`, todos OBRIGATÓRIOS no layout. Aplicável sempre.
 *     ⚠️ É a TABELA DE EXPORTAÇÃO §4.1, e não o conceito administrativo de unidade orçamentária —
 *     que existe no modelo e é usado pelas outras dez.
 *   · EstornoPagamento     (§4.13, Diário) — `Pagamento.estornoDe` existe, mas `motivo`
 *     (Caractere 120, obrigatório) não tem coluna. Aplicável SÓ quando houve estorno de pagamento.
 *   · ConciliacaoBancaria  (§4.27, Mensal) — `VinculoConciliacao` existe; faltam campos bancários.
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
  { nome: "cpfCnpjFornecedor", posInicial: 597, posFinal: 610, tipo: "DOCUMENTO", obrigatorio: true, origem: "empenho.credorCpfCnpj", extrair: (f) => f.credorCpfCnpj },
  { nome: "NaturezaContratacao", posInicial: 611, posFinal: 611, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.categoriaOrdemCronologica → §5.19", extrair: (f) => NATUREZA_CONTRATACAO_SAGRES[f.naturezaContratacao] },
  { nome: "numObra", posInicial: 612, posFinal: 619, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.obra?.numero (nullable→zeros)", extrair: (f) => f.numObra },
  { nome: "exercicioFonteRecurso", posInicial: 620, posFinal: 620, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.exercicioFonte", extrair: (f) => f.exercicioFonteRecurso },
  { nome: "codFonteRecurso", posInicial: 621, posFinal: 623, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.fonte.codigo", extrair: (f) => f.codFonteRecurso },
  { nome: "cpfOrdenador", posInicial: 624, posFinal: 634, tipo: "DOCUMENTO", obrigatorio: true, origem: "ordenador da UG (ente-config, POC)", extrair: (f) => f.cpfOrdenador },
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
  { nome: "cnpjGerencia", posInicial: 91, posFinal: 104, tipo: "DOCUMENTO", obrigatorio: true, origem: "EnteConfig.cnpj", extrair: (f) => f.cnpjGerencia },
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
  { nome: "cnpjGerenciaContaBancaria", posInicial: 46, posFinal: 59, tipo: "DOCUMENTO", obrigatorio: true, origem: "EnteConfig.cnpj", extrair: (f) => f.cnpjGerencia },
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
  { nome: "cnpjGerenciaContaBancaria", posInicial: 120, posFinal: 133, tipo: "DOCUMENTO", obrigatorio: true, origem: "EnteConfig.cnpj", extrair: (f) => f.cnpjGerencia },
];

export const LAYOUT_PAGAMENTOS: LayoutArquivo<PagamentoFato> = {
  entidade: "Pagamentos",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposPagamentos,
};

// ═══ 4.1 UNIDADEORCAMENTARIA (Mensal) — V21 ═══════════════════════════════════════
// Origem: UnidadeOrcamentaria (código, descrição) + a DeclaracaoDaUnidadeOrcamentaria VIGENTE no fim
// do mês (natureza jurídica, secretário, ato de nomeação — versionada, M02 V21). Os códigos do leiaute
// (§5.14 e §5.26) saem por DE-PARA EXAUSTIVO dos enums do domínio: um valor novo no enum não compila
// até alguém dizer o código dele. Unidade sem declaração até o corte: o arquivo é RECUSADO nomeando-a.

export interface UnidadeOrcamentariaFato {
  readonly codUnidadeGestora: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly nomeSecretario: string;
  readonly cpfSecretario: string;
  readonly atoAdministrativo: string;
  readonly tipoNaturezaJuridica: string;
}

const camposUnidadeOrcamentaria: readonly CampoLayout<UnidadeOrcamentariaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codigo", posInicial: 7, posFinal: 11, tipo: "NUMERICO", obrigatorio: true, origem: "unidadeOrc.codigo", extrair: (f) => f.codigo },
  { nome: "descricao", posInicial: 12, posFinal: 61, tipo: "ALFA", obrigatorio: true, origem: "unidadeOrc.descricao", extrair: (f) => f.descricao },
  { nome: "nomeSecretario", posInicial: 62, posFinal: 121, tipo: "ALFA", obrigatorio: true, origem: "declaração vigente.nomeSecretario", extrair: (f) => f.nomeSecretario },
  { nome: "cpfSecretario", posInicial: 122, posFinal: 132, tipo: "DOCUMENTO", obrigatorio: true, origem: "declaração vigente.cpfSecretario", extrair: (f) => f.cpfSecretario },
  { nome: "atoAdministrativo", posInicial: 133, posFinal: 133, tipo: "NUMERICO", obrigatorio: true, origem: "§5.14 ← declaração.atoDeNomeacao", extrair: (f) => f.atoAdministrativo },
  { nome: "tipoNaturezaJuridica", posInicial: 134, posFinal: 134, tipo: "NUMERICO", obrigatorio: true, origem: "§5.26 ← declaração.naturezaJuridica", extrair: (f) => f.tipoNaturezaJuridica },
  { nome: "reservado", posInicial: 135, posFinal: 140, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];

export const LAYOUT_UNIDADE_ORCAMENTARIA: LayoutArquivo<UnidadeOrcamentariaFato> = {
  entidade: "UnidadeOrcamentaria",
  periodicidade: "MENSAL",
  versao: VERSAO,
  campos: camposUnidadeOrcamentaria,
};

/** §5.14 TipoAtoJuridico — de-para EXAUSTIVO do enum do domínio. */
export const DEPARA_ATO_JURIDICO_SAGRES: Readonly<Record<"LEI" | "DECRETO" | "PORTARIA" | "OUTROS", string>> = {
  LEI: "1",
  DECRETO: "2",
  PORTARIA: "3",
  OUTROS: "4",
};

/** §5.26 TipoNaturezaJuridica — de-para EXAUSTIVO do enum do domínio. */
export const DEPARA_NATUREZA_JURIDICA_SAGRES: Readonly<
  Record<
    | "CAMARA_MUNICIPAL"
    | "PREFEITURA_OU_SECRETARIA"
    | "AUTARQUIA"
    | "FUNDACAO"
    | "SOCIEDADE_DE_ECONOMIA_MISTA"
    | "FUNDO"
    | "EMPRESA_PUBLICA"
    | "AUTARQUIA_PREVIDENCIARIA"
    | "FUNDO_PREVIDENCIARIO",
    string
  >
> = {
  CAMARA_MUNICIPAL: "1",
  PREFEITURA_OU_SECRETARIA: "2",
  AUTARQUIA: "3",
  FUNDACAO: "4",
  SOCIEDADE_DE_ECONOMIA_MISTA: "5",
  FUNDO: "6",
  EMPRESA_PUBLICA: "7",
  AUTARQUIA_PREVIDENCIARIA: "8",
  FUNDO_PREVIDENCIARIO: "9",
};

// ═══ 4.13 ESTORNOPAGAMENTO (Diário) — V21 ═════════════════════════════════════════
// Origem: o Pagamento de ANULAÇÃO (inteira: `estornoDeId`; parcial: `anulacaoParcialDeId`) + o
// pagamento anulado (a parcela) + a cadeia até a ficha. `motivo` ← Pagamento.motivo (V21), gravado
// pela anulação — que já o exigia na tela e o descartava no serviço. Anulação sem motivo (as gravadas
// antes da V21) é RECUSADA nomeando: o campo é obrigatório e inventar um texto seria pior.
// `despesaLiquidada` = "S": neste modelo todo pagamento nasce de uma liquidação.

export interface EstornoPagamentoFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissaoEmpenho: number;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  /** O número da PARCELA estornada — o pagamento anulado. */
  readonly numPagamento: string;
  readonly data: Date;
  readonly motivo: string;
  readonly despesaLiquidada: string;
  readonly valor: Money;
  /** O número do estorno — o da própria linha de anulação. */
  readonly numero: string;
}

const camposEstornoPagamento: readonly CampoLayout<EstornoPagamentoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "anulado.liquidacao.empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "anulado.liquidacao.empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numPagamento", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "pagamento anulado.numero (parcela)", extrair: (f) => f.numPagamento },
  { nome: "data", posInicial: 30, posFinal: 37, tipo: "DATA", obrigatorio: true, origem: "anulação.data", extrair: (f) => f.data },
  { nome: "motivo", posInicial: 38, posFinal: 157, tipo: "ALFA", obrigatorio: true, origem: "Pagamento.motivo (V21)", extrair: (f) => f.motivo },
  { nome: "despesaLiquidada", posInicial: 158, posFinal: 158, tipo: "ALFA", obrigatorio: true, origem: "\"S\" (todo pagamento nasce de liquidação)", extrair: (f) => f.despesaLiquidada },
  { nome: "valor", posInicial: 159, posFinal: 174, tipo: "VALOR", obrigatorio: true, origem: "anulação.valor", extrair: (f) => f.valor },
  { nome: "numero", posInicial: 175, posFinal: 181, tipo: "NUMERICO", obrigatorio: true, origem: "anulação.numero", extrair: (f) => f.numero },
];

export const LAYOUT_ESTORNO_PAGAMENTO: LayoutArquivo<EstornoPagamentoFato> = {
  entidade: "EstornoPagamento",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposEstornoPagamento,
};

// ── ESTORNOS (§4.9, Diário, V23) — a anulação (inteira ou parcial) do EMPENHO. ─────────────────────
// Chave: UG + ano + UO + numEmpenho + numero. Todos os campos são obrigatórios no leiaute.
export interface EstornoEmpenhoFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissaoEmpenho: number;
  readonly codUnidadeOrcamentaria: string;
  /** O número do empenho ESTORNADO (o original). */
  readonly numEmpenho: string;
  /** O número do estorno — o da própria linha de anulação. */
  readonly numero: string;
  readonly data: Date;
  readonly valor: Money;
  readonly motivo: string;
  /** "S" ou "N": o empenho tinha liquidação viva na data do estorno (ver o gerador). */
  readonly despesaLiquidada: "S" | "N";
}

const camposEstornos: readonly CampoLayout<EstornoEmpenhoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "anulado.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "anulado.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "empenho anulado.numero", extrair: (f) => f.numEmpenho },
  { nome: "numero", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "anulação.numero", extrair: (f) => f.numero },
  { nome: "data", posInicial: 30, posFinal: 37, tipo: "DATA", obrigatorio: true, origem: "anulação.data", extrair: (f) => f.data },
  { nome: "valor", posInicial: 38, posFinal: 53, tipo: "VALOR", obrigatorio: true, origem: "anulação.valor", extrair: (f) => f.valor },
  { nome: "motivo", posInicial: 54, posFinal: 173, tipo: "ALFA", obrigatorio: true, origem: "anulação.historico (o motivo exigido na anulação, V23)", extrair: (f) => f.motivo },
  { nome: "despesaLiquidada", posInicial: 174, posFinal: 174, tipo: "ALFA", obrigatorio: true, origem: "liquidado líquido do empenho na data do estorno > 0", extrair: (f) => f.despesaLiquidada },
  { nome: "reservado", posInicial: 175, posFinal: 180, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];

export const LAYOUT_ESTORNOS: LayoutArquivo<EstornoEmpenhoFato> = {
  entidade: "Estornos",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposEstornos,
};

// ── ESTORNOLIQUIDACAO (§4.11, Diário, V23) — a anulação (inteira ou parcial) da LIQUIDAÇÃO. ────────
// Chave: UG + ano + UO + numEmpenho + numLiquidacao + numero. O leiaute v1.1 lista uma linha
// "reserva" SEM posição nem tamanho depois de `valor` (165-180): o registro termina em 180 e nenhuma
// posição é inventada para ela. Premissa a confirmar no validador oficial.
export interface EstornoLiquidacaoFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissaoEmpenho: number;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  /** O número da liquidação ESTORNADA (a original). */
  readonly numLiquidacao: string;
  /** O número do estorno — o da própria linha de anulação. */
  readonly numero: string;
  readonly data: Date;
  readonly motivo: string;
  readonly valor: Money;
}

const camposEstornoLiquidacao: readonly CampoLayout<EstornoLiquidacaoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numLiquidacao", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "liquidação anulada.numero", extrair: (f) => f.numLiquidacao },
  { nome: "numero", posInicial: 30, posFinal: 36, tipo: "NUMERICO", obrigatorio: true, origem: "anulação.numero", extrair: (f) => f.numero },
  { nome: "data", posInicial: 37, posFinal: 44, tipo: "DATA", obrigatorio: true, origem: "anulação.data", extrair: (f) => f.data },
  { nome: "motivo", posInicial: 45, posFinal: 164, tipo: "ALFA", obrigatorio: true, origem: "Liquidacao.motivo (V23)", extrair: (f) => f.motivo },
  { nome: "valor", posInicial: 165, posFinal: 180, tipo: "VALOR", obrigatorio: true, origem: "anulação.valor", extrair: (f) => f.valor },
];

export const LAYOUT_ESTORNO_LIQUIDACAO: LayoutArquivo<EstornoLiquidacaoFato> = {
  entidade: "EstornoLiquidacao",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposEstornoLiquidacao,
};

// ═══ 4.27 CONCILIACAOBANCARIA (Mensal) — V21 ═══════════════════════════════════════
// ⚠️ NÃO SÃO OS VÍNCULOS. O registro explica a diferença entre o saldo do BANCO e o da CONTABILIDADE
// no fim do mês: uma linha do saldo do extrato (§5.15 tipo 1) e uma por PENDÊNCIA (tipos 2 a 5). Os
// `VinculoConciliacao` são o que JÁ bateu — mandá-los seria o registro errado. Origem: o relatório
// derivado `conciliacaoBancaria` (M09), cuja identidade (diferença == Σ pendências) é a trava: conta
// que não fecha não sai. Conta/agência/banco: a tripla da S2, como em CadastroContaBancaria.
// `numero`: sequencial por conta, 1 = o saldo, depois as pendências por (data, id). Cheque e documento
// do débito: sem origem no relatório → zeros/espaços.

export interface ConciliacaoBancariaFato {
  readonly codUnidadeGestora: string;
  readonly numeroConta: string;
  readonly numeroAgencia: string;
  readonly banco: string;
  readonly numero: number;
  /** §5.15 — 1 saldo do extrato; 2/3/4/5 as pendências. */
  readonly tipoConciliacao: string;
  readonly descricao: string;
  readonly data: Date;
  /** Sempre positivo: o sentido está no tipo. */
  readonly valor: Money;
  readonly tipoContaBancaria: string;
  readonly cnpjGerencia: string;
}

const camposConciliacao: readonly CampoLayout<ConciliacaoBancariaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "numContaBancaria", posInicial: 7, posFinal: 19, tipo: "ALFA", obrigatorio: true, origem: "conta.conta+digito", extrair: (f) => f.numeroConta },
  { nome: "numAgencia", posInicial: 20, posFinal: 25, tipo: "ALFA", obrigatorio: true, origem: "conta.agencia+digito", extrair: (f) => f.numeroAgencia },
  { nome: "codBanco", posInicial: 26, posFinal: 28, tipo: "ALFA", obrigatorio: true, origem: "conta.banco", extrair: (f) => f.banco },
  { nome: "numero", posInicial: 29, posFinal: 36, tipo: "NUMERICO", obrigatorio: true, origem: "sequencial por conta (1 = saldo)", extrair: (f) => f.numero },
  { nome: "tipoConciliacao", posInicial: 37, posFinal: 37, tipo: "NUMERICO", obrigatorio: true, origem: "§5.15 pelo lado e o sentido da pendência", extrair: (f) => f.tipoConciliacao },
  { nome: "descricao", posInicial: 38, posFinal: 187, tipo: "ALFA", obrigatorio: true, origem: "descrição da linha do relatório", extrair: (f) => f.descricao },
  { nome: "data", posInicial: 188, posFinal: 195, tipo: "DATA", obrigatorio: true, origem: "corte do mês / data do fato pendente", extrair: (f) => f.data },
  { nome: "numCheque", posInicial: 196, posFinal: 201, tipo: "NUMERICO", obrigatorio: false, origem: "sem origem no relatório → zeros", extrair: () => null },
  { nome: "numDocDebito", posInicial: 202, posFinal: 212, tipo: "ALFA", obrigatorio: false, origem: "sem origem no relatório → espaços", extrair: () => null },
  { nome: "valor", posInicial: 213, posFinal: 228, tipo: "VALOR", obrigatorio: true, origem: "|saldo| ou |residual|", extrair: (f) => f.valor },
  { nome: "tipoContaBancaria", posInicial: 229, posFinal: 229, tipo: "NUMERICO", obrigatorio: true, origem: "§5.31 (default 1)", extrair: (f) => f.tipoContaBancaria },
  { nome: "cnpjGerenciaContaBancaria", posInicial: 230, posFinal: 243, tipo: "DOCUMENTO", obrigatorio: true, origem: "EnteConfig.cnpj", extrair: (f) => f.cnpjGerencia },
];

export const LAYOUT_CONCILIACAO_BANCARIA: LayoutArquivo<ConciliacaoBancariaFato> = {
  entidade: "ConciliacaoBancaria",
  periodicidade: "MENSAL",
  versao: VERSAO,
  campos: camposConciliacao,
};

/**
 * §5.15 — o TIPO pelo LADO em que a pendência está e pelo SENTIDO do residual. Puro, e exportado para o
 * teste conferir contra a tabela transcrita à mão do leiaute.
 *   extrato sem vínculo (o banco registrou, a contabilidade não): entrada → 4, saída → 3
 *   razão sem vínculo (a contabilidade registrou, o banco não):   entrada → 2, saída → 5
 */
export function tipoConciliacaoDe(lado: "EXTRATO" | "RAZAO", residual: Money): string {
  const entrada = residual.greaterThan(0);
  if (lado === "EXTRATO") return entrada ? "4" : "3";
  return entrada ? "2" : "5";
}

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

/** §5.23 TipoReceitaLancada — "1" = Lançamento de Receita; "3" = Dedução de Receita do Fundeb (V35: a dedução
 * realizada, `DeducaoDaReceitaRealizada`). Os tipos 4 e 5 não têm fato no sistema e não saem. */
export const TIPO_RECEITA_LANCAMENTO_NORMAL = "1";
export const TIPO_RECEITA_DEDUCAO_FUNDEB = "3";

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
  /** V35 — §5.23: "1" a receita; "3" a dedução do FUNDEB. Ausente = "1". */
  readonly tipoReceitaLancada?: "1" | "3";
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
  { nome: "tipoReceita", posInicial: 27, posFinal: 27, tipo: "NUMERICO", obrigatorio: true, origem: "§5.23 (1=Lançamento de Receita; 3=Dedução do Fundeb)", extrair: (f) => f.tipoReceitaLancada ?? TIPO_RECEITA_LANCAMENTO_NORMAL },
  { nome: "valor", posInicial: 28, posFinal: 43, tipo: "VALOR", obrigatorio: true, origem: "receita.valor", extrair: (f) => f.valor },
  { nome: "data", posInicial: 44, posFinal: 51, tipo: "DATA", obrigatorio: true, origem: "receita.dataArrecadacao", extrair: (f) => f.data },
  { nome: "co", posInicial: 52, posFinal: 55, tipo: "NUMERICO", obrigatorio: true, origem: "receita.co?.codigo", extrair: (f) => f.co },
  { nome: "numeroConta", posInicial: 56, posFinal: 68, tipo: "ALFA", obrigatorio: true, origem: "contaArrecadadora.conta+digito (param export)", extrair: (f) => f.numeroConta },
  { nome: "codBanco", posInicial: 69, posFinal: 71, tipo: "NUMERICO", obrigatorio: true, origem: "contaArrecadadora.banco (FEBRABAN)", extrair: (f) => f.codBanco },
  { nome: "numAgencia", posInicial: 72, posFinal: 77, tipo: "ALFA", obrigatorio: true, origem: "contaArrecadadora.agencia+digito", extrair: (f) => f.numeroAgencia },
  { nome: "tipoContaBancaria", posInicial: 78, posFinal: 78, tipo: "NUMERICO", obrigatorio: true, origem: "§5.31 (default 1)", extrair: (f) => f.tipoContaBancaria },
  { nome: "cnpjGerencia", posInicial: 79, posFinal: 92, tipo: "DOCUMENTO", obrigatorio: true, origem: "EnteConfig.cnpj", extrair: (f) => f.cnpjGerencia },
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
  /** V24 — CPF/CNPJ do beneficiário (mov.documentoDoFavorecido); nulo nos recolhimentos antigos. */
  readonly cpfCnpjFavorecido?: string | null;
  /** V24 — o CO da ficha que pagou a retenção recolhida (pelas alocações do recolhimento). */
  readonly co?: string | null;
  /** V23 — o vínculo com a ReceitaExtra, quando o plano do Tribunal exige; senão, espaços. */
  readonly receitaExtra?: { readonly codUnidadeGestora: string; readonly exercicio: number; readonly numero: string } | null;
}

const camposDespesaExtra: readonly CampoLayout<DespesaExtraFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "numero", posInicial: 7, posFinal: 13, tipo: "NUMERICO", obrigatorio: true, origem: "sequencial determinístico no exercício (data,id)", extrair: (f) => f.numero },
  { nome: "codContaContabil", posInicial: 14, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "partida DEBITO → ContaPcasp.codigo (sem pontos)", extrair: (f) => f.codContaContabil },
  { nome: "data", posInicial: 23, posFinal: 30, tipo: "DATA", obrigatorio: true, origem: "mov.data", extrair: (f) => f.data },
  // GAP 1 — o m07 guarda o consignatário como NOME, não documento. Sem origem → ZEROS (nomeado).
  { nome: "cpfCnpjFornecedor", posInicial: 31, posFinal: 44, tipo: "DOCUMENTO", obrigatorio: true, origem: "mov.documentoDoFavorecido (V24, exigido pela tela); nulo nos recolhimentos gravados antes → zeros", extrair: (f) => f.cpfCnpjFavorecido ?? null },
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
  { nome: "co", posInicial: 603, posFinal: 606, tipo: "NUMERICO", obrigatorio: true, origem: "ficha.co do pagamento que reteve, pelas alocações do recolhimento (V24); sem alocação → zeros", extrair: (f) => f.co ?? null },
  // V23 — o vínculo com a ReceitaExtra: preenchido quando a conta EXIGE no plano do Tribunal; senão
  // ESPAÇOS (ASCII 32), como o layout manda.
  { nome: "codUnidadeGestoraReceitaExtra", posInicial: 607, posFinal: 612, tipo: "ALFA", obrigatorio: false, origem: "vínculo ReceitaExtra (quando a conta exige) ou espaços", extrair: (f) => numeroOuEspacos(f.receitaExtra?.codUnidadeGestora ?? null, 6, "codUnidadeGestoraReceitaExtra") },
  { nome: "exercicioReceitaExtra", posInicial: 613, posFinal: 616, tipo: "ALFA", obrigatorio: false, origem: "vínculo ReceitaExtra ou espaços", extrair: (f) => numeroOuEspacos(f.receitaExtra?.exercicio ?? null, 4, "exercicioReceitaExtra") },
  { nome: "numReceitaExtra", posInicial: 617, posFinal: 623, tipo: "ALFA", obrigatorio: false, origem: "vínculo ReceitaExtra ou espaços", extrair: (f) => numeroOuEspacos(f.receitaExtra?.numero ?? null, 7, "numReceitaExtra") },
  { nome: "cnpjGerenciaContaBancaria", posInicial: 624, posFinal: 637, tipo: "DOCUMENTO", obrigatorio: true, origem: "EnteConfig.cnpj (parâmetro export)", extrair: (f) => f.cnpjGerencia },
];

export const LAYOUT_DESPESA_EXTRA: LayoutArquivo<DespesaExtraFato> = {
  entidade: "DespesaExtra",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposDespesaExtra,
};

// ── ESTORNORETENCAO (§4.15, Diário, V23) — a retenção desfeita junto com a anulação do pagamento. ──
// Chave: UG + ano + UO + numEmpenho + numPagamento + tipoRetencao + numero. O m07 não numera o
// movimento: o `numero` é DERIVADO no exercício (ver `numeracaoNoExercicio` no gerador).
export interface EstornoRetencaoFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissaoEmpenho: number;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  /** A parcela do pagamento de onde a retenção veio (o pagamento ANULADO). */
  readonly numPagamento: string;
  readonly tipoConsignacaoCodigo: string;
  readonly numero: string;
  readonly valor: Money;
}

const camposEstornoRetencao: readonly CampoLayout<EstornoRetencaoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "mov.pagamento.liquidacao.empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "mov.pagamento.liquidacao.empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numPagamento", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "mov.pagamento.numero (a parcela anulada)", extrair: (f) => f.numPagamento },
  { nome: "tipoRetencao", posInicial: 30, posFinal: 30, tipo: "NUMERICO", obrigatorio: true, origem: "mov.tipoConsignacao.codigo → §5.24 (o mesmo de-para da Retencao)", extrair: (f) => tipoRetencaoDe(f.tipoConsignacaoCodigo) },
  { nome: "numero", posInicial: 31, posFinal: 37, tipo: "NUMERICO", obrigatorio: true, origem: "derivado: ordem de gravação no exercício", extrair: (f) => f.numero },
  { nome: "valor", posInicial: 38, posFinal: 53, tipo: "VALOR", obrigatorio: true, origem: "mov.valor", extrair: (f) => f.valor },
  { nome: "reservado", posInicial: 54, posFinal: 59, tipo: "RESERVADO", obrigatorio: false, origem: "RESERVADO AO TCE = ZEROS" },
];

export const LAYOUT_ESTORNO_RETENCAO: LayoutArquivo<EstornoRetencaoFato> = {
  entidade: "EstornoRetencao",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposEstornoRetencao,
};

// ── ESTORNODESPESAEXTRA (§4.22, Diário, V23) — o estorno do dispêndio extraorçamentário. ─────────
// Chave: UG + numDespesaExtra + numero. `numDespesaExtra` é o MESMO número que a DespesaExtra deu ao
// dispêndio estornado (a mesma numeração derivada).
export interface EstornoDespesaExtraFato {
  readonly codUnidadeGestora: string;
  readonly numDespesaExtra: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: Money;
  readonly motivo: string;
}

const camposEstornoDespesaExtra: readonly CampoLayout<EstornoDespesaExtraFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "numDespesaExtra", posInicial: 7, posFinal: 13, tipo: "NUMERICO", obrigatorio: true, origem: "o número da DespesaExtra estornada (numeração derivada)", extrair: (f) => f.numDespesaExtra },
  { nome: "numero", posInicial: 14, posFinal: 20, tipo: "NUMERICO", obrigatorio: true, origem: "derivado: ordem de gravação no exercício", extrair: (f) => f.numero },
  { nome: "data", posInicial: 21, posFinal: 28, tipo: "DATA", obrigatorio: true, origem: "estorno.data", extrair: (f) => f.data },
  { nome: "valor", posInicial: 29, posFinal: 44, tipo: "VALOR", obrigatorio: true, origem: "estorno.valor", extrair: (f) => f.valor },
  { nome: "motivo", posInicial: 45, posFinal: 299, tipo: "ALFA", obrigatorio: true, origem: "MovimentoExtraorcamentario.motivo (conferido na entrada, V23)", extrair: (f) => f.motivo },
  { nome: "reservado", posInicial: 300, posFinal: 305, tipo: "RESERVADO", obrigatorio: false, origem: "RESERVADO = ZEROS" },
];

export const LAYOUT_ESTORNO_DESPESA_EXTRA: LayoutArquivo<EstornoDespesaExtraFato> = {
  entidade: "EstornoDespesaExtra",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposEstornoDespesaExtra,
};

// ── RECEITAEXTRA (§4.19, Diária, V23) — o INGRESSO extraorçamentário (retenção ou avulso). ──────────
// §5.8 CodigoReceitaExtra: 10000014 Consignações, 10000015 Débitos de Tesouraria, 10000016 Depósitos,
// 10000017 Outras Operações. O de-para segue o da DespesaExtra (§5.3): CAUCAO → Depósitos; os tipos de
// retenção/consignação → Consignações; tipo sem de-para da §5.24 FALHA NOMEANDO.
export const CODIGO_RECEITA_EXTRA_CONSIGNACOES = "10000014";
export const CODIGO_RECEITA_EXTRA_DEPOSITOS = "10000016";
export function codigoReceitaExtraDe(codigoTipoConsignacao: string): string {
  tipoRetencaoDe(codigoTipoConsignacao);
  return codigoTipoConsignacao === "CAUCAO" ? CODIGO_RECEITA_EXTRA_DEPOSITOS : CODIGO_RECEITA_EXTRA_CONSIGNACOES;
}

/**
 * Campo numérico que, quando o vínculo NÃO é exigido, sai em ESPAÇOS (ASCII 32) — o leiaute manda
 * (§4.19, §4.20). Declarado ALFA para o serializador; o valor, quando existe, vem já com zeros à
 * esquerda e só com dígitos — conferido aqui, nunca truncado.
 */
function numeroOuEspacos(valor: string | number | null, largura: number, campo: string): string | null {
  if (valor === null) return null;
  const s = String(valor);
  if (!/^\d+$/.test(s) || s.length > largura) {
    throw new Error(`SAGRES — o vínculo ${campo} tem "${s}", que não é número de até ${String(largura)} dígitos.`);
  }
  return s.padStart(largura, "0");
}

export interface VinculoComRetencao {
  readonly codUnidadeGestora: string;
  readonly codUnidadeOrcamentaria: string;
  readonly anoEmissaoEmpenho: number;
  readonly numEmpenho: string;
  readonly numPagamento: string;
  readonly tipoConsignacaoCodigo: string;
}

export interface ReceitaExtraFato {
  readonly codUnidadeGestora: string;
  readonly numero: string;
  readonly codContaContabil: string;
  readonly data: Date;
  readonly cpfCnpjContribuinte: string;
  readonly exercicioFonteRecurso: number;
  readonly codFonteRecursoExtra: string;
  readonly numeroConta: string;
  readonly numeroAgencia: string;
  readonly codBanco: string;
  readonly tipoContaBancaria: string;
  readonly valor: Money;
  readonly historico: string;
  readonly tipoConsignacaoCodigo: string;
  readonly exercicio: number;
  /** Só quando a conta EXIGE retenção no plano do Tribunal; senão, espaços. */
  readonly retencao: VinculoComRetencao | null;
  readonly cnpjGerencia: string;
}

const camposReceitaExtra: readonly CampoLayout<ReceitaExtraFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "numero", posInicial: 7, posFinal: 13, tipo: "NUMERICO", obrigatorio: true, origem: "derivado: ordem de gravação dos ingressos no exercício", extrair: (f) => f.numero },
  { nome: "codContaContabil", posInicial: 14, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "partida CRÉDITO patrimonial do passivo → ContaPcasp.codigo (sem pontos)", extrair: (f) => f.codContaContabil },
  { nome: "data", posInicial: 23, posFinal: 30, tipo: "DATA", obrigatorio: true, origem: "mov.data", extrair: (f) => f.data },
  { nome: "cpfCnpjFornecedor", posInicial: 31, posFinal: 44, tipo: "DOCUMENTO", obrigatorio: true, origem: "retenção: credor do empenho; avulso: mov.documentoDoContribuinte (V23)", extrair: (f) => f.cpfCnpjContribuinte },
  { nome: "exercicioFonteRecurso", posInicial: 45, posFinal: 45, tipo: "NUMERICO", obrigatorio: true, origem: "1 = Atual", extrair: (f) => f.exercicioFonteRecurso },
  { nome: "codFonteRecurso", posInicial: 46, posFinal: 48, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (860/861/862/869 — STN)", extrair: (f) => f.codFonteRecursoExtra },
  { nome: "numContaBancaria", posInicial: 49, posFinal: 61, tipo: "ALFA", obrigatorio: false, origem: "mov.contaBancaria.conta+digito", extrair: (f) => f.numeroConta },
  { nome: "numAgencia", posInicial: 62, posFinal: 67, tipo: "ALFA", obrigatorio: false, origem: "mov.contaBancaria.agencia+digito", extrair: (f) => f.numeroAgencia },
  { nome: "codBanco", posInicial: 68, posFinal: 70, tipo: "NUMERICO", obrigatorio: false, origem: "mov.contaBancaria.banco (FEBRABAN)", extrair: (f) => f.codBanco },
  { nome: "tipoContaBancaria", posInicial: 71, posFinal: 71, tipo: "NUMERICO", obrigatorio: false, origem: "§5.31 (1 = Conta Corrente)", extrair: (f) => f.tipoContaBancaria },
  { nome: "valor", posInicial: 72, posFinal: 87, tipo: "VALOR", obrigatorio: true, origem: "mov.valor", extrair: (f) => f.valor },
  { nome: "historico", posInicial: 88, posFinal: 587, tipo: "ALFA", obrigatorio: true, origem: "mov.historico", extrair: (f) => f.historico },
  { nome: "codReceitaExtra", posInicial: 588, posFinal: 595, tipo: "NUMERICO", obrigatorio: true, origem: "mov.tipoConsignacao.codigo → §5.8 (de-para)", extrair: (f) => codigoReceitaExtraDe(f.tipoConsignacaoCodigo) },
  { nome: "exercicio", posInicial: 596, posFinal: 599, tipo: "NUMERICO", obrigatorio: true, origem: "ano de mov.data", extrair: (f) => f.exercicio },
  { nome: "codUnidadeGestoraRetencao", posInicial: 600, posFinal: 605, tipo: "ALFA", obrigatorio: false, origem: "vínculo com a Retencao (quando a conta exige) ou espaços", extrair: (f) => numeroOuEspacos(f.retencao?.codUnidadeGestora ?? null, 6, "codUnidadeGestoraRetencao") },
  { nome: "codUnidadeOrcamentariaRetencao", posInicial: 606, posFinal: 610, tipo: "ALFA", obrigatorio: false, origem: "vínculo com a Retencao ou espaços", extrair: (f) => numeroOuEspacos(f.retencao?.codUnidadeOrcamentaria ?? null, 5, "codUnidadeOrcamentariaRetencao") },
  { nome: "anoEmissaoEmpenho", posInicial: 611, posFinal: 614, tipo: "ALFA", obrigatorio: false, origem: "vínculo com a Retencao ou espaços", extrair: (f) => numeroOuEspacos(f.retencao?.anoEmissaoEmpenho ?? null, 4, "anoEmissaoEmpenho") },
  { nome: "numEmpenho", posInicial: 615, posFinal: 621, tipo: "ALFA", obrigatorio: false, origem: "vínculo com a Retencao ou espaços", extrair: (f) => numeroOuEspacos(f.retencao?.numEmpenho ?? null, 7, "numEmpenho") },
  { nome: "numPagamento", posInicial: 622, posFinal: 628, tipo: "ALFA", obrigatorio: false, origem: "vínculo com a Retencao ou espaços", extrair: (f) => numeroOuEspacos(f.retencao?.numPagamento ?? null, 7, "numPagamento") },
  { nome: "tipoRetencao", posInicial: 629, posFinal: 629, tipo: "ALFA", obrigatorio: false, origem: "vínculo com a Retencao (§5.24) ou espaços", extrair: (f) => (f.retencao === null ? null : tipoRetencaoDe(f.retencao.tipoConsignacaoCodigo)) },
  { nome: "cnpjGerenciaContaBancaria", posInicial: 630, posFinal: 643, tipo: "DOCUMENTO", obrigatorio: true, origem: "EnteConfig.cnpj (parâmetro export)", extrair: (f) => f.cnpjGerencia },
];

export const LAYOUT_RECEITA_EXTRA: LayoutArquivo<ReceitaExtraFato> = {
  entidade: "ReceitaExtra",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposReceitaExtra,
};

// ── ESTORNORECEITAEXTRA (§4.21, Diária, V23) — o ESTORNO_INGRESSO. ─────────────────────────────
export interface EstornoReceitaExtraFato {
  readonly codUnidadeGestora: string;
  readonly numReceitaExtra: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: Money;
  readonly motivo: string;
}

const camposEstornoReceitaExtra: readonly CampoLayout<EstornoReceitaExtraFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "numReceitaExtra", posInicial: 7, posFinal: 13, tipo: "NUMERICO", obrigatorio: true, origem: "o número da ReceitaExtra estornada (numeração derivada)", extrair: (f) => f.numReceitaExtra },
  { nome: "numero", posInicial: 14, posFinal: 20, tipo: "NUMERICO", obrigatorio: true, origem: "derivado: ordem de gravação no exercício", extrair: (f) => f.numero },
  { nome: "data", posInicial: 21, posFinal: 28, tipo: "DATA", obrigatorio: true, origem: "estorno.data", extrair: (f) => f.data },
  { nome: "valor", posInicial: 29, posFinal: 44, tipo: "VALOR", obrigatorio: true, origem: "estorno.valor", extrair: (f) => f.valor },
  { nome: "motivo", posInicial: 45, posFinal: 299, tipo: "ALFA", obrigatorio: true, origem: "MovimentoExtraorcamentario.motivo", extrair: (f) => f.motivo },
  { nome: "reservado", posInicial: 300, posFinal: 305, tipo: "RESERVADO", obrigatorio: false, origem: "RESERVADO = ZEROS" },
];

export const LAYOUT_ESTORNO_RECEITA_EXTRA: LayoutArquivo<EstornoReceitaExtraFato> = {
  entidade: "EstornoReceitaExtra",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposEstornoReceitaExtra,
};

/** Todos os layouts desta versão, para a auto-validação em lote e a matriz. */
// ═══ V24 — O GRUPO DOS RESTOS A PAGAR (§4.28 a §4.34) e os RESTOS INSCRITOS (§4.40) ═══════════════════
// Origem: o M08 (inscrição e movimentos de RP) e os registros do M05/M07 que ele cria — o pagamento de
// restos é um `Pagamento` ligado a um `MovimentoRestosAPagar`, e a liquidação de RP não processado é uma
// `Liquidacao` de empenho de exercício anterior. Esses registros saem AQUI, e não nos arquivos do exercício.
// `codUnidadeGestoraOrigem`: a UG do empenho que inscreveu o resto — nesta instalação, a própria UG.

/** §4.28 exercicioFonteRecurso: "em geral deve ser igual a 2" (anterior) nos pagamentos de restos. */
export const EXERCICIO_FONTE_ANTERIOR = 2;
const TIPO_CONTA_CORRENTE_RESTOS = "1";

export interface PagamentoRestosFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissaoEmpenho: number;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: Money;
  readonly numeroContaDebito: string;
  readonly numeroAgenciaDebito: string;
  readonly codBancoDebito: string;
  readonly codFonteRecurso: string;
  readonly co: string | null;
  readonly cnpjGerencia: string;
}
const camposPagamentoRestos: readonly CampoLayout<PagamentoRestosFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numero", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "pagamento.numero (parcela)", extrair: (f) => f.numero },
  { nome: "data", posInicial: 30, posFinal: 37, tipo: "DATA", obrigatorio: true, origem: "pagamento.data", extrair: (f) => f.data },
  { nome: "valor", posInicial: 38, posFinal: 53, tipo: "VALOR", obrigatorio: true, origem: "pagamento.valor", extrair: (f) => f.valor },
  { nome: "numContaBancaria", posInicial: 54, posFinal: 66, tipo: "ALFA", obrigatorio: true, origem: "contaPagadora.conta+digito", extrair: (f) => f.numeroContaDebito },
  { nome: "numAgencia", posInicial: 67, posFinal: 72, tipo: "ALFA", obrigatorio: true, origem: "contaPagadora.agencia+digito", extrair: (f) => f.numeroAgenciaDebito },
  { nome: "codBanco", posInicial: 73, posFinal: 75, tipo: "ALFA", obrigatorio: true, origem: "contaPagadora.banco", extrair: (f) => f.codBancoDebito },
  { nome: "numCheque", posInicial: 76, posFinal: 81, tipo: "ALFA", obrigatorio: false, origem: "sem origem no modelo → espaços", extrair: () => null },
  { nome: "numDocDebito", posInicial: 82, posFinal: 92, tipo: "ALFA", obrigatorio: false, origem: "sem origem no modelo → espaços", extrair: () => null },
  { nome: "codBancoCred", posInicial: 93, posFinal: 95, tipo: "ALFA", obrigatorio: false, origem: "sem origem no modelo → espaços", extrair: () => null },
  { nome: "numAgenciaCred", posInicial: 96, posFinal: 101, tipo: "ALFA", obrigatorio: false, origem: "sem origem no modelo → espaços", extrair: () => null },
  { nome: "numContaBancariaCred", posInicial: 102, posFinal: 114, tipo: "ALFA", obrigatorio: false, origem: "sem origem no modelo → espaços", extrair: () => null },
  { nome: "exercicioFonteRecurso", posInicial: 115, posFinal: 115, tipo: "NUMERICO", obrigatorio: true, origem: "2 = Anterior (§4.28: em geral deve ser igual a 2)", extrair: () => EXERCICIO_FONTE_ANTERIOR },
  { nome: "codFonteRecurso", posInicial: 116, posFinal: 118, tipo: "NUMERICO", obrigatorio: true, origem: "pagamento.fonte.codigo", extrair: (f) => f.codFonteRecurso },
  { nome: "tipoContaBancaria", posInicial: 119, posFinal: 119, tipo: "NUMERICO", obrigatorio: true, origem: "§5.31 (default 1)", extrair: () => TIPO_CONTA_CORRENTE_RESTOS },
  { nome: "co", posInicial: 120, posFinal: 123, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.co (nulo → zeros)", extrair: (f) => f.co },
  { nome: "cnpjGerenciaContaBancaria", posInicial: 124, posFinal: 137, tipo: "DOCUMENTO", obrigatorio: true, origem: "EnteConfig.cnpj", extrair: (f) => f.cnpjGerencia },
  { nome: "codUnidadeGestoraOrigem", posInicial: 138, posFinal: 143, tipo: "NUMERICO", obrigatorio: true, origem: "a UG do empenho inscrito (a própria)", extrair: (f) => f.codUnidadeGestora },
];
export const LAYOUT_PAGAMENTOS_RESTOS: LayoutArquivo<PagamentoRestosFato> = { entidade: "PagamentosRestos", periodicidade: "DIARIO", versao: VERSAO, campos: camposPagamentoRestos };

export interface EstornoPagamentoRestosFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissaoEmpenho: number;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  readonly numPagamento: string;
  readonly numero: string;
  readonly data: Date;
  readonly motivo: string;
  readonly valor: Money;
}
const camposEstornoPagamentoRestos: readonly CampoLayout<EstornoPagamentoRestosFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numPagamento", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "o pagamento de restos estornado", extrair: (f) => f.numPagamento },
  { nome: "numero", posInicial: 30, posFinal: 36, tipo: "NUMERICO", obrigatorio: true, origem: "o pagamento de estorno.numero", extrair: (f) => f.numero },
  { nome: "data", posInicial: 37, posFinal: 44, tipo: "DATA", obrigatorio: true, origem: "estorno.data", extrair: (f) => f.data },
  { nome: "motivo", posInicial: 45, posFinal: 164, tipo: "ALFA", obrigatorio: true, origem: "MovimentoRestosAPagar.motivo", extrair: (f) => f.motivo },
  { nome: "despesaLiquidada", posInicial: 165, posFinal: 165, tipo: "ALFA", obrigatorio: true, origem: "S: só se paga resto liquidado", extrair: () => "S" },
  { nome: "valor", posInicial: 166, posFinal: 181, tipo: "VALOR", obrigatorio: true, origem: "estorno.valor", extrair: (f) => f.valor },
  { nome: "codUnidadeGestoraOrigem", posInicial: 182, posFinal: 187, tipo: "NUMERICO", obrigatorio: true, origem: "a UG do empenho inscrito (a própria)", extrair: (f) => f.codUnidadeGestora },
];
export const LAYOUT_ESTORNO_PAGAMENTO_RESTOS: LayoutArquivo<EstornoPagamentoRestosFato> = { entidade: "EstornoPagamentoRestos", periodicidade: "DIARIO", versao: VERSAO, campos: camposEstornoPagamentoRestos };

export interface CancelamentoRestosFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissaoEmpenho: number;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: Money;
  readonly motivo: string;
  /** PROCESSADO → S; NÃO PROCESSADO → N (cancela-se o saldo ainda não liquidado). */
  readonly despesaLiquidada: "S" | "N";
}
const camposCancelamentoRestos: readonly CampoLayout<CancelamentoRestosFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numero", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "derivado: ordem de gravação no exercício", extrair: (f) => f.numero },
  { nome: "data", posInicial: 30, posFinal: 37, tipo: "DATA", obrigatorio: true, origem: "lancamento.dataTransacao do cancelamento", extrair: (f) => f.data },
  { nome: "valor", posInicial: 38, posFinal: 53, tipo: "VALOR", obrigatorio: true, origem: "MovimentoRestosAPagar.valor", extrair: (f) => f.valor },
  { nome: "motivo", posInicial: 54, posFinal: 173, tipo: "ALFA", obrigatorio: true, origem: "MovimentoRestosAPagar.motivo", extrair: (f) => f.motivo },
  { nome: "despesaLiquidada", posInicial: 174, posFinal: 174, tipo: "ALFA", obrigatorio: true, origem: "inscrição PROCESSADO → S; NAO_PROCESSADO → N", extrair: (f) => f.despesaLiquidada },
  { nome: "codUnidadeGestoraOrigem", posInicial: 175, posFinal: 180, tipo: "NUMERICO", obrigatorio: true, origem: "a UG do empenho inscrito (a própria)", extrair: (f) => f.codUnidadeGestora },
];
export const LAYOUT_CANCELAMENTO_RESTOS: LayoutArquivo<CancelamentoRestosFato> = { entidade: "CancelamentoRestos", periodicidade: "DIARIO", versao: VERSAO, campos: camposCancelamentoRestos };

export interface LiquidacaoRestosFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissaoEmpenho: number;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  readonly numero: string;
  readonly data: Date;
  readonly notaFiscal: { readonly tipo: string; readonly chave: string; readonly numero: string; readonly serie: string; readonly data: Date; readonly valor: Money } | null;
  readonly valor: Money;
}
const camposLiquidacaoRestos: readonly CampoLayout<LiquidacaoRestosFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numero", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "liquidacao.numero", extrair: (f) => f.numero },
  { nome: "data", posInicial: 30, posFinal: 37, tipo: "DATA", obrigatorio: true, origem: "liquidacao.data", extrair: (f) => f.data },
  { nome: "tipoNotaFiscal", posInicial: 38, posFinal: 39, tipo: "NUMERICO", obrigatorio: false, origem: "02 (NF-e) quando há chave", extrair: (f) => f.notaFiscal?.tipo ?? null },
  { nome: "numChaveNotaFiscal", posInicial: 40, posFinal: 83, tipo: "NUMERICO", obrigatorio: false, origem: "liquidacao.notaFiscalChave", extrair: (f) => f.notaFiscal?.chave ?? null },
  { nome: "numNotaFiscal", posInicial: 84, posFinal: 98, tipo: "ALFA", obrigatorio: false, origem: "liquidacao.notaFiscalNum", extrair: (f) => f.notaFiscal?.numero ?? null },
  { nome: "serieNotaFiscal", posInicial: 99, posFinal: 110, tipo: "ALFA", obrigatorio: false, origem: "liquidacao.notaFiscalSerie", extrair: (f) => f.notaFiscal?.serie ?? null },
  { nome: "dataNotaFiscal", posInicial: 111, posFinal: 118, tipo: "DATA", obrigatorio: false, origem: "liquidacao.notaFiscalData", extrair: (f) => f.notaFiscal?.data ?? null },
  { nome: "valorNotaFiscal", posInicial: 119, posFinal: 134, tipo: "VALOR", obrigatorio: false, origem: "liquidacao.notaFiscalValor", extrair: (f) => f.notaFiscal?.valor ?? null },
  { nome: "valor", posInicial: 135, posFinal: 150, tipo: "VALOR", obrigatorio: true, origem: "liquidacao.valor", extrair: (f) => f.valor },
  { nome: "codUnidadeGestoraOrigem", posInicial: 151, posFinal: 156, tipo: "NUMERICO", obrigatorio: true, origem: "a UG do empenho inscrito (a própria)", extrair: (f) => f.codUnidadeGestora },
];
export const LAYOUT_LIQUIDACAO_RESTOS: LayoutArquivo<LiquidacaoRestosFato> = { entidade: "LiquidacaoRestos", periodicidade: "DIARIO", versao: VERSAO, campos: camposLiquidacaoRestos };

export interface EstornoLiquidacaoRestosFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissaoEmpenho: number;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  readonly numLiquidacao: string;
  readonly numero: string;
  readonly data: Date;
  readonly motivo: string;
  readonly valor: Money;
}
const camposEstornoLiquidacaoRestos: readonly CampoLayout<EstornoLiquidacaoRestosFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numLiquidacao", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "a liquidação de restos anulada", extrair: (f) => f.numLiquidacao },
  { nome: "numero", posInicial: 30, posFinal: 36, tipo: "NUMERICO", obrigatorio: true, origem: "anulação.numero", extrair: (f) => f.numero },
  { nome: "data", posInicial: 37, posFinal: 44, tipo: "DATA", obrigatorio: true, origem: "anulação.data", extrair: (f) => f.data },
  { nome: "motivo", posInicial: 45, posFinal: 164, tipo: "ALFA", obrigatorio: true, origem: "Liquidacao.motivo (V23)", extrair: (f) => f.motivo },
  { nome: "valor", posInicial: 165, posFinal: 180, tipo: "VALOR", obrigatorio: true, origem: "anulação.valor", extrair: (f) => f.valor },
  { nome: "reservado", posInicial: 181, posFinal: 186, tipo: "RESERVADO", obrigatorio: false, origem: "RESERVADO AO TCE = ZEROS" },
];
export const LAYOUT_ESTORNO_LIQUIDACAO_RESTOS: LayoutArquivo<EstornoLiquidacaoRestosFato> = { entidade: "EstornoLiquidacaoRestos", periodicidade: "DIARIO", versao: VERSAO, campos: camposEstornoLiquidacaoRestos };

export interface RetencaoRestosFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissaoEmpenho: number;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  readonly numPagamento: string;
  readonly valor: Money;
  readonly tipoConsignacaoCodigo: string;
}
const camposRetencaoRestos: readonly CampoLayout<RetencaoRestosFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numPagamento", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "o pagamento de restos (parcela)", extrair: (f) => f.numPagamento },
  { nome: "valor", posInicial: 30, posFinal: 45, tipo: "VALOR", obrigatorio: true, origem: "mov.valor", extrair: (f) => f.valor },
  { nome: "tipoRetencao", posInicial: 46, posFinal: 46, tipo: "NUMERICO", obrigatorio: true, origem: "mov.tipoConsignacao.codigo → §5.24 (de-para)", extrair: (f) => tipoRetencaoDe(f.tipoConsignacaoCodigo) },
  { nome: "codUnidadeGestoraOrigem", posInicial: 47, posFinal: 52, tipo: "NUMERICO", obrigatorio: true, origem: "a UG do empenho inscrito (a própria)", extrair: (f) => f.codUnidadeGestora },
];
export const LAYOUT_RETENCAO_RESTOS: LayoutArquivo<RetencaoRestosFato> = { entidade: "RetencaoRestos", periodicidade: "DIARIO", versao: VERSAO, campos: camposRetencaoRestos };

export interface EstornoRetencaoRestosFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissaoEmpenho: number;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  readonly numPagamento: string;
  readonly tipoConsignacaoCodigo: string;
  readonly numero: string;
  readonly data: Date;
  readonly motivo: string;
  readonly valor: Money;
}
const camposEstornoRetencaoRestos: readonly CampoLayout<EstornoRetencaoRestosFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numPagamento", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "o pagamento de restos de origem", extrair: (f) => f.numPagamento },
  { nome: "tipoRetencao", posInicial: 30, posFinal: 30, tipo: "NUMERICO", obrigatorio: true, origem: "mov.tipoConsignacao.codigo → §5.24 (de-para)", extrair: (f) => tipoRetencaoDe(f.tipoConsignacaoCodigo) },
  { nome: "numero", posInicial: 31, posFinal: 37, tipo: "NUMERICO", obrigatorio: true, origem: "derivado: ordem de gravação no exercício", extrair: (f) => f.numero },
  { nome: "data", posInicial: 38, posFinal: 45, tipo: "DATA", obrigatorio: true, origem: "estorno.data", extrair: (f) => f.data },
  { nome: "motivo", posInicial: 46, posFinal: 165, tipo: "ALFA", obrigatorio: true, origem: "o motivo da anulação do pagamento de restos", extrair: (f) => f.motivo },
  { nome: "valor", posInicial: 166, posFinal: 181, tipo: "VALOR", obrigatorio: true, origem: "estorno.valor", extrair: (f) => f.valor },
  { nome: "codUnidadeGestoraOrigem", posInicial: 182, posFinal: 187, tipo: "NUMERICO", obrigatorio: true, origem: "a UG do empenho inscrito (a própria)", extrair: (f) => f.codUnidadeGestora },
];
export const LAYOUT_ESTORNO_RETENCAO_RESTOS: LayoutArquivo<EstornoRetencaoRestosFato> = { entidade: "EstornoRetencaoRestos", periodicidade: "DIARIO", versao: VERSAO, campos: camposEstornoRetencaoRestos };

export interface RestosInscritosFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissaoEmpenho: number;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  readonly valorInscrito: Money;
  readonly valorProcessado: Money;
  readonly valorNaoProcessado: Money;
}
const camposRestosInscritos: readonly CampoLayout<RestosInscritosFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissaoEmpenho", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "ALFA", obrigatorio: true, origem: "empenho.numero (Caractere 7 no leiaute)", extrair: (f) => f.numEmpenho },
  { nome: "codUnidadeGestoraOrigem", posInicial: 23, posFinal: 28, tipo: "NUMERICO", obrigatorio: true, origem: "a UG do empenho (a própria)", extrair: (f) => f.codUnidadeGestora },
  { nome: "valorInscrito", posInicial: 29, posFinal: 44, tipo: "VALOR", obrigatorio: true, origem: "Σ InscricaoRestosAPagar.valorInscrito do empenho", extrair: (f) => f.valorInscrito },
  { nome: "valorProcessado", posInicial: 45, posFinal: 60, tipo: "VALOR", obrigatorio: true, origem: "inscrição PROCESSADO", extrair: (f) => f.valorProcessado },
  { nome: "valorNaoProcessado", posInicial: 61, posFinal: 76, tipo: "VALOR", obrigatorio: true, origem: "inscrição NAO_PROCESSADO", extrair: (f) => f.valorNaoProcessado },
];
export const LAYOUT_RESTOS_INSCRITOS: LayoutArquivo<RestosInscritosFato> = { entidade: "RestosInscritos", periodicidade: "MENSAL", versao: VERSAO, campos: camposRestosInscritos };

// ═══ V25 — RELACIONAMENTOS E FORNECEDORES (§4.24, §4.35, §4.37, §4.46, §4.58) ═══
//
// ⚠️ O NÚMERO DO EMPENHO E O DA OBRA SAEM NUMÉRICOS mesmo onde a tabela os grafa "Caractere (7)" e
// "Caractere (8)" (§4.37 e §4.46): são CHAVES que apontam para o Empenhos (§4.8), onde os dois são
// "Numérico". Preencher com espaço num arquivo e com zero no outro quebraria a referência que a tabela
// de relacionamento existe para fazer. As posições são as do leiaute, conferidas contra o HTML oficial
// por `m15-relacionamentos.test.ts`.

/** §5.16 TipoCredor: 1 Pessoa Física, 2 Pessoa Jurídica. */
export const TIPO_CREDOR_SAGRES: Record<"FISICA" | "JURIDICA", string> = { FISICA: "1", JURIDICA: "2" };

export interface RelacionamentoContaFonteFato {
  readonly codUnidadeGestora: string;
  readonly numeroConta: string;
  readonly numeroAgencia: string;
  readonly banco: string;
  readonly exercicioFonteRecurso: number;
  readonly codFonteRecurso: string;
  readonly tipo: string;
  readonly cnpjGerencia: string;
}
const camposRelacionamentoContaFonte: readonly CampoLayout<RelacionamentoContaFonteFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "numContaBancaria", posInicial: 7, posFinal: 19, tipo: "ALFA", obrigatorio: true, origem: "conta.conta + conta.digitoConta", extrair: (f) => f.numeroConta },
  { nome: "numAgencia", posInicial: 20, posFinal: 25, tipo: "ALFA", obrigatorio: true, origem: "conta.agencia + conta.digitoAgencia", extrair: (f) => f.numeroAgencia },
  { nome: "codBanco", posInicial: 26, posFinal: 28, tipo: "ALFA", obrigatorio: true, origem: "conta.banco", extrair: (f) => f.banco },
  { nome: "exercicioFonteRecurso", posInicial: 29, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "fonte.exercicioPadrao (1 atual, 2 anterior)", extrair: (f) => f.exercicioFonteRecurso },
  { nome: "codFonteRecurso", posInicial: 30, posFinal: 32, tipo: "NUMERICO", obrigatorio: true, origem: "o rol de fontes da conta (FonteDaContaBancaria)", extrair: (f) => f.codFonteRecurso },
  { nome: "tipoContaBancaria", posInicial: 33, posFinal: 33, tipo: "NUMERICO", obrigatorio: true, origem: "1 = conta corrente (como no CadastroContaBancaria)", extrair: (f) => f.tipo },
  { nome: "cnpjGerenciaContaBancaria", posInicial: 34, posFinal: 47, tipo: "DOCUMENTO", obrigatorio: true, origem: "parâmetro export (CNPJ gerenciador)", extrair: (f) => f.cnpjGerencia },
];
export const LAYOUT_RELACIONAMENTO_CONTA_FONTE: LayoutArquivo<RelacionamentoContaFonteFato> = { entidade: "RelacionamentoCCorrenteFontePagadora", periodicidade: "DIARIO", versao: VERSAO, campos: camposRelacionamentoContaFonte };

export interface FornecedorFato {
  readonly codUnidadeGestora: string;
  readonly cpfCnpj: string;
  readonly nome: string;
  readonly tipoCredor: "FISICA" | "JURIDICA";
}
const camposFornecedores: readonly CampoLayout<FornecedorFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "cpfCnpj", posInicial: 7, posFinal: 20, tipo: "DOCUMENTO", obrigatorio: true, origem: "pessoa.documento (credor do empenho)", extrair: (f) => f.cpfCnpj },
  { nome: "nome", posInicial: 21, posFinal: 100, tipo: "ALFA", obrigatorio: true, origem: "o nome da versão vigente da pessoa", extrair: (f) => f.nome },
  { nome: "tipoCredor", posInicial: 101, posFinal: 101, tipo: "NUMERICO", obrigatorio: true, origem: "pessoa.tipo → §5.16", extrair: (f) => TIPO_CREDOR_SAGRES[f.tipoCredor] },
  { nome: "reservado", posInicial: 102, posFinal: 107, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];
export const LAYOUT_FORNECEDORES: LayoutArquivo<FornecedorFato> = { entidade: "Fornecedores", periodicidade: "DIARIO", versao: VERSAO, campos: camposFornecedores };

export interface RelacionamentoEmpenhoObraFato {
  readonly codUnidadeGestora: string;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  readonly codUnidadeGestoraObra: string;
  readonly numObra: string;
  readonly anoEmpenho: number;
}
const camposRelacionamentoEmpenhoObra: readonly CampoLayout<RelacionamentoEmpenhoObraFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codUnidadeOrcamentaria", posInicial: 7, posFinal: 11, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 12, posFinal: 18, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero (chave do Empenhos §4.8, numérico lá)", extrair: (f) => f.numEmpenho },
  { nome: "codUnidadeGestoraObra", posInicial: 19, posFinal: 24, tipo: "NUMERICO", obrigatorio: true, origem: "a própria UG (o sistema não registra obra de outra UG)", extrair: (f) => f.codUnidadeGestoraObra },
  { nome: "numObra", posInicial: 25, posFinal: 32, tipo: "NUMERICO", obrigatorio: true, origem: "obra.identificador (NNNNAAAA do GeoPB)", extrair: (f) => f.numObra },
  { nome: "anoEmpenho", posInicial: 33, posFinal: 36, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmpenho },
];
export const LAYOUT_RELACIONAMENTO_EMPENHO_OBRA: LayoutArquivo<RelacionamentoEmpenhoObraFato> = { entidade: "RelacionamentoEmpenhoObra", periodicidade: "MENSAL", versao: VERSAO, campos: camposRelacionamentoEmpenhoObra };

export interface RelacionamentoEmpenhoNaturezaFato {
  readonly codUnidadeGestora: string;
  readonly codUnidadeOrcamentaria: string;
  readonly anoEmissaoEmpenho: number;
  readonly numEmpenho: string;
  readonly naturezaContratacao: "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS";
}
const camposRelacionamentoEmpenhoNatureza: readonly CampoLayout<RelacionamentoEmpenhoNaturezaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codUnidadeOrcamentaria", posInicial: 7, posFinal: 11, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "anoEmissaoEmpenho", posInicial: 12, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissaoEmpenho },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero (chave do Empenhos §4.8, numérico lá)", extrair: (f) => f.numEmpenho },
  { nome: "NaturezaContratacao", posInicial: 23, posFinal: 23, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.categoriaOrdemCronologica → §5.19", extrair: (f) => NATUREZA_CONTRATACAO_SAGRES[f.naturezaContratacao] },
];
export const LAYOUT_RELACIONAMENTO_EMPENHO_NATUREZA: LayoutArquivo<RelacionamentoEmpenhoNaturezaFato> = { entidade: "RelacionamentoEmpenhoNaturezaContratacao", periodicidade: "MENSAL", versao: VERSAO, campos: camposRelacionamentoEmpenhoNatureza };

export interface RelacionamentoLiquidacaoPagamentoFato {
  readonly codUnidadeGestora: string;
  readonly anoEmissao: number;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  readonly numLiquidacao: string;
  readonly numPagamento: string;
}
const camposRelacionamentoLiquidacaoPagamento: readonly CampoLayout<RelacionamentoLiquidacaoPagamentoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "anoEmissao", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.exercicio", extrair: (f) => f.anoEmissao },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 16, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero", extrair: (f) => f.numEmpenho },
  { nome: "numLiquidacao", posInicial: 23, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "liquidacao.numero", extrair: (f) => f.numLiquidacao },
  { nome: "numPagamento", posInicial: 30, posFinal: 36, tipo: "NUMERICO", obrigatorio: true, origem: "pagamento.numero (parcela)", extrair: (f) => f.numPagamento },
];
export const LAYOUT_RELACIONAMENTO_LIQUIDACAO_PAGAMENTO: LayoutArquivo<RelacionamentoLiquidacaoPagamentoFato> = { entidade: "RelacionamentoLiquidacaoPagamento", periodicidade: "MENSAL", versao: VERSAO, campos: camposRelacionamentoLiquidacaoPagamento };

// ═══ V26 — O CADASTRO DO ORÇAMENTO: programas (§4.2) e ações (§4.3) ════════════════════════════════
export interface ProgramaFato {
  readonly codUnidadeGestora: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly descObjetivo: string;
  readonly tipoObjetivoMilenio: string;
}
const camposProgramas: readonly CampoLayout<ProgramaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codigo", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "programa.codigo", extrair: (f) => f.codigo },
  { nome: "descricao", posInicial: 11, posFinal: 80, tipo: "ALFA", obrigatorio: true, origem: "DeclaracaoDoPrograma.descricao (vigente no mês)", extrair: (f) => f.descricao },
  { nome: "descObjetivo", posInicial: 81, posFinal: 230, tipo: "ALFA", obrigatorio: true, origem: "DeclaracaoDoPrograma.objetivo", extrair: (f) => f.descObjetivo },
  { nome: "tipoObjetivoMilenio", posInicial: 231, posFinal: 232, tipo: "NUMERICO", obrigatorio: true, origem: "DeclaracaoDoPrograma.tipoObjetivoMilenio (§5.27)", extrair: (f) => f.tipoObjetivoMilenio },
  { nome: "reservado", posInicial: 233, posFinal: 238, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];
export const LAYOUT_PROGRAMAS: LayoutArquivo<ProgramaFato> = { entidade: "Programas", periodicidade: "MENSAL", versao: VERSAO, campos: camposProgramas };

export interface AcaoFato {
  readonly codUnidadeGestora: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly tipo: string;
  readonly descMeta: string | null;
  readonly unidadeMedida: string | null;
}
const camposAcao: readonly CampoLayout<AcaoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codigo", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "acao.codigo", extrair: (f) => f.codigo },
  { nome: "descricao", posInicial: 11, posFinal: 80, tipo: "ALFA", obrigatorio: true, origem: "DeclaracaoDaAcao.descricao (vigente no mês)", extrair: (f) => f.descricao },
  { nome: "tipo", posInicial: 81, posFinal: 81, tipo: "NUMERICO", obrigatorio: true, origem: "acao.tipo → §5.12", extrair: (f) => f.tipo },
  { nome: "descMeta", posInicial: 82, posFinal: 231, tipo: "ALFA", obrigatorio: false, origem: "DeclaracaoDaAcao.descMeta", extrair: (f) => f.descMeta },
  { nome: "unidadeMedida", posInicial: 232, posFinal: 281, tipo: "ALFA", obrigatorio: false, origem: "DeclaracaoDaAcao.unidadeMedida", extrair: (f) => f.unidadeMedida },
  { nome: "reservado", posInicial: 282, posFinal: 287, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];
export const LAYOUT_ACAO: LayoutArquivo<AcaoFato> = { entidade: "Acao", periodicidade: "MENSAL", versao: VERSAO, campos: camposAcao };

// ═══ V26 — Ordenador (§4.36) e ResponsavelSiafic (§4.48) ════════════════════════════════════════════
export interface OrdenadorFato {
  readonly codUnidadeGestora: string;
  readonly cpf: string;
  readonly nome: string;
}
const camposOrdenador: readonly CampoLayout<OrdenadorFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "cpf", posInicial: 7, posFinal: 17, tipo: "DOCUMENTO", obrigatorio: true, origem: "DesignacaoDeOrdenador.cpf", extrair: (f) => f.cpf },
  // ⚠️ O HTML oficial tipifica o nome como "Numérico (50)"; é texto (a descrição é "Nome do Ordenador").
  { nome: "nome", posInicial: 18, posFinal: 67, tipo: "ALFA", obrigatorio: true, origem: "DesignacaoDeOrdenador.nome", extrair: (f) => f.nome },
  { nome: "reservado", posInicial: 68, posFinal: 73, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];
export const LAYOUT_ORDENADOR: LayoutArquivo<OrdenadorFato> = { entidade: "Ordenador", periodicidade: "DIARIO", versao: VERSAO, campos: camposOrdenador };

export interface ResponsavelSiaficFato {
  readonly codUnidadeGestora: string;
  readonly cnpjEmpresa: string;
  readonly nomeEmpresa: string;
  readonly telefoneEmpresa: string | null;
  readonly emailEmpresa: string;
  readonly denominacaoSiafic: string;
  readonly cpfResponsavelTecnico: string;
  readonly nomeResponsavelTecnico: string;
  readonly emailResponsavelTecnico: string;
  readonly telefoneResponsavelTecnico: string | null;
}
const camposResponsavelSiafic: readonly CampoLayout<ResponsavelSiaficFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "cnpjEmpresa", posInicial: 7, posFinal: 20, tipo: "DOCUMENTO", obrigatorio: true, origem: "DeclaracaoDoResponsavelSiafic.cnpjEmpresa", extrair: (f) => f.cnpjEmpresa },
  { nome: "nomeEmpresa", posInicial: 21, posFinal: 100, tipo: "ALFA", obrigatorio: true, origem: "DeclaracaoDoResponsavelSiafic.nomeEmpresa", extrair: (f) => f.nomeEmpresa },
  { nome: "telefoneEmpresa", posInicial: 101, posFinal: 111, tipo: "NUMERICO", obrigatorio: false, origem: "DeclaracaoDoResponsavelSiafic.telefoneEmpresa (com DDD)", extrair: (f) => f.telefoneEmpresa },
  { nome: "emailEmpresa", posInicial: 112, posFinal: 141, tipo: "ALFA", obrigatorio: true, origem: "DeclaracaoDoResponsavelSiafic.emailEmpresa", extrair: (f) => f.emailEmpresa },
  { nome: "denominacaoSiafic", posInicial: 142, posFinal: 171, tipo: "ALFA", obrigatorio: true, origem: "DeclaracaoDoResponsavelSiafic.denominacaoSiafic", extrair: (f) => f.denominacaoSiafic },
  { nome: "cpfResponsavelTecnico", posInicial: 172, posFinal: 182, tipo: "DOCUMENTO", obrigatorio: true, origem: "DeclaracaoDoResponsavelSiafic.cpfResponsavelTecnico", extrair: (f) => f.cpfResponsavelTecnico },
  { nome: "nomeResponsavelTecnico", posInicial: 183, posFinal: 242, tipo: "ALFA", obrigatorio: true, origem: "DeclaracaoDoResponsavelSiafic.nomeResponsavelTecnico", extrair: (f) => f.nomeResponsavelTecnico },
  { nome: "emailResponsavelTecnico", posInicial: 243, posFinal: 272, tipo: "ALFA", obrigatorio: true, origem: "DeclaracaoDoResponsavelSiafic.emailResponsavelTecnico", extrair: (f) => f.emailResponsavelTecnico },
  { nome: "telefoneResponsavelTecnico", posInicial: 273, posFinal: 283, tipo: "NUMERICO", obrigatorio: false, origem: "DeclaracaoDoResponsavelSiafic.telefoneResponsavelTecnico", extrair: (f) => f.telefoneResponsavelTecnico },
];
export const LAYOUT_RESPONSAVEL_SIAFIC: LayoutArquivo<ResponsavelSiaficFato> = { entidade: "ResponsavelSiafic", periodicidade: "ANUAL", versao: VERSAO, campos: camposResponsavelSiafic };

// ═══ V26 — ReceitaPrevista (§4.7, anual — janeiro) ═══════════════════════════════════════════════════
export interface ReceitaPrevistaFato {
  readonly codUnidadeGestora: string;
  readonly competencia: number;
  readonly codReceitaOrcamentaria: string;
  readonly exercicioFonteRecurso: number;
  readonly codFonteRecurso: string;
  readonly tipoReceita: string;
  readonly valor: Money;
}
const camposReceitaPrevista: readonly CampoLayout<ReceitaPrevistaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "competencia", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "receitaPrevista.exercicio", extrair: (f) => f.competencia },
  { nome: "codReceitaOrcamentaria", posInicial: 11, posFinal: 18, tipo: "NUMERICO", obrigatorio: true, origem: "receitaPrevista.naturezaReceita.codigo", extrair: (f) => f.codReceitaOrcamentaria },
  { nome: "exercicioFonteRecurso", posInicial: 19, posFinal: 19, tipo: "NUMERICO", obrigatorio: true, origem: "receitaPrevista.exercicioFonte", extrair: (f) => f.exercicioFonteRecurso },
  { nome: "codFonteRecurso", posInicial: 20, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "receitaPrevista.fonte.codigo", extrair: (f) => f.codFonteRecurso },
  { nome: "tipoReceita", posInicial: 23, posFinal: 23, tipo: "NUMERICO", obrigatorio: true, origem: "tipoReceita → §5.23 (dedução pelo DetalheDaReceitaPrevista)", extrair: (f) => f.tipoReceita },
  { nome: "valor", posInicial: 24, posFinal: 39, tipo: "VALOR", obrigatorio: true, origem: "receitaPrevista.valorPrevisto", extrair: (f) => f.valor },
  { nome: "reservado", posInicial: 40, posFinal: 45, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];
export const LAYOUT_RECEITA_PREVISTA: LayoutArquivo<ReceitaPrevistaFato> = { entidade: "ReceitaPrevista", periodicidade: "ANUAL", versao: VERSAO, campos: camposReceitaPrevista };

// ═══ V26 — SaldoInicial (§4.25, janeiro) ═════════════════════════════════════════════════════════════
export interface SaldoInicialFato {
  readonly codUnidadeGestora: string;
  readonly numContaBancaria: string;
  readonly numAgencia: string;
  readonly codBanco: string;
  readonly valor: Money;
  readonly tipoContaBancaria: string;
  readonly cnpjGerenciaContaBancaria: string;
}
const camposSaldoInicial: readonly CampoLayout<SaldoInicialFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "numContaBancaria", posInicial: 7, posFinal: 19, tipo: "ALFA", obrigatorio: true, origem: "contaBancaria.conta + dígito", extrair: (f) => f.numContaBancaria },
  { nome: "numAgencia", posInicial: 20, posFinal: 25, tipo: "ALFA", obrigatorio: true, origem: "contaBancaria.agencia + dígito", extrair: (f) => f.numAgencia },
  { nome: "codBanco", posInicial: 26, posFinal: 28, tipo: "ALFA", obrigatorio: true, origem: "contaBancaria.banco", extrair: (f) => f.codBanco },
  { nome: "valor", posInicial: 29, posFinal: 44, tipo: "VALOR", obrigatorio: true, origem: "saldo contábil de 31/12 do exercício anterior, da conciliação encerrada (interpretação V26)", extrair: (f) => f.valor },
  { nome: "tipoContaBancaria", posInicial: 45, posFinal: 45, tipo: "NUMERICO", obrigatorio: true, origem: "§5.31 (conta corrente)", extrair: (f) => f.tipoContaBancaria },
  { nome: "cnpjGerenciaContaBancaria", posInicial: 46, posFinal: 59, tipo: "DOCUMENTO", obrigatorio: true, origem: "parâmetro export (CNPJ gerenciador)", extrair: (f) => f.cnpjGerenciaContaBancaria },
];
export const LAYOUT_SALDO_INICIAL: LayoutArquivo<SaldoInicialFato> = { entidade: "SaldoInicial", periodicidade: "ANUAL", versao: VERSAO, campos: camposSaldoInicial };

// ═══ V26 — RelacionamentoEmpenhoLicitacao (§4.38, mensal) ═══════════════════════════════════════════
export interface RelacionamentoEmpenhoLicitacaoFato {
  readonly codUnidadeGestora: string;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  readonly codUnidadeGestoraLicitacao: string;
  readonly numLicitacao: string;
  readonly modalidadeLicitacao: string;
}
const camposRelacionamentoEmpenhoLicitacao: readonly CampoLayout<RelacionamentoEmpenhoLicitacaoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codUnidadeOrcamentaria", posInicial: 7, posFinal: 11, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 12, posFinal: 18, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero (chave do Empenhos §4.8, numérico lá)", extrair: (f) => f.numEmpenho },
  { nome: "codUnidadeGestoraLicitacao", posInicial: 19, posFinal: 24, tipo: "NUMERICO", obrigatorio: true, origem: "IdentificacaoNoTramita.codUnidadeGestora", extrair: (f) => f.codUnidadeGestoraLicitacao },
  { nome: "numLicitacao", posInicial: 25, posFinal: 33, tipo: "ALFA", obrigatorio: true, origem: "IdentificacaoNoTramita.numeroNoTramita", extrair: (f) => f.numLicitacao },
  { nome: "modalidadeLicitacao", posInicial: 34, posFinal: 35, tipo: "NUMERICO", obrigatorio: true, origem: "IdentificacaoNoTramita.modalidadeSagres (§6.2)", extrair: (f) => f.modalidadeLicitacao },
  { nome: "reservado", posInicial: 36, posFinal: 41, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];
export const LAYOUT_RELACIONAMENTO_EMPENHO_LICITACAO: LayoutArquivo<RelacionamentoEmpenhoLicitacaoFato> = { entidade: "RelacionamentoEmpenhoLicitacao", periodicidade: "MENSAL", versao: VERSAO, campos: camposRelacionamentoEmpenhoLicitacao };

// ═══ V26 — AtualizacaoOrcamentaria (§4.5), DecretoseOficios (§4.6), NormasOrcamentarias (§4.49), diários ════
export interface AtualizacaoOrcamentariaFato {
  readonly codUnidadeGestora: string;
  readonly competencia: number;
  readonly codUnidadeOrcamentaria: string;
  readonly codFuncao: string;
  readonly codSubfuncao: string;
  readonly codPrograma: string;
  readonly codAcao: string;
  readonly numDecretoOficio: string;
  readonly tipoDecretoOficio: string;
  readonly tipoAlteracao: string;
  readonly codCategoriaEconomica: string;
  readonly codNaturezaDespesa: string;
  readonly codModalidadeDespesa: string;
  readonly codElementoDespesa: string;
  readonly exercicioFonteRecurso: number;
  readonly codFonteRecurso: string;
  readonly valor: Money;
}
const camposAtualizacaoOrcamentaria: readonly CampoLayout<AtualizacaoOrcamentariaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "competencia", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "decreto.ano", extrair: (f) => f.competencia },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "item.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "codFuncao", posInicial: 16, posFinal: 17, tipo: "NUMERICO", obrigatorio: true, origem: "item.ficha.funcao.codigo", extrair: (f) => f.codFuncao },
  { nome: "codSubfuncao", posInicial: 18, posFinal: 20, tipo: "NUMERICO", obrigatorio: true, origem: "item.ficha.subfuncao.codigo", extrair: (f) => f.codSubfuncao },
  { nome: "codPrograma", posInicial: 21, posFinal: 24, tipo: "NUMERICO", obrigatorio: true, origem: "item.ficha.programa.codigo", extrair: (f) => f.codPrograma },
  { nome: "codAcao", posInicial: 25, posFinal: 28, tipo: "NUMERICO", obrigatorio: true, origem: "item.ficha.acao.codigo", extrair: (f) => f.codAcao },
  { nome: "reservado", posInicial: 29, posFinal: 34, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
  { nome: "numDecretoOficio", posInicial: 35, posFinal: 43, tipo: "NUMERICO", obrigatorio: true, origem: "decreto.numero + ano (NNNNNAAAA)", extrair: (f) => f.numDecretoOficio },
  { nome: "tipoDecretoOficio", posInicial: 44, posFinal: 44, tipo: "NUMERICO", obrigatorio: true, origem: "1 (decreto)", extrair: (f) => f.tipoDecretoOficio },
  { nome: "tipoAlteracao", posInicial: 45, posFinal: 46, tipo: "NUMERICO", obrigatorio: true, origem: "lei.tipoCredito × decreto.origemRecurso × item.tipo → §5.13", extrair: (f) => f.tipoAlteracao },
  { nome: "codCategoriaEconomica", posInicial: 47, posFinal: 47, tipo: "NUMERICO", obrigatorio: true, origem: "item.ficha.naturezaDespesa.codCategoria", extrair: (f) => f.codCategoriaEconomica },
  { nome: "codNaturezaDespesa", posInicial: 48, posFinal: 48, tipo: "NUMERICO", obrigatorio: true, origem: "item.ficha.naturezaDespesa.codNatureza", extrair: (f) => f.codNaturezaDespesa },
  { nome: "codModalidadeDespesa", posInicial: 49, posFinal: 50, tipo: "NUMERICO", obrigatorio: true, origem: "item.ficha.naturezaDespesa.codModalidade", extrair: (f) => f.codModalidadeDespesa },
  { nome: "codElementoDespesa", posInicial: 51, posFinal: 52, tipo: "NUMERICO", obrigatorio: true, origem: "item.ficha.naturezaDespesa.codElemento", extrair: (f) => f.codElementoDespesa },
  { nome: "exercicioFonteRecurso", posInicial: 53, posFinal: 53, tipo: "NUMERICO", obrigatorio: true, origem: "item.ficha.exercicioFonte", extrair: (f) => f.exercicioFonteRecurso },
  { nome: "codFonteRecurso", posInicial: 54, posFinal: 56, tipo: "NUMERICO", obrigatorio: true, origem: "item.fonte.codigo", extrair: (f) => f.codFonteRecurso },
  { nome: "valor", posInicial: 57, posFinal: 72, tipo: "VALOR", obrigatorio: true, origem: "item.valor", extrair: (f) => f.valor },
  { nome: "reservado2", posInicial: 73, posFinal: 78, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];
export const LAYOUT_ATUALIZACAO_ORCAMENTARIA: LayoutArquivo<AtualizacaoOrcamentariaFato> = { entidade: "AtualizacaoOrcamentaria", periodicidade: "DIARIO", versao: VERSAO, campos: camposAtualizacaoOrcamentaria };

export interface DecretoOuOficioFato {
  readonly codUnidadeGestora: string;
  readonly competencia: number;
  readonly numero: string;
  readonly numLei: string;
  readonly data: Date;
  readonly tipo: string;
}
const camposDecretosEOficios: readonly CampoLayout<DecretoOuOficioFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "competencia", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "decreto.ano", extrair: (f) => f.competencia },
  { nome: "numero", posInicial: 11, posFinal: 19, tipo: "NUMERICO", obrigatorio: true, origem: "decreto.numero + ano", extrair: (f) => f.numero },
  { nome: "numLei", posInicial: 20, posFinal: 27, tipo: "NUMERICO", obrigatorio: true, origem: "lei.numero + ano (NNNNAAAA)", extrair: (f) => f.numLei },
  { nome: "data", posInicial: 28, posFinal: 35, tipo: "DATA", obrigatorio: true, origem: "decreto.data", extrair: (f) => f.data },
  { nome: "tipo", posInicial: 36, posFinal: 36, tipo: "NUMERICO", obrigatorio: true, origem: "1 (decreto)", extrair: (f) => f.tipo },
  { nome: "reservado", posInicial: 37, posFinal: 42, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];
export const LAYOUT_DECRETOS_E_OFICIOS: LayoutArquivo<DecretoOuOficioFato> = { entidade: "DecretoseOficios", periodicidade: "DIARIO", versao: VERSAO, campos: camposDecretosEOficios };

export interface NormaOrcamentariaFato {
  readonly codUnidadeGestora: string;
  readonly competencia: number;
  readonly numero: string;
  readonly data: Date;
  readonly tipo: string;
  readonly protocoloTCE: string;
  readonly tipoAutorizacao: string;
  readonly valor: Money;
}
const camposNormasOrcamentarias: readonly CampoLayout<NormaOrcamentariaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "competencia", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "norma.ano", extrair: (f) => f.competencia },
  { nome: "numero", posInicial: 11, posFinal: 19, tipo: "NUMERICO", obrigatorio: true, origem: "norma.numero + ano (NNNNNAAAA)", extrair: (f) => f.numero },
  { nome: "data", posInicial: 20, posFinal: 27, tipo: "DATA", obrigatorio: true, origem: "norma.dataPublicacao", extrair: (f) => f.data },
  // ⚠️ O HTML oficial traz a posição inicial deste campo como "2/8"; é 28 (o anterior termina em 27, o seguinte começa em 29).
  { nome: "tipo", posInicial: 28, posFinal: 28, tipo: "NUMERICO", obrigatorio: true, origem: "norma.tipo → §5.36", extrair: (f) => f.tipo },
  { nome: "protocoloTCE", posInicial: 29, posFinal: 37, tipo: "ALFA", obrigatorio: true, origem: "norma.protocoloTce (000000/00)", extrair: (f) => f.protocoloTCE },
  { nome: "tipo_autorizacao", posInicial: 38, posFinal: 38, tipo: "NUMERICO", obrigatorio: true, origem: "norma.autorizacaoPercentual (1/0)", extrair: (f) => f.tipoAutorizacao },
  { nome: "valor", posInicial: 39, posFinal: 54, tipo: "VALOR", obrigatorio: true, origem: "norma.valor", extrair: (f) => f.valor },
];
export const LAYOUT_NORMAS_ORCAMENTARIAS: LayoutArquivo<NormaOrcamentariaFato> = { entidade: "NormasOrcamentarias", periodicidade: "DIARIO", versao: VERSAO, campos: camposNormasOrcamentarias };

// ═══ V26 — TransfRecebida (§4.17) e TransfConcedida (§4.18), diários ═══════════════════════════════
/** §5.25 TipoTransferencia — de-para EXAUSTIVO do tipo do domínio (M09). */
export const DEPARA_TIPO_TRANSFERENCIA_SAGRES: Readonly<
  Record<
    | "DUODECIMO"
    | "APORTE_DESPESAS_ADMINISTRATIVAS"
    | "APORTE_INSUFICIENCIA_FINANCEIRA"
    | "APORTE_BENEFICIOS_PREVIDENCIARIOS"
    | "OUTROS_APORTES"
    | "INVESTIMENTOS_OU_RESGATES"
    | "DEVOLUCAO_DE_RECURSOS"
    | "TRANSFERENCIA_INDIRETA",
    string
  >
> = {
  DUODECIMO: "1",
  APORTE_DESPESAS_ADMINISTRATIVAS: "2",
  APORTE_INSUFICIENCIA_FINANCEIRA: "3",
  APORTE_BENEFICIOS_PREVIDENCIARIOS: "4",
  OUTROS_APORTES: "5",
  INVESTIMENTOS_OU_RESGATES: "6",
  DEVOLUCAO_DE_RECURSOS: "8",
  TRANSFERENCIA_INDIRETA: "9",
};

/** §5.18 TipoLancamento. */
export const TIPO_LANCAMENTO_ORDINARIO = "1";
export const TIPO_LANCAMENTO_ESTORNO = "2";

export interface TransferenciaEntreUgsFato {
  readonly codUnidadeGestora: string;
  /** A outra UG: a transferidora (§4.17) ou a recebedora (§4.18). */
  readonly codOutraUnidadeGestora: string;
  readonly tipoTransferencia: string;
  readonly tipoLancamento: string;
  readonly valor: Money;
  readonly numeroConta: string;
  readonly codBanco: string;
  readonly numAgencia: string;
  readonly tipoContaBancaria: string;
  readonly cnpjGerencia: string;
  readonly data: Date;
}
function camposDaTransferencia(nomeDaOutra: string, origemDaOutra: string): readonly CampoLayout<TransferenciaEntreUgsFato>[] {
  return [
    { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
    { nome: nomeDaOutra, posInicial: 7, posFinal: 12, tipo: "NUMERICO", obrigatorio: true, origem: origemDaOutra, extrair: (f) => f.codOutraUnidadeGestora },
    { nome: "tipoTransferencia", posInicial: 13, posFinal: 13, tipo: "NUMERICO", obrigatorio: true, origem: "transferencia.tipo → §5.25", extrair: (f) => f.tipoTransferencia },
    { nome: "tipoLancamento", posInicial: 14, posFinal: 14, tipo: "NUMERICO", obrigatorio: true, origem: "1 ordinário, 2 estorno (§5.18)", extrair: (f) => f.tipoLancamento },
    { nome: "valor", posInicial: 15, posFinal: 30, tipo: "VALOR", obrigatorio: true, origem: "transferencia.valor", extrair: (f) => f.valor },
    { nome: "numeroConta", posInicial: 31, posFinal: 43, tipo: "ALFA", obrigatorio: true, origem: "conta desta UG: conta+digito", extrair: (f) => f.numeroConta },
    { nome: "codBanco", posInicial: 44, posFinal: 46, tipo: "NUMERICO", obrigatorio: true, origem: "conta desta UG: banco", extrair: (f) => f.codBanco },
    { nome: "numAgencia", posInicial: 47, posFinal: 52, tipo: "ALFA", obrigatorio: true, origem: "conta desta UG: agencia+digito", extrair: (f) => f.numAgencia },
    { nome: "tipoContaBancaria", posInicial: 53, posFinal: 53, tipo: "NUMERICO", obrigatorio: true, origem: "§5.31 (1 conta corrente)", extrair: (f) => f.tipoContaBancaria },
    { nome: "cnpjGerencia", posInicial: 54, posFinal: 67, tipo: "NUMERICO", obrigatorio: true, origem: "CNPJ da UG que gerencia a conta", extrair: (f) => f.cnpjGerencia },
    { nome: "dataTransferencia", posInicial: 68, posFinal: 75, tipo: "DATA", obrigatorio: true, origem: "transferencia.data", extrair: (f) => f.data },
  ];
}
export const LAYOUT_TRANSF_RECEBIDA: LayoutArquivo<TransferenciaEntreUgsFato> = {
  entidade: "TransfRecebida",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposDaTransferencia("codUnidadeGestoraTransferencia", "a UG que transferiu"),
};
export const LAYOUT_TRANSF_CONCEDIDA: LayoutArquivo<TransferenciaEntreUgsFato> = {
  entidade: "TransfConcedida",
  periodicidade: "DIARIO",
  versao: VERSAO,
  campos: camposDaTransferencia("codUnidadeGestoraRecebedora", "a UG que recebeu"),
};

// ═══ V26 — RelacionamentoLiquidacaoCodigoAgrupamentoFolhaPagamento (§4.39), mensal ═══════════════════
export interface RelacionamentoLiquidacaoAgrupamentoFolhaFato {
  readonly codUnidadeGestora: string;
  readonly codUnidadeOrcamentaria: string;
  readonly numEmpenho: string;
  readonly numLiquidacao: string;
  readonly codAgrupamentoFolha: string;
}
const camposRelacionamentoLiquidacaoAgrupamentoFolha: readonly CampoLayout<RelacionamentoLiquidacaoAgrupamentoFolhaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codUnidadeOrcamentaria", posInicial: 7, posFinal: 11, tipo: "NUMERICO", obrigatorio: true, origem: "liquidacao.empenho.ficha.unidadeOrc.codigo", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "numEmpenho", posInicial: 12, posFinal: 18, tipo: "NUMERICO", obrigatorio: true, origem: "empenho.numero (chave do Empenhos §4.8, numérico lá)", extrair: (f) => f.numEmpenho },
  { nome: "numLiquidacao", posInicial: 19, posFinal: 25, tipo: "NUMERICO", obrigatorio: true, origem: "liquidacao.numero", extrair: (f) => f.numLiquidacao },
  { nome: "codAgrupamentoFolha", posInicial: 26, posFinal: 35, tipo: "ALFA", obrigatorio: true, origem: "AgrupamentoDaFolhaNaLiquidacao.codigo (do sistema da folha)", extrair: (f) => f.codAgrupamentoFolha },
  { nome: "reservado", posInicial: 36, posFinal: 41, tipo: "RESERVADO", obrigatorio: false, origem: "= ZEROS" },
];
export const LAYOUT_RELACIONAMENTO_LIQUIDACAO_AGRUPAMENTO_FOLHA: LayoutArquivo<RelacionamentoLiquidacaoAgrupamentoFolhaFato> = {
  entidade: "RelacionamentoLiquidacaoCodigoAgrupamentoFolhaPagamento",
  periodicidade: "MENSAL",
  versao: VERSAO,
  campos: camposRelacionamentoLiquidacaoAgrupamentoFolha,
};

// ═══ V26 — o projeto da LOA (§4.41 a §4.45), anuais no balancete de setembro ══════════════════════════════
export interface PloaAcaoFato {
  readonly codUnidadeGestora: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly tipoAcao: string;
  readonly descMeta: string;
  readonly descUnidade: string;
}
const camposPloaAcao: readonly CampoLayout<PloaAcaoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codigo", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "AcaoDoProjetoDaLoa.codigo", extrair: (f) => f.codigo },
  { nome: "descricao", posInicial: 11, posFinal: 80, tipo: "ALFA", obrigatorio: true, origem: "AcaoDoProjetoDaLoa.descricao", extrair: (f) => f.descricao },
  { nome: "tipoAcao", posInicial: 81, posFinal: 81, tipo: "NUMERICO", obrigatorio: true, origem: "AcaoDoProjetoDaLoa.tipo → §5.12", extrair: (f) => f.tipoAcao },
  { nome: "descMeta", posInicial: 82, posFinal: 231, tipo: "ALFA", obrigatorio: true, origem: "AcaoDoProjetoDaLoa.descMeta (obrigatória no projeto)", extrair: (f) => f.descMeta },
  { nome: "descUnidade", posInicial: 232, posFinal: 281, tipo: "ALFA", obrigatorio: true, origem: "AcaoDoProjetoDaLoa.unidadeMedida (obrigatória no projeto)", extrair: (f) => f.descUnidade },
];
export const LAYOUT_PLOA_ACAO: LayoutArquivo<PloaAcaoFato> = { entidade: "PloaAcao", periodicidade: "ANUAL", versao: VERSAO, campos: camposPloaAcao };

export interface PloaDotacaoFato {
  readonly codUnidadeGestora: string;
  readonly competencia: number;
  readonly codUnidadeOrcamentaria: string;
  readonly codFuncao: string;
  readonly codSubfuncao: string;
  readonly codPrograma: string;
  readonly codAcao: string;
  readonly codCategoriaEconomica: string;
  readonly codNaturezaDespesa: string;
  readonly codModalidadeDespesa: string;
  readonly codElementoDespesa: string;
  readonly exercicioFonteRecurso: number;
  readonly codFonteRecurso: string;
  readonly valor: Money;
}
const camposPloaDotacao: readonly CampoLayout<PloaDotacaoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "competencia", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "o exercício de vigência do projeto", extrair: (f) => f.competencia },
  { nome: "codUnidadeOrcamentaria", posInicial: 11, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "DotacaoDoProjetoDaLoa", extrair: (f) => f.codUnidadeOrcamentaria },
  { nome: "codFuncao", posInicial: 16, posFinal: 17, tipo: "NUMERICO", obrigatorio: true, origem: "DotacaoDoProjetoDaLoa", extrair: (f) => f.codFuncao },
  { nome: "codSubfuncao", posInicial: 18, posFinal: 20, tipo: "NUMERICO", obrigatorio: true, origem: "DotacaoDoProjetoDaLoa", extrair: (f) => f.codSubfuncao },
  { nome: "codPrograma", posInicial: 21, posFinal: 24, tipo: "NUMERICO", obrigatorio: true, origem: "DotacaoDoProjetoDaLoa", extrair: (f) => f.codPrograma },
  { nome: "codAcao", posInicial: 25, posFinal: 28, tipo: "NUMERICO", obrigatorio: true, origem: "DotacaoDoProjetoDaLoa", extrair: (f) => f.codAcao },
  { nome: "codCategoriaEconomica", posInicial: 29, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "DotacaoDoProjetoDaLoa", extrair: (f) => f.codCategoriaEconomica },
  { nome: "codNaturezaDespesa", posInicial: 30, posFinal: 30, tipo: "NUMERICO", obrigatorio: true, origem: "DotacaoDoProjetoDaLoa", extrair: (f) => f.codNaturezaDespesa },
  { nome: "codModalidadeDespesa", posInicial: 31, posFinal: 32, tipo: "NUMERICO", obrigatorio: true, origem: "DotacaoDoProjetoDaLoa", extrair: (f) => f.codModalidadeDespesa },
  { nome: "codElementoDespesa", posInicial: 33, posFinal: 34, tipo: "NUMERICO", obrigatorio: true, origem: "DotacaoDoProjetoDaLoa", extrair: (f) => f.codElementoDespesa },
  { nome: "exercicioFonteRecurso", posInicial: 35, posFinal: 35, tipo: "NUMERICO", obrigatorio: true, origem: "DotacaoDoProjetoDaLoa (2 só em UG previdenciária)", extrair: (f) => f.exercicioFonteRecurso },
  { nome: "codFonteRecurso", posInicial: 36, posFinal: 38, tipo: "NUMERICO", obrigatorio: true, origem: "DotacaoDoProjetoDaLoa", extrair: (f) => f.codFonteRecurso },
  { nome: "valor", posInicial: 39, posFinal: 54, tipo: "VALOR", obrigatorio: true, origem: "DotacaoDoProjetoDaLoa.valor", extrair: (f) => f.valor },
];
export const LAYOUT_PLOA_DOTACAO: LayoutArquivo<PloaDotacaoFato> = { entidade: "PloaDotacao", periodicidade: "ANUAL", versao: VERSAO, campos: camposPloaDotacao };

export interface PloaProgramaFato {
  readonly codUnidadeGestora: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly descObjetivo: string;
  readonly tipoObjetivoMilenio: string;
}
const camposPloaPrograma: readonly CampoLayout<PloaProgramaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codigo", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "ProgramaDoProjetoDaLoa.codigo", extrair: (f) => f.codigo },
  { nome: "descricao", posInicial: 11, posFinal: 80, tipo: "ALFA", obrigatorio: true, origem: "ProgramaDoProjetoDaLoa.descricao", extrair: (f) => f.descricao },
  { nome: "descObjetivo", posInicial: 81, posFinal: 230, tipo: "ALFA", obrigatorio: true, origem: "ProgramaDoProjetoDaLoa.objetivo", extrair: (f) => f.descObjetivo },
  { nome: "tipoObjetivoMilenio", posInicial: 231, posFinal: 232, tipo: "NUMERICO", obrigatorio: true, origem: "ProgramaDoProjetoDaLoa (§5.27)", extrair: (f) => f.tipoObjetivoMilenio },
];
export const LAYOUT_PLOA_PROGRAMA: LayoutArquivo<PloaProgramaFato> = { entidade: "PloaPrograma", periodicidade: "ANUAL", versao: VERSAO, campos: camposPloaPrograma };

export interface PloaReceitaPrevistaFato {
  readonly codUnidadeGestora: string;
  readonly competencia: number;
  readonly codReceitaOrcamentaria: string;
  readonly exercicioFonteRecurso: number;
  readonly codFonteRecurso: string;
  readonly tipoReceita: string;
  readonly valor: Money;
}
const camposPloaReceitaPrevista: readonly CampoLayout<PloaReceitaPrevistaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "competencia", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "o exercício de vigência do projeto", extrair: (f) => f.competencia },
  { nome: "codReceitaOrcamentaria", posInicial: 11, posFinal: 18, tipo: "NUMERICO", obrigatorio: true, origem: "ReceitaDoProjetoDaLoa.codNatureza", extrair: (f) => f.codReceitaOrcamentaria },
  { nome: "exercicioFonteRecurso", posInicial: 19, posFinal: 19, tipo: "NUMERICO", obrigatorio: true, origem: "ReceitaDoProjetoDaLoa", extrair: (f) => f.exercicioFonteRecurso },
  { nome: "codFonteRecurso", posInicial: 20, posFinal: 22, tipo: "NUMERICO", obrigatorio: true, origem: "ReceitaDoProjetoDaLoa", extrair: (f) => f.codFonteRecurso },
  { nome: "tipoReceita", posInicial: 23, posFinal: 23, tipo: "NUMERICO", obrigatorio: true, origem: "§5.23 (1, ou o subtipo da dedução)", extrair: (f) => f.tipoReceita },
  { nome: "valor", posInicial: 24, posFinal: 39, tipo: "VALOR", obrigatorio: true, origem: "ReceitaDoProjetoDaLoa.valor", extrair: (f) => f.valor },
];
export const LAYOUT_PLOA_RECEITA_PREVISTA: LayoutArquivo<PloaReceitaPrevistaFato> = { entidade: "PloaReceitaPrevista", periodicidade: "ANUAL", versao: VERSAO, campos: camposPloaReceitaPrevista };

export interface PloaUnidadeOrcamentariaFato {
  readonly codUnidadeGestora: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly nomeSecretario: string;
  readonly cpfSecretario: string;
  readonly tipoAtoJuridico: string;
  readonly tipoNaturezaJuridica: string;
}
const camposPloaUnidadeOrcamentaria: readonly CampoLayout<PloaUnidadeOrcamentariaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codigo", posInicial: 7, posFinal: 11, tipo: "NUMERICO", obrigatorio: true, origem: "UnidadeDoProjetoDaLoa.codigo", extrair: (f) => f.codigo },
  { nome: "descricao", posInicial: 12, posFinal: 61, tipo: "ALFA", obrigatorio: true, origem: "UnidadeDoProjetoDaLoa.descricao", extrair: (f) => f.descricao },
  { nome: "nomeSecretario", posInicial: 62, posFinal: 121, tipo: "ALFA", obrigatorio: true, origem: "UnidadeDoProjetoDaLoa.nomeSecretario", extrair: (f) => f.nomeSecretario },
  { nome: "cpfSecretario", posInicial: 122, posFinal: 132, tipo: "NUMERICO", obrigatorio: true, origem: "UnidadeDoProjetoDaLoa.cpfSecretario", extrair: (f) => f.cpfSecretario },
  { nome: "tipoAtoJuridico", posInicial: 133, posFinal: 133, tipo: "NUMERICO", obrigatorio: true, origem: "§5.14", extrair: (f) => f.tipoAtoJuridico },
  { nome: "tipoNaturezaJuridica", posInicial: 134, posFinal: 134, tipo: "NUMERICO", obrigatorio: true, origem: "§5.26", extrair: (f) => f.tipoNaturezaJuridica },
];
export const LAYOUT_PLOA_UNIDADE_ORCAMENTARIA: LayoutArquivo<PloaUnidadeOrcamentariaFato> = { entidade: "PloaUnidadeOrcamentaria", periodicidade: "ANUAL", versao: VERSAO, campos: camposPloaUnidadeOrcamentaria };

// ── V27 — §4.50 a §4.57: frota (M36) e farmácia pública (M37), todos mensais ─────────────────────────

/** §4.52/§4.53 tipo_frota e tipo_maquina: 1 próprio, 2 locado, 3 prestação de serviços, 4 cedido. */
export const DEPARA_TIPO_FROTA_SAGRES: Readonly<Record<"PROPRIO" | "LOCADO" | "PRESTACAO_DE_SERVICOS" | "CEDIDO", string>> = {
  PROPRIO: "1",
  LOCADO: "2",
  PRESTACAO_DE_SERVICOS: "3",
  CEDIDO: "4",
};
/** §4.54 tipoSituacao: a tabela "Tipo Situação Frota" do TCE-PB (domínios do Captura 2.0, desde 2025). */
export const DEPARA_SITUACAO_FROTA_SAGRES: Readonly<Record<"EM_USO" | "EM_MANUTENCAO" | "BAIXADA" | "BAIXA_TEMPORARIA", string>> = {
  EM_USO: "1",
  EM_MANUTENCAO: "2",
  BAIXADA: "3",
  BAIXA_TEMPORARIA: "4",
};
/** §4.55 tipoCombustivel. */
export const DEPARA_COMBUSTIVEL_SAGRES: Readonly<Record<"GASOLINA" | "DIESEL" | "ETANOL" | "GAS_NATURAL" | "ARLA_32" | "ELETRICIDADE", string>> = {
  GASOLINA: "1",
  DIESEL: "2",
  ETANOL: "3",
  GAS_NATURAL: "4",
  ARLA_32: "5",
  ELETRICIDADE: "6",
};
/** §4.54/§4.55 categoria: 1 veículo, 2 máquina. */
export const CATEGORIA_FROTA_VEICULO = "1";
export const CATEGORIA_FROTA_MAQUINA = "2";

export interface PessoaDaFrotaFato {
  readonly codUnidadeGestora: string;
  readonly cpfcnpj: string;
  readonly nome: string;
}
const camposPessoaDaFrota = (papel: string): readonly CampoLayout<PessoaDaFrotaFato>[] => [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "cpfcnpj", posInicial: 7, posFinal: 20, tipo: "DOCUMENTO", obrigatorio: true, origem: `${papel}: Pessoa.documento (no bem próprio, o CNPJ da UG)`, extrair: (f) => f.cpfcnpj },
  { nome: "nome", posInicial: 21, posFinal: 100, tipo: "ALFA", obrigatorio: true, origem: `${papel}: VersaoDePessoa.nome vigente (no bem próprio, UnidadeGestora.nome)`, extrair: (f) => f.nome },
];
export const LAYOUT_PROPRIETARIO_FROTA: LayoutArquivo<PessoaDaFrotaFato> = { entidade: "ProprietarioFrota", periodicidade: "MENSAL", versao: VERSAO, campos: camposPessoaDaFrota("proprietário") };
export const LAYOUT_LOCADOR_PRESTADOR: LayoutArquivo<PessoaDaFrotaFato> = { entidade: "LocadorPrestador", periodicidade: "MENSAL", versao: VERSAO, campos: camposPessoaDaFrota("locador") };

export interface VeiculoFato {
  readonly codUnidadeGestora: string;
  readonly placa: string;
  readonly anoModelo: number;
  readonly numeroRenavan: string;
  readonly numeroModelo: string;
  readonly tipoFrota: string;
  readonly cpfcnpjProprietario: string;
  readonly cpfcnpjLocador: string | null;
}
const camposVeiculos: readonly CampoLayout<VeiculoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "placa", posInicial: 7, posFinal: 13, tipo: "ALFA", obrigatorio: true, origem: "VeiculoDaFrota.placa", extrair: (f) => f.placa },
  { nome: "anoModelo", posInicial: 14, posFinal: 17, tipo: "NUMERICO", obrigatorio: true, origem: "VersaoDoVeiculo.anoModelo", extrair: (f) => f.anoModelo },
  { nome: "numeroRenavan", posInicial: 18, posFinal: 28, tipo: "NUMERICO", obrigatorio: true, origem: "VersaoDoVeiculo.renavam", extrair: (f) => f.numeroRenavan },
  { nome: "numero_modelo", posInicial: 29, posFinal: 34, tipo: "NUMERICO", obrigatorio: true, origem: "VersaoDoVeiculo.numeroModelo (tabela de modelos do Tribunal)", extrair: (f) => f.numeroModelo },
  { nome: "tipo_frota", posInicial: 35, posFinal: 35, tipo: "NUMERICO", obrigatorio: true, origem: "VersaoDoVeiculo.tipoFrota (DEPARA_TIPO_FROTA_SAGRES)", extrair: (f) => f.tipoFrota },
  { nome: "cpfcnpjProprietario", posInicial: 36, posFinal: 49, tipo: "DOCUMENTO", obrigatorio: true, origem: "VersaoDoVeiculo.proprietario (no próprio, o CNPJ da UG)", extrair: (f) => f.cpfcnpjProprietario },
  { nome: "cpfcnpjLocador", posInicial: 50, posFinal: 63, tipo: "DOCUMENTO", obrigatorio: false, origem: "VersaoDoVeiculo.locador (locado e prestação de serviços)", extrair: (f) => f.cpfcnpjLocador },
];
export const LAYOUT_VEICULOS: LayoutArquivo<VeiculoFato> = { entidade: "Veiculos", periodicidade: "MENSAL", versao: VERSAO, campos: camposVeiculos };

export interface MaquinaFato {
  readonly codUnidadeGestora: string;
  readonly codigo: string;
  readonly anoFabricacao: number;
  readonly descricao: string;
  readonly tipoMaquina: string;
  readonly cpfcnpjProprietario: string;
  readonly cpfcnpjLocador: string | null;
}
const camposMaquinas: readonly CampoLayout<MaquinaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codigo", posInicial: 7, posFinal: 13, tipo: "ALFA", obrigatorio: true, origem: "MaquinaDaFrota.codigo", extrair: (f) => f.codigo },
  { nome: "anofabricacao", posInicial: 14, posFinal: 17, tipo: "NUMERICO", obrigatorio: true, origem: "VersaoDaMaquina.anoFabricacao", extrair: (f) => f.anoFabricacao },
  { nome: "descricao", posInicial: 18, posFinal: 67, tipo: "ALFA", obrigatorio: true, origem: "VersaoDaMaquina.descricao", extrair: (f) => f.descricao },
  { nome: "tipo_maquina", posInicial: 68, posFinal: 68, tipo: "NUMERICO", obrigatorio: true, origem: "VersaoDaMaquina.tipoFrota (DEPARA_TIPO_FROTA_SAGRES)", extrair: (f) => f.tipoMaquina },
  { nome: "cpfcnpjProprietario", posInicial: 69, posFinal: 82, tipo: "DOCUMENTO", obrigatorio: true, origem: "VersaoDaMaquina.proprietario (no próprio, o CNPJ da UG)", extrair: (f) => f.cpfcnpjProprietario },
  { nome: "cpfcnpjLocador", posInicial: 83, posFinal: 96, tipo: "DOCUMENTO", obrigatorio: false, origem: "VersaoDaMaquina.locador (locado e prestação de serviços)", extrair: (f) => f.cpfcnpjLocador },
];
export const LAYOUT_MAQUINAS: LayoutArquivo<MaquinaFato> = { entidade: "Maquinas", periodicidade: "MENSAL", versao: VERSAO, campos: camposMaquinas };

export interface SituacaoFrotaFato {
  readonly codUnidadeGestora: string;
  readonly data: Date;
  readonly tipoSituacao: string;
  readonly categoria: string;
  readonly codigo: string;
}
const camposSituacaoFrota: readonly CampoLayout<SituacaoFrotaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "data", posInicial: 7, posFinal: 14, tipo: "DATA", obrigatorio: true, origem: "MudancaDeSituacaoDaFrota.desde (01/mm para a situação que vem do mês anterior)", extrair: (f) => f.data },
  { nome: "tipoSituacao", posInicial: 15, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "MudancaDeSituacaoDaFrota.situacao (DEPARA_SITUACAO_FROTA_SAGRES)", extrair: (f) => f.tipoSituacao },
  { nome: "categoria", posInicial: 16, posFinal: 16, tipo: "NUMERICO", obrigatorio: true, origem: "1 veículo, 2 máquina", extrair: (f) => f.categoria },
  { nome: "codigo", posInicial: 17, posFinal: 23, tipo: "ALFA", obrigatorio: true, origem: "placa do veículo ou código da máquina", extrair: (f) => f.codigo },
];
export const LAYOUT_SITUACAO_FROTA: LayoutArquivo<SituacaoFrotaFato> = { entidade: "SituacaoFrota", periodicidade: "MENSAL", versao: VERSAO, campos: camposSituacaoFrota };

export interface AbastecimentoFato {
  readonly codUnidadeGestora: string;
  readonly ano: number;
  readonly mes: number;
  readonly quantidade: Money;
  readonly tipoCombustivel: string;
  readonly categoria: string;
  readonly codigo: string;
}
const camposAbastecimento: readonly CampoLayout<AbastecimentoFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "ano", posInicial: 7, posFinal: 10, tipo: "NUMERICO", obrigatorio: true, origem: "competência", extrair: (f) => f.ano },
  { nome: "mes", posInicial: 11, posFinal: 12, tipo: "NUMERICO", obrigatorio: true, origem: "competência", extrair: (f) => f.mes },
  // Numérico de 16 posições: 13 inteiros, a vírgula e 2 decimais (leiaute, "Dados numéricos para valores").
  { nome: "quantidade", posInicial: 13, posFinal: 28, tipo: "VALOR", obrigatorio: true, origem: "soma de AbastecimentoDaFrota.quantidade não anulados no mês (0 sem abastecimento)", extrair: (f) => f.quantidade },
  { nome: "tipoCombustivel", posInicial: 29, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "AbastecimentoDaFrota.combustivel (sem abastecimento, o combustível principal)", extrair: (f) => f.tipoCombustivel },
  { nome: "categoria", posInicial: 30, posFinal: 30, tipo: "NUMERICO", obrigatorio: true, origem: "1 veículo, 2 máquina", extrair: (f) => f.categoria },
  { nome: "codigo", posInicial: 31, posFinal: 37, tipo: "ALFA", obrigatorio: true, origem: "placa do veículo ou código da máquina", extrair: (f) => f.codigo },
];
export const LAYOUT_ABASTECIMENTO: LayoutArquivo<AbastecimentoFato> = { entidade: "Abastecimento", periodicidade: "MENSAL", versao: VERSAO, campos: camposAbastecimento };

export interface FarmaciaFato {
  readonly codUnidadeGestora: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly endereco: string;
  readonly nomeResponsavel: string;
  readonly cpf: string;
  readonly crf: string;
}
const camposFarmacia: readonly CampoLayout<FarmaciaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "codigo", posInicial: 7, posFinal: 13, tipo: "NUMERICO", obrigatorio: true, origem: "FarmaciaPublica.codigo", extrair: (f) => f.codigo },
  { nome: "descricao", posInicial: 14, posFinal: 73, tipo: "ALFA", obrigatorio: true, origem: "VersaoDaFarmacia.descricao", extrair: (f) => f.descricao },
  { nome: "endereco", posInicial: 74, posFinal: 193, tipo: "ALFA", obrigatorio: true, origem: "VersaoDaFarmacia.endereco", extrair: (f) => f.endereco },
  { nome: "nomeResponsavel", posInicial: 194, posFinal: 253, tipo: "ALFA", obrigatorio: true, origem: "VersaoDaFarmacia.nomeResponsavel", extrair: (f) => f.nomeResponsavel },
  { nome: "cpf", posInicial: 254, posFinal: 264, tipo: "DOCUMENTO", obrigatorio: true, origem: "VersaoDaFarmacia.cpfResponsavel", extrair: (f) => f.cpf },
  { nome: "crf", posInicial: 265, posFinal: 274, tipo: "ALFA", obrigatorio: true, origem: "VersaoDaFarmacia.crfResponsavel", extrair: (f) => f.crf },
];
export const LAYOUT_FARMACIA: LayoutArquivo<FarmaciaFato> = { entidade: "Farmacia", periodicidade: "MENSAL", versao: VERSAO, campos: camposFarmacia };

export interface EstoqueFarmaciaFato {
  readonly codUnidadeGestora: string;
  readonly mesReferencia: number;
  readonly codigoFarmacia: string;
  readonly codigoProduto: string;
  readonly descricao: string;
  readonly unidadeMedida: string;
  readonly quantidade: Money;
}
const camposEstoqueFarmacia: readonly CampoLayout<EstoqueFarmaciaFato>[] = [
  { nome: "codUnidadeGestora", posInicial: 1, posFinal: 6, tipo: "NUMERICO", obrigatorio: true, origem: "parâmetro export (UG)", extrair: (f) => f.codUnidadeGestora },
  { nome: "mesReferencia", posInicial: 7, posFinal: 8, tipo: "NUMERICO", obrigatorio: true, origem: "InformeDeEstoqueDaFarmacia.mes", extrair: (f) => f.mesReferencia },
  { nome: "codigoFarmacia", posInicial: 9, posFinal: 15, tipo: "NUMERICO", obrigatorio: true, origem: "FarmaciaPublica.codigo", extrair: (f) => f.codigoFarmacia },
  { nome: "codigoProduto", posInicial: 16, posFinal: 29, tipo: "NUMERICO", obrigatorio: true, origem: "ItemDoInformeDeEstoque.codigoProduto", extrair: (f) => f.codigoProduto },
  { nome: "descricao", posInicial: 30, posFinal: 89, tipo: "ALFA", obrigatorio: true, origem: "ItemDoInformeDeEstoque.descricao", extrair: (f) => f.descricao },
  { nome: "unidade_medida", posInicial: 90, posFinal: 99, tipo: "ALFA", obrigatorio: true, origem: "ItemDoInformeDeEstoque.unidadeMedida", extrair: (f) => f.unidadeMedida },
  { nome: "quantidade", posInicial: 100, posFinal: 115, tipo: "VALOR", obrigatorio: true, origem: "ItemDoInformeDeEstoque.quantidade (13 inteiros, vírgula, 2 decimais)", extrair: (f) => f.quantidade },
];
export const LAYOUT_ESTOQUE_FARMACIA: LayoutArquivo<EstoqueFarmaciaFato> = { entidade: "EstoqueFarmacia", periodicidade: "MENSAL", versao: VERSAO, campos: camposEstoqueFarmacia };

export const LAYOUTS_2026V11 = [
  LAYOUT_UNIDADE_ORCAMENTARIA,
  LAYOUT_DOTACAO,
  LAYOUT_EMPENHOS,
  LAYOUT_LIQUIDACAO,
  LAYOUT_CADASTRO_CONTA,
  LAYOUT_SALDO_MENSAL,
  LAYOUT_MOVIMENTACAO,
  LAYOUT_PAGAMENTOS,
  LAYOUT_ESTORNO_PAGAMENTO,
  LAYOUT_ESTORNOS,
  LAYOUT_ESTORNO_LIQUIDACAO,
  LAYOUT_CONCILIACAO_BANCARIA,
  LAYOUT_RECEITA_ORCAMENTARIA,
  LAYOUT_RETENCAO,
  LAYOUT_DESPESA_EXTRA,
  LAYOUT_ESTORNO_RETENCAO,
  LAYOUT_ESTORNO_DESPESA_EXTRA,
  LAYOUT_RECEITA_EXTRA,
  LAYOUT_ESTORNO_RECEITA_EXTRA,
  LAYOUT_PAGAMENTOS_RESTOS,
  LAYOUT_ESTORNO_PAGAMENTO_RESTOS,
  LAYOUT_CANCELAMENTO_RESTOS,
  LAYOUT_LIQUIDACAO_RESTOS,
  LAYOUT_ESTORNO_LIQUIDACAO_RESTOS,
  LAYOUT_RETENCAO_RESTOS,
  LAYOUT_ESTORNO_RETENCAO_RESTOS,
  LAYOUT_RESTOS_INSCRITOS,
  LAYOUT_RELACIONAMENTO_CONTA_FONTE,
  LAYOUT_FORNECEDORES,
  LAYOUT_RELACIONAMENTO_EMPENHO_OBRA,
  LAYOUT_RELACIONAMENTO_EMPENHO_NATUREZA,
  LAYOUT_RELACIONAMENTO_LIQUIDACAO_PAGAMENTO,
  LAYOUT_PROGRAMAS,
  LAYOUT_ACAO,
  LAYOUT_ORDENADOR,
  LAYOUT_RESPONSAVEL_SIAFIC,
  LAYOUT_RECEITA_PREVISTA,
  LAYOUT_SALDO_INICIAL,
  LAYOUT_RELACIONAMENTO_EMPENHO_LICITACAO,
  LAYOUT_ATUALIZACAO_ORCAMENTARIA,
  LAYOUT_DECRETOS_E_OFICIOS,
  LAYOUT_NORMAS_ORCAMENTARIAS,
  LAYOUT_TRANSF_RECEBIDA,
  LAYOUT_TRANSF_CONCEDIDA,
  LAYOUT_RELACIONAMENTO_LIQUIDACAO_AGRUPAMENTO_FOLHA,
  LAYOUT_PLOA_ACAO,
  LAYOUT_PLOA_DOTACAO,
  LAYOUT_PLOA_PROGRAMA,
  LAYOUT_PLOA_RECEITA_PREVISTA,
  LAYOUT_PLOA_UNIDADE_ORCAMENTARIA,
  LAYOUT_PROPRIETARIO_FROTA,
  LAYOUT_LOCADOR_PRESTADOR,
  LAYOUT_VEICULOS,
  LAYOUT_MAQUINAS,
  LAYOUT_SITUACAO_FROTA,
  LAYOUT_ABASTECIMENTO,
  LAYOUT_FARMACIA,
  LAYOUT_ESTOQUE_FARMACIA,
] as const;
