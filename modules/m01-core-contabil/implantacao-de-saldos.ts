import { createHash } from "node:crypto";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { anoCivil, meioDiaCivil } from "../../packages/datas/index.js";
import { subsistemaDaConta } from "../../packages/ledger/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { criarM01Deps } from "./adapter-prisma.js";
import { registrarLancamento } from "./servico.js";

/**
 * M01 — A IMPLANTAÇÃO DOS SALDOS INICIAIS (V32).
 *
 * ═══ O QUE FALTAVA ═══
 * Um município que troca de sistema chega com o balancete do sistema anterior. Até aqui o único caminho
 * era o lançamento manual, uma partida por vez: centenas de contas, sem conferência de total, sem marca de
 * origem e sem proteção contra carregar duas vezes.
 *
 * ═══ O QUE ISTO FAZ ═══
 * Lê o balancete (conta;devedor;credor), confere cada conta no plano (existe, é analítica), soma por
 * subsistema e só grava se cada um fechar (devedor = credor) — a mesma conferência de todo lançamento,
 * feita pelo motor do M01. Grava UM lançamento de abertura, com origem própria e a marca do arquivo.
 *
 * ⚠️ NENHUMA CONTRAPARTIDA INVENTADA. O balancete de encerramento do sistema anterior já fecha por
 * definição; se não fechar, a recusa diz quanto falta em cada subsistema. Não existe "conta de ajuste" que
 * absorva a diferença.
 *
 * ⚠️ UMA IMPLANTAÇÃO POR EXERCÍCIO. O mesmo arquivo de novo devolve o mesmo lançamento (idempotente pela
 * marca); um arquivo diferente para um exercício já implantado é recusado — corrigir é estornar o lançamento
 * de implantação (Contabilidade > Lançamentos) e implantar de novo.
 */

export const ORIGEM_IMPLANTACAO = "IMPLANTACAO_DE_SALDOS";

export interface LinhaDoBalancete {
  readonly linha: number;
  readonly conta: string;
  readonly devedor: Money;
  readonly credor: Money;
}

export interface LeituraDoBalancete {
  readonly linhas: readonly LinhaDoBalancete[];
  readonly problemas: readonly string[];
}

/** "1.234,56" → 1234.56; "1234.56" → 1234.56; "" → 0. Recusa o que não for número. */
function valorDoBalancete(bruto: string): Money | null {
  const t = bruto.trim().replace(/^R\$\s*/, "");
  if (t === "") return toMoney("0.00");
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return toMoney(normal);
}

/**
 * LÊ o balancete colado ou carregado: uma conta por linha, separada por ponto e vírgula. Uma primeira linha
 * de cabeçalho (sem dígito no começo) é ignorada; linha em branco também. Puro.
 */
export function lerBalancete(texto: string): LeituraDoBalancete {
  const linhas: LinhaDoBalancete[] = [];
  const problemas: string[] = [];
  const vistas = new Map<string, number>();
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const n = i + 1;
    const l = bruta.trim();
    if (l === "") return;
    const campos = l.split(";").map((c) => c.trim());
    if (i === 0 && !/^\d/.test(campos[0] ?? "")) return;
    if (campos.length !== 3) {
      problemas.push(`Linha ${String(n)}: esperava conta;devedor;credor e vieram ${String(campos.length)} campo(s).`);
      return;
    }
    const [conta, d, c] = campos as [string, string, string];
    const devedor = valorDoBalancete(d);
    const credor = valorDoBalancete(c);
    if (devedor === null || credor === null) {
      problemas.push(`Linha ${String(n)} (${conta}): valor que não é número.`);
      return;
    }
    if (devedor.greaterThan(0) && credor.greaterThan(0)) {
      problemas.push(`Linha ${String(n)} (${conta}): saldo devedor e credor ao mesmo tempo; informe o saldo líquido num só lado.`);
      return;
    }
    if (devedor.isZero() && credor.isZero()) return;
    const anterior = vistas.get(conta);
    if (anterior !== undefined) {
      problemas.push(`Linha ${String(n)} (${conta}): a conta já apareceu na linha ${String(anterior)}.`);
      return;
    }
    vistas.set(conta, n);
    linhas.push({ linha: n, conta, devedor, credor });
  });
  if (linhas.length === 0 && problemas.length === 0) problemas.push("Nenhuma conta com saldo no balancete.");
  return { linhas, problemas };
}

export interface TotalDoSubsistema {
  readonly subsistema: "PATRIMONIAL" | "ORCAMENTARIO" | "CONTROLE";
  readonly devedor: string;
  readonly credor: string;
  readonly diferenca: string;
}

export interface PreviaDaImplantacao {
  readonly contas: number;
  readonly totais: readonly TotalDoSubsistema[];
  readonly problemas: readonly string[];
  readonly marca: string;
  readonly podeImplantar: boolean;
}

