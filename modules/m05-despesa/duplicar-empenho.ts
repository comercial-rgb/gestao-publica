import { z } from "zod";
import type { RoteiroContabil } from "./dominio.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { M05Deps } from "./ports.js";
import { empenhar } from "./servico.js";

/**
 * TR 5.10.1.12 — DUPLICAR UM EMPENHO: o usuário informa número, data, valor e histórico; o resto
 * vem do empenho original.
 *
 * ═══ A DUPLICAÇÃO É UMA EMISSÃO, NÃO UMA CÓPIA DE LINHA ═══
 * O novo empenho passa por `empenhar` inteiro: a autorização na ficha, o saldo da dotação pelo SUM
 * real dentro da transação, os guards do contrato, da obra, da dívida e do precatório, e o
 * lançamento contábil pelo roteiro que a porta encaminha. Copiar a linha do banco pularia todos.
 *
 * ═══ O QUE NÃO SE COPIA, E POR QUÊ ═══
 *   - a RESERVA e a SOLICITAÇÃO de empenho são de uso único: a reserva já foi consumida pelo
 *     original e a solicitação é única por empenho. O duplicado consome a dotação direto;
 *   - o CONSÓRCIO não entra pela emissão comum — duplicar sem ele produziria um empenho que
 *     perdeu o vínculo em silêncio. Recusa-se, nomeando o motivo;
 *   - uma ANULAÇÃO não é empenho que se duplique: recusa-se, apontando o original.
 * A ordem de compra COPIA-SE: o guard do adapter soma o empenhado contra ela, e recusa o excesso.
 */

const zDuplicarEmpenhoInput = z.object({
  empenhoOrigemId: z.string().min(1),
  numero: z.string().trim().min(1, "Informe o número do novo empenho."),
  data: z.coerce.date(),
  valor: z.string().trim().min(1, "Informe o valor do novo empenho."),
  historico: z.string().trim().min(1, "Informe o histórico do novo empenho."),
  criadoPor: z.string().min(1),
});
export type DuplicarEmpenhoInput = z.input<typeof zDuplicarEmpenhoInput>;

type Leitor = Pick<PrismaClient, "empenho">;

export async function duplicarEmpenho(
  input: DuplicarEmpenhoInput,
  roteiro: RoteiroContabil,
  deps: M05Deps,
  leitor: Leitor
): Promise<{ readonly empenhoId: string; readonly lancamentoId: string }> {
  const d = zDuplicarEmpenhoInput.parse(input);
  const ficha = await leitor.empenho.findUnique({ where: { id: d.empenhoOrigemId }, select: { fichaId: true } });
  if (ficha === null) throw new Error("O empenho a duplicar não existe.");
  // A autorização vem ANTES de ler o conteúdo: quem não empenha na ficha do original não fica
  // sabendo, pela mensagem de recusa, de que natureza ele é.
  await deps.autz.exigir(d.criadoPor, ACAO_DO_SERVICO.duplicarEmpenho, { ficha: ficha.fichaId });

  const o = await leitor.empenho.findUniqueOrThrow({
    where: { id: d.empenhoOrigemId },
    select: {
      numero: true,
      fichaId: true,
      tipo: true,
      credorCpfCnpj: true,
      categoriaOrdemCronologica: true,
      subelementoId: true,
      contratoId: true,
      classeDeBensId: true,
      dividaId: true,
      obraId: true,
      convenioId: true,
      campanhaPublicitariaId: true,
      precatorioId: true,
      consorcioId: true,
      ordemDeCompraId: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      estornoDe: { select: { numero: true } },
      anulacaoParcialDe: { select: { numero: true } },
    },
  });
  if (o.estornoDeId !== null || o.anulacaoParcialDeId !== null) {
    const original = o.estornoDe?.numero ?? o.anulacaoParcialDe?.numero ?? "";
    throw new Error(`${o.numero} é uma anulação, não um empenho; duplique o empenho original ${original}.`);
  }
  if (o.consorcioId !== null) {
    throw new Error(`O empenho ${o.numero} é de consórcio público, e esse vínculo não passa pela emissão comum; emita o novo empenho pelo consórcio.`);
  }

  return empenhar(
    {
      fichaId: o.fichaId,
      numero: d.numero,
      tipo: o.tipo,
      valor: d.valor,
      data: d.data,
      credorCpfCnpj: o.credorCpfCnpj,
      historico: d.historico,
      categoriaOrdemCronologica: o.categoriaOrdemCronologica,
      ...(o.subelementoId !== null ? { subelementoId: o.subelementoId } : {}),
      ...(o.contratoId !== null ? { contratoId: o.contratoId } : {}),
      ...(o.classeDeBensId !== null ? { classeDeBensId: o.classeDeBensId } : {}),
      ...(o.dividaId !== null ? { dividaId: o.dividaId } : {}),
      ...(o.obraId !== null ? { obraId: o.obraId } : {}),
      ...(o.convenioId !== null ? { convenioId: o.convenioId } : {}),
      ...(o.campanhaPublicitariaId !== null ? { campanhaPublicitariaId: o.campanhaPublicitariaId } : {}),
      ...(o.precatorioId !== null ? { precatorioId: o.precatorioId } : {}),
      ...(o.ordemDeCompraId !== null ? { ordemDeCompraId: o.ordemDeCompraId } : {}),
      criadoPor: d.criadoPor,
    },
    roteiro,
    deps
  );
}
