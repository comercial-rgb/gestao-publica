import { z } from "zod";
import { sumMoney, toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
// A regra de LEITURA mora no arquivo avulso, que o M01 também importa — ver o cabeçalho dele.
export {
  parcelasDaGuia,
  type GuiaParaParcelas,
  type ParcelaDeFonte,
} from "./parcelas-por-fonte.js";
import {
  CONTA_CONTROLE_DDR_POR_NATUREZA,
  type NaturezaDaFonteDdr,
} from "../m01-core-contabil/roteiros.js";

/**
 * A DISTRIBUIÇÃO DA ARRECADAÇÃO ENTRE FONTES — o lado da ESCRITA, domínio puro (V16/C30).
 *
 * A forma que a tela envia, a natureza da fonte de cada parcela e a consolidação por natureza
 * que a classe 7 do lançamento consome.
 *
 * ⚠️ A REGRA DE **LEITURA** (quanto de uma guia é de cada fonte) NÃO MORA AQUI: ela está em
 * `parcelas-por-fonte.ts`, reexportada acima, porque o M01 também precisa dela e este arquivo
 * importa o M01 — ver o cabeçalho de lá, que explica a aresta e por que ela não fecha ciclo.
 */

// ----------------------------------------------------------------------------
// A ESCRITA — a forma da distribuição que a tela envia.
// ----------------------------------------------------------------------------

/**
 * O rol das naturezas de fonte, tirado do MAPA do M01 — não redigitado.
 *
 * ⚠️ `Object.keys` DO RECORD, e não cinco literais repetidos aqui: o dia em que o PCASP
 * particionar `7.2.1.1` em seis, a sexta entra por um lugar só. Uma cópia do rol seria a garantia
 * de que a natureza nova é aceita pelo roteiro e recusada pelo formulário, ou o contrário.
 */
const NATUREZAS_DA_FONTE = Object.keys(CONTA_CONTROLE_DDR_POR_NATUREZA) as [
  NaturezaDaFonteDdr,
  ...NaturezaDaFonteDdr[],
];

export const zNaturezaDaFonte = z.enum(NATUREZAS_DA_FONTE);

export const zParcelaDaDistribuicao = z.object({
  /** Código da fonte de recurso — 3 dígitos, como em toda a cadeia. */
  fonte: z.string().length(3, "Fonte de recurso tem 3 dígitos"),
  exercicioFonte: z.union([z.literal(1), z.literal(2)]).default(1),
  /**
   * A natureza DA FONTE, declarada pelo ente (`DeParaFonteNaturezaDdr`, fail-closed e
   * versionada) e resolvida por quem chama — é ela que escolhe a conta de classe 7 da parcela.
   *
   * ⚠️ ELA NÃO É ESCOLHA DO FORMULÁRIO. Vem do cadastro; a tela nunca a oferece. Está aqui
   * porque o serviço CONFERE que o roteiro recebido reparte a classe 7 na mesma partição que as
   * parcelas declaram — sem isso, roteiro e parcelas poderiam somar o mesmo total repartido de
   * dois jeitos diferentes, e a DDR sairia carimbada numa natureza que a parcela não diz.
   */
  naturezaDaFonte: zNaturezaDaFonte,
  valor: zMoney.refine((v) => v.greaterThan(0), {
    message: "Valor da parcela deve ser > 0",
  }),
  /**
   * Por que esta receita entrou numa fonte que a LOA não prevê para a natureza. Exigido só
   * nesse caso — pelo domínio, pela autorização nomeada e pelo CHECK do banco.
   */
  fundamento: z.string().trim().min(10, "O motivo precisa dizer por quê (mínimo 10 caracteres)").optional(),
});

export type ParcelaDaDistribuicaoInput = z.input<typeof zParcelaDaDistribuicao>;
export type ParcelaDaDistribuicao = z.output<typeof zParcelaDaDistribuicao>;

/**
 * A FORMA DA DISTRIBUIÇÃO. Uma parcela já é distribuição válida (N=1): o caminho distribuído
 * serve a guia de uma fonte também, e é bom que sirva — é o mesmo ato, com uma parcela.
 *
 * ⚠️ A MESMA FONTE NÃO ENTRA DUAS VEZES, e a recusa a NOMEIA. Duas parcelas da fonte 500 na
 * mesma guia são uma só; mantê-las separadas faria a soma por fonte depender da ordem de leitura
 * — e o índice único do banco recusaria depois, com mensagem de banco.
 */
export const zDistribuicaoDaArrecadacao = z
  .array(zParcelaDaDistribuicao)
  .min(1, "A guia distribuída precisa de ao menos uma parcela de fonte")
  .superRefine((parcelas, ctx) => {
    const vistas = new Set<string>();
    for (const p of parcelas) {
      const chave = `${p.fonte}|${p.exercicioFonte}`;
      if (vistas.has(chave)) {
        ctx.addIssue({
          code: "custom",
          message:
            `A fonte ${p.fonte} (exercício ${p.exercicioFonte}) aparece mais de uma vez na ` +
            `distribuição. Some as duas parcelas numa só.`,
        });
        return;
      }
      vistas.add(chave);
    }
  });

/**
 * Σ das parcelas — e a recusa DIZ os dois números.
 *
 * ⚠️ ELA NÃO É A ÚNICA BARREIRA, E NÃO PRETENDE SER. Quem garante a conservação na escrita é o
 * motor de partidas dobradas. Esta conferência existe para que a recusa chegue ao operador
 * falando de PARCELA E TOTAL, e não como "desbalanceado no subsistema CONTROLE" — que é verdade
 * e não ajuda ninguém a corrigir um formulário.
 */
export function exigirSomaDasParcelas(
  total: Money,
  parcelas: readonly { readonly valor: Money }[]
): void {
  const soma = sumMoney(parcelas.map((p) => p.valor));
  if (!soma.equals(total)) {
    throw new Error(
      `AS PARCELAS NÃO SOMAM O TOTAL DA GUIA: as ${parcelas.length} parcelas somam ` +
        `${soma.toFixed(2)} e a guia é de ${total.toFixed(2)} ` +
        `(${soma.greaterThan(total) ? "sobra" : "falta"} ${soma.minus(total).abs().toFixed(2)}). ` +
        `Dinheiro que entrou tem de estar todo distribuído entre as fontes. Nada foi gravado.`
    );
  }
}

/**
 * CONSOLIDA AS PARCELAS POR NATUREZA DA FONTE — o que a classe 7 precisa.
 *
 * ⚠️ POR QUE CONSOLIDAR. O PCASP particiona `7.2.1.1` por NATUREZA (ordinários, vinculados,
 * extraorçamentários, compensação financeira, outros), não por fonte. Duas fontes vinculadas na
 * mesma guia debitam a MESMA conta — emitir duas pernas idênticas deixaria no razão duas linhas
 * indistinguíveis, e o detalhe por fonte já está na distribuição da guia, que é onde ele é
 * legível.
 *
 * A ordem é a da PRIMEIRA aparição: estável, e a mesma que o operador digitou.
 */
export function consolidarPorNatureza<T extends { readonly valor: Money }>(
  parcelas: readonly T[],
  naturezaDa: (parcela: T) => NaturezaDaFonteDdr
): readonly { readonly natureza: NaturezaDaFonteDdr; readonly valor: Money }[] {
  const ordem: NaturezaDaFonteDdr[] = [];
  const por = new Map<NaturezaDaFonteDdr, Money>();
  for (const p of parcelas) {
    const n = naturezaDa(p);
    const antes = por.get(n);
    if (antes === undefined) ordem.push(n);
    por.set(n, antes === undefined ? p.valor : toMoney(antes.plus(p.valor)));
  }
  return ordem.map((natureza) => ({ natureza, valor: por.get(natureza)! }));
}
