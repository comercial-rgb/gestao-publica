import {
  serializar,
  toMoney,
  type Dinheiro,
  type Money,
} from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// A apuração é do M01 — uma aritmética, muitos recortes. A DVP usa a JANELA
// (movimento no período); o Balanço usa o CORTE (saldo numa data).
import { movimentosPorConta } from "../m01-core-contabil/adapter-prisma.js";
import { balancoPatrimonial } from "./balanco-patrimonial.js";

/**
 * ANEXO 15 — DEMONSTRAÇÃO DAS VARIAÇÕES PATRIMONIAIS (art. 104 da Lei 4.320/64).
 * LEITURA PURA: zero escrita, zero cache, Decimal como string.
 *
 * ═══ A DVP É UM FILME; O BALANÇO É UMA FOTO ═══
 * O Anexo 14 responde "quanto o ente TEM" (saldo num corte). Este responde "o que
 * ACONTECEU" entre dois cortes (movimento no período). Por isso o parâmetro aqui é
 * uma JANELA `{inicio, fim}`, e não um corte único — e por isso a função do M01 é
 * `movimentosPorConta`, e não `saldosPorConta`.
 *
 * ═══ O MAPEAMENTO É A MESMA TABELA DO ANEXO 14 ═══
 * `LinhaDemonstrativo` + `PrefixoDaLinha`, com `anexo = ANEXO_15` e os grupos
 * VPA/VPD. O relatório não sabe que "Impostos, Taxas e Contribuições de Melhoria"
 * é a 4.1 — isso é INSERT, não código.
 */

export interface LinhaDaDvp {
  readonly codigoLinha: string;
  readonly rotulo: string;
  readonly valor: Dinheiro;
  readonly contas: readonly { readonly codigo: string; readonly valor: Dinheiro }[];
}

export interface QuadroDaDvp {
  readonly grupo: "VPA" | "VPD";
  readonly linhas: readonly LinhaDaDvp[];
  readonly total: Dinheiro;
}

export interface DemonstracaoVariacoesPatrimoniais {
  readonly relatorio: "ANEXO 15 — DEMONSTRAÇÃO DAS VARIAÇÕES PATRIMONIAIS";
  readonly periodo: { readonly inicio: Date; readonly fim: Date };
  readonly quadros: readonly QuadroDaDvp[];
  readonly totalVPA: Dinheiro;
  readonly totalVPD: Dinheiro;
  /** VPA − VPD. É o superávit/déficit patrimonial do período. */
  readonly resultadoPatrimonial: Dinheiro;
}

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

