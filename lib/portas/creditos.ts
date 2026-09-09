import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada, exigirSessao } from "./sessao";
import { listarDecretos, listarLeis, listarQdd } from "../../modules/m03-creditos/consultas";
import {
  criarLei,
  criarDecreto,
  executarCredito,
  encerrarDecreto,
} from "../../modules/m03-creditos";
import { criarM03Deps } from "../../modules/m03-creditos/adapter-prisma";

/**
 * PORTA — CRÉDITOS ADICIONAIS (M03, TR 4.20–4.40). A tela consome ISTO (grep trivalente): o domínio
 * (modules/m03-creditos) nunca é importado por app/ direto. Leitura = consultas puras; escrita =
 * `comEscritaAutenticada` (exige sessão, injeta o `criadoPor` real, registra a operação). As TRAVAS
 * (5.111 fonte igual, teto da lei, saldo da ficha, decreto encerrado) são do DOMÍNIO — a porta só
 * encaminha; o erro do domínio sobe nomeado para a tela.
 */

export { PortaSemBancoError };
export type { DecretoNaLista, ItemDecretoNaLista, LeiNaLista, LinhaQdd } from "../../modules/m03-creditos/consultas";

// ── LEITURA ──────────────────────────────────────────────────────────────────────
export async function lerDecretos(p: { readonly ano: number }) {
  return listarDecretos(cliente(), { ano: p.ano });
}

export async function lerLeis(p: { readonly ano: number }) {
  return listarLeis(cliente(), { ano: p.ano });
}

/**
 * O QDD do exercício/unidade — dotação INICIAL, os créditos e a dotação ATUALIZADA por ficha.
 *
 * ⚠️ SESSÃO EXIGIDA (fail-closed). O QDD diz, ficha a ficha, quanto o ente ainda pode empenhar —
 * é a planilha de onde sai a próxima despesa, e não é dado de portal. Sem sessão, `exigirSessao`
 * redireciona para o login antes de o banco ser tocado.
 *
 * ⚠️ A PORTA NÃO SOMA. A dotação atualizada vem de `listarQdd`, que a delega ao `calcularSaldos`
 * do M05 — a mesma função que escreve o cache da ficha. Aqui só se atravessa a borda.
 */
export async function lerQdd(p: { readonly exercicio: number; readonly unidadeCodigo?: string | undefined }) {
  await exigirSessao();
  return listarQdd(cliente(), {
    exercicio: p.exercicio,
    ...(p.unidadeCodigo !== undefined ? { unidadeCodigo: p.unidadeCodigo } : {}),
  });
}

// ── ESCRITA (autenticada) ──────────────────────────────────────────────────────────
export async function criarLeiCredito(input: {
  readonly numero: string;
  readonly ano: number;
  readonly tipoCredito: "SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO";
  readonly valorAutorizado: string;
  readonly dataPublicacao: Date;
}): Promise<string> {
  return comEscritaAutenticada("CRIAR_LEI_DE_CREDITO", (criadoPor) => criarLei({ ...input, criadoPor }, criarM03Deps(cliente())));
}

export async function criarDecretoCredito(input: {
  readonly leiId: string;
  readonly numero: string;
  readonly ano: number;
  readonly data: Date;
  readonly origemRecurso: "ANULACAO" | "SUPERAVIT_FINANCEIRO" | "EXCESSO_ARRECADACAO" | "OPERACAO_CREDITO";
}): Promise<string> {
  return comEscritaAutenticada("CRIAR_DECRETO_DE_CREDITO", (criadoPor) => criarDecreto({ ...input, criadoPor }, criarM03Deps(cliente())));
}

/** LANÇAR os movimentos (itens) do decreto — suplementações e anulações, na mesma transação. */
export async function lancarMovimentosCredito(input: {
  readonly decretoId: string;
  readonly itens: readonly { readonly fichaId: string; readonly tipo: "SUPLEMENTACAO" | "ANULACAO"; readonly valor: string; readonly fonteId: string }[];
}): Promise<readonly string[]> {
  const itens = input.itens.map((i) => ({ fichaId: i.fichaId, tipo: i.tipo, valor: i.valor, fonteId: i.fonteId }));
  return comEscritaAutenticada("EXECUTAR_CREDITO", (criadoPor) => executarCredito({ decretoId: input.decretoId, itens, criadoPor }, criarM03Deps(cliente())));
}

export async function encerrarDecretoCredito(input: {
  readonly decretoId: string;
  readonly data: Date;
  readonly motivo: string;
}): Promise<string> {
  return comEscritaAutenticada("ENCERRAR_DECRETO", (criadoPor) => encerrarDecreto({ ...input, criadoPor }, criarM03Deps(cliente())));
}
