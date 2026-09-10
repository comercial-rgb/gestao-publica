import { z } from "zod";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { notificarVarios, registrarNotificacao } from "../m24-notificacoes/notificacoes.js";

/**
 * M27 — AJUDA CONTEXTUAL E CHAMADOS. Seção 2.8 do prompt do lote.
 *
 * ═══ ⚠️ A AJUDA NÃO ABRE CHAMADO ═══
 * O catálogo pede as duas coisas separadas, e a separação é o valor: quem não sabe
 * onde clicar não precisa de um protocolo aberto no seu nome, e o suporte não precisa
 * de uma fila cheia de perguntas que a própria tela responderia.
 */

// ═══════════════════════════════════════════════════════════════════════════
// AJUDA CONTEXTUAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ A ROTA É INTERNA, E O FORMATO É COBRADO. Sem isto, um texto de ajuda poderia
 * apontar para fora — e um link vindo do banco, renderizado numa tela autenticada, é
 * redirecionamento aberto esperando acontecer.
 */
const zRota = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(
    /^\/[A-Za-z0-9\-_/[\]]*$/,
    "A rota da ajuda é INTERNA: começa com '/' e não tem domínio nem protocolo."
  );

export const zEscreverAjuda = z.object({
  rota: zRota,
  titulo: z.string().trim().min(3).max(120),
  conteudo: z.string().trim().min(10).max(10_000),
  criadoPor: z.string().min(1),
});
export type EscreverAjudaInput = z.input<typeof zEscreverAjuda>;

/**
 * ESCREVE (ou reescreve) a ajuda de uma rota — acrescentando uma versão.
 *
 * ⚠️ NUNCA UPDATE. "Quem mudou este texto, e quando?" é pergunta legítima no dia em
 * que alguém seguiu a instrução antiga e errou. Com append, a resposta está na tabela.
 */
