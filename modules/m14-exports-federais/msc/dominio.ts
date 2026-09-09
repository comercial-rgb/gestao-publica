import { deflateRawSync } from "node:zlib";
import { toMoney, type Money } from "../../../packages/contracts/index.js";

/**
 * M14 — MATRIZ DE SALDOS CONTÁBEIS (MSC). DOMÍNIO PURO (sem I/O).
 *
 * Portaria STN 642/2019; Regras Gerais da MSC (siconfi.tesouro.gov.br). TR 7.34.
 *
 * ═══ O QUE É UMA LINHA DA MSC ═══
 * Uma linha é UMA conta de último nível, num tipo de valor, com a natureza daquele
 * valor e as informações complementares (ICs):
 *
 *   conta × Tipo_Valor × Natureza_Valor × Valor × pares TIPO/IC
 *
 * Cada conta rende TRÊS linhas: `beginning_balance` (o saldo que ela trazia),
 * `period_change` (o que se moveu no período) e `ending_balance` (o saldo ao fim).
 * As três não são três verdades: são a MESMA verdade em três recortes, e a
 * identidade M1 (`beginning + period_change == ending`) é o que prova isso.
 */

// ═══════════════════════════════════════════════════════════════════════════
// NATUREZA DO VALOR — e por que ela NÃO sai de um Record de classe
// ═══════════════════════════════════════════════════════════════════════════

export type TipoValor = "beginning_balance" | "period_change" | "ending_balance";
export type NaturezaValor = "D" | "C";

export interface SomasBrutas {
  readonly debito: Money;
  readonly credito: Money;
}

/**
 * ⚠️ A NATUREZA DO VALOR É O SINAL DE (ΣD − ΣC), E NADA MAIS.
 *
 * O spec deste bloco mandava derivá-la do `CLASSE_PCASP` (o Record que diz que a
 * classe 1 é devedora e a 2 é credora). Isso está ERRADO por duas razões, e as duas
 * aparecem no primeiro arquivo enviado:
 *
 * 1. O `CLASSE_PCASP` só conhece as classes 1 a 4 (o patrimonial). A MSC leva TAMBÉM
 *    o orçamentário e o controle (5 a 8) — e para essas contas o Record devolve
 *    `null`. Metade do arquivo sairia sem natureza.
 *
 * 2. E, principalmente: a natureza do VALOR não é a natureza da CONTA. Uma conta de
 *    passivo (natureza credora) PODE ter saldo devedor — basta o estorno ser maior do
 *    que o que restava. A MSC tem `Natureza_Valor` justamente para REPRESENTAR essa
 *    inversão, não para proibi-la. Derivá-la da classe faria o arquivo declarar "C"
 *    num saldo que é "D", e o balancete da STN não fecharia — sem que ninguém
 *    soubesse por quê.
 *
 * O saldo ZERO é o único caso em que o sinal não decide. Aí, e só aí, vale a natureza
 * NATURAL da conta (a coluna `naturezaSaldo`, que o plano já traz): uma conta zerada é
 * publicada com a natureza que ela teria se tivesse saldo. Omiti-la seria esconder da
 * STN uma conta que existe e está zerada — e é justamente isso que ela quer ver.
 */
export function naturezaDoValor(
  s: SomasBrutas,
  naturezaDaConta: "DEVEDORA" | "CREDORA"
): NaturezaValor {
  const liquido = toMoney(s.debito.minus(s.credito));
  if (liquido.greaterThan(0)) return "D";
  if (liquido.lessThan(0)) return "C";
  return naturezaDaConta === "DEVEDORA" ? "D" : "C";
}

/** O valor PUBLICADO é sempre positivo: quem carrega o sinal é a `Natureza_Valor`. */
export function valorDoSaldo(s: SomasBrutas): Money {
  const liquido = toMoney(s.debito.minus(s.credito));
  return liquido.lessThan(0) ? toMoney(liquido.negated()) : liquido;
}

