import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  dotacaoFixadaDetalhada,
  previsaoPorFonte,
  previsaoPorNaturezaFonte,
  reprevisaoAcumuladaPorNatureza,
  type DotacaoFixadaDetalhada,
} from "../m02-planejamento/consultas.js";
import { ehIntraorcamentaria } from "../m04-receita/natureza.js";
import { lerDeParaBaseImpostos } from "./base-impostos.js";
import { medir, medirPiso, semDado, type BaseVerificacao, type Verificacao } from "./consistencia-contrato.js";

/**
 * M12 — CONSISTÊNCIA DA LOA (TR 4.17 · 5.129). Quita PLANEJAMENTO-SEM-MOTOR da 7.16.
 *
 * ⚠️ MESMA DOUTRINA: cada verificação é FUNÇÃO EXPORTADA com os dois lados prontos (o contrato da
 * 7.16); o motor de consistência as VISITA. Zero segunda classificação — o de-para de impostos e o
 * marcador de intra são os MESMOS que os anexos usam; aqui só se troca a FONTE do dado (previsão no
 * lugar de execução), a aritmética é a deles.
 *
 * ═══ A ARITMÉTICA (à mão, antes do código) ═══
 * · EQUILÍBRIO (art. 4º): Σ receita prevista ATUALIZADA == Σ dotação FIXADA. A atualizada = inicial
 *   + Σ reprevisões. A dotação fixada = Σ `valorDotado` das fichas (o que a LOA fixou).
 * · POR FONTE: para cada fonte, receita prevista (INICIAL) == dotação fixada. ⚠️ INICIAL: a
 *   reprevisão é por NATUREZA, não se reparte por fonte — então a coluna por fonte é a da sanção. O
 *   desalinhamento é Σ|receita_fonte − despesa_fonte|: ele pega o furo mesmo quando os totais se
 *   anulam (fonte A sobra, fonte B falta, total zero).
 * · INTRA × INTRA: receita intra prevista (categoria 7/8) == despesa intra fixada (modalidade 91).
 *   Sem intra cadastrada dos dois lados → SEM_DADO (nada a verificar).
 * · MDE ≥25% / SAÚDE ≥15% (piso): dotação da função (12 educação / 10 saúde) ≥ percentual × base de
 *   impostos e transferências PREVISTA. A base sai do de-para `lerDeParaBaseImpostos` sobre a
 *   previsão — o MESMO classificador do Anexo 8/12. De-para vazio → SEM_DADO (interruptor do DePara):
 *   nunca se projeta sobre base que não existe.
 * · FUNDEB 70% / VAAT e PESSOAL × RCL: SEM_DADO nomeado — ver os interruptores abaixo.
 */

type Leitor = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const FONTE_RREO3 = { fonte: "RREO Anexo 3 — RCL / previsão", href: "/relatorios/rreo/anexo3" };
const FONTE_ANEXO8 = { fonte: "RREO Anexo 8 — Educação (MDE)", href: "/relatorios/rreo/anexo8" };
const FONTE_ANEXO12 = { fonte: "RREO Anexo 12 — Saúde (ASPS)", href: "/relatorios/rreo/anexo12" };
const FUNCAO_EDUCACAO = "12";
const FUNCAO_SAUDE = "10";
const MODALIDADE_INTRA = "91";

const soma = (xs: readonly Money[]): Money => xs.reduce((a, b) => toMoney(a.plus(b)), toMoney("0.00"));

/** Receita prevista ATUALIZADA total = Σ inicial (por natureza/fonte) + Σ reprevisões. */
async function receitaAtualizadaTotal(leitor: Leitor, exercicio: number): Promise<Money> {
  const [inicial, reprev] = await Promise.all([
    previsaoPorNaturezaFonte(leitor, { exercicio }),
    reprevisaoAcumuladaPorNatureza(leitor, { exercicio }),
  ]);
  const totalInicial = soma(inicial.map((r) => r.previsto));
  const totalReprev = soma([...reprev.values()]);
  return toMoney(totalInicial.plus(totalReprev));
}

// ═══════════════════════════════════════════════════════════════════════════
// F1 — IDENTIDADES ESTRUTURAIS
// ═══════════════════════════════════════════════════════════════════════════

async function verificarEquilibrio(leitor: Leitor, exercicio: number): Promise<Verificacao> {
  const base: BaseVerificacao = {
    chave: "LOA_EQUILIBRIO",
    titulo: "LOA — equilíbrio: Σ receita prevista == Σ dotação fixada (art. 4º)",
    escopo: "PLANEJAMENTO",
    fonte: FONTE_RREO3.fonte,
    fonteHref: FONTE_RREO3.href,
  };
  return medir(base, async () => {
    const [receita, fichas] = await Promise.all([
      receitaAtualizadaTotal(leitor, exercicio),
      dotacaoFixadaDetalhada(leitor, { exercicio }),
    ]);
    const dotacao = soma(fichas.map((f) => f.valorDotado));
    return { esq: receita, dir: dotacao };
  });
}

