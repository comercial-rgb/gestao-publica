"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * O QUE A PESSOA DIGITOU NÃO SOME NUMA RECUSA.
 *
 * ⚠️ MEDIDO NO react-dom 19.2.7: todo envio por `<form action={...}>` pede `requestFormReset` antes de chamar a action
 * (`startHostTransition`), e o reset se aplica quando a transição confirma — com a action tendo gravado OU recusado.
 * Numa recusa ("saldo insuficiente", "variação divergente") o formulário voltava aos valores iniciais, e a pessoa
 * redigitava tudo; numa prévia ("conferir"), o botão seguinte encontrava os campos obrigatórios vazios.
 *
 * Uso: `guardar(dados)` no começo do envio; quando o estado novo chega e `deveRestaurar(estado)` diz que o envio NÃO
 * gravou (recusa, prévia), os campos voltam com o que foi enviado — no layout effect, depois do reset da mesma
 * confirmação. Campos ocultos e de arquivo não se restauram (a chave de comando é trocada de propósito).
 */
export function useRestaurarAposEnvio<E>(estado: E, deveRestaurar: (e: E) => boolean): {
  readonly ref: React.RefObject<HTMLFormElement | null>;
  readonly guardar: (dados: FormData) => void;
} {
  const ref = useRef<HTMLFormElement | null>(null);
  const enviado = useRef<readonly (readonly [string, string])[] | null>(null);
  const anterior = useRef<E>(estado);

  useLayoutEffect(() => {
    if (estado === anterior.current) return;
    anterior.current = estado;
    const form = ref.current;
    const valores = enviado.current;
    if (form === null || valores === null || !deveRestaurar(estado)) return;
    const porNome = new Map<string, string[]>();
    for (const [k, v] of valores) porNome.set(k, [...(porNome.get(k) ?? []), v]);
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || el.name === "") continue;
      if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "file" || el.type === "submit")) continue;
      const vs = porNome.get(el.name);
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
        el.checked = vs?.includes(el.value) ?? false;
      } else if (vs !== undefined) {
        el.value = vs[vs.length - 1] ?? "";
      }
    }
  }, [estado, deveRestaurar]);

  return {
    ref,
    guardar: (dados: FormData) => {
      enviado.current = [...dados.entries()].filter((e): e is [string, string] => typeof e[1] === "string");
    },
  };
}