/** ΣD − ΣC, COM sinal. Só para as identidades — nunca vai para o arquivo. */
export function liquidoComSinal(s: SomasBrutas): Money {
  return toMoney(s.debito.minus(s.credito));
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPETÊNCIA
// ═══════════════════════════════════════════════════════════════════════════

export interface Competencia {
  readonly ano: number;
  readonly mes: number;
  /** "YYYY-MM" — como vai no arquivo. */
  readonly rotulo: string;
  /** 1º dia do mês, 00:00:00.000Z — INCLUSIVO. */
  readonly inicio: Date;
  /** Último instante do mês — INCLUSIVO. */
  readonly fim: Date;
  /**
   * O último instante ANTES do período. É o corte do `beginning_balance`, e ele é
   * EXCLUSIVO por construção: um fato do dia 1º pertence ao PERÍODO, não ao saldo
   * anterior. Errar isto por um milissegundo joga o movimento do dia 1º para dentro
   * do beginning, e a identidade M1 continua fechando — mentindo.
   */
  readonly anteriorAoInicio: Date;
}

const RE_COMPETENCIA = /^(\d{4})-(\d{2})$/;

export function parsearCompetencia(rotulo: string): Competencia {
  const m = RE_COMPETENCIA.exec(rotulo);
  if (m === null) {
    throw new Error(
      `Competência "${rotulo}" inválida — o formato do SICONFI é YYYY-MM (ex.: 2026-07).`
    );
  }
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) {
    throw new Error(`Competência "${rotulo}": mês ${mes} não existe.`);
  }

  return {
    ano,
    mes,
    rotulo,
    inicio: new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0)),
    fim: new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999)),
    anteriorAoInicio: new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0) - 1),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// A LINHA, E O RESULTADO
// ═══════════════════════════════════════════════════════════════════════════

export type TipoMsc = "AGREGADA" | "ENCERRAMENTO";

export interface LinhaMsc {
  /** Código IBGE do ente + "EX" (o Executivo). Vem da `EnteConfig`, semeada. */
  readonly instituicao: string;
  readonly periodo: string;
  readonly conta: string;
  readonly tipoValor: TipoValor;
  readonly naturezaValor: NaturezaValor;
  /** Decimal com PONTO, sem separador de milhares. String, sempre. */
  readonly valor: string;
  /** IC "PO" — Poder/Órgão. Da config. */
  readonly icPO: string | null;
  /** IC "FP" — 1 = Financeiro, 2 = Permanente. Do `indicadorSuperavit` do plano. */
  readonly icFP: string | null;
  /** IC "FR" — fonte de recurso. Do RESOLVER (o razão não a carrega). */
  readonly icFR: string | null;
  /** IC "NR" — natureza da receita (8 dígitos). `null` numa despesa NÃO é pendência. */
  readonly icNR: string | null;
  /** IC "ND" — natureza da despesa (6 dígitos). `null` numa receita NÃO é pendência. */
  readonly icND: string | null;
  /** IC "FUNCIONAL" — função + subfunção. Ver a pendência declarada no resolver. */
  readonly icFUNCIONAL: string | null;
  /**
   * IC "AI" — ano de inscrição do resto a pagar. Do RESOLVER (`exercicioOrigem` da
   * inscrição). `null` num fato que não é RP NÃO é pendência — é a resposta.
   */
  readonly icAI: string | null;
}

/**
 * O que o gerador NÃO conseguiu derivar — e que ele publica MESMO ASSIM.
 *
 * ⚠️ ISTO NÃO É UM ERRO SILENCIOSO NEM UM ABORT. É a terceira via, e ela é deliberada:
 * um export que se RECUSA a existir porque uma conta não tem indicador deixa o ente
 * sem entregar NADA à União — e o prazo não espera o plano de contas ficar bonito. Um
 * export que OMITE a linha em silêncio é pior ainda: o balancete não fecha e ninguém
 * sabe por quê. Aqui a linha SAI (sem a IC), e o furo sai JUNTO, com o nome da conta.
 *
 * É o mesmo desenho do F2 do Anexo 14 (M12) e do fail-open do M03: quem publica, avisa.
 */
