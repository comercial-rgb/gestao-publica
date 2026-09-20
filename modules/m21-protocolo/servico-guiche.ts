import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { travar } from "../../packages/locks/index.js";
import { diaCivil, diaCivilBr, meioDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import {
  horariosDaJanela,
  janelaValeNoDia,
  janelasSeSobrepoem,
  minutosDaHora,
  ofertaDoDia,
  type HorarioOfertado,
  type JanelaVigente,
} from "./guiche.js";

/**
 * M21 — OS CASOS DE USO DA AGENDA DO GUICHÊ (V11 V8, TR 5.39.92).
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO PROTEGE ═══
 * Marcar atendimento presencial parece cadastro e não é: é CONSUMO DE SALDO. Cada horário tem
 * uma capacidade, e capacidade se estoura exatamente como saldo de ficha — duas pessoas leem "há
 * um lugar", as duas gravam, e três pessoas aparecem às 14:30 para dois lugares. Por isso a
 * reserva toma o trinco do horário ANTES de contar, como o empenho toma o da ficha.
 *
 * ═══ ⚠️ SÓ SE OFERECE O QUE O ENTE CONFIGUROU ═══
 * Não há horário padrão em lugar nenhum deste arquivo. Sem janela publicada, o guichê não
 * oferece nada e a reserva é RECUSADA nomeando a ausência. Prometer "das 8h às 17h" porque é o
 * usual é marcar o cidadão para uma porta que pode estar fechada — e o pedido diz isso com todas
 * as letras: "só aplicar regra configurada e sustentada pela fonte".
 *
 * ═══ ⚠️ APPEND-ONLY ═══
 * A reserva nunca é alterada. Confirmar, cancelar, reagendar e registrar a realização são FATOS
 * em tabelas próprias, e o compromisso vigente é o do último reagendamento. A pergunta "para
 * quando estava marcado antes?" tem resposta.
 */

// ═══════════════════════════════════════════════════════════════════════════
// A CONFIGURAÇÃO — quem organiza o atendimento
// ═══════════════════════════════════════════════════════════════════════════

const zDiaCivil = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "A data é AAAA-MM-DD, no dia civil do ente.");
const zHora = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "A hora é HH:MM, entre 00:00 e 23:59.");

