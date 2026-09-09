import { somarValoresDigitados } from "../../../../lib/format/moeda";

/**
 * O RASCUNHO DO DECRETO — a validação de FORMA do formulário, pura e compartilhada.
 *
 * ═══ ⚠️ ONDE ESTA VALIDAÇÃO COMEÇA E ONDE ELA PARA ═══
 * Ela cobre o que a TELA pode saber sozinha: campo em branco, valor que não é um decimal, decreto
 * sem nenhuma perna, duas pernas na MESMA ficha com o MESMO tipo. Nada disso é regra de negócio —
 * é o formulário conferindo se tem o suficiente para fazer a pergunta ao domínio.
 *
 * Ela NÃO cobre — e não pode — o teto da lei, o saldo disponível da ficha anulada, a
 * disponibilidade da fonte no recurso novo, o decreto já encerrado. Todos esses dependem de um
 * `SUM` lido DENTRO da transação, e um guard aqui estaria conferindo um número que já envelheceu
 * quando a gravação acontece. É a mesma decisão da porta de empenho ("nenhum guard aqui"): a tela
 * sugere, o domínio decide, e o erro do domínio sobe nomeado.
 *
 * ═══ ⚠️ O BALANCEAMENTO (TR 5.111) É AVISO, NUNCA BLOQUEIO ═══
 * `desequilibrioPorFonte` existe para o servidor público VER que as pernas não fecham antes de
 * submeter. Ele não impede o envio, e é de propósito: quem julga o balanceamento é o
 * `validarBalanceamento` do M03, no domínio puro. Se esta função bloqueasse, ela viraria um
 * segundo domínio — mal escrito, sem transação, e livre para divergir do primeiro no dia em que
 * a regra mudar num lugar só.
 *
 * Módulo PURO: sem React, sem `"use server"`, sem porta. É por isso que a Server Action e a ilha
 * client podem usar o MESMO código, e é por isso que ele se testa sem DOM e sem banco.
 */

export type TipoMovimento = "SUPLEMENTACAO" | "ANULACAO";

export type OrigemRecurso =
  | "ANULACAO"
  | "SUPERAVIT_FINANCEIRO"
  | "EXCESSO_ARRECADACAO"
  | "OPERACAO_CREDITO";

export const ORIGENS: readonly OrigemRecurso[] = [
  "ANULACAO",
  "SUPERAVIT_FINANCEIRO",
  "EXCESSO_ARRECADACAO",
  "OPERACAO_CREDITO",
];

/** Uma perna do decreto como o FORM a carrega. `fonteId` NÃO é digitado — ver abaixo. */
export interface MovimentoRascunho {
  readonly fichaId: string;
  readonly tipo: TipoMovimento;
  /** String decimal crua, como o `CampoValor` submete ("1234.56"). Pode vir vazia/meio-digitada. */
  readonly valor: string;
  /**
   * ⚠️ DERIVADO DA FICHA, NUNCA PEDIDO AO USUÁRIO. O adapter do M03 recusa item cuja fonte
   * divergir da fonte da ficha ("Fonte do item (X) diverge da fonte da ficha N (Y)"), então pedir
   * a fonte separadamente seria oferecer ao usuário a chance de errar num dado que o sistema já
   * conhece. É o mesmo precedente da conta bancária no pagamento (TR 5.23).
   */
  readonly fonteId: string;
  readonly fonteCodigo: string;
}

export interface RascunhoDecreto {
  readonly leiId: string;
  readonly numero: string;
  readonly data: string;
  readonly origemRecurso: string;
  readonly movimentos: readonly MovimentoRascunho[];
}

/** Uma string decimal bem-formada e POSITIVA — o que o domínio aceita como valor de perna. */
export function valorDigitavel(v: string): boolean {
  return /^\d+(\.\d+)?$/.test(v.trim()) && somarValoresDigitados([v]) !== "0.00";
}

export function ehOrigem(v: string): v is OrigemRecurso {
  return (ORIGENS as readonly string[]).includes(v);
}

/** O desequilíbrio por fonte: Σ SUPLEMENTACAO − Σ ANULACAO. Só as fontes que NÃO fecham. */
export interface DesequilibrioDaFonte {
  readonly fonteCodigo: string;
  /** String decimal com sinal: positivo = suplementou mais do que anulou. */
  readonly diferenca: string;
}

export function desequilibrioPorFonte(
  movimentos: readonly MovimentoRascunho[]
): readonly DesequilibrioDaFonte[] {
  const porFonte = new Map<string, string[]>();
  for (const m of movimentos) {
    if (!valorDigitavel(m.valor)) continue;
    const parcelas = porFonte.get(m.fonteCodigo) ?? [];
    parcelas.push(m.tipo === "SUPLEMENTACAO" ? m.valor.trim() : `-${m.valor.trim()}`);
    porFonte.set(m.fonteCodigo, parcelas);
  }
  const fora: DesequilibrioDaFonte[] = [];
  for (const [fonteCodigo, parcelas] of [...porFonte.entries()].sort()) {
    const diferenca = somarValoresDigitados(parcelas);
    if (diferenca !== "0.00") fora.push({ fonteCodigo, diferenca });
  }
  return fora;
}

/**
 * Os erros de FORMA do rascunho, em português, na ordem em que se lê o formulário.
 * Lista vazia = há o suficiente para PERGUNTAR ao domínio (não "está correto").
 */
export function errosDoRascunho(r: RascunhoDecreto): readonly string[] {
  const erros: string[] = [];
  if (r.leiId.trim() === "") erros.push("Escolha a lei que autoriza este crédito.");
  if (r.numero.trim() === "") erros.push("Informe o número do decreto.");
  if (r.data.trim() === "") erros.push("Informe a data do decreto.");
  if (!ehOrigem(r.origemRecurso)) erros.push("Escolha a origem do recurso.");

  if (r.movimentos.length === 0) {
    erros.push("Um decreto sem movimento não altera dotação nenhuma — inclua ao menos uma perna.");
  }
  r.movimentos.forEach((m, i) => {
    const onde = `Movimento ${i + 1}`;
    if (m.fichaId.trim() === "") erros.push(`${onde}: escolha a ficha.`);
    if (!valorDigitavel(m.valor)) erros.push(`${onde}: informe um valor maior que zero.`);
  });

  // Duas pernas idênticas (mesma ficha, mesmo tipo) não são proibidas pelo domínio — ele as
  // somaria. Mas quase sempre são a MESMA linha digitada duas vezes, e o dobro do crédito
  // entraria calado. O form pede para consolidar; não é regra contábil, é defesa contra o duplo
  // clique — por isso a mensagem diz o que fazer, e não "proibido".
  const vistos = new Set<string>();
  for (const m of r.movimentos) {
    if (m.fichaId.trim() === "") continue;
    const chave = `${m.fichaId}|${m.tipo}`;
    if (vistos.has(chave)) {
      erros.push(
        `A mesma ficha aparece duas vezes com o mesmo tipo de movimento — some os valores numa linha só.`
      );
      break;
    }
    vistos.add(chave);
  }
  return erros;
}
