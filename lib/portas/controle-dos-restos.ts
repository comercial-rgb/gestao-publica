import {
  contasVigentes,
  declararContasDoControleDosRestos,
  PAPEIS_DO_CONTROLE,
  PAPEL_NO_MANUAL,
  type PapelDoControle,
} from "../../modules/m08-restos-a-pagar/controle-dos-restos.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

export type { PapelDoControle };

export interface PapelNaTela {
  readonly papel: PapelDoControle;
  readonly titulo: string;
  readonly prefixo: string;
  /** A conta declarada hoje, ou a que o manual nomeia (quando está no plano), para pré-preencher. */
  readonly escolhida: string | null;
  /** As analíticas do plano sob o título do manual — a escolha é entre elas. */
  readonly opcoes: readonly { readonly codigo: string; readonly nome: string }[];
}

export interface ControleDosRestosDaTela {
  readonly ligado: boolean;
  readonly versao: number | null;
  readonly papeis: readonly PapelNaTela[];
}

/** V35 A3 — a declaração das contas do controle 5.3/6.3 dos restos, papel a papel, com as opções do plano. */
export async function lerControleDosRestos(): Promise<ControleDosRestosDaTela> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const prisma = cliente();
  const [vigentes, ultima, contas] = await Promise.all([
    contasVigentes(prisma),
    prisma.declaracaoDoControleDosRestos.findFirst({ orderBy: { versao: "desc" }, select: { versao: true } }),
    prisma.contaPcasp.findMany({ where: { analitica: true, OR: [{ codigo: { startsWith: "5.3." } }, { codigo: { startsWith: "6.3." } }, { codigo: { startsWith: "6.2.2.1.3." } }] }, select: { codigo: true, nome: true }, orderBy: { codigo: "asc" } }),
  ]);
  const papeis = PAPEIS_DO_CONTROLE.map((papel) => {
    const m = PAPEL_NO_MANUAL[papel];
    const opcoes = contas.filter((c) => c.codigo.startsWith(`${m.prefixo}.`));
    const sugerida = m.sugestao !== null && opcoes.some((o) => o.codigo === m.sugestao) ? m.sugestao : null;
    return { papel, titulo: m.titulo, prefixo: m.prefixo, escolhida: vigentes?.get(papel)?.codigo ?? sugerida, opcoes };
  });
  return { ligado: vigentes !== null, versao: ultima?.versao ?? null, papeis };
}

export async function declararControleDosRestos(input: { readonly contas: Readonly<Record<string, string>>; readonly fundamento: string }): Promise<string> {
  const r = await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR", (criadoPor) => declararContasDoControleDosRestos(cliente(), { contas: { ...input.contas }, fundamento: input.fundamento, criadoPor }));
  return `Contas do controle orçamentário dos restos declaradas (versão ${String(r.versao)}). Valem a partir do próximo encerramento de exercício.`;
}
