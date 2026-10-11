import { travar } from "../../packages/locks/index.js";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { TransacaoOfx } from "../../packages/ofx/index.js";
import { toMoney } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { ingerirLinhasDigitadas } from "./extrato.js";
import { diaCobertoPeloBanco } from "./linhas-digitadas.js";
import { diaDoBanco } from "./dia-do-banco.js";

/**
 * V39-R3 (R3-015, V39-029) — TRANSCREVER LINHAS DE EXTRATO E REVISAR A TRANSCRIÇÃO.
 *
 * Sem arquivo nem integração com o banco, o servidor digita as linhas a partir de um documento (extrato impresso, PDF do
 * banco). Cada lote vira um `ExtratoBancario` de origem DIGITADO pelo MESMO núcleo da importação, e cada linha ganha a
 * transcrição ao lado (documento de suporte, quem digitou). Outra pessoa revisa, uma vez: CONFIRMADA ou DIVERGENTE.
 * Quando a linha vale como extrato está em `linhas-digitadas.ts`: só confirmada e só nos dias que o banco não cobre.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zLinha = z.object({
  /** O dia que o documento informa (AAAA-MM-DD). */
  data: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da linha."),
  /** Canônico ("1234.56"), sempre positivo: o sinal é a natureza. */
  valor: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Informe o valor da linha em reais e centavos, sem sinal."),
  natureza: z.enum(["CREDITO", "DEBITO"]),
  historico: z.string().trim().min(1, "Informe o histórico da linha como está no documento."),
  documento: z.string().trim().optional(),
});

export const zTranscreverLinhasDeExtrato = z.object({
  contaBancariaId: z.string().min(1),
  linhas: z.array(zLinha).min(1, "Informe ao menos uma linha.").max(200, "No máximo 200 linhas por transcrição."),
  documentoDeSuporte: z.string().trim().min(1, "Informe o documento de onde as linhas foram copiadas."),
  observacao: z.string().trim().optional(),
  /** Linha igual (dia, valor, natureza) a uma já transcrita: só passa com a declaração de que é outra transação. */
  confirmoLinhasRepetidas: z.boolean().default(false),
  criadoPor: z.string().min(1),
});

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

export async function transcreverLinhasDeExtrato(
  prisma: PrismaClient,
  input: z.input<typeof zTranscreverLinhasDeExtrato>,
): Promise<{ readonly extratoId: string; readonly linhas: number }> {
  const d = zTranscreverLinhasDeExtrato.parse(input);
  const hoje = diaCivil(new Date());
  const linhas = d.linhas.map((l, i) => {
    // "2026-02-30" passa no formato e o Date o leva a 02/03: confere que o dia existe, antes de qualquer coisa.
    const dia = new Date(`${l.data}T00:00:00.000Z`);
    if (Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== l.data) {
      throw new Error(`Linha ${String(i + 1)}: o dia ${l.data.split("-").reverse().join("/")} não existe. Nada foi gravado.`);
    }
    const valor = toMoney(l.valor);
    if (!valor.greaterThan(0)) throw new Error(`Linha ${String(i + 1)}: o valor tem de ser maior que zero. Nada foi gravado.`);
    if (l.data > hoje) throw new Error(`Linha ${String(i + 1)}: o dia ${l.data.split("-").reverse().join("/")} ainda não chegou. Nada foi gravado.`);
    return { ...l, valor, dataPostagem: new Date(`${l.data}T00:00:00.000Z`) };
  });
  return prisma.$transaction(async (tx) => {
    // Sem UG, como a importação: o extrato é do banco, e o banco é do ente.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.transcreverLinhasDeExtrato, "ENTE");
    const conta = await tx.contaBancaria.findUnique({ where: { id: d.contaBancariaId }, select: { id: true, codigo: true } });
    if (conta === null) throw new Error("Conta bancária não cadastrada. Nada foi gravado.");
    // Duas transcrições ao mesmo tempo passariam juntas pela checagem de repetição; a importação do banco trava a mesma conta.
    await travar(tx, "ContaBancaria", [conta.id]);
    for (const l of linhas) {
      if (await diaCobertoPeloBanco(tx, conta.id, l.data)) {
        throw new Error(`O dia ${l.data.split("-").reverse().join("/")} da conta ${conta.codigo} já está coberto pelo extrato do banco: as linhas dele vêm do arquivo, não da digitação. Nada foi gravado.`);
      }
    }
    if (!d.confirmoLinhasRepetidas) await exigirSemRepetidas(tx, conta.id, conta.codigo, linhas);
    // Um lote, uma origem: o hash é do lote (único), não do conteúdo; a repetição de envio a tela barra pela chave do comando.
    const lote = randomUUID();
    const transacoes: TransacaoOfx[] = linhas.map((l, i) => {
      const fitid = `DIGITADO-${lote}-${String(i + 1)}`;
      return {
        fitid, dataPostagem: l.dataPostagem, valor: l.valor, natureza: l.natureza, memo: l.historico, documento: l.documento === "" ? undefined : l.documento,
        linhaCanonica: [fitid, l.data, l.valor.toFixed(2), l.natureza, l.historico, l.documento ?? ""].join("|"),
      };
    });
    const r = await ingerirLinhasDigitadas(tx, { contaBancariaId: conta.id, transacoes, hashOrigem: sha256(`DIGITADO|${conta.id}|${lote}`), importadoPor: d.criadoPor });
    const gravadas = await tx.lancamentoExtrato.findMany({ where: { extratoId: r.extratoId }, select: { id: true } });
    for (const g of gravadas) {
      await tx.transcricaoDeLinhaDeExtrato.create({
        data: { lancamentoExtratoId: g.id, documentoDeSuporte: d.documentoDeSuporte, observacao: d.observacao ?? null, criadoPor: d.criadoPor },
      });
    }
    return { extratoId: r.extratoId, linhas: gravadas.length };
  });
}

