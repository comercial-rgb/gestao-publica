import { cliente, PortaSemBancoError } from "./cliente";

/**
 * PORTA — AUDITORIA (RegistroDeOperacao, TR 6.1-6.3). Leitura do log de operações da borda: quem,
 * quando, qual ação, resultado (SUCESSO/NEGADO/ERRO) e por quê. Filtros por usuário/ação/período e
 * paginação — o log cresce, e a tela não pode trazer tudo de uma vez.
 */

export { PortaSemBancoError };

export interface OperacaoAuditada {
  readonly id: string;
  readonly usuarioIdent: string;
  readonly acao: string;
  readonly ip: string | null;
  readonly resultado: "SUCESSO" | "NEGADO" | "ERRO";
  readonly detalhe: string | null;
  readonly criadoEm: Date;
}

export interface PaginaDeAuditoria {
  readonly operacoes: readonly OperacaoAuditada[];
  readonly total: number;
  readonly pagina: number;
  readonly paginas: number;
}

const TAMANHO = 50;

export async function listarOperacoes(f: {
  readonly usuario?: string;
  readonly acao?: string;
  readonly resultado?: "SUCESSO" | "NEGADO" | "ERRO";
  readonly desde?: Date;
  readonly ate?: Date;
  readonly pagina?: number;
}): Promise<PaginaDeAuditoria> {
  const pagina = Math.max(1, f.pagina ?? 1);
  const where = {
    ...(f.usuario !== undefined && f.usuario !== "" ? { usuarioIdent: { contains: f.usuario, mode: "insensitive" as const } } : {}),
    ...(f.acao !== undefined && f.acao !== "" ? { acao: { contains: f.acao, mode: "insensitive" as const } } : {}),
    ...(f.resultado !== undefined ? { resultado: f.resultado } : {}),
    ...(f.desde !== undefined || f.ate !== undefined
      ? { criadoEm: { ...(f.desde !== undefined ? { gte: f.desde } : {}), ...(f.ate !== undefined ? { lte: f.ate } : {}) } }
      : {}),
  };

  const prisma = cliente();
  const [total, linhas] = await Promise.all([
    prisma.registroDeOperacao.count({ where }),
    prisma.registroDeOperacao.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip: (pagina - 1) * TAMANHO,
      take: TAMANHO,
      select: { id: true, usuarioIdent: true, acao: true, ip: true, resultado: true, detalhe: true, criadoEm: true },
    }),
  ]);

  return {
    operacoes: linhas.map((l) => ({ id: l.id, usuarioIdent: l.usuarioIdent, acao: l.acao, ip: l.ip, resultado: l.resultado, detalhe: l.detalhe, criadoEm: l.criadoEm })),
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / TAMANHO)),
  };
}