/** A PRÉVIA: lê, confere cada conta no plano e soma por subsistema. Não grava nada. */
export async function previaDaImplantacao(prisma: PrismaClient, texto: string): Promise<PreviaDaImplantacao> {
  const lido = lerBalancete(texto);
  const problemas = [...lido.problemas];
  const codigos = lido.linhas.map((l) => l.conta);
  const contas = await prisma.contaPcasp.findMany({ where: { codigo: { in: codigos } }, select: { codigo: true, analitica: true } });
  const porCodigo = new Map(contas.map((c) => [c.codigo, c]));
  const somas = new Map<string, { d: Money; c: Money }>();
  for (const l of lido.linhas) {
    const conta = porCodigo.get(l.conta);
    if (conta === undefined) {
      problemas.push(`Linha ${String(l.linha)}: a conta ${l.conta} não está no plano de contas carregado.`);
      continue;
    }
    if (!conta.analitica) {
      problemas.push(`Linha ${String(l.linha)}: a conta ${l.conta} é sintética; o saldo se implanta nas analíticas dela.`);
      continue;
    }
    let sub: string;
    try {
      sub = subsistemaDaConta(l.conta);
    } catch {
      problemas.push(`Linha ${String(l.linha)}: a conta ${l.conta} não tem classe reconhecida.`);
      continue;
    }
    const s = somas.get(sub) ?? { d: toMoney("0.00"), c: toMoney("0.00") };
    somas.set(sub, { d: toMoney(s.d.plus(l.devedor)), c: toMoney(s.c.plus(l.credor)) });
  }
  const totais: TotalDoSubsistema[] = (["PATRIMONIAL", "ORCAMENTARIO", "CONTROLE"] as const)
    .filter((s) => somas.has(s))
    .map((s) => {
      const v = somas.get(s)!;
      return { subsistema: s, devedor: v.d.toFixed(2), credor: v.c.toFixed(2), diferenca: toMoney(v.d.minus(v.c)).toFixed(2) };
    });
  for (const t of totais) {
    if (t.diferenca !== "0.00") {
      problemas.push(`O subsistema ${t.subsistema.toLowerCase()} não fecha: devedor ${t.devedor}, credor ${t.credor}, diferença ${t.diferenca}.`);
    }
  }
  const marca = createHash("sha256").update(lido.linhas.map((l) => `${l.conta};${l.devedor.toFixed(2)};${l.credor.toFixed(2)}`).join("\n")).digest("hex");
  return { contas: lido.linhas.length, totais, problemas, marca, podeImplantar: problemas.length === 0 };
}

/**
 * IMPLANTA os saldos: um lançamento de abertura, na data informada (o primeiro dia em que o sistema passa
 * a escriturar). Recusa nomeando cada problema da prévia; nada é gravado.
 */
export async function implantarSaldosIniciais(
  prisma: PrismaClient,
  input: { readonly texto: string; readonly dia: string; readonly criadoPor: string }
): Promise<{ readonly lancamentoId: string; readonly repetido: boolean; readonly contas: number }> {
  await autorizarNo(prisma, input.criadoPor, ACAO_DO_SERVICO.implantarSaldosIniciais, "ENTE");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dia)) throw new Error("Informe a data da implantação (dia/mês/ano). Nada foi gravado.");
  const previa = await previaDaImplantacao(prisma, input.texto);
  if (!previa.podeImplantar) {
    throw new Error(`O balancete não pode ser implantado:\n${previa.problemas.map((p) => `  - ${p}`).join("\n")}\nNada foi gravado.`);
  }
  const data = meioDiaCivil(input.dia);
  const exercicio = anoCivil(data);
  const ja = await prisma.lancamentoContabil.findMany({
    where: { origemTipo: ORIGEM_IMPLANTACAO, estornoDeId: null, estornos: { none: {} } },
    select: { id: true, origemId: true, dataTransacao: true, numeroControle: true },
  });
  const doExercicio = ja.filter((l) => anoCivil(l.dataTransacao) === exercicio);
  const mesmo = doExercicio.find((l) => l.origemId === previa.marca);
  if (mesmo !== undefined) return { lancamentoId: mesmo.id, repetido: true, contas: previa.contas };
  if (doExercicio.length > 0) {
    throw new Error(
      `O exercício ${String(exercicio)} já tem saldos implantados (lançamento ${doExercicio[0]!.numeroControle}), de outro balancete. ` +
        `Para corrigir, estorne aquele lançamento em Contabilidade > Lançamentos e implante de novo. Nada foi gravado.`
    );
  }
  const lido = lerBalancete(input.texto);
  const partidas = lido.linhas.map((l) => ({
    conta: l.conta,
    tipo: l.devedor.greaterThan(0) ? ("DEBITO" as const) : ("CREDITO" as const),
    subsistema: subsistemaDaConta(l.conta),
    valor: (l.devedor.greaterThan(0) ? l.devedor : l.credor).toFixed(2),
  }));
  const lancamentoId = await registrarLancamento(
    {
      numeroControle: `IMPLANTACAO-${String(exercicio)}`,
      dataTransacao: data,
      historico: `Implantação dos saldos iniciais de ${String(exercicio)} — balancete do sistema anterior, ${String(previa.contas)} contas`,
      origemTipo: ORIGEM_IMPLANTACAO,
      origemId: previa.marca,
      criadoPor: input.criadoPor,
      partidas,
    },
    criarM01Deps(prisma)
  );
  return { lancamentoId, repetido: false, contas: previa.contas };
}
