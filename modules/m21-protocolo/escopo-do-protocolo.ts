import type { AcaoDoSistema } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";

/**
 * ═══ M21 — QUEM ALCANÇA O PROTOCOLO: capacidade, escopo e participação (V7 M1 U1) ═══
 *
 * O DEFEITO QUE ISTO CORRIGE: "gestor" era inferido de QUALQUER permissão global. Uma conta com
 * `EMPENHAR` no ente inteiro e nenhuma relação com o protocolo enxergava todos os processos, os
 * sigilosos inclusive, e despachava de qualquer setor sem lotação. A guarda da página
 * (`CONSULTAR_PROTOCOLO`) não fechava: quem tinha a consulta só numa unidade gestora e uma permissão
 * global de outra área virava gestor pela outra.
 *
 * A DECISÃO, EM ORDEM DE PRECEDÊNCIA (a primeira que decide encerra):
 *   1. SEM `CONSULTAR_PROTOCOLO` EM ESCOPO NENHUM → não alcança processo interno. Nem o que abriu:
 *      o requerente que protocolou pela carta acompanha pela projeção dele (`/meus-servicos`), não
 *      pelo processo.
 *   2. PARTICIPAÇÃO → alcança, inclusive o sigiloso: abriu, movimentou, ou está lotado num setor por
 *      onde o processo passou (trâmite anulado não põe o destino no rol).
 *   3. SIGILO → quem não participa NÃO alcança, e isso vale para o gestor: consulta no ente não
 *      levanta sigilo. Acesso especial a sigiloso sem participação não existe (pendência nomeada).
 *   4. ESCOPO DA CONSULTA → `CONSULTAR_PROTOCOLO` no ENTE alcança os não sigilosos do ente;
 *      `CONSULTAR_PROTOCOLO` numa UNIDADE GESTORA alcança os não sigilosos abertos por setor dela.
 *   5. Qualquer outra coisa → não.
 *
 * AGIR SEM LOTAÇÃO (o "gestor de processos" que despacha de fora do setor) exige a PRÓPRIA ação do
 * ato concedida no ENTE, e nunca sobre processo sigiloso. Permissão global de outra ação não serve.
 *
 * ⚠️ É O MESMO RBAC (`PermissaoDePerfil`, ação × unidade gestora). Nenhum catálogo novo.
 */

export interface EscopoDoProtocolo {
  readonly ativo: boolean;
  /** `CONSULTAR_PROTOCOLO` concedida sem unidade gestora (o ente). */
  readonly consultaNoEnte: boolean;
  /** As unidades gestoras em que `CONSULTAR_PROTOCOLO` foi concedida. */
  readonly ugsDeConsulta: readonly string[];
  readonly lotacoes: readonly { readonly setorId: string; readonly ugId: string }[];
}

export const ESCOPO_VAZIO: EscopoDoProtocolo = { ativo: false, consultaNoEnte: false, ugsDeConsulta: [], lotacoes: [] };

export const temConsulta = (e: EscopoDoProtocolo): boolean => e.ativo && (e.consultaNoEnte || e.ugsDeConsulta.length > 0);

export async function escopoDoProtocolo(tx: Tx, usuarioIdent: string): Promise<EscopoDoProtocolo> {
  const u = await tx.usuario.findUnique({
    where: { identificador: usuarioIdent },
    select: { ativo: true, vinculos: { select: { perfil: { select: { permissoes: { where: { acao: "CONSULTAR_PROTOCOLO" }, select: { unidadeOrcId: true } } } } } } },
  });
  if (u === null || !u.ativo) return ESCOPO_VAZIO;
  const permissoes = u.vinculos.flatMap((v) => v.perfil.permissoes);
  const lotacoes = await tx.usuarioDoSetor.findMany({ where: { usuarioIdent }, select: { setorId: true, setor: { select: { unidadeOrcId: true } } } });
  return {
    ativo: true,
    consultaNoEnte: permissoes.some((p) => p.unidadeOrcId === null),
    ugsDeConsulta: [...new Set(permissoes.flatMap((p) => (p.unidadeOrcId === null ? [] : [p.unidadeOrcId])))],
    lotacoes: lotacoes.map((l) => ({ setorId: l.setorId, ugId: l.setor.unidadeOrcId })),
  };
}

