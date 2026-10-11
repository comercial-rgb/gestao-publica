import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { documentoTemDigitoValido, normalizarDocumento } from "../../packages/documento/index.js";
import { travar } from "../../packages/locks/index.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, meioDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { estornarMovimentoBancarioNaTx, registrarMovimentoBancarioNaTx } from "../m09-tesouraria/movimentacao.js";

type TxDoMovimento = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * V39-R3 (R3-016, V39-030) — OS REALIZÁVEIS DE NATUREZA ATIVA.
 *
 * Valor do ente que está com outra pessoa e volta em dinheiro (depósito restituível feito pelo município, adiantamento
 * a devolver, crédito diverso a receber). O espelho da consignação, separado dela por construção: a consignação é
 * passivo (dinheiro de terceiro que o município guarda) e mora em `TipoConsignacao`; o realizável é ativo e mora aqui.
 *
 *   CONSTITUIÇÃO  D conta do ativo (decidida pelo ente)  /  C disponibilidade (a conta contábil da conta bancária)
 *   BAIXA         D disponibilidade                      /  C conta do ativo
 *   ANULAÇÃO      o lançamento do original, invertido; o movimento novo aponta o original, uma vez.
 *
 * Nenhuma conta no código: a do ativo vem da decisão do ente para a categoria (com fundamento), a da disponibilidade
 * vem do cadastro da conta bancária. Sem decisão vigente e ativa, a categoria não movimenta. O que se confere aqui é
 * só a NATUREZA da conta escolhida — analítica, do ativo, dos grupos de créditos realizáveis —, como o tipo de
 * consignação confere que a dele é do passivo.
 *
 * O CAIXA vai pelo movimento bancário do M09 (saída e retorno do realizável), e é ele que o saldo da conta, a conciliação e
 * a trava do saldo bancário enxergam. Saldo por categoria, devedor, conta do ativo e fonte: constituição soma, baixa
 * subtrai, a anulação desfaz o original. Baixa
 * (e anulação de constituição) acima do saldo é recusada, sob a trava do saldo.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * Os grupos do ativo em que um realizável em dinheiro pode estar: créditos a curto prazo, demais créditos e valores a
 * curto prazo, e os créditos do realizável a longo prazo. Ficam de fora estoques, investimentos temporários e VPD paga
 * antecipadamente do longo prazo (1.2.1.3, 1.2.1.4, 1.2.1.9), que não são dinheiro a receber; as redutoras (ajuste de
 * perdas) caem pela natureza do saldo. É a conferência de NATUREZA; a conta é decisão do ente. A tela usa a mesma lista.
 */
export const GRUPOS_DO_REALIZAVEL = ["1.1.2.", "1.1.3.", "1.2.1.1.", "1.2.1.2."] as const;

const zCodigo = z.string().trim().min(2, "Informe o código da categoria.").max(30);

export const zCadastrarCategoriaDeRealizavel = z.object({
  codigo: zCodigo,
  descricao: z.string().trim().min(3, "Informe a descrição da categoria."),
  criadoPor: z.string().min(1),
});

export async function cadastrarCategoriaDeRealizavel(prisma: PrismaClient, input: z.input<typeof zCadastrarCategoriaDeRealizavel>): Promise<{ readonly categoriaId: string }> {
  const d = zCadastrarCategoriaDeRealizavel.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarCategoriaDeRealizavel, "ENTE");
    const codigo = d.codigo.toUpperCase();
    if ((await tx.categoriaDeRealizavel.findUnique({ where: { codigo }, select: { id: true } })) !== null) {
      throw new Error(`Já existe a categoria de realizável ${codigo}. Nada foi gravado.`);
    }
    const c = await tx.categoriaDeRealizavel.create({ data: { codigo, descricao: d.descricao, criadoPor: d.criadoPor }, select: { id: true } });
    return { categoriaId: c.id };
  });
}

