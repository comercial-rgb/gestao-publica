import { z } from "zod";
import { zMoney } from "../../packages/contracts/index.js";
import {
  ELEMENTOS,
  type ElementoOficial,
} from "../../prisma/seed/dados/elementos.js";

/**
 * DOMAIN do M02 — SEM I/O. Valida a FORMA da ficha orçamentária e da receita
 * prevista. A existência dos componentes no banco (fail-closed) é do serviço,
 * que tem as ports.
 *
 * Os componentes chegam por CÓDIGO (não por id) — mesma convenção do M01, onde
 * a conta chega pelo código PCASP.
 */

/** Dinheiro que não pode ser negativo (valor dotado, valor previsto). */
const zValorNaoNegativo = zMoney.refine((v) => v.greaterThanOrEqualTo(0), {
  message: "Valor não pode ser negativo",
});

/** 1 = exercício atual, 2 = exercício anterior (exercicioFonteRecurso SAGRES). */
const zExercicioFonte = z.union([z.literal(1), z.literal(2)]).default(1);

const zExercicio = z.number().int().min(1900).max(2999);

export const zTipoAcao = z.enum(["PROJETO", "ATIVIDADE", "OPERACAO_ESPECIAL"]);
export const zTipoReceita = z.enum([
  "ORCAMENTARIA",
  "INTRA_ORCAMENTARIA",
  "DEDUCAO",
]);

export type TipoReceitaPrevista = z.infer<typeof zTipoReceita>;

/**
 * ⚠️ O SINAL DA PREVISÃO — E ELE MUDOU DE CASA, PELO MESMO MOTIVO DE SEMPRE.
 *
 * DEDUÇÃO SUBTRAI. A previsão de uma natureza é LÍQUIDA das suas deduções (o caso
 * clássico do FUNDEB: prevê-se a receita e deduz-se a parcela transferida). Somar a
 * dedução como se fosse previsão infla a receita prevista do ente — e quem compara
 * arrecadado CONTRA previsto (o excesso de arrecadação, TR 4.37) passaria a achar
 * excesso onde não há, ou a escondê-lo.
 *
 * Ele nasceu no M12 (Anexo 10), mas o dono da `ReceitaPrevista` é o M02 — e agora o
 * M03 precisa do previsto por fonte para amarrar o excesso de arrecadação. Deixá-lo
 * no M12 obrigaria o módulo de créditos a importar os RELATÓRIOS. É a terceira vez
 * que esta mudança acontece (`SINAL_RECEITA_REALIZADA` e `CATEGORIAS_RECEITA` foram
 * para o M04 pelo mesmo caminho): a tabela é UMA só; o que muda é o endereço. O M12
 * REEXPORTA, e nenhum chamador precisou mudar.
 */
export const SINAL_PREVISAO: Record<TipoReceitaPrevista, 1 | -1> = {
  ORCAMENTARIA: 1,
  INTRA_ORCAMENTARIA: 1,
  DEDUCAO: -1,
};

/** Extrai o código do órgão a partir do da UO: UO = ÓÓUUU. */
export function orgaoDaUnidade(codigoUnidade: string): string {
  return codigoUnidade.slice(0, 2);
}

/**
 * Componentes da classificação, por código. TODOS obrigatórios exceto `co` —
 * nem toda ficha tem Código de Acompanhamento (INVARIANTE 5: faltar qualquer
 * outro = rejeitar).
 *
 * O invariante ÓRGÃO = PREFIXO DA UO é aplicado aqui, no Zod: ele é derivável
 * só dos códigos de entrada, então rejeita ANTES de qualquer I/O (fail-closed
 * na borda). A checagem de "a UO pertence mesmo a este órgão no banco" é outra
 * coisa e continua no serviço — as duas são complementares: esta pega código
 * incoerente, aquela pega banco incoerente.
 */
