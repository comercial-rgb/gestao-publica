import { z } from "zod";
import { zMoney, type Money } from "../../packages/contracts/index.js";
import { anoCivil, diaCivil } from "../../packages/datas/index.js";
import {
  validarLancamento,
  type Partida,
  type Subsistema,
  type TipoPartida,
} from "../../packages/ledger/index.js";

/**
 * DOMAIN do M04 — SEM I/O.
 *
 * Valida a forma da arrecadação e COMPÕE as partidas contábeis, submetendo-as
 * ao motor puro (`validarLancamento`) ANTES de qualquer acesso a banco.
 * FAIL-CLOSED: lançamento desbalanceado nunca chega à persistência.
 */

// ----------------------------------------------------------------------------
// ROTEIRO CONTÁBIL — o embrião da Matriz de Eventos (TR 5.91).
//
// Nenhuma conta é hardcoded aqui. O roteiro chega de fora (config/seed), com os
// códigos PCASP e o papel de cada perna. Quando a Matriz existir, ela passará a
// ser a fonte destes roteiros — a assinatura já comporta isso.
// ----------------------------------------------------------------------------

export interface PernaRoteiro {
  /** Código hierárquico PCASP. */
  readonly conta: string;
  readonly tipo: TipoPartida;
  readonly subsistema: Subsistema;
}

export type RoteiroContabil = readonly PernaRoteiro[];

/**
 * Roteiro padrão da ARRECADAÇÃO de receita orçamentária, montado a partir dos
 * papéis das contas — não dos códigos. Quem passa os códigos é o chamador.
 *
 * PATRIMONIAL:  D disponibilidade      /  C variação patrimonial aumentativa
 * ORÇAMENTÁRIO: D receita a realizar    /  C receita realizada
 *
 * Cada subsistema fecha sozinho — é o que `validarLancamento` exige.
 */
export interface ContasArrecadacao {
  /** Caixa/banco que recebeu o dinheiro. */
  readonly disponibilidade: string;
  /** VPA — a receita sob a ótica patrimonial. */
  readonly variacaoAumentativa: string;
  /** Controle orçamentário: baixa da previsão. */
  readonly receitaARealizar: string;
  /** Controle orçamentário: registro da realização. */
  readonly receitaRealizada: string;
}

