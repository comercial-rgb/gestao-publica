import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { exigirLeituraDoEnte, exigirLeituraEmAlgumEscopo } from "./leitura";
import { acoesPermitidas } from "./molde";
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

/**
 * V37 — O DOCUMENTO NO CADASTRO, para o atalho "cadastrar a partir do aviso".
 *
 * Quem digita um CPF/CNPJ que a busca de credores não acha está em um de dois casos, e o atalho trata os
 * dois: a pessoa NÃO EXISTE (cadastra-se, com o papel), ou EXISTE sem o papel vigente (só se concede o
 * papel — cadastrar de novo seria recusado por documento duplicado). Papel vigente é a mesma regra do
 * catálogo de credores: o último movimento do papel, pela data do ato, é CONCEDIDO.
 */
export interface DocumentoNoCadastro {
  readonly pessoaId: string;
  readonly nome: string;
  readonly documentoFormatado: string;
  readonly papeisVigentes: readonly PapelDePessoa[];
}

export async function documentoNoCadastro(documento: string): Promise<DocumentoNoCadastro | null> {
  await exigirLeituraDoEnte("CONSULTAR_CADASTROS");
  const digitos = documento.replace(/\D/g, "");
  if (digitos.length !== 11 && digitos.length !== 14) return null;
  const p = await cliente().pessoa.findUnique({
    where: { documento: digitos },
    select: {
      id: true,
      documento: true,
      versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } },
      movimentos: { orderBy: [{ data: "desc" }, { criadoEm: "desc" }], select: { papel: true, movimento: true } },
    },
  });
  if (p === null) return null;
  const ultimo = new Map<PapelDePessoa, string>();
  for (const m of p.movimentos) if (!ultimo.has(m.papel)) ultimo.set(m.papel, m.movimento);
  return {
    pessoaId: p.id,
    nome: p.versoes[0]?.nome ?? "",
    documentoFormatado: formatarDocumento(p.documento),
    papeisVigentes: [...ultimo].filter(([, mov]) => mov === "CONCEDIDO").map(([papel]) => papel),
  };
}

/**
 * V37 — quem pode usar o atalho "cadastrar a partir do aviso": precisa das DUAS ações que ele executa
 * (cadastrar a pessoa e conceder o papel). Sem uma delas a tela não oferece o atalho; a gravação, de
 * todo modo, confere cada uma no servidor.
 */
export async function podeUsarAtalhoDeCadastro(): Promise<boolean> {
  try {
    const p = await acoesPermitidas(["CADASTRAR_PESSOA", "MOVER_PAPEL_DE_PESSOA"]);
    return p.has("CADASTRAR_PESSOA") && p.has("MOVER_PAPEL_DE_PESSOA");
  } catch {
    return false;
  }
}

/**
 * V37 — o ID da pessoa pelo documento, para a volta do atalho de cadastro nas telas que gravam a pessoa por id
 * (ordem de compra, formação de ordem). Leitura de licitações em algum escopo; documento malformado ou ausente: nada.
 */
export async function pessoaIdPeloDocumento(documento: string): Promise<string | undefined> {
  await exigirLeituraEmAlgumEscopo("CONSULTAR_LICITACOES");
  const digitos = documento.replace(/\D/g, "");
  if (digitos.length !== 11 && digitos.length !== 14) return undefined;
  const p = await cliente().pessoa.findUnique({ where: { documento: digitos }, select: { id: true } });
  return p?.id;
}
