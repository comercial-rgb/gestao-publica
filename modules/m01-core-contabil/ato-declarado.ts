import { z } from "zod";
import { anoCivil } from "../../packages/datas/index.js";

/**
 * ═══ O ATO QUE FUNDAMENTA UMA DECISÃO DO ENTE — ESTRUTURADO, E CONFERIDO ═══
 *
 * ⚠️ ESTE É O PRIMEIRO ATO ESTRUTURADO DO REPOSITÓRIO, e isso foi medido antes de afirmado:
 * todo `fundamento` que existe hoje é `String` livre com piso de comprimento no banco
 * (`m05-despesa.prisma`, `m11-fiscalizacao.prisma`, `m07-extraorcamentario.prisma`,
 * `m34-tributario.prisma`). Nenhum deles se migra nesta rodada.
 *
 * ⚠️ POR QUE O PISO DE COMPRIMENTO NÃO BASTA, e é a razão de este arquivo existir: **"porque
 * sim" tem dez caracteres** — foi medido na V8.3, com essas palavras — e um `CHECK
 * length >= 20` é satisfeito por vinte caracteres quaisquer. Comprimento comprova que alguém
 * digitou; não comprova que o ato existe, que é daqui, nem que é SOBRE ISTO.
 *
 * As cinco conferências, todas de COERÊNCIA e nenhuma de tamanho:
 *   1. ANO — quatro dígitos e NÃO FUTURO, contra a data civil do ente (nunca UTC).
 *   2. NÚMERO — tem dígito. Ato sem número é ato que ninguém acha.
 *   3. DISPOSITIVO — tem forma de dispositivo (art., §, inciso, caput, alínea, anexo...).
 *   4. CITAÇÃO ≠ RÓTULO — a citação é a TRANSCRIÇÃO do dispositivo. Repetir "Lei 1.234/2005,
 *      art. 2º" no campo da citação é escrever o rótulo duas vezes e não citar nada.
 *   5. APLICABILIDADE — a citação tem de mencionar o OBJETO da declaração. É a conferência que
 *      separa "preencheu" de "é sobre isto", e é a única que um texto longo não engana.
 *
 * ⚠️ A APLICABILIDADE ANCORA NO OBJETO, E ACEITA MAIS DE UM ANCORADOURO. Quem declara o titular
 * de uma conta bancária pode estar citando o ato que CRIOU a entidade (onde aparece a entidade)
 * ou o ato que ABRIU a conta (onde aparece a conta). Exigir sempre a entidade reprovaria o
 * segundo, que é legítimo — e uma régua que reprova o caso legítimo vira régua que alguém
 * desliga. Dentro de um ancoradouro, TODOS os termos têm de aparecer; entre ancoradouros, basta
 * UM. A conjunção dentro do ancoradouro é o que impede o falso positivo: "500" sozinho casa com
 * qualquer citação que tenha um 500 (o número do próprio ato, um valor); banco + agência + conta
 * juntos, não.
 *
 * ⚠️ E ONDE O ENTE NÃO TIVER ATO, O CAMINHO NÃO É AFROUXAR A RÉGUA. É não declarar: a conta fica
 * sem titular e as guias nela ficam NÃO ATRIBUÍDAS — estado honesto, previsto, e visível na
 * consulta. Uma régua que cede ao primeiro caso difícil não mede nada depois.
 */

/**
 * O rol de tipos de ato. FECHADO — o `Record` não compila se o enum do Prisma crescer sem que
 * alguém decida o rótulo.
 *
 * ⚠️ ROL DE FORMA, NÃO DE NORMA. São os tipos de ato administrativo pelos quais um ente cria
 * uma entidade ou declara a titularidade de uma conta. Nenhum código normativo, nenhuma
 * alíquota e nenhuma classificação de tabela oficial é inventada aqui: o CONTEÚDO do ato vem na
 * citação, que é transcrição de quem tem o ato à mão.
 */
export const TIPOS_DE_ATO = {
  LEI: "Lei",
  LEI_COMPLEMENTAR: "Lei Complementar",
  DECRETO: "Decreto",
  PORTARIA: "Portaria",
  RESOLUCAO: "Resolução",
  INSTRUCAO_NORMATIVA: "Instrução Normativa",
  OFICIO: "Ofício",
  CONTRATO: "Contrato",
} as const;

export type TipoDeAtoDeclarado = keyof typeof TIPOS_DE_ATO;

export const zTipoDeAtoDeclarado = z.enum(
  Object.keys(TIPOS_DE_ATO) as [TipoDeAtoDeclarado, ...TipoDeAtoDeclarado[]]
);

/**
 * A FORMA do ato. Só forma — as conferências de coerência são de `conferirAtoDeclarado`, que
 * precisa da data civil e dos ancoradouros e por isso não cabe num refinamento de Zod.
 */
