import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";

/**
 * M02b — O DOMÍNIO DA ALTERAÇÃO DA PEÇA (V18/C13). Nada aqui toca banco.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ═══
 * A alteração é um ajuste COM SINAL gravado AO LADO da linha planejada, e a linha original
 * nunca muda. Isso preserva o original — que é o que C13 pede — e cria um problema que a
 * varredura mediu antes de o código existir: **os CHECKs do banco deixam de ser avaliados**.
 * O `INSERT` do item não toca `PrevisaoReceitaPpa` nem `MetaAnualLdo`, então
 * `ck_previsao_receita_ppa_nao_negativa` e `ck_meta_anual_primaria_nao_excede_total` nunca
 * veem o valor que o sistema passa a exibir. Sem cuidado explícito, a tabela nova seria a
 * rota pela qual uma previsão de receita fica negativa e uma receita primária ultrapassa a
 * total — as duas recusadas pelo banco hoje.
 *
 * `violacoesDoAlvo` REIMPÕE cada predicado sobre o valor DERIVADO, e cada mensagem NOMEIA a
 * constraint que espelha. O `CLAUDE.md` diz o princípio: "bloqueio vale por API, por worker e
 * por rota alternativa".
 *
 * ═══ ⚠️ E A ASSIMETRIA DO BANCO É PRESERVADA ═══
 * `resultadoNominal` e as três colunas de PPP NÃO têm CHECK de sinal, deliberadamente:
 * déficit nominal é resultado legítimo e o impacto do saldo das PPPs pode ser negativo.
 * Reimpor positividade nelas inventaria uma regra que o banco recusou de propósito.
 */

// ═══════════════════════════════════════════════════════════════════════════
// O ROL — quatro alvos, treze grandezas
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A LINHA PLANEJADA que um ato pode alterar.
 *
 * ⚠️ QUATRO, E NÃO AS 14 TABELAS COM QUANTIDADE. Medido no schema: 14 models do M02b
 * carregam quantidade, somando 29 colunas `Decimal(18,2)`. Não entram, e o motivo de cada:
 *
 * · `ReceitaAnteriorPpa` — série HISTÓRICA de exercício encerrado. "Alterar o realizado de
 *   2023" não é versão de plano: é corrigir um dado, e correção de dado passado não se faz
 *   por lei de alteração do PPA.
 * · riscos, renúncia, alienação, aplicação, dívida, RPPS e margem (25 das 29 colunas) — são
 *   DECLARAÇÕES dos anexos da LRF, refeitas inteiras quando mudam. Um "acréscimo de 10.000
 *   no risco fiscal" não existe como ato.
 * · meta FÍSICA (`AcaoPpa.metaFisica`, `PrioridadeLdo.meta`) — `Decimal(18,6)` contra o
 *   `Decimal(18,2)` do ajuste. Pendência `ALTERACAO-DE-META-FISICA`.
 *
 * ⚠️ `META_ANUAL_LDO` é anexo e ENTRA MESMO ASSIM — a exceção está dita, não escondida: sem
 * ela a LDO não teria grandeza alterável nenhuma, porque **não existe previsão orçamentária
 * na LDO deste repositório** (não há `PrevisaoReceitaLdo` nem `PrevisaoDespesaLdo`; pendência
 * `LDO-SEM-PREVISAO-ORCAMENTARIA`). Do lado da LDO, o que esta unidade versiona é a META
 * FISCAL, não a dotação — e o catálogo é marcado dizendo isso.
 */
export type AlvoDaAlteracao =
  | "PREVISAO_RECEITA_PPA"
  | "PROGRAMA_PPA"
  | "ACAO_PPA"
  | "META_ANUAL_LDO";

export const ALVOS_DA_ALTERACAO: readonly AlvoDaAlteracao[] = [
  "PREVISAO_RECEITA_PPA",
  "PROGRAMA_PPA",
  "ACAO_PPA",
  "META_ANUAL_LDO",
];

/** A qual peça cada alvo pertence — o ato de uma peça não alcança a linha da outra. */
export const PECA_DO_ALVO: Readonly<Record<AlvoDaAlteracao, "PPA" | "LDO">> = {
  PREVISAO_RECEITA_PPA: "PPA",
  PROGRAMA_PPA: "PPA",
  ACAO_PPA: "PPA",
  META_ANUAL_LDO: "LDO",
};

