import { z } from "zod";
import { randomUUID } from "node:crypto";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import {
  diaCivil,
  fimDoDiaCivil,
  inicioDoDiaCivil,
} from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { valorAtualizado, type MovimentoDoContrato } from "./dominio.js";

/**
 * M11 — A MEDIÇÃO DE OBRA (Lei 14.133/2021, art. 140).
 *
 * ═══ ⚠️ DUAS REGRAS DISTINTAS, E AS DUAS SÃO GUARD ═══
 *   1. **os períodos não se sobrepõem** — medir o mesmo intervalo duas vezes é medir o mesmo
 *      serviço duas vezes, e o acumulado fecharia certo contando errado;
 *   2. **Σ das medições não passa do valor VIGENTE do contrato** — execução acima do
 *      contratado, se legítima, exige ADITIVO ANTES, não medição depois.
 *
 * ⚠️ O VALOR VIGENTE VEM DO `valorAtualizado` do próprio M11 — o mesmo que já soma acréscimos e
 * supressões. Recalcular aqui seria a segunda verdade sobre o valor do contrato, e as duas
 * divergiriam no dia em que um tipo de movimento novo entrasse.
 *
 * ═══ ⚠️ A COMPARAÇÃO DE PERÍODO É POR DIA CIVIL DO ENTE ═══
 * Uma medição de 01/01 a 31/01 vai de 01/01 às 00:00 até 31/01 às 23:59:59 DO ENTE. Em UTC ela
 * terminaria às 20:59:59, e as três horas restantes de 31/01 ficariam ou sem medição nenhuma
 * ou dentro da medição seguinte — e um dia na virada do mês decide se a obra fecha.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil YYYY-MM-DD.");

export const zRegistrarMedicaoInput = z.object({
  obraId: z.string().min(1),
  contratoId: z.string().min(1),
  numero: z.number().int().min(1),
  diaInicio: zDia,
  diaFim: zDia,
  valorMedido: zMoney,
  responsavelTecnico: z.string().trim().min(3),
  registroProfissional: z
    .string()
    .trim()
    .min(3, "O registro profissional (CREA/CAU) é obrigatório: sem ele, o atesto é de alguém que pode não poder atestar."),
  criadoPor: z.string().min(1),
});
export type RegistrarMedicaoInput = z.input<typeof zRegistrarMedicaoInput>;

export const zAprovarMedicaoInput = z.object({
  medicaoId: z.string().min(1),
  diaAprovacao: zDia,
  criadoPor: z.string().min(1),
});
export type AprovarMedicaoInput = z.input<typeof zAprovarMedicaoInput>;

export interface PeriodoMedido {
  readonly numero: number;
  readonly inicio: Date;
  readonly fim: Date;
}

/**
 * OS DOIS PERÍODOS SE SOBREPÕEM? — puro, e a resposta é a clássica `a.inicio <= b.fim &&
 * b.inicio <= a.fim`.
 *
 * ⚠️ AS BORDAS SÃO INCLUSIVAS nas duas pontas. Uma medição que acaba em 31/01 e a seguinte que
 * começa em 31/01 SE SOBREPÕEM — aquele dia seria medido duas vezes. Tratar a borda como
 * exclusiva deixaria passar exatamente o caso mais comum: quem digita períodos consecutivos
 * repete o dia por hábito.
 */
export function periodosSeSobrepoem(a: PeriodoMedido, b: PeriodoMedido): boolean {
  return a.inicio <= b.fim && b.inicio <= a.fim;
}

/** A primeira sobreposição encontrada, ou `null`. */
export function sobreposicao(
  novo: PeriodoMedido,
  existentes: readonly PeriodoMedido[]
): PeriodoMedido | null {
  for (const e of existentes) {
    if (e.numero === novo.numero) continue; // é ela mesma
    if (periodosSeSobrepoem(novo, e)) return e;
  }
  return null;
}

