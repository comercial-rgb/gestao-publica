import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { arrecadadoPorNaturezaFonte } from "../m04-receita/consultas.js";
import { tipoDaNatureza } from "../m04-receita/natureza.js";

/**
 * MOTOR COMPARTILHADO — BASE DE IMPOSTOS E TRANSFERÊNCIAS (a "receita resultante de impostos").
 * CF art. 198 (ASPS) · art. 212 (MDE) · LC 141/2012.
 *
 * ═══ POR QUE UM MOTOR SÓ, E TRÊS CONSUMIDORES ═══
 * A mesma base — impostos próprios + transferências constitucionais, decomposta por TIPO (principal,
 * multas, dívida ativa, multas da DA) — alimenta o RREO Anexo 12 (ASPS, 15%), o Anexo 8 (MDE, 25%) e
 * a apuração do FUNDEB (TR 4.17). Escrever a base dentro de UM relatório obrigaria os outros a
 * importá-lo (ciclo) ou a recalcular (segunda verdade que divergiria no primeiro imposto novo).
 *
 * ═══ O DÍGITO É O DONO DO TIPO; O DE-PARA, DA IDENTIDADE ═══
 * O 8º dígito da natureza diz o TIPO (`tipoDaNatureza`, do M04) — o motor o lê do dígito, NUNCA de
 * uma coluna. O `DeParaBaseImpostoAsps` diz só a IDENTIDADE (isto é IPTU, isto é Cota-Parte do FPM).
 * As quatro sub-linhas de cada imposto (tipos 1-4) partilham a mesma chave e se separam pelo dígito.
 *
 * ═══ BRUTO × LÍQUIDO — E A DEDUÇÃO DO FUNDEB ═══
 * A base ASPS usa o valor BRUTO das transferências: a dedução do FUNDEB NÃO abate a base do art. 198
 * (instrução STN). Mas o domínio não tem "dedução" — ela é uma NATUREZA REDUTORA (chave DED_FUNDEB
 * no de-para). Então o motor a EXCLUI do bruto e a subtrai só no LÍQUIDO (que serve a outros
 * consumidores). `baseBruta` (o que o Anexo 12 usa) ≠ `baseLiquida` exatamente pela dedução.
 *
 * ═══ IBS — PARÂMETRO, NUNCA HARDCODE DE ANO ═══
 * Em 2026 o IBS é arrecadação-teste sem repartição (art. 125 §3º ADCT): fora da base. Mas isso é uma
 * REGRA DE TRANSIÇÃO, não uma verdade eterna — por isso `incluirIBS` é parâmetro do chamador, e o
 * motor não sabe que ano é hoje.
 *
 * Leitura pura: a receita vem de `arrecadadoPorNaturezaFonte` (M04), já líquida de anulações e
 * cortada pela data do fato. Zero escrita, zero SUM bruto.
 */

// ═══════════════════════════════════════════════════════════════════════════
// A ESTRUTURA DAS CHAVES — norma fixa (Tabela 12.2), mora no código
// ═══════════════════════════════════════════════════════════════════════════

export const CHAVE_DED_FUNDEB = "DED_FUNDEB";

/** grupo + rótulo + ordem de cada chave conhecida. IBS entra marcado para o filtro de transição. */
export interface ClasseDaChave {
  readonly grupo: "imposto" | "transferencia";
  readonly rotulo: string;
  readonly ordem: number;
  /** IBS: fora da base enquanto `incluirIBS` for false (art. 125 §3º ADCT). */
  readonly ehIBS?: boolean;
}

