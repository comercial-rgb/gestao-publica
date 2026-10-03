import { randomUUID } from "node:crypto";
import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { roteiroPatrimonialVigente } from "../m01-core-contabil/roteiro-patrimonial-declarado.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { liquidadoDosEmpenhos, pagoDosEmpenhos } from "./consultas.js";

/**
 * M05 — DIÁRIAS E SUPRIMENTO DE FUNDOS (V32).
 *
 * ═══ O QUE FALTAVA ═══
 * Nada no sistema registrava a quem uma diária ou um suprimento de fundos foi concedido, para quê, até
 * quando se presta contas, nem o que foi comprovado. O empenho de elemento 14 existia, sem servidor, sem
 * destino, sem prazo — e o edital pede o controle da concessão e da prestação, com lançamento nas duas.
 *
 * ═══ A DESPESA NÃO MUDA DE CAMINHO ═══
 * Empenho, liquidação e pagamento seguem os de sempre. A concessão se apoia num empenho do próprio
 * beneficiário e acrescenta o controle: na concessão, a responsabilidade a comprovar (classes 7 e 8, pelas
 * contas que o contador declara em Contabilidade > Roteiros); na aprovação da prestação, a baixa dela. O que
 * for DEVOLVIDO volta ao caixa pela anulação do pagamento, da liquidação e do empenho (os atos de sempre):
 * a prestação só declara quanto foi comprovado e quanto foi devolvido, e os dois somam o concedido.
 *
 * ═══ AS REGRAS QUE SÓ O CONJUNTO REVELA ═══
 *   · Σ das concessões vivas de um empenho ≤ o empenhado líquido dele — sob o trinco do empenho (posto 37).
 *   · Suprimento (Lei 4.320, art. 69): não se concede a quem está em alcance (prazo vencido sem prestação
 *     aprovada) nem a quem já responde por dois suprimentos em aberto.
 *
 * ⚠️ NENHUMA CONTA NO CÓDIGO: sem o roteiro declarado, a concessão e a aprovação são recusadas dizendo onde
 * declarar.
 */

export type Especie = "DIARIA" | "SUPRIMENTO_DE_FUNDOS";

const ELEMENTOS_DE_DIARIA = ["14", "15"];
const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um dia civil AAAA-MM-DD.");
const zDoc = z.string().trim().regex(/^(\d{11}|\d{14})$/, "CPF com 11 dígitos ou CNPJ com 14, sem pontuação.");

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

