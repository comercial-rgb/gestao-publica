import { cliente, PortaSemBancoError } from "./cliente";
import { anexo3, type Anexo3 } from "../../modules/m12-relatorios/rreo-anexo3";
import { anexo7, type Anexo7 } from "../../modules/m12-relatorios/rreo-anexo7";
import { anexo12, type Anexo12 } from "../../modules/m12-relatorios/rreo-anexo12";
import { anexo8, type Anexo8 } from "../../modules/m12-relatorios/rreo-anexo8";
import { anexo11, type Anexo11 } from "../../modules/m12-relatorios/rreo-anexo11";
import { anexo13, type Anexo13 } from "../../modules/m12-relatorios/rreo-anexo13";
import { rgfAnexo1, type Anexo1Rgf, type Quadrimestre } from "../../modules/m12-relatorios/rgf-anexo1";
import { anexo1, type Anexo1 } from "../../modules/m12-relatorios/rreo-anexo1";
import { anexo2, type Anexo2 } from "../../modules/m12-relatorios/rreo-anexo2";
import { rgfAnexo5, COLUNAS_ANEXO5, type Anexo5 } from "../../modules/m12-relatorios/rgf-anexo5";
import { diferimentoFundeb, SOBRE_R_DIF, type DiferimentoFundeb } from "../../modules/m12-relatorios/mde-diferimento";
import { bloco2Mde, type AreaDeAtuacao, type Bloco2Mde, type IndicadorVaat, type RpDaFonte } from "../../modules/m12-relatorios/mde-vaat";
import { rgfAnexo2, LINHAS_ANEXO2, type Anexo2Rgf, type QuadroInformativo, type ValoresDaColuna } from "../../modules/m12-relatorios/rgf-anexo2";
import { rgfAnexo3, LINHAS_GARANTIA, LINHAS_CONTRAGARANTIA, type Anexo3Rgf, type ValoresColunaAnexo3, type LinhaGarantia } from "../../modules/m12-relatorios/rgf-anexo3";
import { rgfAnexo4, type Anexo4Rgf, type LinhaAnexo4, type ParPeriodo } from "../../modules/m12-relatorios/rgf-anexo4";
import { rgfAnexo6, type Anexo6Rgf, type BlocoDisponibilidade } from "../../modules/m12-relatorios/rgf-anexo6";
import { rreoAnexo14, type Anexo14Rreo } from "../../modules/m12-relatorios/rreo-anexo14";
import type { LinhaSimplificada } from "../../modules/m12-relatorios/simplificado";
import {
  anexo6,
  type Anexo6,
  type LinhaReceitaAnexo6,
  type LinhaDespesaAnexo6,
  type NaturezaNaoClassificada,
  type MetaFiscalLdo,
} from "../../modules/m12-relatorios/rreo-anexo6";
import {
  anexo6AbaixoDaLinha,
  type Anexo6AbaixoDaLinha,
  type LinhaAjusteMetodologico,
  type HarmonizacaoAnexo6,
} from "../../modules/m12-relatorios/rreo-anexo6-abaixo";
import { type Bimestre } from "../../modules/m12-relatorios/rreo-anexo1";
import { janelaCivilDeMeses } from "../../packages/datas/index";

/**
 * PORTA — RREO. A ÚNICA borda entre a UI e o domínio dos relatórios fiscais.
 *
 * ═══ ⚠️ POR QUE ESTA PASTA EXISTE, E POR QUE SÓ ELA IMPORTA O DOMÍNIO ═══
 * `app/**`, `components/**` e o resto de `lib/**` NÃO importam módulos (M01-M16) nem o Prisma —
 * o grep-teste `test/ui/fronteira-ui.test.ts` falha se importarem. `lib/portas/**` é a EXCEÇÃO
 * nomeada: é aqui que a leitura tipada do domínio vira dado de tela. Uma tela que importasse o
 * motor direto pularia esta borda — e é nela que, nas próximas fatias, entram a sessão (6.3), a
 * autorização (6.4) e a segregação por UG (6.5). Um `import "server-only"` seria o cinto extra —
 * mas ele é DEPENDÊNCIA NOVA, e a disciplina do repo é zero-dep (lib nova PARA e reporta). A
 * proteção que já temos basta: o grep-teste da fronteira barra a UI de importar o domínio, e um
 * bundle de client que importasse esta porta quebraria o build (o Prisma não bundla para browser).
 *
 * ═══ DINHEIRO É STRING — E JÁ CHEGA ASSIM ═══
 * O motor devolve todo valor como `string` (Decimal(18,2) serializado). A porta não converte nada
 * para `number`: a regra de ouro do domínio atravessa a borda intacta.
 *
 * TODO (6.3-sessao): hoje a porta lê SEM usuário logado — não há `exigir(...)` porque não há
 * sessão. Quando o 6.3 nascer, o `criadoPor`/`ug` da sessão entra AQUI, e a autorização de
 * leitura passa a valer antes de qualquer consulta.
 */