export async function registrarMedicao(
  prisma: PrismaClient,
  input: RegistrarMedicaoInput
): Promise<{ readonly medicaoId: string; readonly acumulado: string }> {
  const d = zRegistrarMedicaoInput.parse(input);
  const inicio = inicioDoDiaCivil(d.diaInicio);
  const fim = fimDoDiaCivil(d.diaFim);
  if (fim < inicio) {
    throw new Error(
      `PERÍODO INVERTIDO na medição ${d.numero}: termina (${d.diaFim}) antes de começar ` +
        `(${d.diaInicio}). Nada foi gravado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarMedicao, "ENTE");
    // ⚠️ O LOCK É DO CONTRATO (posto 5), e não da obra: é contra o valor DELE que o acumulado
    // é conferido, e duas medições concorrentes do mesmo contrato leem o mesmo acumulado.
    await travar(tx, "Contrato", [d.contratoId]);

    const contrato = await tx.contrato.findUnique({
      where: { id: d.contratoId },
      select: {
        id: true,
        numeroContrato: true,
        valorInicial: true,
        movimentos: { select: { tipo: true, valor: true, dias: true } },
      },
    });
    if (contrato === null) {
      throw new Error(`Contrato ${d.contratoId} não encontrado. Nada foi gravado.`);
    }
    const obra = await tx.obra.findUnique({
      where: { id: d.obraId },
      select: { id: true, identificador: true, ativa: true },
    });
    if (obra === null) {
      throw new Error(`Obra ${d.obraId} não encontrada. Nada foi gravado.`);
    }
    if (!obra.ativa) {
      throw new Error(
        `A obra ${obra.identificador} está ENCERRADA. Medir uma obra encerrada faria a ` +
          `liquidação de um serviço que o ente já declarou concluído. Nada foi gravado.`
      );
    }

    const existentes = await tx.medicaoDeObra.findMany({
      where: { obraId: d.obraId },
      select: { numero: true, periodoInicio: true, periodoFim: true, valorMedido: true },
    });

    const conflito = sobreposicao(
      { numero: d.numero, inicio, fim },
      existentes.map((m) => ({
        numero: m.numero,
        inicio: m.periodoInicio,
        fim: m.periodoFim,
      }))
    );
    if (conflito !== null) {
      throw new Error(
        `PERÍODO SOBREPOSTO na obra ${obra.identificador}: a medição ${d.numero} ` +
          `(${d.diaInicio} a ${d.diaFim}) invade a medição ${conflito.numero} ` +
          `(${diaCivil(conflito.inicio)} a ${diaCivil(conflito.fim)}). Medir o mesmo ` +
          `intervalo duas vezes é medir o mesmo serviço duas vezes — o acumulado fecharia ` +
          `certo contando errado. ⚠️ As bordas são INCLUSIVAS: uma medição que acaba em X e a ` +
          `seguinte que começa em X se sobrepõem naquele dia. Nada foi gravado.`
      );
    }

    const vigente = valorAtualizado(
      toMoney(contrato.valorInicial.toFixed(2)),
      contrato.movimentos as readonly MovimentoDoContrato[]
    );
    let acumulado = toMoney("0.00");
    for (const m of existentes) acumulado = toMoney(acumulado.plus(m.valorMedido.toFixed(2)));
    const novoAcumulado = toMoney(acumulado.plus(d.valorMedido));

    if (novoAcumulado.gt(vigente)) {
      throw new Error(
        `MEDIÇÃO ACIMA DO CONTRATADO no contrato ${contrato.numeroContrato}: acumulado ficaria ` +
          `${novoAcumulado.toFixed(2)} contra o valor vigente de ${vigente.toFixed(2)} ` +
          `(já medido ${acumulado.toFixed(2)}, esta medição ${d.valorMedido.toFixed(2)}). ` +
          `Execução acima do contratado, se legítima, exige ADITIVO ANTES — não medição ` +
          `depois. Nada foi gravado.`
      );
    }

    const criada = await tx.medicaoDeObra.create({
      data: {
        obraId: d.obraId,
        contratoId: d.contratoId,
        numero: d.numero,
        periodoInicio: inicio,
        periodoFim: fim,
        valorMedido: d.valorMedido.toFixed(2),
        responsavelTecnico: d.responsavelTecnico,
        registroProfissional: d.registroProfissional,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { medicaoId: criada.id, acumulado: novoAcumulado.toFixed(2) };
  });
}

/**
 * APROVAR A MEDIÇÃO — e é OUTRO CRACHÁ (`APROVAR_MEDICAO_DE_OBRA`).
 *
 * ⚠️ QUEM MEDE NÃO APROVA, e a separação é segregação de função (TR 6.4). Medir e aprovar com
 * o mesmo poder é atestar o próprio serviço — e a aprovação é o que libera a liquidação.
 *
 * ⚠️ APROVAR É UM FATO COM AUTOR E DATA, não um booleano. Aprovar duas vezes é recusado: a
 * segunda aprovação sobrescreveria quem aprovou primeiro, e é exatamente essa a informação que
 * o controle interno vai querer.
 */
export async function aprovarMedicao(
  prisma: PrismaClient,
  input: AprovarMedicaoInput
): Promise<{ readonly medicaoId: string }> {
  const d = zAprovarMedicaoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.aprovarMedicao, "ENTE");

    const m = await tx.medicaoDeObra.findUnique({
      where: { id: d.medicaoId },
      select: {
        id: true,
        numero: true,
        contratoId: true,
        aprovadaEm: true,
        aprovadaPor: true,
        criadoPor: true,
        obra: { select: { identificador: true } },
      },
    });
    if (m === null) {
      throw new Error(`Medição ${d.medicaoId} não encontrada. Nada foi gravado.`);
    }
    await travar(tx, "Contrato", [m.contratoId]);

    if (m.aprovadaEm !== null) {
      throw new Error(
        `A medição ${m.numero} da obra ${m.obra.identificador} JÁ FOI APROVADA em ` +
          `${diaCivil(m.aprovadaEm)} por ${m.aprovadaPor}. Aprovar de novo sobrescreveria ` +
          `quem aprovou primeiro — e é justamente essa a informação que o controle interno ` +
          `vai querer. Nada foi gravado.`
      );
    }
    if (m.criadoPor === d.criadoPor) {
      throw new Error(
        `SEGREGAÇÃO DE FUNÇÃO: ${d.criadoPor} registrou a medição ${m.numero} e está tentando ` +
          `APROVÁ-LA. Quem mede não aprova — a aprovação é o que libera a liquidação, e ` +
          `atestar o próprio serviço é o arranjo que o art. 74 da Constituição manda impedir. ` +
          `Nada foi gravado.`
      );
    }

    await tx.medicaoDeObra.update({
      where: { id: d.medicaoId },
      data: { aprovadaEm: inicioDoDiaCivil(d.diaAprovacao), aprovadaPor: d.criadoPor },
    });
    return { medicaoId: m.id };
  });
}

/**
 * A MEDIÇÃO EXIGIDA PARA LIQUIDAR — chamada de DENTRO do `liquidar()` do M05.
 *
 * ⚠️ NÃO É SERVIÇO PÚBLICO e não cobra ação: quem cobra é o `liquidar()`. A transação é a
 * dele — se a medição não serve, a LIQUIDAÇÃO INTEIRA aborta. Não existe "liquidou sem medir".
 */
export async function exigirMedicaoAprovadaDaObra(
  tx: Tx,
  p: {
    readonly obraId: string;
    readonly medicaoId: string | undefined;
    readonly valorDaLiquidacao: Money;
  }
): Promise<void> {
  if (p.medicaoId === undefined) {
    throw new Error(
      `LIQUIDAÇÃO DE OBRA SEM MEDIÇÃO. A liquidação existe para verificar o direito adquirido ` +
        `pelo credor (Lei 4.320, art. 63), e em obra quem verifica é a MEDIÇÃO (Lei 14.133, ` +
        `art. 140). Liquidar sem ela é a etapa de conferência pulada — e o razão fica ` +
        `idêntico ao de uma obra conferida. Informe a medição aprovada. Nada foi gravado.`
    );
  }

  const m = await tx.medicaoDeObra.findUnique({
    where: { id: p.medicaoId },
    select: {
      id: true,
      numero: true,
      obraId: true,
      valorMedido: true,
      aprovadaEm: true,
      obra: { select: { identificador: true } },
    },
  });
  if (m === null) {
    throw new Error(`Medição ${p.medicaoId} não encontrada. Nada foi gravado.`);
  }
  if (m.obraId !== p.obraId) {
    throw new Error(
      `A medição ${m.numero} é da obra ${m.obra.identificador}, e o empenho é de OUTRA obra. ` +
        `Aceitá-la faria o acumulado de uma obra pagar serviço de outra. Nada foi gravado.`
    );
  }
  if (m.aprovadaEm === null) {
    throw new Error(
      `A medição ${m.numero} da obra ${m.obra.identificador} NÃO FOI APROVADA. A aprovação é ` +
        `o que libera a liquidação — liquidar sobre medição pendente é pagar o que ninguém ` +
        `atestou. Nada foi gravado.`
    );
  }
  const medido = toMoney(m.valorMedido.toFixed(2));
  if (p.valorDaLiquidacao.gt(medido)) {
    throw new Error(
      `LIQUIDAÇÃO ACIMA DO MEDIDO: liquidação de ${p.valorDaLiquidacao.toFixed(2)} sobre a ` +
        `medição ${m.numero}, que atestou ${medido.toFixed(2)}. O direito do credor é o que ` +
        `foi medido. Nada foi gravado.`
    );
  }
}