export const zCriarUnidadeDeAtendimento = z.object({
  codigo: z.string().trim().min(1).max(20).regex(/^[A-Z0-9-]+$/, "O código da unidade usa maiúsculas, dígitos e '-'."),
  nome: z.string().trim().min(3).max(120),
  endereco: z.string().trim().min(5).max(240),
  setorId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type CriarUnidadeDeAtendimentoInput = z.input<typeof zCriarUnidadeDeAtendimento>;

export async function criarUnidadeDeAtendimento(
  prisma: PrismaClient,
  input: CriarUnidadeDeAtendimentoInput
): Promise<{ readonly unidadeId: string }> {
  const d = zCriarUnidadeDeAtendimento.parse(input);

  return prisma.$transaction(async (tx) => {
    const setor = await tx.setor.findUnique({
      where: { id: d.setorId },
      select: { id: true, nome: true, unidadeOrcId: true },
    });
    if (setor === null) throw new Error(`Setor ${d.setorId} não existe. Nada foi gravado.`);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarUnidadeDeAtendimento, { ug: setor.unidadeOrcId });

    const existente = await tx.unidadeDeAtendimento.findUnique({
      where: { codigo: d.codigo },
      select: { nome: true },
    });
    if (existente !== null) {
      throw new Error(
        `Já existe a unidade de atendimento "${d.codigo}" (${existente.nome}). Nada foi gravado.`
      );
    }

    const u = await tx.unidadeDeAtendimento.create({
      data: { codigo: d.codigo, nome: d.nome, endereco: d.endereco, setorId: d.setorId, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { unidadeId: u.id };
  });
}

export const zCriarGuiche = z.object({
  unidadeId: z.string().min(1),
  nome: z.string().trim().min(1).max(60),
  criadoPor: z.string().min(1),
});
export type CriarGuicheInput = z.input<typeof zCriarGuiche>;

export async function criarGuiche(
  prisma: PrismaClient,
  input: CriarGuicheInput
): Promise<{ readonly guicheId: string }> {
  const d = zCriarGuiche.parse(input);

  return prisma.$transaction(async (tx) => {
    const unidade = await tx.unidadeDeAtendimento.findUnique({
      where: { id: d.unidadeId },
      select: { id: true, nome: true, setor: { select: { unidadeOrcId: true } } },
    });
    if (unidade === null) throw new Error(`Unidade de atendimento ${d.unidadeId} não existe. Nada foi gravado.`);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarGuiche, { ug: unidade.setor.unidadeOrcId });

    const repetido = await tx.guicheDeAtendimento.findUnique({
      where: { unidadeId_nome: { unidadeId: d.unidadeId, nome: d.nome } },
      select: { id: true },
    });
    if (repetido !== null) {
      throw new Error(
        `A unidade ${unidade.nome} já tem um guichê chamado "${d.nome}". Dois guichês com o mesmo ` +
          `nome no mesmo lugar mandariam duas pessoas para a mesma porta. Nada foi gravado.`
      );
    }

    const g = await tx.guicheDeAtendimento.create({
      data: { unidadeId: d.unidadeId, nome: d.nome, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { guicheId: g.id };
  });
}

export const zDefinirServicoNoGuiche = z.object({
  guicheId: z.string().min(1),
  servicoId: z.string().min(1),
  habilitado: z.boolean(),
  /**
   * ⚠️ O CIDADÃO PODE MARCAR ESTE SERVIÇO SOZINHO, PELO PORTAL? Ausente = `false`, e o padrão é a
   * decisão: um serviço só vai para a internet quando alguém disser que vai. Há atendimento que
   * exige triagem antes, e oferecê-lo no portal mandaria a pessoa ao balcão para ouvir que não
   * era ali.
   */
  agendamentoPublico: z.boolean().optional(),
  motivo: z.string().trim().min(3).max(240).optional(),
  criadoPor: z.string().min(1),
});
export type DefinirServicoNoGuicheInput = z.input<typeof zDefinirServicoNoGuiche>;

/**
 * HABILITA ou DESABILITA um serviço da carta neste guichê — um FATO, nunca um UPDATE.
 *
 * ⚠️ REPETIR A MESMA SITUAÇÃO É RECUSADO: "habilitar o que já está habilitado" não é um fato
 * novo, e uma linha a mais sem diferença nenhuma só suja o histórico que a tabela existe para
 * guardar — o mesmo raciocínio da declaração de disponibilidade (V7.3).
 */
export async function definirServicoNoGuiche(
  prisma: PrismaClient,
  input: DefinirServicoNoGuicheInput
): Promise<{ readonly situacaoId: string }> {
  const d = zDefinirServicoNoGuiche.parse(input);

  return prisma.$transaction(async (tx) => {
    const guiche = await tx.guicheDeAtendimento.findUnique({
      where: { id: d.guicheId },
      select: { id: true, nome: true, unidade: { select: { setor: { select: { unidadeOrcId: true } } } } },
    });
    if (guiche === null) throw new Error(`Guichê ${d.guicheId} não existe. Nada foi gravado.`);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.definirServicoNoGuiche, {
      ug: guiche.unidade.setor.unidadeOrcId,
    });

    const servico = await tx.servicoDaCarta.findUnique({
      where: { id: d.servicoId },
      select: { titulo: true },
    });
    if (servico === null) throw new Error(`Serviço ${d.servicoId} não existe na carta. Nada foi gravado.`);

    const publico = d.agendamentoPublico ?? false;
    const vigente = await situacaoVigenteDoServico(tx, d.guicheId, d.servicoId);

    // ⚠️ AS DUAS DECISÕES JUNTAS FORMAM O FATO. Mudar SÓ o "aceita marcação pela internet" é um
    // fato novo — e dos que mais importam, porque abre o serviço ao público. Comparar só
    // `habilitado` faria essa mudança ser recusada como repetição, e o ente ficaria sem caminho
    // para abrir ou fechar o portal de um serviço já atendido.
    if (vigente.habilitado === d.habilitado && vigente.agendamentoPublico === publico) {
      throw new Error(
        `O serviço "${servico.titulo}" já está ${d.habilitado ? "HABILITADO" : "DESABILITADO"} no ` +
          `guichê ${guiche.nome}${d.habilitado ? `, ${publico ? "com" : "sem"} marcação pela internet` : ""}. ` +
          `Nada foi gravado.`
      );
    }

    // ⚠️ DESABILITAR FECHA O PORTAL JUNTO. Um serviço que o guichê não atende não pode continuar
    // agendável pela internet — seriam pessoas marcando para uma fila que não existe mais.
    const s = await tx.situacaoDoServicoNoGuiche.create({
      data: {
        guicheId: d.guicheId,
        servicoId: d.servicoId,
        habilitado: d.habilitado,
        agendamentoPublico: d.habilitado && publico,
        motivo: d.motivo ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { situacaoId: s.id };
  });
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * A situação VIGENTE do serviço no guichê — a última. Nunca declarado = não atendido e fechado ao
 * portal, que é o fail-closed certo: ausência de decisão não é permissão.
 */
async function situacaoVigenteDoServico(
  tx: Tx,
  guicheId: string,
  servicoId: string
): Promise<{ readonly habilitado: boolean; readonly agendamentoPublico: boolean }> {
  const ultima = await tx.situacaoDoServicoNoGuiche.findFirst({
    where: { guicheId, servicoId },
    orderBy: { criadoEm: "desc" },
    select: { habilitado: true, agendamentoPublico: true },
  });
  return {
    habilitado: ultima?.habilitado ?? false,
    agendamentoPublico: ultima?.agendamentoPublico ?? false,
  };
}

export const zPublicarJanela = z.object({
  guicheId: z.string().min(1),
  diaDaSemana: z.number().int().min(0).max(6),
  horaInicio: zHora,
  horaFim: zHora,
  duracaoMinutos: z.number().int().min(5).max(480),
  capacidade: z.number().int().min(1).max(100),
  vigenciaInicio: zDiaCivil,
  vigenciaFim: zDiaCivil.nullable().optional(),
  criadoPor: z.string().min(1),
});
export type PublicarJanelaInput = z.input<typeof zPublicarJanela>;

/**
 * PUBLICA UMA JANELA DE OFERTA — o que o guichê passa a oferecer naquele dia da semana.
 *
 * ⚠️ RECUSA JANELA QUE NÃO OFERECE NADA. Uma faixa menor que a duração aceita reserva nenhuma e
 * não diz por quê; o ente configuraria e ficaria esperando marcações que nunca chegariam.
 *
 * ⚠️ RECUSA SOBREPOSIÇÃO com outra janela vigente do mesmo guichê no mesmo dia da semana. Duas
 * ofertas cobrindo o mesmo minuto dariam duas capacidades para o mesmo lugar.
 */
export async function publicarJanelaDeAtendimento(
  prisma: PrismaClient,
  input: PublicarJanelaInput
): Promise<{ readonly janelaId: string; readonly horariosOfertados: number }> {
  const d = zPublicarJanela.parse(input);

  if (minutosDaHora(d.horaFim) <= minutosDaHora(d.horaInicio)) {
    throw new Error(`A janela ${d.horaInicio}–${d.horaFim} termina antes de começar. Nada foi gravado.`);
  }
  const horarios = horariosDaJanela(d);
  if (horarios.length === 0) {
    throw new Error(
      `A janela ${d.horaInicio}–${d.horaFim} não comporta nenhum atendimento de ${d.duracaoMinutos} ` +
        `minutos: ela ofereceria zero horários e o guichê ficaria esperando marcação que não pode ` +
        `chegar. Nada foi gravado.`
    );
  }

  const inicio = meioDiaCivil(d.vigenciaInicio);
  const fim = d.vigenciaFim === null || d.vigenciaFim === undefined ? null : meioDiaCivil(d.vigenciaFim);
  if (fim !== null && diaCivil(fim) < diaCivil(inicio)) {
    throw new Error(`A vigência termina (${d.vigenciaFim}) antes de começar (${d.vigenciaInicio}). Nada foi gravado.`);
  }

  return prisma.$transaction(async (tx) => {
    const guiche = await tx.guicheDeAtendimento.findUnique({
      where: { id: d.guicheId },
      select: { id: true, nome: true, unidade: { select: { setor: { select: { unidadeOrcId: true } } } } },
    });
    if (guiche === null) throw new Error(`Guichê ${d.guicheId} não existe. Nada foi gravado.`);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarJanelaDeAtendimento, {
      ug: guiche.unidade.setor.unidadeOrcId,
    });

    const nova: JanelaVigente = {
      id: "nova",
      diaDaSemana: d.diaDaSemana,
      horaInicio: d.horaInicio,
      horaFim: d.horaFim,
      duracaoMinutos: d.duracaoMinutos,
      capacidade: d.capacidade,
      vigenciaInicio: inicio,
      vigenciaFim: fim,
    };

    const existentes = await tx.janelaDeAtendimento.findMany({
      where: { guicheId: d.guicheId, diaDaSemana: d.diaDaSemana },
      select: {
        id: true, diaDaSemana: true, horaInicio: true, horaFim: true,
        duracaoMinutos: true, capacidade: true, vigenciaInicio: true, vigenciaFim: true,
      },
    });
    const conflito = existentes.find((j) => janelasSeSobrepoem(nova, j));
    if (conflito !== undefined) {
      throw new Error(
        `Esta oferta se sobrepõe à janela ${conflito.horaInicio}–${conflito.horaFim} já publicada ` +
          `no guichê ${guiche.nome} para o mesmo dia da semana. Duas ofertas sobre o mesmo minuto ` +
          `dariam duas capacidades para o mesmo lugar, e quanto cabe passaria a depender de qual ` +
          `linha fosse lida primeiro. Encerre a vigência da anterior, ou publique fora da faixa ` +
          `dela. Nada foi gravado.`
      );
    }

    const j = await tx.janelaDeAtendimento.create({
      data: {
        guicheId: d.guicheId,
        diaDaSemana: d.diaDaSemana,
        horaInicio: d.horaInicio,
        horaFim: d.horaFim,
        duracaoMinutos: d.duracaoMinutos,
        capacidade: d.capacidade,
        vigenciaInicio: inicio,
        vigenciaFim: fim,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { janelaId: j.id, horariosOfertados: horarios.length };
  });
}

export const zFecharDia = z.object({
  unidadeId: z.string().min(1),
  dia: zDiaCivil,
  motivo: z.string().trim().min(3).max(240),
  criadoPor: z.string().min(1),
});
export type FecharDiaInput = z.input<typeof zFecharDia>;

/**
 * FECHA UM DIA da unidade — feriado, ponto facultativo, força maior.
 *
 * ⚠️ RECUSA SE JÁ HÁ RESERVA VIVA NO DIA, nomeando quantas. Fechar por cima delas deixaria
 * pessoas marcadas para um prédio fechado, e o sistema não teria como avisá-las depois: o
 * fechamento não cancela reserva nenhuma — quem cancela é quem cancela, com motivo.
 */
export async function fecharDiaDeAtendimento(
  prisma: PrismaClient,
  input: FecharDiaInput
): Promise<{ readonly excecaoId: string }> {
  const d = zFecharDia.parse(input);
  const dia = meioDiaCivil(d.dia);

  return prisma.$transaction(async (tx) => {
    const unidade = await tx.unidadeDeAtendimento.findUnique({
      where: { id: d.unidadeId },
      select: { id: true, nome: true, setor: { select: { unidadeOrcId: true } } },
    });
    if (unidade === null) throw new Error(`Unidade de atendimento ${d.unidadeId} não existe. Nada foi gravado.`);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.fecharDiaDeAtendimento, {
      ug: unidade.setor.unidadeOrcId,
    });

    const jaFechado = await tx.excecaoDeCalendarioDoAtendimento.findUnique({
      where: { unidadeId_dia: { unidadeId: d.unidadeId, dia } },
      select: { motivo: true },
    });
    if (jaFechado !== null) {
      throw new Error(
        `${diaCivilBr(dia)} já está fechado na unidade ${unidade.nome} (${jaFechado.motivo}). Nada foi gravado.`
      );
    }

    const esperando = await reservasQueAindaEsperamNoDia(tx, d.unidadeId, dia);
    if (esperando > 0) {
      throw new Error(
        `A unidade ${unidade.nome} tem ${esperando} pessoa(s) marcada(s) e ainda não atendida(s) em ` +
          `${diaCivilBr(dia)}. Fechar o dia por cima delas as deixaria marcadas para um prédio ` +
          `fechado. Cancele ou reagende essas marcações primeiro — cada uma com o seu motivo. ` +
          `Nada foi gravado.`
      );
    }

    const e = await tx.excecaoDeCalendarioDoAtendimento.create({
      data: { unidadeId: d.unidadeId, dia, motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { excecaoId: e.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A LEITURA DA OFERTA — a mesma contagem que a gravação usa
// ═══════════════════════════════════════════════════════════════════════════

interface ReservaComVigente {
  readonly id: string;
  readonly guicheId: string;
  readonly dia: Date;
  readonly horaInicio: string;
  readonly reagendamentos: readonly {
    readonly guicheId: string;
    readonly dia: Date;
    readonly horaInicio: string;
  }[];
}

/** O compromisso VIGENTE de uma reserva: o do último reagendamento, ou o original. */
function vigenteDaReserva(r: ReservaComVigente): { guicheId: string; dia: Date; horaInicio: string } {
  const ultimo = r.reagendamentos[0];
  return ultimo === undefined
    ? { guicheId: r.guicheId, dia: r.dia, horaInicio: r.horaInicio }
    : { guicheId: ultimo.guicheId, dia: ultimo.dia, horaInicio: ultimo.horaInicio };
}

/**
 * QUANTAS RESERVAS VIVAS ocupam cada horário de um guichê num dia.
 *
 * ⚠️ É ESTA FUNÇÃO QUE A TELA MOSTRA **E** QUE O GUARD DA RESERVA SUBTRAI. Duas aritméticas
 * produziriam uma agenda que oferece horário que a gravação recusa.
 *
 * ⚠️ "VIVA" É NÃO-CANCELADA, e o horário é o VIGENTE. Uma reserva que nasceu às 14:30 e foi
 * reagendada para as 15:00 não ocupa mais as 14:30; uma que veio de outro horário para as 14:30
 * ocupa. Contar pelo campo original deixaria lugares presos para sempre.
 */
export async function ocupacaoDoDia(
  tx: Tx,
  guicheId: string,
  dia: Date
): Promise<ReadonlyMap<string, number>> {
  const candidatas = await tx.reservaDeAtendimento.findMany({
    where: {
      cancelamento: { is: null },
      OR: [
        { guicheId, dia },
        { reagendamentos: { some: { guicheId, dia } } },
      ],
    },
    select: {
      id: true,
      guicheId: true,
      dia: true,
      horaInicio: true,
      reagendamentos: {
        orderBy: { sequencia: "desc" },
        take: 1,
        select: { guicheId: true, dia: true, horaInicio: true },
      },
    },
  });

  const porHora = new Map<string, number>();
  const alvo = diaCivil(dia);
  for (const r of candidatas) {
    const v = vigenteDaReserva(r);
    if (v.guicheId !== guicheId || diaCivil(v.dia) !== alvo) continue;
    porHora.set(v.horaInicio, (porHora.get(v.horaInicio) ?? 0) + 1);
  }
  return porHora;
}

/**
 * Quantas pessoas AINDA ESPERAM atendimento num dia, em qualquer guichê da unidade.
 *
 * ═══ ⚠️ ESTA CONTAGEM NÃO É A DA CAPACIDADE, E A DIFERENÇA É O ATENDIMENTO JÁ REALIZADO ═══
 * Para a CAPACIDADE, uma reserva atendida CONTINUA ocupando o lugar: a pessoa veio e o lugar foi
 * usado; descontá-la abriria uma vaga que já foi consumida.
 *
 * Para FECHAR O DIA, ela NÃO conta: quem já foi atendido não vai ser deixado na porta. O guard do
 * fechamento existe para não abandonar gente marcada, e uma unidade onde todo mundo já foi
 * atendido não tem ninguém a abandonar — bloquear ali tornaria impossível registrar um feriado
 * que se decidiu depois do expediente.
 */
async function reservasQueAindaEsperamNoDia(tx: Tx, unidadeId: string, dia: Date): Promise<number> {
  const guiches = await tx.guicheDeAtendimento.findMany({ where: { unidadeId }, select: { id: true } });
  const ids = guiches.map((g) => g.id);
  if (ids.length === 0) return 0;

  const candidatas = await tx.reservaDeAtendimento.findMany({
    where: {
      cancelamento: { is: null },
      realizacao: { is: null },
      OR: [
        { guicheId: { in: ids }, dia },
        { reagendamentos: { some: { guicheId: { in: ids }, dia } } },
      ],
    },
    select: {
      guicheId: true,
      dia: true,
      horaInicio: true,
      reagendamentos: { orderBy: { sequencia: "desc" }, take: 1, select: { guicheId: true, dia: true, horaInicio: true } },
    },
  });

  const alvo = diaCivil(dia);
  const doDia = new Set(ids);
  return candidatas.filter((r) => {
    const v = vigenteDaReserva({ id: "", ...r });
    return doDia.has(v.guicheId) && diaCivil(v.dia) === alvo;
  }).length;
}

/** As janelas de um guichê, na forma do domínio puro. */
async function janelasDoGuiche(tx: Tx, guicheId: string): Promise<readonly JanelaVigente[]> {
  return tx.janelaDeAtendimento.findMany({
    where: { guicheId },
    select: {
      id: true, diaDaSemana: true, horaInicio: true, horaFim: true,
      duracaoMinutos: true, capacidade: true, vigenciaInicio: true, vigenciaFim: true,
    },
  });
}

export interface OfertaDoGuiche {
  readonly fechado: { readonly motivo: string } | null;
  readonly horarios: readonly HorarioOfertado[];
}

/**
 * A OFERTA DE UM DIA NUM GUICHÊ, como a tela e o cidadão a veem.
 *
 * ⚠️ DIA FECHADO DEVOLVE O MOTIVO, não uma lista vazia. "Nenhum horário" e "estamos fechados
 * por causa do feriado municipal" são respostas diferentes para quem está procurando atendimento.
 */
export async function ofertaDoGuiche(
  prisma: PrismaClient,
  p: { readonly guicheId: string; readonly dia: string }
): Promise<OfertaDoGuiche> {
  const dia = meioDiaCivil(zDiaCivil.parse(p.dia));

  const guiche = await prisma.guicheDeAtendimento.findUnique({
    where: { id: p.guicheId },
    select: { id: true, unidadeId: true },
  });
  if (guiche === null) throw new Error(`Guichê ${p.guicheId} não existe.`);

  const fechado = await prisma.excecaoDeCalendarioDoAtendimento.findUnique({
    where: { unidadeId_dia: { unidadeId: guiche.unidadeId, dia } },
    select: { motivo: true },
  });
  if (fechado !== null) return { fechado: { motivo: fechado.motivo }, horarios: [] };

  const janelas = await janelasDoGuiche(prisma as unknown as Tx, p.guicheId);
  const ocupacao = await ocupacaoDoDia(prisma as unknown as Tx, p.guicheId, dia);
  return { fechado: null, horarios: ofertaDoDia(janelas, dia, ocupacao) };
}

// ═══════════════════════════════════════════════════════════════════════════
// A RESERVA — o consumo de capacidade
// ═══════════════════════════════════════════════════════════════════════════

export const zReservarAtendimento = z.object({
  guicheId: z.string().min(1),
  servicoId: z.string().min(1),
  pessoaId: z.string().min(1),
  dia: zDiaCivil,
  horaInicio: zHora,
  /** ⚠️ O ESCOPO VAI DENTRO DA CHAVE (invariante 5): ela é da INTENÇÃO, não do formulário. */
  chaveDeIdempotencia: z.string().trim().min(8).max(200),
  criadoPor: z.string().min(1),
});
export type ReservarAtendimentoInput = z.input<typeof zReservarAtendimento>;

export interface ReservaFeita {
  readonly reservaId: string;
  readonly codigo: string;
  /** `true` quando a chave já tinha sido usada e a reserva anterior foi devolvida sem gravar nada. */
  readonly jaExistia: boolean;
}

/**
 * RESERVA UM HORÁRIO — a operação que consome capacidade.
 *
 * ═══ ⚠️ A ORDEM DOS PASSOS É A PROTEÇÃO ═══
 *   1. idempotência ANTES de qualquer coisa: dois cliques no mesmo botão devolvem a MESMA
 *      reserva, sem segunda linha e sem segundo código;
 *   2. as pré-condições ANTES de gravar (guichê, serviço habilitado, dia aberto, horário
 *      realmente ofertado) — "efeito colateral antes da operação guardada envenena a tentativa
 *      seguinte" custou um defeito real neste repositório;
 *   3. o TRINCO do horário, e só então a CONTAGEM. Travar depois de contar é travar um número
 *      que já está velho;
 *   4. a gravação.
 */
export async function reservarAtendimento(
  prisma: PrismaClient,
  input: ReservarAtendimentoInput
): Promise<ReservaFeita> {
  const d = zReservarAtendimento.parse(input);
  const dia = meioDiaCivil(d.dia);

  return prisma.$transaction(async (tx) => {
    const guiche = await tx.guicheDeAtendimento.findUnique({
      where: { id: d.guicheId },
      select: {
        id: true,
        nome: true,
        unidadeId: true,
        unidade: { select: { nome: true, setor: { select: { unidadeOrcId: true } } } },
      },
    });
    if (guiche === null) throw new Error(`Guichê ${d.guicheId} não existe. Nada foi reservado.`);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.reservarAtendimento, {
      ug: guiche.unidade.setor.unidadeOrcId,
    });

    // 1. IDEMPOTÊNCIA — antes de tudo, e devolvendo o que já existe.
    const jaFeita = await tx.reservaDeAtendimento.findUnique({
      where: { chaveDeIdempotencia: d.chaveDeIdempotencia },
      select: { id: true, codigo: true },
    });
    if (jaFeita !== null) {
      return { reservaId: jaFeita.id, codigo: jaFeita.codigo, jaExistia: true };
    }

    // 2. AS PRÉ-CONDIÇÕES.
    // ⚠️ SÓ A EXISTÊNCIA. O NOME de uma pessoa mora na VERSÃO dela (`VersaoDePessoa`), e lê-lo
    // aqui só para compor uma mensagem de erro traria dado pessoal para dentro de um texto que
    // sobe para a tela — inclusive para quem errou o id.
    const pessoa = await tx.pessoa.findUnique({ where: { id: d.pessoaId }, select: { id: true } });
    if (pessoa === null) throw new Error(`Pessoa ${d.pessoaId} não existe. Nada foi reservado.`);

    const servico = await tx.servicoDaCarta.findUnique({
      where: { id: d.servicoId },
      select: { titulo: true },
    });
    if (servico === null) throw new Error(`Serviço ${d.servicoId} não existe na carta. Nada foi reservado.`);

    if (!(await situacaoVigenteDoServico(tx, d.guicheId, d.servicoId)).habilitado) {
      throw new Error(
        `O guichê ${guiche.nome} não atende "${servico.titulo}". Marcar aqui mandaria a pessoa para ` +
          `uma fila que não resolve o problema dela. Nada foi reservado.`
      );
    }

    const fechado = await tx.excecaoDeCalendarioDoAtendimento.findUnique({
      where: { unidadeId_dia: { unidadeId: guiche.unidadeId, dia } },
      select: { motivo: true },
    });
    if (fechado !== null) {
      throw new Error(
        `${guiche.unidade.nome} não abre em ${diaCivilBr(dia)}: ${fechado.motivo}. Nada foi reservado.`
      );
    }

    const janelas = await janelasDoGuiche(tx, d.guicheId);
    const doDia = janelas.filter((j) => janelaValeNoDia(j, dia));
    if (doDia.length === 0) {
      throw new Error(
        `O guichê ${guiche.nome} não tem horário publicado para ${diaCivilBr(dia)}. Não existe ` +
          `expediente padrão: enquanto a oferta não for publicada, não há o que marcar. Nada foi reservado.`
      );
    }
    const janela = doDia.find((j) => horariosDaJanela(j).includes(d.horaInicio));
    if (janela === undefined) {
      const ofertados = [...new Set(doDia.flatMap((j) => horariosDaJanela(j)))].sort();
      throw new Error(
        `${d.horaInicio} não é um horário do guichê ${guiche.nome} em ${diaCivilBr(dia)}. ` +
          `Oferecidos: ${ofertados.join(", ")}. Nada foi reservado.`
      );
    }

    // 3. O TRINCO DO LUGAR, E SÓ ENTÃO A CONTAGEM.
    await travar(tx, "HorarioDeGuiche", [chaveDoHorario(d.guicheId, dia, d.horaInicio)]);

    const ocupadas = (await ocupacaoDoDia(tx, d.guicheId, dia)).get(d.horaInicio) ?? 0;
    if (ocupadas >= janela.capacidade) {
      throw new Error(
        `${d.horaInicio} de ${diaCivilBr(dia)} está lotado no guichê ${guiche.nome}: ` +
          `${ocupadas} de ${janela.capacidade} lugar(es) ocupado(s). Escolha outro horário. ` +
          `Nada foi reservado.`
      );
    }

    // 4. A GRAVAÇÃO.
    const r = await tx.reservaDeAtendimento.create({
      data: {
        guicheId: d.guicheId,
        servicoId: d.servicoId,
        pessoaId: d.pessoaId,
        dia,
        horaInicio: d.horaInicio,
        codigo: codigoDeAcompanhamento(),
        chaveDeIdempotencia: d.chaveDeIdempotencia,
        criadoPor: d.criadoPor,
      },
      select: { id: true, codigo: true },
    });
    return { reservaId: r.id, codigo: r.codigo, jaExistia: false };
  });
}

/**
 * A CHAVE DO TRINCO DO HORÁRIO — `guiche:dia:hora`, o LUGAR que está em disputa.
 *
 * ⚠️ O DIA ENTRA COMO DIA CIVIL, não como instante: dois `Date` do mesmo dia com milissegundos
 * diferentes dariam chaves diferentes, e o trinco deixaria de ser oponível justamente entre as
 * duas transações que precisam se ver.
 */
export function chaveDoHorario(guicheId: string, dia: Date, horaInicio: string): string {
  return `${guicheId}:${diaCivil(dia)}:${horaInicio}`;
}

/**
 * ⚠️ O CÓDIGO É ALEATÓRIO, NÃO SEQUENCIAL. Um número em ordem diria quantas pessoas marcaram
 * hoje e deixaria adivinhar o da pessoa seguinte — e é com ele que se acompanha e se cancela.
 */
function codigoDeAcompanhamento(): string {
  return randomBytes(9).toString("base64url").toUpperCase().replace(/[-_]/g, "X");
}

// ═══════════════════════════════════════════════════════════════════════════
// OS FATOS SOBRE A RESERVA
// ═══════════════════════════════════════════════════════════════════════════

/** A reserva com o que se precisa saber para decidir sobre ela. */
async function reservaParaDecidir(tx: Tx, reservaId: string) {
  return tx.reservaDeAtendimento.findUnique({
    where: { id: reservaId },
    select: {
      id: true,
      guicheId: true,
      dia: true,
      horaInicio: true,
      guiche: { select: { nome: true, unidadeId: true, unidade: { select: { setor: { select: { unidadeOrcId: true } } } } } },
      confirmacao: { select: { id: true } },
      cancelamento: { select: { motivo: true } },
      realizacao: { select: { id: true } },
      reagendamentos: { orderBy: { sequencia: "desc" }, take: 1, select: { guicheId: true, dia: true, horaInicio: true, sequencia: true } },
    },
  });
}

export const zConfirmarReserva = z.object({
  reservaId: z.string().min(1),
  criadoPor: z.string().min(1),
});

/** CONFIRMA a presença. Uma por reserva; não confirma o que já foi cancelado nem o que já foi atendido. */
export async function confirmarReservaDeAtendimento(
  prisma: PrismaClient,
  input: z.input<typeof zConfirmarReserva>
): Promise<{ readonly confirmacaoId: string }> {
  const d = zConfirmarReserva.parse(input);

  return prisma.$transaction(async (tx) => {
    const r = await reservaParaDecidir(tx, d.reservaId);
    if (r === null) throw new Error(`Reserva ${d.reservaId} não existe. Nada foi gravado.`);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.confirmarReservaDeAtendimento, {
      ug: r.guiche.unidade.setor.unidadeOrcId,
    });

    if (r.cancelamento !== null) {
      throw new Error(`Esta reserva foi CANCELADA (${r.cancelamento.motivo}). Nada foi gravado.`);
    }
    if (r.confirmacao !== null) throw new Error("Esta reserva já está confirmada. Nada foi gravado.");

    const c = await tx.confirmacaoDaReserva.create({
      data: { reservaId: d.reservaId, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { confirmacaoId: c.id };
  });
}

export const zCancelarReserva = z.object({
  reservaId: z.string().min(1),
  motivo: z.string().trim().min(3).max(240),
  criadoPor: z.string().min(1),
});

/**
 * CANCELA a reserva — e é isto, e só isto, que devolve o lugar à capacidade.
 *
 * ⚠️ NÃO SE CANCELA O QUE JÁ FOI ATENDIDO: o atendimento aconteceu, e apagá-lo da contagem
 * reescreveria um fato. Cancelar depois da realização também liberaria um lugar que a pessoa
 * efetivamente ocupou.
 */
export async function cancelarReservaDeAtendimento(
  prisma: PrismaClient,
  input: z.input<typeof zCancelarReserva>
): Promise<{ readonly cancelamentoId: string }> {
  const d = zCancelarReserva.parse(input);

  return prisma.$transaction(async (tx) => {
    const r = await reservaParaDecidir(tx, d.reservaId);
    if (r === null) throw new Error(`Reserva ${d.reservaId} não existe. Nada foi gravado.`);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cancelarReservaDeAtendimento, {
      ug: r.guiche.unidade.setor.unidadeOrcId,
    });

    if (r.cancelamento !== null) {
      throw new Error(`Esta reserva já foi cancelada (${r.cancelamento.motivo}). Nada foi gravado.`);
    }
    if (r.realizacao !== null) {
      throw new Error(
        "Esta reserva já foi ATENDIDA. Cancelá-la agora apagaria um atendimento que aconteceu e " +
          "devolveria um lugar que foi efetivamente ocupado. Nada foi gravado."
      );
    }

    const c = await tx.cancelamentoDaReserva.create({
      data: { reservaId: d.reservaId, motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { cancelamentoId: c.id };
  });
}

export const zReagendarReserva = z.object({
  reservaId: z.string().min(1),
  guicheId: z.string().min(1),
  dia: zDiaCivil,
  horaInicio: zHora,
  motivo: z.string().trim().min(3).max(240),
  criadoPor: z.string().min(1),
});

/**
 * REAGENDA — fato novo; o compromisso vigente passa a ser este.
 *
 * ⚠️ O DESTINO PASSA PELAS MESMAS PORTAS DA RESERVA: dia aberto, horário realmente ofertado,
 * capacidade com lugar. Um reagendamento que não conferisse a capacidade seria a porta dos
 * fundos para estourar o guichê — e seria a porta que se usaria, porque remarcar é o caminho
 * mais comum do balcão.
 *
 * ⚠️ DOIS TRINCOS, EM ORDEM ESTÁVEL. Sai-se de um lugar e entra-se noutro; travar os dois em
 * ordem que dependa dos dados faria duas remarcações cruzadas se abraçarem.
 */
export async function reagendarReservaDeAtendimento(
  prisma: PrismaClient,
  input: z.input<typeof zReagendarReserva>
): Promise<{ readonly reagendamentoId: string; readonly sequencia: number }> {
  const d = zReagendarReserva.parse(input);
  const dia = meioDiaCivil(d.dia);

  return prisma.$transaction(async (tx) => {
    const r = await reservaParaDecidir(tx, d.reservaId);
    if (r === null) throw new Error(`Reserva ${d.reservaId} não existe. Nada foi gravado.`);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.reagendarReservaDeAtendimento, {
      ug: r.guiche.unidade.setor.unidadeOrcId,
    });

    if (r.cancelamento !== null) {
      throw new Error(`Esta reserva foi CANCELADA (${r.cancelamento.motivo}). Nada foi gravado.`);
    }
    if (r.realizacao !== null) {
      throw new Error("Esta reserva já foi ATENDIDA — não há o que remarcar. Nada foi gravado.");
    }

    const destino = await tx.guicheDeAtendimento.findUnique({
      where: { id: d.guicheId },
      select: { id: true, nome: true, unidadeId: true, unidade: { select: { nome: true } } },
    });
    if (destino === null) throw new Error(`Guichê ${d.guicheId} não existe. Nada foi gravado.`);

    const atual = r.reagendamentos[0] ?? { guicheId: r.guicheId, dia: r.dia, horaInicio: r.horaInicio, sequencia: 0 };
    if (atual.guicheId === d.guicheId && diaCivil(atual.dia) === d.dia && atual.horaInicio === d.horaInicio) {
      throw new Error(
        `A reserva já está em ${diaCivilBr(dia)} às ${d.horaInicio} neste guichê. Remarcar para o ` +
          `mesmo lugar não é um fato novo. Nada foi gravado.`
      );
    }

    const fechado = await tx.excecaoDeCalendarioDoAtendimento.findUnique({
      where: { unidadeId_dia: { unidadeId: destino.unidadeId, dia } },
      select: { motivo: true },
    });
    if (fechado !== null) {
      throw new Error(`${destino.unidade.nome} não abre em ${diaCivilBr(dia)}: ${fechado.motivo}. Nada foi gravado.`);
    }

    const janelas = (await janelasDoGuiche(tx, d.guicheId)).filter((j) => janelaValeNoDia(j, dia));
    const janela = janelas.find((j) => horariosDaJanela(j).includes(d.horaInicio));
    if (janela === undefined) {
      throw new Error(
        `${d.horaInicio} não é um horário do guichê ${destino.nome} em ${diaCivilBr(dia)}. Nada foi gravado.`
      );
    }

    // ⚠️ ORDEM ESTÁVEL DOS DOIS TRINCOS: as duas chaves ordenadas por texto, sempre. Travar
    // "de onde saio" e depois "para onde vou" faria duas remarcações que trocam de lugar entre
    // si travarem em ordens opostas — e um deadlock às 3h da tarde no balcão.
    const chaves = [
      chaveDoHorario(atual.guicheId, atual.dia, atual.horaInicio),
      chaveDoHorario(d.guicheId, dia, d.horaInicio),
    ].sort();
    await travar(tx, "HorarioDeGuiche", [...new Set(chaves)]);

    const ocupadas = (await ocupacaoDoDia(tx, d.guicheId, dia)).get(d.horaInicio) ?? 0;
    if (ocupadas >= janela.capacidade) {
      throw new Error(
        `${d.horaInicio} de ${diaCivilBr(dia)} está lotado no guichê ${destino.nome}: ` +
          `${ocupadas} de ${janela.capacidade} lugar(es) ocupado(s). Nada foi gravado.`
      );
    }

    const novo = await tx.reagendamentoDaReserva.create({
      data: {
        reservaId: d.reservaId,
        guicheId: d.guicheId,
        dia,
        horaInicio: d.horaInicio,
        motivo: d.motivo,
        sequencia: atual.sequencia + 1,
        criadoPor: d.criadoPor,
      },
      select: { id: true, sequencia: true },
    });
    return { reagendamentoId: novo.id, sequencia: novo.sequencia };
  });
}

export const zRegistrarAtendimento = z.object({
  reservaId: z.string().min(1),
  atendidoPor: z.string().trim().min(3).max(120),
  observacao: z.string().trim().max(1000).optional(),
  criadoPor: z.string().min(1),
});

/** REGISTRA que o atendimento aconteceu. Uma por reserva; não se atende o que foi cancelado. */
export async function registrarAtendimentoRealizado(
  prisma: PrismaClient,
  input: z.input<typeof zRegistrarAtendimento>
): Promise<{ readonly realizacaoId: string }> {
  const d = zRegistrarAtendimento.parse(input);

  return prisma.$transaction(async (tx) => {
    const r = await reservaParaDecidir(tx, d.reservaId);
    if (r === null) throw new Error(`Reserva ${d.reservaId} não existe. Nada foi gravado.`);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarAtendimentoRealizado, {
      ug: r.guiche.unidade.setor.unidadeOrcId,
    });

    if (r.cancelamento !== null) {
      throw new Error(`Esta reserva foi CANCELADA (${r.cancelamento.motivo}). Nada foi gravado.`);
    }
    if (r.realizacao !== null) throw new Error("Este atendimento já foi registrado. Nada foi gravado.");

    const a = await tx.realizacaoDoAtendimento.create({
      data: {
        reservaId: d.reservaId,
        atendidoPor: d.atendidoPor,
        observacao: d.observacao ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { realizacaoId: a.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// O AGENDAMENTO PELO CIDADÃO — sem conta
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ═══ ⚠️ ATOS PÚBLICOS: NÃO HÁ USUÁRIO A AUTORIZAR, E AS DEFESAS SÃO OUTRAS ═══
 *
 * A seção 5.39 do TR é o portal de AUTOATENDIMENTO: quem marca é o cidadão, sem conta. Não existe
 * `autorizarNo` aqui — existiria um crachá que ninguém tem. O que protege, em camadas:
 *
 *   · o serviço tem de estar habilitado NAQUELE guichê **e** marcado como agendável pelo portal.
 *     `false` é o padrão: nada fica público por acidente;
 *   · a capacidade é a MESMA, conferida sob o MESMO trinco. Um caminho público que contasse por
 *     fora seria a porta dos fundos para estourar o guichê;
 *   · QUOTA por chave de origem, dita como tal — é contenção local, não antifraude. O reCAPTCHA
 *     da cláusula 5.39.102 depende de provedor externo e está declarado como tal no catálogo;
 *   · UM ATENDIMENTO VIVO POR DOCUMENTO, POR SERVIÇO. Sem isso, uma pessoa sozinha esvazia a
 *     agenda de um serviço em minutos, e quem precisa do atendimento encontra tudo cheio;
 *   · o SEGREDO é entregue uma vez e guardado só por hash. O `codigo` aparece na agenda interna;
 *     se ele bastasse para cancelar pelo portal, quem lê a agenda desmarcaria o atendimento de um
 *     cidadão de forma anônima e não atribuída.
 *
 * ⚠️ AS MENSAGENS COMEÇAM COM CÓDIGO EM MAIÚSCULAS. É assim que a camada pública distingue a
 * recusa do domínio (que sobe inteira para o cidadão ler) do erro de infraestrutura (que vira uma
 * mensagem padrão, porque o público não lê nome de tabela nem pilha).
 */

/** Quantas marcações uma mesma origem pode fazer por hora. Contenção local, dita como tal. */
export const QUOTA_DE_AGENDAMENTOS_POR_HORA = 3;

const SEGREDO_ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * O SEGREDO DO CIDADÃO — 20 caracteres de um alfabeto SEM AMBÍGUOS (nada de O/0, I/1), de 32
 * bytes aleatórios. ~100 bits, e legível em voz alta no balcão sem trocar zero por ó.
 *
 * ⚠️ MESMA FORMA DA OUVIDORIA, de propósito: é a única credencial que o cidadão sem conta tem, e
 * duas formas diferentes de segredo no mesmo produto seriam duas superfícies para manter.
 */
function novoSegredoDaReserva(): string {
  const bytes = randomBytes(32);
  let s = "";
  for (let i = 0; i < 20; i += 1) s += SEGREDO_ALFABETO[bytes[i]! % SEGREDO_ALFABETO.length];
  return `${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10, 15)}-${s.slice(15, 20)}`;
}

/** O hash do segredo. O banco guarda só isto — nem um dump devolve o segredo. */
export function hashDoSegredoDaReserva(segredo: string): string {
  return createHash("sha256").update(`guiche:${segredo.trim().toUpperCase()}`).digest("hex");
}

const zDocumento = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 11 || v.length === 14, "Informe um CPF (11 dígitos) ou um CNPJ (14).");

export const zAgendarPeloPortal = z.object({
  guicheId: z.string().min(1),
  servicoId: z.string().min(1),
  nome: z.string().trim().min(5).max(120),
  documento: zDocumento,
  dia: zDiaCivil,
  horaInicio: zHora,
  chaveDeQuota: z.string().regex(/^[0-9a-f]{64}$/),
});
export type AgendarPeloPortalInput = z.input<typeof zAgendarPeloPortal>;

export interface AgendamentoDoCidadao {
  readonly codigo: string;
  /** ⚠️ Devolvido UMA vez. Não é relido de lugar nenhum depois daqui. */
  readonly segredo: string;
}

export async function agendarPeloPortal(
  prisma: PrismaClient,
  input: AgendarPeloPortalInput
): Promise<AgendamentoDoCidadao> {
  const d = zAgendarPeloPortal.parse(input);
  const dia = meioDiaCivil(d.dia);
  const segredo = novoSegredoDaReserva();

  return prisma.$transaction(async (tx) => {
    const recentes = await tx.envioPublicoSemConta.count({
      where: { chave: d.chaveDeQuota, criadoEm: { gte: new Date(Date.now() - 3600_000) } },
    });
    if (recentes >= QUOTA_DE_AGENDAMENTOS_POR_HORA) {
      throw new Error(
        "QUOTA-DE-AGENDAMENTOS: muitas marcações desta origem na última hora. Tente mais tarde — " +
          "consultar os horários continua livre."
      );
    }

    const guiche = await tx.guicheDeAtendimento.findUnique({
      where: { id: d.guicheId },
      select: { id: true, nome: true, unidadeId: true, unidade: { select: { nome: true } } },
    });
    if (guiche === null) {
      throw new Error("GUICHE-INEXISTENTE: este guichê não existe. Nada foi marcado.");
    }

    const servico = await tx.servicoDaCarta.findUnique({
      where: { id: d.servicoId },
      select: { titulo: true },
    });
    if (servico === null) {
      throw new Error("SERVICO-INEXISTENTE: este serviço não existe. Nada foi marcado.");
    }

    // ⚠️ AS DUAS PERGUNTAS, E ELAS SÃO DIFERENTES: o guichê atende este serviço? e o ente abriu
    // ESTE serviço para marcação pelo portal? Um serviço que exige triagem antes pode ser
    // atendido no guichê e não ser agendável sozinho.
    const situacao = await tx.situacaoDoServicoNoGuiche.findFirst({
      where: { guicheId: d.guicheId, servicoId: d.servicoId },
      orderBy: { criadoEm: "desc" },
      select: { habilitado: true, agendamentoPublico: true },
    });
    if (situacao === null || !situacao.habilitado) {
      throw new Error(
        `SERVICO-NAO-ATENDIDO: o guichê ${guiche.nome} não atende "${servico.titulo}". Nada foi marcado.`
      );
    }
    if (!situacao.agendamentoPublico) {
      throw new Error(
        `AGENDAMENTO-NAO-ABERTO: "${servico.titulo}" não é marcado pela internet. Procure o ` +
          `atendimento de ${guiche.unidade.nome}. Nada foi marcado.`
      );
    }

    const fechado = await tx.excecaoDeCalendarioDoAtendimento.findUnique({
      where: { unidadeId_dia: { unidadeId: guiche.unidadeId, dia } },
      select: { motivo: true },
    });
    if (fechado !== null) {
      throw new Error(
        `UNIDADE-FECHADA: ${guiche.unidade.nome} não abre em ${diaCivilBr(dia)}: ${fechado.motivo}. Nada foi marcado.`
      );
    }

    const janelas = (await janelasDoGuiche(tx, d.guicheId)).filter((j) => janelaValeNoDia(j, dia));
    const janela = janelas.find((j) => horariosDaJanela(j).includes(d.horaInicio));
    if (janela === undefined) {
      throw new Error(
        `HORARIO-INEXISTENTE: ${d.horaInicio} não é um horário deste guichê em ${diaCivilBr(dia)}. ` +
          `Escolha um dos horários oferecidos. Nada foi marcado.`
      );
    }

    // ⚠️ O MESMO TRINCO, NA MESMA CHAVE, ANTES DA MESMA CONTAGEM. O caminho público e o do balcão
    // disputam os mesmos lugares; dois trincos diferentes não se veriam.
    await travar(tx, "HorarioDeGuiche", [chaveDoHorario(d.guicheId, dia, d.horaInicio)]);

    const ocupadas = (await ocupacaoDoDia(tx, d.guicheId, dia)).get(d.horaInicio) ?? 0;
    if (ocupadas >= janela.capacidade) {
      throw new Error(
        `HORARIO-LOTADO: ${d.horaInicio} de ${diaCivilBr(dia)} já está cheio. Escolha outro ` +
          `horário. Nada foi marcado.`
      );
    }

    // ⚠️ UM ATENDIMENTO VIVO POR DOCUMENTO, POR SERVIÇO — E SOB TRINCO, pelo mesmo motivo da
    // capacidade. A defesa não é contra erro de digitação: é contra uma pessoa sozinha esvaziar a
    // agenda, e quem faz isso automatiza. Dois envios simultâneos leriam "não tem nenhum" e os
    // dois gravariam; o trinco do documento (posto 29, depois do lugar) faz o segundo esperar e
    // enxergar o primeiro.
    //
    // ⚠️ E ELA NÃO CONSULTA O CADASTRO DE PESSOAS: compara o documento DECLARADO com os
    // declarados nas outras reservas do portal, e nada mais. Perguntar ao cadastro vazaria quem
    // já é conhecido do município.
    await travar(tx, "AtendimentoPorDocumento", [`${d.documento}:${d.servicoId}`]);

    const jaTem = await tx.reservaDeAtendimento.findFirst({
      where: {
        documentoDeclarado: d.documento,
        servicoId: d.servicoId,
        cancelamento: { is: null },
        realizacao: { is: null },
      },
      select: { codigo: true },
    });
    if (jaTem !== null) {
      throw new Error(
        `JA-TEM-MARCACAO: este documento já tem um atendimento marcado para "${servico.titulo}" ` +
          `(código ${jaTem.codigo}). Cancele o anterior antes de marcar outro. Nada foi marcado.`
      );
    }

    await tx.envioPublicoSemConta.create({ data: { chave: d.chaveDeQuota, finalidade: "AGENDAMENTO" } });

    const r = await tx.reservaDeAtendimento.create({
      data: {
        guicheId: d.guicheId,
        servicoId: d.servicoId,
        // ⚠️ SEM `pessoaId`: o titular é DECLARADO, e a identificação de verdade acontece no
        // guichê, com o documento na mão. Ver o CHECK `ck_reserva_titular_xor`.
        nomeDeclarado: d.nome,
        documentoDeclarado: d.documento,
        segredoHash: hashDoSegredoDaReserva(segredo),
        dia,
        horaInicio: d.horaInicio,
        codigo: codigoDeAcompanhamento(),
        // A idempotência do portal é a do próprio segredo: cada envio gera um, e a chave carrega
        // o escopo do ato (invariante 5).
        chaveDeIdempotencia: `portal:${hashDoSegredoDaReserva(segredo).slice(0, 32)}`,
        criadoPor: "PORTAL-DO-CIDADAO",
      },
      select: { codigo: true },
    });

    return { codigo: r.codigo, segredo };
  });
}

export interface ReservaParaOCidadao {
  readonly codigo: string;
  readonly unidade: string;
  readonly endereco: string;
  readonly guiche: string;
  readonly servico: string;
  readonly nome: string;
  readonly dia: string;
  readonly hora: string;
  readonly situacao: "MARCADA" | "CONFIRMADA" | "ATENDIDA" | "CANCELADA";
  readonly motivoDoCancelamento: string | null;
}

/**
 * A RESERVA QUE O SEGREDO ABRE — e nada além dela.
 *
 * ⚠️ SEGREDO ERRADO E SEGREDO INEXISTENTE RESPONDEM IGUAL (`null`). Distinguir os dois diria a
 * quem tentasse que aquele segredo existe, e transformaria a consulta num oráculo.
 *
 * ⚠️ A PROJEÇÃO É MÍNIMA: onde, quando, para quê e em que situação. Não sai o documento
 * declarado (quem tem o segredo já o conhece; imprimi-lo só amplia o estrago de um segredo
 * vazado), não sai quem atendeu, não sai observação interna.
 */
export async function consultarReservaPeloSegredo(
  prisma: PrismaClient,
  segredo: string
): Promise<ReservaParaOCidadao | null> {
  if (segredo.trim() === "") return null;
  const r = await prisma.reservaDeAtendimento.findUnique({
    where: { segredoHash: hashDoSegredoDaReserva(segredo) },
    select: {
      codigo: true,
      guicheId: true,
      dia: true,
      horaInicio: true,
      nomeDeclarado: true,
      servico: { select: { titulo: true } },
      guiche: { select: { nome: true, unidade: { select: { nome: true, endereco: true } } } },
      confirmacao: { select: { id: true } },
      cancelamento: { select: { motivo: true } },
      realizacao: { select: { id: true } },
      reagendamentos: {
        orderBy: { sequencia: "desc" },
        take: 1,
        select: { dia: true, horaInicio: true, guiche: { select: { nome: true, unidade: { select: { nome: true, endereco: true } } } } },
      },
    },
  });
  if (r === null) return null;

  // ⚠️ O CIDADÃO VÊ O COMPROMISSO VIGENTE, não o original. Se o ente remarcou, é para o horário
  // novo que ele tem de aparecer — mostrar o primeiro mandaria a pessoa no dia errado.
  const ultimo = r.reagendamentos[0];
  const guiche = ultimo?.guiche ?? r.guiche;
  return {
    codigo: r.codigo,
    unidade: guiche.unidade.nome,
    endereco: guiche.unidade.endereco,
    guiche: guiche.nome,
    servico: r.servico.titulo,
    nome: r.nomeDeclarado ?? "",
    dia: diaCivil(ultimo?.dia ?? r.dia),
    hora: ultimo?.horaInicio ?? r.horaInicio,
    situacao:
      r.cancelamento !== null ? "CANCELADA" : r.realizacao !== null ? "ATENDIDA" : r.confirmacao !== null ? "CONFIRMADA" : "MARCADA",
    motivoDoCancelamento: r.cancelamento?.motivo ?? null,
  };
}

/**
 * O CIDADÃO CANCELA A PRÓPRIA MARCAÇÃO — e é isto que devolve o lugar à agenda.
 *
 * ⚠️ O MOTIVO É DELE, e entra no histórico como tal. `criadoPor` diz `PORTAL-DO-CIDADAO`: não se
 * atribui a um servidor um ato que nenhum servidor praticou.
 */
export async function cancelarPeloPortal(
  prisma: PrismaClient,
  input: { readonly segredo: string; readonly motivo: string }
): Promise<{ readonly codigo: string }> {
  const motivo = z.string().trim().min(3).max(240).parse(input.motivo);

  return prisma.$transaction(async (tx) => {
    const r = await tx.reservaDeAtendimento.findUnique({
      where: { segredoHash: hashDoSegredoDaReserva(input.segredo) },
      select: {
        id: true,
        codigo: true,
        cancelamento: { select: { motivo: true } },
        realizacao: { select: { id: true } },
      },
    });
    if (r === null) {
      throw new Error("MARCACAO-NAO-ENCONTRADA: não há marcação com este código de acompanhamento.");
    }
    if (r.cancelamento !== null) {
      throw new Error(`JA-CANCELADA: esta marcação já foi cancelada (${r.cancelamento.motivo}).`);
    }
    if (r.realizacao !== null) {
      throw new Error(
        "JA-ATENDIDA: este atendimento já foi realizado. Não há o que cancelar — e apagá-lo " +
          "reescreveria um fato."
      );
    }

    await tx.cancelamentoDaReserva.create({
      data: { reservaId: r.id, motivo, criadoPor: "PORTAL-DO-CIDADAO" },
    });
    return { codigo: r.codigo };
  });
}

export interface GuicheParaOCidadao {
  readonly guicheId: string;
  readonly unidade: string;
  readonly endereco: string;
  readonly guiche: string;
  readonly servicos: readonly { readonly id: string; readonly titulo: string }[];
}

/**
 * ONDE O CIDADÃO PODE MARCAR: os guichês que têm ao menos um serviço aberto ao portal.
 *
 * ⚠️ UM GUICHÊ SEM SERVIÇO ABERTO NÃO APARECE. Oferecê-lo levaria a pessoa a uma tela onde não há
 * o que escolher — e ela concluiria que o sistema está quebrado, não que o ente não abriu aquele
 * atendimento para a internet.
 */
export async function guichesAbertosAoPortal(prisma: PrismaClient): Promise<readonly GuicheParaOCidadao[]> {
  const guiches = await prisma.guicheDeAtendimento.findMany({
    orderBy: [{ unidade: { codigo: "asc" } }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      unidade: { select: { nome: true, endereco: true } },
      servicos: {
        orderBy: { criadoEm: "asc" },
        select: { servicoId: true, habilitado: true, agendamentoPublico: true, servico: { select: { titulo: true } } },
      },
    },
  });

  const saida: GuicheParaOCidadao[] = [];
  for (const g of guiches) {
    // O vigente de cada serviço é o ÚLTIMO fato — a tabela é append-only.
    const vigente = new Map<string, { titulo: string; habilitado: boolean; publico: boolean }>();
    for (const s of g.servicos) {
      vigente.set(s.servicoId, { titulo: s.servico.titulo, habilitado: s.habilitado, publico: s.agendamentoPublico });
    }
    const abertos = [...vigente.entries()]
      .filter(([, v]) => v.habilitado && v.publico)
      .map(([id, v]) => ({ id, titulo: v.titulo }))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
    if (abertos.length === 0) continue;
    saida.push({
      guicheId: g.id,
      unidade: g.unidade.nome,
      endereco: g.unidade.endereco,
      guiche: g.nome,
      servicos: abertos,
    });
  }
  return saida;
}
