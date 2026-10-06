import type { ParcelaInformada } from "./parcelas-da-divida.js";

/**
 * V36 — O CRONOGRAMA DA DÍVIDA COLADO DE UMA PLANILHA: uma parcela por linha,
 *   número ; vencimento ; principal ; encargos (opcional)
 * separados por ponto e vírgula ou tabulação (o que a planilha entrega ao copiar). O vencimento vem como
 * dd/mm/aaaa ou aaaa-mm-dd; o valor em reais como a pessoa o digita ("1.234,56") ou no formato do sistema
 * ("1234.56"). PURO: devolve as parcelas ou lança com TODAS as linhas recusadas, cada uma com o número dela —
 * recusar a primeira e esconder as outras faria a pessoa colar dez vezes.
 *
 * ⚠️ O separador de milhar só sai quando há vírgula decimal: "400.00" continua 400, não 40000.
 */

function valor(t: string): string | null {
  const s = t.trim().replace(/^R\$\s*/, "");
  const normalizado = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return /^\d+(\.\d{1,2})?$/.test(normalizado) ? (normalizado.includes(".") ? normalizado.padEnd(normalizado.indexOf(".") + 3, "0") : `${normalizado}.00`) : null;
}

function dia(t: string): string | null {
  const s = t.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  const iso = br !== null ? `${br[3]}-${br[2]}-${br[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  if (iso === null) return null;
  const [a, m, d] = iso.split("-").map(Number) as [number, number, number];
  const data = new Date(Date.UTC(a, m - 1, d));
  // 31/02 não é dia: a data normalizada tem de voltar igual.
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d ? iso : null;
}

export function lerCronogramaColado(texto: string): readonly ParcelaInformada[] {
  const parcelas: ParcelaInformada[] = [];
  const erros: string[] = [];
  const linhas = texto.split(/\r?\n/);
  linhas.forEach((bruta, i) => {
    if (bruta.trim() === "") return;
    const n = i + 1;
    const campos = bruta.split(/;|\t/).map((c) => c.trim());
    if (campos.length < 3 || campos.length > 4) {
      erros.push(`linha ${String(n)}: são 3 ou 4 campos (número; vencimento; principal; encargos), e vieram ${String(campos.length)}`);
      return;
    }
    const [numeroT, vencT, principalT, encargosT] = campos as [string, string, string, string | undefined];
    const numero = /^\d+$/.test(numeroT) ? Number(numeroT) : NaN;
    const vencimento = dia(vencT);
    const principal = valor(principalT);
    const encargos = encargosT === undefined || encargosT === "" ? null : valor(encargosT);
    const problemas: string[] = [];
    if (!Number.isInteger(numero) || numero <= 0) problemas.push(`número "${numeroT}"`);
    if (vencimento === null) problemas.push(`vencimento "${vencT}" (use dd/mm/aaaa)`);
    if (principal === null) problemas.push(`principal "${principalT}" (use 1.234,56)`);
    if (encargosT !== undefined && encargosT !== "" && encargos === null) problemas.push(`encargos "${encargosT}" (use 1.234,56)`);
    if (problemas.length > 0) {
      erros.push(`linha ${String(n)}: ${problemas.join(", ")}`);
      return;
    }
    parcelas.push({ numero, vencimento: vencimento!, valorPrincipal: principal!, valorEncargos: encargos });
  });
  if (erros.length > 0) throw new Error(`O cronograma não foi lido:\n${erros.join("\n")}\nNada foi gravado.`);
  if (parcelas.length === 0) throw new Error("O cronograma está vazio. Cole uma parcela por linha. Nada foi gravado.");
  return parcelas;
}