export interface ProcessoParaDecidir {
  readonly sigiloso: boolean;
  readonly ugDeAbertura: string;
  readonly setoresEnvolvidos: readonly string[];
  /** Abriu ou movimentou o processo. */
  readonly participouComoAutor: boolean;
}

export type CodigoDeVisibilidade = "SEM-CONSULTA-DO-PROTOCOLO" | "PARTICIPANTE" | "SIGILO-PREVALECE" | "CONSULTA-NO-ENTE" | "CONSULTA-NA-UG" | "FORA-DO-ESCOPO";

export interface DecisaoDeVisibilidade {
  readonly pode: boolean;
  readonly codigo: CodigoDeVisibilidade;
  readonly motivo: string;
}

/** A decisão PURA — a mesma para o detalhe, o anexo, o lote, a mesa e o recorte da lista. */
export function decidirVisibilidade(e: EscopoDoProtocolo, p: ProcessoParaDecidir): DecisaoDeVisibilidade {
  if (!temConsulta(e)) return { pode: false, codigo: "SEM-CONSULTA-DO-PROTOCOLO", motivo: "Sem a consulta do protocolo em escopo nenhum." };
  const lotadoEmEnvolvido = e.lotacoes.some((l) => p.setoresEnvolvidos.includes(l.setorId));
  if (p.participouComoAutor || lotadoEmEnvolvido) return { pode: true, codigo: "PARTICIPANTE", motivo: p.participouComoAutor ? "Abriu ou movimentou o processo." : "Lotado em setor por onde o processo passou." };
  if (p.sigiloso) return { pode: false, codigo: "SIGILO-PREVALECE", motivo: "Processo SIGILOSO: só quem participa. A consulta do protocolo, mesmo no ente, não levanta o sigilo." };
  if (e.consultaNoEnte) return { pode: true, codigo: "CONSULTA-NO-ENTE", motivo: "Consulta do protocolo concedida no ente." };
  if (e.ugsDeConsulta.includes(p.ugDeAbertura)) return { pode: true, codigo: "CONSULTA-NA-UG", motivo: "Consulta do protocolo concedida na unidade gestora do setor de abertura." };
  return { pode: false, codigo: "FORA-DO-ESCOPO", motivo: "Fora do escopo da sua consulta do protocolo." };
}

/**
 * O recorte da CAIXA no `where` — a mesma decisão, expressa para o banco, ANTES da paginação.
 * `null` = não alcança nada (lista vazia, nunca "todos").
 */
export function recorteDaCaixa(e: EscopoDoProtocolo, usuarioIdent: string, somenteMeusSetores: boolean): Record<string, unknown> | null {
  if (!temConsulta(e)) return null;
  const meus = e.lotacoes.map((l) => l.setorId);
  const participacao = [
    { criadoPor: usuarioIdent },
    { movimentos: { some: { criadoPor: usuarioIdent } } },
    ...(meus.length === 0 ? [] : [{ setorAberturaId: { in: meus } }, { movimentos: { some: { setorOrigemId: { in: meus } } } }, { movimentos: { some: { setorDestinoId: { in: meus } } } }]),
  ];
  if (somenteMeusSetores) return { OR: participacao };
  const porEscopo = e.consultaNoEnte ? [{ sigiloso: false }] : e.ugsDeConsulta.length === 0 ? [] : [{ sigiloso: false, setorAbertura: { unidadeOrcId: { in: [...e.ugsDeConsulta] } } }];
  return { OR: [...participacao, ...porEscopo] };
}

/**
 * PODE AGIR SOBRE O PROCESSO NESTE SETOR? — lotação no setor, ou a PRÓPRIA ação do ato no ente sobre
 * processo não sigiloso. É a pergunta da barra (projeção) e do caso de uso (transação).
 */
export async function podeAgirNoSetor(tx: Tx, usuarioIdent: string, setorId: string, acao: AcaoDoSistema, sigiloso: boolean): Promise<boolean> {
  const lotado = await tx.usuarioDoSetor.findUnique({ where: { usuarioIdent_setorId: { usuarioIdent, setorId } }, select: { id: true } });
  if (lotado !== null) return true;
  if (sigiloso) return false;
  const noEnte = await tx.permissaoDePerfil.findFirst({
    where: { acao, unidadeOrcId: null, perfil: { vinculos: { some: { usuario: { identificador: usuarioIdent, ativo: true } } } } },
    select: { id: true },
  });
  return noEnte !== null;
}
