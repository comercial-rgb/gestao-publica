/**
 * O DOCUMENTO DO CONTRATADO — UMA função de normalização, e é ela em toda parte.
 *
 * ═══ ⚠️ POR QUE UMA FUNÇÃO, E NÃO "lembre-se de tirar a pontuação" ═══
 * `CertidaoFornecedor.contratadoDocumento` é FK LÓGICA para
 * `Contrato.contratadoDocumento` — não há model `Fornecedor` neste repositório. FK lógica não é
 * verificada pelo banco: o que a mantém honesta é os dois lados gravarem a MESMA string.
 *
 * Se um CNPJ entrar como "12.345.678/0001-99" no contrato e "12345678000199" na certidão, eles
 * viram DUAS empresas. A certidão fica pendurada numa, e a tela da outra a declara ausente — um
 * fornecedor com certidão válida aparecendo como irregular, sem erro, sem log, sem nada que
 * denuncie. É o defeito que só se descobre quando o Tribunal pergunta.
 *
 * O CHECK do banco (`ck_contrato_contratado_documento_formato` e
 * `ck_certidao_documento_formato`) RECUSA o que não for 11 ou 14 dígitos — mas recusar é tarde:
 * o usuário digitou com máscara porque o formulário mostrou máscara. Normalizar é o que faz o
 * CHECK nunca disparar.
 */

/** Só os dígitos. `null`/`undefined`/vazio devolvem string vazia — quem valida é o chamador. */
export function normalizarDocumento(bruto: string | null | undefined): string {
  if (bruto === null || bruto === undefined) return "";
  return bruto.replace(/\D/g, "");
}

/**
 * É um CPF (11) ou CNPJ (14) BEM FORMADO?
 *
 * ⚠️ FORMATO, NÃO DÍGITO VERIFICADOR. Esta função responde a mesma pergunta que o CHECK do banco,
 * e responde igual — é isso que a torna útil: o chamador sabe, antes de gravar, se o INSERT vai
 * passar. Validar o DV é outra pergunta (e um contratado estrangeiro não tem CPF/CNPJ nenhum).
 */
export function documentoTemFormatoValido(documento: string): boolean {
  return /^[0-9]{11}$/.test(documento) || /^[0-9]{14}$/.test(documento);
}

/** CPF = 11 dígitos, CNPJ = 14. Qualquer outra coisa não é nenhum dos dois. */
export function tipoDeDocumento(documento: string): "CPF" | "CNPJ" | "INVALIDO" {
  if (/^[0-9]{11}$/.test(documento)) return "CPF";
  if (/^[0-9]{14}$/.test(documento)) return "CNPJ";
  return "INVALIDO";
}