const CLASSE_DA_CHAVE: Record<string, ClasseDaChave> = {
  // (I) impostos municipais
  IPTU: { grupo: "imposto", rotulo: "IPTU", ordem: 1 },
  ITBI: { grupo: "imposto", rotulo: "ITBI", ordem: 2 },
  ISS: { grupo: "imposto", rotulo: "ISS", ordem: 3 },
  IRRF: { grupo: "imposto", rotulo: "IRRF", ordem: 4 },
  // (II) transferências constitucionais e legais
  FPM: { grupo: "transferencia", rotulo: "Cota-Parte do FPM", ordem: 1 },
  // ⚠️ FPM_COMPLEMENTACAO: a parcela de 1% (dez/jul/set) que fica FORA da base do FUNDEB. É uma
  // chave própria porque o Anexo 8 a separa (2.1.2) — sem natureza mapeada, a linha nasce zerada.
  FPM_COMPLEMENTACAO: { grupo: "transferencia", rotulo: "Cota-Parte do FPM — Complementações 1%", ordem: 2 },
  ITR: { grupo: "transferencia", rotulo: "Cota-Parte do ITR", ordem: 3 },
  IPVA: { grupo: "transferencia", rotulo: "Cota-Parte do IPVA", ordem: 4 },
  ICMS: { grupo: "transferencia", rotulo: "Cota-Parte do ICMS", ordem: 5 },
  // IPI-Exportação (LC 61/1989) — transferência DISTINTA das compensações (LC 87). O Anexo 8 a
  // lista em 2.3; entra na base do FUNDEB.
  IPI_EXPORTACAO: { grupo: "transferencia", rotulo: "Cota-Parte do IPI-Exportação", ordem: 6 },
  IOF_OURO: { grupo: "transferencia", rotulo: "Cota-Parte do IOF-Ouro", ordem: 7 },
  COMPENSACOES: {
    grupo: "transferencia",
    rotulo: "Compensações Financeiras (inclui desoneração LC 87/1996)",
    ordem: 8,
  },
  IBS: { grupo: "transferencia", rotulo: "Cota-Parte do IBS", ordem: 9, ehIBS: true },
};

// ═══════════════════════════════════════════════════════════════════════════
// OS TIPOS DE SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaBaseImposto {
  readonly chave: string;
  readonly rotulo: string;
  readonly grupo: "imposto" | "transferencia";
  /** tipo 1 — o imposto/transferência em si. */
  readonly principal: string;
  /** tipo 2 — multas, juros de mora e outros encargos. */
  readonly multas: string;
  /** tipo 3 — dívida ativa. */
  readonly dividaAtiva: string;
  /** tipo 4 — multas e juros de mora da dívida ativa. */
  readonly multasDividaAtiva: string;
  /** principal + multas + dívida ativa + multas da DA — o total da identidade. */
  readonly total: string;
}

