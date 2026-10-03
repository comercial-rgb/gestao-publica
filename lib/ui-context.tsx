"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { anoCivil, mesCivil } from "../packages/datas/index";
import type { SituacaoDoExercicio } from "./situacao-do-exercicio";

/**
 * O CONTEXTO DE UI — EXERCÍCIO e UNIDADE GESTORA ativos.
 *
 * ═══ ⚠️ ELE NÃO SABE MAIS DE ONDE VÊM AS OPÇÕES, E ISSO É O CONSERTO ═══
 * Até a fatia anterior este arquivo trazia duas constantes locais de exercícios e unidades, que
 * ofereciam TODAS as unidades a TODO usuário. A segregação por UG (TR 6.5) vivia no domínio
 * (`autorizar` recusa a UG errada), mas a INTERFACE oferecia o recorte proibido: o usuário da
 * Saúde via "Educação" na lista e só descobriria o limite ao tentar ESCREVER — numa tela de
 * leitura, que não chama `autorizar`, ele simplesmente leria a unidade que não é dele.
 *
 * Agora as opções chegam por PROPS, lidas no servidor por `lib/portas/contexto.ts` contra as
 * permissões reais. Este componente ficou com a única responsabilidade que é dele: guardar a
 * SELEÇÃO. Ele não lê banco, não conhece Prisma e não decide quem pode o quê.
 */

export interface Exercicio {
  readonly ano: number;
  readonly encerrado: boolean;
  /** Proposta, aprovado, execução ou encerrado (derivada no servidor). Ausente só em render isolado. */
  readonly situacao?: SituacaoDoExercicio;
  /** Os meses travados inteiros para este usuário (derivados no servidor). */
  readonly mesesTravados?: readonly number[];
}

/** A competência de agora travada para o usuário (null = aberta). */
export type CompetenciaAtual = { readonly escopo: "GLOBAL" | "USUARIO"; readonly travadoPor: string } | null;

/**
 * ⚠️ A ESCOLHA DE EXERCÍCIO E UNIDADE SOBREVIVE AO RECARREGAMENTO — em COOKIE, que o layout lê no
 * servidor (o primeiro HTML já sai no exercício certo, sem piscar). Antes ela vivia só na memória da
 * aba: recarregar a página devolvia o contador ao exercício MAIS RECENTE, e com 2027 aberto pela
 * proposta isso o levava, sem aviso, do orçamento em execução para o projeto do ano seguinte.
 * O cookie guarda só a PREFERÊNCIA; o servidor revalida contra os exercícios e unidades permitidos.
 */
export const COOKIE_EXERCICIO = "contexto_exercicio";
export const COOKIE_UG = "contexto_ug";

function gravarPreferencia(nome: string, valor: string): void {
  document.cookie = `${nome}=${encodeURIComponent(valor)}; path=/; max-age=31536000; samesite=lax`;
}

export interface UnidadeGestora {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
}

/** ⚠️ A UG pode ser "CONSOLIDADO" (o ente inteiro) — o default dos relatórios que nascem sem UG. */
export const UG_CONSOLIDADO = "CONSOLIDADO" as const;
export type UgSelecionada = string | typeof UG_CONSOLIDADO;

export interface UiContextValor {
  readonly exercicio: number;
  readonly setExercicio: (ano: number) => void;
  readonly ug: UgSelecionada;
  readonly setUg: (ug: UgSelecionada) => void;
  readonly exerciciosDisponiveis: readonly Exercicio[];
  readonly ugsDisponiveis: readonly UnidadeGestora[];
  /**
   * O usuário pode pedir o CONSOLIDADO (o ente inteiro)? Só quem tem permissão GLOBAL — para os
   * demais, o consolidado conteria unidades que eles não podem ler.
   */
  readonly podeConsolidado: boolean;
  /** O ano e o mês civis do ente (o período do cabeçalho). */
  readonly anoCivil: number;
  readonly mesCivil: number;
  readonly competenciaAtual: CompetenciaAtual;
}

const UiContext = createContext<UiContextValor | null>(null);

