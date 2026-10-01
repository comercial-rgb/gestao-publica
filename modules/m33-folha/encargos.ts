import { Decimal, toMoney, sumMoney, type Money } from "../../packages/contracts/index.js";
import { ELEGIVEL, naoAplicavel, preCondicao, type Elegibilidade } from "../../packages/contracts/index.js";
import { sha256Canonico, vigenteNaCompetencia } from "./dominio.js";
import type { SituacaoDaCertificacao } from "./certificacao.js";

/**
 * ═══ M33 — OS ENCARGOS DO EMPREGADOR SOBRE A FOLHA (V6.2 U1 — `PATRONAL-NA-MEMORIA`) — MOTOR PURO ═══
 *
 * O encargo patronal é obrigação do ENTE, não desconto do servidor. Ele não entra no contracheque,
 * não reduz o líquido, e não se confunde com a contribuição RETIDA do servidor — que já está no
 * bruto e viaja no pagamento. Este arquivo calcula, sobre o CÁLCULO FECHADO de uma competência, o
 * que o ente deve por componente, e devolve a memória canônica com o sha256 dela.
 *
 * ⚠️ NENHUM PERCENTUAL NACIONAL AQUI. Cada componente (previdência patronal, suplementar do RPPS,
 * risco ambiental do trabalho, outras entidades, FGTS…) é CADASTRADO pelo ente, por regime, com
 * versões vigentes por competência, alíquota, teto opcional, as rubricas que compõem a base e a
 * fundamentação — e só entra no cálculo depois de APROVADO por outra pessoa. Uma versão marcada
 * como SINTÉTICA é perfil de teste e a memória diz isso: ela não alega validade normativa.
 *
 * ⚠️ QUATRO SITUAÇÕES, e nenhuma se confunde com outra:
 *   · `NAO_APLICAVEL`    — o componente é de outro regime que o do vínculo NAQUELA competência;
 *   · `PARAMETRO_AUSENTE`— aplica-se, mas não há versão aprovada e única vigente: a apuração fica
 *                          INCOMPLETA e não se certifica nem se empenha. Ausência NÃO vira zero;
 *   · `CALCULADO`        — base × alíquota, arredondado ao centavo POR VÍNCULO (meio-par);
 *   · `ZERO_CALCULADO`   — aplica-se, há parâmetro, e a base incidente é zero. Zero calculado não
 *                          prova que não haja obrigação em outra competência — prova só esta.
 *
 * ⚠️ O REGIME É O DO CONTRACHEQUE, não o do cadastro de hoje: o vínculo que migrou para o RPPS em
 * julho continua RGPS na apuração de maio.
 */

export type TipoDeEncargo = "PREVIDENCIA_PATRONAL" | "PREVIDENCIA_SUPLEMENTAR" | "RISCO_AMBIENTAL_DO_TRABALHO" | "OUTRAS_ENTIDADES" | "FGTS" | "OUTRO";
export type RegimeDoEncargo = "RGPS" | "RPPS" | "ISENTO";
export type SituacaoDoEncargo = "NAO_APLICAVEL" | "PARAMETRO_AUSENTE" | "CALCULADO" | "ZERO_CALCULADO";

export interface ComponenteParaApurar {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly tipo: TipoDeEncargo;
  readonly regime: RegimeDoEncargo;
}

export interface VersaoParaApurar {
  readonly id: string;
  readonly componenteId: string;
  readonly competenciaInicio: string;
  readonly competenciaFim: string | null;
  readonly aliquota: Decimal;
  readonly teto: Money | null;
  readonly rubricasIncidentes: readonly string[];
  readonly fundamentacaoLegal: string;
  readonly sintetica: boolean;
  readonly aprovada: boolean;
  /** V24 — a alíquota é a do RAT e o cálculo a multiplica pelo FAP (Decreto 3.048/1999, art. 202-A). */
  readonly aplicaFap?: boolean;
}

/** V24 — o FAP aprovado de um CNPJ no ano da competência, ou o motivo de não haver. */
export type FapParaApurar = { readonly fator: Decimal; readonly fonte: string } | { readonly motivo: string };

/**
 * V25 — O ESTABELECIMENTO (CNPJ) DE UMA LOTAÇÃO NUMA COMPETÊNCIA. O FAP é por estabelecimento, e o ente
 * com fundo de CNPJ próprio tem mais de um. Sobe a árvore de lotações: vale o registro mais recente com
 * início até a competência na própria lotação; sem ele, o da lotação acima; sem nenhum na cadeia, o CNPJ
 * do ente (`null` se nem ele existe).
 */