export const zAtoDeclarado = z.object({
  atoTipo: zTipoDeAtoDeclarado,
  atoNumero: z.string().trim().min(1, "O número do ato é obrigatório."),
  atoAno: z.number().int(),
  atoDispositivo: z.string().trim().min(1, "O dispositivo do ato é obrigatório."),
  atoCitacao: z.string().trim().min(1, "A citação do ato é obrigatória."),
});

export type AtoDeclarado = z.infer<typeof zAtoDeclarado>;

/**
 * Um ANCORADOURO: o que a citação precisa mencionar para o ato ser sobre este objeto.
 *
 * `termos` é uma CONJUNÇÃO — todos têm de aparecer. `rotulo` é o que a recusa nomeia ao
 * operador ("a entidade", "a conta"), e por isso é texto de gente, não identificador.
 */
export interface AncoradouroDoAto {
  readonly rotulo: string;
  readonly termos: readonly string[];
}

/** O erro que toda conferência de ato levanta. O `motivo` é o que os testes de negação afirmam. */
export class AtoDeclaradoInvalidoError extends Error {
  constructor(
    readonly motivo:
      | "ANO_FUTURO"
      | "ANO_FORA_DE_FORMA"
      | "NUMERO_SEM_DIGITO"
      | "DISPOSITIVO_SEM_FORMA"
      | "CITACAO_E_O_PROPRIO_ROTULO"
      | "ATO_NAO_TRATA_DO_OBJETO",
    mensagem: string
  ) {
    super(mensagem);
    this.name = "AtoDeclaradoInvalidoError";
  }
}

/**
 * ⚠️ NORMALIZAÇÃO ANTES DE COMPARAR, senão a régua reprova por cedilha e vira teatro.
 * Minúsculas, acentos removidos (NFD + corte dos diacríticos), e tudo que não é letra ou dígito
 * vira um espaço só — assim "Fundação Municipal" casa com "FUNDACAO  MUNICIPAL,".
 */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/** Só os dígitos — é assim que "12.345.678/0001-95" casa com "12345678000195". */
function digitos(texto: string): string {
  return texto.replace(/\D+/gu, "");
}

/**
 * As formas que um dispositivo tem. ⚠️ É PROPRIEDADE, NÃO ENUMERAÇÃO DE EXEMPLOS: qualquer
 * dispositivo brasileiro se nomeia por uma destas palavras ou pelo sinal de parágrafo. Um
 * campo com "conforme a lei" não nomeia dispositivo nenhum e não diz onde ler.
 */
const FORMA_DE_DISPOSITIVO =
  /(^|\s)(art|artigo|arts|artigos|par|paragrafo|paragrafos|inc|inciso|incisos|caput|alinea|alineas|anexo|anexos|clausula|clausulas|item|itens)(\s|$)/u;

/**
 * Quantas palavras PRÓPRIAS a citação precisa ter além do rótulo do ato.
 *
 * ⚠️ NÃO É UM PISO DE COMPRIMENTO DISFARÇADO. O que se mede não é tamanho: é quanto da citação
 * **não** é a repetição do que já está nos outros quatro campos. "Lei 1.234/2005, art. 2º"
 * tem 23 caracteres (passaria num `length >= 20`) e ZERO palavra própria — é o rótulo escrito
 * de novo. Uma transcrição de dispositivo é uma frase; abaixo de três palavras próprias não há
 * frase, há etiqueta.
 */
const PALAVRAS_PROPRIAS_MINIMAS = 3;

/** Um termo aparece na citação? Por texto normalizado, e por dígitos quando o termo é numérico. */
function termoAparece(citacaoNormalizada: string, citacaoEmDigitos: string, termo: string): boolean {
  const alvo = normalizar(termo);
  if (alvo !== "" && citacaoNormalizada.includes(alvo)) return true;

  // ⚠️ O CASAMENTO POR DÍGITOS SÓ VALE DE 3 DÍGITOS PARA CIMA. Abaixo disso ele casa com o ano
  // do próprio ato, com um número de artigo, com qualquer coisa — e uma régua que casa com
  // qualquer coisa não recusa nada.
  const alvoEmDigitos = digitos(termo);
  return alvoEmDigitos.length >= 3 && citacaoEmDigitos.includes(alvoEmDigitos);
}

/**
 * CONFERE O ATO. Fail-closed: devolve `void` e levanta `AtoDeclaradoInvalidoError` com motivo
 * nomeado. Não grava nada, não lê banco — é domínio puro, e por isso se testa sem fixture.
 *
 * @param hoje o instante de referência, para o ano civil DO ENTE. Recebido por parâmetro porque
 *   uma régua que lê o relógio por dentro não se testa em dezembro sem viajar no tempo.
 * @param ancoradouros pelo menos um tem de casar. Lista vazia é ERRO DE PROGRAMAÇÃO, não ato
 *   inválido: quem chama sem ancoradouro está pedindo para a régua não medir aplicabilidade
 *   nenhuma, e é exatamente assim que um instrumento morre em silêncio.
 */
