"use client";

import { useEffect } from "react";

/**
 * O VIGIA DA EDIÇÃO NÃO SALVA (V31) — ilha client sem marcação, montada uma vez no layout.
 *
 * ⚠️ TROCAR DE TELA OU DE EXERCÍCIO NÃO PODE APAGAR EM SILÊNCIO O QUE O CONTADOR DIGITOU. O vigia
 * marca o formulário da área de trabalho (`main`) assim que um campo muda e desmarca quando ele é
 * enviado. Enquanto houver formulário marcado:
 *   · um clique em link que sai da página pede confirmação;
 *   · os seletores de exercício e unidade pedem confirmação (`confirmarDescarte`);
 *   · recarregar ou fechar a aba dispara o aviso do navegador.
 * É aviso, não trava: o contador decide. E não persiste nada — o rascunho não é gravado por ninguém.
 */
const MARCA = "data-edicao-pendente";

export function haEdicaoNaoSalva(): boolean {
  return typeof document !== "undefined" && document.querySelector(`main form[${MARCA}]`) !== null;
}

/** Pergunta antes de descartar. Devolve true se pode seguir. */
export function confirmarDescarte(): boolean {
  if (!haEdicaoNaoSalva()) return true;
  const ok = window.confirm("Há dados digitados e não salvos nesta tela. Sair e descartá-los?");
  if (ok) for (const f of document.querySelectorAll(`main form[${MARCA}]`)) f.removeAttribute(MARCA);
  return ok;
}

export function VigiaDeEdicao(): null {
  useEffect(() => {
    const aoDigitar = (e: Event): void => {
      const alvo = e.target as HTMLElement | null;
      const form = alvo?.closest("form");
      // Filtro (`<form method="get">`, a BarraFiltros) não é edição: perder a busca digitada não perde dado.
      if (form === null || form === undefined || form.closest("main") === null) return;
      if (form.getAttribute("method")?.toLowerCase() === "get") return;
      form.setAttribute(MARCA, "sim");
    };
    const aoEnviar = (e: Event): void => {
      (e.target as HTMLElement | null)?.removeAttribute(MARCA);
    };
    const aoClicar = (e: MouseEvent): void => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const link = (e.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (link === null || link.target === "_blank" || link.hasAttribute("download")) return;
      const destino = new URL(link.href, window.location.href);
      if (destino.origin !== window.location.origin || destino.pathname === window.location.pathname) return;
      if (!confirmarDescarte()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const aoSair = (e: BeforeUnloadEvent): void => {
      if (haEdicaoNaoSalva()) e.preventDefault();
    };
    document.addEventListener("input", aoDigitar, true);
    document.addEventListener("submit", aoEnviar, true);
    document.addEventListener("click", aoClicar, true);
    window.addEventListener("beforeunload", aoSair);
    return () => {
      document.removeEventListener("input", aoDigitar, true);
      document.removeEventListener("submit", aoEnviar, true);
      document.removeEventListener("click", aoClicar, true);
      window.removeEventListener("beforeunload", aoSair);
    };
  }, []);
  return null;
}
