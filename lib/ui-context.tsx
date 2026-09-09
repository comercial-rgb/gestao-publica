"use client";

import { createContext, useContext, useMemo, useState } from "react";

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
}

const UiContext = createContext<UiContextValor | null>(null);

export interface UiContextProviderProps {
  readonly children: React.ReactNode;
  /** Lidos no SERVIDOR (`carregarContextoDoUsuario`) e injetados aqui. */
  readonly exercicios: readonly Exercicio[];
  readonly ugs: readonly UnidadeGestora[];
  readonly podeConsolidado: boolean;
}

/**
 * ⚠️ A SELEÇÃO INICIAL DE UG É FAIL-CLOSED.
 *
 * Quem tem permissão global começa no CONSOLIDADO (o recorte natural de quem enxerga tudo). Quem
 * não tem começa na PRIMEIRA unidade que pode — nunca no consolidado, que para ele seria um
 * recorte mais amplo do que o crachá permite. Sem unidade nenhuma, a seleção fica no consolidado
 * e a tela cai no estado vazio: não há o que mostrar, e é isso que ela diz.
 */
function ugInicial(ugs: readonly UnidadeGestora[], podeConsolidado: boolean): UgSelecionada {
  if (podeConsolidado) return UG_CONSOLIDADO;
  return ugs[0]?.id ?? UG_CONSOLIDADO;
}

export function UiContextProvider({
  children,
  exercicios,
  ugs,
  podeConsolidado,
}: UiContextProviderProps): React.ReactElement {
  // O exercício default é o mais recente cadastrado (a lista vem ordenada desc pela porta).
  const [exercicio, setExercicio] = useState<number>(
    exercicios[0]?.ano ?? new Date().getUTCFullYear()
  );
  const [ug, setUg] = useState<UgSelecionada>(() => ugInicial(ugs, podeConsolidado));

  const valor = useMemo<UiContextValor>(
    () => ({
      exercicio,
      setExercicio,
      ug,
      setUg,
      exerciciosDisponiveis: exercicios,
      ugsDisponiveis: ugs,
      podeConsolidado,
    }),
    [exercicio, ug, exercicios, ugs, podeConsolidado]
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
