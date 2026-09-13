/**
 * O DOCUMENTO — CPF e CNPJ. UMA normalização, UM formato, UM dígito verificador, e eles
 * moram abaixo de todos os módulos.
 *
 * ═══ POR QUE ISTO É UM PACOTE, E NÃO UMA FUNÇÃO DENTRO DE UM MÓDULO ═══
 * `normalizarDocumento` nasceu no M11 (licitações), porque a FK lógica entre
 * `Contrato.contratadoDocumento` e `CertidaoFornecedor.contratadoDocumento` só se sustenta
 * se os dois lados gravarem a MESMA string. O M19 (pessoas e credores) precisa exatamente
 * da mesma normalização, e pela mesma razão: `Empenho.credorCpfCnpj` é FK lógica para
 * `Pessoa.documento`. Uma segunda cópia teria funcionado — até o dia em que uma delas mudasse.
 *
 * ═══ SESSÃO NOTURNA V4 (§7) — O CNPJ ALFANUMÉRICO (achado A09) ═══
 * A Receita Federal gera CNPJ alfanumérico desde julho de 2026: doze caracteres [A-Z0-9] e
 * dois dígitos verificadores NUMÉRICOS, com o DV calculado sobre o valor ASCII − 48 de cada
 * caractere (dígitos 0–9 → 0–9, letras A–Z → 17–42), pesos 5..2,9..2 e 6..2,9..2, módulo 11
 * (resto < 2 → 0; senão 11 − resto). Fonte: "Cálculo dos dígitos verificadores de CNPJ
 * alfanumérico" (SERPRO/Receita Federal, 05/11/2024) e os arquivos de referência oficiais
 * (`codigos-cnpj.zip`), cujos vetores estão em `documento.test.ts`. CPF continua numérico; CNPJ
 * numérico continua válido (é o subconjunto sem letras, e o cálculo é o mesmo).
 *
 * A normalização anterior removia TUDO que não fosse dígito — e mutilava um CNPJ alfanumérico
 * em silêncio ("12ABC34501DE35" virava "123450135"). Agora ela tira só a MÁSCARA (`.`, `/`,
 * `-`, espaço) e põe as letras em maiúsculas; quem decide se o resultado é documento é
 * `tipoDeDocumento`, e um caractere fora de [A-Z0-9] torna o documento INVÁLIDO — não some.
 */

const MASCARA = /[.\-/\s]/g;

/**
 * Tira a máscara e põe em maiúsculas. `null`/`undefined`/vazio devolvem string vazia — quem
 * valida é o chamador. ⚠️ NÃO remove letras: um CNPJ alfanumérico tem letras de verdade.
 */
export function normalizarDocumento(bruto: string | null | undefined): string {
  if (bruto === null || bruto === undefined) return "";
  return bruto.replace(MASCARA, "").toUpperCase();
}

const CPF = /^[0-9]{11}$/;
const CNPJ = /^[A-Z0-9]{12}[0-9]{2}$/;

/**
 * É um CPF (11 dígitos) ou CNPJ (12 alfanuméricos + 2 dígitos) BEM FORMADO?
 *
 * ⚠️ FORMATO, NÃO DÍGITO VERIFICADOR — e a distinção é usada de verdade. Esta função
 * responde a mesma pergunta que os CHECKs do banco
 * (`ck_contrato_contratado_documento_formato`, `ck_certidao_documento_formato`), e responde
 * igual: é isso que permite ao chamador saber, ANTES de gravar, se o INSERT vai passar.
 */
export function documentoTemFormatoValido(documento: string): boolean {
  return CPF.test(documento) || CNPJ.test(documento);
}

/** CPF = 11 dígitos, CNPJ = 12 alfanuméricos + 2 dígitos. Qualquer outra coisa não é nenhum dos dois. */
export function tipoDeDocumento(documento: string): "CPF" | "CNPJ" | "INVALIDO" {
  if (CPF.test(documento)) return "CPF";
  if (CNPJ.test(documento)) return "CNPJ";
  return "INVALIDO";
}

