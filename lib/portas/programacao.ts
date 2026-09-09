import { cliente, PortaSemBancoError } from "./cliente";
import { exigirSessao } from "./sessao";
import {
  bimestreDoMes,
  confrontoMba,
  gerarDecretoCmd,
  gerarDecretoMba,
} from "../../modules/m02-planejamento/programacao";

/**
 * PORTA — PROGRAMAÇÃO FINANCEIRA (M02: CMD e MBA. TR 4.18/4.19/4.43/4.44, LRF arts. 8º, 9º e 13).
 *
 * ═══ O QUE A TELA CONSOME DAQUI ═══
 * O CMD (Cronograma Mensal de Desembolso) no grão FONTE × MÊS — os duodécimos —, o MBA (Metas
 * Bimestrais de Arrecadação) no grão FONTE × BIMESTRE, e o CONFRONTO do art. 9º (meta × arrecadado).
 * O domínio (`modules/m02-planejamento`) nunca é importado por `app/` direto: é esta a borda.
 *
 * ═══ ⚠️ PORTA SÓ DE LEITURA, DE PROPÓSITO ═══
 * Registrar CMD/MBA é ATO POLÍTICO — sai de decreto do Prefeito, não de um botão de tela. O domínio
 * já expõe `proporCmdDaLoa`/`registrarVersaoCmd` (autorizados no escopo ENTE pelo M16); enquanto não
 * houver o fluxo de publicação do decreto, esta porta NÃO os expõe. Uma tela que gravasse a
 * programação sem o ato correspondente produziria um cronograma sem lastro legal — e o guard do
 * 4.43 passaria a limitar empenho contra um número que nenhum decreto autorizou.
 *
 * ═══ ⚠️ LEITURA DIRETA DO BANCO, E O PORQUÊ ═══
 * O M02 não publica uma consulta "CMD vigente" (o único leitor do banco até aqui era o guard do M05,
 * que lê UMA cota por vez, dentro da transação do empenho). Esta porta faz a leitura direta — o mesmo
 * que `administracao.ts` e `captura.ts` já fazem. O que ela NÃO faz é decidir nada: o critério de
 * VIGÊNCIA é copiado literalmente do guard (`guard-cmd.ts`) — a versão de maior `vigenteDesde` que já
 * <= a data de referência. Se a tela mostrasse uma versão e o guard travasse o empenho contra outra,
 * o servidor planejaria contra um cronograma que o sistema não honra.
 *
 * ═══ ⚠️ A TRANSPOSIÇÃO É APRESENTAÇÃO; O DADO É O DA LINHA ═══
 * O banco guarda uma linha por (fonte, mês). A tela quer a MATRIZ (fonte nas linhas, meses nas
 * colunas). A porta transpõe e fecha as bordas (total do ano por fonte, total do mês por coluna) —
 * mas isso não é uma segunda verdade: é a Σ das MESMAS células exibidas, a conta que o leitor faria
 * com o dedo. Nenhuma regra nova, nenhum arredondamento: soma em centavos inteiros (bigint), exata.
 */

export { PortaSemBancoError };

// ── O QUE ATRAVESSA A BORDA ───────────────────────────────────────────────────────

/**
 * Uma FONTE no cronograma, com as suas parcelas na ordem do período (índice 0 = mês 1 / bimestre 1).
 *
 * ⚠️ `parcelas` tem SEMPRE o tamanho do período (12 no CMD, 6 no MBA), mesmo que o banco não tenha
 * a linha daquele mês. Ausência vira "0.00" na matriz — mas veja a nota de `mesesSemCota`: para o
 * guard do 4.43 ausência e zero são coisas DIFERENTES, e a tela precisa dizer qual é qual.
 */