export const zComponentesClassificacao = z
  .object({
    orgao: z.string().length(2, "Código do órgão tem 2 dígitos"),
    unidadeOrc: z.string().length(5, "UO do SAGRES-PB tem 5 dígitos"),
    funcao: z.string().length(2, "Função (STN 42/99) tem 2 dígitos"),
    subfuncao: z.string().length(3, "Subfunção (STN 42/99) tem 3 dígitos"),
    programa: z.string().length(4, "Programa tem 4 dígitos"),
    acao: z.string().length(4, "Ação tem 4 dígitos"),
    naturezaDespesa: z
      .string()
      .length(6, "Natureza da despesa tem 6 dígitos (cat+nat+mod+elem)"),
    fonte: z.string().length(3, "Fonte de recurso tem 3 dígitos"),
    co: z.string().length(4, "CO tem 4 dígitos").optional(),
  })
  .superRefine((c, ctx) => {
    const esperado = orgaoDaUnidade(c.unidadeOrc);
    if (c.orgao !== esperado) {
      ctx.addIssue({
        code: "custom",
        path: ["orgao"],
        message:
          `Órgão "${c.orgao}" não é o prefixo da UO "${c.unidadeOrc}": no ` +
          `padrão brasileiro a UO é ÓÓUUU, então o órgão tem de ser ` +
          `"${esperado}".`,
      });
    }
  });

/**
 * ⚠️ `criadoPor` ENTROU AQUI NO ROLLOUT DA AUTORIZAÇÃO — E ELE NÃO É PERSISTIDO.
 *
 * A `FichaOrcamentaria` não tem coluna de autor (nem a `ReceitaPrevista`), e este bloco NÃO
 * inventou uma: mexer no schema para carimbar autor em dado de LOA é outra decisão, e ela não
 * foi pedida. O `criadoPor` existe aqui por UM motivo, e ele basta — **não se pergunta "ele
 * pode?" sem saber QUEM é "ele"**. Os dois serviços eram, até agora, os únicos atos do sistema
 * que ninguém assinava: qualquer um criava a dotação da cidade inteira e a auditoria não tinha
 * a quem perguntar.
 *
 * PENDÊNCIA NOMEADA (autor-da-LOA): persistir o autor da ficha exige coluna + migração.
 */
export const zCriarFichaInput = z.object({
  exercicio: zExercicio,
  numero: z.number().int().positive("Número da ficha deve ser > 0"),
  classificacao: zComponentesClassificacao,
  exercicioFonte: zExercicioFonte,
  /** Valor FIXADO pela LOA. Saldo/reserva/empenhado são M05. */
  valorDotado: zValorNaoNegativo,
  criadoPor: z.string().min(1),
});

export const zCriarReceitaPrevistaInput = z.object({
  exercicio: zExercicio,
  /** Código de receita STN — 8 dígitos. */
  naturezaReceita: z.string().length(8, "Natureza da receita tem 8 dígitos"),
  fonte: z.string().length(3, "Fonte de recurso tem 3 dígitos"),
  exercicioFonte: zExercicioFonte,
  tipoReceita: zTipoReceita,
  valorPrevisto: zValorNaoNegativo,
  criadoPor: z.string().min(1),
});

export type CriarFichaInput = z.input<typeof zCriarFichaInput>;
export type CriarFichaDados = z.output<typeof zCriarFichaInput>;
export type CriarReceitaPrevistaInput = z.input<
  typeof zCriarReceitaPrevistaInput
>;
export type CriarReceitaPrevistaDados = z.output<
  typeof zCriarReceitaPrevistaInput
>;

/**
 * Compõe a ficha: valida a forma e devolve os dados normalizados.
 * FAIL-CLOSED — lança se faltar componente obrigatório ou se o valor for
 * negativo. Sem I/O: dá para exercitar a ficha inteira sem banco.
 */
export function comporFicha(input: CriarFichaInput): CriarFichaDados {
  return zCriarFichaInput.parse(input);
}

