/**
 * RELATÓRIO DE ATUALIZAÇÕES ORÇAMENTÁRIAS (TR 4.40) — o ACHATAMENTO e os FILTROS, puros.
 *
 * ═══ ⚠️ POR QUE ISTO É UMA FUNÇÃO PURA EM `lib/`, E NÃO UMA CONSULTA NOVA ═══
 * A leitura já existe: `listarDecretos` (M03) devolve os decretos do exercício com os itens, e
 * cada item já traz ficha, unidade, fonte, tipo e valor. O que este relatório faz é MUDAR O GRÃO —
 * de "um decreto com N itens" para "uma linha por movimento" — e recortar. Nenhuma das duas
 * operações precisa do banco, e escrever um segundo `findMany` com `where` para cada combinação de
 * filtro criaria uma leitura paralela, livre para divergir da que a tela de créditos usa.
 *
 * ⚠️ NENHUMA ARITMÉTICA NOVA. Os valores das linhas são os valores dos itens, como o M03 os
 * entregou. Os totais do rodapé são Σ das MESMAS linhas exibidas — se o filtro esconde uma linha,
 * ela sai do total, e é isso que faz um relatório filtrado ser conferível: o que se soma é o que
 * se vê.
 *
 * ⚠️ ZONA 1 (não é porta): sem `modules/**`, sem Prisma. Recebe o que a porta já leu.
 *
 * ⚠️ O ITEM ANULADO (estornado) PERMANECE NA LISTA, marcado. Ele é um fato que aconteceu e foi
 * desfeito — sumir com ele faria o relatório mentir sobre o histórico, e o `listarDecretos` já
 * o exclui dos TOTAIS do decreto. Aqui ele entra na listagem com a marca e FORA da soma, pela
 * mesma razão.
 */

export interface DecretoParaRelatorio {
  readonly id: string;
  readonly numero: string;
  readonly ano: number;
  readonly data: Date;
  readonly origemRecurso: string;
  readonly leiNumero: string;
  readonly leiAno: number;
  readonly tipoCredito: string;
  readonly encerrado: boolean;
  readonly itens: readonly {
    readonly id: string;
    readonly tipo: "SUPLEMENTACAO" | "ANULACAO";
    readonly valor: string;
    readonly fichaNumero: number;
    readonly unidadeCodigo: string;
    readonly fonteCodigo: string;
    readonly anulado: boolean;
  }[];
}

/** Uma ATUALIZAÇÃO ORÇAMENTÁRIA: um movimento de crédito, com o decreto que o produziu. */
export interface LinhaAtualizacao {
  readonly id: string;
  readonly decretoNumero: string;
  readonly decretoAno: number;
  readonly data: Date;
  readonly leiNumero: string;
  readonly leiAno: number;
  readonly tipoCredito: string;
  readonly origemRecurso: string;
  readonly decretoEncerrado: boolean;
  readonly fichaNumero: number;
  readonly unidadeCodigo: string;
  readonly fonteCodigo: string;
  readonly tipo: "SUPLEMENTACAO" | "ANULACAO";
  readonly valor: string;
  /** Item estornado: continua listado (é um fato), mas fora dos totais. */
  readonly anulado: boolean;
}

/**
 * Os FILTROS do 4.40. Todos opcionais; ausentes/vazios = sem recorte naquele eixo.
 *
 * ⚠️ `ficha` é comparada como TEXTO da forma exata, não como prefixo: a ficha 1 e a ficha 10 são
 * fichas diferentes, e um `startsWith` traria as duas para quem pediu uma. Decreto, fonte e UG
 * também são identificadores — igualdade, nunca "contém".
 */
export interface FiltroAtualizacoes {
  readonly ficha?: string | undefined;
  readonly decreto?: string | undefined;
  readonly fonte?: string | undefined;
  readonly unidade?: string | undefined;
}

const vazio = (v: string | undefined): boolean => v === undefined || v.trim() === "";

