import { z } from "zod";
import { Decimal } from "../../packages/contracts/index.js";
import { diaCivil, instanteCivil, janelaCivilDoAno } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * V35 A3 — OS RESTOS A PAGAR NO CONTROLE ORÇAMENTÁRIO (classes 5.3 e 6.3), MCASP 11ª ed., Parte I, 4.7.4 a 4.7.6.
 * Ver `prisma/schema/m08-controle-dos-restos.prisma`.
 *
 * ═══ O ROTEIRO DO MANUAL, POR PAPEL (a conta de cada papel é da declaração do contador) ═══
 * Inscrição, no fim do exercício E (4.7.4.1 e 4.7.4.3):
 *   RPNP  D crédito empenhado a liquidar / C empenhos a liquidar inscritos em RPNP
 *         D RPNP – inscrição no exercício / C RPNP a liquidar – inscrição no exercício
 *   RPP   D crédito empenhado liquidado a pagar / C empenhos liquidados inscritos em RPP
 *         D RPP – inscrição no exercício / C RPP – inscrição no exercício
 * Abertura de E+1 (4.7.6, c), em 1º de janeiro:
 *   inscrições de E−1: D RPNP/RPP – exercícios anteriores / C RPNP/RPP – inscritos (pelo saldo que ficou)
 *   inscrições de E:   D RPNP/RPP – inscritos / C … – inscrição no exercício; D … a liquidar/RPP – inscrição no exercício
 *                      / C RPNP a liquidar / RPP a pagar
 * Execução (4.7.4.4, 4.7.4.5 e seguintes): liquidação D a liquidar / C em liquidação e D em liquidação / C liquidados a
 *   pagar (o sistema não tem o estágio "em liquidação" separado: os dois pares vão no mesmo lançamento); pagamento
 *   D a pagar / C pagos; cancelamento D o estágio / C cancelados.
 * Encerramento de E (4.7.6, a e b), para as inscrições de anos anteriores: D pagos + cancelados / C a inscrição (inscritos
 *   se a inscrição é de E−1, exercícios anteriores se mais antiga); RPNP liquidado e não pago vira RPP: D RPNP liquidados
 *   a pagar / C RPNP inscrição e D RPP inscrição / C RPP a pagar.
 *
 * ═══ SALDO POR INSCRIÇÃO ═══ Cada lançamento de controle é de UMA inscrição; o saldo de um papel numa inscrição é a soma
 * das partidas dos lançamentos dela naquela conta. A execução tira de cada estágio pela ordem escrita em cada função, e
 * recusa se faltar (o que só acontece se o razão divergiu da tabela dos restos).
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export const PAPEIS_DO_CONTROLE = [
  "CREDITO_EMPENHADO_A_LIQUIDAR",
  "CREDITO_LIQUIDADO_A_PAGAR",
  "EMPENHOS_INSCRITOS_EM_RPNP",
  "EMPENHOS_INSCRITOS_EM_RPP",
  "RPNP_INSCRICAO_NO_EXERCICIO",
  "RPNP_INSCRITOS",
  "RPNP_EXERCICIOS_ANTERIORES",
  "RPNP_A_LIQUIDAR_NO_EXERCICIO",
  "RPNP_A_LIQUIDAR",
  "RPNP_EM_LIQUIDACAO",
  "RPNP_LIQUIDADOS_A_PAGAR",
  "RPNP_PAGOS",
  "RPNP_CANCELADOS",
  "RPP_INSCRICAO_NO_EXERCICIO",
  "RPP_INSCRITOS",
  "RPP_EXERCICIOS_ANTERIORES",
  "RPP_NO_EXERCICIO",
  "RPP_A_PAGAR",
  "RPP_PAGOS",
  "RPP_CANCELADOS",
] as const;
export type PapelDoControle = (typeof PAPEIS_DO_CONTROLE)[number];

/**
 * O PAPEL NO MANUAL: o título do PCASP de onde a conta tem de vir (a conta tem de começar por ele) e a sugestão, quando o
 * manual nomeia a conta inteira. Os cancelados ficam SEM sugestão: o plano tem duas (insuficiência de recursos ou
 * outros; indevidos ou outros nos processados), e a escolha é do ente.
 */
