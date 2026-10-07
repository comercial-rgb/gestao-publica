import { z } from "zod";
import { toMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { CONTA_PREVISAO_INICIAL_RECEITA_BRUTA, CONTA_RECEITA_A_REALIZAR } from "../m01-core-contabil/roteiros.js";
import { normalizarCodigoNaturezaReceita } from "../m04-receita/ementario.js";
import { composicoesVigentes, ratearPelaComposicao, zValorDoRateio } from "../m04-receita/fontes-da-natureza.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { exigirExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { lancarPrevisaoDaReceita } from "./previsao-no-razao.js";

/**
 * M02 — A RECEITA DA LOA INFORMADA POR RATEIO (TR 5.9.3.7).
 *
 * O operador informa a natureza e o valor; o sistema reparte o valor pelas fontes da composição vigente da natureza
 * (M04, `fontes-da-natureza.ts`) e grava uma previsão por fonte, cada uma com o seu lançamento no razão — o mesmo da
 * previsão informada linha a linha (`criarReceitaPrevista`): D previsão inicial da receita bruta / C receita a realizar,
 * em 1º de janeiro do exercício.
 *
 * TUDO OU NADA, numa transação: conferidas antes de gravar a composição (fecha em 100%) e a ausência de previsão já
 * gravada para alguma das fontes; a corrida de dois rateios da mesma natureza esbarra na chave única da previsão e
 * desfaz o rateio inteiro. Uma previsão gravada pela metade deixaria a LOA com parte das fontes da natureza.
 *
 * A dedução da receita não entra aqui: a conta dela depende do tipo da dedução, que só o detalhe da linha diz.
 */

export const zPreverReceitaPorRateioInput = z.object({
  exercicio: z.number().int().min(2000).max(2100),
  naturezaReceita: z.string().trim().min(1, "Informe a natureza da receita"),
  valor: zValorDoRateio,
  criadoPor: z.string().min(1),
});
export type PreverReceitaPorRateioInput = z.input<typeof zPreverReceitaPorRateioInput>;

export interface PrevisaoRateada {
  readonly fonte: string;
  readonly exercicioFonte: number;
  readonly valor: string;
  readonly receitaPrevistaId: string;
}

function ehViolacaoDeUnicidade(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "P2002";
}

export async function preverReceitaPorRateio(prisma: PrismaClient, input: PreverReceitaPorRateioInput): Promise<readonly PrevisaoRateada[]> {
  const lido = zPreverReceitaPorRateioInput.safeParse(input);
  if (!lido.success) throw new Error(`${lido.error.issues.map((i) => i.message).join(" ")} Nada foi gravado.`);
  const d = lido.data;
  const codigo = normalizarCodigoNaturezaReceita(d.naturezaReceita);
  // A natureza de categoria 7 ou 8 é intraorçamentária — o mesmo critério da carga da receita da LOA.
  const tipoReceita = codigo[0] === "7" || codigo[0] === "8" ? "INTRA_ORCAMENTARIA" : "ORCAMENTARIA";

  return prisma.$transaction(async (tx) => {
      // Prever a receita é ato do ENTE, sem unidade: a mesma autoridade da previsão linha a linha.
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.preverReceitaPorRateio, "ENTE");
      // A previsão é fato de 1º de janeiro no razão: exercício inexistente ou encerrado não recebe previsão (o mesmo
      // guard da ficha e da efetivação da proposta orçamentária).
      await exigirExercicioAberto(tx, d.exercicio, `previsão da receita da natureza ${codigo} por rateio`);

      const [composicao] = await composicoesVigentes(tx, { naturezas: [codigo] });
      if (composicao === undefined) {
        throw new Error(`A natureza ${codigo} não tem fontes cadastradas com percentual. Cadastre a composição de fontes da natureza antes de ratear. Nada foi gravado.`);
      }
      const partes = ratearPelaComposicao(d.valor, composicao).filter((p) => p.valor.greaterThan(0));

      const [natureza, fontes] = await Promise.all([
        tx.naturezaReceita.findUniqueOrThrow({ where: { codigo }, select: { id: true } }),
        tx.fonteRecurso.findMany({ where: { codigo: { in: partes.map((p) => p.fonte) } }, select: { id: true, codigo: true } }),
      ]);
      const idDa = (c: string): string => fontes.find((f) => f.codigo === c)!.id;

      const ja = await tx.receitaPrevista.findMany({
        where: {
          exercicio: d.exercicio,
          naturezaReceitaId: natureza.id,
          tipoReceita,
          OR: partes.map((p) => ({ fonteId: idDa(p.fonte), exercicioFonte: p.exercicioFonte })),
        },
        select: { fonte: { select: { codigo: true } } },
      });
      if (ja.length > 0) {
        throw new Error(
          `A LOA de ${String(d.exercicio)} já tem previsão da natureza ${codigo} na(s) fonte(s) ${ja.map((r) => r.fonte.codigo).sort().join(", ")}. ` +
            `O rateio grava todas as fontes da natureza de uma vez; para mudar uma previsão existente, use a reestimativa. Nada foi gravado.`
        );
      }

      const gravadas: PrevisaoRateada[] = [];
      for (const p of partes) {
        // A tradução da unicidade envolve SÓ a gravação da previsão: outra unicidade violada na transação (a do
        // lançamento, por exemplo) sobe com o motivo dela, e não como "previsão gravada ao mesmo tempo".
        let criada: { id: string };
        try {
          criada = await tx.receitaPrevista.create({
            data: { exercicio: d.exercicio, naturezaReceitaId: natureza.id, fonteId: idDa(p.fonte), exercicioFonte: p.exercicioFonte, tipoReceita, valorPrevisto: p.valor.toFixed(2) },
            select: { id: true },
          });
        } catch (e) {
          if (ehViolacaoDeUnicidade(e)) {
            throw new Error(
              `Outra previsão da natureza ${codigo} na fonte ${p.fonte} foi gravada ao mesmo tempo. O rateio foi desfeito por inteiro; confira a LOA e tente de novo. Nada foi gravado.`,
              { cause: e }
            );
          }
          throw e;
        }
        await lancarPrevisaoDaReceita(tx, {
          receitaPrevistaId: criada.id,
          exercicio: d.exercicio,
          valor: p.valor.toFixed(2),
          debito: CONTA_PREVISAO_INICIAL_RECEITA_BRUTA,
          credito: CONTA_RECEITA_A_REALIZAR,
          historico: `Previsão inicial da receita (LOA ${String(d.exercicio)}), rateada pelas fontes da natureza`,
          autor: d.criadoPor,
        });
        gravadas.push({ fonte: p.fonte, exercicioFonte: p.exercicioFonte, valor: p.valor.toFixed(2), receitaPrevistaId: criada.id });
      }
      const total = gravadas.reduce((t, g) => toMoney(t.plus(g.valor)), toMoney("0.00"));
      if (!total.equals(d.valor)) throw new Error(`O rateio somou ${total.toFixed(2)} e o valor informado é ${d.valor.toFixed(2)}. Nada foi gravado.`);
      return gravadas;
  });
}