/** Achata os decretos em linhas de movimento, na ordem do decreto e depois da ficha. */
export function linhasDeAtualizacao(
  decretos: readonly DecretoParaRelatorio[]
): readonly LinhaAtualizacao[] {
  const linhas: LinhaAtualizacao[] = [];
  for (const d of decretos) {
    for (const i of d.itens) {
      linhas.push({
        id: i.id,
        decretoNumero: d.numero,
        decretoAno: d.ano,
        data: d.data,
        leiNumero: d.leiNumero,
        leiAno: d.leiAno,
        tipoCredito: d.tipoCredito,
        origemRecurso: d.origemRecurso,
        decretoEncerrado: d.encerrado,
        fichaNumero: i.fichaNumero,
        unidadeCodigo: i.unidadeCodigo,
        fonteCodigo: i.fonteCodigo,
        tipo: i.tipo,
        valor: i.valor,
        anulado: i.anulado,
      });
    }
  }
  return linhas;
}

/** Aplica os quatro filtros. Cada eixo é um E lógico com os outros. */
export function filtrarAtualizacoes(
  linhas: readonly LinhaAtualizacao[],
  filtro: FiltroAtualizacoes
): readonly LinhaAtualizacao[] {
  return linhas.filter((l) => {
    if (!vazio(filtro.ficha) && String(l.fichaNumero) !== filtro.ficha!.trim()) return false;
    if (!vazio(filtro.decreto) && l.decretoNumero !== filtro.decreto!.trim()) return false;
    if (!vazio(filtro.fonte) && l.fonteCodigo !== filtro.fonte!.trim()) return false;
    if (!vazio(filtro.unidade) && l.unidadeCodigo !== filtro.unidade!.trim()) return false;
    return true;
  });
}

/**
 * Os vocabulários dos SELECTs de filtro — extraídos das próprias linhas, ordenados.
 *
 * ⚠️ SÓ O QUE EXISTE NO RECORTE. Oferecer todas as fontes/UGs do cadastro faria o usuário escolher
 * combinações que devolvem lista vazia sem ele saber por quê. Aqui, toda opção rende ao menos uma
 * linha antes dos outros filtros.
 */
export interface OpcoesDeFiltro {
  readonly fichas: readonly string[];
  readonly decretos: readonly string[];
  readonly fontes: readonly string[];
  readonly unidades: readonly string[];
}

export function opcoesDeFiltro(linhas: readonly LinhaAtualizacao[]): OpcoesDeFiltro {
  const nums = [...new Set(linhas.map((l) => l.fichaNumero))].sort((a, b) => a - b).map(String);
  const textos = (vals: readonly string[]): readonly string[] => [...new Set(vals)].sort();
  return {
    fichas: nums,
    decretos: textos(linhas.map((l) => l.decretoNumero)),
    fontes: textos(linhas.map((l) => l.fonteCodigo)),
    unidades: textos(linhas.map((l) => l.unidadeCodigo)),
  };
}

/**
 * Os TOTAIS das linhas EXIBIDAS — Σ suplementado, Σ anulado, e o líquido.
 *
 * ⚠️ EM CENTAVOS INTEIROS (`BigInt`), nunca `number`: um `Number("0.1")+Number("0.2")` daria
 * `0.30000000000000004`, e um total de relatório com um centavo fantasma é exatamente o tipo de
 * erro que ninguém acha. Volta como STRING decimal — a regra de ouro intacta.
 *
 * ⚠️ ITEM ANULADO NÃO ENTRA. Ele foi estornado; somá-lo faria o total do relatório discordar do
 * total que a tela de créditos exibe para o mesmo decreto (`listarDecretos` já o exclui).
 */
export interface TotaisAtualizacoes {
  readonly suplementado: string;
  readonly anulado: string;
  /** suplementado − anulado: o efeito LÍQUIDO no orçamento (positivo = o orçamento cresceu). */
  readonly liquido: string;
}

function centavos(decimal: string): bigint {
  const [inteiro = "0", frac = ""] = decimal.trim().split(".");
  return BigInt(inteiro) * 100n + BigInt((frac + "00").slice(0, 2));
}

function paraDecimal(c: bigint): string {
  const sinal = c < 0n ? "-" : "";
  const abs = c < 0n ? -c : c;
  return `${sinal}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

export function totaisDeAtualizacoes(linhas: readonly LinhaAtualizacao[]): TotaisAtualizacoes {
  let suplementado = 0n;
  let anulado = 0n;
  for (const l of linhas) {
    if (l.anulado) continue;
    if (l.tipo === "SUPLEMENTACAO") suplementado += centavos(l.valor);
    else anulado += centavos(l.valor);
  }
  return {
    suplementado: paraDecimal(suplementado),
    anulado: paraDecimal(anulado),
    liquido: paraDecimal(suplementado - anulado),
  };
}
