import { Decimal } from "decimal.js";
import { z } from "zod";

/**
 * ═══ ⚠️ `valorData` É UMA DATA PURA, E A ÂNCORA É MEIA-NOITE UTC — POR DECISÃO ═══
 *
 * O campo adicional do tipo DATA guarda o que o usuário DIGITOU num calendário: "15/03/2026".
 * Isso não é um instante — é uma casa do calendário, sem hora e sem fuso. A coluna do banco
 * é `DateTime` porque o Prisma não tem `Date` puro, e a âncora escolhida é **meia-noite UTC**.
 *
 * ⚠️ POR QUE NÃO A MEIA-NOITE CIVIL DO ENTE, que é a régua de todo o resto do repositório:
 * porque aqui NÃO HÁ COMPARAÇÃO DE DOMÍNIO NENHUMA. Nada soma, corta período, trava
 * competência ou ordena fila por este valor — ele é digitado, guardado e mostrado de volta.
 * O que importa é que a IDA e a VOLTA usem a MESMA âncora, e é isso que `m25-data-pura.test.ts`
 * prova com uma data cujo dia civil e cujo dia UTC divergem.
 *
 * ⚠️ NO DIA EM QUE ALGUÉM FILTRAR OU SOMAR POR ESTE CAMPO, esta decisão vira defeito: a
 * âncora precisará virar civil, nas DUAS pontas e com migração do que já está gravado.
 * Trocar um lado só quebra a validação de "31/02 não existe", que é uma conferência de
 * ida-e-volta.
 */


/**
 * M25 — CAMPOS ADICIONAIS. Domínio PURO.
 *
 * ═══ ⚠️ O TIPO DECIDE EM QUAL COLUNA O VALOR CAI ═══
 * `valorParaColunas` é a única função que sabe disso, e ela é pura. Um valor guardado
 * na coluna errada não quebra nada na gravação — quebra no FILTRO, meses depois, quando
 * alguém pedir "acima de 1.000" e receber os registros de 900 junto, porque a
 * comparação virou texto.
 */

export type TipoDeCampo =
  | "VALOR"
  | "LISTA"
  | "ALFANUMERICO"
  | "DATA"
  | "LISTA_DINAMICA"
  | "HORA"
  | "BOOLEANO";

export type CadastroComCampos = "PESSOA" | "PROCESSO" | "COMUNICADO";

/**
 * AS ORIGENS PERMITIDAS DA LISTA DINÂMICA — rol fechado.
 *
 * ⚠️ UMA STRING LIVRE AQUI SERIA NOME DE TABELA VINDO DO USUÁRIO. Mesmo sem SQL
 * dinâmico, ela abriria a porta para o dia em que alguém escrevesse a consulta genérica
 * "SELECT ... FROM ${origem}" — e essa é a linha que não se escreve depois porque não
 * se deixou o dado existir antes.
 */
export const ORIGENS_DINAMICAS = ["SETOR", "ASSUNTO", "TIPO_DE_COMUNICADO"] as const;
export type OrigemDinamica = (typeof ORIGENS_DINAMICAS)[number];

export interface ColunasDoValor {
  readonly valorTexto: string | null;
  readonly valorNumero: string | null;
  readonly valorData: Date | null;
  readonly valorBooleano: boolean | null;
}

const VAZIO: ColunasDoValor = {
  valorTexto: null,
  valorNumero: null,
  valorData: null,
  valorBooleano: null,
};

/** "HH:MM", 24 horas. Em texto porque assim ordena certo — e porque hora sem data não é instante. */
const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * CONVERTE O QUE O USUÁRIO DIGITOU nas colunas tipadas — ou RECUSA, nomeando.
 *
 * ⚠️ A RECUSA É PARTE DA CAPACIDADE. Um campo declarado DATA que aceita "amanhã" não é
 * um campo de data: é um campo de texto com rótulo de data, e ele mente no primeiro
 * filtro por período.
 */