export interface PendenciaMsc {
  readonly conta: string;
  readonly ic: string;
  /**
   * O lançamento que não resolveu. `null` quando a pendência é da CONTA (o indicador
   * que falta no plano), não de um fato.
   *
   * ⚠️ A PENDÊNCIA TEM TAMANHO. Saber que "existe pendência de FR" não serve de nada;
   * saber que ela vale 12 lançamentos numa conta e 4 noutra é o que faz alguém consertar
   * o vínculo — e é o que permite decidir se o arquivo pode ir assim mesmo.
   */
  readonly lancamentoId?: string | undefined;
  readonly motivo: string;
}

export interface ResultadoMsc {
  readonly instituicao: string;
  readonly periodo: string;
  readonly tipo: TipoMsc;
  readonly linhas: readonly LinhaMsc[];
  readonly pendencias: readonly PendenciaMsc[];
}

// ═══════════════════════════════════════════════════════════════════════════
// AS IDENTIDADES — auto-executáveis, e elas NOMEIAM a diferença
// ═══════════════════════════════════════════════════════════════════════════

/** O valor de uma linha, de volta ao número COM sinal (para conferir). */
function comSinal(l: LinhaMsc): Money {
  const v = toMoney(l.valor);
  return l.naturezaValor === "D" ? v : toMoney(v.negated());
}

/**
 * M1 — `beginning + period_change == ending`, POR CONTA.
 *
 * É a identidade que prova que as três linhas são a mesma verdade em três recortes.
 * Se ela quebra, ou o corte do beginning está errado (o clássico: o fato do dia 1º
 * contado dos dois lados), ou o filtro de natureza do lançamento diverge entre os
 * recortes — e o arquivo iria para a STN com um balancete que não fecha.
 */
export function conferirM1(linhas: readonly LinhaMsc[]): void {
  // ⚠️ SOMA, não `set`. Com as ICs, uma conta tem VÁRIAS linhas por tipo de valor (uma
  // por combinação de dimensões) — sobrescrever aqui compararia a ÚLTIMA fonte com o
  // total e a M1 passaria a mentir exatamente onde ela é mais necessária.
  const porConta = new Map<string, Map<TipoValor, Money>>();
  for (const l of linhas) {
    const m = porConta.get(l.conta) ?? new Map<TipoValor, Money>();
    const acc = m.get(l.tipoValor) ?? toMoney("0.00");
    m.set(l.tipoValor, toMoney(acc.plus(comSinal(l))));
    porConta.set(l.conta, m);
  }

  for (const [conta, m] of porConta) {
    const b = m.get("beginning_balance") ?? toMoney("0.00");
    const p = m.get("period_change") ?? toMoney("0.00");
    const e = m.get("ending_balance") ?? toMoney("0.00");
    const soma = toMoney(b.plus(p));
    if (!soma.equals(e)) {
      throw new Error(
        `MSC — M1 NÃO FECHA na conta ${conta}: beginning ${b.toFixed(2)} + ` +
          `period_change ${p.toFixed(2)} = ${soma.toFixed(2)}, mas o ending é ` +
          `${e.toFixed(2)}. Diferença: ${toMoney(e.minus(soma)).toFixed(2)}. As três ` +
          `linhas são a MESMA conta em três recortes — se elas discordam, o corte do ` +
          `período está errado (o fato do dia 1º contado duas vezes?) ou os recortes ` +
          `filtram lançamentos diferentes.`
      );
    }
  }
}

/**
 * M2 — Σ(D) == Σ(C), POR TIPO_VALOR. O balancete fecha.
 *
 * Todo lançamento do razão fecha por subsistema (o motor puro do M01 recusa o que não
 * fecha). Logo, somados TODOS os débitos e TODOS os créditos de qualquer recorte, os
 * dois têm de dar o mesmo. Se não derem, uma partida escapou do recorte — e a MSC
 * estaria dizendo à STN que o município criou dinheiro.
 */