// O client singleton e o PortaSemBancoError moram em ./cliente (compartilhados por todas as portas).
export { PortaSemBancoError };

/** Os bimestres válidos — o mesmo rol fechado do domínio (1..6). */
export const BIMESTRES: readonly Bimestre[] = [1, 2, 3, 4, 5, 6];

/** `true` se `n` é um bimestre válido (1..6). Estreita o tipo para `Bimestre`. */
export function ehBimestre(n: number): n is Bimestre {
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

/**
 * A LEITURA do RREO Anexo 3 (Demonstrativo da RCL) para a tela.
 *
 * Devolve o `Anexo3` do motor (dinheiro em string). Lança `PortaSemBancoError` se não houver
 * banco; qualquer outro erro (ex.: natureza com forma inválida) sobe com a mensagem do domínio —
 * a página os traduz em estados de erro NOMEADOS, nunca numa tela branca.
 */
export async function gerarRreoAnexo3(p: {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
}): Promise<Anexo3> {
  return anexo3(cliente(), { exercicio: p.exercicio, bimestre: p.bimestre });
}

/**
 * A LEITURA do RREO Anexo 7 (Restos a Pagar por Poder e Órgão) para a tela.
 *
 * Devolve o `Anexo7` do motor (dinheiro em string). Lança `PortaSemBancoError` sem banco; se um
 * órgão com RP não tiver Poder mapeado, o motor lança com a mensagem nomeando o órgão (fail-closed)
 * — a página traduz em estado de erro nomeado, nunca numa tela branca.
 */
export async function gerarRreoAnexo7(p: {
  readonly exercicio: number;
}): Promise<Anexo7> {
  return anexo7(cliente(), { exercicio: p.exercicio });
}

/**
 * A LEITURA do RREO Anexo 12 (ASPS — Saúde, LC 141/2012) para a tela. Dinheiro em string.
 * Lança `PortaSemBancoError` sem banco; fonte de saúde sem classe ASPS mapeada faz o motor lançar
 * com a mensagem nomeando a fonte (fail-closed) — a página traduz em erro nomeado.
 */
export async function gerarRreoAnexo12(p: {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  readonly incluirIBS?: boolean;
}): Promise<Anexo12> {
  return anexo12(cliente(), {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    ...(p.incluirIBS !== undefined ? { incluirIBS: p.incluirIBS } : {}),
  });
}

/**
 * A LEITURA do RREO Anexo 8 (MDE — Educação) para a tela. Dinheiro em string. Fonte de educação
 * sem classe mapeada faz o motor lançar nomeando a fonte (fail-closed).
 */
export async function gerarRreoAnexo8(p: {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  readonly incluirIBS?: boolean;
}): Promise<Anexo8> {
  return anexo8(cliente(), {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    ...(p.incluirIBS !== undefined ? { incluirIBS: p.incluirIBS } : {}),
  });
}

/** A LEITURA do RREO Anexo 1 (Balanço Orçamentário) para a tela. */
export async function gerarRreoAnexo1(p: {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
}): Promise<Anexo1> {
  return anexo1(cliente(), { exercicio: p.exercicio, bimestre: p.bimestre });
}

/** A LEITURA do RREO Anexo 2 (Despesa por Função/Subfunção) para a tela. */
export async function gerarRreoAnexo2(p: {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
}): Promise<Anexo2> {
  return anexo2(cliente(), { exercicio: p.exercicio, bimestre: p.bimestre });
}

/** A LEITURA do RREO Anexo 11 (Alienação de Ativos) para a tela. Dinheiro em string. */
export async function gerarRreoAnexo11(p: {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
}): Promise<Anexo11> {
  return anexo11(cliente(), { exercicio: p.exercicio, bimestre: p.bimestre });
}

/** A LEITURA do RREO Anexo 13 (PPP) para a tela. Dinheiro em string. */
export async function gerarRreoAnexo13(p: {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
}): Promise<Anexo13> {
  return anexo13(cliente(), { exercicio: p.exercicio, bimestre: p.bimestre });
}

/** A LEITURA do RGF Anexo 1 (Despesa com Pessoal) para a tela. Dinheiro em string. */
export async function gerarRgfAnexo1(p: {
  readonly exercicio: number;
  readonly quadrimestre: Quadrimestre;
}): Promise<Anexo1Rgf> {
  return rgfAnexo1(cliente(), { exercicio: p.exercicio, quadrimestre: p.quadrimestre });
}

/**
 * RGF ANEXO 5 — disponibilidade de caixa e restos a pagar (LRF art. 55, III, "a").
 *
 * O corte é o ÚLTIMO INSTANTE do quadrimestre: o anexo é uma fotografia do caixa, e
 * "quanto sobrou" é sempre uma pergunta sobre um instante. Derivar o corte aqui (e não
 * pedi-lo à tela) mantém a definição de quadrimestre num lugar só.
 */
export async function gerarRgfAnexo5(p: {
  readonly exercicio: number;
  readonly quadrimestre: Quadrimestre;
}): Promise<Anexo5> {
  const mesFinal = p.quadrimestre * 4; // 1→abril, 2→agosto, 3→dezembro
  // ⚠️ O FIM DO BIMESTRE É O ÚLTIMO INSTANTE CIVIL DO ÚLTIMO DIA DELE. Em UTC a conta
  // acertava o DIA e errava a HORA — e é na hora que mora o fato da noite do dia 30.
  const corte = janelaCivilDeMeses(p.exercicio, 1, mesFinal).fim;
  return rgfAnexo5(cliente(), { exercicio: p.exercicio, corte });
}

export type { Anexo1, Anexo2, Anexo3, Anexo7, Anexo8, Anexo11, Anexo12, Anexo13, Anexo1Rgf, Anexo5, Quadrimestre, Bimestre };
export { COLUNAS_ANEXO5 };
export type { LinhaAnexo5 } from "../../modules/m12-relatorios/rgf-anexo5";
export type { PoderRgf, LinhaPessoal, LinhaNaoComputadaRgf } from "../../modules/m12-relatorios/rgf-anexo1";
export type { LinhaContratoPPP } from "../../modules/m12-relatorios/rreo-anexo13";
export type { LinhaReceitaAlienacao, LinhaAplicacaoAlienacao } from "../../modules/m12-relatorios/rreo-anexo11";
export type { LinhaReceitaRreo, LinhaDespesaRreo } from "../../modules/m12-relatorios/rreo-anexo1";
export type { LinhaFuncional } from "../../modules/m12-relatorios/rreo-anexo2";
export type {
  LinhaReceitaMde,
  LinhaFundebReceita,
  DespesaFundeb,
} from "../../modules/m12-relatorios/rreo-anexo8";
export type { LinhaRcl, ColunaMes } from "../../modules/m12-relatorios/rreo-anexo3";
export type { LinhaAnexo7, CelulasAnexo7 } from "../../modules/m12-relatorios/rreo-anexo7";
export type {
  LinhaReceitaAsps,
  LinhaDespesaAsps,
  LinhaNaoComputada,
} from "../../modules/m12-relatorios/rreo-anexo12";

/**
 * O DIFERIMENTO do art. 25, §3º (MDE bloco 2) para a tela.
 *
 * Sempre no retrato de 31/12 — o §3º é uma pergunta sobre o FIM do exercício ("ao final
 * do exercício as disponibilidades permanecem em conta vinculada"). Por isso não há
 * parâmetro de bimestre: o motor já consome o 6º.
 */
export async function gerarDiferimentoMde(p: {
  readonly exercicio: number;
}): Promise<DiferimentoFundeb> {
  return diferimentoFundeb(cliente(), { exercicio: p.exercicio });
}

export type { DiferimentoFundeb };
export { SOBRE_R_DIF };

/** O BLOCO 2 do Anexo 8 (VAAT, áreas de atuação, RP × lastro) para a tela. */
export async function gerarBloco2Mde(p: {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
}): Promise<Bloco2Mde> {
  return bloco2Mde(cliente(), { exercicio: p.exercicio, bimestre: p.bimestre });
}

export type { Bloco2Mde, IndicadorVaat, AreaDeAtuacao, RpDaFonte };

/** O RGF Anexo 2 (Dívida Consolidada Líquida) para a tela. Dinheiro em string. */
export async function gerarRgfAnexo2(p: {
  readonly exercicio: number;
  readonly quadrimestre: Quadrimestre;
}): Promise<Anexo2Rgf> {
  return rgfAnexo2(cliente(), { exercicio: p.exercicio, quadrimestre: p.quadrimestre });
}

export type { Anexo2Rgf, ValoresDaColuna, QuadroInformativo };
export { LINHAS_ANEXO2 };

/** O RGF Anexo 3 (Garantias e Contragarantias) para a tela. Dinheiro em string. */
export async function gerarRgfAnexo3(p: {
  readonly exercicio: number;
  readonly quadrimestre: Quadrimestre;
}): Promise<Anexo3Rgf> {
  return rgfAnexo3(cliente(), { exercicio: p.exercicio, quadrimestre: p.quadrimestre });
}

export type { Anexo3Rgf, ValoresColunaAnexo3, LinhaGarantia };
export { LINHAS_GARANTIA, LINHAS_CONTRAGARANTIA };

/** O RGF Anexo 4 (Operações de Crédito) para a tela. Dinheiro em string. */
export async function gerarRgfAnexo4(p: {
  readonly exercicio: number;
  readonly quadrimestre: Quadrimestre;
}): Promise<Anexo4Rgf> {
  return rgfAnexo4(cliente(), { exercicio: p.exercicio, quadrimestre: p.quadrimestre });
}

export type { Anexo4Rgf, LinhaAnexo4, ParPeriodo };

/** O RGF Anexo 6 (Demonstrativo Simplificado da Gestão Fiscal) para a tela. */
export async function gerarRgfAnexo6(p: {
  readonly exercicio: number;
  readonly quadrimestre: Quadrimestre;
}): Promise<Anexo6Rgf> {
  return rgfAnexo6(cliente(), { exercicio: p.exercicio, quadrimestre: p.quadrimestre });
}

export type { Anexo6Rgf, BlocoDisponibilidade, LinhaSimplificada };

/** O RREO Anexo 14 (Demonstrativo Simplificado do RREO) para a tela. */
export async function gerarRreoAnexo14(p: {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
}): Promise<Anexo14Rreo> {
  return rreoAnexo14(cliente(), { exercicio: p.exercicio, bimestre: p.bimestre });
}

export type { Anexo14Rreo };

/** O RREO Anexo 6 (Resultado Primário e Nominal, acima da linha). Dinheiro em string. */
export async function gerarRreoAnexo6(p: {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
}): Promise<Anexo6> {
  return anexo6(cliente(), { exercicio: p.exercicio, bimestre: p.bimestre });
}

export type { Anexo6, LinhaReceitaAnexo6, LinhaDespesaAnexo6, NaturezaNaoClassificada, MetaFiscalLdo };

/** O RREO Anexo 6 ABAIXO DA LINHA (variação da DCL) + harmonização com o acima. Dinheiro em string. */
export async function gerarRreoAnexo6Abaixo(p: {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
}): Promise<Anexo6AbaixoDaLinha> {
  return anexo6AbaixoDaLinha(cliente(), { exercicio: p.exercicio, bimestre: p.bimestre });
}

export type { Anexo6AbaixoDaLinha, LinhaAjusteMetodologico, HarmonizacaoAnexo6 };
