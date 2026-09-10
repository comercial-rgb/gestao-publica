import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { setorAtual } from "../m21-protocolo/dominio.js";
import { registrarNotificacao } from "../m24-notificacoes/notificacoes.js";

/**
 * M22 — ASSINATURA ELETRÔNICA. Lei 14.063/2020, e os três modos NÃO são intercambiáveis.
 *
 * ═══ ⚠️ O MODO QUALIFICADO NÃO EXISTE AQUI, E O CÓDIGO RECUSA PRODUZI-LO ═══
 * A assinatura qualificada exige certificado ICP-Brasil e custódia da chave. Não há
 * provedor configurado neste repositório, e a custódia A1 em HSM é adaptador isolado —
 * o próprio prompt do lote manda declará-la indisponível em vez de bloquear o resto.
 *
 * O que este módulo NÃO faz é o ponto: ele não produz uma assinatura "qualificada" a
 * partir de nada. Uma assinatura fabricada aparece na tela exatamente como a verdadeira
 * — e é por isso que o guard é do CASO DE USO, e o estado é `disponivel: false`
 * LITERAL, para o caminho feliz não compilar.
 *
 * ═══ ⚠️ O QUE SE ASSINA É O HASH DO CONTEÚDO, NÃO O ID ═══
 * Assinar "o documento 42" não prova nada: o documento 42 pode ter mudado. Assinar o
 * SHA-256 do conteúdo prova que aquele byte-a-byte foi o que a pessoa viu — e é o que
 * permite verificar a assinatura em separado, depois, sem confiar no banco.
 */

export interface AssinaturaQualificada {
  readonly disponivel: false;
  readonly motivo: string;
  readonly detalhe: string;
}

export function estadoDaAssinaturaQualificada(): AssinaturaQualificada {
  return {
    disponivel: false,
    motivo:
      "Assinatura qualificada (ICP-Brasil) indisponível: nenhum provedor de certificado " +
      "configurado neste ambiente.",
    detalhe:
      "A custódia de certificado A1 é adaptador isolado e não existe aqui. Guardar a " +
      "chave no banco e chamar isso de HSM seria pior que não ter: pareceria custódia. " +
      "Enquanto não houver provedor, use assinatura AVANÇADA — que é registrada com " +
      "identidade, instante e hash do conteúdo — ou colha a assinatura fora do sistema. " +
      "Pendência declarada: ASSINATURA-ICP-HSM.",
  };
}

export const zAssinar = z
  .object({
    modo: z.enum(["SIMPLES", "AVANCADA", "QUALIFICADA"]),
    anexoId: z.string().min(1).optional(),
    movimentoProcessoId: z.string().min(1).optional(),
    movimentoComunicadoId: z.string().min(1).optional(),
    criadoPor: z.string().min(1),
  })
  .refine(
    (d) =>
      [d.anexoId, d.movimentoProcessoId, d.movimentoComunicadoId].filter(
        (v) => v !== undefined
      ).length === 1,
    {
      message:
        "Assine EXATAMENTE UM objeto: um anexo, um movimento de processo ou um " +
        "movimento de comunicado. Uma assinatura sem objeto não assina nada.",
    }
  );

export type AssinarInput = z.input<typeof zAssinar>;

/**
 * ASSINA — e recusa o modo qualificado com o motivo declarado.
 *
 * ⚠️ UM MOVIMENTO ACEITA UMA ASSINATURA SÓ (`assinaturaId @unique`). Quem precisa de
 * várias usa a FILA: ela é ordenada e diz quem falta.
 */
