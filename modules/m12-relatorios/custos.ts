import { z } from "zod";
import {
  Decimal,
  serializarPercentual,
  toMoney,
  toPercentual,
  zMoney,
  zPercentualDeRateio,
  type Money,
  type Percentual,
} from "../../packages/contracts/index.js";

/**
 * M12 — CUSTO POR CENTRO: a aritmética do rateio e as entradas (V19/C05).
 *
 * ═══ ⚠️ POR QUE ISTO MORA NO M12 ═══
 * O requisito pede que a apropriação **alcance os relatórios**, e o M12 é o módulo dos
 * demonstrativos. A alternativa era o M05, que é o dono da despesa — e ali a dimensão de custo
 * seria uma classificação gerencial que o próprio módulo não usa para nada: o empenho, a liquidação
 * e o pagamento não mudam de comportamento por causa dela. O custo é uma LEITURA que se acumula, e
 * o fato que a alimenta referencia a liquidação sem alterá-la.
 *
 * ═══ ⚠️ O CENTRO DE CUSTO É O `Setor` ═══
 * Decisão anterior a este arquivo (`m21-protocolo.prisma:89`, `m32-pessoal.prisma:678`): o centro de
 * custo de um vínculo é um `Setor`, "em vez de num quarto organograma". Este módulo não cria
 * cadastro nenhum — ele usa o que existe, e por isso o custo por centro já vem com a unidade
 * orçamentária de graça (o `Setor` pertence a uma).
 *
 * ═══ ⚠️ E NADA AQUI LANÇA NO RAZÃO ═══
 * "Composição rastreável sem lançar novamente a mesma despesa": a despesa foi reconhecida na
 * liquidação. Lançar a apropriação duplicaria a variação patrimonial diminutiva, e o resultado do
 * exercício passaria a contar o mesmo custo duas vezes.
 */

// ═══════════════════════════════════════════════════════════════════════════
// A ARITMÉTICA DO RATEIO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TRUNCA a duas casas — nunca arredonda.
 *
 * ⚠️ MESMA ESCOLHA DO CRONOGRAMA (`programacao-dominio.ts`), e pelo mesmo motivo: arredondar para
 * cima em cada parcela faria a soma ULTRAPASSAR o total, e o resíduo viraria negativo. Truncando,
 * o resíduo é sempre positivo (ou zero) e vai inteiro ao centro declarado.
 */
function truncar2(v: Money): Money {
  return toMoney(v.toDecimalPlaces(2, Decimal.ROUND_DOWN));
}

export interface FatiaDoRateio {
  readonly centroId: string;
  /**
   * ⚠️ `Percentual`, NÃO `Money`. `toMoney` arredonda a duas casas, e um rateio em três partes
   * iguais (33,333333 %) somaria 99,99 e seria recusado por não fechar em 100 — recusado pelo
   * contrato, com uma mensagem que acusaria o usuário. Ver `packages/contracts/percentual.ts`.
   */
  readonly percentual: Percentual;
}

export interface ParteRateada {
  readonly centroId: string;
  readonly valor: Money;
}

/**
 * RATEIA um valor entre centros por percentual, com o RESÍDUO no centro declarado.
 *
 * ⚠️ O RESÍDUO EXISTE SEMPRE QUE A CONTA NÃO FECHA EM CENTAVOS, e ele não é detalhe: 1.000,00 em
 * três centros iguais dá 333,33 três vezes e sobra 0,01. Sem um dono declarado, esse centavo cairia
 * no último da lista — e o relatório de custos passaria a depender da ordem em que o banco devolveu
 * as linhas. Aqui ele vai ao `centroDoResiduo`, que é coluna do critério.
 *
 * ⚠️ E A SOMA FECHA POR CONSTRUÇÃO: `Σ partes == total`, exatamente. É essa igualdade que o serviço
 * confere antes de gravar e que o teste afirma nos dois sentidos.
 */
export function ratearPorPercentual(
  total: Money,
  fatias: readonly FatiaDoRateio[],
  centroDoResiduoId: string
): readonly ParteRateada[] {
  if (fatias.length === 0) {
    throw new Error(
      "RATEIO SEM CENTRO: um critério de rateio precisa de ao menos um centro de custo. Um rateio " +
        "vazio distribuiria o custo para lugar nenhum e ainda assim daria a soma certa."
    );
  }
  if (total.lessThan(0)) {
    throw new Error(
      `RATEIO DE VALOR NEGATIVO (${total.toFixed(2)}): custo negativo não se distribui. O que ` +
        `desfaz uma apropriação é outra apropriação, não um valor invertido.`
    );
  }
  if (!fatias.some((f) => f.centroId === centroDoResiduoId)) {
    throw new Error(
      "O CENTRO DO RESÍDUO NÃO ESTÁ NO RATEIO: o centavo que sobra iria para um centro que não " +
        "recebe parte nenhuma, e a soma do relatório deixaria de fechar com o valor apropriado."
    );
  }

  const partes = fatias.map((f) => ({
    centroId: f.centroId,
    // ⚠️ A DIVISÃO CRUA VAI DIRETO AO TRUNCAMENTO: passar por `toMoney` antes arredondaria
    // (HALF_EVEN) e desfaria o truncamento — a mesma armadilha que o cronograma documenta.
    valor: truncar2(total.times(f.percentual).dividedBy(100) as Money),
  }));

  const somado = partes.reduce((acc, p) => toMoney(acc.plus(p.valor)), toMoney("0.00"));
  const residuo = toMoney(total.minus(somado));

  return partes.map((p) =>
    p.centroId === centroDoResiduoId ? { ...p, valor: toMoney(p.valor.plus(residuo)) } : p
  );
}