export const PAPEL_NO_MANUAL: Readonly<Record<PapelDoControle, { readonly titulo: string; readonly prefixo: string; readonly sugestao: string | null }>> = {
  CREDITO_EMPENHADO_A_LIQUIDAR: { titulo: "Crédito empenhado a liquidar", prefixo: "6.2.2.1.3.01", sugestao: "6.2.2.1.3.01.00" },
  CREDITO_LIQUIDADO_A_PAGAR: { titulo: "Crédito empenhado liquidado a pagar", prefixo: "6.2.2.1.3.03", sugestao: "6.2.2.1.3.03.00" },
  EMPENHOS_INSCRITOS_EM_RPNP: { titulo: "Empenhos a liquidar inscritos em RP não processados", prefixo: "6.2.2.1.3.05", sugestao: "6.2.2.1.3.05.00" },
  EMPENHOS_INSCRITOS_EM_RPP: { titulo: "Empenhos liquidados inscritos em RP processados", prefixo: "6.2.2.1.3.07", sugestao: "6.2.2.1.3.07.00" },
  RPNP_INSCRICAO_NO_EXERCICIO: { titulo: "RP não processados – inscrição no exercício", prefixo: "5.3.1.7", sugestao: "5.3.1.7.0.00.00" },
  RPNP_INSCRITOS: { titulo: "RP não processados – inscritos", prefixo: "5.3.1.1", sugestao: "5.3.1.1.0.00.00" },
  RPNP_EXERCICIOS_ANTERIORES: { titulo: "RP não processados – exercícios anteriores", prefixo: "5.3.1.2", sugestao: "5.3.1.2.0.00.00" },
  RPNP_A_LIQUIDAR_NO_EXERCICIO: { titulo: "RP não processados a liquidar – inscrição no exercício", prefixo: "6.3.1.7.1", sugestao: "6.3.1.7.1.00.00" },
  RPNP_A_LIQUIDAR: { titulo: "RP não processados a liquidar", prefixo: "6.3.1.1", sugestao: "6.3.1.1.0.00.00" },
  RPNP_EM_LIQUIDACAO: { titulo: "RP não processados em liquidação", prefixo: "6.3.1.2", sugestao: "6.3.1.2.0.00.00" },
  RPNP_LIQUIDADOS_A_PAGAR: { titulo: "RP não processados liquidados a pagar", prefixo: "6.3.1.3", sugestao: "6.3.1.3.0.00.00" },
  RPNP_PAGOS: { titulo: "RP não processados pagos", prefixo: "6.3.1.4", sugestao: "6.3.1.4.0.00.00" },
  RPNP_CANCELADOS: { titulo: "RP não processados cancelados", prefixo: "6.3.1.9", sugestao: null },
  RPP_INSCRICAO_NO_EXERCICIO: { titulo: "RP processados – inscrição no exercício", prefixo: "5.3.2.7", sugestao: "5.3.2.7.0.00.00" },
  RPP_INSCRITOS: { titulo: "RP processados – inscritos", prefixo: "5.3.2.1", sugestao: "5.3.2.1.0.00.00" },
  RPP_EXERCICIOS_ANTERIORES: { titulo: "RP processados – exercícios anteriores", prefixo: "5.3.2.2", sugestao: "5.3.2.2.0.00.00" },
  RPP_NO_EXERCICIO: { titulo: "RP processados – inscrição no exercício (execução)", prefixo: "6.3.2.7", sugestao: "6.3.2.7.0.00.00" },
  RPP_A_PAGAR: { titulo: "RP processados a pagar", prefixo: "6.3.2.1", sugestao: "6.3.2.1.0.00.00" },
  RPP_PAGOS: { titulo: "RP processados pagos", prefixo: "6.3.2.2", sugestao: "6.3.2.2.0.00.00" },
  RPP_CANCELADOS: { titulo: "RP processados cancelados", prefixo: "6.3.2.9", sugestao: null },
};

type Contas = ReadonlyMap<PapelDoControle, { readonly id: string; readonly codigo: string }>;

// ═══ A DECLARAÇÃO ═══

export const zDeclararContasDoControleDosRestos = z.object({
  contas: z.record(z.string(), z.string().trim()),
  fundamento: z.string().trim().min(10, "Cite o fundamento (MCASP, Parte I, 4.7, e o plano do Tribunal)."),
  criadoPor: z.string().min(1),
});

