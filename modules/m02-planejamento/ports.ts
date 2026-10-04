import type { Money } from "../../packages/contracts/index.js";
import type { AutorizacaoPort } from "../m16-travamento/porta.js";
import type { CriarFichaDados } from "./dominio.js";

/**
 * PORTS do M02 (hexagonal). Nenhuma referência a Prisma aqui — quem implementa
 * com banco é `adapter-prisma.ts`; quem implementa em memória são os testes.
 */

/** Um componente da classificação resolvido: do código para o id. */
export interface ItemResolvido {
  readonly id: string;
}

/** A UO carrega o órgão a que pertence — usado para a checagem de coerência. */
export interface UnidadeResolvida extends ItemResolvido {
  readonly orgaoId: string;
}

/**
 * Resultado da resolução. `null` = código não existe no plano — o serviço
 * transforma isso em erro (fail-closed), listando o que faltou.
 * `co` vem `null` tanto quando não foi pedido quanto quando não existe; quem
 * distingue é o serviço, olhando se o input trazia `co`.
 */
export interface ResolucaoClassificacao {
  readonly orgao: ItemResolvido | null;
  readonly unidadeOrc: UnidadeResolvida | null;
  readonly funcao: ItemResolvido | null;
  readonly subfuncao: ItemResolvido | null;
  readonly programa: ItemResolvido | null;
  readonly acao: ItemResolvido | null;
  readonly naturezaDespesa: ItemResolvido | null;
  readonly fonte: ItemResolvido | null;
  readonly co: ItemResolvido | null;
}

export interface ResolucaoReceita {
  readonly naturezaReceita: ItemResolvido | null;
  readonly fonte: ItemResolvido | null;
}

export interface ClassificacaoRepositoryPort {
  resolver(
    componentes: CriarFichaDados["classificacao"]
  ): Promise<ResolucaoClassificacao>;

  resolverReceita(componentes: {
    readonly naturezaReceita: string;
    readonly fonte: string;
  }): Promise<ResolucaoReceita>;
}

/** Ficha pronta para persistir — componentes já resolvidos em ids. */
export interface FichaParaPersistir {
  readonly exercicio: number;
  readonly numero: number;
  readonly orgaoId: string;
  readonly unidadeOrcId: string;
  readonly funcaoId: string;
  readonly subfuncaoId: string;
  readonly programaId: string;
  readonly acaoId: string;
  readonly naturezaDespesaId: string;
  readonly fonteId: string;
  readonly coId?: string | undefined;
  readonly exercicioFonte: number;
  readonly valorDotado: Money;
}

export interface FichaRepositoryPort {
  /**
   * Persiste a ficha. Deve traduzir violação da unicidade do banco
   * (`uq_ficha_sagres` e `exercicio+numero`) em erro de domínio legível —
   * a integridade é do banco, a mensagem é nossa.
   */
  /**
   * @param autor quem criou a ficha — ele ASSINA a perna da dotação inicial no razão.
   *
   * ⚠️ O PARÂMETRO ENTROU NA V17, E A AUSÊNCIA ERA UM DEFEITO MEDIDO. O adapter gravava a perna
   * da dotação com `criadoPor: "LOA"`, um literal, e o funil do razão exige que a identidade
   * EXISTA (`exigirUsuarioAtivo`). Como `"LOA"` só é semeado por `test/usuarios-teste.ts`, criar
   * ficha DOTADA passava na suíte e estourava em qualquer banco real com *"USUÁRIO NÃO
   * CADASTRADO: LOA"*. A ficha da TELA escapava por acidente: ela nasce com 0,00, e a dotação
   * zero não toca o razão.
   *
   * ⚠️ E ELE É PARÂMETRO, NÃO CAMPO DE `FichaParaPersistir`: a mesma interface descreve a
   * LEITURA (`buscarPorNumero`), e `FichaOrcamentaria` não tem coluna de autor. Pôr o campo lá
   * obrigaria a inventar um autor na leitura — o oposto do que esta correção faz.
   *
   * Quem dota é a lei; quem ASSINA o registro é quem abriu a ficha, e é isso que o funil cobra.
   */
  criar(ficha: FichaParaPersistir, autor: string): Promise<string>;
  buscarPorNumero(
    exercicio: number,
    numero: number
  ): Promise<FichaParaPersistir & { readonly id: string } | null>;
}

export interface ReceitaPrevistaParaPersistir {
  readonly exercicio: number;
  readonly naturezaReceitaId: string;
  readonly fonteId: string;
  readonly exercicioFonte: number;
  readonly tipoReceita: "ORCAMENTARIA" | "INTRA_ORCAMENTARIA" | "DEDUCAO";
  readonly valorPrevisto: Money;
}

/** Uma REPREVISÃO (ajuste append-only da previsão). O valor tem SINAL: + aumenta, − reduz. */
export interface ReprevisaoParaPersistir {
  readonly exercicio: number;
  readonly naturezaCodigo: string;
  readonly fonteCodigo: string;
  readonly tipoReceita: "ORCAMENTARIA" | "INTRA_ORCAMENTARIA" | "DEDUCAO";
  readonly valorAjuste: Money;
  readonly motivo: string;
  readonly data: Date;
  readonly criadoPor: string;
}

export interface ReceitaPrevistaRepositoryPort {
  /** Cria a linha e, se ela for receita (não dedução) com valor, a previsão no razão, na mesma transação. */
  criar(receita: ReceitaPrevistaParaPersistir, autor: string): Promise<string>;
  /** Grava uma reprevisão (append-only) — nunca edita/apaga. */
  reprevisar(r: ReprevisaoParaPersistir): Promise<string>;
}

export interface M02Deps {
  /** ⚠️ A porta da AUTORIZAÇÃO (M16 · TR 4.56 · 6.4/6.5). Obrigatória — ver `M01Deps`. */
  readonly autz: AutorizacaoPort;
  readonly classificacao: ClassificacaoRepositoryPort;
  readonly fichas: FichaRepositoryPort;
  readonly receitas: ReceitaPrevistaRepositoryPort;
}
