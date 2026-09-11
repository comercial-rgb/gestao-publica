import { z } from "zod";
import { compararPorDiaCivil, diaCivil } from "../../packages/datas/index.js";

/**
 * M31 — CONTROLE INTERNO: as regras puras (CF art. 74 · LRF art. 59).
 *
 * ⚠️ ESTE MÓDULO NÃO TEM EFEITO CONTÁBIL, e isso é decisão registrada no schema. Auditoria
 * produz JUÍZO sobre o que os outros módulos fizeram; dar-lhe um lançamento seria inventar um
 * fato, e o fato inventado apareceria no balanço indistinguível dos verdadeiros.
 */

export type RespostaDoChecklist = "CONFORME" | "NAO_CONFORME" | "NAO_APLICAVEL";
export type GravidadeDaIrregularidade = "FORMAL" | "GRAVE" | "GRAVISSIMA";
export type TipoMovimentoDaAuditoria = "ABERTURA" | "ENCERRAMENTO" | "REABERTURA";

/**
 * O ESTADO DA AUDITORIA — DERIVADO dos movimentos, nunca uma coluna.
 *
 * ⚠️ O ÚLTIMO MOVIMENTO DECIDE, e ele é o último pela DATA DO FATO, com o instante do registro
 * como desempate. Ordenar só por `criadoEm` faria uma reabertura datada de ontem, digitada
 * hoje, parecer posterior a um encerramento datado de hoje e digitado ontem.
 */
export interface MovimentoParaEstado {
  readonly tipo: TipoMovimentoDaAuditoria;
  readonly dataMovimento: Date;
  readonly criadoEm: Date;
}

export type EstadoDaAuditoria = "ABERTA" | "ENCERRADA";

export function estadoDaAuditoria(
  movimentos: readonly MovimentoParaEstado[]
): EstadoDaAuditoria {
  if (movimentos.length === 0) return "ABERTA";
  const ordenados = [...movimentos].sort((a, b) => {
    const dia = compararPorDiaCivil(a.dataMovimento, b.dataMovimento);
    if (dia !== 0) return dia;
    return a.criadoEm.getTime() - b.criadoEm.getTime();
  });
  return ordenados[ordenados.length - 1]!.tipo === "ENCERRAMENTO" ? "ENCERRADA" : "ABERTA";
}