/**
 * O MODELO DO PRISMA e a COLUNA DE LIGAÇÃO de cada alvo.
 *
 * ⚠️ ELE EXISTE PARA SER MEDIDO. `m02b-alteracao.test.ts` percorre este Record contra o DMMF
 * do Prisma e confere que cada modelo existe, que cada grandeza é campo DELE e que o tipo é
 * `Decimal`. Um rol que só se confere contra a própria cópia passa com qualquer nome errado
 * escrito de forma consistente — a regra da casa sobre parser conferido contra implementação
 * independente vale para rol também.
 */
export const MODELO_DO_ALVO: Readonly<
  Record<AlvoDaAlteracao, { readonly modelo: string; readonly fk: string }>
> = {
  PREVISAO_RECEITA_PPA: { modelo: "PrevisaoReceitaPpa", fk: "previsaoReceitaPpaId" },
  PROGRAMA_PPA: { modelo: "ProgramaPpa", fk: "programaPpaId" },
  ACAO_PPA: { modelo: "AcaoPpa", fk: "acaoPpaId" },
  META_ANUAL_LDO: { modelo: "MetaAnualLdo", fk: "metaAnualLdoId" },
};

/**
 * AS GRANDEZAS DE CADA ALVO — pelo nome que a coluna tem no schema.
 *
 * ⚠️ O CHECK `ck_alteracao_valor_alvo_e_grandeza` repete este rol em SQL, e a repetição é
 * deliberada: o banco tem de barrar o `INSERT` direto, que dribla o serviço (script de
 * migração, correção manual, seed apressado). O teste do DMMF garante que as duas cópias e o
 * schema dizem a mesma coisa.
 */
export const GRANDEZAS_DO_ALVO: Readonly<Record<AlvoDaAlteracao, readonly string[]>> = {
  PREVISAO_RECEITA_PPA: ["valor"],
  PROGRAMA_PPA: ["valorPrevisto"],
  ACAO_PPA: ["metaFinanceira"],
  META_ANUAL_LDO: [
    "receitaTotal",
    "receitaPrimaria",
    "despesaTotal",
    "despesaPrimaria",
    "resultadoNominal",
    "dividaPublicaConsolidada",
    "dividaConsolidadaLiquida",
    "receitaPrimariaPpp",
    "despesaPrimariaPpp",
    "impactoSaldoPpp",
  ],
};

/**
 * O NOME DE CADA GRANDEZA EM PORTUGUÊS.
 *
 * ⚠️ ELE MORA AQUI, JUNTO DO ROL, e não na camada de tela: as mensagens de RECUSA também precisam
 * dele. "receitaPrimaria ficaria 10.500.000,00" é o nome da coluna do banco vazando para um
 * servidor municipal; "Receita primária ficaria 10.500.000,00" é a frase que ele lê. Um teste
 * confere que nenhuma grandeza do rol ficou sem rótulo.
 */
export const ROTULO_DA_GRANDEZA: Readonly<Record<string, string>> = {
  valor: "Previsão de receita",
  valorPrevisto: "Valor previsto do programa",
  metaFinanceira: "Meta financeira da ação",
  receitaTotal: "Receita total",
  receitaPrimaria: "Receita primária",
  despesaTotal: "Despesa total",
  despesaPrimaria: "Despesa primária",
  resultadoNominal: "Resultado nominal",
  dividaPublicaConsolidada: "Dívida pública consolidada",
  dividaConsolidadaLiquida: "Dívida consolidada líquida",
  receitaPrimariaPpp: "Receita primária de parcerias",
  despesaPrimariaPpp: "Despesa primária de parcerias",
  impactoSaldoPpp: "Impacto no saldo das parcerias",
};

export function rotuloDaGrandeza(g: string): string {
  return ROTULO_DA_GRANDEZA[g] ?? g;
}

export function grandezaPertenceAoAlvo(alvo: AlvoDaAlteracao, grandeza: string): boolean {
  return GRANDEZAS_DO_ALVO[alvo].includes(grandeza);
}

// ═══════════════════════════════════════════════════════════════════════════
// O VALOR VIGENTE — derivação, nunca coluna
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O VALOR VIGENTE = o original mais a soma dos ajustes.
 *
 * ⚠️ NÃO EXISTE COLUNA `valorAtual`, e a ausência é a decisão do modelo: ela seria cache de
 * dinheiro — o bug que o M11 nomeou e que este módulo já recusou três vezes (sem `vigente` no
 * PPA, sem `situacao` na LDO, sem `resultadoPrimario` gravado). No dia em que alguém gravasse
 * um ajuste e esquecesse o cache, a peça passaria a declarar um valor que os próprios atos
 * dela desmentem.
 */