export function conferirM2(linhas: readonly LinhaMsc[]): void {
  const por = new Map<TipoValor, { d: Money; c: Money }>();
  for (const l of linhas) {
    const acc = por.get(l.tipoValor) ?? { d: toMoney("0.00"), c: toMoney("0.00") };
    const v = toMoney(l.valor);
    if (l.naturezaValor === "D") acc.d = toMoney(acc.d.plus(v));
    else acc.c = toMoney(acc.c.plus(v));
    por.set(l.tipoValor, acc);
  }

  for (const [tipo, { d, c }] of por) {
    if (!d.equals(c)) {
      throw new Error(
        `MSC — M2 NÃO FECHA em ${tipo}: ΣD ${d.toFixed(2)} ≠ ΣC ${c.toFixed(2)}. ` +
          `Diferença: ${toMoney(d.minus(c)).toFixed(2)}. Todo lançamento do razão ` +
          `fecha por subsistema; se o balancete não fecha aqui, uma partida escapou ` +
          `do recorte — e a MSC estaria declarando à STN que o município criou dinheiro.`
      );
    }
  }
}

/**
 * M3 — só na MSC de ENCERRAMENTO: o `beginning_balance` dela é, POR CONTA, o
 * `ending_balance` da AGREGADA de dezembro.
 *
 * É a costura entre as duas matrizes do ano. A agregada de dezembro fecha o exercício
 * SEM os lançamentos de encerramento (eles não são fatos novos — só transferem o
 * resultado); a de encerramento parte exatamente dali e aplica a apuração. Se as duas
 * não se encaixam, a União recebe um exercício que começa onde o anterior não terminou.
 */
export function conferirM3(
  encerramento: readonly LinhaMsc[],
  agregadaDeDezembro: readonly LinhaMsc[]
): void {
  // Idem M1: com as ICs, uma conta tem várias linhas por tipo — SOMA, nunca `set`.
  const acumular = (
    linhas: readonly LinhaMsc[],
    tipo: TipoValor
  ): Map<string, Money> => {
    const m = new Map<string, Money>();
    for (const l of linhas.filter((x) => x.tipoValor === tipo)) {
      m.set(l.conta, toMoney((m.get(l.conta) ?? toMoney("0.00")).plus(comSinal(l))));
    }
    return m;
  };
  const beg = acumular(encerramento, "beginning_balance");
  const end = acumular(agregadaDeDezembro, "ending_balance");

  const contas = new Set([...beg.keys(), ...end.keys()]);
  for (const conta of contas) {
    const b = beg.get(conta) ?? toMoney("0.00");
    const e = end.get(conta) ?? toMoney("0.00");
    if (!b.equals(e)) {
      throw new Error(
        `MSC — M3 NÃO FECHA na conta ${conta}: o beginning da MSC de ENCERRAMENTO é ` +
          `${b.toFixed(2)}, mas o ending da AGREGADA de dezembro é ${e.toFixed(2)}. ` +
          `Diferença: ${toMoney(b.minus(e)).toFixed(2)}. A matriz de encerramento parte ` +
          `de onde a agregada de dezembro parou — se elas não se encaixam, a União ` +
          `recebe um exercício que começa onde o anterior não terminou.`
      );
    }
  }
}

/**
 * M5 — A COSTURA ENTRE OS ANOS: o `beginning_balance` da AGREGADA DE JANEIRO de E+1 é,
 * POR CONTA, o `ending_balance` da MSC DE ENCERRAMENTO de E.
 *
 * ═══ POR QUE ELA NASCEU, E O QUE ELA TERIA PEGO ═══
 * A M3 costura as duas matrizes DE UM MESMO ANO (a agregada de dezembro e a de
 * encerramento). Faltava a costura entre ANOS — e, sem ela, o motor errava exatamente
 * ali, sem que nada gritasse: o recorte da agregada excluía os lançamentos de
 * ENCERRAMENTO **de todos os anos, para sempre**, e por isso o `beginning` de janeiro de
 * E+1 descartava a apuração e o enterro do orçamento de E. Janeiro abria com a receita do
 * ano morto ressuscitada e a dotação que já tinha caducado.
 *
 * A M3 continuava FECHANDO — porque ela compara dois recortes que erravam IGUAL. É essa a
 * assinatura de um furo de recorte: a identidade que só olha para dentro do ano não vê
 * nada. Só uma identidade que ATRAVESSA a virada enxerga.
 *
 * ⚠️ E ela é a razão de o encerramento existir: o exercício novo tem de começar
 * EXATAMENTE onde o anterior terminou — depois de apurado o resultado E enterrado o
 * orçamento. Nem antes, nem em outro lugar.
 */