async function empenhadoLiquidoDoEmpenho(tx: Tx, empenhoId: string): Promise<Money> {
  const linhas = await tx.empenho.findMany({
    where: { OR: [{ id: empenhoId }, { estornoDeId: empenhoId }, { anulacaoParcialDeId: empenhoId }] },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  return somaLiquidaEstornaveis(
    linhas.map((e) => ({ id: e.id, valor: toMoney(e.valor.toFixed(2)), estornoDeId: e.estornoDeId, anulacaoParcialDeId: e.anulacaoParcialDeId }))
  );
}

/** COMPROVADA: prestação aprovada. EM_ANALISE: apresentada sem decisão. EM_ATRASO: prazo vencido. A_COMPROVAR. */
export type SituacaoDoAdiantamento = "A_COMPROVAR" | "EM_ANALISE" | "EM_ATRASO" | "COMPROVADA";

export function situacaoDoAdiantamento(
  c: { readonly prazoDePrestacao: Date; readonly prestacoes: readonly { readonly decisao: { readonly aprovada: boolean } | null }[] },
  agora: Date
): SituacaoDoAdiantamento {
  if (c.prestacoes.some((p) => p.decisao?.aprovada === true)) return "COMPROVADA";
  if (c.prestacoes.some((p) => p.decisao === null)) return "EM_ANALISE";
  return agora.getTime() > c.prazoDePrestacao.getTime() ? "EM_ATRASO" : "A_COMPROVAR";
}

export const zConcederAdiantamento = z
  .object({
    especie: z.enum(["DIARIA", "SUPRIMENTO_DE_FUNDOS"]),
    numero: z.string().trim().min(1, "Informe o número da concessão (portaria ou processo)."),
    empenhoId: z.string().min(1, "Escolha o empenho que paga a concessão."),
    beneficiarioNome: z.string().trim().min(3, "Informe o nome de quem recebe."),
    beneficiarioDocumento: zDoc,
    cargoOuFuncao: z.string().trim().optional(),
    finalidade: z.string().trim().min(10, "Descreva a finalidade (o objetivo da viagem ou da despesa)."),
    destino: z.string().trim().optional(),
    diaInicio: zDia,
    diaFim: zDia,
    quantidadeDeDiarias: z.string().trim().regex(/^\d{1,4}([.,]\d)?$/, "Quantidade de diárias com até uma casa decimal (meia diária é 0,5).").optional(),
    valorUnitario: zMoney.optional(),
    valor: zMoney,
    atoAutorizativo: z.string().trim().min(5, "Informe a norma que autoriza a concessão."),
    diaPrazoDePrestacao: zDia,
    diaConcessao: zDia,
    criadoPor: z.string().min(1),
  })
  .superRefine((d, ctx) => {
    if (d.diaFim < d.diaInicio) ctx.addIssue({ code: "custom", message: "O fim do período é anterior ao início." });
    if (d.diaPrazoDePrestacao < d.diaFim) ctx.addIssue({ code: "custom", message: "O prazo de prestação de contas é anterior ao fim do período." });
    if (!d.valor.greaterThan(0)) ctx.addIssue({ code: "custom", message: "O valor tem de ser maior que zero." });
    if (d.especie === "DIARIA") {
      if (d.destino === undefined || d.destino === "") ctx.addIssue({ code: "custom", message: "Informe o destino da viagem." });
      if (d.quantidadeDeDiarias === undefined || d.valorUnitario === undefined) {
        ctx.addIssue({ code: "custom", message: "Informe a quantidade de diárias e o valor unitário." });
      } else if (!toMoney(d.valorUnitario.times(d.quantidadeDeDiarias.replace(",", "."))).equals(d.valor)) {
        ctx.addIssue({
          code: "custom",
          message: `O valor (${d.valor.toFixed(2)}) não é a quantidade de diárias (${d.quantidadeDeDiarias}) vezes o valor unitário (${d.valorUnitario.toFixed(2)}).`,
        });
      }
    }
  });

/**
 * CONCEDE uma diária ou um suprimento de fundos sobre um empenho do beneficiário, e lança a responsabilidade
 * a comprovar no controle. Tudo conferido antes de gravar; o saldo do empenho, sob trinco.
 */
export async function concederAdiantamento(
  prisma: PrismaClient,
  input: z.input<typeof zConcederAdiantamento>
): Promise<{ readonly concessaoId: string; readonly lancamentoId: string }> {
  const d = zConcederAdiantamento.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.concederAdiantamento, "ENTE");
    const empenho = await tx.empenho.findUnique({
      where: { id: d.empenhoId },
      select: {
        id: true, numero: true, credorCpfCnpj: true, estornoDeId: true, anulacaoParcialDeId: true,
        ficha: { select: { naturezaDespesa: { select: { codElemento: true, codigoCompleto: true } } } },
      },
    });
    if (empenho === null || empenho.estornoDeId !== null || empenho.anulacaoParcialDeId !== null) {
      throw new Error("O empenho indicado não existe ou é uma anulação. Escolha o empenho da concessão. Nada foi gravado.");
    }
    const elemento = empenho.ficha.naturezaDespesa.codElemento;
    if (d.especie === "DIARIA" && !ELEMENTOS_DE_DIARIA.includes(elemento)) {
      throw new Error(
        `A diária precisa de empenho de diárias (elemento 14 ou 15); o empenho ${empenho.numero} é da natureza ` +
          `${empenho.ficha.naturezaDespesa.codigoCompleto}. Nada foi gravado.`
      );
    }
    if (d.especie === "SUPRIMENTO_DE_FUNDOS" && ELEMENTOS_DE_DIARIA.includes(elemento)) {
      throw new Error(`O suprimento de fundos não se paga com empenho de diárias (o ${empenho.numero} é do elemento ${elemento}). Nada foi gravado.`);
    }
    if (empenho.credorCpfCnpj !== d.beneficiarioDocumento) {
      throw new Error(
        `O empenho ${empenho.numero} é do credor ${empenho.credorCpfCnpj}, e a concessão é para ${d.beneficiarioDocumento}. ` +
          `O adiantamento é pago a quem o recebe: empenhe em nome do beneficiário. Nada foi gravado.`
      );
    }

    if (d.especie === "SUPRIMENTO_DE_FUNDOS") {
      const anteriores = await tx.concessaoDeAdiantamento.findMany({
        where: { especie: "SUPRIMENTO_DE_FUNDOS", beneficiarioDocumento: d.beneficiarioDocumento },
        select: { numero: true, prazoDePrestacao: true, prestacoes: { select: { decisao: { select: { aprovada: true } } } } },
      });
      const agora = inicioDoDiaCivil(d.diaConcessao);
      const abertos = anteriores.filter((a) => situacaoDoAdiantamento(a, agora) !== "COMPROVADA");
      const emAlcance = abertos.filter((a) => situacaoDoAdiantamento(a, agora) === "EM_ATRASO");
      if (emAlcance.length > 0) {
        throw new Error(
          `${d.beneficiarioNome} está com a prestação de contas do suprimento ${emAlcance.map((a) => a.numero).join(", ")} vencida. ` +
            `Não se concede suprimento a quem está em atraso com a prestação de contas (Lei 4.320, art. 69). Nada foi gravado.`
        );
      }
      if (abertos.length >= 2) {
        throw new Error(
          `${d.beneficiarioNome} já responde por dois suprimentos sem prestação aprovada (${abertos.map((a) => a.numero).join(", ")}). ` +
            `Não se concede um terceiro (Lei 4.320, art. 69). Nada foi gravado.`
        );
      }
    }

    const roteiro = await roteiroPatrimonialVigente(tx, "ADIANTAMENTO", `CONCESSAO/${d.especie}`);
    if (roteiro === null) {
      throw new Error(
        `Não há roteiro para a concessão de ${d.especie === "DIARIA" ? "diária" : "suprimento de fundos"}: as contas de controle ` +
          `da responsabilidade a comprovar vêm do ente. Declare-as em Contabilidade > Roteiros de precatórios, convênios e ` +
          `adiantamentos. Nada foi gravado.`
      );
    }

    // O SALDO DO EMPENHO, SOB TRINCO: duas concessões simultâneas não passam juntas do empenhado.
    await travar(tx, "AdiantamentoDoEmpenho", [empenho.id]);
    const liquido = await empenhadoLiquidoDoEmpenho(tx, empenho.id);
    const concedidas = await tx.concessaoDeAdiantamento.findMany({ where: { empenhoId: empenho.id }, select: { valor: true } });
    const jaConcedido = concedidas.reduce((s, c) => toMoney(s.plus(c.valor.toFixed(2))), toMoney("0.00"));
    const cabe = toMoney(liquido.minus(jaConcedido));
    if (d.valor.greaterThan(cabe)) {
      throw new Error(
        `O empenho ${empenho.numero} tem ${liquido.toFixed(2)} empenhados e ${jaConcedido.toFixed(2)} já concedidos; ` +
          `cabem ${cabe.toFixed(2)}, e a concessão pede ${d.valor.toFixed(2)}. Nada foi gravado.`
      );
    }

    const lancamentoId = randomUUID();
    const concessaoId = randomUUID();
    await lancarNoRazao(tx, {
      id: lancamentoId,
      numeroControle: `ADT-${d.especie === "DIARIA" ? "DIA" : "SUP"}-${d.numero}`,
      dataTransacao: inicioDoDiaCivil(d.diaConcessao),
      historico: `${roteiro.historicoPadrao} — ${d.beneficiarioNome}, ${d.numero}`,
      origemTipo: "ADIANTAMENTO_CONCESSAO",
      origemId: concessaoId,
      criadoPor: d.criadoPor,
      partidas: [
        { contaId: roteiro.contaDebito.id, tipo: "DEBITO", subsistema: "CONTROLE", valor: d.valor.toFixed(2) },
        { contaId: roteiro.contaCredito.id, tipo: "CREDITO", subsistema: "CONTROLE", valor: d.valor.toFixed(2) },
      ],
    });
    await tx.concessaoDeAdiantamento.create({
      data: {
        id: concessaoId,
        especie: d.especie,
        numero: d.numero,
        empenhoId: empenho.id,
        beneficiarioNome: d.beneficiarioNome,
        beneficiarioDocumento: d.beneficiarioDocumento,
        cargoOuFuncao: d.cargoOuFuncao !== undefined && d.cargoOuFuncao !== "" ? d.cargoOuFuncao : null,
        finalidade: d.finalidade,
        destino: d.destino !== undefined && d.destino !== "" ? d.destino : null,
        dataInicio: inicioDoDiaCivil(d.diaInicio),
        dataFim: inicioDoDiaCivil(d.diaFim),
        quantidadeDeDiarias: d.quantidadeDeDiarias !== undefined ? d.quantidadeDeDiarias.replace(",", ".") : null,
        valorUnitario: d.valorUnitario !== undefined ? d.valorUnitario.toFixed(2) : null,
        valor: d.valor.toFixed(2),
        atoAutorizativo: d.atoAutorizativo,
        prazoDePrestacao: fimDoDiaCivil(d.diaPrazoDePrestacao),
        lancamentoId,
        criadoPor: d.criadoPor,
      },
    });
    return { concessaoId, lancamentoId };
  });
}

