/**
 * M04 — OS CLASSIFICADORES DA NATUREZA DA RECEITA.
 *
 * Fonte: MTO / Portaria STN-SOF 163/2001, consolidada pela Portaria Conjunta
 * STN-SOF 103/2021. O rol é FECHADO — nada aqui foi completado de memória.
 *
 * ═══ POR QUE MORA NO M04, E NÃO NUM `packages/` ═══
 * Pelo mesmo motivo que trouxe para cá o `SINAL_RECEITA_REALIZADA` e o
 * `CATEGORIAS_RECEITA` (que nasceram no M12): o dono do FATO é o dono da
 * classificação dele. Quem precisa classificar receita é o M10 (dívida, dívida
 * ativa, alienação), e a seta m10 → m04 JÁ EXISTE. Um package novo seria uma casa
 * vazia; o M12 REEXPORTA — não existe segunda cópia.
 *
 * ═══ O CÓDIGO É A VERDADE; A CLASSIFICAÇÃO É DERIVADA ═══
 * NÃO existe — e não pode existir — coluna `origem` ou `tipo` na `NaturezaReceita`.
 * Seria a SEGUNDA verdade sobre o mesmo código, e no dia em que ela divergisse do
 * 2º dígito o guard da operação de crédito passaria a olhar para o lado errado
 * enquanto o código, na cara do relatório, dizia outra coisa. Mesmo padrão do
 * `conferirCodigoNaturezaDespesa` (M02): a natureza da despesa também deriva de
 * componentes, e o único papel do código guardado é ser conferido contra eles.
 *
 * ═══ A ANATOMIA DOS 8 DÍGITOS ═══
 *   c  o  e  d d d d  t          exemplo: 1.1.1.8.01.1.1 -> "11180111"
 *   1  2  3  4 5 6 7  8
 *
 *   1   CATEGORIA econômica (1 corrente · 2 capital · 7 e 8 intraorçamentárias)
 *   2   ORIGEM — e o rol dela MUDA conforme a categoria: "1" é IMPOSTOS quando a
 *       categoria é corrente e OPERAÇÕES DE CRÉDITO quando é capital. É por isso
 *       que a chave do Record é `${categoria}${dígito}`, e não o dígito solto:
 *       um `Record<dígito, Origem>` diria que 2.1 é imposto.
 *   3   espécie
 *   4-7 desdobramentos (rubrica / alínea / subalínea)
 *   8   TIPO — principal? multa? dívida ativa?
 */

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIA (1º dígito)
// ═══════════════════════════════════════════════════════════════════════════

export type CategoriaReceita = "1" | "2" | "7" | "8";

/**
 * A CATEGORIA da receita — 1º dígito.
 *
 * Nasceu no M12 (Anexo 12), e voltou para o dono do fato pelo mesmo motivo do
 * `SINAL_RECEITA_REALIZADA`: qualquer módulo que precise classificar uma receita
 * teria de importar os RELATÓRIOS, e o M10 (dívida) fecharia um ciclo
 * (m10 → m12 → m04 → ...). O M12 REEXPORTA; não existe segunda cópia.
 */
export const CATEGORIAS_RECEITA: Record<CategoriaReceita, string> = {
  "1": "RECEITAS CORRENTES",
  "2": "RECEITAS DE CAPITAL",
  "7": "RECEITAS CORRENTES - INTRAORÇAMENTÁRIAS",
  "8": "RECEITAS DE CAPITAL - INTRAORÇAMENTÁRIAS",
};

/**
 * A categoria SEM o "intra" — e ela é o eixo de TODO este arquivo.
 *
 * A Portaria 338/2006 criou o 7 e o 8 como ESPECIFICAÇÃO das categorias 1 e 2 (a
 * receita intraorçamentária é a mesma receita, entre órgãos do mesmo ente), NÃO
 * como categorias novas. Consequência direta e verificável: o rol de origens do 7
 * é o do 1, e o do 8 é o do 2. É por isso que o `ORIGEM_RECEITA` tem 13 chaves
 * (8 correntes + 5 de capital) e não 26 — duplicá-las seria criar duas verdades
 * sobre o mesmo dígito, e o dia em que só uma fosse corrigida a intra passaria a
 * classificar diferente da orçamentária.
 */
export type CategoriaBase = "1" | "2";

const CATEGORIA_BASE: Record<CategoriaReceita, CategoriaBase> = {
  "1": "1",
  "7": "1",
  "2": "2",
  "8": "2",
};