export interface UiContextProviderProps {
  readonly children: React.ReactNode;
  /** Lidos no SERVIDOR (`carregarContextoDoUsuario`) e injetados aqui. */
  readonly exercicios: readonly Exercicio[];
  readonly ugs: readonly UnidadeGestora[];
  readonly podeConsolidado: boolean;
  /** O exercício que abre a sessão, decidido no servidor (cookie revalidado, senão o ano civil). */
  readonly exercicioInicial?: number | null;
  /** O CÓDIGO da unidade escolhida antes (cookie). Só vale se estiver entre as permitidas. */
  readonly ugPreferida?: string | null;
  readonly anoCivil?: number;
  readonly mesCivil?: number;
  readonly competenciaAtual?: CompetenciaAtual;
}

/**
 * ⚠️ A SELEÇÃO INICIAL DE UG É FAIL-CLOSED.
 *
 * Quem tem permissão global começa no CONSOLIDADO (o recorte natural de quem enxerga tudo). Quem
 * não tem começa na PRIMEIRA unidade que pode — nunca no consolidado, que para ele seria um
 * recorte mais amplo do que o crachá permite. Sem unidade nenhuma, a seleção fica no consolidado
 * e a tela cai no estado vazio: não há o que mostrar, e é isso que ela diz.
 */
function ugInicial(ugs: readonly UnidadeGestora[], podeConsolidado: boolean, preferida: string | null): UgSelecionada {
  // A preferência só vale dentro do permitido: um cookie antigo não alarga o recorte.
  if (preferida === UG_CONSOLIDADO && podeConsolidado) return UG_CONSOLIDADO;
  const escolhida = ugs.find((u) => u.codigo === preferida);
  if (escolhida !== undefined) return escolhida.id;
  if (podeConsolidado) return UG_CONSOLIDADO;
  return ugs[0]?.id ?? UG_CONSOLIDADO;
}

export function UiContextProvider({
  children,
  exercicios,
  ugs,
  podeConsolidado,
  exercicioInicial = null,
  ugPreferida = null,
  anoCivil: anoDoEnte,
  mesCivil: mesDoEnte,
  competenciaAtual = null,
}: UiContextProviderProps): React.ReactElement {
  const [exercicio, setExercicioCru] = useState<number>(
    exercicioInicial ?? exercicios[0]?.ano ?? anoCivil(new Date())
  );
  const [ug, setUgCru] = useState<UgSelecionada>(() => ugInicial(ugs, podeConsolidado, ugPreferida));
  const setExercicio = useCallback((ano: number): void => {
    setExercicioCru(ano);
    gravarPreferencia(COOKIE_EXERCICIO, String(ano));
  }, []);
  const setUg = useCallback(
    (nova: UgSelecionada): void => {
      setUgCru(nova);
      const codigo = nova === UG_CONSOLIDADO ? UG_CONSOLIDADO : ugs.find((u) => u.id === nova)?.codigo;
      if (codigo !== undefined) gravarPreferencia(COOKIE_UG, codigo);
    },
    [ugs]
  );
  const agora = new Date();
  const anoCivilDoEnte = anoDoEnte ?? anoCivil(agora);
  const mesCivilDoEnte = mesDoEnte ?? mesCivil(agora);

  const valor = useMemo<UiContextValor>(
    () => ({
      exercicio,
      setExercicio,
      ug,
      setUg,
      exerciciosDisponiveis: exercicios,
      ugsDisponiveis: ugs,
      podeConsolidado,
      anoCivil: anoCivilDoEnte,
      mesCivil: mesCivilDoEnte,
      competenciaAtual,
    }),
    [exercicio, ug, exercicios, ugs, podeConsolidado, setExercicio, setUg, anoCivilDoEnte, mesCivilDoEnte, competenciaAtual]
  );

  return <UiContext.Provider value={valor}>{children}</UiContext.Provider>;
}

/** Lê o contexto de UI. Estoura fora do provider — um componente órfão é bug, não silêncio. */
export function useUiContext(): UiContextValor {
  const ctx = useContext(UiContext);
  if (ctx === null) {
    throw new Error(
      "useUiContext fora do UiContextProvider. Todo consumidor de exercício/UG tem de estar " +
        "dentro do provider (montado no layout raiz)."
    );
  }
  return ctx;
}
