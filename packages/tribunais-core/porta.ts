/**
 * A PORTA DE TRIBUNAL — o contrato que TODO Tribunal de Contas cumpre, e nada além dele.
 *
 * ═══ POR QUE ESTA PORTA EXISTE ═══
 * Até aqui o sistema só conhecia UM tribunal: o `lib/portas/sagres.ts` importava o gerador do
 * TCE-PB por nome, de forma estática, e a identidade do tribunal era o próprio `import`. Com um
 * segundo ente no monorepo (Lapão/BA, TCM-BA), essa amarração deixa de ser possível: o mesmo
 * binário atende dois entes cujo tribunal difere, e QUEM é o tribunal passa a ser DADO do ente
 * (`EnteConfig.tribunalCodigo`), não uma linha de import.
 *
 * ⚠️ ESTE ARQUIVO NÃO CONHECE TRIBUNAL ALGUM. Nenhum import de adapter, nenhuma menção a SAGRES,
 * a PB ou a BA. É só vocabulário. Quem casa código com implementação é o `registro.ts` — e a
 * separação é deliberada: um adapter importa ESTE arquivo (só tipos, apagados na compilação), e
 * por isso nunca há ciclo em runtime entre a porta e quem a implementa.
 */

/**
 * A COMPETÊNCIA da remessa — UNION ETIQUETADA, e a etiqueta é o que impede o estado sem sentido.
 *
 * ═══ ⚠️ POR QUE NÃO É `{ exercicio, mes?, dia? }` ═══
 * Aquela forma deixa `{ exercicio: 2026, dia: 15 }` REPRESENTÁVEL — dia sem mês, que não significa
 * nada e que alguém constrói mais cedo ou mais tarde. O tipo tem de recusar isso, não um teste.
 *
 * Com a etiqueta ganham-se três coisas que a forma opcional não dá:
 *   · dia-sem-mês é INCONSTRUÍVEL — o compilador barra antes de existir;
 *   · o gerador faz `switch (c.granularidade)` e o compilador acusa o caso não tratado quando uma
 *     granularidade nova nascer (um `SEMANAL`, um `BIMESTRAL`);
 *   · um tribunal pode RECUSAR uma granularidade explicitamente ("o SIGA não recebe remessa
 *     diária") em vez de ignorar em silêncio um campo que não sabe ler.
 *
 * Números, não `Date`: uma competência é um rótulo de calendário civil, e `Date` carrega fuso e
 * hora que não significam nada aqui — foi por confundir os dois que o mensal já normalizou errado
 * antes (ver `competenciaMensalDe` em `lib/portas/sagres.ts`).
 */
export type Competencia =
  | { readonly granularidade: "ANUAL"; readonly exercicio: number }
  | { readonly granularidade: "MENSAL"; readonly exercicio: number; readonly mes: number }
  | {
      readonly granularidade: "DIARIA";
      readonly exercicio: number;
      readonly mes: number;
      readonly dia: number;
    };

/**
 * O PESO de uma inconsistência — e a diferença entre as duas é o que o executor faz com elas.
 *
 * `BLOQUEIA` impede a remessa: o tribunal recusaria o arquivo, então entregá-lo seria só adiar a
 * recusa. `ALERTA` acompanha o pacote e é exibido a quem assina, sem impedir nada.
 */
export type Severidade = "BLOQUEIA" | "ALERTA";

/**
 * UMA INCONSISTÊNCIA APONTADA — nunca corrigida.
 *
 * ═══ ⚠️ A IDENTIDADE É DO REGISTRO DE DOMÍNIO, NÃO DA LINHA DO ARQUIVO ═══
 * `origemTabela` + `origemId` (cuid) apontam para o FATO no banco — o empenho, a conta, a fonte.
 * É o que `validar()` pode oferecer, porque ele roda ANTES de o arquivo existir: falar em "linha
 * 12" quando não há arquivo é falar de nada, e foi esse o erro da primeira versão desta porta.
 *
 * `arquivo` e `linha` são OPCIONAIS e preenchidos SOMENTE por `gerar()`, que já sabe onde o fato
 * caiu na remessa. Assim a mesma inconsistência serve às duas fases sem mentir em nenhuma: antes,
 * ela diz "empenho cuid-x"; depois, ela diz "empenho cuid-x, Empenho linha 12".
 *
 * ⚠️ `mensagem` É PARA O CONTADOR, NÃO PARA O DESENVOLVEDOR. Quem lê isto decide se refaz o
 * empenho ou se cadastra o de/para — não vai abrir o depurador. Nada de nome de variável, stack
 * ou jargão de código.
 */
