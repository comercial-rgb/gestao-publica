/**
 * SIGA (TCM-BA) — O VOCABULÁRIO DAS SPECS DE ARQUIVO.
 *
 * ═══ ⚠️ A FONTE É ESTRUTURAL, NÃO NORMATIVA ═══
 * Tudo aqui foi transcrito do manual "SIGA – Arquivos de Importação – Versão 44"
 * (TCM-BA / Diretoria de Informática, fev/2014), obtido de FONTE SECUNDÁRIA. O documento tem 11+
 * anos e o TCM pode tê-lo revisado sem que esta transcrição saiba. Por isso toda spec carrega
 * `origemSpec`: no dia em que chegar a versão oficial vigente, dá para saber exatamente o que foi
 * escrito contra o quê, e migrar spec a spec em vez de reescrever o adapter inteiro.
 *
 * Ver `README.md` deste adapter para o que está confirmado e o que é suposição.
 */

/**
 * O TIPO DE UM CAMPO — e cada um preenche o espaço vago de um jeito DIFERENTE.
 *
 * ⚠️ `N` NÃO É ZERO-PADDED, e essa é a armadilha mais cara do layout. Numérico do SIGA alinha à
 * DIREITA e completa com BRANCOS; zeros à esquerda no nº de empenho fazem o TCM REJEITAR o
 * arquivo. Quem vem de outro layout fixed-width assume zeros por reflexo — daí o teste explícito.
 *
 * `V` é o oposto: alinha à direita e completa com ZEROS, sem separador de milhar nem vírgula
 * decimal (o ponto decimal é implícito pela posição).
 */
export type TipoCampo = "N" | "AN" | "V" | "D";

/** Os módulos de importação do SIGA. A ordem de carga importa DENTRO de cada módulo. */
export type ModuloSiga = "BASICOS" | "PROGRAMA" | "ORCAMENTO" | "CONSUMO" | "INFORMES";

export type CampoSpec = {
  nome: string;
  tipo: TipoCampo;
  /** 0-based, INCLUSIVO. */
  inicio: number;
  /** 0-based, INCLUSIVO. `largura = fim - inicio + 1`. */
  fim: number;
  /**
   * Só para `V`. Default 2.
   *
   * ⚠️ NEM TODO VALOR TEM 2 CASAS. `ItemLic.qt_ItemLicitado` e `Cotacao.vl_Unitario` exigem 3.
   * Fixar 2 no writer produziria um arquivo que passa em todos os testes de empenho e sai errado
   * na licitação — por isso é configurável POR CAMPO, não por convenção global.
   */
  decimais?: number;
  /** Só para `V`. Default false — negativo sem permissão é ERRO, não é zero. */
  permiteNegativo?: boolean;
  obrigatorio?: boolean;
  /**
   * ⚠️ A EXCEÇÃO DOS "RESERVADO TCM" — extensão desta implementação, não do manual.
   *
   * Vários campos reservados são declarados `N` e o manual manda "preencher com zeros", que é
   * exatamente o contrário do que `N` faz (brancos). Sem um lugar para declarar isso, a única
   * saída seria cada chamador lembrar de passar `"000000"` na mão para aquele campo — e o dia em
   * que alguém esquecesse, o campo sairia em brancos e o arquivo seria recusado sem que teste
   * nenhum acusasse. Declarado aqui, a exceção vive na SPEC (onde é auditável contra o manual) e
   * o writer a aplica sozinho.
   *
   * Quando presente, o campo IGNORA o valor do registro e emite este literal.
   */
  literal?: string;
};

export type ArquivoSpec = {
  /** Vai no header (15 bytes). Ex.: "Empenho". */
  identificacao: string;
  /** O nº do arquivo no manual (ex.: Empenho = 23) — a chave para reconferir a transcrição. */
  numeroManual: number;
  modulo: ModuloSiga;
  /** Ordem de importação DENTRO do módulo. O TCM recusa dependência carregada fora de ordem. */
  ordem: number;
  campos: CampoSpec[];
  /**
   * ⚠️ NÃO É O "TOTAL" DO MANUAL — é o total CONFERIDO.
   *
   * O PDF traz erros de digitação nas posições (confirmados em MetasArrecada, PagRetencao,
   * UnidOrca e Diaria), e o campo "Total" dele às vezes não bate com a soma das larguras. Este
   * número existe para ser CONFRONTADO com a soma: é `validarArquivoSpec` que decide se a
   * transcrição fecha, e é ele que roda em teste contra as 5 specs.
   */
  totalBytes: number;
  /** A versão do documento de onde a spec foi transcrita. Ex.: "manual-v44-2014". */
  origemSpec: string;
};
