import type { CampoLayout, LayoutArquivo } from "./registry.js";
import { ELEMENTO_SUBELEMENTO_2026, FONTE_CO_2026, SUBELEMENTOS_2026 } from "./dominios-2026v11.js";
import { LAYOUT_EMPENHOS, type EmpenhoFato, type LiquidacaoFato } from "./layout-2026v11.js";

/**
 * VALIDAÇÃO DO PACOTE SAGRES (F2) — antes de gerar o arquivo final.
 *
 * Três camadas, cada violação NOMEIA arquivo/linha/campo (o que a DIRETIVA §7 exige da UI):
 *  1. OBRIGATORIEDADE — um campo `obrigatorio` do layout com origem vazia (o TCE rejeitaria).
 *  2. DOMÍNIO — o valor existe nas tabelas oficiais dos xlsx (subelemento, elemento×subelemento,
 *     fonte×CO). PROIBIDO inventar domínio (PATCH §4): o que valida é o arquivo baixado.
 *  3. INTEGRIDADE REFERENCIAL — entre arquivos do MESMO pacote (a Liquidacao referencia um Empenho
 *     que TEM de existir no arquivo de Empenhos do mesmo dia).
 *
 * O validador NÃO conserta e NÃO gera — ele só aponta. Golden files nunca se auto-atualizam; um
 * arquivo inválido PARA na tela, com o campo, antes de qualquer download.
 */

export interface Violacao {
  readonly arquivo: string;
  /** 1-indexado (a linha do registro no arquivo). 0 = violação de pacote (entre arquivos). */
  readonly linha: number;
  readonly campo: string;
  readonly regra: "OBRIGATORIEDADE" | "DOMINIO" | "INTEGRIDADE_REFERENCIAL";
  readonly detalhe: string;
}

/** Um valor bruto está AUSENTE? (null/undefined, string vazia, ou só espaços). */
function ausente(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/**
 * (1) OBRIGATORIEDADE — genérico, guiado pela registry: todo campo `obrigatorio` (exceto RESERVADO)
 * cuja origem está vazia vira violação. É o que o TCE recusaria por "campo obrigatório não informado".
 */
export function validarObrigatorios<T>(layout: LayoutArquivo<T>, fatos: readonly T[]): Violacao[] {
  const v: Violacao[] = [];
  fatos.forEach((fato, i) => {
    for (const c of layout.campos) {
      if (!c.obrigatorio || c.tipo === "RESERVADO" || c.extrair === undefined) continue;
      if (ausente(c.extrair(fato))) {
        // A `origem` declarada na registry entra no detalhe: quando o campo é um GAP conhecido
        // (ex.: "GAP: m07.credorConsignatario é nome livre, não CPF/CNPJ → zeros"), a violação
        // NOMEIA o gap em vez de dizer só "sem valor". A tela passa a explicar o que falta e por quê
        // — que é o que a DIRETIVA §7 exige: nunca esconder, nunca inventar.
        v.push({
          arquivo: layout.entidade,
          linha: i + 1,
          campo: c.nome,
          regra: "OBRIGATORIEDADE",
          detalhe: `campo obrigatório sem valor — origem declarada: ${c.origem}`,
        });
      }
    }
  });
  return v;
}

/**
 * (2) DOMÍNIO (Empenhos) — subelemento, elemento×subelemento e fonte×CO contra os xlsx oficiais.
 * Só valida o que ESTÁ preenchido (a ausência é papel do validador de obrigatoriedade).
 */
export function validarDominioEmpenhos(empenhos: readonly EmpenhoFato[]): Violacao[] {
  const v: Violacao[] = [];
  const arquivo = LAYOUT_EMPENHOS.entidade;
  empenhos.forEach((e, i) => {
    const linha = i + 1;
    if (e.codSubelemento !== null && !SUBELEMENTOS_2026.has(e.codSubelemento)) {
      v.push({ arquivo, linha, campo: "codSubelementoDespesa", regra: "DOMINIO", detalhe: `subelemento "${e.codSubelemento}" não consta na tabela oficial (subelementos_2026)` });
    }
    if (e.codSubelemento !== null && !ELEMENTO_SUBELEMENTO_2026.has(`${e.codElementoDespesa}|${e.codSubelemento}`)) {
      v.push({ arquivo, linha, campo: "codSubelementoDespesa", regra: "DOMINIO", detalhe: `o par elemento ${e.codElementoDespesa} × subelemento ${e.codSubelemento} não é válido (relacao_elemento_subelemento_2026)` });
    }
    if (e.co !== null && !FONTE_CO_2026.has(`${e.codFonteRecurso}|${e.co}`)) {
      v.push({ arquivo, linha, campo: "co", regra: "DOMINIO", detalhe: `o par fonte ${e.codFonteRecurso} × CO ${e.co} não é válido (relacionamento_fonterecursos_co_2026)` });
    }
  });
  return v;
}

/**
 * (3) INTEGRIDADE REFERENCIAL — cada Liquidacao referencia um Empenho (codUG + ano + numEmpenho) que
 * TEM de existir no arquivo de Empenhos do MESMO pacote. Sem isso, o TCE recebe uma liquidação órfã.
 */
export function validarLiquidacaoReferenciaEmpenho(
  empenhos: readonly EmpenhoFato[],
  liquidacoes: readonly LiquidacaoFato[]
): Violacao[] {
  const chave = (codUG: string, ano: number, num: string): string => `${codUG}|${ano}|${num}`;
  const existentes = new Set(empenhos.map((e) => chave(e.codUnidadeGestora, e.anoEmissao, e.numEmpenho)));
  const v: Violacao[] = [];
  liquidacoes.forEach((l, i) => {
    if (!existentes.has(chave(l.codUnidadeGestora, l.anoEmissaoEmpenho, l.numEmpenho))) {
      v.push({
        arquivo: "Liquidacao",
        linha: i + 1,
        campo: "numEmpenho",
        regra: "INTEGRIDADE_REFERENCIAL",
        detalhe: `liquidação referencia o empenho ${l.numEmpenho}/${l.anoEmissaoEmpenho} (UG ${l.codUnidadeGestora}), que não está no arquivo de Empenhos do pacote`,
      });
    }
  });
  return v;
}

/** Uma linha de resumo legível de uma violação (para log e UI). */
export function descreverViolacao(v: Violacao): string {
  const onde = v.linha > 0 ? `linha ${v.linha}` : "pacote";
  return `[${v.regra}] ${v.arquivo} · ${onde} · campo ${v.campo}: ${v.detalhe}`;
}