export function comporReceitaPrevista(
  input: CriarReceitaPrevistaInput
): CriarReceitaPrevistaDados {
  return zCriarReceitaPrevistaInput.parse(input);
}

/** REPREVISÃO (reestimativa) — o ajuste tem SINAL (+ aumenta, − reduz), e ≠ 0 (ajuste nulo é ruído). */
export const zReprevisarReceitaInput = z.object({
  exercicio: zExercicio,
  naturezaReceita: z.string().length(8, "Natureza da receita tem 8 dígitos"),
  fonte: z.string().length(3, "Fonte de recurso tem 3 dígitos"),
  tipoReceita: zTipoReceita,
  valorAjuste: zMoney.refine((v) => !v.isZero(), { message: "O ajuste de reprevisão não pode ser zero" }),
  motivo: z.string().trim().min(5, "O motivo da reprevisão precisa de ao menos 5 caracteres"),
  data: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type ReprevisarReceitaInput = z.input<typeof zReprevisarReceitaInput>;
export function comporReprevisao(input: ReprevisarReceitaInput): z.output<typeof zReprevisarReceitaInput> {
  return zReprevisarReceitaInput.parse(input);
}

/**
 * ⚠️ O ELEMENTO NÃO SE DERIVA DE DÍGITOS — ELE É UM COMPONENTE, E JÁ ESTÁ NA COLUNA.
 *
 * `NaturezaDespesa.codElemento` é campo próprio (5º e 6º dígitos do código de 6), e o
 * `conferirCodigoNaturezaDespesa` abaixo já garante que ele não diverge do
 * `codigoCompleto`. Escrever um `codigo.slice(4, 6)` em qualquer módulo seria criar uma
 * SEGUNDA maneira de responder à mesma pergunta — e a fatia erraria no dia em que
 * alguém guardasse o código pontuado.
 *
 * O que NÃO existia, e nasce aqui, é a conferência contra o ROL OFICIAL: nada impedia
 * uma `NaturezaDespesa` de nascer com um elemento que a Portaria 163 não emite. Quem
 * decide sobre um elemento (o almoxarifado, no M10; o beneficiário, no M13) precisa
 * saber que ele EXISTE antes de decidir — senão o Record fechado responde "não conheço"
 * para um código que ninguém escreveu, e isso vira um bug com cara de regra.
 *
 * O rol é `prisma/seed/dados/elementos.ts` — 78 elementos, Anexo II da Portaria 163/2001.
 */
export function exigirElementoOficial(codElemento: string): ElementoOficial {
  const e = ELEMENTOS.find((x) => x.codigo === codElemento);
  if (e === undefined) {
    throw new Error(
      `Elemento de despesa "${codElemento}" não existe no rol oficial (Anexo II da ` +
        `Portaria Interministerial STN/SOF 163/2001, ${ELEMENTOS.length} elementos). ` +
        `Uma natureza com elemento inventado passa despercebida até o TCE rejeitar o ` +
        `arquivo — e todo guard que decide POR elemento estaria decidindo no escuro.`
    );
  }
  return e;
}

/**
 * A natureza da despesa é 4 COMPONENTES; `codigoCompleto` é a concatenação.
 * Verifica que um não diverge do outro — se divergirem, todo export para o
 * SAGRES sai errado e ninguém percebe até o TCE rejeitar.
 */
export function conferirCodigoNaturezaDespesa(n: {
  readonly codCategoria: string;
  readonly codNatureza: string;
  readonly codModalidade: string;
  readonly codElemento: string;
  readonly codigoCompleto: string;
}): void {
  const esperado =
    n.codCategoria + n.codNatureza + n.codModalidade + n.codElemento;
  if (esperado !== n.codigoCompleto) {
    throw new Error(
      `Natureza da despesa incoerente: componentes formam "${esperado}", ` +
        `mas codigoCompleto é "${n.codigoCompleto}".`
    );
  }
}
