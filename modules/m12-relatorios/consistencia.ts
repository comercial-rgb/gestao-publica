import { toMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { balancete } from "./livros.js";
import { balancoPatrimonial } from "./balanco-patrimonial.js";
import { demonstracaoVariacoesPatrimoniais } from "./dvp.js";
import { balancoOrcamentario } from "./balanco-orcamentario.js";
import { medir, verificarGeracao, type EscopoConsistencia, type Verificacao } from "./consistencia-contrato.js";
import { verificacoesDaLoa } from "./consistencia-loa.js";

export type { ResultadoVerificacao, EscopoConsistencia, Verificacao } from "./consistencia-contrato.js";

/**
 * M12 — RELATÓRIO DE CONSISTÊNCIA (TR 5.128–5.131 · 7.27).
 *
 * ═══ A DOUTRINA: IDENTIDADE TEM UM DONO; O DIAGNÓSTICO VISITA, NÃO REIMPLEMENTA ═══
 * Cada verificação CHAMA a função do módulo dono da identidade e lê os DOIS LADOS que ela já
 * calcula. Zero aritmética nova — se o motor recomputasse o balanço, ele poderia divergir do
 * relatório oficial, e aí qual dos dois o TCE acredita? O `fonte` de cada linha aponta o dono, para
 * o leitor conferir lá.
 *
 * ═══ ⚠️ A TRÍADE É A ALMA — SEM_DADO NUNCA SE DISFARÇA DE OK ═══
 *   · OK       — os dois lados batem (diferença zero).
 *   · DIVERGE  — batem NÃO: mostra esquerda, direita e a diferença (o número que falta).
 *   · SEM_DADO — não há o que verificar (cadastro ausente, motor inexistente). É INTERRUPTOR
 *                nomeado — um verde que não verificou nada é pior que um vermelho, porque manda
 *                seguir em frente. O planejamento (5.129) é SEM_DADO por enquanto: ver o gap.
 *
 * ═══ AS FAIL-CLOSED ═══ Alguns donos ESTOURAM quando não fecham (o balanço patrimonial, o
 * orçamentário). Para eles, gerar sem estourar É o OK; o estouro vira DIVERGE com a mensagem do
 * dono no `detalhe`. O balancete NÃO estoura (ele nomeia o `fecha`), e por isso é o mais direto.
 */

// ⚠️ O cliente COMPLETO: alguns donos (balanço patrimonial/orçamentário) pedem o `PrismaClient`
// inteiro, não o `Tx` estreitado. O diagnóstico é leitura pura de ponta a ponta — não roda dentro
// de transação de escrita —, então o cliente cheio é o tipo certo.
type Leitor = PrismaClient;

const inicioDoExercicio = (exercicio: number): Date => new Date(Date.UTC(exercicio, 0, 1, 0, 0, 0, 0));

// ═══════════════════════════════════════════════════════════════════════════
// AS VERIFICAÇÕES, POR ESCOPO
// ═══════════════════════════════════════════════════════════════════════════

async function verificacoesMensais(leitor: Leitor, exercicio: number, corte: Date): Promise<Verificacao[]> {
  const base = {
    chave: "BALANCETE_FECHA",
    titulo: "Balancete fecha — Σ saldos devedores == Σ saldos credores (partidas dobradas)",
    escopo: "MENSAL" as const,
    fonte: "Livros — Balancete",
    fonteHref: "/relatorios/livros/balancete",
  };
  const b = await balancete(leitor, { desde: inicioDoExercicio(exercicio), ate: corte, modo: "ANALITICO" });
  const fecha = await medir(base, async () => ({ esq: toMoney(b.totalSaldoFinalDevedor), dir: toMoney(b.totalSaldoFinalCredor) }));

  // O segundo olhar da mesma foto: o movimento do período também é dobrado.
  const mov = await medir(
    {
      chave: "BALANCETE_MOVIMENTO",
      titulo: "Movimento do período — Σ débitos == Σ créditos",
      escopo: "MENSAL" as const,
      fonte: "Livros — Balancete",
      fonteHref: "/relatorios/livros/balancete",
    },
    async () => ({ esq: toMoney(b.totalMovimentoDebito), dir: toMoney(b.totalMovimentoCredito) })
  );

  return [fecha, mov];
}

async function verificacoesAnuais(leitor: Leitor, exercicio: number, corte: Date): Promise<Verificacao[]> {
  // A1 — a equação fundamental do balanço patrimonial (fail-closed no dono).
  const patrimonial = await medir(
    {
      chave: "BALANCO_PATRIMONIAL_EQUACAO",
      titulo: "Balanço Patrimonial — Ativo == Passivo + Patrimônio Líquido",
      escopo: "ANUAL",
      fonte: "RREO Anexo 14 — Balanço Patrimonial",
      fonteHref: "/relatorios/rreo/anexo14",
    },
    async () => {
      const bp = await balancoPatrimonial(leitor, corte);
      return { esq: toMoney(bp.totalAtivo), dir: toMoney(toMoney(bp.totalPassivo).plus(toMoney(bp.totalPatrimonioLiquido))) };
    }
  );

  // D3 — o resultado do período por DOIS motores independentes tem de ser o MESMO número.
  const dvpVsBalanco = await medir(
    {
      chave: "DVP_VS_BALANCO",
      titulo: "DVP × Balanço — resultado patrimonial (DVP) == resultado do exercício (Balanço)",
      escopo: "ANUAL",
      fonte: "DVP × Balanço Patrimonial",
      fonteHref: "/relatorios/rreo/anexo14",
    },
    async () => {
      const [dvp, bp] = await Promise.all([
        demonstracaoVariacoesPatrimoniais(leitor, inicioDoExercicio(exercicio), corte),
        balancoPatrimonial(leitor, corte),
      ]);
      return { esq: toMoney(dvp.resultadoPatrimonial), dir: toMoney(bp.resultadoDoExercicio) };
    }
  );

  // O balanço orçamentário — equilíbrio VII==XV, fail-closed NA GERAÇÃO: se gera, fechou.
  const orcamentario = await verificarGeracao(
    {
      chave: "BALANCO_ORCAMENTARIO_EQUILIBRIO",
      titulo: "Balanço Orçamentário — equilíbrio (receita + déficit == despesa + superávit)",
      escopo: "ANUAL",
      fonte: "RREO — Balanço Orçamentário",
      fonteHref: "/relatorios/rreo/anexo1",
    },
    async () => {
      await balancoOrcamentario(leitor, exercicio);
    }
  );

  return [patrimonial, dvpVsBalanco, orcamentario];
}

export async function executarVerificacoes(
  leitor: Leitor,
  p: { readonly exercicio: number; readonly corte: Date; readonly escopo: EscopoConsistencia }
): Promise<readonly Verificacao[]> {
  switch (p.escopo) {
    case "MENSAL":
      return verificacoesMensais(leitor, p.exercicio, p.corte);
    case "ANUAL":
      return verificacoesAnuais(leitor, p.exercicio, p.corte);
    case "PLANEJAMENTO":
      // ⚠️ 7.17: o gap PLANEJAMENTO-SEM-MOTOR foi QUITADO — o escopo agora VISITA o motor da LOA
      // (`consistencia-loa.ts`), pelo mesmo contrato. O que resta fora (PPA↔LOA, ações×QDD) sai
      // nomeado de lá, não como um SEM_DADO-total.
      return verificacoesDaLoa(leitor, { exercicio: p.exercicio });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// F3 — DIAGNÓSTICO PRÉ-ENVIO (7.27): a composição, com veredito único
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosticoPreEnvio {
  readonly exercicio: number;
  readonly corte: Date;
  readonly verificacoes: readonly Verificacao[];
  /** `true` só quando NENHUMA verificação DIVERGE (SEM_DADO não trava, mas é reportado). */
  readonly prontoParaEnvio: boolean;
  readonly divergencias: readonly string[];
  readonly semDados: readonly string[];
}

/**
 * O CHECKLIST QUE ANTECEDE O ENVIO (MSC/Siconfi). Consome os TRÊS escopos — zero verificação
 * própria. Uma DIVERGE trava o envio (o número está errado); um SEM_DADO NÃO trava (falta cadastro,
 * não há erro), mas aparece: quem envia decide se o vazio é aceitável.
 */
export async function diagnosticoPreEnvio(
  leitor: Leitor,
  p: { readonly exercicio: number; readonly corte: Date }
): Promise<DiagnosticoPreEnvio> {
  const escopos: readonly EscopoConsistencia[] = ["MENSAL", "PLANEJAMENTO", "ANUAL"];
  const listas = await Promise.all(escopos.map((escopo) => executarVerificacoes(leitor, { ...p, escopo })));
  const verificacoes = listas.flat();

  const divergencias = verificacoes.filter((v) => v.resultado === "DIVERGE").map((v) => v.titulo);
  const semDados = verificacoes.filter((v) => v.resultado === "SEM_DADO").map((v) => v.titulo);

  return {
    exercicio: p.exercicio,
    corte: p.corte,
    verificacoes,
    prontoParaEnvio: divergencias.length === 0,
    divergencias,
    semDados,
  };
}
