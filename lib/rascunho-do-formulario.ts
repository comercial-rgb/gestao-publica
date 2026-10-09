/**
 * O RASCUNHO DE UM FORMULÁRIO QUE SAI PARA O ATALHO DE CADASTRO (V38, AUD-015).
 *
 * O atalho "cadastrar a partir do aviso" (V37) leva o documento e volta com o cadastro escolhido, mas a tela de origem
 * recarrega e o que já se tinha preenchido se perdia. O rascunho guarda os campos DECLARADOS do formulário no
 * armazenamento da aba antes de sair e os devolve na volta, uma vez só.
 *
 * ⚠️ O RASCUNHO É SUGESTÃO, NÃO DADO. Ele só repõe o que a pessoa já tinha digitado na própria aba; o envio continua
 * passando por toda a validação do servidor. Rascunho velho (mais de 2 h), de outra versão, malformado ou com campo
 * não declarado é ignorado inteiro — melhor perder o rascunho que repor algo que a pessoa não digitou.
 */

const VERSAO = 1;
export const VALIDADE_DO_RASCUNHO_MS = 2 * 60 * 60 * 1000;

export function serializarRascunho(campos: Readonly<Record<string, string>>, agora: Date): string {
  return JSON.stringify({ v: VERSAO, em: agora.getTime(), campos });
}

/** Lê o rascunho, puro: devolve só os campos declarados e não vazios, ou `null` se ele não serve. */
export function lerRascunho(texto: string | null, declarados: readonly string[], agora: Date): Readonly<Record<string, string>> | null {
  if (texto === null || texto === "") return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return null;
  }
  if (typeof bruto !== "object" || bruto === null) return null;
  const r = bruto as { v?: unknown; em?: unknown; campos?: unknown };
  if (r.v !== VERSAO || typeof r.em !== "number" || typeof r.campos !== "object" || r.campos === null) return null;
  const idade = agora.getTime() - r.em;
  if (idade < 0 || idade > VALIDADE_DO_RASCUNHO_MS) return null;
  const saida: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.campos as Record<string, unknown>)) {
    if (!declarados.includes(k) || typeof v !== "string") return null;
    if (v !== "") saida[k] = v;
  }
  return Object.keys(saida).length === 0 ? null : saida;
}

interface ArmazenamentoDaAba {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
}
/** O `sessionStorage` do navegador, sem depender dos tipos do DOM (este arquivo também compila no backend). */
const aba = (): ArmazenamentoDaAba | undefined => (globalThis as { sessionStorage?: ArmazenamentoDaAba }).sessionStorage;

/** O armazenamento da aba pode faltar (aba privada, bloqueio): toda leitura e escrita é tentativa. */
export function guardarNaAba(chave: string, valor: string): void {
  try {
    aba()?.setItem(chave, valor);
  } catch {
    // sem armazenamento, sem rascunho: a tela segue como antes
  }
}

/** Lê e APAGA (o rascunho volta uma vez só). */
export function tirarDaAba(chave: string): string | null {
  try {
    const s = aba();
    if (s === undefined) return null;
    const v = s.getItem(chave);
    s.removeItem(chave);
    return v;
  } catch {
    return null;
  }
}
