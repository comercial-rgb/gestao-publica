import type { Tx } from "../m16-travamento/autorizacao.js";
import {
  caixaDoComunicado,
  ehFavoritoDe,
  foiEnviado,
  hashDoComunicado,
  type Caixa,
} from "./dominio.js";

/**
 * M23 — AS CONSULTAS. Leitura pura.
 *
 * ⚠️ A CAIXA É CALCULADA PARA QUEM PERGUNTA. Não há coluna `caixa` e não pode haver: o
 * mesmo comunicado está na SAÍDA de quem enviou e na ENTRADA de quem recebeu, ao mesmo
 * tempo. Ver `caixaDoComunicado`, no domínio.
 */

export interface LinhaDaCaixa {
  readonly id: string;
  readonly rotulo: string;
  readonly tipo: string;
  readonly assunto: string;
  readonly remetente: string;
  readonly destinatarios: readonly string[];
  readonly caixa: Caixa;
  readonly favorito: boolean;
  readonly lido: boolean;
  readonly aosCuidadosDeMim: boolean;
  readonly tags: readonly string[];
  readonly em: Date;
  /** ⚠️ `false` quando o texto mudou depois do envio — ver `integridadeDoEnvio`. */
  readonly conteudoIntegro: boolean;
}

const SELECAO = {
  id: true,
  numero: true,
  assunto: true,
  corpo: true,
  criadoPor: true,
  criadoEm: true,
  setorRemetenteId: true,
  exercicio: { select: { ano: true } },
  tipo: { select: { codigo: true, nome: true } },
  setorRemetente: { select: { codigo: true, nome: true } },
  destinatarios: {
    select: { setorId: true, aosCuidadosDe: true, setor: { select: { codigo: true } } },
  },
  tags: { select: { tag: { select: { nome: true } } } },
  movimentos: {
    select: {
      tipo: true,
      criadoPor: true,
      setorId: true,
      origem: true,
      hashConteudo: true,
      criadoEm: true,
    },
  },
} as const;

/**
 * A CAIXA DE UM USUÁRIO.
 *
 * ⚠️ SEM LOTAÇÃO, A CAIXA É VAZIA — e não "todas". Mesmo fail-closed do seletor de
 * unidades e da caixa de processos: tratar vazio como "não filtrei nada, mostre tudo" é
 * o que transforma quem não tem crachá no usuário mais poderoso do sistema.
 */
export async function listarCaixaDeComunicados(
  tx: Tx,
  usuarioIdent: string,
  caixa: Caixa | "TODAS" = "ENTRADA",
  limite = 200
): Promise<readonly LinhaDaCaixa[]> {
  const lotacoes = await tx.usuarioDoSetor.findMany({
    where: { usuarioIdent },
    select: { setorId: true },
  });
  const meusSetores = lotacoes.map((l) => l.setorId);
  if (meusSetores.length === 0) return [];

  const comunicados = await tx.comunicado.findMany({
    where: {
      OR: [
        { setorRemetenteId: { in: meusSetores } },
        { destinatarios: { some: { setorId: { in: meusSetores } } } },
        { criadoPor: usuarioIdent },
      ],
    },
    select: SELECAO,
    orderBy: { criadoEm: "desc" },
    take: limite,
  });

  const linhas = comunicados.map((c): LinhaDaCaixa => {
    const paraDerivar = {
      criadoPor: c.criadoPor,
      setorRemetenteId: c.setorRemetenteId,
      destinatarios: c.destinatarios.map((d) => d.setorId),
      movimentos: c.movimentos,
    };
    const envio = c.movimentos.find((m) => m.tipo === "ENVIO");
    return {
      id: c.id,
      rotulo: `${c.tipo.codigo} ${c.numero}/${c.exercicio.ano}`,
      tipo: c.tipo.nome,
      assunto: c.assunto,
      remetente: `${c.setorRemetente.codigo} — ${c.setorRemetente.nome}`,
      destinatarios: c.destinatarios.map((d) => d.setor.codigo),
      caixa: caixaDoComunicado(paraDerivar, usuarioIdent, meusSetores),
      favorito: ehFavoritoDe(paraDerivar, usuarioIdent),
      lido: c.movimentos.some((m) => m.tipo === "LEITURA" && m.criadoPor === usuarioIdent),
      // O A/C DESTACA, não restringe: o comunicado continua sendo do setor.
      aosCuidadosDeMim: c.destinatarios.some((d) => d.aosCuidadosDe === usuarioIdent),
      tags: c.tags.map((t) => t.tag.nome),
      em: c.criadoEm,
      conteudoIntegro:
        envio === undefined ||
        envio.hashConteudo === null ||
        envio.hashConteudo === hashDoComunicado(c.assunto, c.corpo),
    };
  });

  return caixa === "TODAS" ? linhas : linhas.filter((l) => l.caixa === caixa);
}

