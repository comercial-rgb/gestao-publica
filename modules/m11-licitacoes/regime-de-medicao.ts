import { z } from "zod";
import { diaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import type { ConferenciaDoPeriodo } from "./medicoes.js";

/**
 * ═══ M11 — O REGIME DE PERÍODO DA MEDIÇÃO DO CONTRATO (V7 M2 U0.2) ═══
 *
 * A PERGUNTA QUE ISTO RESPONDE: "duas medições no mesmo dia, no mesmo contrato, são a mesma parcela?". A resposta
 * anterior era "sempre", herdada da medição de obra só por valor, e o percurso passou a procurar um dia livre para
 * conseguir medir de novo — o que não prova regra nenhuma.
 *
 * A REGRA, COM O FUNDAMENTO DE CADA PEDAÇO:
 *   · MESMA INTENÇÃO (mesma chave e mesmo conteúdo) → o envelope da borda devolve o resultado anterior; MESMA CHAVE com
 *     OUTRO conteúdo → conflito (`comOperacaoRegistrada`). Não é regra de negócio: é idempotência do comando.
 *   · MESMA PARCELA com OUTRA chave → recusa pelo SALDO do item (contratado, e na ordem de serviço o autorizado): a
 *     quantidade já medida não se mede de novo. Esta é a regra de negócio, e ela não olha a data.
 *   · PERÍODO INDIVISÍVEL → só quando o contrato ou o regulamento o determinam, configurado aqui com fundamento e
 *     vigência (art. 140, § 3º: "os prazos e os métodos para a realização dos recebimentos provisório e definitivo
 *     serão definidos em regulamento ou no contrato"). A recusa nomeia o fundamento e vale só para aquele contrato.
 *   · MEDIÇÃO SÓ POR VALOR (sem itens) → confere o período sempre: é a única identidade dela.
 *
 * ⚠️ NENHUM REGIME É INVENTADO: sem configuração o regime é PERIODO_LIVRE, e a proteção contra medir duas vezes é o
 * saldo — que é o que o TR pede (período e quantidades por item).
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");

export const zConfigurarRegimeDeMedicao = z.object({
  contratoId: z.string().min(1),
  regime: z.enum(["PERIODO_LIVRE", "PERIODO_INDIVISIVEL"]),
  fundamento: z.string().trim().min(5, "O fundamento (cláusula do contrato, regulamento) é obrigatório."),
  vigenciaInicio: zDia,
  criadoPor: z.string().min(1),
});
export type ConfigurarRegimeDeMedicaoInput = z.input<typeof zConfigurarRegimeDeMedicao>;

/** CONFIGURAR o regime — fato novo com vigência; a versão anterior continua valendo para os períodos antes dela. */
export async function configurarRegimeDeMedicao(prisma: PrismaClient, input: ConfigurarRegimeDeMedicaoInput): Promise<{ readonly regimeId: string }> {
  const d = zConfigurarRegimeDeMedicao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.configurarRegimeDeMedicao, "ENTE");
    await travar(tx, "Contrato", [d.contratoId]);
    const c = await tx.contrato.findUnique({ where: { id: d.contratoId }, select: { id: true } });
    if (c === null) throw new Error(`Contrato ${d.contratoId} não existe. Nada foi gravado.`);
    const mesmoDia = await tx.regimeDeMedicaoDoContrato.findFirst({ where: { contratoId: c.id, vigenciaInicio: inicioDoDiaCivil(d.vigenciaInicio) }, select: { id: true } });
    if (mesmoDia !== null) {
      throw new Error(`REGIME-JA-CONFIGURADO-NO-DIA: já há um regime de medição com vigência a partir de ${d.vigenciaInicio} neste contrato. Configure a mudança com outra data de início. Nada foi gravado.`);
    }
    const r = await tx.regimeDeMedicaoDoContrato.create({
      data: { contratoId: c.id, regime: d.regime, fundamento: d.fundamento, vigenciaInicio: inicioDoDiaCivil(d.vigenciaInicio), criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { regimeId: r.id };
  });
}

/**
 * A CONFERÊNCIA DE PERÍODO para uma medição POR ITENS que começa em `diaInicio`: o regime vigente naquele dia
 * (a configuração mais recente com início até ele). Sem configuração, não confere — a identidade é o saldo.
 */
export async function conferenciaDoPeriodoPorItens(tx: Tx, contratoId: string, diaInicio: string): Promise<ConferenciaDoPeriodo> {
  const regimes = await tx.regimeDeMedicaoDoContrato.findMany({ where: { contratoId }, orderBy: { vigenciaInicio: "desc" }, select: { regime: true, fundamento: true, vigenciaInicio: true } });
  const vigente = regimes.find((r) => diaCivil(r.vigenciaInicio) <= diaInicio);
  if (vigente === undefined || vigente.regime === "PERIODO_LIVRE") return { conferir: false };
  return { conferir: true, fundamento: `período indivisível configurado no contrato — ${vigente.fundamento}` };
}