export function estabelecimentoNaCompetencia(e: {
  readonly lotacaoId: string | null;
  readonly competencia: string;
  readonly lotacoes: readonly { readonly id: string; readonly paiId: string | null }[];
  readonly registros: readonly { readonly lotacaoId: string; readonly cnpj: string; readonly competenciaInicio: string }[];
  readonly cnpjDoEnte: string | null;
}): string | null {
  const pai = new Map(e.lotacoes.map((l) => [l.id, l.paiId]));
  const vistos = new Set<string>();
  let atual = e.lotacaoId;
  while (atual !== null && !vistos.has(atual)) {
    vistos.add(atual);
    const daLotacao = e.registros
      .filter((r) => r.lotacaoId === atual && r.competenciaInicio <= e.competencia)
      .sort((a, b) => (a.competenciaInicio < b.competenciaInicio ? 1 : -1))[0];
    if (daLotacao !== undefined) return daLotacao.cnpj;
    atual = pai.get(atual) ?? null;
  }
  return e.cnpjDoEnte;
}

export interface ContrachequeParaApurar {
  readonly vinculoId: string;
  readonly matricula: string;
  readonly regime: RegimeDoEncargo;
  readonly linhas: readonly { readonly rubricaId: string; readonly codigo: string; readonly tipo: "PROVENTO" | "DESCONTO"; readonly valor: Money }[];
  /** V25 — o CNPJ do estabelecimento do vínculo na competência (ver `estabelecimentoNaCompetencia`). */
  readonly estabelecimento?: string | null;
}

export interface ItemDaApuracao {
  readonly vinculoId: string;
  readonly matricula: string;
  readonly regime: RegimeDoEncargo;
  readonly componente: string;
  readonly situacao: SituacaoDoEncargo;
  readonly motivo?: string;
  readonly versaoId?: string;
  readonly aliquota?: string;
  readonly baseIncidente?: string;
  readonly teto?: string | null;
  readonly tetoAplicado?: boolean;
  readonly base?: string;
  readonly valor?: string;
  readonly rubricasNaBase?: readonly { readonly codigo: string; readonly valor: string }[];
  readonly fundamentacao?: string;
  readonly sintetica?: boolean;
  /** V24 — o FAP aplicado e a alíquota ajustada (RAT × FAP), quando a versão o aplica. */
  readonly fap?: string;
  /** V25 — o CNPJ do estabelecimento cujo FAP foi aplicado. */
  readonly estabelecimento?: string;
  readonly aliquotaAjustada?: string;
}

export interface ResumoDoComponente {
  readonly codigo: string;
  readonly descricao: string;
  readonly tipo: TipoDeEncargo;
  readonly regime: RegimeDoEncargo;
  readonly calculados: number;
  readonly zeros: number;
  readonly ausentes: number;
  readonly naoAplicaveis: number;
  readonly total: string;
}

export interface ApuracaoCalculada {
  readonly competencia: string;
  readonly itens: readonly ItemDaApuracao[];
  readonly porComponente: readonly ResumoDoComponente[];
  readonly total: Money;
  readonly completa: boolean;
  /** Vínculos × componentes aplicáveis — o universo esperado. */
  readonly esperados: number;
  readonly memoria: Record<string, unknown>;
  readonly sha256: string;
}

const m = (d: Decimal): string => d.toFixed(2);

/** A versão aprovada e ÚNICA vigente na competência — ou o motivo de não haver. */
export function versaoVigente(versoes: readonly VersaoParaApurar[], componenteId: string, competencia: string): { readonly versao: VersaoParaApurar } | { readonly motivo: string } {
  const doComponente = versoes.filter((v) => v.componenteId === componenteId && vigenteNaCompetencia(v, competencia));
  const aprovadas = doComponente.filter((v) => v.aprovada).sort((a, b) => (a.competenciaInicio < b.competenciaInicio ? 1 : a.competenciaInicio > b.competenciaInicio ? -1 : 0));
  const primeira = aprovadas[0];
  if (primeira === undefined) {
    return { motivo: doComponente.length > 0 ? `há versão vigente em ${competencia} ainda NÃO aprovada` : `nenhuma versão vigente em ${competencia}` };
  }
  if (aprovadas[1] !== undefined && aprovadas[1].competenciaInicio === primeira.competenciaInicio) {
    return { motivo: `há ${aprovadas.filter((v) => v.competenciaInicio === primeira.competenciaInicio).length} versões aprovadas começando em ${primeira.competenciaInicio} — ambíguo` };
  }
  return { versao: primeira };
}