export interface RespostaVigente {
  readonly itemId: string;
  readonly resposta: RespostaDoChecklist;
  readonly observacao: string | null;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

/**
 * A RESPOSTA VIGENTE DE CADA ITEM — a mais recente, e as anteriores FICAM.
 *
 * ⚠️ "CONFORME" QUE VIRA "NÃO CONFORME" depois de uma conversa é exatamente o que a auditoria
 * precisa conseguir provar que aconteceu. Um UPDATE apagaria a primeira, e a pergunta "isto
 * foi alterado depois?" ficaria sem resposta — num módulo cuja razão de existir é responder
 * essa classe de pergunta.
 */
export function respostasVigentes(
  respostas: readonly RespostaVigente[]
): ReadonlyMap<string, RespostaVigente> {
  const vigente = new Map<string, RespostaVigente>();
  for (const r of respostas) {
    const atual = vigente.get(r.itemId);
    if (atual === undefined || r.criadoEm.getTime() > atual.criadoEm.getTime()) {
      vigente.set(r.itemId, r);
    }
  }
  return vigente;
}

export interface ContagemDoChecklist {
  readonly total: number;
  readonly respondidos: number;
  readonly conformes: number;
  readonly naoConformes: number;
  readonly naoAplicaveis: number;
  readonly pendentes: number;
}

export function contarChecklist(
  totalDeItens: number,
  vigentes: ReadonlyMap<string, RespostaVigente>
): ContagemDoChecklist {
  let conformes = 0;
  let naoConformes = 0;
  let naoAplicaveis = 0;
  for (const r of vigentes.values()) {
    if (r.resposta === "CONFORME") conformes += 1;
    else if (r.resposta === "NAO_CONFORME") naoConformes += 1;
    else naoAplicaveis += 1;
  }
  return {
    total: totalDeItens,
    respondidos: vigentes.size,
    conformes,
    naoConformes,
    naoAplicaveis,
    pendentes: totalDeItens - vigentes.size,
  };
}

export interface ProvidenciaParaEstado {
  readonly aceita: boolean | null;
  readonly criadoEm: Date;
}

/**
 * A IRREGULARIDADE ESTÁ SANADA? — DERIVADO das providências, nunca um booleano na tabela.
 *
 * ⚠️ SÓ A ÚLTIMA APRECIAÇÃO CONTA, e "ainda não apreciada" (`aceita === null`) NÃO sana. Tratar
 * o nulo como "sanada" faria toda irregularidade nascer resolvida no instante em que o
 * auditado escrevesse qualquer coisa — e o prazo deixaria de significar alguma coisa.
 */
export function estaSanada(providencias: readonly ProvidenciaParaEstado[]): boolean {
  const apreciadas = providencias.filter((p) => p.aceita !== null);
  if (apreciadas.length === 0) return false;
  const ultima = apreciadas.reduce((a, b) =>
    b.criadoEm.getTime() > a.criadoEm.getTime() ? b : a
  );
  return ultima.aceita === true;
}

/**
 * O PRAZO VENCEU? — comparação por DIA CIVIL DO ENTE.
 *
 * ⚠️ NUNCA `prazo < agora` EM INSTANTE. O prazo é um DIA: uma irregularidade com prazo em
 * 31/01 tem o dia 31 inteiro. Comparado como instante gravado em UTC, ela venceria às 21:00
 * do dia 30 — e "prazo vencido" é rótulo que produz providência disciplinar.
 */
export function prazoVencido(prazo: Date, hoje: Date): boolean {
  return compararPorDiaCivil(hoje, prazo) > 0;
}

export function diaDoPrazo(prazo: Date): string {
  return diaCivil(prazo);
}

// ═══════════════════════════════════════════════════════════════════════════
// OS INPUTS
// ═══════════════════════════════════════════════════════════════════════════

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil YYYY-MM-DD.");

export const zAbrirAuditoriaInput = z.object({
  identificador: z.string().trim().min(1).max(60),
  objeto: z.string().trim().min(10),
  tipo: z.enum(["PROGRAMADA", "EXTRAORDINARIA", "MONITORAMENTO"]),
  orgaoId: z.string().min(1),
  diaPeriodoInicio: zDia,
  diaPeriodoFim: zDia,
  responsavel: z.string().min(1),
  diaAbertura: zDia,
  motivo: z.string().trim().min(10),
  /** O roteiro — pergunta + base legal. Vazio é aceito: nem toda auditoria nasce com roteiro. */
  itens: z
    .array(
      z.object({
        pergunta: z.string().trim().min(5),
        baseLegal: z
          .string()
          .trim()
          .min(3, "A base legal é obrigatória: item de checklist sem fundamento é opinião do auditor com aparência de norma."),
      })
    )
    .default([]),
  criadoPor: z.string().min(1),
});
export type AbrirAuditoriaInput = z.input<typeof zAbrirAuditoriaInput>;

export const zResponderItemInput = z.object({
  itemId: z.string().min(1),
  resposta: z.enum(["CONFORME", "NAO_CONFORME", "NAO_APLICAVEL"]),
  observacao: z.string().trim().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type ResponderItemInput = z.input<typeof zResponderItemInput>;

export const zRegistrarIrregularidadeInput = z.object({
  auditoriaId: z.string().min(1),
  itemId: z.string().min(1).optional(),
  descricao: z.string().trim().min(20),
  gravidade: z.enum(["FORMAL", "GRAVE", "GRAVISSIMA"]),
  providencia: z.string().trim().min(10),
  diaPrazo: zDia,
  criadoPor: z.string().min(1),
});
export type RegistrarIrregularidadeInput = z.input<typeof zRegistrarIrregularidadeInput>;

export const zRegistrarProvidenciaInput = z.object({
  irregularidadeId: z.string().min(1),
  relato: z.string().trim().min(10),
  diaProvidencia: zDia,
  criadoPor: z.string().min(1),
});
export type RegistrarProvidenciaInput = z.input<typeof zRegistrarProvidenciaInput>;

export const zApreciarProvidenciaInput = z.object({
  providenciaId: z.string().min(1),
  aceita: z.boolean(),
  motivoDaRecusa: z.string().trim().min(10).optional(),
  criadoPor: z.string().min(1),
});
export type ApreciarProvidenciaInput = z.input<typeof zApreciarProvidenciaInput>;

export const zEncerrarAuditoriaInput = z.object({
  auditoriaId: z.string().min(1),
  diaEncerramento: zDia,
  motivo: z.string().trim().min(10),
  criadoPor: z.string().min(1),
});
export type EncerrarAuditoriaInput = z.input<typeof zEncerrarAuditoriaInput>;