export const zRegistrarPrestacao = z.object({
  concessaoId: z.string().min(1),
  valorComprovado: zMoney,
  valorDevolvido: zMoney,
  relatorio: z.string().trim().min(20, "Descreva a prestação: o que foi feito e os comprovantes apresentados."),
  diaApresentacao: zDia,
  criadoPor: z.string().min(1),
});

/** REGISTRA a prestação de contas apresentada. Comprovado + devolvido = concedido; uma em análise por vez. */
export async function registrarPrestacaoDeAdiantamento(
  prisma: PrismaClient,
  input: z.input<typeof zRegistrarPrestacao>
): Promise<{ readonly prestacaoId: string }> {
  const d = zRegistrarPrestacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarPrestacaoDeAdiantamento, "ENTE");
    const c = await tx.concessaoDeAdiantamento.findUnique({
      where: { id: d.concessaoId },
      select: { id: true, numero: true, valor: true, empenhoId: true, prestacoes: { select: { decisao: { select: { aprovada: true } } } } },
    });
    if (c === null) throw new Error("A concessão indicada não existe. Nada foi gravado.");
    await travar(tx, "AdiantamentoDoEmpenho", [c.empenhoId]);
    if (c.prestacoes.some((p) => p.decisao?.aprovada === true)) throw new Error(`A concessão ${c.numero} já tem prestação de contas aprovada. Nada foi gravado.`);
    if (c.prestacoes.some((p) => p.decisao === null)) throw new Error(`A concessão ${c.numero} já tem uma prestação de contas em análise; decida-a antes de registrar outra. Nada foi gravado.`);
    if (d.valorComprovado.isNegative() || d.valorDevolvido.isNegative()) throw new Error("Comprovado e devolvido não podem ser negativos. Nada foi gravado.");
    const soma = toMoney(d.valorComprovado.plus(d.valorDevolvido));
    const concedido = toMoney(c.valor.toFixed(2));
    if (!soma.equals(concedido)) {
      throw new Error(
        `Comprovado (${d.valorComprovado.toFixed(2)}) mais devolvido (${d.valorDevolvido.toFixed(2)}) somam ${soma.toFixed(2)}, ` +
          `e a concessão ${c.numero} foi de ${concedido.toFixed(2)}. A prestação tem de explicar o valor inteiro. Nada foi gravado.`
      );
    }
    const p = await tx.prestacaoDeContasDoAdiantamento.create({
      data: {
        concessaoId: c.id, valorComprovado: d.valorComprovado.toFixed(2), valorDevolvido: d.valorDevolvido.toFixed(2),
        relatorio: d.relatorio, apresentadaEm: inicioDoDiaCivil(d.diaApresentacao), criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { prestacaoId: p.id };
  });
}

