/**
 * V27 — M36 FROTA, o domínio puro: formato dos dados que o leiaute do SAGRES exige (§4.50 a §4.55) e o cálculo da
 * situação e do abastecimento de um mês. Nada aqui toca o banco.
 */

export const TIPOS_DE_FROTA = ["PROPRIO", "LOCADO", "PRESTACAO_DE_SERVICOS", "CEDIDO"] as const;
export type TipoDeFrota = (typeof TIPOS_DE_FROTA)[number];

export const SITUACOES_DA_FROTA = ["EM_USO", "EM_MANUTENCAO", "BAIXADA", "BAIXA_TEMPORARIA"] as const;
export type SituacaoDaFrota = (typeof SITUACOES_DA_FROTA)[number];

export const COMBUSTIVEIS = ["GASOLINA", "DIESEL", "ETANOL", "GAS_NATURAL", "ARLA_32", "ELETRICIDADE"] as const;
export type Combustivel = (typeof COMBUSTIVEIS)[number];

/** Rótulos de tela (vocabulário de negócio). */
export const ROTULO_TIPO_DE_FROTA: Readonly<Record<TipoDeFrota, string>> = {
  PROPRIO: "Próprio",
  LOCADO: "Locado",
  PRESTACAO_DE_SERVICOS: "Prestação de serviços",
  CEDIDO: "Cedido",
};
export const ROTULO_SITUACAO: Readonly<Record<SituacaoDaFrota, string>> = {
  EM_USO: "Em uso",
  EM_MANUTENCAO: "Em manutenção",
  BAIXADA: "Baixada",
  BAIXA_TEMPORARIA: "Baixa temporária",
};
export const ROTULO_COMBUSTIVEL: Readonly<Record<Combustivel, string>> = {
  GASOLINA: "Gasolina",
  DIESEL: "Diesel",
  ETANOL: "Etanol",
  GAS_NATURAL: "Gás natural (m³)",
  ARLA_32: "Arla 32",
  ELETRICIDADE: "Eletricidade",
};

/** Placa sem hífen e em maiúsculas: 3 letras, 1 dígito, letra ou dígito, 2 dígitos (antiga ou Mercosul). */
export function normalizarPlaca(bruta: string): string {
  const p = bruta.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)) {
    throw new Error(`A placa "${bruta}" não está no formato de placa brasileira (por exemplo ABC1234 ou ABC1D23). Nada foi gravado.`);
  }
  return p;
}

/** RENAVAM com 9 a 11 dígitos, completado com zeros à esquerda até 11 (o formato do leiaute). */
export function normalizarRenavam(bruto: string): string {
  const r = bruto.replace(/\D/g, "");
  if (r.length < 9 || r.length > 11) throw new Error(`O RENAVAM "${bruto}" deve ter de 9 a 11 dígitos. Nada foi gravado.`);
  return r.padStart(11, "0");
}

/** Código da máquina: até 7 letras ou dígitos, em maiúsculas. */
export function normalizarCodigoDaMaquina(bruto: string): string {
  const c = bruto.trim().toUpperCase();
  if (!/^[0-9A-Z]{1,7}$/.test(c)) throw new Error(`O código da máquina "${bruto}" deve ter até 7 letras ou dígitos, sem espaço. Nada foi gravado.`);
  return c;
}

/** Número do modelo na tabela do Tribunal: até 6 dígitos, ou nada (fica pendente para a remessa). */
export function normalizarNumeroDoModelo(bruto: string | null | undefined): string | null {
  const m = (bruto ?? "").trim();
  if (m === "") return null;
  if (!/^[0-9]{1,6}$/.test(m)) throw new Error(`O número do modelo "${bruto}" deve ter até 6 dígitos (o da tabela de modelos do Tribunal). Nada foi gravado.`);
  return m;
}

export function exigirAno(ano: number, oque: string, anoCorrente: number): void {
  if (!Number.isInteger(ano) || ano < 1900 || ano > anoCorrente + 1) {
    throw new Error(`O ${oque} ${String(ano)} não é válido (de 1900 a ${String(anoCorrente + 1)}). Nada foi gravado.`);
  }
}