export interface BaseImpostos {
  readonly exercicio: number;
  readonly impostos: readonly LinhaBaseImposto[]; // (I)
  readonly transferencias: readonly LinhaBaseImposto[]; // (II)
  /** A dedução do FUNDEB (magnitude) — a diferença entre bruto e líquido das transferências. */
  readonly deducaoFundeb: string;
  readonly totalImpostos: string; // (I)
  /** (II) BRUTO — a base do art. 198 (o Anexo 12 usa este). */
  readonly totalTransferenciasBruto: string;
  /** (II) − dedução do FUNDEB. */
  readonly totalTransferenciasLiquido: string;
  /** (III) = (I) + (II) BRUTO. */
  readonly baseBruta: string;
  readonly baseLiquida: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** A estrutura (grupo/rótulo/ordem/IBS) de uma chave — norma fixa. `undefined` = chave desconhecida. */
export function estruturaDaChave(chave: string): ClasseDaChave | undefined {
  return CLASSE_DA_CHAVE[chave];
}

/** Lê o de-para natureza → chave. Fonte única para o motor E para a previsão do Anexo 12. */
export async function lerDeParaBaseImpostos(leitor: Tx): Promise<ReadonlyMap<string, string>> {
  const dePara = new Map<string, string>();
  for (const d of await leitor.deParaBaseImpostoAsps.findMany({ select: { naturezaCodigo: true, chave: true } })) {
    dePara.set(d.naturezaCodigo, d.chave);
  }
  return dePara;
}

/** Um acumulador dos 4 tipos, por chave. */
interface AccTipos {
  principal: Money;
  multas: Money;
  dividaAtiva: Money;
  multasDividaAtiva: Money;
}
const accZero = (): AccTipos => ({ principal: zero(), multas: zero(), dividaAtiva: zero(), multasDividaAtiva: zero() });

// ═══════════════════════════════════════════════════════════════════════════
// O MOTOR
// ═══════════════════════════════════════════════════════════════════════════

export async function baseDeImpostos(
  leitor: Tx,
  p: {
    readonly exercicio: number;
    readonly ate: Date;
    /** Início da janela (data do fato), inclusivo. Omitido = desde sempre. */
    readonly desde?: Date;
    /** Incluir o IBS na base? Default FALSE (regra de transição 2026, art. 125 §3º ADCT). */
    readonly incluirIBS?: boolean;
  }
): Promise<BaseImpostos> {
  const incluirIBS = p.incluirIBS ?? false;

  // ── o de-para natureza → chave (fonte única, partilhada com a previsão do Anexo 12) ──
  const dePara = await lerDeParaBaseImpostos(leitor);

  // ── arrecadação líquida por natureza (M04), na janela ──
  const arrec = await arrecadadoPorNaturezaFonte(leitor, {
    ate: p.ate,
    ...(p.desde !== undefined ? { desde: p.desde } : {}),
  });

  const porChave = new Map<string, AccTipos>();
  let deducaoFundeb = zero();

  for (const a of arrec) {
    const chave = dePara.get(a.naturezaCodigo);
    if (chave === undefined) continue; // natureza fora da base de impostos: ignorada aqui

    if (chave === CHAVE_DED_FUNDEB) {
      // a redutora: acumula à parte. NÃO entra no bruto; abate só o líquido.
      deducaoFundeb = soma(deducaoFundeb, a.arrecadado);
      continue;
    }

    const acc = porChave.get(chave) ?? accZero();
    // o TIPO vem do DÍGITO (8º), nunca do de-para.
    switch (tipoDaNatureza(a.naturezaCodigo)) {
      case "PRINCIPAL":
        acc.principal = soma(acc.principal, a.arrecadado);
        break;
      case "MULTAS_E_JUROS_DE_MORA":
        acc.multas = soma(acc.multas, a.arrecadado);
        break;
      case "DIVIDA_ATIVA":
        acc.dividaAtiva = soma(acc.dividaAtiva, a.arrecadado);
        break;
      case "MULTAS_E_JUROS_DE_MORA_DA_DIVIDA_ATIVA":
        acc.multasDividaAtiva = soma(acc.multasDividaAtiva, a.arrecadado);
        break;
      case "NAO_VALORIZAVEL_AGREGADORA":
        // agregadora (tipo 0) não valoriza — nunca deveria ter arrecadação; ignora.
        break;
    }
    porChave.set(chave, acc);
  }

  // ── monta as linhas, respeitando a estrutura (grupo/rótulo/ordem) e o filtro do IBS ──
  const impostos: LinhaBaseImposto[] = [];
  const transferencias: LinhaBaseImposto[] = [];

  for (const [chave, acc] of porChave) {
    const classe = CLASSE_DA_CHAVE[chave];
    if (classe === undefined) {
      throw new Error(
        `Base de impostos: a chave "${chave}" (do de-para) não tem estrutura conhecida (grupo/` +
          `rótulo). Toda chave mapeada precisa existir na Tabela 12.2 — adicione-a ao motor ` +
          `(CLASSE_DA_CHAVE) por decisão, não por acaso.`
      );
    }
    if (classe.ehIBS === true && !incluirIBS) continue; // transição: IBS fora da base

    const linha = finalizarLinha(chave, classe, acc);
    (classe.grupo === "imposto" ? impostos : transferencias).push(linha);
  }

  impostos.sort((a, b) => CLASSE_DA_CHAVE[a.chave]!.ordem - CLASSE_DA_CHAVE[b.chave]!.ordem);
  transferencias.sort((a, b) => CLASSE_DA_CHAVE[a.chave]!.ordem - CLASSE_DA_CHAVE[b.chave]!.ordem);

  const totalImpostos = impostos.reduce((s, l) => soma(s, toMoney(l.total)), zero());
  const totalTransfBruto = transferencias.reduce((s, l) => soma(s, toMoney(l.total)), zero());
  const totalTransfLiquido = toMoney(totalTransfBruto.minus(deducaoFundeb));

  return {
    exercicio: p.exercicio,
    impostos,
    transferencias,
    deducaoFundeb: deducaoFundeb.toFixed(2),
    totalImpostos: totalImpostos.toFixed(2),
    totalTransferenciasBruto: totalTransfBruto.toFixed(2),
    totalTransferenciasLiquido: totalTransfLiquido.toFixed(2),
    baseBruta: soma(totalImpostos, totalTransfBruto).toFixed(2),
    baseLiquida: soma(totalImpostos, totalTransfLiquido).toFixed(2),
  };
}

function finalizarLinha(chave: string, classe: ClasseDaChave, acc: AccTipos): LinhaBaseImposto {
  const total = soma(soma(acc.principal, acc.multas), soma(acc.dividaAtiva, acc.multasDividaAtiva));
  return {
    chave,
    rotulo: classe.rotulo,
    grupo: classe.grupo,
    principal: acc.principal.toFixed(2),
    multas: acc.multas.toFixed(2),
    dividaAtiva: acc.dividaAtiva.toFixed(2),
    multasDividaAtiva: acc.multasDividaAtiva.toFixed(2),
    total: total.toFixed(2),
  };
}