export async function assinarDocumento(
  prisma: PrismaClient,
  input: AssinarInput
): Promise<{ readonly assinaturaId: string; readonly hashConteudo: string }> {
  const d = zAssinar.parse(input);

  if (d.modo === "QUALIFICADA") {
    const estado = estadoDaAssinaturaQualificada();
    throw new Error(`${estado.motivo}\n${estado.detalhe}`);
  }

  return prisma.$transaction(async (tx) => {
    const alvo = await resolverAlvo(tx, d);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.assinarDocumento, alvo.escopo);

    // ⚠️ UM INSERT, E SÓ. A FK mora na assinatura (ver o schema): assinar não reescreve
    // o movimento, e a unicidade da coluna é o que impede duas assinaturas no mesmo.
    const assinatura = await tx.assinaturaDeDocumento.create({
      data: {
        modo: d.modo,
        assinadoPor: d.criadoPor,
        hashConteudo: alvo.hashConteudo,
        anexoId: d.anexoId ?? null,
        movimentoProcessoId: d.movimentoProcessoId ?? null,
        movimentoComunicadoId: d.movimentoComunicadoId ?? null,
      },
      select: { id: true },
    });

    return { assinaturaId: assinatura.id, hashConteudo: alvo.hashConteudo };
  });
}

/** O objeto assinado, o hash do conteúdo dele e a UG do fato. */
async function resolverAlvo(
  tx: Tx,
  d: {
    readonly anexoId?: string | undefined;
    readonly movimentoProcessoId?: string | undefined;
    readonly movimentoComunicadoId?: string | undefined;
  }
): Promise<{
  readonly hashConteudo: string;
  readonly escopo: "ENTE" | { readonly setor: string };
}> {
  if (d.anexoId !== undefined) {
    const a = await tx.anexo.findUnique({
      where: { id: d.anexoId },
      select: { sha256: true, processoId: true, movimentoProcesso: { select: { processoId: true } } },
    });
    if (a === null) throw new Error(`Anexo ${d.anexoId} não existe. Nada foi gravado.`);
    const processoId = a.processoId ?? a.movimentoProcesso?.processoId ?? null;
    return {
      // ⚠️ O HASH DO ANEXO JÁ EXISTE — é o mesmo que a integridade confere na entrega.
      // Recalculá-lo aqui exigiria ler o arquivo, e assinar um hash lido do disco em
      // vez do registrado deixaria a assinatura acompanhar uma troca de arquivo.
      hashConteudo: a.sha256,
      escopo: processoId !== null ? await escopoDoProcesso(tx, processoId) : "ENTE",
    };
  }

  if (d.movimentoProcessoId !== undefined) {
    const m = await tx.movimentoDoProcesso.findUnique({
      where: { id: d.movimentoProcessoId },
      select: {
        texto: true,
        tipo: true,
        processoId: true,
        assinatura: { select: { id: true } },
      },
    });
    if (m === null) {
      throw new Error(`Movimento ${d.movimentoProcessoId} não existe. Nada foi gravado.`);
    }
    if (m.assinatura !== null) {
      throw new Error(
        `Este movimento já está assinado. Um movimento aceita UMA assinatura; para ` +
          `colher várias, use a FILA DE ASSINATURA — ela é ordenada e diz quem falta. ` +
          `Nada foi gravado.`
      );
    }
    return {
      hashConteudo: hashDoTexto(`${m.tipo}\n${m.texto}`),
      escopo: await escopoDoProcesso(tx, m.processoId),
    };
  }

  const m = await tx.movimentoDoComunicado.findUnique({
    where: { id: d.movimentoComunicadoId ?? "" },
    select: {
      tipo: true,
      assinatura: { select: { id: true } },
      comunicado: { select: { assunto: true, corpo: true, setorRemetenteId: true } },
    },
  });
  if (m === null) {
    throw new Error(`Movimento de comunicado não existe. Nada foi gravado.`);
  }
  if (m.assinatura !== null) {
    throw new Error(`Este movimento já está assinado. Nada foi gravado.`);
  }
  return {
    hashConteudo: hashDoTexto(`${m.comunicado.assunto}\n${m.comunicado.corpo}`),
    escopo: { setor: m.comunicado.setorRemetenteId },
  };
}