export interface LinhaProgramacao {
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  /** String decimal por período — "1234.50". Nunca `number` (a regra de ouro na borda). */
  readonly parcelas: readonly string[];
  /** Σ das parcelas da fonte no exercício. */
  readonly total: string;
  /**
   * Os períodos (1-based) que NÃO têm linha no banco — distintos dos que têm valor 0,00.
   *
   * ⚠️ ESTA DISTINÇÃO É OPERACIONAL, não cosmética. Com a limitação do 4.43 LIGADA, o guard REJEITA
   * empenho em fonte/mês SEM cota (fail-closed), enquanto uma cota de valor 0,00 é um bloqueio
   * DELIBERADO. Os dois travam o empenho, mas só um foi decidido por alguém — a tela tem de deixar
   * óbvio qual.
   */
  readonly periodosSemLinha: readonly number[];
}

/** A versão vigente de um plano (CMD ou MBA), já transposta em matriz. */
export interface VersaoProgramacao {
  readonly versaoId: string;
  /** Sequencial no exercício: 1 = a proposta da LOA; 2, 3... = as retificações. */
  readonly numero: number;
  /** O ato que a publicou (o número do decreto) — é o que o TCE cobra. */
  readonly atoRef: string;
  readonly vigenteDesde: Date;
  readonly criadoPor: string;
  readonly linhas: readonly LinhaProgramacao[];
  /** Σ de todas as fontes em cada período — o rodapé da matriz. */
  readonly totalPorPeriodo: readonly string[];
  /** Σ geral (Σ das linhas == Σ das colunas; a matriz fecha nos dois sentidos). */
  readonly total: string;
}

/**
 * O RESULTADO DE UMA LEITURA DE PLANO — e ele é honesto sobre o vazio.
 *
 * ⚠️ TRÊS VAZIOS DIFERENTES, E A TELA PRECISA DOS TRÊS. (a) `versoes === 0`: o ente nunca registrou
 * programação — não há decreto. (b) `versoes > 0` mas `vigente === null` com `futuras > 0`: existe
 * decreto, mas ele só passa a viger depois da data de referência. (c) `vigente` com zero linhas: a
 * versão existe e está vazia. Colapsar os três num "sem dados" faria a tela mentir por omissão —
 * quem lê não saberia se falta cadastrar o decreto ou se só falta chegar a data.
 */
export interface PlanoProgramacao {
  readonly vigente: VersaoProgramacao | null;
  /** Quantas versões o exercício tem, vigentes ou não. */
  readonly versoes: number;
  /** Quantas existem mas só vigem DEPOIS da data de referência. */
  readonly futuras: number;
  /** A data contra a qual a vigência foi resolvida (o "hoje" da consulta). */
  readonly referencia: Date;
}

/** Uma linha do confronto do art. 9º, já com o código da fonte (o banco guarda só o id). */
export interface LinhaConfronto {
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly bimestre: number;
  readonly metaAcumulada: string;
  readonly arrecadadoAcumulado: string;
  /** arrecadado − meta. NEGATIVO = frustração de receita: o gatilho do art. 9º. */
  readonly diferenca: string;
  /** Atalho de leitura da tela — `diferenca` < 0. A conta é a mesma, só nomeada. */
  readonly frustrada: boolean;
}

// ── LEITURA ───────────────────────────────────────────────────────────────────────

/**
 * O CMD VIGENTE — os DUODÉCIMOS: quanto cada fonte pode desembolsar em cada mês (TR 4.18).
 *
 * ⚠️ SESSÃO EXIGIDA (fail-closed). O cronograma é o teto do caixa mês a mês: com o 4.43 ligado, ele
 * é literalmente o que autoriza ou barra o próximo empenho. Não é dado de portal.
 *
 * ⚠️ SEM UNIDADE ORÇAMENTÁRIA. A programação financeira é do ENTE — o caixa é um só, e o grão do
 * modelo é fonte × mês. Filtrar por UG aqui devolveria um recorte que não existe no decreto.
 */