export function conferirM5(
  agregadaDeJaneiroDeE1: readonly LinhaMsc[],
  encerramentoDeE: readonly LinhaMsc[]
): void {
  // Idem M1/M3: com as ICs, uma conta tem várias linhas por tipo — SOMA, nunca `set`.
  const acumular = (
    linhas: readonly LinhaMsc[],
    tipo: TipoValor
  ): Map<string, Money> => {
    const m = new Map<string, Money>();
    for (const l of linhas.filter((x) => x.tipoValor === tipo)) {
      m.set(l.conta, toMoney((m.get(l.conta) ?? toMoney("0.00")).plus(comSinal(l))));
    }
    return m;
  };
  const abertura = acumular(agregadaDeJaneiroDeE1, "beginning_balance");
  const fechamento = acumular(encerramentoDeE, "ending_balance");

  for (const conta of new Set([...abertura.keys(), ...fechamento.keys()])) {
    const a = abertura.get(conta) ?? toMoney("0.00");
    const f = fechamento.get(conta) ?? toMoney("0.00");
    if (!a.equals(f)) {
      throw new Error(
        `MSC — M5 NÃO FECHA na conta ${conta}: o exercício novo ABRE em ` +
          `${a.toFixed(2)}, mas o anterior FECHOU (depois do encerramento) em ` +
          `${f.toFixed(2)}. Diferença: ${toMoney(a.minus(f)).toFixed(2)}. Um ano que ` +
          `começa onde o outro não terminou é o orçamento morto atravessando a virada — ` +
          `ou o resultado apurado que não chegou ao patrimônio líquido.`
      );
    }
  }
}

/**
 * M4 — A DIMENSÃO NÃO PODE CRIAR NEM SUMIR DINHEIRO.
 *
 * ⚠️ ESTA É A IDENTIDADE QUE O BLOCO 2 EXIGE, E ELA CRUZA DOIS GRÃOS INDEPENDENTES.
 *
 * Com as ICs, uma conta deixa de ter UMA linha por tipo de valor: ela passa a ter uma
 * por COMBINAÇÃO DE DIMENSÕES (uma conta de caixa alimentada por duas fontes rende duas
 * linhas). Esse detalhamento sai do grão FINO (`somasPorContaELancamento`), agrupado
 * pelo que o resolver respondeu.
 *
 * O total continua saindo do grão GROSSO (`somasPorConta`) — o mesmo do bloco 1, o mesmo
 * que a M1 e a M2 amarram. Somadas de volta, as linhas dimensionadas TÊM de reconstituir
 * o total. Se não reconstituem, a dimensão criou ou sumiu com dinheiro.
 *
 * ═══ E O QUE ELA PEGA, NA PRÁTICA ═══
 * A tentação óbvia: OMITIR a linha cujo lançamento não resolveu ("não sei a fonte, então
 * não publico"). Isso furaria o balancete da conta — e a M4 é quem grita. A regra é a
 * outra: a linha SAI sem a IC, e o furo vira PENDÊNCIA NOMEADA.
 */
