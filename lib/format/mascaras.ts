/**
 * MÁSCARAS BR — as funções PURAS, testáveis sem React.
 *
 * ⚠️ MÁSCARA É APRESENTAÇÃO. Nada aqui atravessa a fronteira UI→porta. O componente mostra
 * `1.234.567,89` e SUBMETE `1234.56`; mostra `12.345.678/0001-99` e SUBMETE `12345678000199`. As
 * Server Actions e as portas continuam recebendo exatamente o que recebiam antes da 7.9 — nenhuma
 * action foi tocada, e é assim que se sabe que a máscara não vazou para o domínio.
 *
 * O par natural: `moeda.ts` é a SAÍDA (domínio → tela), este arquivo é a ENTRADA (tela → domínio).
 * `desmascararValor` é a inversa de `formatarMoeda` — e a exibição do `CampoValor` REUSA
 * `formatarMoeda`, para que o número no input e o número na tabela sejam formatados pelo MESMO
 * código. Duas formatações de dinheiro divergiriam; esta é a lição dos dois de-paras, em pixel.
 *
 * ═══ ⚠️ A MÁSCARA NÃO VALIDA — E O QUE ELA NÃO ENTENDE, ELA ENTREGA CRU ═══
 * "A tela SUGERE; o domínio DECIDE" (MODULO-UI.md). Se `desmascararValor` não reconhece o texto,
 * ela devolve o texto **inalterado** para que o `zMoney` o recuse NOMEANDO o erro. A alternativa —
 * devolver "" ou 0 — trocaria uma recusa explícita por um dado errado silencioso, que é o modo de
 * falhar que este repositório recusa em todo lugar.
 */

/** Só os dígitos. É a base de toda máscara posicional (CPF/CNPJ, telefone, CEP). */
export function soDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

/**
 * ⚠️ O SEPARADOR DECIMAL É AMBÍGUO, E ESTA É A REGRA QUE O DESAMBIGUA.
 *
 * O campo EXIBE em pt-BR (`10.000,00` — ponto é milhar) mas os placeholders deste sistema sempre
 * ensinaram en-US (`10000.00` — ponto é decimal). O campo tem de aceitar os dois, e "1.234" lido
 * errado é um erro de 1000×. A regra, por ordem:
 *
 *   1. Tem vírgula?  → a vírgula é o decimal e o ponto é milhar.   "1.234,56" → 1234.56
 *   2. Só pontos, e o último tem 1-2 dígitos depois?  → decimal.   "1234.56"  → 1234.56
 *   3. Só pontos, e todos têm 3 dígitos depois?       → milhar.    "1.234.567" → 1234567
 *
 * O caso 2 é o que preserva o `placeholder="10000.00"` de antes da 7.9. O caso 3 é o que faz
 * "1.234" valer 1234 — que é o que ele significa em pt-BR, e a única leitura possível para dinheiro
 * de 2 casas (um "1.234" decimal seria 1 real e 234 milésimos).
 */
export function desmascararValor(texto: string): string {
  const limpo = texto.trim().replace(/\s|R\$/g, "");
  if (limpo === "") return "";

  // ⚠️ NEGATIVO CONTÁBIL: exibimos "(5.000,00)", então temos de saber LER de volta.
  const emParenteses = /^\((.*)\)$/.exec(limpo);
  const corpo = emParenteses?.[1] ?? limpo;
  const negativo = emParenteses !== null || corpo.startsWith("-");
  const semSinal = corpo.startsWith("-") ? corpo.slice(1) : corpo;

  // Não é algo que saibamos ler → devolve CRU para o domínio recusar. Ver o cabeçalho.
  if (semSinal === "" || !/^[\d.,]+$/.test(semSinal)) return texto;

  let inteiro: string;
  let centavos: string;

  if (semSinal.includes(",")) {
    // (1) vírgula manda: ela é o decimal, o ponto é milhar.
    const partes = semSinal.split(",");
    if (partes.length > 2) return texto; // "1,2,3" — não sabemos ler.
    inteiro = (partes[0] ?? "").replace(/\./g, "");
    centavos = partes[1] ?? "";
  } else {
    const partes = semSinal.split(".");
    const ultima = partes.length > 1 ? (partes[partes.length - 1] ?? "") : "";
    if (partes.length > 1 && ultima.length > 0 && ultima.length <= 2) {
      // (2) ponto decimal — o "10000.00" que os placeholders ensinaram.
      inteiro = partes.slice(0, -1).join("");
      centavos = ultima;
    } else {
      // (3) ponto de milhar (ou sem ponto nenhum).
      inteiro = partes.join("");
      centavos = "";
    }
  }

  if (!/^\d*$/.test(inteiro) || !/^\d*$/.test(centavos)) return texto;

  const inteiroFinal = inteiro === "" ? "0" : inteiro;
  const centavosFinal = (centavos + "00").slice(0, 2);
  const cru = `${inteiroFinal}.${centavosFinal}`;

  // ⚠️ "-0,00" não é negativo: zero não tem sinal contábil (mesma regra do `formatarMoeda`).
  const ehZero = /^0+$/.test(inteiroFinal) && centavosFinal === "00";
  return negativo && !ehZero ? `-${cru}` : cru;
}

/**
 * CPF (11 dígitos) ou CNPJ (14) — POR COMPRIMENTO, que é a única coisa que se sabe enquanto a
 * pessoa ainda está digitando. Excedente é cortado em 14; nada aqui julga se o número é VÁLIDO
 * (dígito verificador é assunto do domínio, não da máscara).
 */
export function mascararCpfCnpj(texto: string): string {
  const d = soDigitos(texto).slice(0, 14);
  if (d.length <= 11) {
    // 000.000.000-00
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  // 00.000.000/0000-00
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

/** (00) 00000-0000 no celular (11 dígitos); (00) 0000-0000 no fixo (10). Por comprimento. */
export function mascararTelefone(texto: string): string {
  const d = soDigitos(texto).slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/^\((\d{2})\) (\d{4})(\d)/, "($1) $2-$3");
  }
  return d
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/^\((\d{2})\) (\d{5})(\d)/, "($1) $2-$3");
}

/** 00000-000. */
export function mascararCep(texto: string): string {
  return soDigitos(texto)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");
}
