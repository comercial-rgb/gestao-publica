import type { AutorizacaoPort } from "../m16-travamento/porta.js";
import type { PapelDePessoa } from "./dominio.js";

/**
 * M19 — as PORTS. Nenhuma referência a Prisma: é o que permite testar o serviço sem banco
 * e é o que impede a regra de vazar para o adapter.
 */

export interface DadosCadastrais {
  readonly nome: string;
  readonly nomeFantasia?: string | undefined;
  readonly email?: string | undefined;
  readonly telefone?: string | undefined;
  readonly logradouro?: string | undefined;
  readonly numero?: string | undefined;
  readonly complemento?: string | undefined;
  readonly bairro?: string | undefined;
  readonly municipio?: string | undefined;
  readonly uf?: string | undefined;
  readonly cep?: string | undefined;
  readonly ativa: boolean;
}

export interface PessoaResumo {
  readonly id: string;
  readonly documento: string;
  readonly tipo: "FISICA" | "JURIDICA";
  readonly nome: string;
  readonly ativa: boolean;
  readonly papeis: readonly PapelDePessoa[];
}

export interface VersaoDoHistorico {
  readonly id: string;
  readonly nome: string;
  readonly ativa: boolean;
  readonly motivo: string | null;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

export interface MovimentoDoHistorico {
  readonly id: string;
  readonly papel: PapelDePessoa;
  readonly movimento: "CONCEDIDO" | "ENCERRADO";
  readonly data: Date;
  readonly motivo: string | null;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

export interface PessoaRepositoryPort {
  /**
   * Cria a pessoa E a primeira versão na MESMA transação.
   *
   * ⚠️ PORT GROSSA, e pela mesma razão do M05: uma pessoa sem versão nenhuma é um
   * cadastro sem nome — um documento com id. Se as duas escritas fossem chamadas
   * separadas, existiria um instante em que ela existe assim, e uma falha entre as duas
   * a deixaria assim para sempre.
   */
  cadastrar(p: {
    readonly documento: string;
    readonly tipo: "FISICA" | "JURIDICA";
    readonly dados: DadosCadastrais;
    readonly criadoPor: string;
  }): Promise<{ readonly pessoaId: string; readonly versaoId: string }>;

  /** Acrescenta uma VERSÃO. Não altera a existente — é o append-only do cadastro. */
  versionar(p: {
    readonly pessoaId: string;
    readonly dados: DadosCadastrais;
    readonly motivo: string;
    readonly criadoPor: string;
  }): Promise<{ readonly versaoId: string }>;

  moverPapel(p: {
    readonly pessoaId: string;
    readonly papel: PapelDePessoa;
    readonly movimento: "CONCEDIDO" | "ENCERRADO";
    readonly data: Date;
    readonly motivo?: string | undefined;
    readonly criadoPor: string;
  }): Promise<{ readonly movimentoId: string }>;

  /** `null` quando não existe — quem reclama do id inexistente é o serviço. */
  buscarPorId(pessoaId: string): Promise<PessoaResumo | null>;
  buscarPorDocumento(documento: string): Promise<PessoaResumo | null>;

  historico(pessoaId: string): Promise<{
    readonly versoes: readonly VersaoDoHistorico[];
    readonly movimentos: readonly MovimentoDoHistorico[];
  }>;
}

export interface IdPort {
  novo(): string;
}

export interface M19Deps {
  readonly autz: AutorizacaoPort;
  readonly pessoas: PessoaRepositoryPort;
  readonly ids: IdPort;
}