export function conferirM4(
  linhas: readonly LinhaMsc[],
  totalPorContaETipo: ReadonlyMap<string, Money>
): void {
  const somado = new Map<string, Money>();
  for (const l of linhas) {
    const chave = `${l.conta}|${l.tipoValor}`;
    const acc = somado.get(chave) ?? toMoney("0.00");
    somado.set(chave, toMoney(acc.plus(comSinal(l))));
  }

  const chaves = new Set([...somado.keys(), ...totalPorContaETipo.keys()]);
  for (const chave of chaves) {
    const dimensionado = somado.get(chave) ?? toMoney("0.00");
    const total = totalPorContaETipo.get(chave) ?? toMoney("0.00");
    if (!dimensionado.equals(total)) {
      const [conta, tipo] = chave.split("|");
      throw new Error(
        `MSC — M4 NÃO FECHA na conta ${conta} (${tipo}): as linhas DIMENSIONADAS somam ` +
          `${dimensionado.toFixed(2)}, mas o saldo da conta é ${total.toFixed(2)}. ` +
          `Diferença: ${toMoney(total.minus(dimensionado)).toFixed(2)}. A dimensão não ` +
          `pode criar nem sumir dinheiro: quebrar o saldo por fonte é REPARTIR o mesmo ` +
          `número, não recontá-lo. Se um lançamento não resolveu, a linha dele SAI sem ` +
          `a IC — omiti-la fura o balancete da conta, e a STN vê a diferença antes de nós.`
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV (o leiaute) e ZIP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A ORDEM DAS COLUNAS É A DO LEIAUTE — e ela não é alfabética nem "a que ficou bonita".
 * O validador da STN lê por POSIÇÃO nos pares TIPO/IC.
 */
export const COLUNAS_MSC: readonly string[] = [
  "instituicao",
  "periodo",
  "conta",
  "tipo_valor",
  "natureza_valor",
  "valor",
  "tipo_ic1",
  "ic1",
  "tipo_ic2",
  "ic2",
  "tipo_ic3",
  "ic3",
  "tipo_ic4",
  "ic4",
  "tipo_ic5",
  "ic5",
  "tipo_ic6",
  "ic6",
  // ⚠️ A "AI" ENTROU COMO 7º PAR — e a POSIÇÃO dela é uma ESCOLHA DECLARADA, não um dado.
  // O Anexo II da MSC (que diz quais ICs cada conta leva, e em que ordem os pares saem)
  // NÃO está no repositório — é a mesma pendência da FUNCIONAL. Acrescentá-la no FIM
  // preserva a posição de todas as outras, que é o que menos arrisca. CONFERIR contra o
  // leiaute da STN antes do primeiro envio.
  "tipo_ic7",
  "ic7",
];

/** Os pares TIPO/IC, na ORDEM do leiaute. Uma IC nula sai com os DOIS campos vazios. */
const ICS_DA_LINHA = (l: LinhaMsc): readonly (readonly [string, string | null])[] => [
  ["PO", l.icPO],
  ["FP", l.icFP],
  ["FR", l.icFR],
  ["NR", l.icNR],
  ["ND", l.icND],
  ["FUNCIONAL", l.icFUNCIONAL],
  ["AI", l.icAI],
];

/**
 * ⚠️ O PONTO DECIMAL É UMA CONVERSÃO DE BORDA, E ELA ACONTECE AQUI.
 *
 * Dentro do sistema, dinheiro é `Money` (decimal.js) e serializa como "1234.56" — já
 * com ponto, porque é o formato de máquina. O CSV do SICONFI quer exatamente isso: PONTO
 * decimal, SEM separador de milhares. Então não há conversão a fazer — e este comentário
 * existe para que ninguém "conserte" isto para o formato brasileiro achando que ajuda.
 * Um "1.234,56" aqui é um arquivo rejeitado.
 *
 * ⚠️ E AS ICs SÃO TEXTO. Um IC "01" que vira número perde o zero à esquerda e deixa de
 * existir na tabela da STN. Por isso elas nunca passam por `Number` em lugar nenhum — e
 * o campo vazio é vazio, não "0".
 */
export function serializarMscCsv(r: ResultadoMsc): string {
  const escapar = (v: string): string =>
    /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;

  const linha = (cs: readonly string[]): string => cs.map(escapar).join(",") + "\r\n";

  const corpo = r.linhas.map((l) =>
    linha([
      l.instituicao,
      l.periodo,
      l.conta,
      l.tipoValor,
      l.naturezaValor,
      l.valor,
      // ⚠️ A IC NULA sai com os DOIS campos VAZIOS — nunca com o TIPO preenchido e o
      // valor em branco. Um par ("FR", "") diria à STN "esta conta tem fonte, e ela é
      // nada"; dois campos vazios dizem "esta linha não traz FR", que é a verdade.
      ...ICS_DA_LINHA(l).flatMap(([tipo, valor]) =>
        valor !== null ? [tipo, valor] : ["", ""]
      ),
    ])
  );

  return linha(COLUNAS_MSC) + corpo.join("");
}

// ─── ZIP ────────────────────────────────────────────────────────────────────
//
// ⚠️ SEM DEPENDÊNCIA NOVA — e é uma escolha, não preguiça.
//
// O SICONFI recebe a MSC ZIPADA. O `node:zlib` da biblioteca padrão faz DEFLATE, mas
// NÃO faz ZIP: o .zip é um CONTÊINER (cabeçalhos locais + diretório central + CRC-32),
// e o gzip não é isso. Trazer uma lib de zip para escrever UM arquivo dentro de UM
// contêiner seria acrescentar uma dependência de terceiros — com o seu ciclo de CVE — a
// um sistema que envia dado fiscal à União, para gerar 100 linhas de estrutura que a
// especificação (APPNOTE.TXT da PKWARE) publica há trinta anos.
//
// O que está abaixo é o contêiner mínimo: UM arquivo, método DEFLATE (8), sem
// criptografia, sem ZIP64 (a MSC de um município não passa de 4 GB). O `deflateRawSync`
// — que é da stdlib — faz a compressão de verdade.

const TABELA_CRC32 = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC32[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Um .zip com UM arquivo. Estrutura: header local + dados + diretório central + EOCD. */
export function zipar(nomeDoArquivo: string, conteudo: string): Buffer {
  const nome = Buffer.from(nomeDoArquivo, "utf8");
  const cru = Buffer.from(conteudo, "utf8");
  const comprimido = deflateRawSync(cru);
  const crc = crc32(cru);

  // ⚠️ DATA FIXA (1980-01-01, o zero do formato MS-DOS). Um timestamp real faria o
  // MESMO conteúdo gerar bytes DIFERENTES a cada execução — e um arquivo enviado à
  // União tem de ser reproduzível: quem auditar amanhã precisa gerar o mesmo byte.
  const hora = 0;
  const data = 0x0021; // 1º de janeiro de 1980

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // assinatura
  local.writeUInt16LE(20, 4); // versão mínima
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(8, 8); // método: deflate
  local.writeUInt16LE(hora, 10);
  local.writeUInt16LE(data, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comprimido.length, 18);
  local.writeUInt32LE(cru.length, 22);
  local.writeUInt16LE(nome.length, 26);
  local.writeUInt16LE(0, 28); // extra

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // versão de quem escreveu
  central.writeUInt16LE(20, 6); // versão mínima
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(hora, 12);
  central.writeUInt16LE(data, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comprimido.length, 20);
  central.writeUInt32LE(cru.length, 24);
  central.writeUInt16LE(nome.length, 28);
  central.writeUInt16LE(0, 30); // extra
  central.writeUInt16LE(0, 32); // comentário
  central.writeUInt16LE(0, 34); // disco
  central.writeUInt16LE(0, 36); // atributos internos
  central.writeUInt32LE(0, 38); // atributos externos
  central.writeUInt32LE(0, 42); // offset do header local

  const inicioDoCentral = local.length + nome.length + comprimido.length;
  const tamanhoDoCentral = central.length + nome.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disco
  eocd.writeUInt16LE(0, 6); // disco do início do central
  eocd.writeUInt16LE(1, 8); // entradas neste disco
  eocd.writeUInt16LE(1, 10); // entradas no total
  eocd.writeUInt32LE(tamanhoDoCentral, 12);
  eocd.writeUInt32LE(inicioDoCentral, 16);
  eocd.writeUInt16LE(0, 20); // comentário

  return Buffer.concat([
    local, nome, comprimido,
    central, nome,
    eocd,
  ]);
}