async function escopoDoProcesso(
  tx: Tx,
  processoId: string
): Promise<{ readonly setor: string }> {
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
  if (p === null) throw new Error(`Processo ${processoId} não existe. Nada foi gravado.`);
  return { setor: setorAtual(p.setorAberturaId, p.movimentos) };
}

export function hashDoTexto(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

// ═══════════════════════════════════════════════════════════════════════════
// A FILA — o documento assinado segue para o PRÓXIMO signatário
// ═══════════════════════════════════════════════════════════════════════════

export const zCriarFila = z.object({
  descricao: z.string().trim().min(5),
  modo: z.enum(["SIMPLES", "AVANCADA", "QUALIFICADA"]),
  anexoId: z.string().min(1),
  /** Em ORDEM. O primeiro assina primeiro — e o segundo não pode furar a fila. */
  signatarios: z.array(z.string().min(1)).min(1),
  criadoPor: z.string().min(1),
});
export type CriarFilaInput = z.input<typeof zCriarFila>;

/**
 * AS PRÉ-CONDIÇÕES DA FILA — PURAS, e exportadas de propósito.
 *
 * ⚠️ ELAS EXISTEM SEPARADAS PORQUE QUEM GERA UM DOCUMENTO PRECISA SABER **ANTES DE
 * GRAVÁ-LO** se a fila vai ser aceita.
 *
 * O caso que obrigou a extração: `enviarEmpenhoParaAssinatura` (M05) grava o `Anexo` e
 * só então abre a fila — e as duas operações não cabem numa transação só (transação
 * aninhada no Prisma não compõe). Uma tentativa com modo QUALIFICADA criava o anexo e
 * morria na fila, deixando um documento órfão; e o guard de "um documento por fato"
 * passava a recusar a tentativa seguinte, correta. **O empenho ficava impossível de
 * assinar por qualquer modo, para sempre.**
 *
 * Conferir aqui, antes de gravar qualquer coisa, torna o órfão inalcançável por erro de
 * entrada — sobra só a falha de infraestrutura no meio, que é outra classe de problema.
 *
 * ⚠️ E É UMA FUNÇÃO SÓ, chamada pelos dois lados. Recopiar as duas conferências no M05
 * teria criado a segunda verdade sobre "esta fila é viável?", e elas divergiriam na
 * primeira regra nova que alguém acrescentasse de um lado só.
 */
export function exigirFilaViavel(
  modo: "SIMPLES" | "AVANCADA" | "QUALIFICADA",
  signatarios: readonly string[]
): readonly string[] {
  if (modo === "QUALIFICADA") {
    const estado = estadoDaAssinaturaQualificada();
    throw new Error(`${estado.motivo}\n${estado.detalhe}`);
  }

  const unicos = [...new Set(signatarios)];
  if (unicos.length !== signatarios.length) {
    throw new Error(
      "Signatário repetido na fila. Assinar duas vezes o mesmo documento não acrescenta " +
        "nada, e a fila ficaria travada esperando a segunda. Nada foi gravado."
    );
  }
  return unicos;
}

export async function criarFilaDeAssinatura(
  prisma: PrismaClient,
  input: CriarFilaInput
): Promise<{ readonly filaId: string; readonly proximo: string }> {
  const d = zCriarFila.parse(input);

  const unicos = exigirFilaViavel(d.modo, d.signatarios);

  return prisma.$transaction(async (tx) => {
    const alvo = await resolverAlvo(tx, { anexoId: d.anexoId });
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarFilaDeAssinatura, alvo.escopo);

    const fila = await tx.filaDeAssinatura.create({
      data: {
        descricao: d.descricao,
        modo: d.modo,
        anexoId: d.anexoId,
        criadoPor: d.criadoPor,
        signatarios: {
          create: unicos.map((usuarioIdent, i) => ({ ordem: i + 1, usuarioIdent })),
        },
      },
      select: { id: true },
    });

    // ⚠️ SÓ O PRIMEIRO É NOTIFICADO. Avisar todos de uma vez faria três pessoas abrirem
    // o documento e duas descobrirem que não é a vez delas — e da terceira vez elas
    // param de abrir.
    const primeiro = unicos[0]!;
    await registrarNotificacao(tx, {
      destinatario: primeiro,
      evento: "DOCUMENTO_AGUARDANDO_ASSINATURA",
      titulo: `Documento aguardando sua assinatura`,
      corpo: d.descricao,
      rota: `/documentos/assinaturas/${fila.id}`,
    });

    return { filaId: fila.id, proximo: primeiro };
  });
}

