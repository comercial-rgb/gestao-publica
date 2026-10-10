/**
 * O OFX DE ENSAIO (V39-007) — o arquivo de extrato fictício que os percursos importam, com o CHARSET que declara.
 *
 * ⚠️ O QUE ACONTECEU NA V38. O percurso da conciliação declarava `CHARSET:1252` e gravava com `writeFileSync(...,
 * "latin1")`. O "latin1" do Node não é o windows-1252: ele TRUNCA cada caractere ao byte baixo, e o travessão (U+2014)
 * virou o byte 0x14, um caractere de controle. O importador (`textoDoArquivoOfx`, que lê pelo charset declarado)
 * estava certo; o arquivo mentia. A saída provisória foi trocar tudo por ASCII, o que esconde o acento em vez de
 * provar a coerência.
 *
 * Aqui o texto vira bytes pelo windows-1252 de verdade (a tabela de 0x80–0x9F abaixo, mais o Latin-1 de 0xA0–0xFF),
 * e o que não cabe nele é RECUSADO com o caractere nomeado — nunca trocado em silêncio. A prova é de ida e volta pelo
 * decodificador da PLATAFORMA (`TextDecoder("windows-1252")`, implementação independente desta tabela) e pelo leitor
 * de OFX do sistema: `test/ofx-de-ensaio.test.ts`.
 */

/** Os 27 caracteres que o windows-1252 põe em 0x80–0x9F (onde o Latin-1 tem controles). */
const FAIXA_80_9F: Readonly<Record<number, number>> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** Texto → bytes em windows-1252. Recusa (com o caractere e a posição) o que o charset não representa. */
export function emWindows1252(texto: string): Uint8Array {
  const bytes: number[] = [];
  let i = 0;
  for (const ch of texto) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) bytes.push(cp);
    else if (FAIXA_80_9F[cp] !== undefined) bytes.push(FAIXA_80_9F[cp]);
    else throw new Error(`O caractere "${ch}" (U+${cp.toString(16).toUpperCase().padStart(4, "0")}, posição ${String(i)}) não existe em windows-1252; o arquivo declararia um charset que não respeita.`);
    i += 1;
  }
  return Uint8Array.from(bytes);
}

export interface TransacaoDeEnsaio {
  readonly fitid: string;
  /** O dia que o banco informa, "AAAA-MM-DD". */
  readonly dia: string;
  /** Valor com sinal, texto decimal ("-1000.00"): dinheiro não passa por ponto flutuante, nem no arquivo fictício. */
  readonly valor: string;
  readonly memo: string;
}

const dataOfx = (dia: string): string => `${dia.replace(/-/g, "")}120000[-3:BRT]`;

/** O OFX 1.02 (SGML) de ensaio, em windows-1252, com o cabeçalho que declara exatamente isso. */
export function ofxDeEnsaio(entrada: {
  readonly acctid: string;
  readonly inicio: string;
  readonly fim: string;
  readonly transacoes: readonly TransacaoDeEnsaio[];
}): Uint8Array {
  for (const t of entrada.transacoes) {
    if (!/^-?\d+\.\d{2}$/.test(t.valor)) throw new Error(`Valor "${t.valor}" da transação ${t.fitid} não é decimal com duas casas.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.dia)) throw new Error(`Dia "${t.dia}" da transação ${t.fitid} não é AAAA-MM-DD.`);
    if (/[<>\r\n]/.test(t.memo)) throw new Error(`O memo da transação ${t.fitid} tem < > ou quebra de linha, que o SGML do OFX não admite no valor.`);
  }
  const texto = [
    "OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252", "COMPRESSION:NONE", "OLDFILEUID:NONE", "NEWFILEUID:NONE", "",
    "<OFX>", "<SIGNONMSGSRSV1>", "<SONRS>", "<STATUS>", "<CODE>0", "<SEVERITY>INFO", "</STATUS>", `<DTSERVER>${dataOfx(entrada.fim)}`, "<LANGUAGE>POR", "</SONRS>", "</SIGNONMSGSRSV1>",
    "<BANKMSGSRSV1>", "<STMTTRNRS>", "<TRNUID>0", "<STATUS>", "<CODE>0", "<SEVERITY>INFO", "</STATUS>", "<STMTRS>", "<CURDEF>BRL",
    "<BANKACCTFROM>", "<BANKID>001", `<ACCTID>${entrada.acctid}`, "<ACCTTYPE>CHECKING", "</BANKACCTFROM>",
    "<BANKTRANLIST>", `<DTSTART>${entrada.inicio.replace(/-/g, "")}`, `<DTEND>${entrada.fim.replace(/-/g, "")}`,
    ...entrada.transacoes.flatMap((t) => ["<STMTTRN>", `<TRNTYPE>${t.valor.startsWith("-") ? "DEBIT" : "CREDIT"}`, `<DTPOSTED>${dataOfx(t.dia)}`, `<TRNAMT>${t.valor}`, `<FITID>${t.fitid}`, `<MEMO>${t.memo}`, "</STMTTRN>"]),
    "</BANKTRANLIST>", "</STMTRS>", "</STMTTRNRS>", "</BANKMSGSRSV1>", "</OFX>", "",
  ].join("\r\n");
  return emWindows1252(texto);
}