async function verificarPorFonte(leitor: Leitor, exercicio: number): Promise<Verificacao> {
  const base: BaseVerificacao = {
    chave: "LOA_POR_FONTE",
    titulo: "LOA por fonte — receita prevista da fonte == dotação fixada da fonte",
    escopo: "PLANEJAMENTO",
    fonte: FONTE_RREO3.fonte,
    fonteHref: FONTE_RREO3.href,
  };
  const [receitaPorFonte, fichas] = await Promise.all([
    previsaoPorFonte(leitor, { exercicio }),
    dotacaoFixadaDetalhada(leitor, { exercicio }),
  ]);
  const despesaPorFonte = new Map<string, Money>();
  for (const f of fichas) {
    despesaPorFonte.set(f.fonteId, toMoney((despesaPorFonte.get(f.fonteId) ?? toMoney("0.00")).plus(f.valorDotado)));
  }

  const fontes = new Set<string>([...receitaPorFonte.keys(), ...despesaPorFonte.keys()]);
  let totalReceita = toMoney("0.00");
  let totalDespesa = toMoney("0.00");
  let desalinhamento = toMoney("0.00");
  const furos: string[] = [];
  for (const fonteId of fontes) {
    const r = receitaPorFonte.get(fonteId) ?? toMoney("0.00");
    const d = despesaPorFonte.get(fonteId) ?? toMoney("0.00");
    totalReceita = toMoney(totalReceita.plus(r));
    totalDespesa = toMoney(totalDespesa.plus(d));
    const gap = toMoney(r.minus(d));
    if (!gap.isZero()) {
      desalinhamento = toMoney(desalinhamento.plus(gap.abs()));
      furos.push(`fonte ${fonteId}: receita ${r.toFixed(2)} × dotação ${d.toFixed(2)} (dif ${gap.toFixed(2)})`);
    }
  }

  const ok = desalinhamento.isZero();
  return {
    ...base,
    resultado: ok ? "OK" : "DIVERGE",
    esquerda: totalReceita.toFixed(2),
    direita: totalDespesa.toFixed(2),
    // ⚠️ A diferença é o DESALINHAMENTO (Σ|gap por fonte|), não `esq−dir`: pega o furo mesmo quando
    // os totais se anulam. Zero só quando TODA fonte casa.
    diferenca: desalinhamento.toFixed(2),
    ...(ok ? {} : { detalhe: `Fontes desalinhadas — ${furos.join("; ")}` }),
  };
}

async function verificarIntra(leitor: Leitor, exercicio: number): Promise<Verificacao> {
  const base: BaseVerificacao = {
    chave: "LOA_INTRA",
    titulo: "LOA intra × intra — receita intra prevista == despesa intra fixada (modalidade 91)",
    escopo: "PLANEJAMENTO",
    fonte: FONTE_RREO3.fonte,
    fonteHref: FONTE_RREO3.href,
  };
  const [previsao, fichas] = await Promise.all([
    previsaoPorNaturezaFonte(leitor, { exercicio }),
    dotacaoFixadaDetalhada(leitor, { exercicio }),
  ]);
  const receitaIntra = soma(previsao.filter((r) => ehIntraorcamentaria(r.naturezaCodigo)).map((r) => r.previsto));
  const despesaIntra = soma(fichas.filter((f) => f.modalidade === MODALIDADE_INTRA).map((f) => f.valorDotado));

  if (receitaIntra.isZero() && despesaIntra.isZero()) {
    return semDado(
      base,
      "INTRA-SEM-CADASTRO: não há receita intra (categoria 7/8) nem despesa intra (modalidade 91) " +
        "prevista neste exercício — nada a confrontar. Aparece quando o ente orçar operações intra."
    );
  }
  return medir(base, async () => ({ esq: receitaIntra, dir: despesaIntra }));
}

// ═══════════════════════════════════════════════════════════════════════════
// F2 — LIMITES CONSTITUCIONAIS PROJETADOS SOBRE A LOA
// ═══════════════════════════════════════════════════════════════════════════

/** A base de impostos e transferências PREVISTA — Σ previsão das naturezas que o de-para mapeia. */
async function baseImpostosPrevista(leitor: Leitor, exercicio: number): Promise<{ base: Money; temDePara: boolean }> {
  const [previsao, dePara] = await Promise.all([
    previsaoPorNaturezaFonte(leitor, { exercicio }),
    lerDeParaBaseImpostos(leitor),
  ]);
  if (dePara.size === 0) return { base: toMoney("0.00"), temDePara: false };
  const base = soma(previsao.filter((r) => dePara.has(r.naturezaCodigo)).map((r) => r.previsto));
  return { base, temDePara: true };
}