export function valorParaColunas(
  tipo: TipoDeCampo,
  bruto: string,
  opcoesValidas: readonly string[] = []
): ColunasDoValor {
  const v = bruto.trim();
  if (v === "") return VAZIO;

  switch (tipo) {
    case "VALOR": {
      // ⚠️ DINHEIRO EM DECIMAL, SEMPRE. `Number` perderia centavos em valores grandes,
      // e é a regra do núcleo — não uma preferência deste módulo.
      let d: Decimal;
      try {
        d = new Decimal(v.replace(/\./g, "").replace(",", "."));
      } catch {
        throw new Error(
          `"${bruto}" não é um valor monetário. Use dígitos e vírgula decimal (1.234,56).`
        );
      }
      if (!d.isFinite()) {
        throw new Error(`"${bruto}" não é um valor monetário finito.`);
      }
      return { ...VAZIO, valorNumero: d.toFixed(2) };
    }

    case "DATA": {
      // ISO (o que o input[type=date] manda) ou dd/mm/aaaa (o que o usuário digita).
      const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
      const partes = iso !== null
        ? { a: iso[1]!, m: iso[2]!, d: iso[3]! }
        : br !== null
          ? { a: br[3]!, m: br[2]!, d: br[1]! }
          : null;
      if (partes === null) {
        throw new Error(`"${bruto}" não é uma data. Use dd/mm/aaaa.`);
      }
      // ⚠️ `valorData` É UMA DATA PURA, não um instante — ver a nota `valorData` É UMA DATA PURA no topo.
      const data = new Date(`${partes.a}-${partes.m}-${partes.d}T00:00:00.000Z`);
      if (Number.isNaN(data.getTime())) {
        throw new Error(`"${bruto}" não é uma data válida.`);
      }
      // ⚠️ 31/02 vira 03/03 num `new Date` complacente. A conferência de volta é o que
      // recusa a data que não existe.
      if (data.toISOString().slice(0, 10) !== `${partes.a}-${partes.m}-${partes.d}`) {
        throw new Error(`"${bruto}" não é uma data que exista no calendário.`);
      }
      return { ...VAZIO, valorData: data };
    }

    case "HORA": {
      if (!HORA.test(v)) {
        throw new Error(`"${bruto}" não é uma hora. Use HH:MM, de 00:00 a 23:59.`);
      }
      return { ...VAZIO, valorTexto: v };
    }

    case "BOOLEANO": {
      const sim = ["true", "1", "sim", "s"].includes(v.toLowerCase());
      const nao = ["false", "0", "nao", "não", "n"].includes(v.toLowerCase());
      if (!sim && !nao) {
        throw new Error(`"${bruto}" não é sim nem não.`);
      }
      return { ...VAZIO, valorBooleano: sim };
    }

    case "LISTA":
    case "LISTA_DINAMICA": {
      if (opcoesValidas.length === 0) {
        throw new Error(
          `O campo é de lista e não tem opção nenhuma cadastrada. Uma lista vazia não ` +
            `aceita valor — cadastre as opções antes de exigir o preenchimento.`
        );
      }
      if (!opcoesValidas.includes(v)) {
        throw new Error(
          `"${bruto}" não está entre as opções do campo. Opções: ` +
            `${opcoesValidas.join(", ")}.`
        );
      }
      return { ...VAZIO, valorTexto: v };
    }

    case "ALFANUMERICO":
      return { ...VAZIO, valorTexto: v };
  }
}

/** O texto de exibição de um valor já gravado — a volta do caminho acima. */
export function exibirValor(tipo: TipoDeCampo, c: ColunasDoValor): string {
  switch (tipo) {
    case "VALOR":
      return c.valorNumero === null
        ? ""
        : new Decimal(c.valorNumero)
            .toFixed(2)
            .replace(".", ",")
            .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    case "DATA":
      return c.valorData === null
        ? ""
        : // A volta EXATA da ida: a mesma âncora dos dois lados. Ver `ANCORA_DA_DATA_PURA`.
          c.valorData.toISOString().slice(0, 10).split("-").reverse().join("/");
    case "BOOLEANO":
      return c.valorBooleano === null ? "" : c.valorBooleano ? "Sim" : "Não";
    default:
      return c.valorTexto ?? "";
  }
}

/**
 * ESTE VALOR SATISFAZ A OBRIGATORIEDADE? — puro, e separado da conversão.
 *
 * ⚠️ O BOOLEANO FALSO SATISFAZ. "Não" é uma resposta; tratá-lo como ausência obrigaria
 * o usuário a marcar "sim" para conseguir salvar, que é a pior forma de dado errado.
 */
export function estaPreenchido(c: ColunasDoValor): boolean {
  return (
    c.valorTexto !== null ||
    c.valorNumero !== null ||
    c.valorData !== null ||
    c.valorBooleano !== null
  );
}

export const zDefinirCampoAdicional = z.object({
  unidadeOrcId: z.string().min(1),
  cadastro: z.enum(["PESSOA", "PROCESSO", "COMUNICADO"]),
  codigo: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "O código do campo usa letras minúsculas, dígitos e '_', começando por letra — " +
        "ele é identificador, não rótulo. O que o usuário lê é o `rotulo`."
    ),
  rotulo: z.string().trim().min(1).max(120),
  tipo: z.enum([
    "VALOR",
    "LISTA",
    "ALFANUMERICO",
    "DATA",
    "LISTA_DINAMICA",
    "HORA",
    "BOOLEANO",
  ]),
  obrigatorio: z.boolean().default(false),
  ordem: z.number().int().min(1).max(999),
  opcoes: z.array(z.string().trim().min(1)).default([]),
  origemDinamica: z.enum(ORIGENS_DINAMICAS).optional(),
  criadoPor: z.string().min(1),
});
export type DefinirCampoAdicionalInput = z.input<typeof zDefinirCampoAdicional>;

export const zPreencherCamposAdicionais = z.object({
  cadastro: z.enum(["PESSOA", "PROCESSO", "COMUNICADO"]),
  registroId: z.string().min(1),
  /** codigo -> valor digitado. Ausente = não mexe; string vazia = APAGA. */
  valores: z.record(z.string(), z.string()),
  criadoPor: z.string().min(1),
});
export type PreencherCamposAdicionaisInput = z.input<typeof zPreencherCamposAdicionais>;

export const zDesativarCampoAdicional = z.object({
  definicaoId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type DesativarCampoAdicionalInput = z.input<typeof zDesativarCampoAdicional>;
