import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../../../prisma/generated/client/client.js";
import { lerPlanilha } from "../../../../packages/planilha/index.js";
import { autorizarNo } from "../../../../modules/m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../../../../modules/m16-travamento/acoes.js";

/**
 * V23 — O PLANO DE CONTAS DO TRIBUNAL (SAGRES §5.28), com as exigências por conta.
 *
 * O leiaute manda relacionar a ReceitaExtra (§4.19) com a Retencao, e a DespesaExtra (§4.20) com a
 * ReceitaExtra, quando a conta contábil EXIGIR — e quem diz o que cada conta exige é a planilha que o
 * tribunal publica, com as colunas `exige_retencao` e `exige_receita_extra` por `ano_conta`
 * (`docs/oficial/tce-pb/Pcasp_2025.xlsx`, `docs/oficial/tce-pb/pcasp-tcepb/Pcasp2024_2.xlsx`).
 *
 * ⚠️ A IMPORTAÇÃO É DESIGNADA COM FUNDAMENTO. Para 2026 a página oficial aponta o `Pcasp_2025.xlsx`,
 * sem linhas de 2026 e com as exigências de 2025 todas em 0 (2022-2024 têm 32/42/42 contas que
 * exigem retenção). Qual `ano_conta` vale para o exercício é decisão registrada pelo ente, com
 * fundamento; o código não escolhe. A vigente é a importação mais recente do exercício.
 *
 * ⚠️ A PLANILHA TEM LINHAS QUEBRADAS: descrições com quebra de linha partem o registro em duas linhas
 * (a segunda começa pelo resto da descrição, não por um ano). A importação as recompõe quando o
 * formato é exatamente esse, e recusa nomeando a linha em qualquer outro caso. Código repetido com as
 * MESMAS exigências vira uma conta só; repetido com exigências DIFERENTES é recusado.
 */

const CABECALHO = ["ano_conta", "codigo_conta_contabil", "descricao_conta_contabil", "exige_retencao", "exige_receita_extra"] as const;

export const zImportarPlanoDoTribunalInput = z.object({
  exercicio: z.number().int().min(2020).max(2100),
  anoDaTabela: z.number().int().min(2020).max(2100),
  arquivoNome: z.string().trim().min(1),
  conteudo: z.instanceof(Buffer),
  fundamento: z.string().trim().min(20, "Diga por que esta tabela vale para o exercício (ao menos 20 caracteres)."),
  criadoPor: z.string().min(1),
});
export type ImportarPlanoDoTribunalInput = z.input<typeof zImportarPlanoDoTribunalInput>;

export interface ContaDoPlanoLida {
  readonly codigo: string;
  readonly descricao: string;
  readonly exigeRetencao: boolean;
  readonly exigeReceitaExtra: boolean;
}

const ANO = /^\d{4}$/;
const FLAG = /^[01]$/;

/** PURA: da planilha às contas do `ano_conta` pedido. Recusa nomeando a linha. */
export function lerContasDoPlano(conteudo: Buffer, anoDaTabela: number): readonly ContaDoPlanoLida[] {
  const abas = [...lerPlanilha(conteudo).values()];
  const linhas = abas[0];
  if (linhas === undefined || linhas.length === 0) throw new Error("A planilha está vazia. Nada foi importado.");
  const cab = linhas[0]!.slice(0, 5).map((c) => c.trim().toLowerCase());
  if (CABECALHO.some((c, i) => cab[i] !== c)) {
    throw new Error(
      `O cabeçalho da planilha não é o do plano de contas do Tribunal (esperado: ${CABECALHO.join(", ")}; ` +
        `lido: ${cab.join(", ")}). Nada foi importado.`
    );
  }
  const alvo = String(anoDaTabela);
  const porCodigo = new Map<string, ContaDoPlanoLida>();
  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i]!.map((c) => c.trim());
    if (l[0] !== alvo) continue;
    let descricao = l[2] ?? "";
    let r = l[3] ?? "";
    let e = l[4] ?? "";
    if (!FLAG.test(r) || !FLAG.test(e)) {
      // A linha quebrada: o resto da descrição e as duas exigências vêm na linha seguinte.
      const prox = (linhas[i + 1] ?? []).map((c) => c.trim());
      if (prox.length >= 3 && !ANO.test(prox[0] ?? "") && FLAG.test(prox[1] ?? "") && FLAG.test(prox[2] ?? "")) {
        descricao = `${descricao} ${prox[0]}`.trim();
        r = prox[1]!;
        e = prox[2]!;
        i += 1;
      } else {
        throw new Error(`A linha ${String(i + 1)} da planilha não tem as duas exigências (0 ou 1). Nada foi importado.`);
      }
    }
    const codigo = l[1] ?? "";
    if (!/^\d{9}$/.test(codigo)) throw new Error(`A linha ${String(i + 1)} tem o código "${codigo}", que não tem 9 dígitos. Nada foi importado.`);
    const conta: ContaDoPlanoLida = { codigo, descricao, exigeRetencao: r === "1", exigeReceitaExtra: e === "1" };
    const ja = porCodigo.get(codigo);
    if (ja !== undefined && (ja.exigeRetencao !== conta.exigeRetencao || ja.exigeReceitaExtra !== conta.exigeReceitaExtra)) {
      throw new Error(`A conta ${codigo} aparece duas vezes em ${alvo} com exigências diferentes (linha ${String(i + 1)}). Nada foi importado.`);
    }
    if (ja === undefined) porCodigo.set(codigo, conta);
  }
  if (porCodigo.size === 0) throw new Error(`A planilha não tem linhas de ${alvo}. Nada foi importado.`);
  return [...porCodigo.values()];
}

