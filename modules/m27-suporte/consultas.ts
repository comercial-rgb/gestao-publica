import type { Tx } from "../m16-travamento/autorizacao.js";

/**
 * M27 — AS CONSULTAS. Leitura pura.
 */

export interface AjudaVigente {
  readonly rota: string;
  readonly titulo: string;
  readonly conteudo: string;
  readonly em: Date;
  readonly por: string;
}

/**
 * A AJUDA VIGENTE DE UMA ROTA — a versão mais recente.
 *
 * ⚠️ ROTA SEM AJUDA DEVOLVE `null`, e a tela simplesmente não mostra o painel. Um
 * texto genérico de reserva ("Ajuda não disponível") ensinaria o usuário a ignorar o
 * ícone — e ele deixaria de olhar justamente nas rotas onde a ajuda existe.
 */
export async function ajudaDaRota(tx: Tx, rota: string): Promise<AjudaVigente | null> {
  const a = await tx.ajudaDeRota.findFirst({
    where: { rota },
    select: { rota: true, titulo: true, conteudo: true, criadoEm: true, criadoPor: true },
    orderBy: { criadoEm: "desc" },
  });
  if (a === null) return null;
  return {
    rota: a.rota,
    titulo: a.titulo,
    conteudo: a.conteudo,
    em: a.criadoEm,
    por: a.criadoPor,
  };
}

export type SituacaoDoChamado = "ABERTO" | "RESPONDIDO" | "ENCERRADO";

export interface LinhaDeChamado {
  readonly id: string;
  readonly numero: number;
  readonly titulo: string;
  readonly severidade: string;
  readonly ordemDaSeveridade: number;
  readonly situacao: SituacaoDoChamado;
  readonly abertoPor: string;
  readonly abertoEm: Date;
  readonly ultimoMovimentoEm: Date;
  readonly respostas: number;
  readonly nota: number | null;
}

/**
 * OS CHAMADOS QUE ESTE USUÁRIO PODE VER.
 *
 * ⚠️ QUEM ABRIU VÊ O SEU; QUEM TEM PERMISSÃO GLOBAL VÊ TODOS. O catálogo pede
 * "histórico consultável pelo usuário" — pelo USUÁRIO, e não pela unidade inteira: um
 * chamado costuma descrever o que a pessoa não conseguiu fazer, e isso não é assunto
 * do setor dela.
 */
export async function listarChamados(
  tx: Tx,
  usuarioIdent: string,
  limite = 200
): Promise<readonly LinhaDeChamado[]> {
  const usuario = await tx.usuario.findUnique({
    where: { identificador: usuarioIdent },
    select: {
      vinculos: {
        select: { perfil: { select: { permissoes: { select: { unidadeOrcId: true } } } } },
      },
    },
  });
  if (usuario === null) return [];

  const atendente = usuario.vinculos.some((v) =>
    v.perfil.permissoes.some((p) => p.unidadeOrcId === null)
  );

  const chamados = await tx.chamado.findMany({
    where: atendente ? {} : { criadoPor: usuarioIdent },
    select: {
      id: true,
      numero: true,
      titulo: true,
      criadoEm: true,
      criadoPor: true,
      severidade: { select: { nome: true, ordem: true } },
      satisfacao: { select: { nota: true } },
      movimentos: { select: { tipo: true, criadoEm: true } },
    },
    orderBy: [{ severidade: { ordem: "asc" } }, { criadoEm: "desc" }],
    take: limite,
  });

  return chamados.map((c): LinhaDeChamado => {
    const fechaveis = [...c.movimentos]
      .filter((m) => m.tipo === "ENCERRAMENTO" || m.tipo === "REABERTURA")
      .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
    const fechado = fechaveis[fechaveis.length - 1]?.tipo === "ENCERRAMENTO";
    const respostas = c.movimentos.filter((m) => m.tipo === "RESPOSTA").length;
    const ultimo = [...c.movimentos].sort(
      (a, b) => b.criadoEm.getTime() - a.criadoEm.getTime()
    )[0];

    return {
      id: c.id,
      numero: c.numero,
      titulo: c.titulo,
      severidade: c.severidade.nome,
      ordemDaSeveridade: c.severidade.ordem,
      situacao: fechado ? "ENCERRADO" : respostas > 0 ? "RESPONDIDO" : "ABERTO",
      abertoPor: c.criadoPor,
      abertoEm: c.criadoEm,
      ultimoMovimentoEm: ultimo?.criadoEm ?? c.criadoEm,
      respostas,
      nota: c.satisfacao?.nota ?? null,
    };
  });
}

