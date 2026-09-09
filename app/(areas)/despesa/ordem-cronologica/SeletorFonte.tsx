"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * SELETOR DE FONTE da ordem cronológica — ilha client, no padrão do `SeletorPeriodo` dos livros.
 *
 * ⚠️ O ESTADO MORA NA URL, NÃO NO COMPONENTE. Ao escolher, empurra `?fonte=` e o Server Component
 * re-consulta a porta com o filtro. É isso que faz o recorte ser COMPARTILHÁVEL (um link para "a
 * fila da fonte 500" é prova de conformidade que se cola num processo) e é isso que faz o botão
 * Imprimir poder carregar o MESMO recorte para o PDF — se o filtro fosse `useState`, a rota de PDF
 * não teria como saber o que o usuário está vendo, e o papel divergiria da tela.
 *
 * ⚠️ SEM BOTÃO "APLICAR". O seletor de período tem dois campos que só fazem sentido juntos (uma data
 * inicial sem a final é meio recorte); aqui é UM campo, e navegar no `onChange` é o comportamento
 * que o usuário espera de um filtro único. O `<select>` já é acessível por teclado sem submit.
 *
 * ⚠️ `preservar` os demais params: exercício e UG vêm do cabeçalho (`SincronizarContexto`) e não
 * podem ser derrubados por este filtro — mesmo que a fila do art. 141 não os use (ver o comentário
 * de topo da página), quem sai daqui para outra tela leva o contexto junto.
 */
const CLASSE =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

export function SeletorFonte({
  fonte,
  fontes,
}: {
  /** A fonte em vigor (a da URL). Vazio = todas. */
  readonly fonte: string;
  /** As fontes que HOJE têm fila — vêm da porta, nunca do cadastro. */
  readonly fontes: readonly string[];
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const escolher = (v: string): void => {
    const p = new URLSearchParams(params.toString());
    // Vazio APAGA o param em vez de gravar `?fonte=` — a URL de "todas as fontes" é a URL
    // canônica da tela, e um param vazio pendurado nela seria ruído no link compartilhado.
    if (v.trim() !== "") p.set("fonte", v.trim());
    else p.delete("fonte");
    const qs = p.toString();
    router.push(qs === "" ? pathname : `${pathname}?${qs}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2" data-chrome>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Fonte de recurso</span>
        <select
          aria-label="Filtrar por fonte de recurso"
          className={`${CLASSE} w-44`}
          value={fonte}
          onChange={(e) => escolher(e.target.value)}
        >
          <option value="">Todas as fontes</option>
          {fontes.map((f) => (
            <option key={f} value={f}>
              Fonte {f}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