export const zAssinarNaFila = z.object({
  filaId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type AssinarNaFilaInput = z.input<typeof zAssinarNaFila>;

/**
 * ASSINA A SUA VEZ NA FILA — e recusa quem tenta furá-la.
 *
 * ⚠️ A ORDEM É DADO, NÃO CONVENÇÃO. Sem a recusa, "fila" seria só uma lista, e o
 * terceiro signatário poderia assinar antes do primeiro — o que inverte exatamente a
 * hierarquia que a fila existe para representar.
 */
export async function assinarNaFila(
  prisma: PrismaClient,
  input: AssinarNaFilaInput
): Promise<{
  readonly assinaturaId: string;
  readonly proximo: string | null;
  readonly concluida: boolean;
}> {
  const d = zAssinarNaFila.parse(input);

  return prisma.$transaction(async (tx) => {
    const fila = await tx.filaDeAssinatura.findUnique({
      where: { id: d.filaId },
      select: {
        modo: true,
        descricao: true,
        anexoId: true,
        signatarios: {
          select: { id: true, ordem: true, usuarioIdent: true, assinatura: { select: { id: true } } },
          orderBy: { ordem: "asc" },
        },
      },
    });
    if (fila === null || fila.anexoId === null) {
      throw new Error(`Fila de assinatura ${d.filaId} não existe. Nada foi gravado.`);
    }

    const alvo = await resolverAlvo(tx, { anexoId: fila.anexoId });
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.assinarNaFila, alvo.escopo);

    const pendentes = fila.signatarios.filter((s) => s.assinatura === null);
    const vez = pendentes[0];
    if (vez === undefined) {
      throw new Error(
        `A fila "${fila.descricao}" já está completa — todos assinaram. Nada foi gravado.`
      );
    }
    if (vez.usuarioIdent !== d.criadoPor) {
      const meu = fila.signatarios.find((s) => s.usuarioIdent === d.criadoPor);
      throw new Error(
        meu === undefined
          ? `"${d.criadoPor}" não é signatário desta fila. Nada foi gravado.`
          : `Ainda não é a sua vez: falta "${vez.usuarioIdent}" (posição ${vez.ordem}); ` +
            `você é a posição ${meu.ordem}. A ordem da fila é a hierarquia do documento — ` +
            `assinar fora dela a inverteria. Nada foi gravado.`
      );
    }

    const assinatura = await tx.assinaturaDeDocumento.create({
      data: {
        modo: fila.modo,
        assinadoPor: d.criadoPor,
        hashConteudo: alvo.hashConteudo,
        anexoId: fila.anexoId,
        signatarioId: vez.id,
      },
      select: { id: true },
    });

    const proximo = pendentes[1]?.usuarioIdent ?? null;
    if (proximo !== null) {
      await registrarNotificacao(tx, {
        destinatario: proximo,
        evento: "DOCUMENTO_AGUARDANDO_ASSINATURA",
        titulo: `Documento aguardando sua assinatura`,
        corpo: fila.descricao,
        rota: `/documentos/assinaturas/${d.filaId}`,
      });
    }

    return { assinaturaId: assinatura.id, proximo, concluida: proximo === null };
  });
}