export async function lerCmdVigente(p: {
  readonly exercicio: number;
  readonly em?: Date | undefined;
}): Promise<PlanoProgramacao> {
  await exigirSessao();
  const referencia = p.em ?? new Date();
  const db = cliente();

  const versoes = await db.versaoCmd.findMany({
    where: { exercicio: p.exercicio },
    orderBy: { vigenteDesde: "desc" },
    select: { id: true, numero: true, atoRef: true, vigenteDesde: true, criadoPor: true },
  });
  // A VIGENTE é a de maior `vigenteDesde` que já <= a referência — o critério do guard do M05.
  const vigenteMeta = versoes.find((v) => v.vigenteDesde <= referencia) ?? null;
  const futuras = versoes.filter((v) => v.vigenteDesde > referencia).length;

  if (vigenteMeta === null) {
    return { vigente: null, versoes: versoes.length, futuras, referencia };
  }

  const cotas = await db.cotaCmd.findMany({
    where: { versaoId: vigenteMeta.id },
    orderBy: [{ fonteId: "asc" }, { mes: "asc" }],
    select: {
      fonteId: true,
      mes: true,
      valor: true,
      fonte: { select: { codigo: true, descricao: true } },
    },
  });

  return {
    vigente: matriz(vigenteMeta, 12, cotas.map((c) => ({ ...c, periodo: c.mes }))),
    versoes: versoes.length,
    futuras,
    referencia,
  };
}

/**
 * O MBA VIGENTE — as METAS BIMESTRAIS de arrecadação (LRF art. 13, desdobramento da receita da LOA).
 *
 * Mesma anatomia do CMD, outro período: seis bimestres em vez de doze meses. É contra estas metas
 * que o confronto do art. 9º julga a arrecadação real.
 */
export async function lerMbaVigente(p: {
  readonly exercicio: number;
  readonly em?: Date | undefined;
}): Promise<PlanoProgramacao> {
  await exigirSessao();
  const referencia = p.em ?? new Date();
  const db = cliente();

  const versoes = await db.versaoMba.findMany({
    where: { exercicio: p.exercicio },
    orderBy: { vigenteDesde: "desc" },
    select: { id: true, numero: true, atoRef: true, vigenteDesde: true, criadoPor: true },
  });
  const vigenteMeta = versoes.find((v) => v.vigenteDesde <= referencia) ?? null;
  const futuras = versoes.filter((v) => v.vigenteDesde > referencia).length;

  if (vigenteMeta === null) {
    return { vigente: null, versoes: versoes.length, futuras, referencia };
  }

  const metas = await db.metaMba.findMany({
    where: { versaoId: vigenteMeta.id },
    orderBy: [{ fonteId: "asc" }, { bimestre: "asc" }],
    select: {
      fonteId: true,
      bimestre: true,
      valor: true,
      fonte: { select: { codigo: true, descricao: true } },
    },
  });

  return {
    vigente: matriz(vigenteMeta, 6, metas.map((m) => ({ ...m, periodo: m.bimestre }))),
    versoes: versoes.length,
    futuras,
    referencia,
  };
}

/** O confronto, mais o recorte temporal que ele de fato cobriu (a tela tem de imprimir o recorte). */
export interface ConfrontoMbaDaTela {
  /** Até que bimestre (1-6) o confronto foi feito. 0 = o exercício ainda não fechou bimestre algum. */
  readonly ateBimestre: number;
  readonly linhas: readonly LinhaConfronto[];
}

/**
 * O CONFRONTO DO ART. 9º — meta ACUMULADA × arrecadado ACUMULADO, por fonte × bimestre.
 *
 * ⚠️ A ARITMÉTICA É TODA DO DOMÍNIO (`confrontoMba`), inclusive o acúmulo e o corte temporal de cada
 * bimestre. A porta só traduz `fonteId` → código (o banco guarda o id; o usuário lê o código) e nomeia
 * a frustração. Recalcular aqui criaria um segundo art. 9º — e o que dispara o contingenciamento tem
 * de ser um número só.
 *
 * ⚠️ O RECORTE DEFAULT É O ÚLTIMO BIMESTRE FECHADO, e ele volta no resultado. O art. 9º julga "ao
 * final de um bimestre" — confrontar contra o bimestre CORRENTE compararia a meta cheia com uma
 * arrecadação pela metade e acusaria frustração que não existe. Num exercício passado, todos os seis
 * já fecharam; num exercício futuro, nenhum — e aí a resposta honesta é `ateBimestre: 0`, sem linhas.
 */