export interface Inconsistencia {
  /**
   * O código estável da regra, no formato `{TRIBUNAL}-{E|A}{NNN}` — `E` para BLOQUEIA, `A` para
   * ALERTA. Ex.: `SIGA-E014`, `SAGRES-A007`.
   *
   * ⚠️ O NAMESPACE É POR ADAPTER, e é isso que permite numeração livre dentro de cada um sem risco
   * de colisão entre tribunais. O código é o que a tela filtra, o que a documentação indexa e o que
   * o contador cita ao pedir ajuda — por isso é ESTÁVEL: a mensagem pode ser reescrita, o código não.
   */
  readonly codigo: string;
  readonly severidade: Severidade;
  /** A tabela de domínio de onde o fato veio. Ex.: "Empenho". */
  readonly origemTabela: string;
  /** O cuid do registro. SEMPRE presente — é a única forma de o humano achar o fato. */
  readonly origemId: string;
  /** O campo do layout, quando a inconsistência é de um campo específico. */
  readonly campo?: string;
  /** Em português, para quem assina a remessa. */
  readonly mensagem: string;
  /**
   * ⚠️ PREENCHIDOS SÓ POR `gerar()`. Em `validar()` o arquivo ainda não existe — ver o docblock.
   */
  readonly arquivo?: string;
  /** O sequencial do registro dentro do arquivo. */
  readonly linha?: number;
}

/**
 * O MÓDULO DE IMPORTAÇÃO do tribunal — e a ordem entre eles é REGRA, não organização.
 *
 * O SIGA (TCM-BA) carrega em cascata: BASICOS → PROGRAMA → ORCAMENTO → CONSUMO → INFORMES. Um
 * arquivo cujo pré-requisito ainda não entrou é RECUSADO — o `PagEmp2` referencia uma conta
 * contábil que só existe depois do `ContaCont`, do módulo BASICOS.
 *
 * ⚠️ `NAO_APLICAVEL` NÃO É "SEM VALOR" — É O VALOR CERTO PARA QUEM NÃO TEM MÓDULOS. O SAGRES
 * (TCE-PB) entrega um ZIP único; o que distingue seus arquivos é PERIODICIDADE, não módulo.
 * As duas alternativas eram piores:
 *   · carimbar "INFORMES" no SAGRES seria DADO FALSO — e dado falso sobrevive ao comentário que
 *     o explica, porque o comentário não viaja no objeto;
 *   · tornar o campo opcional empurraria a checagem de `undefined` para todo consumidor, e o dia
 *     em que um deles esquecesse, a remessa sairia fora de ordem em silêncio.
 * Obrigatório e honesto: quem ordena faz `switch` e trata `NAO_APLICAVEL` explicitamente.
 */
export type ModuloRemessa =
  | "BASICOS"
  | "PROGRAMA"
  | "ORCAMENTO"
  | "CONSUMO"
  | "INFORMES"
  | "NAO_APLICAVEL";

/** UM ARQUIVO da remessa, já serializado. `conteudo` são os bytes finais — nada de string. */
export interface ArquivoRemessa {
  /** O nome oficial exigido pelo tribunal. */
  readonly nome: string;
  readonly conteudo: Buffer;
  /** Quantos registros o arquivo carrega (0 é legítimo: vazio, não omitido). */
  readonly registros: number;
  /**
   * ⚠️ A DEPENDÊNCIA DE IMPORTAÇÃO VIAJA COM O ARQUIVO.
   *
   * `modulo` + `ordem` dizem QUANDO este arquivo pode ser carregado. Eles moram AQUI, e não numa
   * lista à parte, porque a ordem é propriedade do arquivo: quem recebe um `PacoteExport` e o
   * transmite não pode precisar consultar outra estrutura para saber a sequência — e uma segunda
   * estrutura é uma segunda verdade, que um dia discorda desta.
   */
  readonly ordem: number;
  readonly modulo: ModuloRemessa;
}