/**
 * Quem é o dono e quem aluga, conforme o tipo de frota:
 * - próprio: o dono é a própria unidade gestora (nenhuma pessoa informada) e não há locador;
 * - locado e prestação de serviços: dono e locador informados;
 * - cedido: dono (quem cedeu) informado, sem locador.
 */
export function exigirDonoELocador(tipo: TipoDeFrota, proprietario: string | null, locador: string | null): void {
  if (tipo === "PROPRIO") {
    if (proprietario !== null) throw new Error("No bem próprio o dono é a própria unidade gestora: não informe outro proprietário. Nada foi gravado.");
    if (locador !== null) throw new Error("Bem próprio não tem locador. Nada foi gravado.");
    return;
  }
  if (proprietario === null) throw new Error(`Informe o CPF ou CNPJ do proprietário (bem ${ROTULO_TIPO_DE_FROTA[tipo].toLowerCase()}). Nada foi gravado.`);
  if (tipo === "CEDIDO") {
    if (locador !== null) throw new Error("Bem cedido não tem locador: informe só quem cedeu, como proprietário. Nada foi gravado.");
    return;
  }
  if (locador === null) throw new Error(`Informe o CPF ou CNPJ do locador ou prestador (bem ${ROTULO_TIPO_DE_FROTA[tipo].toLowerCase()}). Nada foi gravado.`);
}

/** Quantidade abastecida: positiva, com até 2 casas (o leiaute numérico de 16 posições tem 2 decimais). */
export function exigirQuantidade(bruta: string): string {
  const q = bruta.trim().replace(",", ".");
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(q) || Number(q) <= 0) {
    throw new Error(`A quantidade "${bruta}" deve ser positiva, com no máximo 2 casas decimais. Nada foi gravado.`);
  }
  return q;
}

// ── O mês ──────────────────────────────────────────────────────────────────────────────────────────

export interface MudancaNoDia {
  /** Dia civil AAAA-MM-DD. */
  readonly dia: string;
  readonly situacao: SituacaoDaFrota;
}

/**
 * As situações do mês para o arquivo SituacaoFrota (§4.54): a que vale no primeiro dia (com a data 01/mm) e cada
 * mudança dentro do mês, na data em que começou. O bem que ainda não existia no dia 1 começa no dia da primeira
 * situação. Sem nenhuma situação até o fim do mês, o bem não entra.
 *
 * `mudancas` já sem as anuladas; `prefixo` é AAAA-MM.
 */
export function situacoesDoMes(mudancas: readonly MudancaNoDia[], prefixo: string): readonly MudancaNoDia[] {
  const ordenadas = [...mudancas].sort((a, b) => a.dia.localeCompare(b.dia));
  const primeiro = `${prefixo}-01`;
  const antes = ordenadas.filter((m) => m.dia < primeiro);
  const dentro = ordenadas.filter((m) => m.dia.startsWith(prefixo));
  const saida: MudancaNoDia[] = [];
  const vigenteNoDia1 = antes[antes.length - 1];
  if (vigenteNoDia1 !== undefined && !dentro.some((m) => m.dia === primeiro)) saida.push({ dia: primeiro, situacao: vigenteNoDia1.situacao });
  saida.push(...dentro);
  return saida;
}

/** O bem esteve baixado o mês inteiro (baixado antes do dia 1 e sem mudança no mês): não exige abastecimento. */
export function baixadoNoMesInteiro(situacoes: readonly MudancaNoDia[]): boolean {
  return situacoes.length > 0 && situacoes.every((s) => s.situacao === "BAIXADA");
}

/** A situação que vale no dia civil `dia` (nula antes da primeira). */
export function situacaoNoDia(mudancas: readonly MudancaNoDia[], dia: string): SituacaoDaFrota | null {
  let atual: SituacaoDaFrota | null = null;
  for (const m of [...mudancas].sort((a, b) => a.dia.localeCompare(b.dia))) {
    if (m.dia > dia) break;
    atual = m.situacao;
  }
  return atual;
}
