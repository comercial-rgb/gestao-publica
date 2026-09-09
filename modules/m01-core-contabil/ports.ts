import type { Money } from "../../packages/contracts/index.js";
import type { AutorizacaoPort } from "../m16-travamento/porta.js";
import type {
  LancamentoContabil,
  Subsistema,
  TipoPartida,
} from "../../packages/ledger/index.js";

/**
 * PORTS do M01 (hexagonal): interfaces que o domain/serviço consome. Quem
 * implementa com banco é `adapters/prisma`; quem implementa em memória são os
 * testes. Nenhuma referência a Prisma aqui.
 */

export type NaturezaSaldo = "DEVEDORA" | "CREDORA";

/** Uma conta do PCASP resolvida a partir do seu código hierárquico. */
export interface ContaResolvida {
  readonly id: string;
  readonly codigo: string;
  /** INVARIANTE 5 (fail-closed): só `true` pode receber partida. */
  readonly analitica: boolean;
  readonly naturezaSaldo: NaturezaSaldo;
}

export interface ContaRepositoryPort {
  /**
   * Busca contas pelos códigos PCASP. Devolve SÓ as que existem — a ausência é
   * erro (conta inexistente não vira partida, e nunca é criada implicitamente).
   */
  buscarPorCodigos(
    codigos: readonly string[]
  ): Promise<readonly ContaResolvida[]>;
}

/** Partida já resolvida contra o plano de contas: carrega o `contaId`. */
export interface PartidaParaPersistir {
  readonly contaId: string;
  readonly tipo: TipoPartida;
  readonly subsistema: Subsistema;
  readonly valor: Money;
  /**
   * ADITIVO M05: dimensão orçamentária da partida. OPCIONAL — partida
   * patrimonial/controle não tem ficha, e todo lançamento que não a informa
   * continua válido. A coluna `PartidaContabil.fichaId` já existia (M02); o que
   * faltava era o M01 saber GRAVÁ-LA.
   */
  readonly fichaId?: string | undefined;
}

/** Lançamento pronto para persistir. Sempre NOVO — nunca um update. */
export interface LancamentoParaPersistir {
  readonly id: string;
  readonly numeroControle: string;
  readonly dataTransacao: Date;
  readonly historico: string;
  readonly origemTipo: string;
  readonly origemId?: string | undefined;
  readonly estornoDeId?: string | undefined;
  readonly criadoPor: string;
  readonly partidas: readonly PartidaParaPersistir[];
}

export interface LancamentoRepositoryPort {
  /**
   * INVARIANTE 2: persiste lançamento + partidas ATOMICAMENTE, como registro
   * novo. A port não expõe `atualizar` nem `remover` — de propósito.
   */
  persistir(lancamento: LancamentoParaPersistir): Promise<string>;

  /**
   * Busca um lançamento com suas partidas E a lista de estornos que apontam
   * para ele. `estornos` DEVE vir preenchido — é dele que sai o "já foi
   * estornado?" (INVARIANTE 3: não existe campo `estornadoPorId`).
   */
  buscar(id: string): Promise<LancamentoContabil | null>;
}

/** Geração de id na borda — o domain puro não gera id. */
export interface IdPort {
  novo(): string;
}

export interface M01Deps {
  /**
   * ⚠️ A PORTA DA AUTORIZAÇÃO (M16 · TR 4.56 · 6.4/6.5). OBRIGATÓRIA — e de propósito.
   *
   * Ela NÃO é opcional como outras portas do repositório: uma porta de autorização que PODE
   * faltar é uma porta que um dia VAI faltar — e nesse dia o serviço autoriza em silêncio.
   * Quem monta `deps` tem de dizer quem responde por "ele pode isto, aqui?". Mesmo num teste
   * unitário, em que a resposta é um stub que deixa passar: aí a permissividade está ESCRITA,
   * e quem lê o teste a vê.
   */
  readonly autz: AutorizacaoPort;
  readonly contas: ContaRepositoryPort;
  readonly lancamentos: LancamentoRepositoryPort;
  readonly ids: IdPort;
}
