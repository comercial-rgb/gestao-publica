import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { setorAtual } from "../m21-protocolo/dominio.js";
import { podeVerProcesso } from "../m21-protocolo/consultas.js";
import {
  gravarArquivo,
  lerArquivo,
  recusaDoArquivo,
  sha256,
} from "./armazenamento.js";

/**
 * M22 — ANEXOS. A autorização é POR REGISTRO, e é a mesma do registro dono.
 *
 * ═══ ⚠️ NENHUMA REGRA DE ACESSO NOVA É ESCRITA AQUI ═══
 * "Quem pode ver este arquivo?" não tem resposta no arquivo: tem resposta no processo,
 * no comunicado ou na pessoa a que ele pertence. Por isso este módulo CHAMA a regra do
 * dono (`podeVerProcesso`, do M21) em vez de reimplementá-la.
 *
 * Reimplementar seria criar a segunda verdade sobre o acesso — e a divergência
 * interessante é sempre a mesma: o processo sigiloso some da listagem e o anexo dele
 * continua baixável por quem tiver o link.
 */

// ═══════════════════════════════════════════════════════════════════════════
// O DONO DO ANEXO — exatamente um
// ═══════════════════════════════════════════════════════════════════════════

export const zAnexar = z
  .object({
    nomeOriginal: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1),
    conteudo: z.instanceof(Uint8Array),
    origem: z.enum(["UPLOAD", "DIGITALIZACAO", "CAMERA", "SISTEMA"]).default("UPLOAD"),
    processoId: z.string().min(1).optional(),
    movimentoProcessoId: z.string().min(1).optional(),
    comunicadoId: z.string().min(1).optional(),
    pessoaId: z.string().min(1).optional(),
    borderoId: z.string().min(1).optional(),
    criadoPor: z.string().min(1),
  })
  .refine(
    (d) =>
      [d.processoId, d.movimentoProcessoId, d.comunicadoId, d.pessoaId, d.borderoId].filter(
        (v) => v !== undefined
      ).length === 1,
    {
      message:
        "Um anexo pertence a EXATAMENTE UM registro: processo, movimento de processo, " +
        "comunicado, pessoa ou borderô. Sem dono, ninguém sabe quem pode lê-lo; com dois, " +
        "não se sabe qual regra de acesso vale.",
    }
  );

export type AnexarInput = z.input<typeof zAnexar>;

/**
 * ANEXA — validando tipo e tamanho NO SERVIDOR, calculando o hash e gravando fora de
 * qualquer pasta pública.
 *
 * ⚠️ A ORDEM É: autorizar, validar, GRAVAR A LINHA, e só então escrever o arquivo.
 * Se a gravação do arquivo falhar, a transação desfaz a linha e não sobra registro
 * apontando para um arquivo que não existe. O contrário — arquivo primeiro — deixaria
 * órfãos no disco a cada falha, e ninguém os encontraria depois.
 */