export function categoriaDaReceita(codigoNatureza: string): CategoriaReceita {
  const d = codigoNatureza.charAt(0);
  if (d !== "1" && d !== "2" && d !== "7" && d !== "8") {
    throw new Error(
      `Natureza de receita ${codigoNatureza}: 1º dígito "${d}" não é categoria ` +
        `econômica conhecida (1, 2, 7 ou 8).`
    );
  }
  return d;
}

// ═══════════════════════════════════════════════════════════════════════════
// ORIGEM (2º dígito) — o rol depende da categoria
// ═══════════════════════════════════════════════════════════════════════════

export type OrigemReceita =
  // Correntes (categoria 1, e a intra 7)
  | "IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA"
  | "CONTRIBUICOES"
  | "RECEITA_PATRIMONIAL"
  | "RECEITA_AGROPECUARIA"
  | "RECEITA_INDUSTRIAL"
  | "RECEITA_DE_SERVICOS"
  | "TRANSFERENCIAS_CORRENTES"
  | "OUTRAS_RECEITAS_CORRENTES"
  // Capital (categoria 2, e a intra 8)
  | "OPERACOES_DE_CREDITO"
  | "ALIENACAO_DE_BENS"
  | "AMORTIZACAO_DE_EMPRESTIMOS"
  | "TRANSFERENCIAS_DE_CAPITAL"
  | "OUTRAS_RECEITAS_DE_CAPITAL";

/** `${categoriaBase}${dígitoDeOrigem}` — as 13 combinações do rol, e só elas. */
export type ChaveOrigem =
  | "11"
  | "12"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17"
  | "19"
  | "21"
  | "22"
  | "23"
  | "24"
  | "29";

/**
 * ⚠️ O ROL OFICIAL, EXAUSTIVO E FECHADO. Chave ausente = fail-closed.
 *
 * Repare no que NÃO está aqui: não existe "18", não existe "25". Um código
 * 1.8.x.x.xx.x.x ou 2.5.x.x.xx.x.x não é uma receita que este classificador
 * "ainda não conhece" — é um código que a Portaria 163 não emite. Devolver
 * `undefined` e seguir seria deixar um guard inteiro passar batido.
 */
export const ORIGEM_RECEITA: Record<ChaveOrigem, OrigemReceita> = {
  "11": "IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA",
  "12": "CONTRIBUICOES",
  "13": "RECEITA_PATRIMONIAL",
  "14": "RECEITA_AGROPECUARIA",
  "15": "RECEITA_INDUSTRIAL",
  "16": "RECEITA_DE_SERVICOS",
  "17": "TRANSFERENCIAS_CORRENTES",
  "19": "OUTRAS_RECEITAS_CORRENTES",
  "21": "OPERACOES_DE_CREDITO",
  "22": "ALIENACAO_DE_BENS",
  "23": "AMORTIZACAO_DE_EMPRESTIMOS",
  "24": "TRANSFERENCIAS_DE_CAPITAL",
  "29": "OUTRAS_RECEITAS_DE_CAPITAL",
};

/** O rol da categoria, DERIVADO do Record — nunca uma segunda lista à mão. */
function digitosDaCategoria(base: CategoriaBase): string[] {
  return Object.keys(ORIGEM_RECEITA)
    .filter((k) => k.startsWith(base))
    .map((k) => k.charAt(1));
}

// ═══════════════════════════════════════════════════════════════════════════
// TIPO (8º dígito)
// ═══════════════════════════════════════════════════════════════════════════

export type TipoNaturezaReceita =
  | "NAO_VALORIZAVEL_AGREGADORA"
  | "PRINCIPAL"
  | "MULTAS_E_JUROS_DE_MORA"
  | "DIVIDA_ATIVA"
  | "MULTAS_E_JUROS_DE_MORA_DA_DIVIDA_ATIVA";

export type DigitoTipo = "0" | "1" | "2" | "3" | "4";

/**
 * ⚠️ 0 a 4, e SÓ. Os dígitos 5 a 9 estão RESERVADOS a portarias específicas: não
 * são "outros", são vagas ainda não preenchidas. Um código com tipo 7 hoje é um
 * código errado; classificá-lo como "outros" seria fabricar semântica para um
 * dígito que a União ainda não emitiu. Rejeita, nomeando a reserva.
 */
export const TIPO_RECEITA: Record<DigitoTipo, TipoNaturezaReceita> = {
  "0": "NAO_VALORIZAVEL_AGREGADORA",
  "1": "PRINCIPAL",
  "2": "MULTAS_E_JUROS_DE_MORA",
  "3": "DIVIDA_ATIVA",
  "4": "MULTAS_E_JUROS_DE_MORA_DA_DIVIDA_ATIVA",
};

// ═══════════════════════════════════════════════════════════════════════════
// O PARSER
// ═══════════════════════════════════════════════════════════════════════════