export async function declararContasDoControleDosRestos(
  prisma: PrismaClient,
  input: z.input<typeof zDeclararContasDoControleDosRestos>
): Promise<{ readonly versao: number }> {
  const d = zDeclararContasDoControleDosRestos.parse(input);
  const faltam = PAPEIS_DO_CONTROLE.filter((p) => (d.contas[p] ?? "") === "");
  if (faltam.length > 0) throw new Error(`O controle dos restos liga com TODAS as contas do roteiro do manual; faltam: ${faltam.map((p) => PAPEL_NO_MANUAL[p].titulo).join("; ")}. Nada foi gravado.`);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararContasDoControleDosRestos, "ENTE");
    const codigos = PAPEIS_DO_CONTROLE.map((p) => d.contas[p]!);
    const achadas = await tx.contaPcasp.findMany({ where: { codigo: { in: codigos } }, select: { id: true, codigo: true, analitica: true } });
    for (const p of PAPEIS_DO_CONTROLE) {
      const codigo = d.contas[p]!;
      const c = achadas.find((x) => x.codigo === codigo);
      const m = PAPEL_NO_MANUAL[p];
      if (c === undefined) throw new Error(`A conta ${codigo} (${m.titulo}) não está no plano carregado. Nada foi gravado.`);
      if (!c.analitica) throw new Error(`A conta ${codigo} (${m.titulo}) é sintética e não recebe partida. Nada foi gravado.`);
      if (!codigo.startsWith(`${m.prefixo}.`)) throw new Error(`A conta ${codigo} não é do título ${m.prefixo} (${m.titulo}, MCASP, Parte I, 4.7). Nada foi gravado.`);
    }
    // Trocar a conta de um papel com restos já controlados deixaria o saldo antigo numa conta que ninguém mais move.
    const vigente = await contasVigentes(tx);
    if (vigente !== null && (await tx.controleDoRestoAPagar.count()) > 0) {
      const trocadas = PAPEIS_DO_CONTROLE.filter((p) => vigente.get(p)?.codigo !== d.contas[p]);
      if (trocadas.length > 0) {
        throw new Error(`Já há restos a pagar controlados nas contas declaradas; trocar ${trocadas.map((p) => PAPEL_NO_MANUAL[p].titulo).join("; ")} deixaria o saldo deles numa conta que nada mais movimenta. Nada foi gravado.`);
      }
    }
    const ultima = (await tx.declaracaoDoControleDosRestos.findFirst({ orderBy: { versao: "desc" }, select: { versao: true } }))?.versao ?? 0;
    const versao = ultima + 1;
    await tx.declaracaoDoControleDosRestos.create({
      data: {
        versao, fundamento: d.fundamento, criadoPor: d.criadoPor,
        contas: { create: PAPEIS_DO_CONTROLE.map((p) => ({ papel: p, contaId: achadas.find((x) => x.codigo === d.contas[p])!.id })) },
      },
      select: { id: true },
    });
    return { versao };
  });
}

/** As contas da última declaração; `null` = o controle dos restos não está ligado. */
export async function contasVigentes(tx: Pick<Tx, "declaracaoDoControleDosRestos">): Promise<Contas | null> {
  const d = await tx.declaracaoDoControleDosRestos.findFirst({ orderBy: { versao: "desc" }, select: { contas: { select: { papel: true, conta: { select: { id: true, codigo: true } } } } } });
  if (d === null) return null;
  return new Map(d.contas.map((c) => [c.papel as PapelDoControle, c.conta]));
}

export const AVISO_CONTROLE_NAO_LIGADO =
  "O controle dos restos a pagar nas classes 5.3 e 6.3 não está ligado: declare as contas em Contabilidade › Contas dos restos a pagar, seção Controle orçamentário (MCASP, Parte I, 4.7). Sem a declaração, a inscrição fica só no cadastro dos restos.";

// ═══ O MOTOR ═══

const VIRADA: readonly string[] = ["INSCRICAO", "ENCERRAMENTO", "ABERTURA"];

interface Par {
  readonly debito: PapelDoControle;
  readonly credito: PapelDoControle;
  readonly valor: Decimal;
  /** As partidas de 6.2.2 levam a ficha do empenho, como as do empenho. */
  readonly comFicha?: boolean;
}