/** IMPORTA a tabela designada para o exercício. Ação própria; append-only (a nova vira a vigente). */
export async function importarPlanoDoTribunal(
  prisma: PrismaClient,
  input: ImportarPlanoDoTribunalInput
): Promise<{ readonly importacaoId: string; readonly contas: number; readonly exigemRetencao: number; readonly exigemReceitaExtra: number }> {
  const d = zImportarPlanoDoTribunalInput.parse(input);
  if (d.anoDaTabela > d.exercicio) throw new Error("A tabela designada não pode ser de ano posterior ao exercício. Nada foi importado.");
  // Pré-condições ANTES de gravar: a planilha inteira é lida e conferida primeiro.
  const contas = lerContasDoPlano(d.conteudo, d.anoDaTabela);
  const sha = createHash("sha256").update(d.conteudo).digest("hex");
  const id = await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.importarPlanoDoTribunal, "ENTE");
    const imp = await tx.importacaoDoPlanoDoTribunal.create({
      data: { exercicio: d.exercicio, anoDaTabela: d.anoDaTabela, arquivoNome: d.arquivoNome, arquivoSha256: sha, fundamento: d.fundamento, criadoPor: d.criadoPor },
      select: { id: true },
    });
    await tx.contaDoPlanoDoTribunal.createMany({ data: contas.map((c) => ({ importacaoId: imp.id, ...c })) });
    return imp.id;
  });
  return {
    importacaoId: id,
    contas: contas.length,
    exigemRetencao: contas.filter((c) => c.exigeRetencao).length,
    exigemReceitaExtra: contas.filter((c) => c.exigeReceitaExtra).length,
  };
}

export interface PlanoVigente {
  readonly importacaoId: string;
  readonly exercicio: number;
  readonly anoDaTabela: number;
  readonly arquivoNome: string;
  readonly arquivoSha256: string;
  readonly fundamento: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  readonly contas: ReadonlyMap<string, ContaDoPlanoLida>;
}

/** LEITURA: a tabela vigente do exercício (a importação mais recente), ou null. */
export async function planoVigenteDoTribunal(prisma: PrismaClient, exercicio: number): Promise<PlanoVigente | null> {
  const imp = await prisma.importacaoDoPlanoDoTribunal.findFirst({
    where: { exercicio },
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    include: { contas: { select: { codigo: true, descricao: true, exigeRetencao: true, exigeReceitaExtra: true } } },
  });
  if (imp === null) return null;
  return {
    importacaoId: imp.id,
    exercicio: imp.exercicio,
    anoDaTabela: imp.anoDaTabela,
    arquivoNome: imp.arquivoNome,
    arquivoSha256: imp.arquivoSha256,
    fundamento: imp.fundamento,
    criadoEm: imp.criadoEm,
    criadoPor: imp.criadoPor,
    contas: new Map(imp.contas.map((c) => [c.codigo, c])),
  };
}
