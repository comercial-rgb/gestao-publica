/**
 * O DOCUMENTO — CPF e CNPJ. UMA normalização, UM formato, UM dígito verificador, e eles
 * moram abaixo de todos os módulos.
 *
 * ═══ POR QUE ISTO É UM PACOTE, E NÃO UMA FUNÇÃO DENTRO DE UM MÓDULO ═══
 * `normalizarDocumento` nasceu no M11 (licitações), porque a FK lógica entre
 * `Contrato.contratadoDocumento` e `CertidaoFornecedor.contratadoDocumento` só se sustenta
 * se os dois lados gravarem a MESMA string. O M19 (pessoas e credores) precisa exatamente
 * da mesma normalização, e pela mesma razão: `Empenho.credorCpfCnpj` é FK lógica para
 * `Pessoa.documento`.
 *
 * Uma segunda cópia teria funcionado — até o dia em que uma delas mudasse. É a lição do
 * `packages/estornaveis`, que nasceu porque a soma líquida existia em TRÊS implementações
 * e a parcial obrigaria a ensinar o caso novo às três: a que esquecesse mentiria em
 * silêncio. Aqui a mentira seria pior de achar — o mesmo fornecedor virando duas pessoas,
 * cada uma com metade do histórico, sem erro, sem log, sem nada que denuncie.
 *
 * Um `m19 → m11` também resolveria, mas é uma aresta ao contrário: o cadastro de pessoas
 * não deve nada às licitações. Normalizar documento não é regra de módulo nenhum.
 */

/** Só os dígitos. `null`/`undefined`/vazio devolvem string vazia — quem valida é o chamador. */
export function normalizarDocumento(bruto: string | null | undefined): string {
  if (bruto === null || bruto === undefined) return "";
  return bruto.replace(/\D/g, "");
}

/**
 * É um CPF (11) ou CNPJ (14) BEM FORMADO?
 *
 * ⚠️ FORMATO, NÃO DÍGITO VERIFICADOR — e a distinção é usada de verdade. Esta função
 * responde a mesma pergunta que os CHECKs do banco
 * (`ck_contrato_contratado_documento_formato`, `ck_certidao_documento_formato`), e responde
 * igual: é isso que permite ao chamador saber, ANTES de gravar, se o INSERT vai passar.
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

/**
 * O DÍGITO VERIFICADOR — a pergunta que o formato NÃO responde.
 *
 * ⚠️ E ELA É OPCIONAL DE PROPÓSITO, MÓDULO A MÓDULO. O M11 valida apenas o FORMATO, e
 * isso está certo lá: um contratado estrangeiro não tem CPF nem CNPJ, e recusar o
 * contrato dele por DV seria inventar uma regra que a lei não tem. O M19 valida o DV no
 * cadastro de pessoa, e isso está certo aqui: um documento com DV errado cria um credor
 * que não é ninguém — com histórico próprio e nenhum dono.
 *
 * Duas perguntas diferentes, duas funções, uma casa. Quem decide qual usar é o módulo,
 * e a decisão fica escrita no ponto de uso.
 *
 * ⚠️ NÃO consulta a Receita. Este repositório não finge protocolo que não tem — a
 * existência do documento é integração externa (docs/dependencias-externas.md).
 */
export function documentoTemDigitoValido(documento: string): boolean {
  const d = normalizarDocumento(documento);
  if (d.length === 11) return cpfValido(d);
  if (d.length === 14) return cnpjValido(d);
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

function cnpjValido(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  for (const [pesos, posicao] of [
    [pesos1, 12],
    [pesos2, 13],
  ] as const) {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) {
      soma += Number(cnpj[i]) * (pesos[i] as number);
    }
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(cnpj[posicao])) return false;
  }
  return true;
}

/** Só para EXIBIÇÃO — o banco guarda sem máscara, sempre. */
export function formatarDocumento(documento: string): string {
  const d = normalizarDocumento(documento);
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return d;
}