export const zDecidirPrestacao = z.object({
  prestacaoId: z.string().min(1),
  motivo: z.string().trim().min(10, "Escreva o parecer (ao menos 10 caracteres)."),
  diaDecisao: zDia,
  criadoPor: z.string().min(1),
});

async function prestacaoParaDecidir(tx: Tx, prestacaoId: string) {
  const p = await tx.prestacaoDeContasDoAdiantamento.findUnique({
    where: { id: prestacaoId },
    select: {
      id: true, valorComprovado: true, valorDevolvido: true, decisao: { select: { id: true } },
      concessao: { select: { id: true, numero: true, especie: true, valor: true, empenhoId: true, beneficiarioNome: true } },
    },
  });
  if (p === null) throw new Error("A prestação de contas indicada não existe. Nada foi gravado.");
  await travar(tx, "AdiantamentoDoEmpenho", [p.concessao.empenhoId]);
  const decidida = await tx.decisaoDaPrestacaoDoAdiantamento.findUnique({ where: { prestacaoId }, select: { id: true } });
  if (decidida !== null) throw new Error(`A prestação de contas da concessão ${p.concessao.numero} já foi decidida. Nada foi gravado.`);
  return p;
}

/**
 * APROVA a prestação: baixa o controle da responsabilidade (o valor concedido inteiro — o comprovado e o
 * devolvido deixam de estar a comprovar). Uma decisão por prestação, garantida pela unicidade no banco.
 */