export async function escreverAjudaDeRota(
  prisma: PrismaClient,
  input: EscreverAjudaInput
): Promise<{ readonly ajudaId: string }> {
  const d = zEscreverAjuda.parse(input);

  return prisma.$transaction(async (tx) => {
    // Ato do ENTE: a ajuda de uma rota vale para o produto inteiro, não para uma
    // unidade gestora. Só a permissão global autoriza.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.escreverAjudaDeRota, "ENTE");

    const a = await tx.ajudaDeRota.create({
      data: {
        rota: d.rota,
        titulo: d.titulo,
        conteudo: d.conteudo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { ajudaId: a.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SEVERIDADE — cadastro, não enum
// ═══════════════════════════════════════════════════════════════════════════

export const zCriarSeveridade = z.object({
  codigo: z.string().trim().min(1).max(10),
  nome: z.string().trim().min(3).max(60),
  ordem: z.number().int().min(1).max(99),
  prazoHoras: z.number().int().min(1).max(8760).optional(),
  criadoPor: z.string().min(1),
});
export type CriarSeveridadeInput = z.input<typeof zCriarSeveridade>;

export async function criarNivelDeSeveridade(
  prisma: PrismaClient,
  input: CriarSeveridadeInput
): Promise<{ readonly severidadeId: string }> {
  const d = zCriarSeveridade.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarNivelDeSeveridade, "ENTE");

    const existente = await tx.nivelDeSeveridade.findUnique({
      where: { codigo: d.codigo },
      select: { nome: true },
    });
    if (existente !== null) {
      throw new Error(
        `Já existe o nível de severidade "${d.codigo}" (${existente.nome}). Nada foi gravado.`
      );
    }

    const s = await tx.nivelDeSeveridade.create({
      data: {
        codigo: d.codigo,
        nome: d.nome,
        ordem: d.ordem,
        prazoHoras: d.prazoHoras ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { severidadeId: s.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAMADOS
// ═══════════════════════════════════════════════════════════════════════════

export const zAbrirChamado = z.object({
  unidadeOrcId: z.string().min(1),
  severidadeId: z.string().min(1),
  titulo: z.string().trim().min(5).max(160),
  descricao: z.string().trim().min(20, "Descreva o problema: 20 caracteres é o mínimo para alguém conseguir ajudar."),
  rota: zRota.optional(),
  criadoPor: z.string().min(1),
});
export type AbrirChamadoInput = z.input<typeof zAbrirChamado>;

/**
 * ABRE O CHAMADO — com número único no produto inteiro.
 *
 * ⚠️ O TRINCO ANTES DA SOMA, como em todo sequencial deste repositório. Duas aberturas
 * concorrentes leriam `MAX(numero)` no mesmo estado e as duas gravariam o mesmo — e
 * aqui a colisão é pior que noutros lugares: o `@unique` faria a segunda pessoa perder
 * o texto que acabou de escrever descrevendo um problema.
 */
export async function abrirChamado(
  prisma: PrismaClient,
  input: AbrirChamadoInput
): Promise<{ readonly chamadoId: string; readonly numero: number }> {
  const d = zAbrirChamado.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.abrirChamado, {
      ug: d.unidadeOrcId,
    });

    const sev = await tx.nivelDeSeveridade.findUnique({
      where: { id: d.severidadeId },
      select: { ativo: true, nome: true, codigo: true },
    });
    if (sev === null || !sev.ativo) {
      throw new Error(
        `Nível de severidade ${d.severidadeId} não existe ou está desativado. ` +
          `A escala de severidade é CADASTRO da entidade — cadastre-a antes de abrir ` +
          `chamado. Nada foi gravado.`
      );
    }

    await travar(tx, "SequenciaDeChamado", ["chamado"]);
    const ultimo = await tx.chamado.findFirst({
      select: { numero: true },
      orderBy: { numero: "desc" },
    });
    const numero = (ultimo?.numero ?? 0) + 1;

    const c = await tx.chamado.create({
      data: {
        numero,
        unidadeOrcId: d.unidadeOrcId,
        severidadeId: d.severidadeId,
        titulo: d.titulo,
        descricao: d.descricao,
        rota: d.rota ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true, numero: true },
    });
    return { chamadoId: c.id, numero: c.numero };
  });
}

export const zResponderChamado = z.object({
  chamadoId: z.string().min(1),
  texto: z.string().trim().min(5),
  criadoPor: z.string().min(1),
});
export type ResponderChamadoInput = z.input<typeof zResponderChamado>;

/**
 * RESPONDE — e notifica quem abriu.
 *
 * ⚠️ RESPONDER NÃO ENCERRA. Quem abriu o chamado é quem sabe se o problema acabou;
 * fechar junto com a resposta faria a métrica de resolução medir a velocidade do
 * suporte em digitar, não em resolver.
 */
export async function responderChamado(
  prisma: PrismaClient,
  input: ResponderChamadoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zResponderChamado.parse(input);

  return prisma.$transaction(async (tx) => {
    const c = await carregar(tx, d.chamadoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.responderChamado, {
      ug: c.unidadeOrcId,
    });
    exigirAberto(c, "resposta");

    const m = await tx.movimentoDoChamado.create({
      data: {
        chamadoId: c.id,
        tipo: "RESPOSTA",
        texto: d.texto,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    await notificarVarios(tx, [c.criadoPor], {
      evento: "CHAMADO_RESPONDIDO",
      titulo: `Chamado ${c.numero}: nova resposta`,
      corpo: d.texto.slice(0, 280),
      rota: `/suporte/chamados/${c.id}`,
    });

    return { movimentoId: m.id };
  });
}

export const zEncerrarChamado = z.object({
  chamadoId: z.string().min(1),
  texto: z.string().trim().min(5),
  criadoPor: z.string().min(1),
});
export type EncerrarChamadoInput = z.input<typeof zEncerrarChamado>;

export async function encerrarChamado(
  prisma: PrismaClient,
  input: EncerrarChamadoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEncerrarChamado.parse(input);

  return prisma.$transaction(async (tx) => {
    const c = await carregar(tx, d.chamadoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.encerrarChamado, {
      ug: c.unidadeOrcId,
    });
    exigirAberto(c, "encerramento");

    const m = await tx.movimentoDoChamado.create({
      data: {
        chamadoId: c.id,
        tipo: "ENCERRAMENTO",
        texto: d.texto,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    // ⚠️ A PESQUISA É PEDIDA NO ENCERRAMENTO, e não antes: perguntar "ficou satisfeito?"
    // com o problema em aberto mede impaciência, não satisfação.
    await registrarNotificacao(tx, {
      destinatario: c.criadoPor,
      evento: "CHAMADO_ENCERRADO",
      titulo: `Chamado ${c.numero} encerrado`,
      corpo: `${d.texto.slice(0, 200)} — sua avaliação ajuda a melhorar o atendimento.`,
      rota: `/suporte/chamados/${c.id}`,
    });

    return { movimentoId: m.id };
  });
}

export const zReabrirChamado = z.object({
  chamadoId: z.string().min(1),
  texto: z.string().trim().min(10),
  criadoPor: z.string().min(1),
});
export type ReabrirChamadoInput = z.input<typeof zReabrirChamado>;

export async function reabrirChamado(
  prisma: PrismaClient,
  input: ReabrirChamadoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zReabrirChamado.parse(input);

  return prisma.$transaction(async (tx) => {
    const c = await carregar(tx, d.chamadoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.reabrirChamado, {
      ug: c.unidadeOrcId,
    });
    if (!fechado(c)) {
      throw new Error(
        `O chamado ${c.numero} já está aberto. Reabrir o que está aberto acrescentaria ` +
          `um movimento que não muda nada. Nada foi gravado.`
      );
    }

    const m = await tx.movimentoDoChamado.create({
      data: {
        chamadoId: c.id,
        tipo: "REABERTURA",
        texto: d.texto,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}

export const zResponderPesquisa = z.object({
  chamadoId: z.string().min(1),
  /** 1 a 5. A escala mora aqui, não no banco — ver o schema. */
  nota: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(1000).optional(),
  criadoPor: z.string().min(1),
});
export type ResponderPesquisaInput = z.input<typeof zResponderPesquisa>;

/**
 * A PESQUISA DE SATISFAÇÃO — respondida por QUEM ABRIU, depois do encerramento.
 *
 * ⚠️ E ELA NÃO É EDITÁVEL. Uma nota que pode ser trocada depois de o suporte ver o
 * resultado não é pesquisa: é negociação. O `@unique` do banco garante a única.
 */
export async function responderPesquisaDeSatisfacao(
  prisma: PrismaClient,
  input: ResponderPesquisaInput
): Promise<{ readonly pesquisaId: string }> {
  const d = zResponderPesquisa.parse(input);

  return prisma.$transaction(async (tx) => {
    const c = await carregar(tx, d.chamadoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.responderPesquisaDeSatisfacao, {
      ug: c.unidadeOrcId,
    });

    if (c.criadoPor !== d.criadoPor) {
      throw new Error(
        `A pesquisa de satisfação é de quem ABRIU o chamado ${c.numero}. Deixar outra ` +
          `pessoa respondê-la — inclusive quem o atendeu — transformaria a medida do ` +
          `atendimento numa autoavaliação. Nada foi gravado.`
      );
    }
    if (!fechado(c)) {
      throw new Error(
        `O chamado ${c.numero} ainda está aberto. Perguntar "ficou satisfeito?" com o ` +
          `problema em aberto mede impaciência, não satisfação. Nada foi gravado.`
      );
    }
    if (c.temPesquisa) {
      throw new Error(
        `A pesquisa do chamado ${c.numero} já foi respondida, e ela não se altera: uma ` +
          `nota que muda depois de o suporte ver o resultado não é pesquisa, é ` +
          `negociação. Nada foi gravado.`
      );
    }

    const p = await tx.pesquisaDeSatisfacao.create({
      data: {
        chamadoId: c.id,
        nota: d.nota,
        comentario: d.comentario ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { pesquisaId: p.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — privados
// ═══════════════════════════════════════════════════════════════════════════

interface ChamadoCarregado {
  readonly id: string;
  readonly numero: number;
  readonly unidadeOrcId: string;
  readonly criadoPor: string;
  readonly temPesquisa: boolean;
  readonly movimentos: readonly {
    readonly tipo: "RESPOSTA" | "ENCERRAMENTO" | "REABERTURA";
    readonly criadoEm: Date;
  }[];
}

async function carregar(tx: Tx, chamadoId: string): Promise<ChamadoCarregado> {
  const c = await tx.chamado.findUnique({
    where: { id: chamadoId },
    select: {
      id: true,
      numero: true,
      unidadeOrcId: true,
      criadoPor: true,
      satisfacao: { select: { id: true } },
      movimentos: { select: { tipo: true, criadoEm: true } },
    },
  });
  if (c === null) {
    throw new Error(`Chamado ${chamadoId} não encontrado. Nada foi gravado.`);
  }
  return { ...c, temPesquisa: c.satisfacao !== null };
}

/** ⚠️ FECHADO É DERIVADO: o último movimento de fechamento/reabertura manda. */
function fechado(c: ChamadoCarregado): boolean {
  const relevantes = [...c.movimentos]
    .filter((m) => m.tipo === "ENCERRAMENTO" || m.tipo === "REABERTURA")
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
  return relevantes[relevantes.length - 1]?.tipo === "ENCERRAMENTO";
}

function exigirAberto(c: ChamadoCarregado, oQue: string): void {
  if (!fechado(c)) return;
  throw new Error(
    `O chamado ${c.numero} está ENCERRADO e não aceita ${oQue}. Para voltar a tratá-lo, ` +
      `REABRA — a reabertura é um movimento registrado, com autor e motivo. ` +
      `Nada foi gravado.`
  );
}
