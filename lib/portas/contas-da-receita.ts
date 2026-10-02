import { contaDaReceitaVigente, declararContaDaReceita, listarContasDaReceita } from "../../modules/m04-receita/conta-da-receita";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ AS CONTAS DA RECEITA POR NATUREZA, NA TELA (V28) ═══
 *
 * ⚠️ A LISTA PARTE DAS NATUREZAS EM USO (previstas na LOA ou já arrecadadas), não das declarações: a
 * natureza sem VPA é a que vai recusar a próxima guia, e é ela que a tela mostra primeiro.
 */

export interface NaturezaNaTela {
  readonly codigo: string;
  readonly descricao: string;
  readonly contaVpa: string | null;
  readonly contaNome: string | null;
  /** O prefixo da declaração que cobre a natureza (pode ser mais curto que o código). */
  readonly prefixo: string | null;
}

export interface DeclaracaoNaTela {
  readonly prefixo: string;
  readonly contaVpa: string;
  readonly contaNome: string | null;
  readonly fundamento: string;
  readonly versao: number;
  readonly criadoPor: string;
}

export async function lerContasDaReceita(): Promise<{ readonly naturezas: readonly NaturezaNaTela[]; readonly declaracoes: readonly DeclaracaoNaTela[] }> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const prisma = cliente();
  const [emUso, declaradas] = await Promise.all([
    prisma.naturezaReceita.findMany({
      where: { OR: [{ receitasPrevistas: { some: {} } }, { receitasArrecadadas: { some: {} } }] },
      orderBy: { codigo: "asc" },
      select: { codigo: true, descricao: true },
    }),
    listarContasDaReceita(prisma),
  ]);
  const codigos = [...new Set(declaradas.map((d) => d.contaVpaCodigo))];
  const nomes = new Map((await prisma.contaPcasp.findMany({ where: { codigo: { in: codigos } }, select: { codigo: true, nome: true } })).map((c) => [c.codigo, c.nome]));
  const naturezas: NaturezaNaTela[] = [];
  for (const n of emUso) {
    const c = await contaDaReceitaVigente(prisma, n.codigo);
    naturezas.push({ codigo: n.codigo, descricao: n.descricao, contaVpa: c?.contaVpaCodigo ?? null, contaNome: c === null ? null : nomes.get(c.contaVpaCodigo) ?? null, prefixo: c?.naturezaPrefixo ?? null });
  }
  return {
    naturezas,
    declaracoes: declaradas.map((d) => ({ prefixo: d.naturezaPrefixo, contaVpa: d.contaVpaCodigo, contaNome: nomes.get(d.contaVpaCodigo) ?? null, fundamento: d.fundamento, versao: d.versao, criadoPor: d.criadoPor })),
  };
}

export async function declararContaDaReceitaNaTela(input: { readonly naturezaPrefixo: string; readonly contaVpaCodigo: string; readonly fundamento: string }): Promise<string> {
  const r = await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_ORCAMENTARIO", (criadoPor) => declararContaDaReceita(cliente(), { ...input, criadoPor }));
  return (
    `Naturezas iniciadas por ${input.naturezaPrefixo} declaradas na versão ${String(r.versao)}: as próximas guias creditam ${input.contaVpaCodigo}` +
    (r.anterior === null ? "." : `, no lugar de ${r.anterior}. As guias já registradas permanecem na conta em que foram lançadas.`)
  );
}