export async function aprovarPrestacaoDeAdiantamento(
  prisma: PrismaClient,
  input: z.input<typeof zDecidirPrestacao>
): Promise<{ readonly decisaoId: string; readonly lancamentoId: string }> {
  const d = zDecidirPrestacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.aprovarPrestacaoDeAdiantamento, "ENTE");
    const p = await prestacaoParaDecidir(tx, d.prestacaoId);
    const roteiro = await roteiroPatrimonialVigente(tx, "ADIANTAMENTO", `BAIXA/${p.concessao.especie}`);
    if (roteiro === null) {
      throw new Error(
        `Não há roteiro para a baixa da prestação de ${p.concessao.especie === "DIARIA" ? "diária" : "suprimento de fundos"}. Declare-o em ` +
          `Contabilidade > Roteiros de precatórios, convênios e adiantamentos. Nada foi gravado.`
      );
    }
    const lancamentoId = randomUUID();
    const valor = toMoney(p.concessao.valor.toFixed(2)).toFixed(2);
    await lancarNoRazao(tx, {
      id: lancamentoId,
      numeroControle: `ADT-BAIXA-${p.concessao.numero}-${p.id.slice(-6)}`,
      dataTransacao: inicioDoDiaCivil(d.diaDecisao),
      historico: `${roteiro.historicoPadrao} — ${p.concessao.beneficiarioNome}, ${p.concessao.numero}`,
      origemTipo: "ADIANTAMENTO_BAIXA",
      origemId: p.concessao.id,
      criadoPor: d.criadoPor,
      partidas: [
        { contaId: roteiro.contaDebito.id, tipo: "DEBITO", subsistema: "CONTROLE", valor },
        { contaId: roteiro.contaCredito.id, tipo: "CREDITO", subsistema: "CONTROLE", valor },
      ],
    });
    const dec = await tx.decisaoDaPrestacaoDoAdiantamento.create({
      data: { prestacaoId: p.id, aprovada: true, motivo: d.motivo, lancamentoId, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { decisaoId: dec.id, lancamentoId };
  });
}