export function apurarEncargos(e: {
  readonly competencia: string;
  readonly calculo: { readonly numero: number; readonly sha256: string };
  readonly contracheques: readonly ContrachequeParaApurar[];
  readonly componentes: readonly ComponenteParaApurar[];
  readonly versoes: readonly VersaoParaApurar[];
  /** V25 — o FAP de cada estabelecimento (CNPJ); exigido só quando alguma versão vigente aplica o FAP. */
  readonly faps?: Readonly<Record<string, FapParaApurar>>;
}): ApuracaoCalculada {
  const componentes = [...e.componentes].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const contracheques = [...e.contracheques].sort((a, b) => a.matricula.localeCompare(b.matricula));
  const itens: ItemDaApuracao[] = [];

  for (const c of contracheques) {
    for (const k of componentes) {
      const base = { vinculoId: c.vinculoId, matricula: c.matricula, regime: c.regime, componente: k.codigo };
      if (k.regime !== c.regime) {
        itens.push({ ...base, situacao: "NAO_APLICAVEL", motivo: `componente do regime ${k.regime}; o contracheque é ${c.regime}` });
        continue;
      }
      const v = versaoVigente(e.versoes, k.id, e.competencia);
      if ("motivo" in v) {
        itens.push({ ...base, situacao: "PARAMETRO_AUSENTE", motivo: v.motivo });
        continue;
      }
      const incidentes = new Set(v.versao.rubricasIncidentes);
      const naBase = c.linhas.filter((l) => l.tipo === "PROVENTO" && incidentes.has(l.rubricaId)).sort((a, b) => a.codigo.localeCompare(b.codigo));
      const baseIncidente = sumMoney(naBase.map((l) => l.valor));
      const tetoAplicado = v.versao.teto !== null && baseIncidente.gt(v.versao.teto);
      const baseFinal = tetoAplicado && v.versao.teto !== null ? v.versao.teto : baseIncidente;
      // V24 — RAT × FAP. Sem FAP aprovado, o item fica AUSENTE: a alíquota sem o fator não é a devida.
      let aliquotaEfetiva = v.versao.aliquota;
      let fapAplicado: { readonly fator: Decimal; readonly fonte: string } | null = null;
      let estabelecimento: string | null = null;
      if (v.versao.aplicaFap === true) {
        estabelecimento = c.estabelecimento ?? null;
        if (estabelecimento === null) {
          itens.push({ ...base, situacao: "PARAMETRO_AUSENTE", motivo: "FAP: o vínculo não tem estabelecimento (nem a lotação nem o ente têm CNPJ)" });
          continue;
        }
        const fap = e.faps?.[estabelecimento];
        if (fap === undefined || "motivo" in fap) {
          itens.push({ ...base, situacao: "PARAMETRO_AUSENTE", motivo: `FAP: ${fap === undefined ? `não informado para o CNPJ ${estabelecimento}` : fap.motivo}` });
          continue;
        }
        fapAplicado = fap;
        aliquotaEfetiva = v.versao.aliquota.times(fap.fator);
      }
      const valor = toMoney(baseFinal.times(aliquotaEfetiva));
      itens.push({
        ...base,
        situacao: valor.isZero() ? "ZERO_CALCULADO" : "CALCULADO",
        versaoId: v.versao.id,
        aliquota: v.versao.aliquota.toFixed(4),
        baseIncidente: m(baseIncidente),
        teto: v.versao.teto === null ? null : m(v.versao.teto),
        tetoAplicado,
        base: m(baseFinal),
        valor: m(valor),
        rubricasNaBase: naBase.map((l) => ({ codigo: l.codigo, valor: m(l.valor) })),
        fundamentacao: fapAplicado === null ? v.versao.fundamentacaoLegal : `${v.versao.fundamentacaoLegal}; FAP ${fapAplicado.fator.toFixed(4)} (${fapAplicado.fonte})`,
        sintetica: v.versao.sintetica,
        ...(fapAplicado === null || estabelecimento === null ? {} : { fap: fapAplicado.fator.toFixed(4), aliquotaAjustada: aliquotaEfetiva.toFixed(6), estabelecimento }),
      });
    }
  }

  const porComponente: ResumoDoComponente[] = componentes.map((k) => {
    const dele = itens.filter((i) => i.componente === k.codigo);
    return {
      codigo: k.codigo, descricao: k.descricao, tipo: k.tipo, regime: k.regime,
      calculados: dele.filter((i) => i.situacao === "CALCULADO").length,
      zeros: dele.filter((i) => i.situacao === "ZERO_CALCULADO").length,
      ausentes: dele.filter((i) => i.situacao === "PARAMETRO_AUSENTE").length,
      naoAplicaveis: dele.filter((i) => i.situacao === "NAO_APLICAVEL").length,
      total: m(sumMoney(dele.filter((i) => i.valor !== undefined).map((i) => new Decimal(i.valor as string)))),
    };
  });
  const total = sumMoney(porComponente.map((p) => new Decimal(p.total)));
  const completa = itens.every((i) => i.situacao !== "PARAMETRO_AUSENTE");
  const esperados = itens.filter((i) => i.situacao !== "NAO_APLICAVEL").length;
  const memoria: Record<string, unknown> = {
    competencia: e.competencia,
    calculo: e.calculo,
    componentes: componentes.map((k) => ({ codigo: k.codigo, descricao: k.descricao, tipo: k.tipo, regime: k.regime })),
    itens,
    porComponente,
    total: m(total),
    completa,
    esperados,
  };
  return { competencia: e.competencia, itens, porComponente, total, completa, esperados, memoria, sha256: sha256Canonico(memoria) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// A DIFERENÇA A EMPENHAR — o que já foi empenhado não se empenha de novo
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Por grupo de empenho: o total que a apuração vigente pede, menos o que as apurações anteriores DA
 * MESMA FOLHA já empenharam nesse grupo. Positivo = empenho complementar; zero = nada; negativo =
 * redução, que exige anulação parcial pelo M05 e é RECUSADA aqui, nomeando (não se "desempenha" por
 * dentro da folha).
 */
export function diferencaAEmpenhar(pedido: Money, jaEmpenhado: Money): { readonly tipo: "EMPENHAR"; readonly valor: Money } | { readonly tipo: "NADA" } | { readonly tipo: "REDUCAO"; readonly valor: Money } {
  const d = toMoney(pedido.minus(jaEmpenhado));
  if (d.isZero()) return { tipo: "NADA" };
  return d.gt(0) ? { tipo: "EMPENHAR", valor: d } : { tipo: "REDUCAO", valor: toMoney(d.negated()) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// O AJUSTE PARA BAIXO — quando a apuração nova pede MENOS do que a despesa já reconhece (V7 M1 U3)
// ═══════════════════════════════════════════════════════════════════════════════

export interface PosicaoDoGrupo {
  /** O que a apuração VIGENTE pede para o grupo. */
  readonly apurado: Money;
  /** Empenhado LÍQUIDO (originais − anulações parciais − estornos), não a soma das linhas originais. */
  readonly empenhado: Money;
  readonly liquidado: Money;
  readonly pago: Money;
}

export type PlanoDoGrupo =
  | { readonly tipo: "NADA" }
  | { readonly tipo: "EMPENHAR"; readonly valor: Money }
  | {
      readonly tipo: "REDUZIR";
      readonly reducao: Money;
      /** 1º: a parte ainda NÃO liquidada do empenho — anulação parcial do empenho pelo M05. */
      readonly anularEmpenho: Money;
      /** 2º: a parte liquidada e NÃO paga — anulação parcial da liquidação pelo M05, e depois do empenho. */
      readonly anularLiquidacao: Money;
      /** 3º: a parte JÁ PAGA — não se anula dinheiro que saiu: fica registrada para restituição/compensação. */
      readonly restituir: Money;
    };

/**
 * O PLANO DE UM GRUPO — puro, e a ordem é a da cadeia `pago ≤ liquidado ≤ empenhado`:
 *
 *   · apurado > empenhado líquido → EMPENHAR a diferença (o caminho de sempre);
 *   · apurado = empenhado líquido → NADA;
 *   · apurado < empenhado líquido → REDUZIR, consumindo primeiro o saldo a liquidar, depois o
 *     liquidado não pago; o que sobra é valor JÁ PAGO, que vira necessidade de restituição — nunca
 *     um clamp silencioso a zero, nunca um empenho negativo.
 *
 * ⚠️ O ALVO É O EMPENHADO LÍQUIDO: depois de uma redução e de um novo aumento, empenha-se só o que
 * falta sobre o que CONTINUA valendo — nunca de novo o que foi anulado nem o que ficou.
 */
export function planoDoGrupo(g: PosicaoDoGrupo): PlanoDoGrupo {
  const d = toMoney(g.apurado.minus(g.empenhado));
  if (d.isZero()) return { tipo: "NADA" };
  if (d.gt(0)) return { tipo: "EMPENHAR", valor: d };
  const reducao = toMoney(d.negated());
  const aLiquidar = Decimal.max(toMoney(g.empenhado.minus(g.liquidado)), toMoney(0));
  const naoPago = Decimal.max(toMoney(g.liquidado.minus(g.pago)), toMoney(0));
  const anularEmpenho = toMoney(Decimal.min(reducao, aLiquidar));
  const resto = toMoney(reducao.minus(anularEmpenho));
  const anularLiquidacao = toMoney(Decimal.min(resto, naoPago));
  const restituir = toMoney(resto.minus(anularLiquidacao));
  return { tipo: "REDUZIR", reducao, anularEmpenho: toMoney(anularEmpenho.plus(anularLiquidacao)), anularLiquidacao, restituir };
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUAIS ATOS SOBRE OS ENCARGOS CABEM AGORA — o mesmo predicado na tela e na transação
// ═══════════════════════════════════════════════════════════════════════════════

export interface EstadoDosEncargos {
  readonly competencia: string;
  readonly fechada: boolean;
  /** A apuração vigente (a de maior número), ou nula. */
  readonly apuracao: { readonly numero: number; readonly completa: boolean; readonly apuradaPor: string } | null;
  readonly certificacao: SituacaoDaCertificacao | null;
  /** Grupos com valor a empenhar ainda sem empenho desta apuração. */
  readonly gruposPendentesDeEmpenho: number;
  /** Componentes com valor que nenhum grupo de empenho acolhe. */
  readonly componentesSemGrupo: readonly string[];
  readonly empenhosDaApuracao: number;
  readonly liquidados: number;
  /** V7 M1 U3 — grupos cuja despesa líquida está ACIMA do que a apuração vigente pede, com ato a praticar. */
  readonly gruposComReducao?: number;
}

export interface AtorNosEncargos {
  readonly apurou: boolean;
  readonly certificou: boolean;
  readonly designado: boolean | null;
}

/**
 * APROVAR UMA VERSÃO do parâmetro: há versão aguardando, e alguma foi cadastrada por OUTRA pessoa.
 * O código da trava é o mesmo da recusa do caso de uso (`AUTOAPROVACAO-DO-ENCARGO`).
 */
export function elegibilidadeParaAprovarVersao(e: { readonly pendentes: number; readonly pendentesDeOutros: number }): Elegibilidade {
  if (e.pendentes === 0) return naoAplicavel("SEM-VERSAO-PENDENTE", "Nenhuma versão deste componente aguarda aprovação.");
  if (e.pendentesDeOutros === 0) return preCondicao("AUTOAPROVACAO-DO-ENCARGO", "Você cadastrou as versões que aguardam aprovação e não pode aprová-las.", "Outra pessoa com a permissão de aprovar confere alíquota, base e fundamento.");
  return ELEGIVEL;
}

export function elegibilidadeParaApurarEncargos(e: EstadoDosEncargos): Elegibilidade {
  if (!e.fechada) return preCondicao("FOLHA-NAO-FECHADA", `A folha de ${e.competencia} ainda não foi fechada; os encargos se apuram sobre o cálculo congelado.`, "Feche a folha antes.");
  return ELEGIVEL;
}

export function elegibilidadeParaCertificarEncargos(e: EstadoDosEncargos, a: AtorNosEncargos): Elegibilidade {
  if (e.apuracao === null) return preCondicao("ENCARGOS-NAO-APURADOS", `Os encargos de ${e.competencia} ainda não foram apurados.`, "Apure os encargos antes do atesto.");
  if (!e.apuracao.completa) return preCondicao("APURACAO-INCOMPLETA", `A apuração nº ${e.apuracao.numero} tem componente sem parâmetro aprovado.`, "Cadastre e aprove a versão que falta e apure de novo.");
  if (e.certificacao === "CERTIFICADA") return naoAplicavel("ENCARGOS-JA-CERTIFICADOS", `A apuração nº ${e.apuracao.numero} dos encargos já está certificada.`);
  if (a.apurou) return preCondicao("AUTOCERTIFICACAO-DOS-ENCARGOS", "Você apurou estes encargos e não pode certificá-los.", "Outra pessoa designada precisa praticar o atesto.");
  if (a.designado === false) return preCondicao("SEM-DESIGNACAO-VIGENTE", "Você não tem designação vigente para certificar a folha.", "O administrador cadastra a designação, com o ato que a fundamenta, em Folha > Designações.");
  return ELEGIVEL;
}

export function elegibilidadeParaApropriarEncargos(e: EstadoDosEncargos): Elegibilidade {
  if (e.apuracao === null) return preCondicao("ENCARGOS-NAO-APURADOS", `Os encargos de ${e.competencia} ainda não foram apurados.`, "Apure os encargos antes de empenhar.");
  if (!e.apuracao.completa) return preCondicao("APURACAO-INCOMPLETA", `A apuração nº ${e.apuracao.numero} tem componente sem parâmetro aprovado; empenhar uma parte seria afirmar o todo.`, "Aprove a versão que falta e apure de novo.");
  if (e.componentesSemGrupo.length > 0) return preCondicao("COMPONENTE-SEM-GRUPO-DE-EMPENHO", `${e.componentesSemGrupo.join(", ")} têm valor e nenhum grupo diz em qual ficha viram despesa.`, "Cadastre o grupo de empenho dos encargos.");
  if (e.gruposPendentesDeEmpenho === 0) return naoAplicavel("ENCARGOS-JA-EMPENHADOS", `Os encargos da apuração nº ${e.apuracao.numero} já estão empenhados.`);
  return ELEGIVEL;
}

export function elegibilidadeParaLiquidarEncargos(e: EstadoDosEncargos, a: AtorNosEncargos): Elegibilidade {
  if (e.apuracao === null) return preCondicao("ENCARGOS-NAO-APURADOS", `Os encargos de ${e.competencia} ainda não foram apurados.`);
  if (e.certificacao !== "CERTIFICADA") return preCondicao("ENCARGOS-NAO-CERTIFICADOS", `A apuração nº ${e.apuracao.numero} dos encargos ainda não foi certificada — o atesto da folha salarial não alcança encargos que não existiam quando ele foi dado.`, "Quem o ente designou certifica os encargos.");
  if (e.empenhosDaApuracao === 0) return preCondicao("ENCARGOS-NAO-EMPENHADOS", `A apuração nº ${e.apuracao.numero} não tem empenho.`, "Empenhe os encargos antes de liquidar.");
  if (e.liquidados >= e.empenhosDaApuracao) return naoAplicavel("ENCARGOS-JA-LIQUIDADOS", `Os ${e.empenhosDaApuracao} empenho(s) dos encargos já estão liquidados.`);
  if (a.certificou) return preCondicao("AUTOLIQUIDACAO-DOS-ENCARGOS", "Você certificou estes encargos e não pode liquidá-los.", "Outra pessoa com a permissão de liquidar pratica o ato.");
  return ELEGIVEL;
}

/**
 * AJUSTAR OS ENCARGOS PARA BAIXO (V7 M1 U3): há grupo com despesa líquida acima do apurado, a apuração
 * vigente está completa e CERTIFICADA (reduzir despesa também é ato sobre o objeto conferido), e quem
 * certificou não ajusta.
 */
export function elegibilidadeParaAjustarEncargos(e: EstadoDosEncargos, a: AtorNosEncargos): Elegibilidade {
  if (e.apuracao === null) return preCondicao("ENCARGOS-NAO-APURADOS", `Os encargos de ${e.competencia} ainda não foram apurados.`);
  if ((e.gruposComReducao ?? 0) === 0) return naoAplicavel("SEM-REDUCAO-A-AJUSTAR", `Nenhum grupo dos encargos de ${e.competencia} tem despesa acima da apuração nº ${e.apuracao.numero}.`);
  if (!e.apuracao.completa) return preCondicao("APURACAO-INCOMPLETA", `A apuração nº ${e.apuracao.numero} tem componente sem parâmetro aprovado; reduzir por ela seria afirmar o todo.`, "Aprove a versão que falta e apure de novo.");
  if (e.certificacao !== "CERTIFICADA") return preCondicao("ENCARGOS-NAO-CERTIFICADOS", `A apuração nº ${e.apuracao.numero}, que reduz os encargos, ainda não foi certificada.`, "Quem o ente designou certifica a apuração antes de a despesa ser reduzida.");
  if (a.certificou) return preCondicao("AUTOAJUSTE-DOS-ENCARGOS", "Você certificou esta apuração e não pode praticar o ajuste.", "Outra pessoa com a permissão pratica o ato.");
  return ELEGIVEL;
}
