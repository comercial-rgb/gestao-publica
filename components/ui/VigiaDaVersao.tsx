"use client";

import { useEffect, useState } from "react";
import { precisaRecarregar } from "../../lib/versao-em-uso";
import { confirmarDescarte } from "./VigiaDeEdicao";

/**
 * V38 — O VIGIA DA VERSÃO: ilha client montada uma vez no layout das áreas.
 *
 * Pergunta a `/release` a cada intervalo e, quando o commit no ar deixa de ser o desta tela, mostra um aviso fixo
 * pedindo para recarregar antes de gravar. Uma tela carregada antes de uma publicação aponta para ações que a versão
 * nova não tem; gravar nela dá um erro sem explicação e nada é salvo. O aviso é o que faltou à contadora em 08/10/2026.
 *
 * É aviso, não trava: recarregar pede confirmação se houver formulário com dados digitados (`confirmarDescarte`).
 * Fora de um build versionado (`versao` nula) o vigia não existe.
 */
const INTERVALO_MS = 90_000;

export function VigiaDaVersao({ versao }: { readonly versao: string | null }): React.ReactElement | null {
  const [noAr, setNoAr] = useState<string | null>(null);

  useEffect(() => {
    if (versao === null) return;
    let parado = false;
    const conferir = async (): Promise<void> => {
      try {
        const r = await fetch("/release", { cache: "no-store" });
        const corpo = (await r.json()) as { readonly commit?: string | null };
        if (!parado && precisaRecarregar(versao, corpo.commit)) setNoAr((corpo.commit ?? "").slice(0, 7));
      } catch {
        // Sem resposta não há o que comparar; a próxima rodada tenta de novo.
      }
    };
    const id = window.setInterval(() => void conferir(), INTERVALO_MS);
    return () => {
      parado = true;
      window.clearInterval(id);
    };
  }, [versao]);

  if (versao === null || noAr === null) return null;
  return (
    <div
      role="alert"
      data-versao-nova={noAr}
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 border-t border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-4 py-3 text-sm text-[color:var(--color-ink)] shadow-lg"
    >
      <span>
        O sistema foi atualizado enquanto esta tela estava aberta. Recarregue a página antes de gravar: o que ainda não
        foi gravado será perdido.
      </span>
      <button
        type="button"
        onClick={() => {
          if (confirmarDescarte()) window.location.reload();
        }}
        className="rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-3 py-1 text-xs font-semibold text-white"
      >
        Recarregar agora
      </button>
    </div>
  );
}
