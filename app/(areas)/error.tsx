"use client";

/**
 * V38 — A TELA DE ERRO DAS ÁREAS. Antes, um erro lançado por uma ação do servidor (o caso medido: o formulário aberto
 * durante uma publicação) caía na tela padrão do Next, em inglês e sem dizer o que fazer. Aqui a pessoa lê o que
 * aconteceu e como seguir. Nada fica gravado pela metade: as gravações são transações inteiras.
 */
export default function ErroDaArea({ reset }: { readonly error: Error & { readonly digest?: string }; readonly reset: () => void }): React.ReactElement {
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6">
      <h1 className="text-lg font-semibold text-[color:var(--color-ink)]">Não foi possível concluir</h1>
      <p className="text-sm text-[color:var(--color-ink-2)]">
        Esta tela não conseguiu completar a operação. Se o sistema foi atualizado enquanto ela estava aberta, recarregue
        a página e repita. Nada foi gravado pela metade.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white"
        >
          Recarregar a página
        </button>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-ink)]"
        >
          Tentar de novo
        </button>
        <a href="/" className="px-3 py-1.5 text-sm font-medium text-[color:var(--color-primary)] hover:underline">
          Ir para o início
        </a>
      </div>
    </div>
  );
}