async function lancarControle(
  tx: Tx,
  contas: Contas,
  c: { readonly inscricaoId: string; readonly evento: string; readonly data: Date; readonly exercicio: number; readonly historico: string; readonly pares: readonly Par[]; readonly fichaId?: string | null; readonly lancamentoDoFatoId?: string | null; readonly criadoPor: string }
): Promise<void> {
  const negativo = c.pares.find((p) => p.valor.lessThan(0));
  if (negativo !== undefined) {
    throw new Error(
      `O controle orçamentário do resto a pagar ficaria com saldo invertido em ${PAPEL_NO_MANUAL[negativo.debito].titulo} / ${PAPEL_NO_MANUAL[negativo.credito].titulo} (${negativo.valor.toFixed(2)}) no evento ${c.evento}: o razão das classes 5.3/6.3 divergiu do cadastro dos restos. Nada foi gravado.`
    );
  }
  const pares = c.pares.filter((p) => p.valor.greaterThan(0));
  if (pares.length === 0) return;
  const conta = (p: PapelDoControle): string => contas.get(p)!.id;
  const lancamentoId = await lancarNoRazao(tx, {
    numeroControle: `CRP-${c.evento}-${c.inscricaoId.slice(-10)}`,
    dataTransacao: c.data,
    historico: c.historico,
    origemTipo: "CONTROLE_DOS_RESTOS",
    origemId: c.inscricaoId,
    // A inscrição, o encerramento e a abertura são a VIRADA (MCASP 4.7.6), não movimento do mês: ENCERRAMENTO, como os
    // demais lançamentos da virada — e por isso isentos da competência travada. A execução é movimento: NORMAL.
    natureza: VIRADA.includes(c.evento) ? "ENCERRAMENTO" : "NORMAL",
    criadoPor: c.criadoPor,
    partidas: pares.flatMap((p) => [
      { contaId: conta(p.debito), tipo: "DEBITO" as const, subsistema: "ORCAMENTARIO" as const, valor: p.valor.toFixed(2), fichaId: p.comFicha === true ? (c.fichaId ?? null) : null },
      { contaId: conta(p.credito), tipo: "CREDITO" as const, subsistema: "ORCAMENTARIO" as const, valor: p.valor.toFixed(2), fichaId: p.comFicha === true ? (c.fichaId ?? null) : null },
    ]),
  });
  await tx.controleDoRestoAPagar.create({
    data: { inscricaoId: c.inscricaoId, lancamentoId, evento: c.evento, lancamentoDoFatoId: c.lancamentoDoFatoId ?? null, exercicio: c.exercicio, criadoPor: c.criadoPor },
    select: { id: true },
  });
}

/** Saldo de cada papel na inscrição, com sinal: devedor positivo (classe 5) e credor positivo (classe 6 e 6.2.2). */
async function saldosDaInscricao(tx: Tx, contas: Contas, inscricaoId: string, ate?: Date): Promise<Map<PapelDoControle, Decimal>> {
  const ps = await tx.partidaContabil.findMany({
    where: { lancamento: { controleDoResto: { inscricaoId }, ...(ate === undefined ? {} : { dataTransacao: { lte: ate } }) } },
    select: { tipo: true, valor: true, contaId: true },
  });
  const saldos = new Map<PapelDoControle, Decimal>();
  for (const [papel, c] of contas) {
    let s = new Decimal(0);
    for (const p of ps) if (p.contaId === c.id) s = s.plus(p.tipo === "DEBITO" ? p.valor : new Decimal(p.valor).negated());
    saldos.set(papel, papel.startsWith("RPNP_INSCRI") || papel.startsWith("RPNP_EXERC") || papel.startsWith("RPP_INSCRI") || papel.startsWith("RPP_EXERC") ? s : s.negated());
  }
  return saldos;
}

async function controlada(tx: Tx, inscricaoId: string): Promise<boolean> {
  return (await tx.controleDoRestoAPagar.count({ where: { inscricaoId, evento: "INSCRICAO" } })) > 0;
}

const meioDia = (ano: number, mes: number, dia: number): Date => instanteCivil(ano, mes, dia, 12);