/**
 * UMA RETRANCA — o DOCUMENTO que acompanha a remessa (edital, contrato, parecer, ata).
 *
 * ⚠️ É O DOCUMENTO EM SI, NÃO UM DESCRITOR DELE. Canal e-TCM (BA): o Tribunal recebe o PDF
 * amarrado a uma retranca — o identificador do processo/peça no protocolo dele. Sem os bytes, não
 * há o que enviar.
 *
 * `dpiMax` existe porque o e-TCM impõe teto de resolução: um PDF digitalizado acima do limite é
 * recusado no upload, e descobrir isso na hora do envio é tarde.
 */
export interface DocumentoRetranca {
  /** A retranca no protocolo do tribunal. Ex.: "PL0023-2026". */
  readonly retranca: string;
  /** Ex.: "PL0023-2026-edital.pdf". */
  readonly nomeArquivo: string;
  readonly conteudo: Buffer;
  /** O teto de resolução aceito pelo canal. */
  readonly dpiMax: number;
}

/**
 * O QUE O PACOTE PODE ALEGAR SOBRE SI MESMO (DIRETIVA §7).
 *
 * ⚠️ SÓ O PRIMEIRO É CONSTRUÍVEL HOJE, e isso é a regra, não uma limitação temporária mal
 * resolvida. Nenhum código deste repositório produz `SUBMETIDO_AO_TRIBUNAL` nem
 * `ACEITO_PELO_TRIBUNAL` — não há transporte real, logo não há recibo, logo não há aceitação.
 *
 * Eles existem no TIPO para que, quando o transporte chegar, o compilador mostre exatamente onde
 * ligá-los. Enquanto isso, é IMPOSSÍVEL um pacote alegar aceitação: não há caminho de código que
 * construa o valor.
 *
 * ⚠️ E ISTO NÃO É REDUNDÂNCIA DO README. O README é lido por gente, uma vez; a `natureza` VIAJA
 * COM O ARTEFATO e pode ser renderizada em manifesto, PDF ou tela. Um pacote que circule sem essa
 * marca é um pacote que alguém, em algum momento, vai tratar como homologado.
 */
export type NaturezaPacote =
  | "FORMATO_OFICIAL_GERADO_E_VALIDADO_LOCALMENTE"
  | "SUBMETIDO_AO_TRIBUNAL"
  | "ACEITO_PELO_TRIBUNAL";

/** O PACOTE PRONTO — o que sai do exportador e vai para a mão de quem assina. */
export interface PacoteExport {
  readonly tribunal: string;
  readonly competencia: Competencia;
  /** A versão do layout com que os arquivos foram gerados. */
  readonly layoutVersao: string;
  readonly arquivos: readonly ArquivoRemessa[];
  /** A impressão digital do pacote — determinística: a mesma massa dá o mesmo hash. */
  readonly hash: string;
  /**
   * ⚠️ INJETADO, NUNCA `new Date()` LÁ DENTRO. Um pacote tem de ser REPRODUZÍVEL: quem auditar
   * amanhã gera o mesmo `hash` a partir da mesma massa. Um relógio dentro do gerador tornaria isso
   * impossível — e é por isso que o `hash` NÃO inclui este campo.
   */
  readonly geradoEm: Date;
  readonly natureza: NaturezaPacote;
}

/**
 * O EXPORTADOR DE UM TRIBUNAL — a única superfície que o executor conhece.
 *
 * ⚠️ `validar` E `gerar` SÃO SEPARADOS DE PROPÓSITO. O executor precisa saber se há BLOQUEIO
 * ANTES de gastar a geração, e precisa poder devolver os bloqueios sem produzir arquivo nenhum.
 * Fundir os dois obrigaria a gerar para descobrir que não se devia gerar.
 */
export interface ExportadorTribunal {
  /** O código do tribunal, no formato `AAA-UF` (ex.: "TCE-PB"). */
  readonly codigo: string;
  /** A UF de jurisdição, 2 letras. */
  readonly uf: string;
  /** A versão do layout vigente — o que o tribunal publica e o gerador implementa. */
  readonly layoutVersao: string;

  /** Aponta as inconsistências da competência. NÃO gera e NÃO conserta. */
  validar(competencia: Competencia): Promise<readonly Inconsistencia[]>;

  /** Produz o pacote da competência. Determinístico: mesma massa, mesmos bytes. */
  gerar(competencia: Competencia): Promise<PacoteExport>;

  /**
   * Os documentos com retranca (canal e-TCM). OPCIONAL: um tribunal que só recebe dados não o
   * implementa, e o executor não deve inventar uma lista vazia por ele.
   */
  gerarDocumentos?(competencia: Competencia): Promise<readonly DocumentoRetranca[]>;
}
