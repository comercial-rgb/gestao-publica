import { z } from "zod";
import { toMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { anexarArquivo } from "../m22-documentos/anexos.js";
import {
  criarFilaDeAssinatura,
  exigirFilaViavel,
} from "../m22-documentos/assinatura.js";
import {
  conteudoDaNotaDeEmpenho,
  conteudoDaNotaDeLiquidacao,
  conteudoDaOrdemDePagamento,
} from "./documentos.js";

/**
 * ENT03a, item 4 — EMPENHO, LIQUIDAÇÃO E ORDEM DE PAGAMENTO ENTRAM NA FILA DE
 * ASSINATURAS DO ENT02.
 *
 * ═══ ⚠️ NADA DE NOVO FOI INVENTADO AQUI, E É ESSE O PONTO ═══
 * A fila de assinaturas, a assinatura ordenada, o modo (SIMPLES/AVANÇADA/QUALIFICADA), a
 * recusa da qualificada sem provedor, o anexo com hash e a rota de download com
 * autorização por registro — tudo isso é do ENT02 e já estava testado. Este arquivo é a
 * **cola**: ele monta o documento canônico do fato e o entrega à fila que já existe.
 *
 * O prompt manda reaproveitar em vez de recriar. Uma "fila de assinaturas da despesa"
 * paralela teria duplicado a ordenação, a verificação de "já assinou?" e o significado do
 * hash — e as duas divergiriam na primeira correção feita só de um lado.
 *
 * ═══ ⚠️ O DOCUMENTO É UM `Anexo` DE ORIGEM SISTEMA — mesmo desenho do borderô ═══
 * A alternativa era afrouxar `criarFilaDeAssinatura` para aceitar fila sem anexo. Seria
 * pior: a fila existe para assinar um CONTEÚDO, e o `hashConteudo` da assinatura só
 * significa algo se houver conteúdo a que corresponda. Uma fila sem anexo produziria
 * assinaturas sobre o nada.
 *
 * Três coisas vêm de graça com isso, e nenhuma precisou de código novo: o documento é
 * baixável pela rota do ENT02 com autorização por registro, é assinável pela fila do M22,
 * e a conferência de integridade do `lerArquivo` passa a valer para ele.
 *
 * ═══ ⚠️ E O ESCOPO NÃO AFROUXA ═══
 * O anexo do empenho é escopado pelo EMPENHO; o da liquidação, pela LIQUIDAÇÃO; o da
 * ordem, pela liquidação dela — que é como o M16 já escopa `prepararOrdemDePagamento`.
 * Devolver "ENTE" (o que o borderô faz, e ali com razão) daria a quem anexa no nível do
 * ente o poder de produzir o documento assinável de outra unidade.
 */

const zBase = {
  modo: z.enum(["SIMPLES", "AVANCADA", "QUALIFICADA"]),
  signatarios: z.array(z.string().min(1)).min(1),
  criadoPor: z.string().min(1),
};

export const zAssinarEmpenho = z.object({ empenhoId: z.string().min(1), ...zBase });
export const zAssinarLiquidacao = z.object({ liquidacaoId: z.string().min(1), ...zBase });
export const zAssinarOrdem = z.object({ ordemId: z.string().min(1), ...zBase });

export type AssinarEmpenhoInput = z.input<typeof zAssinarEmpenho>;
export type AssinarLiquidacaoInput = z.input<typeof zAssinarLiquidacao>;
export type AssinarOrdemInput = z.input<typeof zAssinarOrdem>;

export interface DocumentoEmFila {
  readonly anexoId: string;
  readonly filaId: string;
  readonly proximo: string;
  /** O texto canônico, para quem quiser conferir o hash sem baixar o arquivo. */
  readonly conteudo: string;
}

/**
 * ⚠️ UM DOCUMENTO POR FATO, e a recusa do segundo é o guard que importa.
 *
 * Sem ela, dois documentos do mesmo empenho iriam a duas filas: cada uma colheria
 * assinaturas válidas, sobre textos que poderiam divergir (o empenho pode ter sido
 * anulado entre uma e outra), e "o empenho está assinado?" passaria a ter duas respostas
 * verdadeiras e contraditórias.
 */
async function exigirSemDocumento(
  prisma: PrismaClient,
  onde: { readonly empenhoId?: string; readonly liquidacaoId?: string; readonly ordemDePagamentoId?: string },
  nome: string
): Promise<void> {
  const ja = await prisma.anexo.findFirst({
    where: { ...onde, origem: "SISTEMA" },
    select: { id: true },
  });
  if (ja !== null) {
    throw new Error(
      `${nome} já tem documento gerado para assinatura (anexo ${ja.id}). Um segundo ` +
        `documento iria a uma segunda fila, e "está assinado?" passaria a ter duas ` +
        `respostas verdadeiras e contraditórias. Nada foi gravado.`
    );
  }
}

export async function enviarEmpenhoParaAssinatura(
  prisma: PrismaClient,
  input: AssinarEmpenhoInput
): Promise<DocumentoEmFila> {
  const d = zAssinarEmpenho.parse(input);

  const e = await prisma.empenho.findUnique({
    where: { id: d.empenhoId },
    select: {
      id: true,
      numero: true,
      tipo: true,
      data: true,
      valor: true,
      credorCpfCnpj: true,
      historico: true,
      ficha: {
        select: {
          numero: true,
          exercicio: true,
          naturezaDespesa: { select: { codigoCompleto: true, descricao: true } },
          fonte: { select: { codigo: true, descricao: true } },
        },
      },
    },
  });
  if (e === null) {
    throw new Error(`Empenho ${d.empenhoId} não encontrado.`);
  }
  await exigirSemDocumento(prisma, { empenhoId: e.id }, `O empenho ${e.numero}`);

  const conteudo = conteudoDaNotaDeEmpenho({
    numero: e.numero,
    data: e.data,
    tipo: e.tipo,
    valor: toMoney(e.valor.toFixed(2)),
    credorCpfCnpj: e.credorCpfCnpj,
    historico: e.historico,
    ficha: { numero: e.ficha.numero, exercicio: e.ficha.exercicio },
    dotacao: `${e.ficha.naturezaDespesa.codigoCompleto} — ${e.ficha.naturezaDespesa.descricao}`,
    fonte: `${e.ficha.fonte.codigo} — ${e.ficha.fonte.descricao}`,
  });

  return porNaFila(prisma, {
    conteudo,
    nomeArquivo: `nota-de-empenho-${e.numero}.txt`,
    descricao: `Nota de empenho ${e.numero} — ${e.credorCpfCnpj}`,
    dono: { empenhoId: e.id },
    modo: d.modo,
    signatarios: d.signatarios,
    criadoPor: d.criadoPor,
  });
}

export async function enviarLiquidacaoParaAssinatura(
  prisma: PrismaClient,
  input: AssinarLiquidacaoInput
): Promise<DocumentoEmFila> {
  const d = zAssinarLiquidacao.parse(input);

  const l = await prisma.liquidacao.findUnique({
    where: { id: d.liquidacaoId },
    select: {
      id: true,
      numero: true,
      valor: true,
      data: true,
      responsavelAtesto: true,
      notaFiscalNum: true,
      notaFiscalSerie: true,
      notaFiscalData: true,
      empenho: {
        select: { numero: true, valor: true, historico: true, credorCpfCnpj: true },
      },
    },
  });
  if (l === null) {
    throw new Error(`Liquidação ${d.liquidacaoId} não encontrada.`);
  }
  await exigirSemDocumento(prisma, { liquidacaoId: l.id }, `A liquidação ${l.numero}`);

  const conteudo = conteudoDaNotaDeLiquidacao({
    numero: l.numero,
    data: l.data,
    valor: toMoney(l.valor.toFixed(2)),
    responsavelAtesto: l.responsavelAtesto,
    credorCpfCnpj: l.empenho.credorCpfCnpj,
    empenho: {
      numero: l.empenho.numero,
      valor: toMoney(l.empenho.valor.toFixed(2)),
      historico: l.empenho.historico,
    },
    notaFiscal:
      l.notaFiscalNum === null
        ? null
        : {
            numero: l.notaFiscalNum,
            serie: l.notaFiscalSerie,
            data: l.notaFiscalData,
          },
  });

  return porNaFila(prisma, {
    conteudo,
    nomeArquivo: `nota-de-liquidacao-${l.numero}.txt`,
    descricao: `Nota de liquidação ${l.numero} — empenho ${l.empenho.numero}`,
    dono: { liquidacaoId: l.id },
    modo: d.modo,
    signatarios: d.signatarios,
    criadoPor: d.criadoPor,
  });
}

export async function enviarOrdemParaAssinatura(
  prisma: PrismaClient,
  input: AssinarOrdemInput
): Promise<DocumentoEmFila> {
  const d = zAssinarOrdem.parse(input);

  const o = await prisma.ordemDePagamento.findUnique({
    where: { id: d.ordemId },
    select: {
      id: true,
      numero: true,
      valor: true,
      dataPrevista: true,
      contaBancaria: true,
      historico: true,
      fonte: { select: { codigo: true, descricao: true } },
      liquidacao: {
        select: { numero: true, empenho: { select: { numero: true, credorCpfCnpj: true } } },
      },
    },
  });
  if (o === null) {
    throw new Error(`Ordem de pagamento ${d.ordemId} não encontrada.`);
  }
  await exigirSemDocumento(
    prisma,
    { ordemDePagamentoId: o.id },
    `A ordem de pagamento ${o.numero}`
  );

  const conteudo = conteudoDaOrdemDePagamento({
    numero: o.numero,
    dataPrevista: o.dataPrevista,
    valor: toMoney(o.valor.toFixed(2)),
    contaBancaria: o.contaBancaria,
    fonte: `${o.fonte.codigo} — ${o.fonte.descricao}`,
    historico: o.historico,
    liquidacao: { numero: o.liquidacao.numero },
    empenho: { numero: o.liquidacao.empenho.numero },
    credorCpfCnpj: o.liquidacao.empenho.credorCpfCnpj,
  });

  return porNaFila(prisma, {
    conteudo,
    nomeArquivo: `ordem-de-pagamento-${o.numero}.txt`,
    descricao: `Ordem de pagamento ${o.numero} — liquidação ${o.liquidacao.numero}`,
    dono: { ordemDePagamentoId: o.id },
    modo: d.modo,
    signatarios: d.signatarios,
    criadoPor: d.criadoPor,
  });
}

/**
 * O passo comum: gravar o documento e abrir a fila.
 *
 * ⚠️ AS DUAS CHAMADAS ABREM AS PRÓPRIAS TRANSAÇÕES, e não dá para envolvê-las numa
 * terceira: transação aninhada no Prisma não compõe — a de dentro não participa da de
 * fora, e um rollback externo deixaria as duas órfãs. É a mesma restrição do borderô.
 *
 * A ordem escolhida é a que falha de forma SEGURA: se a fila falhar, sobra um anexo sem
 * fila — um documento gerado que ninguém assinou, visível e regenerável depois de
 * removido. O contrário (fila sem anexo) deixaria uma fila assinável apontando para nada,
 * que é precisamente o que o desenho existe para impedir.
 */
async function porNaFila(
  prisma: PrismaClient,
  p: {
    readonly conteudo: string;
    readonly nomeArquivo: string;
    readonly descricao: string;
    readonly dono: {
      readonly empenhoId?: string;
      readonly liquidacaoId?: string;
      readonly ordemDePagamentoId?: string;
    };
    readonly modo: "SIMPLES" | "AVANCADA" | "QUALIFICADA";
    readonly signatarios: readonly string[];
    readonly criadoPor: string;
  }
): Promise<DocumentoEmFila> {
  // ⚠️ AS PRÉ-CONDIÇÕES DA FILA, CONFERIDAS ANTES DE GRAVAR O DOCUMENTO — e este guard
  // conserta um defeito real que a primeira versão tinha.
  //
  // Sem ele, uma tentativa com modo QUALIFICADA gravava o `Anexo` e morria ao abrir a
  // fila (não há provedor ICP-Brasil). Sobrava um documento órfão — e o guard de "um
  // documento por fato" passava a recusar a tentativa SEGUINTE, correta. O empenho
  // ficava impossível de assinar por qualquer modo, para sempre.
  //
  // A função é a MESMA que `criarFilaDeAssinatura` usa, e não uma cópia: duas
  // conferências separadas divergiriam na primeira regra nova acrescentada de um lado só.
  exigirFilaViavel(p.modo, p.signatarios);

  const documento = await anexarArquivo(prisma, {
    nomeOriginal: p.nomeArquivo,
    mimeType: "text/plain",
    conteudo: new TextEncoder().encode(p.conteudo),
    origem: "SISTEMA",
    ...p.dono,
    criadoPor: p.criadoPor,
  });

  const fila = await criarFilaDeAssinatura(prisma, {
    descricao: p.descricao,
    modo: p.modo,
    anexoId: documento.anexoId,
    signatarios: [...p.signatarios],
    criadoPor: p.criadoPor,
  });

  return {
    anexoId: documento.anexoId,
    filaId: fila.filaId,
    proximo: fila.proximo,
    conteudo: p.conteudo,
  };
}
