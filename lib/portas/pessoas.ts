import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import {
  listarPessoas,
  type FiltroDePessoas,
  type PessoaNaLista,
} from "../../modules/m19-pessoas/consultas";
import { criarM19Deps } from "../../modules/m19-pessoas/adapter-prisma";
import {
  alterarPessoa,
  cadastrarPessoa,
  moverPapelDePessoa,
} from "../../modules/m19-pessoas/servico";
import { formatarDocumento } from "../../packages/documento/index";
import type { PapelDePessoa } from "../../modules/m19-pessoas/dominio";
import type {
  MovimentoDoHistorico,
  PessoaResumo,
  VersaoDoHistorico,
} from "../../modules/m19-pessoas/ports";

/**
 * PORTA — PESSOAS E CREDORES (M19).
 *
 * ⚠️ NENHUM GUARD MORA AQUI. Documento válido, papel já vigente, documento duplicado —
 * tudo do domínio, e o erro dele sobe para a tela com a mensagem que ele escreveu. Uma
 * porta que "conferisse antes" duplicaria a regra e divergiria dela no primeiro ajuste.
 *
 * ⚠️ E A PORTA NÃO DERIVA NADA. Os papéis vigentes e a versão vigente vêm do módulo; a
 * porta só converte para o formato que a tela consome. Uma derivação aqui seria a segunda
 * verdade sobre o mesmo cadastro.
 */

export { PortaSemBancoError };
export type { PapelDePessoa };

/** A pessoa como a TELA a consome. O documento já vem formatado para leitura. */
export interface PessoaDaTela {
  readonly id: string;
  readonly documento: string;
  readonly documentoFormatado: string;
  readonly tipo: "FISICA" | "JURIDICA";
  readonly nome: string;
  readonly ativa: boolean;
  readonly papeis: readonly PapelDePessoa[];
}

export interface HistoricoDaTela {
  readonly versoes: readonly VersaoDoHistorico[];
  readonly movimentos: readonly MovimentoDoHistorico[];
}

function paraTela(p: PessoaNaLista | PessoaResumo): PessoaDaTela {
  return {
    id: p.id,
    documento: p.documento,
    documentoFormatado: formatarDocumento(p.documento),
    tipo: p.tipo,
    nome: p.nome,
    ativa: p.ativa,
    papeis: p.papeis,
  };
}

export async function listarPessoasDaTela(filtro: FiltroDePessoas = {}): Promise<{
  readonly itens: readonly PessoaDaTela[];
  readonly total: number;
}> {
  const r = await listarPessoas(cliente(), filtro);
  return { itens: r.itens.map(paraTela), total: r.total };
}

export async function buscarPessoaDaTela(
  pessoaId: string
): Promise<PessoaDaTela | null> {
  const p = await criarM19Deps(cliente()).pessoas.buscarPorId(pessoaId);
  return p === null ? null : paraTela(p);
}

export async function historicoDaPessoa(pessoaId: string): Promise<HistoricoDaTela> {
  return criarM19Deps(cliente()).pessoas.historico(pessoaId);
}

// ── ESCRITA ─────────────────────────────────────────────────────────────────
//
// Toda escrita passa por `comEscritaAutenticada`: exige sessão (fail-closed), injeta o
// `criadoPor` REAL — nunca um vindo do formulário — e grava o `RegistroDeOperacao`.

export interface DadosDoFormulario {
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
}

export async function registrarPessoa(
  input: DadosDoFormulario & { readonly documento: string }
): Promise<string> {
  return comEscritaAutenticada("CADASTRAR_PESSOA", async (criadoPor) => {
    const r = await cadastrarPessoa({ ...input, criadoPor }, criarM19Deps(cliente()));
    return r.pessoaId;
  });
}

export async function registrarAlteracaoDePessoa(
  input: DadosDoFormulario & {
    readonly pessoaId: string;
    readonly ativa: boolean;
    readonly motivo: string;
  }
): Promise<string> {
  return comEscritaAutenticada("ALTERAR_PESSOA", async (criadoPor) => {
    const r = await alterarPessoa({ ...input, criadoPor }, criarM19Deps(cliente()));
    return r.versaoId;
  });
}

export async function registrarMovimentoDePapel(input: {
  readonly pessoaId: string;
  readonly papel: PapelDePessoa;
  readonly movimento: "CONCEDIDO" | "ENCERRADO";
  readonly data: Date;
  readonly motivo?: string | undefined;
}): Promise<string> {
  return comEscritaAutenticada("MOVER_PAPEL_DE_PESSOA", async (criadoPor) => {
    const r = await moverPapelDePessoa(
      { ...input, criadoPor },
      criarM19Deps(cliente())
    );
    return r.movimentoId;
  });
}