export function conferirAtoDeclarado(
  ato: AtoDeclarado,
  p: { readonly hoje: Date; readonly ancoradouros: readonly AncoradouroDoAto[] }
): void {
  if (p.ancoradouros.length === 0) {
    throw new Error(
      "ANCORADOURO AUSENTE: conferir um ato sem nenhum ancoradouro desligaria a checagem de " +
        "aplicabilidade e deixaria passar qualquer texto. Quem chama precisa dizer sobre QUE " +
        "objeto o ato tem de falar. Nada foi gravado."
    );
  }

  const anoDoEnte = anoCivil(p.hoje);

  if (!Number.isInteger(ato.atoAno) || ato.atoAno < 1000 || ato.atoAno > 9999) {
    throw new AtoDeclaradoInvalidoError(
      "ANO_FORA_DE_FORMA",
      `O ano do ato (${String(ato.atoAno)}) não é um ano de quatro dígitos. Informe o ano de ` +
        `publicação do ato, como ele aparece nele. Nada foi gravado.`
    );
  }

  if (ato.atoAno > anoDoEnte) {
    throw new AtoDeclaradoInvalidoError(
      "ANO_FUTURO",
      `O ato é de ${String(ato.atoAno)} e o exercício corrente do ente é ${String(anoDoEnte)}: ` +
        `um ato que ainda não foi publicado não fundamenta decisão nenhuma. Confira o ano. ` +
        `Nada foi gravado.`
    );
  }

  if (!/\d/u.test(ato.atoNumero)) {
    throw new AtoDeclaradoInvalidoError(
      "NUMERO_SEM_DIGITO",
      `O número do ato ("${ato.atoNumero}") não tem dígito nenhum. Informe o número pelo qual o ` +
        `ato é localizado no arquivo do ente. Nada foi gravado.`
    );
  }

  const dispositivoNormalizado = ` ${normalizar(ato.atoDispositivo)} `;
  const temSinalDeParagrafo = ato.atoDispositivo.includes("§");
  if (!temSinalDeParagrafo && !FORMA_DE_DISPOSITIVO.test(dispositivoNormalizado)) {
    throw new AtoDeclaradoInvalidoError(
      "DISPOSITIVO_SEM_FORMA",
      `"${ato.atoDispositivo}" não nomeia um dispositivo. Diga ONDE, dentro do ato, está o que ` +
        `você está citando — por exemplo "art. 2º", "§ 1º do art. 5º", "Anexo I". Nada foi gravado.`
    );
  }

  // ── 4. A citação é a transcrição, não o rótulo ──────────────────────────────────────────
  const rotulo = `${TIPOS_DE_ATO[ato.atoTipo]} ${ato.atoNumero} ${String(ato.atoAno)} ${ato.atoDispositivo}`;
  const tokensDoRotulo = new Set(normalizar(rotulo).split(" ").filter((t) => t !== ""));
  const citacaoNormalizada = normalizar(ato.atoCitacao);
  const palavrasProprias = citacaoNormalizada
    .split(" ")
    .filter((t) => t !== "" && !tokensDoRotulo.has(t));

  if (palavrasProprias.length < PALAVRAS_PROPRIAS_MINIMAS) {
    throw new AtoDeclaradoInvalidoError(
      "CITACAO_E_O_PROPRIO_ROTULO",
      `A citação repete o próprio ato ("${rotulo}") e não transcreve nada dele. Copie o TRECHO ` +
        `do ${TIPOS_DE_ATO[ato.atoTipo]} ${ato.atoNumero}/${String(ato.atoAno)}, ` +
        `${ato.atoDispositivo}, que trata do assunto. Nada foi gravado.`
    );
  }

  // ── 5. Aplicabilidade: o ato é sobre ISTO? ──────────────────────────────────────────────
  const citacaoEmDigitos = digitos(ato.atoCitacao);
  const casou = p.ancoradouros.some(
    (a) =>
      a.termos.length > 0 &&
      a.termos.every((t) => termoAparece(citacaoNormalizada, citacaoEmDigitos, t))
  );

  if (!casou) {
    const rotulos = p.ancoradouros.map((a) => a.rotulo);
    const lista =
      rotulos.length === 1
        ? rotulos[0]
        : `${rotulos.slice(0, -1).join(", ")} nem ${rotulos[rotulos.length - 1]}`;
    throw new AtoDeclaradoInvalidoError(
      "ATO_NAO_TRATA_DO_OBJETO",
      `O ato citado não menciona ${lista}. Cite o trecho do ato que trata deste assunto — o ` +
        `ato que cria a entidade a nomeia, e o ato que abre a conta a identifica. Se o ente não ` +
        `tem ato sobre isto, não declare: sem titular declarado, as guias entram como não ` +
        `atribuídas, e isso é preferível a um fundamento que não fundamenta. Nada foi gravado.`
    );
  }
}

/** O rótulo legível do ato, para tela, mensagem e documento. Um só lugar o monta. */
export function rotuloDoAto(ato: AtoDeclarado): string {
  return `${TIPOS_DE_ATO[ato.atoTipo]} ${ato.atoNumero}/${String(ato.atoAno)}, ${ato.atoDispositivo}`;
}
