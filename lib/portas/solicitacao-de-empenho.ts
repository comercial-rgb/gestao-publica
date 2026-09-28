import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { nomesDosCredores } from "./empenho";
import {
  autorizarSolicitacaoDeEmpenho,
  cancelarSolicitacaoDeEmpenho,
  listarSolicitacoesDeEmpenho,
  rejeitarSolicitacaoDeEmpenho,
  solicitarEmpenho,
  type SolicitacaoNaLista,
} from "../../modules/m05-despesa/solicitacao-de-empenho";

/**
 * PORTA — A SOLICITAÇÃO DE EMPENHO (M05, V22).
 *
 * ⚠️ NENHUMA REGRA AQUI. Segregação (quem solicita não decide), escopo pela unidade da ficha,
 * situação derivada e a conferência na emissão são do domínio, dentro da transação. A porta só
 * troca `Decimal` por `string`, acrescenta o nome do credor do cadastro e injeta o autor real.
 */

export { PortaSemBancoError };

export interface SolicitacaoDaTela {
  readonly id: string;
  readonly numero: string;
  readonly situacao: string;
  readonly fichaNumero: number;
  readonly unidadeCodigo: string;
  readonly fonteCodigo: string;
  readonly naturezaCodigo: string;
  readonly credorCpfCnpj: string;
  readonly credorNome: string | null;
  readonly valor: string;
  readonly tipo: string;
  readonly categoria: string | null;
  readonly historico: string;
  readonly vinculos: readonly { readonly rotulo: string; readonly valor: string }[];
  readonly solicitadaPor: string;
  readonly solicitadaEm: Date;
  readonly decididaPor: string | null;
  readonly decididaEm: Date | null;
  readonly motivo: string | null;
  readonly empenhoId: string | null;
  readonly empenhoNumero: string | null;
  readonly empenhoAnulado: boolean;
}

export async function lerSolicitacoesDeEmpenho(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
}): Promise<readonly SolicitacaoDaTela[]> {
  const linhas = await listarSolicitacoesDeEmpenho(cliente(), {
    exercicio: p.exercicio,
    ...(p.unidadeCodigo !== undefined ? { unidadeCodigo: p.unidadeCodigo } : {}),
  });
  const nomes = await nomesDosCredores(linhas.map((l) => l.credorCpfCnpj));
  return linhas.map((l) => paraTela(l, nomes.get(l.credorCpfCnpj) ?? null));
}

function paraTela(s: SolicitacaoNaLista, credorNome: string | null): SolicitacaoDaTela {
  const vinculos: { rotulo: string; valor: string }[] = [];
  if (s.contrato !== null) vinculos.push({ rotulo: "Contrato", valor: s.contrato.numero });
  if (s.ordemDeCompra !== null) vinculos.push({ rotulo: "Ordem de compra", valor: s.ordemDeCompra.numero });
  if (s.convenio !== null) vinculos.push({ rotulo: "Convênio", valor: s.convenio.identificador });
  if (s.obra !== null) vinculos.push({ rotulo: "Obra", valor: s.obra.identificador });
  if (s.divida !== null) vinculos.push({ rotulo: "Dívida fundada", valor: s.divida.identificador });
  return {
    id: s.id,
    numero: s.numero,
    situacao: s.situacao,
    fichaNumero: s.fichaNumero,
    unidadeCodigo: s.unidadeCodigo,
    fonteCodigo: s.fonteCodigo,
    naturezaCodigo: s.naturezaCodigo,
    credorCpfCnpj: s.credorCpfCnpj,
    credorNome,
    valor: s.valor.toFixed(2),
    tipo: s.tipo,
    categoria: s.categoriaOrdemCronologica,
    historico: s.historico,
    vinculos,
    solicitadaPor: s.solicitadaPor,
    solicitadaEm: s.solicitadaEm,
    decididaPor: s.decididaPor,
    decididaEm: s.decididaEm,
    motivo: s.motivo,
    empenhoId: s.empenhoId,
    empenhoNumero: s.empenhoNumero,
    empenhoAnulado: s.empenhoAnulado,
  };
}

export async function registrarSolicitacaoDeEmpenho(input: {
  readonly fichaId: string;
  readonly numero: string;
  readonly credorCpfCnpj: string;
  readonly valor: string;
  readonly tipo: "ORDINARIO" | "GLOBAL" | "ESTIMATIVO";
  readonly categoriaOrdemCronologica?: "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS";
  readonly historico: string;
  readonly contratoId?: string;
  readonly ordemDeCompraId?: string;
  readonly convenioId?: string;
  readonly obraId?: string;
  readonly dividaId?: string;
}): Promise<string> {
  return comEscritaAutenticada("SOLICITAR_EMPENHO", async (criadoPor) => {
    const r = await solicitarEmpenho(cliente(), { ...input, criadoPor });
    return r.solicitacaoId;
  });
}

/** ⚠️ A PORTA NÃO CONFERE QUEM SOLICITOU: a segregação é do domínio, e vale por qualquer caminho. */
export async function autorizarSolicitacao(input: { readonly solicitacaoId: string; readonly motivo?: string | undefined }): Promise<string> {
  return comEscritaAutenticada("AUTORIZAR_SOLICITACAO_DE_EMPENHO", async (criadoPor) => {
    const r = await autorizarSolicitacaoDeEmpenho(cliente(), {
      solicitacaoId: input.solicitacaoId,
      ...(input.motivo !== undefined && input.motivo !== "" ? { motivo: input.motivo } : {}),
      criadoPor,
    });
    return r.movimentoId;
  });
}

export async function rejeitarSolicitacao(input: { readonly solicitacaoId: string; readonly motivo: string }): Promise<string> {
  return comEscritaAutenticada("AUTORIZAR_SOLICITACAO_DE_EMPENHO", async (criadoPor) => {
    const r = await rejeitarSolicitacaoDeEmpenho(cliente(), { ...input, criadoPor });
    return r.movimentoId;
  });
}

export async function cancelarSolicitacao(input: { readonly solicitacaoId: string; readonly motivo: string }): Promise<string> {
  return comEscritaAutenticada("SOLICITAR_EMPENHO", async (criadoPor) => {
    const r = await cancelarSolicitacaoDeEmpenho(cliente(), { ...input, criadoPor });
    return r.movimentoId;
  });
}