export interface DetalheDoChamado {
  readonly id: string;
  readonly numero: number;
  readonly titulo: string;
  readonly descricao: string;
  readonly severidade: string;
  readonly prazoHoras: number | null;
  readonly rota: string | null;
  readonly situacao: SituacaoDoChamado;
  readonly abertoPor: string;
  readonly abertoEm: Date;
  readonly podeAvaliar: boolean;
  readonly nota: number | null;
  readonly comentario: string | null;
  readonly movimentos: readonly {
    readonly tipo: string;
    readonly texto: string;
    readonly em: Date;
    readonly por: string;
  }[];
  readonly anexos: readonly { readonly id: string; readonly nome: string }[];
}

/** ⚠️ Devolve `null` a quem não pode ver — nunca uma mensagem que diferencie os casos. */
export async function detalheDoChamado(
  tx: Tx,
  chamadoId: string,
  usuarioIdent: string
): Promise<DetalheDoChamado | null> {
  const c = await tx.chamado.findUnique({
    where: { id: chamadoId },
    select: {
      id: true,
      numero: true,
      titulo: true,
      descricao: true,
      rota: true,
      criadoEm: true,
      criadoPor: true,
      severidade: { select: { nome: true, prazoHoras: true } },
      satisfacao: { select: { nota: true, comentario: true } },
      anexos: { select: { id: true, nomeOriginal: true } },
      movimentos: {
        select: { tipo: true, texto: true, criadoEm: true, criadoPor: true },
        orderBy: { criadoEm: "asc" },
      },
    },
  });
  if (c === null) return null;

  const usuario = await tx.usuario.findUnique({
    where: { identificador: usuarioIdent },
    select: {
      vinculos: {
        select: { perfil: { select: { permissoes: { select: { unidadeOrcId: true } } } } },
      },
    },
  });
  const atendente =
    usuario !== null &&
    usuario.vinculos.some((v) => v.perfil.permissoes.some((p) => p.unidadeOrcId === null));
  if (!atendente && c.criadoPor !== usuarioIdent) return null;

  const fechaveis = c.movimentos.filter(
    (m) => m.tipo === "ENCERRAMENTO" || m.tipo === "REABERTURA"
  );
  const fechado = fechaveis[fechaveis.length - 1]?.tipo === "ENCERRAMENTO";
  const respostas = c.movimentos.filter((m) => m.tipo === "RESPOSTA").length;

  return {
    id: c.id,
    numero: c.numero,
    titulo: c.titulo,
    descricao: c.descricao,
    severidade: c.severidade.nome,
    prazoHoras: c.severidade.prazoHoras,
    rota: c.rota,
    situacao: fechado ? "ENCERRADO" : respostas > 0 ? "RESPONDIDO" : "ABERTO",
    abertoPor: c.criadoPor,
    abertoEm: c.criadoEm,
    // Avaliar é de quem abriu, com o chamado encerrado e sem nota ainda.
    podeAvaliar:
      fechado && c.criadoPor === usuarioIdent && c.satisfacao === null,
    nota: c.satisfacao?.nota ?? null,
    comentario: c.satisfacao?.comentario ?? null,
    movimentos: c.movimentos.map((m) => ({
      tipo: m.tipo,
      texto: m.texto,
      em: m.criadoEm,
      por: m.criadoPor,
    })),
    anexos: c.anexos.map((a) => ({ id: a.id, nome: a.nomeOriginal })),
  };
}