function verificarPisoPorFuncao(
  leitor: Leitor,
  exercicio: number,
  cfg: { chave: string; titulo: string; funcao: string; percentual: string; fonte: string; href: string; interruptor: string }
): Promise<Verificacao> {
  const base: BaseVerificacao = { chave: cfg.chave, titulo: cfg.titulo, escopo: "PLANEJAMENTO", fonte: cfg.fonte, fonteHref: cfg.href };
  return (async () => {
    const { base: baseImpostos, temDePara } = await baseImpostosPrevista(leitor, exercicio);
    if (!temDePara) return semDado(base, cfg.interruptor);
    const fichas = await dotacaoFixadaDetalhada(leitor, { exercicio });
    const dotacaoFuncao = soma(fichas.filter((f) => f.funcaoCodigo === cfg.funcao).map((f) => f.valorDotado));
    const minimo = toMoney(baseImpostos.times(toMoney(cfg.percentual).dividedBy(100)));
    return medirPiso(base, async () => ({
      aplicado: dotacaoFuncao,
      minimo,
      detalhe: `Base de impostos e transferências prevista: ${baseImpostos.toFixed(2)} · mínimo ${cfg.percentual}%.`,
    }));
  })();
}

// ═══════════════════════════════════════════════════════════════════════════
// O MOTOR — todas as verificações da LOA (o que o escopo PLANEJAMENTO da 7.16 visita)
// ═══════════════════════════════════════════════════════════════════════════

export async function verificacoesDaLoa(leitor: Leitor, p: { readonly exercicio: number }): Promise<Verificacao[]> {
  const [equilibrio, porFonte, intra, mde, saude] = await Promise.all([
    verificarEquilibrio(leitor, p.exercicio),
    verificarPorFonte(leitor, p.exercicio),
    verificarIntra(leitor, p.exercicio),
    verificarPisoPorFuncao(leitor, p.exercicio, {
      chave: "LOA_MDE_25",
      titulo: "LOA — Educação (MDE) ≥ 25% da receita de impostos e transferências prevista (CF art. 212)",
      funcao: FUNCAO_EDUCACAO,
      percentual: "25",
      fonte: FONTE_ANEXO8.fonte,
      href: FONTE_ANEXO8.href,
      interruptor:
        "MDE-BASE-SEM-DEPARA: o de-para de base de impostos não está semeado — sem ele não há base " +
        "prevista para projetar os 25%. Nunca se projeta sobre base que não existe. Semeie o de-para.",
    }),
    verificarPisoPorFuncao(leitor, p.exercicio, {
      chave: "LOA_SAUDE_15",
      titulo: "LOA — Saúde (ASPS) ≥ 15% da receita de impostos e transferências prevista (LC 141)",
      funcao: FUNCAO_SAUDE,
      percentual: "15",
      fonte: FONTE_ANEXO12.fonte,
      href: FONTE_ANEXO12.href,
      interruptor:
        "SAUDE-BASE-SEM-DEPARA: o de-para de base de impostos não está semeado — sem ele não há base " +
        "prevista para projetar os 15%. Semeie o de-para.",
    }),
  ]);

  const base = (chave: string, titulo: string, fonte: string, href: string): BaseVerificacao => ({
    chave,
    titulo,
    escopo: "PLANEJAMENTO",
    fonte,
    fonteHref: href,
  });

  // ⚠️ Os interruptores nomeados — o que ficou fora, e por quê (o achado do Passo 0).
  const fundebVaat = semDado(
    base("LOA_FUNDEB_VAAT", "LOA — FUNDEB 70% profissionais e VAAT 50%/15% (projetado)", FONTE_ANEXO8.fonte, FONTE_ANEXO8.href),
    "FUNDEB-VAAT-SEM-CLASSE-DE-FONTE: o 70% dos profissionais e o VAAT dependem da CLASSE DE FONTE " +
      "(FUNDEB × VAAT) da despesa prevista, e a previsão não distingue essa classe (o de-para de " +
      "classe de fonte é de execução). Sem a classe na LOA, não se projeta — SEM_DADO nomeado."
  );

  const pessoalRcl = semDado(
    base("LOA_PESSOAL_RCL", "LOA — Despesa de pessoal × RCL projetada (informativa)", FONTE_RREO3.fonte, FONTE_RREO3.href),
    "RCL-PROJETADA-SEM-MOTOR: a RCL da LOA é ESTIMATIVA e o motor de RCL é 12-meses REALIZADO (welded " +
      "à execução) — uma RCL projetada precisa de outra computação. Verificação INFORMATIVA (não " +
      "guard): entra quando houver um motor de RCL projetada. Ver o MODULO."
  );

  return [equilibrio, porFonte, intra, mde, saude, fundebVaat, pessoalRcl];
}