/** No encerramento de E, depois de gravar a inscrição: os dois pares do manual (4.7.4.1 / 4.7.4.3). */
export async function controlarInscricao(
  tx: Tx,
  contas: Contas,
  i: { readonly id: string; readonly tipo: "PROCESSADO" | "NAO_PROCESSADO"; readonly valor: Decimal; readonly fichaId: string; readonly ano: number; readonly criadoPor: string }
): Promise<void> {
  const np = i.tipo === "NAO_PROCESSADO";
  await lancarControle(tx, contas, {
    inscricaoId: i.id, evento: "INSCRICAO", data: meioDia(i.ano, 12, 31), exercicio: i.ano, fichaId: i.fichaId, criadoPor: i.criadoPor,
    historico: `Inscrição em restos a pagar ${np ? "não processados" : "processados"} (${String(i.ano)})`,
    pares: np
      ? [
          { debito: "CREDITO_EMPENHADO_A_LIQUIDAR", credito: "EMPENHOS_INSCRITOS_EM_RPNP", valor: i.valor, comFicha: true },
          { debito: "RPNP_INSCRICAO_NO_EXERCICIO", credito: "RPNP_A_LIQUIDAR_NO_EXERCICIO", valor: i.valor },
        ]
      : [
          { debito: "CREDITO_LIQUIDADO_A_PAGAR", credito: "EMPENHOS_INSCRITOS_EM_RPP", valor: i.valor, comFicha: true },
          { debito: "RPP_INSCRICAO_NO_EXERCICIO", credito: "RPP_NO_EXERCICIO", valor: i.valor },
        ],
  });
}

/** No encerramento de E, para as inscrições controladas de anos anteriores (4.7.6, a e b). */
export async function encerrarControleDoExercicio(tx: Tx, contas: Contas, ano: number, criadoPor: string): Promise<number> {
  const inscricoes = await tx.inscricaoRestosAPagar.findMany({ where: { exercicioOrigem: { lt: ano }, controles: { some: { evento: "INSCRICAO" } } }, select: { id: true, exercicioOrigem: true }, orderBy: { id: "asc" } });
  // A mesma trava dos atos de RP: uma liquidação ou pagamento concorrente não move o estágio que este encerramento lê.
  if (inscricoes.length > 0) await travar(tx, "InscricaoRestosAPagar", inscricoes.map((i) => i.id));
  const corte = janelaCivilDoAno(ano).fim;
  for (const i of inscricoes) {
    const s = await saldosDaInscricao(tx, contas, i.id, corte);
    const recente = i.exercicioOrigem === ano - 1;
    const rpnp: PapelDoControle = recente ? "RPNP_INSCRITOS" : "RPNP_EXERCICIOS_ANTERIORES";
    const rpp: PapelDoControle = recente ? "RPP_INSCRITOS" : "RPP_EXERCICIOS_ANTERIORES";
    await lancarControle(tx, contas, {
      inscricaoId: i.id, evento: "ENCERRAMENTO", data: meioDia(ano, 12, 31), exercicio: ano, criadoPor,
      historico: `Encerramento dos restos a pagar de ${String(i.exercicioOrigem)} no exercício de ${String(ano)}`,
      pares: [
        { debito: "RPNP_PAGOS", credito: rpnp, valor: s.get("RPNP_PAGOS")! },
        { debito: "RPNP_CANCELADOS", credito: rpnp, valor: s.get("RPNP_CANCELADOS")! },
        { debito: "RPP_PAGOS", credito: rpp, valor: s.get("RPP_PAGOS")! },
        { debito: "RPP_CANCELADOS", credito: rpp, valor: s.get("RPP_CANCELADOS")! },
        // RPNP liquidado e não pago vira RPP
        { debito: "RPNP_LIQUIDADOS_A_PAGAR", credito: rpnp, valor: s.get("RPNP_LIQUIDADOS_A_PAGAR")! },
        { debito: rpp, credito: "RPP_A_PAGAR", valor: s.get("RPNP_LIQUIDADOS_A_PAGAR")! },
      ],
    });
  }
  return inscricoes.length;
}

