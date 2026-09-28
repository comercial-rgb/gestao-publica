import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { inicioDoDiaCivil } from "../../packages/datas/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * A CAMPANHA PUBLICITÁRIA (V22, M05) — o cadastro que dá nome ao vínculo "nota de empenho ×
 * campanha publicitária" pedido pelo termo de referência, e a soma do empenhado por campanha.
 *
 * ⚠️ AUTORIZAÇÃO: CADASTRAR_CONTRATO no ENTE. A campanha é executada pelo contrato de publicidade
 * (Lei 12.232/2010); quem cadastra o contrato é quem diz que campanhas ele executa. Nenhuma ação
 * nova no censo.
 *
 * ⚠️ SEM EDIÇÃO: a campanha com empenho vinculado é referência de fato contábil — o runtime não
 * tem UPDATE nesta tabela.
 */

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export class CampanhaPublicitariaInvalidaError extends Error {
  override readonly name = "CampanhaPublicitariaInvalidaError";
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export const zCadastrarCampanhaPublicitaria = z.object({
  identificador: z.string().trim().min(1, "Informe o identificador da campanha.").max(40),
  titulo: z.string().trim().min(3, "Informe o título da campanha.").max(200),
  objetivo: z.string().trim().min(3, "Informe o objetivo da campanha.").max(2000),
  /** "AAAA-MM-DD", data civil do ente. */
  inicio: z.string().trim().regex(DIA, "Informe a data de início (dia/mês/ano)."),
  fim: z
    .string()
    .trim()
    .regex(DIA, "Data de fim inválida.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  contratoId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  criadoPor: z.string().trim().min(1),
});
export type CadastrarCampanhaPublicitariaInput = z.input<typeof zCadastrarCampanhaPublicitaria>;

export async function cadastrarCampanhaPublicitaria(
  prisma: PrismaClient,
  input: CadastrarCampanhaPublicitariaInput
): Promise<{ readonly id: string; readonly identificador: string }> {
  const r = zCadastrarCampanhaPublicitaria.safeParse(input);
  if (!r.success) {
    throw new CampanhaPublicitariaInvalidaError(`${r.error.issues[0]?.message ?? "Dados inválidos."} Nada foi gravado.`);
  }
  const d = r.data;
  if (d.fim !== undefined && d.fim < d.inicio) {
    throw new CampanhaPublicitariaInvalidaError(
      `A data de fim (${d.fim}) é anterior à de início (${d.inicio}). Nada foi gravado.`
    );
  }
  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarCampanhaPublicitaria, "ENTE");
    const ja = await tx.campanhaPublicitaria.findUnique({ where: { identificador: d.identificador }, select: { titulo: true } });
    if (ja !== null) {
      throw new CampanhaPublicitariaInvalidaError(
        `Já existe a campanha ${d.identificador} ("${ja.titulo}"). Um identificador nomeia uma campanha só. Nada foi gravado.`
      );
    }
    if (d.contratoId !== undefined) {
      const c = await tx.contrato.findUnique({ where: { id: d.contratoId }, select: { id: true } });
      if (c === null) throw new CampanhaPublicitariaInvalidaError("Contrato não encontrado. Nada foi gravado.");
    }
    const criada = await tx.campanhaPublicitaria.create({
      data: {
        identificador: d.identificador,
        titulo: d.titulo,
        objetivo: d.objetivo,
        inicio: inicioDoDiaCivil(d.inicio),
        fim: d.fim === undefined ? null : inicioDoDiaCivil(d.fim),
        contratoId: d.contratoId ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true, identificador: true },
    });
    return criada;
  });
}

/**
 * O EMPENHADO LÍQUIDO de uma campanha: Σ dos empenhos vinculados, líquida de anulações totais e
 * parciais (a soma do repositório, `packages/estornaveis`). É ela que exige que a anulação copie
 * o `campanhaPublicitariaId` — ver DIMENSOES_DO_EMPENHO no adapter do M05.
 */
export async function empenhadoLiquidoDaCampanha(tx: Tx | PrismaClient, campanhaId: string): Promise<Money> {
  const empenhos = await tx.empenho.findMany({
    where: { campanhaPublicitariaId: campanhaId },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  return somaLiquidaEstornaveis(
    empenhos.map((e) => ({
      id: e.id,
      valor: toMoney(e.valor.toFixed(2)),
      estornoDeId: e.estornoDeId,
      anulacaoParcialDeId: e.anulacaoParcialDeId,
    }))
  );
}