export const zDecidirContaDoRealizavel = z.object({
  categoriaId: z.string().min(1),
  /** O código PCASP da conta do ativo; null com `ativa: false` suspende a categoria. */
  contaAtivoCodigo: z.string().trim().min(1).nullable(),
  ativa: z.boolean(),
  fundamento: z.string().trim().min(10, "Informe o fundamento da decisão (ato, parecer, orientação contábil)."),
  criadoPor: z.string().min(1),
});

export async function decidirContaDoRealizavel(prisma: PrismaClient, input: z.input<typeof zDecidirContaDoRealizavel>): Promise<{ readonly decisaoId: string }> {
  const d = zDecidirContaDoRealizavel.parse(input);
  if (d.ativa && d.contaAtivoCodigo === null) throw new Error("Categoria ativa precisa da conta do ativo. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.decidirContaDoRealizavel, "ENTE");
    const cat = await tx.categoriaDeRealizavel.findUnique({ where: { id: d.categoriaId }, select: { id: true, codigo: true } });
    if (cat === null) throw new Error("Categoria de realizável não encontrada. Nada foi gravado.");
    let contaAtivoId: string | null = null;
    if (d.contaAtivoCodigo !== null) {
      const conta = await tx.contaPcasp.findUnique({ where: { codigo: d.contaAtivoCodigo }, select: { id: true, codigo: true, nome: true, analitica: true, naturezaSaldo: true } });
      if (conta === null) throw new Error(`A conta ${d.contaAtivoCodigo} não está no plano de contas. Nada foi gravado.`);
      if (!conta.analitica) throw new Error(`A conta ${conta.codigo} ("${conta.nome}") é sintética: o lançamento vai na analítica. Nada foi gravado.`);
      if (!GRUPOS_DO_REALIZAVEL.some((g) => conta.codigo.startsWith(g))) {
        throw new Error(
          `A conta ${conta.codigo} ("${conta.nome}") não é de crédito realizável do ativo (grupos ${GRUPOS_DO_REALIZAVEL.map((g) => g.slice(0, -1)).join(", ")}). ` +
            `Um valor do município que está com outra pessoa é direito a receber; dinheiro de terceiro guardado pelo município é consignação, no passivo. Nada foi gravado.`
        );
      }
      if (conta.naturezaSaldo !== "DEVEDORA") {
        throw new Error(`A conta ${conta.codigo} ("${conta.nome}") tem saldo credor (é redutora, como o ajuste de perdas): o valor a receber vai numa conta de saldo devedor. Nada foi gravado.`);
      }
      contaAtivoId = conta.id;
    }
    const r = await tx.decisaoDaCategoriaDeRealizavel.create({
      data: { categoriaId: cat.id, contaAtivoId, ativa: d.ativa, fundamento: d.fundamento, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { decisaoId: r.id };
  });
}

/** A decisão que vale (a mais recente) da categoria. Leitura. */
export async function decisaoVigenteDoRealizavel(tx: Tx, categoriaId: string): Promise<{ readonly id: string; readonly ativa: boolean; readonly contaAtivo: { readonly id: string; readonly codigo: string } | null } | null> {
  return tx.decisaoDaCategoriaDeRealizavel.findFirst({
    where: { categoriaId },
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    select: { id: true, ativa: true, contaAtivo: { select: { id: true, codigo: true } } },
  });
}

/**
 * A decisão mais recente QUE TEM CONTA — a da baixa. Categoria suspensa não constitui, mas o dinheiro que está fora
 * tem de poder voltar (achado da auditoria): a baixa usa a última conta decidida, ativa ou não. Leitura.
 */
async function decisaoComContaDoRealizavel(tx: Tx, categoriaId: string): Promise<{ readonly id: string; readonly contaAtivo: { readonly id: string; readonly codigo: string } } | null> {
  const d = await tx.decisaoDaCategoriaDeRealizavel.findFirst({
    where: { categoriaId, contaAtivoId: { not: null } },
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    select: { id: true, contaAtivo: { select: { id: true, codigo: true } } },
  });
  return d === null || d.contaAtivo === null ? null : { id: d.id, contaAtivo: d.contaAtivo };
}

/**
 * O saldo do realizável por categoria, devedor, conta do ativo e FONTE (o valor volta para a fonte de onde saiu: baixar
 * por outra fonte moveria recurso vinculado para livre). Constituição soma, baixa subtrai; o movimento anulado e a
 * anulação dele se cancelam. \`ate\` (dia civil, inclusive) corta pela data do fato. Leitura.
 */
export async function saldoDoRealizavel(
  tx: Tx,
  chave: { readonly categoriaId: string; readonly devedor: string; readonly contaAtivoId: string; readonly fonteId: string },
  ate: string | null = null,
): Promise<Money> {
  const movs = await tx.movimentoDeRealizavel.findMany({
    where: { categoriaId: chave.categoriaId, devedor: chave.devedor, fonteId: chave.fonteId, decisao: { contaAtivoId: chave.contaAtivoId } },
    select: { id: true, tipo: true, valor: true, data: true, estornoDeId: true },
  });
  const noCorte = ate === null ? movs : movs.filter((m) => diaCivil(m.data) <= ate);
  const anulados = new Set(noCorte.filter((m) => m.estornoDeId !== null).map((m) => m.estornoDeId));
  return noCorte.reduce<Money>((t, m) => {
    if (m.estornoDeId !== null || anulados.has(m.id)) return t;
    const v = toMoney(m.valor.toFixed(2));
    return toMoney(m.tipo === "CONSTITUICAO" ? t.plus(v) : t.minus(v));
  }, toMoney(0));
}

export const zMovimentarRealizavel = z.object({
  categoriaId: z.string().min(1),
  devedor: z.string().trim().min(1, "Informe com quem está o valor (CPF ou CNPJ)."),
  /** Canônico ("1234.56"). */
  valor: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Informe o valor em reais e centavos."),
  /** Dia civil do fato (AAAA-MM-DD). */
  data: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do fato."),
  historico: z.string().trim().min(5, "Informe o histórico."),
  documento: z.string().trim().min(3, "Informe o documento que sustenta o fato (recibo, guia, termo)."),
  contaBancariaId: z.string().min(1),
  /** Declarada: numa conta com várias fontes, a fonte não se adivinha pela conta. */
  fonteId: z.string().min(1),
  criadoPor: z.string().min(1),
});

/** O dia existe e já chegou (no fuso do ente). */
function exigirDiaValido(dia: string, rotulo: string): void {
  const d = new Date(`${dia}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia) throw new Error(`${rotulo}: o dia ${dia.split("-").reverse().join("/")} não existe. Nada foi gravado.`);
  if (dia > diaCivil(new Date())) throw new Error(`${rotulo}: o dia ${dia.split("-").reverse().join("/")} ainda não chegou. Nada foi gravado.`);
}

/** A entrada conferida antes de abrir a transação: valor, documento do devedor e o dia. */
function prepararMovimento(input: z.input<typeof zMovimentarRealizavel>): { readonly d: z.output<typeof zMovimentarRealizavel>; readonly valor: Money; readonly devedor: string } {
  const d = zMovimentarRealizavel.parse(input);
  const valor = toMoney(d.valor);
  if (!valor.greaterThan(0)) throw new Error("O valor tem de ser maior que zero. Nada foi gravado.");
  const devedor = normalizarDocumento(d.devedor);
  if (!documentoTemDigitoValido(devedor)) throw new Error(`O documento ${d.devedor} não é CPF nem CNPJ válido. Nada foi gravado.`);
  exigirDiaValido(d.data, "Movimento");
  return { d, valor, devedor };
}

/** Recusa a baixa (ou a anulação de constituição) que passa do saldo — na data do fato e no total. */
async function exigirSaldoDoRealizavel(
  tx: Tx,
  chave: { readonly categoriaId: string; readonly devedor: string; readonly contaAtivoId: string; readonly fonteId: string },
  rotulo: { readonly categoria: string; readonly conta: string; readonly fonte: string },
  valor: Money,
  dia: string,
  oQue: string,
): Promise<void> {
  await travar(tx, "SaldoDeRealizavel", [`${chave.categoriaId}:${chave.devedor}`]);
  const { menor, em } = await menorSaldoDesde(tx, chave, dia);
  if (valor.greaterThan(menor)) {
    const quando = em === null ? "" : ` em ${em.split("-").reverse().join("/")}`;
    throw new Error(
      `${oQue} de R$ ${valor.toFixed(2).replace(".", ",")} passa do saldo de ${rotulo.categoria} com ${chave.devedor} na conta ${rotulo.conta}, fonte ${rotulo.fonte} ` +
        `(R$ ${menor.toFixed(2).replace(".", ",")}${quando}). Não se baixa o que não foi constituído. Nada foi gravado.`
    );
  }
}

/**
 * O MENOR saldo da linha do tempo a partir do dia (inclusive): cada movimento conta no dia dele, e a anulação conta no
 * dia DELA, com o sinal trocado. Uma baixa com data antiga não pode deixar negativo um ponto posterior (achado da
 * auditoria: conferir só "na data" e "no total" deixava uma baixa posterior sem origem). `em` é o dia do mínimo quando
 * ele não é o saldo de hoje. Leitura.
 */
async function menorSaldoDesde(
  tx: Tx,
  chave: { readonly categoriaId: string; readonly devedor: string; readonly contaAtivoId: string; readonly fonteId: string },
  dia: string,
): Promise<{ readonly menor: Money; readonly em: string | null }> {
  const movs = await tx.movimentoDeRealizavel.findMany({
    where: { categoriaId: chave.categoriaId, devedor: chave.devedor, fonteId: chave.fonteId, decisao: { contaAtivoId: chave.contaAtivoId } },
    select: { tipo: true, valor: true, data: true, estornoDeId: true },
  });
  const porDia = new Map<string, Money>();
  for (const m of movs) {
    const v = toMoney(m.valor.toFixed(2));
    const soma = (m.tipo === "CONSTITUICAO") === (m.estornoDeId === null);
    const d = diaCivil(m.data);
    const atual = porDia.get(d) ?? toMoney(0);
    porDia.set(d, toMoney(soma ? atual.plus(v) : atual.minus(v)));
  }
  const dias = [...porDia.keys()].sort();
  let acumulado = toMoney(0);
  for (const d of dias) if (d <= dia) acumulado = toMoney(acumulado.plus(porDia.get(d) ?? 0));
  let menor = acumulado;
  let em: string | null = dia;
  for (const d of dias) {
    if (d <= dia) continue;
    acumulado = toMoney(acumulado.plus(porDia.get(d) ?? 0));
    if (acumulado.lessThan(menor)) {
      menor = acumulado;
      em = d;
    }
  }
  // O saldo de hoje é o acumulado final: só se diz a data quando o mínimo está antes dele.
  return { menor, em: menor.equals(acumulado) ? null : em };
}

/**
 * O movimento, dentro da transação de quem chama — que JÁ autorizou a sua ação. O CAIXA vai pelo núcleo do movimento
 * bancário (M09): o tipo SAIDA_PARA_REALIZAVEL ou RETORNO_DE_REALIZAVEL, com a conta do ativo como contrapartida. É ele
 * que confere o período aberto, a fonte no rol da conta e o saldo bancário sob a trava da conta, e é por ele que o saldo
 * da conta e a conciliação enxergam o fato (achado da auditoria: lançado à parte, o caixa saía sem fato de caixa).
 */
async function movimentarNaTx(
  tx: Tx,
  tipo: "CONSTITUICAO" | "BAIXA",
  { d, valor, devedor }: ReturnType<typeof prepararMovimento>,
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const cat = await tx.categoriaDeRealizavel.findUnique({ where: { id: d.categoriaId }, select: { id: true, codigo: true } });
  if (cat === null) throw new Error("Categoria de realizável não encontrada. Nada foi gravado.");
  let decisao: { readonly id: string; readonly contaAtivo: { readonly id: string; readonly codigo: string } } | null;
  if (tipo === "CONSTITUICAO") {
    const v = await decisaoVigenteDoRealizavel(tx, cat.id);
    decisao = v !== null && v.ativa && v.contaAtivo !== null ? { id: v.id, contaAtivo: v.contaAtivo } : null;
    if (decisao === null) throw new Error(`A categoria ${cat.codigo} não tem a conta do ativo decidida pelo ente (ou está suspensa): não se constitui sem ela. Nada foi gravado.`);
  } else {
    decisao = await decisaoComContaDoRealizavel(tx, cat.id);
    if (decisao === null) throw new Error(`A categoria ${cat.codigo} nunca teve conta do ativo: não há o que baixar. Nada foi gravado.`);
  }
  const fonte = await tx.fonteRecurso.findUnique({ where: { id: d.fonteId }, select: { codigo: true } });
  if (fonte === null) throw new Error("Fonte de recurso não encontrada. Nada foi gravado.");
  const conta = decisao.contaAtivo;
  const chave = { categoriaId: cat.id, devedor, contaAtivoId: conta.id, fonteId: d.fonteId };
  const mb = await registrarMovimentoBancarioNaTx(
    tx as TxDoMovimento,
    {
      contaBancariaId: d.contaBancariaId, fonteId: d.fonteId, tipo: tipo === "CONSTITUICAO" ? "SAIDA_PARA_REALIZAVEL" : "RETORNO_DE_REALIZAVEL",
      valor, data: meioDiaCivil(d.data), historico: d.historico, contaContrapartidaId: conta.id, criadoPor: d.criadoPor,
    },
    {
      origemTipo: tipo === "CONSTITUICAO" ? "CONSTITUICAO_DE_REALIZAVEL" : "BAIXA_DE_REALIZAVEL",
      ...(tipo === "BAIXA" ? { antesDeGravar: () => exigirSaldoDoRealizavel(tx, chave, { categoria: cat.codigo, conta: conta.codigo, fonte: fonte.codigo }, valor, d.data, "A baixa") } : {}),
    },
  );
  const m = await tx.movimentoDeRealizavel.create({
    data: {
      categoriaId: cat.id, decisaoId: decisao.id, tipo, devedor, valor: valor.toFixed(2), data: meioDiaCivil(d.data), historico: d.historico, documento: d.documento,
      contaBancariaId: d.contaBancariaId, fonteId: d.fonteId, lancamentoId: mb.lancamentoId, movimentoBancarioId: mb.movimentoId, criadoPor: d.criadoPor,
    },
    select: { id: true },
  });
  return { movimentoId: m.id, lancamentoId: mb.lancamentoId };
}

/** O dinheiro sai e nasce o direito de recebê-lo de volta. */
export async function constituirRealizavel(prisma: PrismaClient, input: z.input<typeof zMovimentarRealizavel>): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const p = prepararMovimento(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, p.d.criadoPor, ACAO_DO_SERVICO.constituirRealizavel, "ENTE");
    return movimentarNaTx(tx, "CONSTITUICAO", p);
  });
}

/** O dinheiro volta e o direito se extingue, até o saldo. */
export async function baixarRealizavel(prisma: PrismaClient, input: z.input<typeof zMovimentarRealizavel>): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const p = prepararMovimento(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, p.d.criadoPor, ACAO_DO_SERVICO.baixarRealizavel, "ENTE");
    return movimentarNaTx(tx, "BAIXA", p);
  });
}

export const zAnularMovimentoDeRealizavel = z.object({
  movimentoId: z.string().min(1),
  motivo: z.string().trim().min(10, "O motivo da anulação precisa de ao menos 10 caracteres."),
  data: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da anulação."),
  criadoPor: z.string().min(1),
});

/**
 * Anula um movimento pelo ESTORNO do movimento bancário dele (M09): as partidas invertidas, a mesma conta e a mesma
 * fonte. O movimento novo do realizável aponta o original, uma vez. A anulação da constituição confere, sob a trava, que
 * o saldo não fica negativo.
 */
export async function anularMovimentoDeRealizavel(prisma: PrismaClient, input: z.input<typeof zAnularMovimentoDeRealizavel>): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zAnularMovimentoDeRealizavel.parse(input);
  exigirDiaValido(d.data, "Anulação");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.anularMovimentoDeRealizavel, "ENTE");
    const o = await tx.movimentoDeRealizavel.findUnique({
      where: { id: d.movimentoId },
      select: {
        id: true, categoriaId: true, decisaoId: true, tipo: true, devedor: true, valor: true, data: true, documento: true, contaBancariaId: true, fonteId: true,
        estornoDeId: true, movimentoBancarioId: true, estorno: { select: { id: true } }, categoria: { select: { codigo: true } },
        decisao: { select: { contaAtivo: { select: { id: true, codigo: true } } } }, fonte: { select: { codigo: true } },
      },
    });
    if (o === null) throw new Error("Movimento de realizável não encontrado. Nada foi gravado.");
    if (o.estornoDeId !== null) throw new Error("Este movimento já é uma anulação; anulação não se anula. Nada foi gravado.");
    if (o.estorno !== null) throw new Error("Este movimento já foi anulado. Nada foi gravado.");
    if (o.decisao.contaAtivo === null) throw new Error("O movimento não tem conta do ativo. Nada foi gravado.");
    if (o.movimentoBancarioId === null) throw new Error("Este movimento é anterior à passagem do realizável pelo caixa e não se anula por aqui. Nada foi gravado.");
    if (d.data < diaCivil(o.data)) throw new Error("A anulação não pode ser anterior ao movimento. Nada foi gravado.");
    const conta = o.decisao.contaAtivo;
    const chave = { categoriaId: o.categoriaId, devedor: o.devedor, contaAtivoId: conta.id, fonteId: o.fonteId };
    let mb: { readonly movimentoId: string; readonly lancamentoId: string };
    try {
      mb = await estornarMovimentoBancarioNaTx(
        tx as TxDoMovimento,
        { movimentoId: o.movimentoBancarioId, motivo: d.motivo, data: meioDiaCivil(d.data), criadoPor: d.criadoPor },
        {
          origemTipo: "ANULACAO_DE_REALIZAVEL",
          // Desfazer a constituição tira saldo: o que já foi baixado dela não pode ficar sem origem.
          ...(o.tipo === "CONSTITUICAO"
            ? { antesDeGravar: () => exigirSaldoDoRealizavel(tx, chave, { categoria: o.categoria.codigo, conta: conta.codigo, fonte: o.fonte.codigo }, toMoney(o.valor.toFixed(2)), d.data, "Anular a constituição") }
            : {}),
        },
      );
    } catch (e) {
      if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") throw new Error("Este movimento acabou de ser anulado por outra pessoa. Nada foi gravado.");
      if (e instanceof Error && /já foi ESTORNADO/.test(e.message)) throw new Error("Este movimento acabou de ser anulado por outra pessoa. Nada foi gravado.");
      throw e;
    }
    try {
      const m = await tx.movimentoDeRealizavel.create({
        data: {
          categoriaId: o.categoriaId, decisaoId: o.decisaoId, tipo: o.tipo, devedor: o.devedor, valor: o.valor.toFixed(2), data: meioDiaCivil(d.data),
          historico: `Anulação: ${d.motivo}`, documento: o.documento, contaBancariaId: o.contaBancariaId, fonteId: o.fonteId,
          lancamentoId: mb.lancamentoId, movimentoBancarioId: mb.movimentoId, estornoDeId: o.id, criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      return { movimentoId: m.id, lancamentoId: mb.lancamentoId };
    } catch (e) {
      if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") throw new Error("Este movimento acabou de ser anulado por outra pessoa. Nada foi gravado.");
      throw e;
    }
  });
}