/** A abertura de E+1 (4.7.6, c), em 1º de janeiro: as de E−1 vão a "exercícios anteriores"; as de E, a "inscritos". */
export async function abrirControleDoExercicio(tx: Tx, contas: Contas, anoNovo: number, criadoPor: string): Promise<void> {
  const inscricoes = await tx.inscricaoRestosAPagar.findMany({
    where: { exercicioOrigem: { in: [anoNovo - 1, anoNovo - 2] }, controles: { some: { evento: "INSCRICAO" } } },
    select: { id: true, exercicioOrigem: true },
    orderBy: { id: "asc" },
  });
  if (inscricoes.length > 0) await travar(tx, "InscricaoRestosAPagar", inscricoes.map((i) => i.id));
  const corte = janelaCivilDoAno(anoNovo - 1).fim;
  for (const i of inscricoes) {
    const s = await saldosDaInscricao(tx, contas, i.id, corte);
    const pares: Par[] =
      i.exercicioOrigem === anoNovo - 2
        ? [
            { debito: "RPNP_EXERCICIOS_ANTERIORES", credito: "RPNP_INSCRITOS", valor: s.get("RPNP_INSCRITOS")! },
            { debito: "RPP_EXERCICIOS_ANTERIORES", credito: "RPP_INSCRITOS", valor: s.get("RPP_INSCRITOS")! },
          ]
        : [
            { debito: "RPNP_INSCRITOS", credito: "RPNP_INSCRICAO_NO_EXERCICIO", valor: s.get("RPNP_INSCRICAO_NO_EXERCICIO")! },
            { debito: "RPNP_A_LIQUIDAR_NO_EXERCICIO", credito: "RPNP_A_LIQUIDAR", valor: s.get("RPNP_A_LIQUIDAR_NO_EXERCICIO")! },
            { debito: "RPP_INSCRITOS", credito: "RPP_INSCRICAO_NO_EXERCICIO", valor: s.get("RPP_INSCRICAO_NO_EXERCICIO")! },
            { debito: "RPP_NO_EXERCICIO", credito: "RPP_A_PAGAR", valor: s.get("RPP_NO_EXERCICIO")! },
          ];
    await lancarControle(tx, contas, {
      inscricaoId: i.id, evento: "ABERTURA", data: meioDia(anoNovo, 1, 1), exercicio: anoNovo, criadoPor,
      historico: `Abertura dos restos a pagar de ${String(i.exercicioOrigem)} no exercício de ${String(anoNovo)}`,
      pares,
    });
  }
}

/** Tira `valor` dos estágios, na ordem; recusa se o controle não comporta (o razão divergiu da tabela dos restos). */
function retirar(s: Map<PapelDoControle, Decimal>, ordem: readonly (readonly [PapelDoControle, PapelDoControle])[], valor: Decimal, oQue: string): Par[] {
  let falta = valor;
  const pares: Par[] = [];
  for (const [de, para] of ordem) {
    const tira = Decimal.min(falta, Decimal.max(s.get(de)!, 0));
    if (tira.greaterThan(0)) pares.push({ debito: de, credito: para, valor: tira });
    falta = falta.minus(tira);
  }
  if (falta.greaterThan(0)) throw new Error(`O controle orçamentário do resto a pagar não comporta ${oQue}: faltam ${falta.toFixed(2)} nos estágios. O razão das classes 5.3/6.3 divergiu do cadastro dos restos. Nada foi gravado.`);
  return pares;
}

export async function controlarExecucao(
  tx: Tx,
  e: { readonly inscricaoId: string; readonly evento: "LIQUIDACAO" | "PAGAMENTO" | "CANCELAMENTO"; readonly valor: Decimal; readonly data: Date; readonly lancamentoDoFatoId: string; readonly criadoPor: string }
): Promise<void> {
  if (!(await controlada(tx, e.inscricaoId))) return; // inscrição anterior ao controle: nada a mover (regra do cabeçalho)
  // Os estágios de Y só existem depois do encerramento e da abertura de Y−1 (4.7.6): um ato de Y antes deles cairia num
  // estágio que a transferência RPNP → RPP, lançada depois com data de 31/12, ainda vai mexer.
  const ano = Number(diaCivil(e.data).slice(0, 4));
  const encerrado = await tx.exercicio.findUnique({ where: { ano: ano - 1 }, select: { encerramento: { select: { id: true } } } });
  if (encerrado?.encerramento == null) {
    throw new Error(`O resto a pagar está no controle orçamentário, e o exercício de ${String(ano - 1)} ainda não foi encerrado: o encerramento e a abertura dos restos (MCASP, Parte I, 4.7.6) vêm antes de qualquer liquidação, pagamento ou cancelamento datado em ${String(ano)}. Encerre ${String(ano - 1)} primeiro. Nada foi gravado.`);
  }
  const contas = await contasVigentes(tx);
  if (contas === null) throw new Error("A inscrição é controlada, mas não há contas do controle declaradas. Nada foi gravado.");
  const s = await saldosDaInscricao(tx, contas, e.inscricaoId);
  const pares: Par[] =
    e.evento === "LIQUIDACAO"
      ? retirar(s, [["RPNP_A_LIQUIDAR", "RPNP_EM_LIQUIDACAO"]], e.valor, "a liquidação").flatMap((p) => [p, { debito: "RPNP_EM_LIQUIDACAO", credito: "RPNP_LIQUIDADOS_A_PAGAR", valor: p.valor }])
      : e.evento === "PAGAMENTO"
        ? retirar(s, [["RPP_A_PAGAR", "RPP_PAGOS"], ["RPNP_LIQUIDADOS_A_PAGAR", "RPNP_PAGOS"]], e.valor, "o pagamento")
        : retirar(s, [["RPNP_A_LIQUIDAR", "RPNP_CANCELADOS"], ["RPNP_LIQUIDADOS_A_PAGAR", "RPNP_CANCELADOS"], ["RPP_A_PAGAR", "RPP_CANCELADOS"]], e.valor, "o cancelamento");
  await lancarControle(tx, contas, {
    inscricaoId: e.inscricaoId, evento: e.evento, data: e.data, exercicio: Number(diaCivil(e.data).slice(0, 4)), criadoPor: e.criadoPor,
    historico: `${e.evento === "LIQUIDACAO" ? "Liquidação" : e.evento === "PAGAMENTO" ? "Pagamento" : "Cancelamento"} de restos a pagar (controle)`,
    pares, lancamentoDoFatoId: e.lancamentoDoFatoId,
  });
}