/** A soma das partes — a conta que o leitor faria com o dedo, e que o serviço confere. */
export function somaDasPartes(partes: readonly ParteRateada[]): Money {
  return partes.reduce((acc, p) => toMoney(acc.plus(p.valor)), toMoney("0.00"));
}

// ═══════════════════════════════════════════════════════════════════════════
// AS ENTRADAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PUBLICAR uma versão do critério de rateio.
 *
 * ⚠️ A SOMA DOS PERCENTUAIS TEM DE SER 100. Um critério que soma 90 deixaria 10% do custo sem
 * centro — e o relatório fecharia com o valor apropriado, porque o apropriado também seria menor.
 * O erro só apareceria ao comparar o custo total com a despesa, meses depois.
 *
 * ⚠️ E A TOLERÂNCIA É ZERO, não "quase 100". O percentual é `Decimal(9,6)`: 33,333333 três vezes dá
 * 99,999999 e é RECUSADO — quem rateia em três partes iguais escreve 33,333334 num deles, ou usa o
 * centro do resíduo, que existe exatamente para essa sobra em REAIS (não em percentual).
 */
export const zPublicarCriterioDeRateioInput = z
  .object({
    chave: z.string().trim().min(3),
    atoRef: z.string().trim().min(1),
    vigenteDesde: z.coerce.date(),
    centroDoResiduoId: z.string().min(1),
    itens: z
      .array(z.object({ centroId: z.string().min(1), percentual: zPercentualDeRateio }))
      .min(1, "Um critério de rateio precisa de ao menos um centro"),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    const soma = v.itens.reduce((acc, i) => toPercentual(acc.plus(i.percentual)), toPercentual("0"));
    if (!soma.equals(toPercentual("100"))) {
      ctx.addIssue({
        code: "custom",
        path: ["itens"],
        message:
          `A SOMA DOS PERCENTUAIS É ${serializarPercentual(soma)} E TEM DE SER 100: um critério que não fecha ` +
          `deixaria parte do custo sem centro, e o relatório fecharia com o valor apropriado — o ` +
          `erro só apareceria ao comparar o custo com a despesa.`,
      });
    }
    const repetidos = v.itens.length !== new Set(v.itens.map((i) => i.centroId)).size;
    if (repetidos) {
      ctx.addIssue({
        code: "custom",
        path: ["itens"],
        message: "O MESMO CENTRO APARECE DUAS VEZES: some os percentuais numa linha só.",
      });
    }
    if (!v.itens.some((i) => i.centroId === v.centroDoResiduoId)) {
      ctx.addIssue({
        code: "custom",
        path: ["centroDoResiduoId"],
        message:
          "O CENTRO DO RESÍDUO TEM DE RECEBER PARTE: o centavo que sobra iria para um centro fora " +
          "do rateio, e a soma do relatório deixaria de fechar.",
      });
    }
  });
export type PublicarCriterioDeRateioInput = z.input<typeof zPublicarCriterioDeRateioInput>;

/**
 * APROPRIAR o custo de uma liquidação.
 *
 * ⚠️ A COMPETÊNCIA É PRÓPRIA, e a ordem de construção diz o porquê: "custo não é necessariamente o
 * mesmo instante do desembolso". O aluguel liquidado em janeiro pode ser custo de dezembro.
 *
 * ⚠️ O VALOR É OPCIONAL: ausente, apropria-se o LÍQUIDO da liquidação (net de estorno e anulação
 * parcial). Informá-lo permite a apropriação parcial — e o serviço recusa valor acima do líquido.
 */
export const zApropriarCustoInput = z.object({
  liquidacaoId: z.string().min(1),
  criterioChave: z.string().trim().min(1),
  competencia: z.coerce.date(),
  valor: zMoney.refine((v) => v.greaterThan(0), { message: "O valor apropriado tem de ser > 0" }).optional(),
  motivo: z.string().trim().min(10, "O motivo da apropriação precisa de ao menos 10 caracteres"),
  criadoPor: z.string().min(1),
});
export type ApropriarCustoInput = z.input<typeof zApropriarCustoInput>;
