/**
 * O ATALHO "CADASTRAR A PARTIR DO AVISO" (V37) — o endereço da tela de cadastro com o que o operador já
 * digitou e o caminho de volta.
 *
 * O documento só vai quando o texto É um documento (11 ou 14 dígitos, com ou sem máscara): um nome ou um
 * pedaço de número não preenche o campo de CPF/CNPJ, que recusaria. O retorno é a tela de origem (caminho
 * e consulta), e quem recebe confere que ele é interno (`lib/retorno-seguro.ts`).
 */
export const CADASTRO_DE_CREDOR = "/cadastros/pessoas/nova?papel=CREDOR";

export function linkDeCadastro(base: string, texto: string, retorno: string): string {
  const url = new URL(base, "http://interno");
  const t = texto.trim();
  const digitos = t.replace(/\D/g, "");
  const ehDocumento = (digitos.length === 11 || digitos.length === 14) && digitos.length === t.replace(/[\s./-]/g, "").length;
  if (ehDocumento) url.searchParams.set("documento", digitos);
  url.searchParams.set("retorno", retorno);
  return `${url.pathname}${url.search}`;
}

/**
 * A VOLTA com o cadastro escolhido: o caminho de retorno (já conferido como interno) com `credor=` na
 * consulta, que é o parâmetro que as telas de empenho e de solicitação leem para o campo já vir escolhido.
 */
export function voltaComCredor(retorno: string, documento: string): string {
  const [semAncora = "", ancora] = retorno.split("#", 2);
  const [caminho = "", consulta = ""] = semAncora.split("?", 2);
  const q = new URLSearchParams(consulta);
  q.set("credor", documento);
  return `${caminho}?${q.toString()}${ancora !== undefined ? `#${ancora}` : ""}`;
}