/** Linha igual a outra já transcrita (ou repetida no próprio lote) pede a declaração de que é outra transação. */
async function exigirSemRepetidas(
  tx: Tx,
  contaBancariaId: string,
  codigo: string,
  linhas: readonly { readonly data: string; readonly valor: ReturnType<typeof toMoney>; readonly natureza: string; readonly dataPostagem: Date }[],
): Promise<void> {
  const chave = (dia: string, valor: string, natureza: string): string => `${dia}|${valor}|${natureza}`;
  const vistas = new Set<string>();
  for (const l of linhas) {
    const k = chave(l.data, l.valor.toFixed(2), l.natureza);
    if (vistas.has(k)) throw new Error(`Há duas linhas iguais neste lançamento (${l.data.split("-").reverse().join("/")}, R$ ${l.valor.toFixed(2).replace(".", ",")}). Se são duas transações, marque a declaração de linhas repetidas. Nada foi gravado.`);
    vistas.add(k);
  }
  const dias = [...new Set(linhas.map((l) => l.dataPostagem.getTime()))].map((t) => new Date(t));
  const ja = await tx.lancamentoExtrato.findMany({
    where: { contaBancariaId, extrato: { origem: "DIGITADO" }, dataPostagem: { in: dias } },
    select: { dataPostagem: true, valor: true, natureza: true },
  });
  for (const j of ja) {
    const k = chave(diaDoBanco(j.dataPostagem), j.valor.toFixed(2), j.natureza);
    if (vistas.has(k)) {
      throw new Error(`Já existe uma linha digitada igual na conta ${codigo} (${diaDoBanco(j.dataPostagem).split("-").reverse().join("/")}, R$ ${j.valor.toFixed(2).replace(".", ",")}). Se é outra transação, marque a declaração de linhas repetidas. Nada foi gravado.`);
    }
  }
}

export const zRevisarTranscricaoDeExtrato = z.object({
  transcricaoId: z.string().min(1),
  resultado: z.enum(["CONFIRMADA", "DIVERGENTE"]),
  meio: z.string().trim().min(1, "Informe como a linha foi conferida."),
  observacao: z.string().trim().optional(),
  criadoPor: z.string().min(1),
});

export async function revisarTranscricaoDeExtrato(
  prisma: PrismaClient,
  input: z.input<typeof zRevisarTranscricaoDeExtrato>,
): Promise<{ readonly revisaoId: string }> {
  const d = zRevisarTranscricaoDeExtrato.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.revisarTranscricaoDeExtrato, "ENTE");
    const t = await tx.transcricaoDeLinhaDeExtrato.findUnique({
      where: { id: d.transcricaoId },
      select: { id: true, criadoPor: true, revisao: { select: { resultado: true, criadoPor: true } } },
    });
    if (t === null) throw new Error("Transcrição não encontrada. Nada foi gravado.");
    if (t.criadoPor === d.criadoPor) throw new Error("Quem digitou a linha não a revisa: a revisão é de outra pessoa, contra o documento de suporte. Nada foi gravado.");
    if (t.revisao !== null) throw new Error(`Esta linha já foi revisada (${t.revisao.resultado === "CONFIRMADA" ? "confirmada" : "divergente"}, por ${t.revisao.criadoPor}). Nada foi gravado.`);
    try {
      const r = await tx.revisaoDaTranscricaoDeExtrato.create({
        data: { transcricaoId: t.id, resultado: d.resultado, meio: d.meio, observacao: d.observacao ?? null, criadoPor: d.criadoPor },
        select: { id: true },
      });
      return { revisaoId: r.id };
    } catch (e) {
      // Duas revisões ao mesmo tempo: o índice único decide, e a segunda ouve o motivo.
      if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") throw new Error("Esta linha acabou de ser revisada por outra pessoa. Nada foi gravado.");
      throw e;
    }
  });
}