export function valorVigente(original: Money, ajustes: readonly Money[]): Money {
  return ajustes.reduce((acc, a) => toMoney(acc.plus(a)), original);
}

// ═══════════════════════════════════════════════════════════════════════════
// OS PREDICADOS REIMPOSTOS — um por CHECK que o delta desligaria
// ═══════════════════════════════════════════════════════════════════════════

/** A linha DERIVADA: grandeza -> valor vigente. Só as grandezas do alvo aparecem. */
export type LinhaVigente = Readonly<Record<string, Money>>;

function exigirNaoNegativas(
  vigente: LinhaVigente,
  colunas: readonly string[],
  constraint: string
): readonly string[] {
  const ruins: string[] = [];
  for (const c of colunas) {
    const v = vigente[c];
    if (v !== undefined && v.isNegative()) {
      ruins.push(
        `${rotuloDaGrandeza(c)} ficaria ${v.toFixed(2)}, e valor negativo é recusado na linha ` +
          `aprovada (${constraint}). O ajuste não foi gravado.`
      );
    }
  }
  return ruins;
}

/**
 * O QUE O BANCO RECUSARIA SE O VALOR DERIVADO FOSSE GRAVADO NA LINHA.
 *
 * Devolve a lista de violações — vazia quando o valor vigente é aceitável. Cada mensagem
 * nomeia a constraint que o predicado espelha, porque quem lê o erro precisa saber que a
 * regra não foi inventada aqui: ela já valia para o `INSERT` da linha original.
 *
 * ⚠️ A `MetaAnualLdo` É A ÚNICA QUE CRUZA DUAS COLUNAS (`receitaPrimaria <= receitaTotal`), e
 * é por isso que este guard recebe a linha vigente INTEIRA e não um valor só: um ato que
 * acrescente 100 na primária e 100 na total é legítimo, e um que acrescente 100 só na
 * primária pode não ser. Avaliar ajuste por ajuste recusaria o primeiro caso e aceitaria o
 * segundo — exatamente invertido.
 */
