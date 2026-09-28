import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * A LEI ORÇAMENTÁRIA ANUAL (V22, M02b) — o ATO: o projeto de lei que o Executivo enviou ao
 * Legislativo e a lei que o aprovou. Os anexos (o projeto, a lei publicada, os anexos da lei) são
 * do M22, com `leiOrcamentariaAnualId` como dono.
 *
 * ⚠️ O ORÇAMENTO NÃO É CADASTRADO AQUI: as dotações são as fichas (M02) e a consulta
 * /planejamento/loa as consolida. Este cadastro é o que faltava — de que lei aquele orçamento é.
 *
 * ⚠️ AUTORIZAÇÃO: CADASTRAR_LOA no ENTE, para os dois atos (a LOA é do ente; não há escopo de
 * unidade). A aprovação é registro À PARTE, único e append-only: nenhuma das duas tabelas tem
 * UPDATE no runtime.
 */

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export class LeiOrcamentariaInvalidaError extends Error {
  override readonly name = "LeiOrcamentariaInvalidaError";
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const zDia = (rotulo: string) => z.string().trim().regex(DIA, `Informe ${rotulo} (dia/mês/ano).`);

export const zCadastrarLeiOrcamentariaAnual = z.object({
  exercicio: z.coerce.number().int("Informe o exercício com quatro dígitos.").min(2000, "Exercício inválido.").max(2100, "Exercício inválido."),
  numeroDoProjeto: z.string().trim().min(1, "Informe o número do projeto de lei.").max(40),
  /** "AAAA-MM-DD", data civil do ente. */
  dataDoEnvio: zDia("a data do envio ao Legislativo"),
  ementa: z.string().trim().min(3, "Informe a ementa do projeto.").max(2000),
  criadoPor: z.string().trim().min(1),
});
export type CadastrarLeiOrcamentariaAnualInput = z.input<typeof zCadastrarLeiOrcamentariaAnual>;

export const zRegistrarAprovacaoDaLeiOrcamentaria = z.object({
  leiId: z.string().trim().min(1),
  numeroDaLei: z.string().trim().min(1, "Informe o número da lei.").max(40),
  dataDaSancao: zDia("a data da sanção"),
  dataDaPublicacao: zDia("a data da publicação"),
  veiculoDePublicacao: z.string().trim().min(3, "Informe onde a lei foi publicada.").max(200),
  criadoPor: z.string().trim().min(1),
});
export type RegistrarAprovacaoDaLeiOrcamentariaInput = z.input<typeof zRegistrarAprovacaoDaLeiOrcamentaria>;

function lerOuRecusar<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new LeiOrcamentariaInvalidaError(`${r.error.issues[0]?.message ?? "Dados inválidos."} Nada foi gravado.`);
  return r.data;
}

export async function cadastrarLeiOrcamentariaAnual(
  prisma: PrismaClient,
  input: CadastrarLeiOrcamentariaAnualInput
): Promise<{ readonly id: string; readonly exercicio: number }> {
  const d = lerOuRecusar(zCadastrarLeiOrcamentariaAnual, input);
  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarLeiOrcamentariaAnual, "ENTE");
    const ja = await tx.leiOrcamentariaAnual.findUnique({ where: { exercicio: d.exercicio }, select: { numeroDoProjeto: true } });
    if (ja !== null) {
      throw new LeiOrcamentariaInvalidaError(
        `Já existe a LOA de ${d.exercicio} (projeto ${ja.numeroDoProjeto}). Cada exercício tem uma lei orçamentária. Nada foi gravado.`
      );
    }
    return tx.leiOrcamentariaAnual.create({
      data: {
        exercicio: d.exercicio,
        numeroDoProjeto: d.numeroDoProjeto,
        dataDoEnvio: inicioDoDiaCivil(d.dataDoEnvio),
        ementa: d.ementa,
        criadoPor: d.criadoPor,
      },
      select: { id: true, exercicio: true },
    });
  });
}

/**
 * A LEI QUE APROVOU O PROJETO. Uma por LOA. A ordem das datas é conferida em dia civil do ente:
 * a sanção não vem antes do envio do projeto, e a publicação não vem antes da sanção (esta
 * também por CHECK no banco).
 */
export async function registrarAprovacaoDaLeiOrcamentaria(
  prisma: PrismaClient,
  input: RegistrarAprovacaoDaLeiOrcamentariaInput
): Promise<{ readonly id: string }> {
  const d = lerOuRecusar(zRegistrarAprovacaoDaLeiOrcamentaria, input);
  if (d.dataDaPublicacao < d.dataDaSancao) {
    throw new LeiOrcamentariaInvalidaError(
      `A publicação (${d.dataDaPublicacao}) é anterior à sanção (${d.dataDaSancao}). Nada foi gravado.`
    );
  }
  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarAprovacaoDaLeiOrcamentaria, "ENTE");
    const lei = await tx.leiOrcamentariaAnual.findUnique({
      where: { id: d.leiId },
      select: { exercicio: true, dataDoEnvio: true, aprovacao: { select: { numeroDaLei: true } } },
    });
    if (lei === null) throw new LeiOrcamentariaInvalidaError("Lei orçamentária não encontrada. Nada foi gravado.");
    if (lei.aprovacao !== null) {
      throw new LeiOrcamentariaInvalidaError(
        `A LOA de ${lei.exercicio} já tem a lei que a aprovou (${lei.aprovacao.numeroDaLei}). Nada foi gravado.`
      );
    }
    const envio = diaCivil(lei.dataDoEnvio);
    if (d.dataDaSancao < envio) {
      throw new LeiOrcamentariaInvalidaError(
        `A sanção (${d.dataDaSancao}) é anterior ao envio do projeto ao Legislativo (${envio}). Nada foi gravado.`
      );
    }
    return tx.aprovacaoDaLeiOrcamentaria.create({
      data: {
        leiId: d.leiId,
        numeroDaLei: d.numeroDaLei,
        dataDaSancao: inicioDoDiaCivil(d.dataDaSancao),
        dataDaPublicacao: inicioDoDiaCivil(d.dataDaPublicacao),
        veiculoDePublicacao: d.veiculoDePublicacao,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
  });
}