export async function demonstracaoVariacoesPatrimoniais(
  prisma: PrismaClient,
  inicio: Date,
  fim: Date
): Promise<DemonstracaoVariacoesPatrimoniais> {
  if (fim < inicio) {
    throw new Error(
      `Período invertido: início ${inicio.toISOString()} depois do fim ` +
        `${fim.toISOString()}.`
    );
  }

  const linhas = await prisma.linhaDemonstrativo.findMany({
    where: { anexo: "ANEXO_15", ativa: true },
    orderBy: [{ grupo: "asc" }, { ordem: "asc" }],
    select: {
      codigoLinha: true,
      rotulo: true,
      grupo: true,
      prefixos: { select: { prefixoConta: true } },
    },
  });

  // O MOVIMENTO (não o saldo) das contas de resultado, no período. Corte pela data
  // do FATO, início e fim INCLUSIVOS.
  //
  // ⚠️ O ENCERRAMENTO FICA DE FORA. O lançamento de apuração (M08) não é um fato
  // novo: ele TRANSFERE o resultado das classes 3/4 para o PL. Contá-lo aqui faria
  // a DVP registrar a mesma receita duas vezes — uma quando ela aconteceu, outra
  // quando ela foi transferida —, e o resultado do período viraria ZERO (a
  // transferência anula exatamente o que se quer demonstrar).
  const movimentos = await movimentosPorConta(prisma, {
    classes: ["3", "4"],
    inicio,
    fim,
    campoData: "dataTransacao",
    natureza: { excluir: ["ENCERRAMENTO"] },
  });

  const acumulado = new Map<
    string,
    { valor: Money; contas: { codigo: string; valor: Dinheiro }[] }
  >();
  for (const l of linhas) {
    acumulado.set(l.codigoLinha, { valor: zero(), contas: [] });
  }

  // O CAMINHO INDEPENDENTE do resultado: soma conta a conta, sem passar pelas
  // linhas. É ele que o D1 confronta com o total das linhas.
  let resultadoPorConta = zero();

  for (const conta of movimentos) {
    // Conta sem movimento no período não é órfã: ela não leva nada para lugar
    // nenhum.
    if (conta.saldo.isZero()) continue;

    // Classe 4 (VPA) SOMA ao resultado; classe 3 (VPD) SUBTRAI. Os dois já vêm
    // POSITIVOS (cada um com a natureza da sua classe, via CLASSE_PCASP).
    resultadoPorConta = conta.codigo.startsWith("4")
      ? soma(resultadoPorConta, conta.saldo)
      : sub(resultadoPorConta, conta.saldo);

    const casadas = linhas.filter((l) =>
      l.prefixos.some((p) => conta.codigo.startsWith(p.prefixoConta))
    );

    // ═══ D2 — CONTA ÓRFÃ ═══
    if (casadas.length === 0) {
      throw new Error(
        `CONTA ÓRFÃ na DVP: a conta ${conta.codigo} teve movimento de ` +
          `${serializar(conta.saldo)} no período e NÃO casa com nenhuma linha do ` +
          `Anexo 15. Uma DVP que fecha OMITINDO uma variação patrimonial parece ` +
          `certa e não é. Mapeie a conta antes de emitir o anexo.`
      );
    }
    if (casadas.length > 1) {
      throw new Error(
        `CONTA EM DUAS LINHAS na DVP: a conta ${conta.codigo} casa com ` +
          `${casadas.map((c) => c.codigoLinha).join(", ")}. A mesma variação ` +
          `entraria duas vezes.`
      );
    }

    const alvo = acumulado.get(casadas[0]!.codigoLinha)!;
    alvo.valor = soma(alvo.valor, conta.saldo);
    alvo.contas.push({ codigo: conta.codigo, valor: serializar(conta.saldo) });
  }

  const quadros: QuadroDaDvp[] = [];
  let totalVPA = zero();
  let totalVPD = zero();

  for (const grupo of ["VPA", "VPD"] as const) {
    const daqui = linhas.filter((l) => l.grupo === grupo);
    const linhasDoGrupo: LinhaDaDvp[] = daqui.map((l) => {
      const acc = acumulado.get(l.codigoLinha)!;
      return {
        codigoLinha: l.codigoLinha,
        rotulo: l.rotulo,
        valor: serializar(acc.valor),
        contas: acc.contas,
      };
    });

    const totalDoGrupo = linhasDoGrupo.reduce(
      (acc, l) => soma(acc, toMoney(l.valor)),
      zero()
    );

    quadros.push({ grupo, linhas: linhasDoGrupo, total: serializar(totalDoGrupo) });

    if (grupo === "VPA") totalVPA = totalDoGrupo;
    else totalVPD = totalDoGrupo;
  }

  const resultadoPatrimonial = sub(totalVPA, totalVPD);

  // ═══ D1 — AS LINHAS SOMAM O QUE AS CONTAS SOMAM ═══
  // Dois caminhos: um passa pelas LINHAS (agrupadas por prefixo), o outro vai
  // CONTA A CONTA. Se uma linha cair fora de um total, eles divergem.
  if (!resultadoPatrimonial.equals(resultadoPorConta)) {
    throw new Error(
      `DVP NÃO FECHA: o resultado pelas LINHAS ` +
        `(VPA ${serializar(totalVPA)} − VPD ${serializar(totalVPD)} = ` +
        `${serializar(resultadoPatrimonial)}) diverge do resultado apurado CONTA A ` +
        `CONTA (${serializar(resultadoPorConta)}). Diferença: ` +
        `${serializar(sub(resultadoPatrimonial, resultadoPorConta))}. Alguma linha ` +
        `ficou fora de um total.`
    );
  }

  // ═══ D3 — A AMARRAÇÃO CRUZADA COM O BALANÇO PATRIMONIAL ═══
  //
  // ⚠️ NÃO REMOVER "POR REDUNDÂNCIA". Ela NÃO é redundante com o D2:
  //  · o D2 olha as contas MAPEADAS pelo Anexo 15;
  //  · o D3 confronta com o resultado do Balanço, que soma as classes 3 e 4
  //    INTEIRAS — mapeadas ou não.
  // Uma conta de VPA sem prefixo entra no resultado do Balanço e NÃO entra na DVP:
  // o D3 pega isso mesmo que alguém desligue o D2.
  //
  // ═══ A ÁLGEBRA (depois que a APURAÇÃO DO RESULTADO entrou — M08) ═══
  // Seja S(t) a linha sintética do Balanço no corte t (VPA − VPD acumulado,
  // INCLUINDO os lançamentos de encerramento), e Normal(t) o acumulado só dos
  // lançamentos normais. O encerramento debita as VPA e credita as VPD, reduzindo
  // S exatamente pelo montante transferido ao PL. Logo:
  //
  //     S(t)  =  Normal(t) − Apurado(t)
  //     DVP   =  Normal(fim) − Normal(véspera do início)          [a DVP exclui o
  //                                                                encerramento]
  //  ⟹  DVP  =  [ S(fim) − S(véspera) ]  +  ΔApurado(período)
  //
  // Sem apuração no período, ΔApurado = 0 e isto VIRA a identidade antiga — por
  // isso os anexos anteriores seguem fechando sem mudar uma linha.
  const antesDoInicio = new Date(inicio.getTime() - 1);
  const [bpFim, bpAntes, apurado] = await Promise.all([
    balancoPatrimonial(prisma, fim),
    balancoPatrimonial(prisma, antesDoInicio),
    apuradoNoPeriodo(prisma, inicio, fim),
  ]);

  const deltaSintetica = sub(
    toMoney(bpFim.resultadoDoExercicio),
    toMoney(bpAntes.resultadoDoExercicio)
  );
  const resultadoPeloBalanco = soma(deltaSintetica, apurado);

  if (!resultadoPatrimonial.equals(resultadoPeloBalanco)) {
    throw new Error(
      `DVP NÃO FECHA CONTRA O BALANÇO: o resultado do período pela DVP é ` +
        `${serializar(resultadoPatrimonial)}, mas pelo Balanço é ` +
        `${serializar(resultadoPeloBalanco)} = Δ da linha sintética ` +
        `(${bpFim.resultadoDoExercicio} − ${bpAntes.resultadoDoExercicio} = ` +
        `${serializar(deltaSintetica)}) + apurado no período ` +
        `(${serializar(apurado)}). Diferença: ` +
        `${serializar(sub(resultadoPatrimonial, resultadoPeloBalanco))}. ` +
        `Provavelmente há conta de VPA/VPD com movimento fora do mapeamento do ` +
        `Anexo 15 — ela entra no Balanço e não entra na DVP.`
    );
  }

  return {
    relatorio: "ANEXO 15 — DEMONSTRAÇÃO DAS VARIAÇÕES PATRIMONIAIS",
    periodo: { inicio, fim },
    quadros,
    totalVPA: serializar(totalVPA),
    totalVPD: serializar(totalVPD),
    resultadoPatrimonial: serializar(resultadoPatrimonial),
  };
}