/** REJEITA a prestação com o parecer: nada se lança, e o beneficiário pode apresentar outra. */
export async function rejeitarPrestacaoDeAdiantamento(
  prisma: PrismaClient,
  input: z.input<typeof zDecidirPrestacao>
): Promise<{ readonly decisaoId: string }> {
  const d = zDecidirPrestacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.rejeitarPrestacaoDeAdiantamento, "ENTE");
    const p = await prestacaoParaDecidir(tx, d.prestacaoId);
    const dec = await tx.decisaoDaPrestacaoDoAdiantamento.create({
      data: { prestacaoId: p.id, aprovada: false, motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { decisaoId: dec.id };
  });
}

export interface AdiantamentoNaLista {
  readonly id: string;
  readonly especie: Especie;
  readonly numero: string;
  readonly empenhoNumero: string;
  /** V33 — o empenho e a execução dele: a concessão só se encerra quando o dinheiro chega ao beneficiário. */
  readonly empenhoId: string;
  readonly liquidado: string;
  readonly pago: string;
  readonly beneficiarioNome: string;
  readonly beneficiarioDocumento: string;
  readonly finalidade: string;
  readonly destino: string | null;
  readonly diaInicio: string;
  readonly diaFim: string;
  readonly valor: string;
  readonly diaPrazo: string;
  readonly situacao: SituacaoDoAdiantamento;
  readonly prestacaoEmAnalise: { readonly id: string; readonly valorComprovado: string; readonly valorDevolvido: string; readonly relatorio: string } | null;
  readonly ultimaDecisao: { readonly aprovada: boolean; readonly motivo: string; readonly por: string } | null;
}

/** As concessões, com a situação derivada. Leitura pura. */
export async function listarAdiantamentos(prisma: PrismaClient, agora: Date, especie?: Especie): Promise<readonly AdiantamentoNaLista[]> {
  const linhas = await prisma.concessaoDeAdiantamento.findMany({
    where: especie !== undefined ? { especie } : {},
    orderBy: [{ prazoDePrestacao: "asc" }, { numero: "asc" }],
    select: {
      id: true, especie: true, numero: true, beneficiarioNome: true, beneficiarioDocumento: true, finalidade: true, destino: true,
      dataInicio: true, dataFim: true, valor: true, prazoDePrestacao: true, empenho: { select: { id: true, numero: true } },
      prestacoes: {
        orderBy: { criadoEm: "asc" },
        select: { id: true, valorComprovado: true, valorDevolvido: true, relatorio: true, decisao: { select: { aprovada: true, motivo: true, criadoPor: true } } },
      },
    },
  });
  const ids = [...new Set(linhas.map((l) => l.empenho.id))];
  const [liquidado, pago] = await Promise.all([liquidadoDosEmpenhos(prisma, ids), pagoDosEmpenhos(prisma, ids)]);
  return linhas.map((l) => {
    const emAnalise = l.prestacoes.find((p) => p.decisao === null);
    const decididas = l.prestacoes.filter((p) => p.decisao !== null);
    const ultima = decididas[decididas.length - 1]?.decisao ?? null;
    return {
      id: l.id, especie: l.especie, numero: l.numero, empenhoNumero: l.empenho.numero, empenhoId: l.empenho.id,
      liquidado: (liquidado.get(l.empenho.id) ?? toMoney("0.00")).toFixed(2), pago: (pago.get(l.empenho.id) ?? toMoney("0.00")).toFixed(2),
      beneficiarioNome: l.beneficiarioNome, beneficiarioDocumento: l.beneficiarioDocumento, finalidade: l.finalidade, destino: l.destino,
      diaInicio: diaCivil(l.dataInicio), diaFim: diaCivil(l.dataFim), valor: l.valor.toFixed(2), diaPrazo: diaCivil(l.prazoDePrestacao),
      situacao: situacaoDoAdiantamento(l, agora),
      prestacaoEmAnalise: emAnalise === undefined ? null : {
        id: emAnalise.id, valorComprovado: emAnalise.valorComprovado.toFixed(2), valorDevolvido: emAnalise.valorDevolvido.toFixed(2), relatorio: emAnalise.relatorio,
      },
      ultimaDecisao: ultima === null ? null : { aprovada: ultima.aprovada, motivo: ultima.motivo, por: ultima.criadoPor },
    };
  });
}