export async function lerConfrontoMba(p: {
  readonly exercicio: number;
  readonly ateBimestre?: number | undefined;
  readonly em?: Date | undefined;
}): Promise<ConfrontoMbaDaTela> {
  await exigirSessao();
  const ateBimestre = p.ateBimestre ?? ultimoBimestreFechado(p.exercicio, p.em ?? new Date());
  if (ateBimestre <= 0) return { ateBimestre: 0, linhas: [] };

  const db = cliente();
  const linhas = await confrontoMba(db, { exercicio: p.exercicio, ateBimestre });
  if (linhas.length === 0) return { ateBimestre, linhas: [] };

  const fontes = await db.fonteRecurso.findMany({ select: { id: true, codigo: true } });
  const codigoPorId = new Map(fontes.map((f) => [f.id, f.codigo]));

  return {
    ateBimestre,
    linhas: linhas.map((l) => ({
      fonteId: l.fonteId,
      fonteCodigo: codigoPorId.get(l.fonteId) ?? l.fonteId,
      bimestre: l.bimestre,
      metaAcumulada: l.metaAcumulada,
      arrecadadoAcumulado: l.arrecadadoAcumulado,
      diferenca: l.diferenca,
      // O sinal é o do DOMÍNIO (arrecadado − meta), lido do texto: nenhuma comparação numérica
      // reconstruída aqui — só o nome da condição que o art. 9º dá a ela.
      frustrada: l.diferenca.trimStart().startsWith("-"),
    })),
  };
}

/**
 * O último bimestre (1-6) INTEIRAMENTE decorrido do exercício, na data de referência.
 *
 * Exercício passado → 6 (todos fecharam). Futuro → 0 (nenhum). Corrente → o bimestre anterior ao do
 * mês de hoje: em julho (bimestre 4) o último FECHADO é o 3.
 */
function ultimoBimestreFechado(exercicio: number, em: Date): number {
  const anoRef = em.getUTCFullYear();
  if (exercicio < anoRef) return 6;
  if (exercicio > anoRef) return 0;
  return bimestreDoMes(em.getUTCMonth() + 1) - 1;
}

// ── O TEXTO DO DECRETO (TR 4.19/4.24) ─────────────────────────────────────────────

/**
 * O TEXTO do decreto do CMD — template do ente (`TemplateDecreto`) ou o default do código.
 *
 * ⚠️ O `corpo` (o anexo — o quadro das cotas) vem de FORA, montado por quem imprime. É deliberado:
 * o gerador do domínio é uma função de TEXTO com placeholders nomeados, não um formatador de tabela.
 * Ele falha (fail-closed) se sobrar `{placeholder}` sem dado — um decreto publicado com "{ato}" no
 * lugar do número é pior do que não ter template.
 */
export async function gerarTextoDecretoCmd(p: {
  readonly exercicio: number;
  readonly atoRef: string;
  readonly dataVigencia: Date;
  readonly corpo: string;
}): Promise<string> {
  await exigirSessao();
  return gerarDecretoCmd(cliente(), p);
}

/** O texto do decreto do MBA — mesma anatomia, template "MBA". */
export async function gerarTextoDecretoMba(p: {
  readonly exercicio: number;
  readonly atoRef: string;
  readonly dataVigencia: Date;
  readonly corpo: string;
}): Promise<string> {
  await exigirSessao();
  return gerarDecretoMba(cliente(), p);
}

// ── TRANSPOSIÇÃO E SOMA (privados) ────────────────────────────────────────────────