/** A anulação de um pagamento ou cancelamento inverte o controle que o ato original gerou. */
export async function inverterControleDoFato(
  tx: Tx,
  a: { readonly lancamentoOriginalId: string; readonly lancamentoDaAnulacaoId: string; readonly evento: "ANULACAO_LIQUIDACAO" | "ANULACAO_PAGAMENTO" | "ANULACAO_CANCELAMENTO"; readonly data: Date; readonly criadoPor: string }
): Promise<void> {
  const controles = await tx.controleDoRestoAPagar.findMany({
    where: { lancamentoDoFatoId: a.lancamentoOriginalId },
    select: { inscricaoId: true, exercicio: true, lancamento: { select: { partidas: { select: { contaId: true, tipo: true, valor: true, fichaId: true } } } } },
  });
  if (controles.length === 0) return; // ato de resto não controlado (ou ato comum): nada a inverter
  // Inverter as partidas só é certo enquanto o exercício do ato está aberto: depois, o encerramento já levou os pagos e
  // cancelados à inscrição e o liquidado a RPP, e a cópia invertida deixaria o estágio negativo.
  const anoDoAto = Math.max(...controles.map((c) => c.exercicio));
  const encerrado = await tx.exercicio.findUnique({ where: { ano: anoDoAto }, select: { encerramento: { select: { id: true } } } });
  if (encerrado?.encerramento != null) {
    throw new Error(`O ato é de ${String(anoDoAto)}, exercício já encerrado, e o resto a pagar está no controle orçamentário: o encerramento já moveu o que ele lançou (MCASP, Parte I, 4.7.6), e inverter as partidas deixaria os estágios com saldo invertido. A anulação de ato de exercício encerrado não é feita por aqui. Nada foi gravado.`);
  }
  const exercicioDaAnulacao = Number(diaCivil(a.data).slice(0, 4));
  for (const c of controles) {
    const id = await lancarNoRazao(tx, {
      numeroControle: `CRP-${a.evento}-${c.inscricaoId.slice(-10)}`,
      dataTransacao: a.data,
      historico: "Anulação: inverte o controle orçamentário do resto a pagar",
      origemTipo: "CONTROLE_DOS_RESTOS",
      origemId: c.inscricaoId,
      criadoPor: a.criadoPor,
      partidas: c.lancamento.partidas.map((p) => ({ contaId: p.contaId, tipo: p.tipo === "DEBITO" ? ("CREDITO" as const) : ("DEBITO" as const), subsistema: "ORCAMENTARIO" as const, valor: new Decimal(p.valor).toFixed(2), fichaId: p.fichaId })),
    });
    await tx.controleDoRestoAPagar.create({ data: { inscricaoId: c.inscricaoId, lancamentoId: id, evento: a.evento, lancamentoDoFatoId: a.lancamentoDaAnulacaoId, exercicio: exercicioDaAnulacao, criadoPor: a.criadoPor }, select: { id: true } });
  }
}
