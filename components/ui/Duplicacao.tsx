import Link from "next/link";

/**
 * V36 — DUPLICAR NAS LISTAS (TR 5.10.2.5): o link que reabre a tela com `?duplicar=<id>`, o aviso quando o registro
 * pedido não pode ser duplicado e a leitura do parâmetro. O preenchimento é do formulário de cada tela; a gravação é a
 * action de sempre (ver `lib/portas/duplicacao.ts`).
 */

/** O id pedido em `?duplicar=`, ou "" — só o primeiro valor, sem espaços. */
export function idParaDuplicar(sp: Readonly<Record<string, string | string[] | undefined>>): string {
  const v = sp["duplicar"];
  return (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
}

export function LinkDuplicar({ href }: { readonly href: string }): React.ReactElement {
  return (
    <Link href={href} data-elo="duplicar" className="text-xs font-medium text-[color:var(--color-primary)] hover:underline">
      Duplicar
    </Link>
  );
}

/** Pedido um registro que não existe ou que é um estorno: a tela diz, em vez de abrir o formulário vazio calada. */
export function AvisoDeDuplicacao({ pedido, achado }: { readonly pedido: string; readonly achado: boolean }): React.ReactElement | null {
  if (pedido === "" || achado) return null;
  return (
    <p role="alert" data-duplicacao="recusada" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
      Não há o que duplicar: o registro pedido não existe ou é um estorno. Escolha um registro da lista.
    </p>
  );
}
