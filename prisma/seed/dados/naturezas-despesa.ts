import { ELEMENTOS } from "./elementos.js";
import {
  CATEGORIAS_ECONOMICAS,
  GRUPOS_NATUREZA_DESPESA,
  MODALIDADES_APLICACAO,
} from "./natureza-componentes.js";

/**
 * NATUREZAS DE DESPESA comuns — MONTADAS a partir dos componentes.
 *
 * Cada natureza declara só os 4 componentes; a descrição e o `codigoCompleto`
 * são DERIVADOS. Ninguém digita "339039" à mão nem redigita o nome do elemento:
 * fonte única da verdade, e as duas coisas não podem divergir.
 *
 * FAIL-CLOSED: montar uma natureza cujo componente não existe nos rols semeados
 * é ERRO — não grava. É esta barreira que impede um elemento inventado (ou um
 * código de modalidade confundido com o de elemento) chegar ao `Dotacao.txt`.
 */

/** Uma natureza declarada pelos seus 4 componentes, no formato c.g.mm.ee. */
export interface NaturezaComum {
  /** 1º dígito — categoria econômica. */
  readonly categoria: string;
  /** 2º dígito — grupo de natureza da despesa (GND). */
  readonly grupo: string;
  /** 3º e 4º dígitos — modalidade de aplicação. */
  readonly modalidade: string;
  /** 5º e 6º dígitos — elemento de despesa. */
  readonly elemento: string;
}

export const NATUREZAS_COMUNS: readonly NaturezaComum[] = [
  { categoria: "3", grupo: "1", modalidade: "90", elemento: "11" }, // 3.1.90.11
  { categoria: "3", grupo: "1", modalidade: "90", elemento: "13" }, // 3.1.90.13
  { categoria: "3", grupo: "1", modalidade: "90", elemento: "94" }, // 3.1.90.94
  { categoria: "3", grupo: "3", modalidade: "90", elemento: "14" }, // 3.3.90.14
  { categoria: "3", grupo: "3", modalidade: "90", elemento: "30" }, // 3.3.90.30
  { categoria: "3", grupo: "3", modalidade: "90", elemento: "36" }, // 3.3.90.36
  { categoria: "3", grupo: "3", modalidade: "90", elemento: "39" }, // 3.3.90.39
  { categoria: "3", grupo: "3", modalidade: "90", elemento: "46" }, // 3.3.90.46
  { categoria: "3", grupo: "3", modalidade: "90", elemento: "47" }, // 3.3.90.47
  { categoria: "3", grupo: "3", modalidade: "90", elemento: "92" }, // 3.3.90.92
  { categoria: "4", grupo: "4", modalidade: "90", elemento: "51" }, // 4.4.90.51
  { categoria: "4", grupo: "4", modalidade: "90", elemento: "52" }, // 4.4.90.52
];

/** Uma natureza pronta para o banco — do jeito que o schema do M02 a espera. */
export interface NaturezaMontada {
  readonly codCategoria: string;
  readonly codNatureza: string; // = grupo (nome do campo no schema)
  readonly codModalidade: string;
  readonly codElemento: string;
  readonly codigoCompleto: string; // 6 dígitos, sem pontos
  readonly descricao: string; // = nome do ELEMENTO
  readonly mapeamentoStn: string;
}

/**
 * Monta uma natureza a partir dos componentes, validando cada um contra o rol
 * oficial. FAIL-CLOSED: qualquer componente ausente lança erro descritivo.
 *
 * Puro — sem I/O, testável sem banco.
 */
export function montarNatureza(n: NaturezaComum): NaturezaMontada {
  const rotulo = `${n.categoria}.${n.grupo}.${n.modalidade}.${n.elemento}`;

  const categoria = CATEGORIAS_ECONOMICAS.find((c) => c.codigo === n.categoria);
  if (categoria === undefined) {
    throw new Error(
      `Natureza ${rotulo}: categoria econômica "${n.categoria}" não existe no ` +
        `rol oficial (${CATEGORIAS_ECONOMICAS.map((c) => c.codigo).join(", ")}).`
    );
  }

  const grupo = GRUPOS_NATUREZA_DESPESA.find((g) => g.codigo === n.grupo);
  if (grupo === undefined) {
    throw new Error(
      `Natureza ${rotulo}: grupo de natureza "${n.grupo}" não existe no rol ` +
        `oficial (${GRUPOS_NATUREZA_DESPESA.map((g) => g.codigo).join(", ")}).`
    );
  }

  const modalidade = MODALIDADES_APLICACAO.find(
    (m) => m.codigo === n.modalidade
  );
  if (modalidade === undefined) {
    throw new Error(
      `Natureza ${rotulo}: modalidade de aplicação "${n.modalidade}" não existe ` +
        `no rol oficial.`
    );
  }

  // Aqui mora a proteção contra a COLISÃO elemento × modalidade: o elemento é
  // procurado em ELEMENTOS, nunca em MODALIDADES_APLICACAO.
  const elemento = ELEMENTOS.find((e) => e.codigo === n.elemento);
  if (elemento === undefined) {
    throw new Error(
      `Natureza ${rotulo}: elemento de despesa "${n.elemento}" não existe no ` +
        `Anexo II da 163/2001. (Atenção: "${n.elemento}" pode existir como ` +
        `MODALIDADE — são domínios diferentes.)`
    );
  }

  const codigoCompleto =
    n.categoria + n.grupo + n.modalidade + n.elemento;

  if (codigoCompleto.length !== 6) {
    throw new Error(
      `Natureza ${rotulo}: codigoCompleto "${codigoCompleto}" tem ` +
        `${codigoCompleto.length} dígitos, esperado 6.`
    );
  }

  return {
    codCategoria: n.categoria,
    codNatureza: n.grupo,
    codModalidade: n.modalidade,
    codElemento: n.elemento,
    codigoCompleto,
    descricao: elemento.nome,
    mapeamentoStn: codigoCompleto,
  };
}
