import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada, exigirSessao } from "./sessao";
import {
  ajudaDaRota,
  detalheDoChamado,
  listarChamados,
  type AjudaVigente,
  type DetalheDoChamado,
  type LinhaDeChamado,
} from "../../modules/m27-suporte/consultas";
import {
  abrirChamado,
  encerrarChamado,
  reabrirChamado,
  responderChamado,
  responderPesquisaDeSatisfacao,
} from "../../modules/m27-suporte/servico";

/**
 * PORTA — AJUDA CONTEXTUAL E CHAMADOS (M27).
 *
 * ⚠️ A AJUDA É LIDA SEM ESCRITA E SEM ATO. Ela não abre chamado, não registra acesso e
 * não pede permissão — quem não sabe onde clicar não precisa de um protocolo aberto no
 * seu nome.
 */

export { PortaSemBancoError };
export type { AjudaVigente, DetalheDoChamado, LinhaDeChamado };

export async function lerAjudaDaRota(rota: string): Promise<AjudaVigente | null> {
  return ajudaDaRota(cliente(), rota);
}

export async function lerChamados(): Promise<readonly LinhaDeChamado[]> {
  const sessao = await exigirSessao();
  return listarChamados(cliente(), sessao.identificador);
}

export async function lerChamado(chamadoId: string): Promise<DetalheDoChamado | null> {
  const sessao = await exigirSessao();
  return detalheDoChamado(cliente(), chamadoId, sessao.identificador);
}

export async function lerSeveridades(): Promise<
  readonly { readonly id: string; readonly rotulo: string }[]
> {
  const niveis = await cliente().nivelDeSeveridade.findMany({
    where: { ativo: true },
    select: { id: true, codigo: true, nome: true, prazoHoras: true },
    orderBy: { ordem: "asc" },
  });
  return niveis.map((n) => ({
    id: n.id,
    rotulo:
      n.prazoHoras !== null
        ? `${n.codigo} — ${n.nome} (resposta em até ${n.prazoHoras}h)`
        : `${n.codigo} — ${n.nome}`,
  }));
}

export async function abrirChamadoNaTela(input: {
  readonly unidadeOrcId: string;
  readonly severidadeId: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly rota?: string | undefined;
}): Promise<{ readonly numero: number }> {
  return comEscritaAutenticada("ABRIR_CHAMADO", (criadoPor) =>
    abrirChamado(cliente(), { ...input, criadoPor })
  );
}

export async function responderChamadoNaTela(input: {
  readonly chamadoId: string;
  readonly texto: string;
}): Promise<void> {
  await comEscritaAutenticada("RESPONDER_CHAMADO", (criadoPor) =>
    responderChamado(cliente(), { ...input, criadoPor })
  );
}

export async function encerrarChamadoNaTela(input: {
  readonly chamadoId: string;
  readonly texto: string;
}): Promise<void> {
  await comEscritaAutenticada("ENCERRAR_CHAMADO", (criadoPor) =>
    encerrarChamado(cliente(), { ...input, criadoPor })
  );
}

export async function reabrirChamadoNaTela(input: {
  readonly chamadoId: string;
  readonly texto: string;
}): Promise<void> {
  await comEscritaAutenticada("REABRIR_CHAMADO", (criadoPor) =>
    reabrirChamado(cliente(), { ...input, criadoPor })
  );
}

export async function avaliarChamadoNaTela(input: {
  readonly chamadoId: string;
  readonly nota: number;
  readonly comentario?: string | undefined;
}): Promise<void> {
  await comEscritaAutenticada("RESPONDER_PESQUISA_DE_SATISFACAO", (criadoPor) =>
    responderPesquisaDeSatisfacao(cliente(), { ...input, criadoPor })
  );
}