/**
 * O MONTANTE TRANSFERIDO AO PL pelos lançamentos de ENCERRAMENTO no período.
 *
 * O encerramento reduz a sintética: ele debita as VPA (movimento com natureza
 * −valor) e credita as VPD (idem). Então o efeito dele sobre `VPA − VPD` é
 * NEGATIVO, e o "apurado" (o que FOI para o PL) é o OPOSTO desse efeito.
 *
 * O sinal sai do `CLASSE_PCASP` (via `movimentosPorConta`), não de um `if` escrito
 * à mão aqui — e é positivo no superávit, negativo no déficit.
 */
export async function apuradoNoPeriodo(
  prisma: PrismaClient,
  inicio: Date,
  fim: Date
): Promise<Money> {
  const doEncerramento = await movimentosPorConta(prisma, {
    classes: ["3", "4"],
    inicio,
    fim,
    campoData: "dataTransacao",
    natureza: { apenas: ["ENCERRAMENTO"] },
  });

  let efeitoNaSintetica = zero();
  for (const c of doEncerramento) {
    efeitoNaSintetica = c.codigo.startsWith("4")
      ? soma(efeitoNaSintetica, c.saldo)
      : sub(efeitoNaSintetica, c.saldo);
  }
  // O apurado é o OPOSTO do efeito na sintética.
  return toMoney(efeitoNaSintetica.negated());
}
