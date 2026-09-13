/**
 * EXTRATOR CONSTRITO DE NF-e / NFC-e (modelos 55 e 65).
 *
 * ⚠️ NÃO É UM PROCESSADOR XML GENÉRICO. Não resolve entidade, não carrega DTD, não
 * segue URL. Recusa DOCTYPE/ENTITY/SYSTEM antes de ler qualquer tag. Tamanho máximo
 * 1 MiB; no máximo 200 itens. Os cinco escapes XML predefinidos são os únicos
 * decodificados no texto das folhas.
 *
 * Importar o XML registra o documento. Não afirma autorização da SEFAZ nem
 * aceite do órgão — validação estrutural, consulta externa e aceitação são estados
 * separados.
 */

export const TAMANHO_MAXIMO_XML_BYTES = 1_048_576;
export const ITENS_MAXIMOS_NFE = 200;

export interface ItemExtraidoDaNfe {
  readonly codigo: string;
  readonly descricao: string;
  readonly unidade: string;
  readonly quantidade: string;
  readonly valorUnitario: string;
  readonly desconto: string;
  readonly valorTotal: string;
}

export interface NfeExtraida {
  readonly modelo: "NFE" | "NFCE";
  readonly serie: string;
  readonly numero: string;
  readonly chaveAcesso: string | null;
  readonly dataEmissaoIso: string;
  readonly emitenteCnpj: string;
  readonly destinatarioCnpj: string | null;
  readonly valorProdutos: string;
  readonly valorDescontos: string;
  readonly valorTotal: string;
  readonly itens: readonly ItemExtraidoDaNfe[];
}

const PREDEFINIDOS: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

function decodificarTexto(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (todo, nome: string) => {
    if (nome.startsWith("#")) return todo;
    return PREDEFINIDOS[nome] ?? todo;
  });
}

export function recusarXmlInseguro(xml: string): string | null {
  if (xml.length > TAMANHO_MAXIMO_XML_BYTES) {
    return `XML de ${xml.length} bytes excede o limite de 1 MB. Nada foi gravado.`;
  }
  if (xml.length === 0) return "Arquivo XML vazio. Nada foi gravado.";
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    return "XML com DTD ou entidade recusado. Nada foi gravado.";
  }
  if (/\bSYSTEM\s+["']/i.test(xml) || /\bPUBLIC\s+["']/i.test(xml)) {
    return "XML com referência externa recusado. Nada foi gravado.";
  }
  const semBom = xml.replace(/^\uFEFF/, "").trimStart();
  if (!semBom.startsWith("<")) {
    return "O arquivo não é XML (não começa com '<'). A conferência é do conteúdo, não da extensão.";
  }
  return null;
}

function primeiraFolha(xml: string, tag: string): string | null {
  const abre = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "i");
  const m = abre.exec(xml);
  if (m === null || m.index === undefined) return null;
  const inicio = m.index + m[0].length;
  const fecha = `</${tag}>`;
  const fim = xml.toLowerCase().indexOf(fecha.toLowerCase(), inicio);
  if (fim < 0) return null;
  const interno = xml.slice(inicio, fim);
  if (interno.includes("<")) return interno.replace(/<[^>]+>/g, "").trim();
  return decodificarTexto(interno).trim();
}

function blocos(xml: string, tag: string): readonly string[] {
  const abre = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "gi");
  const fecha = `</${tag}>`;
  const saida: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = abre.exec(xml)) !== null) {
    const inicio = abre.lastIndex;
    const fimAbs = xml.toLowerCase().indexOf(fecha.toLowerCase(), inicio);
    if (fimAbs < 0) break;
    saida.push(xml.slice(inicio, fimAbs));
    abre.lastIndex = fimAbs + fecha.length;
    if (saida.length > ITENS_MAXIMOS_NFE) {
      throw new Error(
        `XML com mais de ${ITENS_MAXIMOS_NFE} itens recusado. Nada foi gravado.`
      );
    }
  }
  return saida;
}