export function roteiroArrecadacao(c: ContasArrecadacao): RoteiroContabil {
  return [
    { conta: c.disponibilidade, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: c.variacaoAumentativa, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    { conta: c.receitaARealizar, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    { conta: c.receitaRealizada, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },
  ];
}

/**
 * Aplica o valor a cada perna do roteiro e submete ao motor puro.
 * FAIL-CLOSED: se o roteiro não fechar (ΣDÉBITO != ΣCRÉDITO em qualquer
 * subsistema, ou faltar débito/crédito), lança — nada é persistido.
 */
export function comporPartidas(
  valor: Money,
  roteiro: RoteiroContabil
): readonly Partida[] {
  return validarLancamento(
    roteiro.map((p) => ({
      conta: p.conta,
      tipo: p.tipo,
      subsistema: p.subsistema,
      valor,
    }))
  );
}

// ----------------------------------------------------------------------------
// Entrada
// ----------------------------------------------------------------------------

export const zTipoLancamentoReceita = z.enum([
  "ARRECADACAO",
  "ANULACAO",
  "RETIFICACAO",
]);

export type TipoLancamentoReceita = z.infer<typeof zTipoLancamentoReceita>;

/**
 * A CLASSIFICAÇÃO DA NATUREZA DA RECEITA mora em `natureza.ts` — categoria, ORIGEM
 * (2º dígito) e TIPO (8º). O `dominio.ts` reexporta para não quebrar quem já
 * importava daqui; a tabela é UMA só.
 *
 * ⚠️ `CATEGORIAS_DE_CAPITAL` e `ehReceitaDeCapital` MORRERAM AQUI. Eles existiam
 * por um motivo e um só: o guard da operação de crédito (TR 4.64) não tinha como
 * exigir a ORIGEM, e se contentava com a CATEGORIA. Agora tem — e um classificador
 * que só servia de muleta para um guard degradado não sobrevive ao fim da
 * degradação. A arqueologia está no comentário do próprio guard (`divida.ts`).
 */
export {
  CATEGORIAS_RECEITA,
  ORIGEM_RECEITA,
  TIPO_RECEITA,
  TIPOS_QUE_QUITAM_DIVIDA_ATIVA,
  categoriaDaReceita,
  ehIntraorcamentaria,
  origemDaNatureza,
  parsearNaturezaReceita,
  tipoDaNatureza,
} from "./natureza.js";
export type {
  CategoriaBase,
  CategoriaReceita,
  ChaveOrigem,
  DigitoTipo,
  NaturezaReceitaDecomposta,
  OrigemReceita,
  TipoNaturezaReceita,
} from "./natureza.js";

/**
 * ⚠️ O SINAL DE CADA LANÇAMENTO DE RECEITA — FONTE ÚNICA, E ELA MORA AQUI.
 *
 * Nasceu no M12 (Anexo 12), mas o dono do fato é quem sabe o que ele faz com o
 * total: o M04 é quem emite ARRECADACAO e ANULACAO. Mantê-la no M12 obrigaria
 * qualquer total de receita fora dos relatórios a importar o M12 — e o superávit
 * por fonte fecharia um ciclo (m04 → m12 → m04). O M12 REEXPORTA esta tabela;
 * não existe segunda cópia.
 *
 * `null` = SINAL INDEFINIDO, e isso é DE PROPÓSITO (fail-closed).
 *
 * A receita realizada é `ARRECADACAO − ANULACAO` (`acumuladoLiquido`) e NENHUM
 * serviço emite `RETIFICACAO` — o valor existe no enum, sem semântica escrita:
 * não se sabe se a linha carrega o DELTA ou o VALOR NOVO, e os dois somam
 * diferente. Chutar aqui seria publicar um número errado com cara de certo. Se
 * aparecer uma retificação, quem soma PARA e cobra a definição.
 */
export const SINAL_RECEITA_REALIZADA: Record<
  TipoLancamentoReceita,
  1 | -1 | null
> = {
  ARRECADACAO: 1,
  ANULACAO: -1,
  RETIFICACAO: null,
};

export function sinalDaReceitaRealizada(tipo: TipoLancamentoReceita): 1 | -1 {
  const sinal = SINAL_RECEITA_REALIZADA[tipo];
  if (sinal === null) {
    throw new Error(
      `Receita do tipo ${tipo} não tem sinal definido: o M04 nunca a emite e a ` +
        `semântica dela (delta ou valor novo?) não está escrita em lugar nenhum. ` +
        `Defina-a ANTES de somar — somar errado aqui é publicar receita errada ` +
        `para o TCE.`
    );
  }
  return sinal;
}

const zExercicio = z.number().int().min(1900).max(2999);
const zExercicioFonte = z.union([z.literal(1), z.literal(2)]).default(1);

export const zRegistrarArrecadacaoInput = z
  .object({
    exercicio: zExercicio,
    /** Código de receita STN — 8 dígitos. */
    naturezaReceita: z.string().length(8, "Natureza da receita tem 8 dígitos"),
    fonte: z.string().length(3, "Fonte de recurso tem 3 dígitos"),
    co: z.string().length(4, "CO tem 4 dígitos").optional(),
    exercicioFonte: zExercicioFonte,
    /** INVARIANTE 1: string decimal ou Decimal. `number` é REJEITADO. */
    valor: zMoney.refine((v) => v.greaterThan(0), {
      message: "Valor da arrecadação deve ser > 0",
    }),
    dataArrecadacao: z.coerce.date(),
    numeroReceita: z.string().min(1, "Número da receita/guia é obrigatório"),
    criadoPor: z.string().min(1),
  })
  .superRefine((a, ctx) => {
    // A data tem de cair DENTRO do exercício declarado. Sem isso, uma
    // arrecadação de 2027 entraria no exercício 2026 e o balancete mentiria.
    //
    // ⚠️ O ANO É O **CIVIL DO ENTE**, e não o de UTC. Uma arrecadação de **31/12 às
    // 22:00** no horário de Brasília é `2027-01-01T01:00Z` — pelo ano UTC ela era
    // recusada como "fora do exercício 2026", sendo que é o último dia dele. E a recusa
    // vinha antes de qualquer outro guard, então a guia simplesmente não entrava.
    // Ver `packages/datas`.
    const ano = anoCivil(a.dataArrecadacao);
    if (ano !== a.exercicio) {
      ctx.addIssue({
        code: "custom",
        path: ["dataArrecadacao"],
        message:
          `Data de arrecadação (${diaCivil(a.dataArrecadacao)}) ` +
          `está fora do exercício ${a.exercicio}.`,
      });
    }
  });

export const zAnularArrecadacaoInput = z.object({
  receitaId: z.string().min(1),
  dataAnulacao: z.coerce.date(),
  numeroReceita: z.string().min(1, "Número da guia de anulação é obrigatório"),
  criadoPor: z.string().min(1),
});

export type RegistrarArrecadacaoInput = z.input<
  typeof zRegistrarArrecadacaoInput
>;
export type RegistrarArrecadacaoDados = z.output<
  typeof zRegistrarArrecadacaoInput
>;
export type AnularArrecadacaoInput = z.input<typeof zAnularArrecadacaoInput>;

/**
 * Compõe a arrecadação: valida a forma (Zod) e as partidas (motor puro).
 * Sem I/O — dá para exercitar o fato contábil inteiro sem banco.
 */
export function comporArrecadacao(
  input: RegistrarArrecadacaoInput,
  roteiro: RoteiroContabil
): {
  readonly dados: RegistrarArrecadacaoDados;
  readonly partidas: readonly Partida[];
} {
  const dados = zRegistrarArrecadacaoInput.parse(input);
  return { dados, partidas: comporPartidas(dados.valor, roteiro) };
}