interface CelulaBruta {
  readonly fonteId: string;
  readonly periodo: number;
  readonly valor: { toFixed: (casas: number) => string };
  readonly fonte: { readonly codigo: string; readonly descricao: string };
}

/**
 * Transpõe as células (fonte, período) na MATRIZ que a tela desenha, e fecha as duas bordas.
 *
 * ⚠️ A ORDEM DAS LINHAS É POR CÓDIGO DE FONTE, não pelo id (cuid). O id é opaco e a sua ordem é
 * aleatória para quem lê; o código é o que aparece no decreto e no SAGRES.
 */
function matriz(
  versao: { id: string; numero: number; atoRef: string; vigenteDesde: Date; criadoPor: string },
  periodos: number,
  celulas: readonly CelulaBruta[]
): VersaoProgramacao {
  const porFonte = new Map<string, { codigo: string; descricao: string; valores: (string | null)[] }>();
  for (const c of celulas) {
    const acc =
      porFonte.get(c.fonteId) ??
      { codigo: c.fonte.codigo, descricao: c.fonte.descricao, valores: new Array<string | null>(periodos).fill(null) };
    // Fora de 1..N não deveria existir (o Zod do domínio barra), mas se existir NÃO se descarta em
    // silêncio: um valor perdido faria a linha não fechar com o total do decreto.
    if (c.periodo >= 1 && c.periodo <= periodos) acc.valores[c.periodo - 1] = c.valor.toFixed(2);
    porFonte.set(c.fonteId, acc);
  }

  const linhas: LinhaProgramacao[] = [...porFonte.entries()]
    .map(([fonteId, f]) => {
      const parcelas = f.valores.map((v) => v ?? "0.00");
      return {
        fonteId,
        fonteCodigo: f.codigo,
        fonteDescricao: f.descricao,
        parcelas,
        total: somar(parcelas),
        periodosSemLinha: f.valores.flatMap((v, i) => (v === null ? [i + 1] : [])),
      };
    })
    .sort((a, b) => a.fonteCodigo.localeCompare(b.fonteCodigo, "pt-BR"));

  const totalPorPeriodo = Array.from({ length: periodos }, (_, i) =>
    somar(linhas.map((l) => l.parcelas[i] ?? "0.00"))
  );

  return {
    versaoId: versao.id,
    numero: versao.numero,
    atoRef: versao.atoRef,
    vigenteDesde: versao.vigenteDesde,
    criadoPor: versao.criadoPor,
    linhas,
    totalPorPeriodo,
    // ⚠️ O total geral sai da Σ das COLUNAS, e as linhas somam o mesmo. Fechar pelos dois lados é o
    // que prova que a transposição não perdeu célula.
    total: somar(totalPorPeriodo),
  };
}

/**
 * Σ de strings decimais, em CENTAVOS INTEIROS (bigint) — exata, sem ponto flutuante.
 *
 * ⚠️ Nada de `Number(a) + Number(b)`: 0.1 + 0.2 dá 0.30000000000000004 em float, e um cronograma que
 * não fecha ao centavo com a LOA é um cronograma que o TCE devolve. É a mesma técnica de
 * `lib/relatorios/atualizacoes-orcamentarias.ts` — a soma de apresentação não introduz erro.
 */
function somar(valores: readonly string[]): string {
  let centavos = 0n;
  for (const v of valores) centavos += emCentavos(v);
  const sinal = centavos < 0n ? "-" : "";
  const abs = centavos < 0n ? -centavos : centavos;
  return `${sinal}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

function emCentavos(decimal: string): bigint {
  const [inteiro = "0", frac = ""] = decimal.trim().split(".");
  const negativo = inteiro.startsWith("-");
  const magnitude =
    BigInt(negativo ? inteiro.slice(1) : inteiro) * 100n + BigInt((frac + "00").slice(0, 2));
  return negativo ? -magnitude : magnitude;
}