export interface LeituraRegistrada {
  readonly usuario: string;
  readonly em: Date;
  readonly origem: string;
  readonly setor: string | null;
}

/**
 * QUEM LEU, QUANDO E POR QUAL ORIGEM (5.43 — a consulta de visualização).
 *
 * ⚠️ ELA NÃO EXPÕE SEGREDO NENHUM: devolve identidade, instante, origem e setor — e
 * nada do CONTEÚDO nem de quem mais está na conversa além de quem leu. O catálogo pede
 * a marcação de leitura, não um relatório de comportamento.
 *
 * ⚠️ E SÓ QUEM PARTICIPA DO COMUNICADO PODE PERGUNTAR. Um relatório de leitura aberto a
 * qualquer usuário do ente diria quem está trabalhando em quê.
 */
export async function leiturasDoComunicado(
  tx: Tx,
  comunicadoId: string,
  usuarioIdent: string
): Promise<readonly LeituraRegistrada[] | null> {
  const c = await tx.comunicado.findUnique({
    where: { id: comunicadoId },
    select: {
      criadoPor: true,
      setorRemetenteId: true,
      destinatarios: { select: { setorId: true } },
      movimentos: {
        where: { tipo: "LEITURA" },
        select: { criadoPor: true, criadoEm: true, origem: true, setorId: true },
        orderBy: { criadoEm: "asc" },
      },
    },
  });
  if (c === null) return null;

  const envolvidos = new Set([
    c.setorRemetenteId,
    ...c.destinatarios.map((d) => d.setorId),
  ]);
  const lotacoes = await tx.usuarioDoSetor.findMany({
    where: { usuarioIdent },
    select: { setorId: true, setor: { select: { codigo: true, nome: true } } },
  });
  const participa =
    c.criadoPor === usuarioIdent || lotacoes.some((l) => envolvidos.has(l.setorId));
  if (!participa) return null;

  const setores = await tx.setor.findMany({
    where: {
      id: {
        in: [
          ...new Set(
            c.movimentos.map((m) => m.setorId).filter((s): s is string => s !== null)
          ),
        ],
      },
    },
    select: { id: true, codigo: true, nome: true },
  });
  const nome = new Map(setores.map((s) => [s.id, `${s.codigo} — ${s.nome}`]));

  return c.movimentos.map((m) => ({
    usuario: m.criadoPor,
    em: m.criadoEm,
    origem: m.origem ?? "SISTEMA",
    setor: m.setorId !== null ? nome.get(m.setorId) ?? null : null,
  }));
}

/**
 * A INTEGRIDADE DO QUE FOI ENVIADO — o hash carimbado bate com o texto de hoje?
 *
 * ⚠️ ISTO EXISTE PORQUE O RASCUNHO É EDITÁVEL. O papel de runtime tem `UPDATE` em
 * `Comunicado("assunto","corpo")`, e o grant por coluna não sabe dizer "só antes de
 * enviar". O caso de uso diz — e este hash é o que denuncia uma edição feita por
 * qualquer outro caminho. Sem ele, alterar o texto de um documento já lido seria
 * invisível.
 */
export async function integridadeDoEnvio(
  tx: Tx,
  comunicadoId: string
): Promise<{ readonly enviado: boolean; readonly integro: boolean } | null> {
  const c = await tx.comunicado.findUnique({
    where: { id: comunicadoId },
    select: {
      assunto: true,
      corpo: true,
      criadoPor: true,
      setorRemetenteId: true,
      destinatarios: { select: { setorId: true } },
      movimentos: {
        select: { tipo: true, criadoPor: true, setorId: true, criadoEm: true, hashConteudo: true },
      },
    },
  });
  if (c === null) return null;

  const paraDerivar = {
    criadoPor: c.criadoPor,
    setorRemetenteId: c.setorRemetenteId,
    destinatarios: c.destinatarios.map((d) => d.setorId),
    movimentos: c.movimentos,
  };
  if (!foiEnviado(paraDerivar)) return { enviado: false, integro: true };

  const envio = c.movimentos.find((m) => m.tipo === "ENVIO");
  const carimbo = envio?.hashConteudo ?? null;
  return {
    enviado: true,
    integro: carimbo === null || carimbo === hashDoComunicado(c.assunto, c.corpo),
  };
}