/** O CNPJ tem letra? (o numérico é o subconjunto sem letras). Falso para o que não é CNPJ. */
export function cnpjEhAlfanumerico(documento: string): boolean {
  return CNPJ.test(documento) && /[A-Z]/.test(documento);
}

/**
 * O DÍGITO VERIFICADOR — a pergunta que o formato NÃO responde.
 *
 * ⚠️ E ELA É OPCIONAL DE PROPÓSITO, MÓDULO A MÓDULO. O M11 valida apenas o FORMATO (um
 * contratado estrangeiro não tem CPF nem CNPJ); o M19 valida o DV no cadastro de pessoa (um
 * documento com DV errado cria um credor que não é ninguém).
 *
 * ⚠️ NÃO consulta a Receita. A existência do documento é integração externa
 * (docs/dependencias-externas.md).
 */
export function documentoTemDigitoValido(documento: string): boolean {
  const d = normalizarDocumento(documento);
  if (CPF.test(d)) return cpfValido(d);
  if (CNPJ.test(d)) return cnpjValido(d);
  return false;
}

function cpfValido(cpf: string): boolean {
  // Repetição total (000…, 111…) passa na aritmética do DV e não é documento de ninguém.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  for (const [tamanho, posicao] of [
    [9, 9],
    [10, 10],
  ] as const) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) {
      soma += Number(cpf[i]) * (tamanho + 1 - i);
    }
    const resto = (soma * 10) % 11;
    const dv = resto === 10 || resto === 11 ? 0 : resto;
    if (dv !== Number(cpf[posicao])) return false;
  }
  return true;
}

/** O valor de cálculo de um caractere do CNPJ: ASCII − 48 (0–9 → 0–9; A–Z → 17–42). */
function valorDoCaractere(c: string): number {
  return c.charCodeAt(0) - 48;
}

const PESOS_DV = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/**
 * OS DOIS DÍGITOS VERIFICADORES de um CNPJ (12 caracteres [A-Z0-9], sem máscara), pela regra
 * oficial. Lança para entrada fora do formato ou para a raiz zerada (o CNPJ "zerado" não é de
 * ninguém). É a mesma função que valida: `documentoTemDigitoValido` compara o informado com isto.
 */
export function calcularDvDoCnpj(dozeCaracteres: string): string {
  const raiz = normalizarDocumento(dozeCaracteres);
  if (!/^[A-Z0-9]{12}$/.test(raiz) || raiz === "000000000000") {
    throw new Error(`Não é possível calcular o DV: "${dozeCaracteres}" não é a raiz de um CNPJ (12 caracteres A–Z/0–9).`);
  }
  let soma1 = 0;
  let soma2 = 0;
  for (let i = 0; i < 12; i++) {
    const v = valorDoCaractere(raiz[i] as string);
    soma1 += v * (PESOS_DV[i + 1] as number);
    soma2 += v * (PESOS_DV[i] as number);
  }
  const dv1 = soma1 % 11 < 2 ? 0 : 11 - (soma1 % 11);
  soma2 += dv1 * (PESOS_DV[12] as number);
  const dv2 = soma2 % 11 < 2 ? 0 : 11 - (soma2 % 11);
  return `${dv1}${dv2}`;
}

function cnpjValido(cnpj: string): boolean {
  if (cnpj === "00000000000000") return false;
  // Repetição total numérica (111…) passa na aritmética e não é documento de ninguém.
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  return calcularDvDoCnpj(cnpj.slice(0, 12)) === cnpj.slice(12);
}

/** Só para EXIBIÇÃO — o banco guarda sem máscara, sempre. Serve ao numérico e ao alfanumérico. */
export function formatarDocumento(documento: string): string {
  const d = normalizarDocumento(documento);
  if (CPF.test(d)) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (CNPJ.test(d)) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return d;
}