export interface NaturezaReceitaDecomposta {
  readonly codigo: string;
  readonly categoria: CategoriaReceita;
  readonly origem: OrigemReceita;
  /** 3º dígito. Sem rol oficial fechado — devolvido cru, de propósito. */
  readonly especie: string;
  /** 4º ao 7º. Idem. */
  readonly desdobramento: string;
  readonly tipo: TipoNaturezaReceita;
  readonly intraorcamentaria: boolean;
}

const RE_CODIGO = /^\d{8}$/;

/**
 * Decompõe o código e classifica. FAIL-CLOSED nos três eixos: forma, origem
 * fora do rol da própria categoria, e tipo reservado.
 */
export function parsearNaturezaReceita(
  codigo: string
): NaturezaReceitaDecomposta {
  if (!RE_CODIGO.test(codigo)) {
    throw new Error(
      `Natureza de receita "${codigo}": o código tem 8 DÍGITOS ` +
        `(categoria·origem·espécie·desdobramentos·tipo). Sem os 8, não há o que ` +
        `classificar — a origem e o tipo SÃO posições dentro dele.`
    );
  }

  const categoria = categoriaDaReceita(codigo);
  const base = CATEGORIA_BASE[categoria];
  const digitoOrigem = codigo.charAt(1);
  const chave = `${base}${digitoOrigem}`;

  const origem: OrigemReceita | undefined = (
    ORIGEM_RECEITA as Record<string, OrigemReceita | undefined>
  )[chave];
  if (origem === undefined) {
    throw new Error(
      `Natureza de receita ${codigo}: a origem "${digitoOrigem}" não existe na ` +
        `categoria ${categoria} (${CATEGORIAS_RECEITA[categoria]}). O rol dela é ` +
        `{${digitosDaCategoria(base).join(", ")}} — Portaria 163/2001. Um dígito ` +
        `fora do rol NÃO é uma receita nova: é um código que a União não emite.`
    );
  }

  const digitoTipo = codigo.charAt(7);
  const tipo: TipoNaturezaReceita | undefined = (
    TIPO_RECEITA as Record<string, TipoNaturezaReceita | undefined>
  )[digitoTipo];
  if (tipo === undefined) {
    throw new Error(
      `Natureza de receita ${codigo}: o tipo "${digitoTipo}" (8º dígito) está ` +
        `RESERVADO a portarias específicas — o rol vigente é 0 a 4 ` +
        `(agregadora, principal, multas e juros, dívida ativa, multas e juros da ` +
        `dívida ativa). Enquanto a portaria não vier, ninguém sabe o que este ` +
        `dígito significa, e chutar aqui é classificar receita no escuro.`
    );
  }

  return {
    codigo,
    categoria,
    origem,
    especie: codigo.charAt(2),
    desdobramento: codigo.slice(3, 7),
    tipo,
    intraorcamentaria: categoria !== base,
  };
}

export function origemDaNatureza(codigo: string): OrigemReceita {
  return parsearNaturezaReceita(codigo).origem;
}

export function tipoDaNatureza(codigo: string): TipoNaturezaReceita {
  return parsearNaturezaReceita(codigo).tipo;
}

export function ehIntraorcamentaria(codigo: string): boolean {
  return parsearNaturezaReceita(codigo).intraorcamentaria;
}

/**
 * ⚠️ QUAIS TIPOS QUITAM DÍVIDA ATIVA (TR 4.63) — Record EXAUSTIVO, e um tipo novo
 * não compila até alguém decidir.
 *
 * O DIVIDA_ATIVA (3) é o óbvio. O quarto tipo entra pelo que o próprio rol diz
 * dele: "multas e juros de mora DA DÍVIDA ATIVA". E o repositório confirma — o
 * saldo da dívida ativa (`saldoDaDividaAtivaEm`) soma a INSCRICAO **e a
 * ATUALIZACAO**, que é exatamente a correção/juros lançada sobre o crédito. Um
 * guard que só aceitasse o tipo 3 tornaria IMPOSSÍVEL registrar o recebimento da
 * parte de juros: o dinheiro entraria como receita, a dívida NUNCA zeraria, e a
 * amarração razão×movimentos acusaria para sempre — o furo de a98f0a5 de novo,
 * pela porta da frente.
 */
export const TIPOS_QUE_QUITAM_DIVIDA_ATIVA: Record<TipoNaturezaReceita, boolean> =
  {
    NAO_VALORIZAVEL_AGREGADORA: false,
    PRINCIPAL: false,
    MULTAS_E_JUROS_DE_MORA: false,
    DIVIDA_ATIVA: true,
    MULTAS_E_JUROS_DE_MORA_DA_DIVIDA_ATIVA: true,
  };