export async function anexarArquivo(
  prisma: PrismaClient,
  input: AnexarInput
): Promise<{ readonly anexoId: string; readonly sha256: string }> {
  const d = zAnexar.parse(input);

  const recusa = recusaDoArquivo(d.mimeType, d.conteudo.byteLength, d.origem);
  if (recusa !== null) throw new Error(recusa);

  return prisma.$transaction(async (tx) => {
    const escopo = await escopoDoDono(tx, d);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.anexarArquivo, escopo);

    const hash = sha256(d.conteudo);
    const anexo = await tx.anexo.create({
      data: {
        nomeOriginal: d.nomeOriginal,
        mimeType: d.mimeType,
        tamanhoBytes: d.conteudo.byteLength,
        sha256: hash,
        origem: d.origem,
        processoId: d.processoId ?? null,
        movimentoProcessoId: d.movimentoProcessoId ?? null,
        comunicadoId: d.comunicadoId ?? null,
        pessoaId: d.pessoaId ?? null,
        borderoId: d.borderoId ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    await gravarArquivo(anexo.id, d.conteudo);
    return { anexoId: anexo.id, sha256: hash };
  });
}

/**
 * DE ONDE SAI A UNIDADE GESTORA DO ANEXO — do REGISTRO DONO, andando até ele.
 *
 * É a mesma doutrina do `escopo.ts` do M16: a UG vem do ALVO do fato, nunca do
 * contexto ambiente. Um anexo de processo herda o setor onde o processo está; um anexo
 * de pessoa é ato do ENTE, porque o cadastro de pessoas é compartilhado (M19).
 */
async function escopoDoDono(
  tx: Tx,
  d: { readonly processoId?: string | undefined; readonly movimentoProcessoId?: string | undefined; readonly comunicadoId?: string | undefined; readonly pessoaId?: string | undefined; readonly borderoId?: string | undefined }
): Promise<"ENTE" | { readonly setor: string }> {
  if (d.pessoaId !== undefined) return "ENTE";

  // ⚠️ O BORDERÔ É ATO DO ENTE, e não de uma unidade. A tesouraria paga pelo ente: um
  // borderô reúne ordens de unidades diferentes que saem da MESMA conta bancária, e
  // escopá-lo numa UG faria a autorização recair sobre uma das unidades por acidente de
  // qual ordem entrou primeiro.
  if (d.borderoId !== undefined) return "ENTE";

  if (d.comunicadoId !== undefined) {
    const c = await tx.comunicado.findUnique({
      where: { id: d.comunicadoId },
      select: { setorRemetenteId: true },
    });
    if (c === null) {
      throw new Error(`Comunicado ${d.comunicadoId} não existe. Nada foi gravado.`);
    }
    return { setor: c.setorRemetenteId };
  }

  const processoId =
    d.processoId ??
    (
      await tx.movimentoDoProcesso.findUnique({
        where: { id: d.movimentoProcessoId ?? "" },
        select: { processoId: true },
      })
    )?.processoId;

  if (processoId === undefined || processoId === null) {
    throw new Error(
      `O registro dono do anexo não existe. Nada foi gravado.`
    );
  }

  const p = await tx.processo.findUnique({
    where: { id: processoId },
    select: {
      setorAberturaId: true,
      movimentos: {
        select: {
          id: true,
          tipo: true,
          setorOrigemId: true,
          setorDestinoId: true,
          respondeAId: true,
          tornaSemEfeitoId: true,
          criadoEm: true,
        },
      },
    },
  });
  if (p === null) {
    throw new Error(`Processo ${processoId} não existe. Nada foi gravado.`);
  }
  return { setor: setorAtual(p.setorAberturaId, p.movimentos) };
}

// ═══════════════════════════════════════════════════════════════════════════
// A LEITURA — e ela pergunta ao DONO
// ═══════════════════════════════════════════════════════════════════════════

export interface AnexoEntregue {
  readonly id: string;
  readonly nomeOriginal: string;
  readonly mimeType: string;
  readonly tamanhoBytes: number;
  readonly sha256: string;
  readonly conteudo: Uint8Array;
}

/**
 * BAIXA O ANEXO — depois de perguntar ao registro dono se este usuário pode.
 *
 * ⚠️ DEVOLVE `null` EM VEZ DE ESTOURAR, e a resposta é a mesma para "não existe" e para
 * "não pode". Distingui-los transformaria a rota num oráculo de quais anexos existem.
 *
 * ⚠️ E A INTEGRIDADE É CONFERIDA NA ENTREGA (`lerArquivo`). Um arquivo trocado no disco
 * depois de anexado seria entregue como original — e é justamente o cenário em que a
 * conferência importa.
 */
export async function baixarAnexo(
  prisma: PrismaClient,
  anexoId: string,
  usuarioIdent: string
): Promise<AnexoEntregue | null> {
  const a = await prisma.anexo.findUnique({
    where: { id: anexoId },
    select: {
      id: true,
      nomeOriginal: true,
      mimeType: true,
      tamanhoBytes: true,
      sha256: true,
      processoId: true,
      movimentoProcessoId: true,
      comunicadoId: true,
      pessoaId: true,
      borderoId: true,
      movimentoProcesso: { select: { processoId: true } },
    },
  });
  if (a === null) return null;

  const processoId = a.processoId ?? a.movimentoProcesso?.processoId ?? null;

  if (processoId !== null) {
    // ⚠️ A REGRA VEM DO M21. Não há uma segunda aqui — ver o cabeçalho.
    const visao = await podeVerProcesso(prisma, processoId, usuarioIdent);
    if (!visao.pode) return null;
  } else if (a.comunicadoId !== null) {
    const pode = await podeVerComunicado(prisma, a.comunicadoId, usuarioIdent);
    if (!pode) return null;
  } else {
    // Anexo de PESSOA ou de BORDERÔ: os dois são do ENTE, e a leitura deles também.
    // Exige apenas usuário ATIVO — quem foi revogado não baixa nada.
    const u = await prisma.usuario.findUnique({
      where: { identificador: usuarioIdent },
      select: { ativo: true },
    });
    if (u === null || !u.ativo) return null;
  }

  const conteudo = await lerArquivo(a.id, a.sha256);
  return {
    id: a.id,
    nomeOriginal: a.nomeOriginal,
    mimeType: a.mimeType,
    tamanhoBytes: a.tamanhoBytes,
    sha256: a.sha256,
    conteudo,
  };
}

/**
 * QUEM PODE VER UM COMUNICADO: o setor remetente, os destinatários e quem tem
 * permissão global. É a regra do M23, e ela mora aqui porque é aqui que o anexo
 * pergunta — quando o M23 crescer, ela se muda para lá inteira, não se duplica.
 */
export async function podeVerComunicado(
  prisma: PrismaClient | Tx,
  comunicadoId: string,
  usuarioIdent: string
): Promise<boolean> {
  const tx = prisma as Tx;
  const c = await tx.comunicado.findUnique({
    where: { id: comunicadoId },
    select: {
      criadoPor: true,
      setorRemetenteId: true,
      destinatarios: { select: { setorId: true } },
    },
  });
  if (c === null) return false;
  if (c.criadoPor === usuarioIdent) return true;

  const usuario = await tx.usuario.findUnique({
    where: { identificador: usuarioIdent },
    select: {
      ativo: true,
      vinculos: {
        select: { perfil: { select: { permissoes: { select: { unidadeOrcId: true } } } } },
      },
    },
  });
  if (usuario === null || !usuario.ativo) return false;
  if (
    usuario.vinculos.some((v) =>
      v.perfil.permissoes.some((perm) => perm.unidadeOrcId === null)
    )
  ) {
    return true;
  }

  const setores = new Set<string>([
    c.setorRemetenteId,
    ...c.destinatarios.map((d) => d.setorId),
  ]);
  const lotacoes = await tx.usuarioDoSetor.findMany({
    where: { usuarioIdent },
    select: { setorId: true },
  });
  return lotacoes.some((l) => setores.has(l.setorId));
}
