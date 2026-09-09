import { toMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// A ARITMÉTICA É DO M08. O M12 só a alimenta com o recorte temporal dele.
import {
  somaLiquidaEstornaveis,
  totaisDosMovimentos,
} from "../m08-restos-a-pagar/dominio.js";
import {
  montarRelatorioRestosAPagar,
  type FatoInscricao,
  type RelatorioRestosAPagar,
} from "./dominio-restos.js";
import type { TipoRestos } from "./dominio.js";

/**
 * RELATÓRIO DE RESTOS A PAGAR (M12, bloco 3a) — LEITURA PURA.
 *
 * Zero escrita, zero tabela, nenhuma coluna cache. E, principalmente: **nenhuma
 * aritmética própria** — os totais saem de `totaisDosMovimentos` (M08), a mesma
 * função que o próprio M08 usa para decidir se um pagamento de RP cabe no saldo.
 * Relatório e regra de negócio contam a MESMA história, porque somam com o MESMO
 * código.
 *
 * CORTE TEMPORAL (igual aos blocos 1 e 2): os movimentos contam até o
 * ENCERRAMENTO do exercício de referência. Exercício aberto = tudo até agora, e
 * `parcial: true`.
 */
export async function relatorioRestosAPagar(
  prisma: PrismaClient,
  exercicioReferencia: number
): Promise<RelatorioRestosAPagar> {
  const ex = await prisma.exercicio.findUnique({
    where: { ano: exercicioReferencia },
    select: { ano: true, encerramento: { select: { criadoEm: true } } },
  });
  if (ex === null) {
    throw new Error(
      `Exercício ${exercicioReferencia} não existe — não há relatório de restos ` +
        `a pagar a emitir.`
    );
  }

  const corte: Date | null = ex.encerramento?.criadoEm ?? null;
  const parcial = corte === null;

  // As inscrições que EXISTIAM no exercício de referência (as de origem posterior
  // ainda não tinham sido feitas).
  const inscricoes = await prisma.inscricaoRestosAPagar.findMany({
    where: { exercicioOrigem: { lte: exercicioReferencia } },
    select: {
      id: true,
      tipo: true,
      exercicioOrigem: true,
      valorInscrito: true,
      empenhoId: true,
      empenho: { select: { numero: true, credorCpfCnpj: true } },
      movimentos: { select: { tipo: true, valor: true, criadoEm: true } },
    },
  });
  if (inscricoes.length === 0) {
    return montarRelatorioRestosAPagar({
      exercicioReferencia,
      parcial,
      inscricoes: [],
    });
  }

  // Encerramentos, para saber o que é "liquidação DEPOIS da inscrição".
  const exercicios = await prisma.exercicio.findMany({
    where: { encerramento: { isNot: null } },
    select: { ano: true, encerramento: { select: { criadoEm: true } } },
  });
  const encerradoEm = new Map(
    exercicios.map((e) => [e.ano, e.encerramento!.criadoEm])
  );

  // Liquidações dos empenhos inscritos — para a coluna "liquidado após a
  // inscrição" (a migração do não processado para o campo do processado).
  const liquidacoes = await prisma.liquidacao.findMany({
    where: { empenhoId: { in: inscricoes.map((i) => i.empenhoId) } },
    select: {
      id: true,
      empenhoId: true,
      valor: true,
      estornoDeId: true,
      criadoEm: true,
    },
  });

  const antesDoCorte = (quando: Date): boolean =>
    corte === null || quando <= corte;

  const fatos: FatoInscricao[] = inscricoes.map((i) => {
    // Os movimentos ATÉ O CORTE, somados pela função do M08 (com os sinais).
    const totais = totaisDosMovimentos(
      i.movimentos
        .filter((m) => antesDoCorte(m.criadoEm))
        .map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }))
    );

    // Só o NÃO PROCESSADO tem esta coluna: o processado já nasceu liquidado — foi
    // por isso que ele é "processado".
    let liquidadoAposInscricao = toMoney("0.00");
    if (i.tipo === "NAO_PROCESSADO") {
      const inscritoEm = encerradoEm.get(i.exercicioOrigem);
      if (inscritoEm !== undefined) {
        liquidadoAposInscricao = somaLiquidaEstornaveis(
          liquidacoes
            .filter(
              (l) =>
                l.empenhoId === i.empenhoId &&
                l.criadoEm > inscritoEm &&
                antesDoCorte(l.criadoEm)
            )
            .map((l) => ({
              id: l.id,
              valor: toMoney(l.valor.toFixed(2)),
              estornoDeId: l.estornoDeId,
            }))
        );
      }
    }

    return {
      inscricaoId: i.id,
      exercicioOrigem: i.exercicioOrigem,
      tipo: i.tipo as TipoRestos,
      empenhoId: i.empenhoId,
      numeroEmpenho: i.empenho.numero,
      credorCpfCnpj: i.empenho.credorCpfCnpj,
      inscrito: toMoney(i.valorInscrito.toFixed(2)),
      liquidadoAposInscricao,
      totais,
    };
  });

  return montarRelatorioRestosAPagar({
    exercicioReferencia,
    parcial,
    inscricoes: fatos,
  });
}