function atributo(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]+)"`, "i");
  const m = re.exec(xml);
  return m?.[1] ?? null;
}

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Extrai os campos da NF-e/NFC-e suportada. Recusa estrutura que não dá para
 * identificar emitente, número e total.
 */
export function extrairNfe(xml: string): NfeExtraida {
  const recusa = recusarXmlInseguro(xml);
  if (recusa !== null) throw new Error(recusa);

  const mod = primeiraFolha(xml, "mod");
  if (mod !== "55" && mod !== "65") {
    throw new Error(
      `Modelo XML "${mod ?? "ausente"}" não é NF-e (55) nem NFC-e (65). ` +
        `O percurso manual permanece disponível. Nada foi gravado.`
    );
  }

  const serie = primeiraFolha(xml, "serie") ?? "0";
  const numero = primeiraFolha(xml, "nNF");
  if (numero === null || numero === "") {
    throw new Error("XML sem número da nota (nNF). Nada foi gravado.");
  }

  const idInf = atributo(xml, "infNFe", "Id") ?? atributo(xml, "infNFe", "id");
  let chaveAcesso: string | null = null;
  if (idInf !== null) {
    const d = soDigitos(idInf.replace(/^NFe/i, ""));
    if (d.length === 44) chaveAcesso = d;
  }
  if (chaveAcesso === null) {
    const ch = primeiraFolha(xml, "chNFe");
    if (ch !== null) {
      const d = soDigitos(ch);
      if (d.length === 44) chaveAcesso = d;
    }
  }

  const dhEmi = primeiraFolha(xml, "dhEmi") ?? primeiraFolha(xml, "dEmi");
  if (dhEmi === null) throw new Error("XML sem data de emissão. Nada foi gravado.");

  const emitBloco = blocos(xml, "emit")[0];
  const emitenteCnpj = soDigitos(primeiraFolha(emitBloco ?? xml, "CNPJ") ?? "");
  if (emitenteCnpj.length !== 14) {
    throw new Error("XML sem CNPJ do emitente com 14 dígitos. Nada foi gravado.");
  }

  const destBloco = blocos(xml, "dest")[0];
  const destinatarioCnpj =
    destBloco === undefined ? null : soDigitos(primeiraFolha(destBloco, "CNPJ") ?? "") || null;

  const totais = blocos(xml, "ICMSTot")[0];
  const valorProdutos = (totais !== undefined ? primeiraFolha(totais, "vProd") : null) ?? "0";
  const valorDescontos = (totais !== undefined ? primeiraFolha(totais, "vDesc") : null) ?? "0";
  const valorTotal = (totais !== undefined ? primeiraFolha(totais, "vNF") : null) ?? primeiraFolha(xml, "vNF");
  if (valorTotal === null) throw new Error("XML sem total da nota (vNF). Nada foi gravado.");

  const itens: ItemExtraidoDaNfe[] = [];
  for (const det of blocos(xml, "det")) {
    const prod = blocos(det, "prod")[0] ?? det;
    itens.push({
      codigo: primeiraFolha(prod, "cProd") ?? "",
      descricao: primeiraFolha(prod, "xProd") ?? "item",
      unidade: primeiraFolha(prod, "uCom") ?? "UN",
      quantidade: primeiraFolha(prod, "qCom") ?? "0",
      valorUnitario: primeiraFolha(prod, "vUnCom") ?? "0",
      desconto: primeiraFolha(prod, "vDesc") ?? "0",
      valorTotal: primeiraFolha(prod, "vProd") ?? "0",
    });
  }
  if (itens.length === 0) {
    throw new Error("XML sem itens (det/prod). Nada foi gravado.");
  }

  return {
    modelo: mod === "65" ? "NFCE" : "NFE",
    serie,
    numero,
    chaveAcesso,
    dataEmissaoIso: dhEmi,
    emitenteCnpj,
    destinatarioCnpj,
    valorProdutos,
    valorDescontos,
    valorTotal,
    itens,
  };
}
