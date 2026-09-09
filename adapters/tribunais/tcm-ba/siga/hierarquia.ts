/**
 * ═══ ⚠️ OS NOMES DOS CAMPOS DO SIGA MENTEM. ESTE ARQUIVO É A ÚNICA DEFESA. ═══
 *
 * No layout do TCM-BA, dois campos da hierarquia funcional-programática têm nome TROCADO:
 *
 *   | campo do SIGA    | o que o nome sugere | o que ELE RECEBE |
 *   |------------------|---------------------|------------------|
 *   | `cd_Funcao`      | Função              | Função      ✅   |
 *   | `cd_Programa`    | Programa            | **SubFunção** ❌ |
 *   | `cd_SubPrograma` | SubPrograma         | **Programa**  ❌ |
 *
 * Aparece em ProjAtv (50), Dotacao (22), Empenho (23), AltOrc, DotCont e DotConv.
 *
 * ═══ POR QUE UMA FUNÇÃO, E NÃO UM COMENTÁRIO NA SPEC ═══
 * Um comentário avisa quem lê. O problema é que ninguém LÊ a spec ao escrever o mapper: escreve
 * `cd_Programa: programa.codigo` porque é o que o nome pede, e o TypeScript concorda (as duas
 * pontas são `string`). O arquivo sai com largura certa, posição certa, formato certo — e a
 * subfunção no lugar do programa. Nenhum teste de geometria acusa, nenhum teste de negócio acusa,
 * e o TCM aceita: para ele os dois são códigos numéricos válidos.
 *
 * O erro só apareceria num relatório do Tribunal, meses depois, com a despesa classificada na
 * função errada — e aí ninguém liga o efeito à causa.
 *
 * Por isso a tradução vive AQUI, numa função que recebe os três valores por NOME DE DOMÍNIO
 * (`funcao`, `subfuncao`, `programa`) e devolve os três campos já com a troca aplicada. Quem
 * escreve o mapper não tem a oportunidade de errar: ele nunca digita `cd_Programa`.
 *
 * ⚠️ REGRA: NENHUM mapper deve atribuir `cd_Programa` ou `cd_SubPrograma` diretamente. O teste
 * `hierarquia.test.ts` faz cumprir isso varrendo o adapter.
 */

/** A hierarquia como o DOMÍNIO a conhece — nomes honestos. */
export interface HierarquiaFuncional {
  /** Função de governo (2 dígitos). Ex.: "04" — Administração. */
  readonly funcao: string;
  /** SubFunção (3 dígitos). Ex.: "122" — Administração Geral. */
  readonly subfuncao: string;
  /** Programa (4 dígitos). Ex.: "0001" — Gestão Administrativa. */
  readonly programa: string;
}

/** Os campos como o SIGA os nomeia — já com a troca aplicada. */
export interface CamposHierarquiaSiga {
  readonly cd_Funcao: string;
  /** ⚠️ Recebe a SUBFUNÇÃO, apesar do nome. */
  readonly cd_Programa: string;
  /** ⚠️ Recebe o PROGRAMA, apesar do nome. */
  readonly cd_SubPrograma: string;
}

/**
 * TRADUZ A HIERARQUIA DO DOMÍNIO PARA OS CAMPOS DO SIGA, APLICANDO A TROCA.
 *
 * É o ÚNICO caminho autorizado para preencher `cd_Programa` e `cd_SubPrograma` em qualquer
 * arquivo do SIGA. Ver o docblock do arquivo para o porquê.
 */
export function camposHierarquiaSiga(h: HierarquiaFuncional): CamposHierarquiaSiga {
  return {
    cd_Funcao: h.funcao,
    // A TROCA. Não é engano: o campo chamado "Programa" carrega a SUBFUNÇÃO.
    cd_Programa: h.subfuncao,
    cd_SubPrograma: h.programa,
  };
}