export function violacoesDoAlvo(alvo: AlvoDaAlteracao, vigente: LinhaVigente): readonly string[] {
  switch (alvo) {
    case "PREVISAO_RECEITA_PPA":
      return exigirNaoNegativas(vigente, ["valor"], "ck_previsao_receita_ppa_nao_negativa");

    case "PROGRAMA_PPA":
      return exigirNaoNegativas(
        vigente,
        ["valorPrevisto"],
        "ck_programa_ppa_valor_nao_negativo"
      );

    // ⚠️ A `metaFisica` do CHECK original não entra: ela não é alterável por esta rota, então
    // reimpor o predicado dela aqui seria checar um valor que ninguém mexeu.
    case "ACAO_PPA":
      return exigirNaoNegativas(
        vigente,
        ["metaFinanceira"],
        "ck_acao_ppa_metas_nao_negativas"
      );

    case "META_ANUAL_LDO": {
      const ruins = [
        ...exigirNaoNegativas(
          vigente,
          [
            "receitaTotal",
            "receitaPrimaria",
            "despesaTotal",
            "despesaPrimaria",
            "dividaPublicaConsolidada",
            "dividaConsolidadaLiquida",
          ],
          "ck_meta_anual_valores_nao_negativos"
        ),
      ];
      // ⚠️ AS DUAS DESIGUALDADES DO `ck_meta_anual_primaria_nao_excede_total`. A receita
      // primária é a total menos as financeiras (operações de crédito, alienações,
      // rendimentos): ela é MENOR OU IGUAL à total por construção, e uma primária maior é
      // sinal de colunas trocadas — o erro que o CHECK original pega.
      const par = (p: string, t: string): void => {
        const primaria = vigente[p];
        const total = vigente[t];
        if (primaria !== undefined && total !== undefined && primaria.greaterThan(total)) {
          ruins.push(
            `${rotuloDaGrandeza(p)} ficaria ${primaria.toFixed(2)} e ${rotuloDaGrandeza(t)} ` +
              `ficaria ${total.toFixed(2)}: a primária não pode exceder a total ` +
              `(ck_meta_anual_primaria_nao_excede_total). Se a alteração mexe nas duas, o ato ` +
              `tem de trazer os dois itens.`
          );
        }
      };
      par("receitaPrimaria", "receitaTotal");
      par("despesaPrimaria", "despesaTotal");
      return ruins;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AS ENTRADAS
// ═══════════════════════════════════════════════════════════════════════════

const zAno = z.number().int().min(1900).max(2200);

/**
 * UM ITEM DO ATO.
 *
 * ⚠️ O AJUSTE NÃO PODE SER ZERO. Ele apareceria no comparativo, somaria nada e faria quem lê
 * procurar a diferença que não existe. O CHECK `ck_alteracao_valor_ajuste_nao_zero` diz o
 * mesmo ao `INSERT` direto; aqui a mensagem é a que o operador lê.
 *
 * ⚠️ `alvo` + `alvoId` NA ENTRADA, FK TIPADA NO BANCO. O formulário e a ação do servidor
 * falam de um alvo escolhido num select; a tabela guarda a coluna certa, com integridade
 * referencial. Traduzir no adapter é o que permite as duas coisas.
 */
export const zItemDeAlteracaoInput = z
  .object({
    alvo: z.enum(["PREVISAO_RECEITA_PPA", "PROGRAMA_PPA", "ACAO_PPA", "META_ANUAL_LDO"]),
    alvoId: z.string().min(1),
    grandeza: z.string().trim().min(1),
    valorAjuste: zMoney,
    justificativa: z.string().trim().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.valorAjuste.isZero()) {
      ctx.addIssue({
        code: "custom",
        path: ["valorAjuste"],
        message:
          "AJUSTE ZERO NÃO É ALTERAÇÃO: o item apareceria no comparativo e não mudaria " +
          "nada. Use sinal negativo para reduzir.",
      });
    }
    if (!grandezaPertenceAoAlvo(v.alvo, v.grandeza)) {
      ctx.addIssue({
        code: "custom",
        path: ["grandeza"],
        message:
          `GRANDEZA FORA DO ALVO: "${v.grandeza}" não é coluna de ${v.alvo}. As dele são: ` +
          `${GRANDEZAS_DO_ALVO[v.alvo].join(", ")}.`,
      });
    }
  });
export type ItemDeAlteracaoInput = z.input<typeof zItemDeAlteracaoInput>;

/**
 * O ATO INTEIRO, COM SEUS ITENS.
 *
 * ⚠️ PELO MENOS UM ITEM (`.min(1)`), e a exigência não é formalidade: um ato sem item é uma
 * lei que altera nada — ela apareceria na consulta cronológica, o operador procuraria o valor
 * que mudou e não haveria nenhum. Para acrescentar mais itens depois (a mesma lei mexendo em
 * várias dotações, TR 5.9.3.16) existe `acrescentarItemAoAtoDeAlteracao`.
 *
 * ⚠️ TODOS OS ITENS TÊM DE SER DA MESMA PEÇA DO ATO. A verificação de que o `alvoId` pertence
 * àquela peça específica cruza tabelas e vive no serviço; aqui se barra o que é decidível sem
 * banco: o TIPO do alvo é do PPA ou da LDO.
 */
export const zRegistrarAtoDeAlteracaoInput = z
  .object({
    peca: z.enum(["PPA", "LDO"]),
    pecaId: z.string().min(1),
    numero: z.string().trim().min(1),
    ano: zAno,
    data: z.coerce.date(),
    dataPublicacao: z.coerce.date(),
    fundamento: z.string().trim().min(3),
    itens: z.array(zItemDeAlteracaoInput).min(1),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.dataPublicacao < v.data) {
      ctx.addIssue({
        code: "custom",
        path: ["dataPublicacao"],
        message:
          "PUBLICAÇÃO ANTES DO ATO: a data de publicação não pode anteceder a do ato — é " +
          "erro de digitação que nenhum relatório detecta sozinho.",
      });
    }
    v.itens.forEach((i, n) => {
      if (PECA_DO_ALVO[i.alvo] !== v.peca) {
        ctx.addIssue({
          code: "custom",
          path: ["itens", n, "alvo"],
          message:
            `ALVO DE OUTRA PEÇA: ${i.alvo} é do ${PECA_DO_ALVO[i.alvo]} e o ato é do ` +
            `${v.peca}. Um ato só altera a peça que ele nomeia.`,
        });
      }
    });
  });
export type RegistrarAtoDeAlteracaoInput = z.input<typeof zRegistrarAtoDeAlteracaoInput>;

/** ACRESCENTAR UM ITEM a um ato já registrado — a mesma lei mexendo em mais uma linha. */
export const zAcrescentarItemAoAtoInput = z.object({
  atoId: z.string().min(1),
  item: zItemDeAlteracaoInput,
  criadoPor: z.string().min(1),
});
export type AcrescentarItemAoAtoInput = z.input<typeof zAcrescentarItemAoAtoInput>;
