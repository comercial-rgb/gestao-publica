"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { filtrarPorTexto, normalizar, type DestinoDaBusca } from "../../lib/busca-global";

/**
 * BUSCA GLOBAL — a caixa do cabeçalho.
 *
 * ⚠️ O ÍNDICE CHEGA **JÁ FILTRADO PELO SERVIDOR**, por props. É a decisão de desenho que
 * importa aqui: o recorte de permissão é feito no servidor, com as mesmas tabelas que
 * `autorizar` lê, e o cliente só faz casamento de texto sobre o que já pode ver. Se o
 * filtro morasse aqui, o HTML entregue ao navegador carregaria a lista inteira de telas do
 * sistema — e "não mostrar na tela" não é o mesmo que "não enviar".
 *
 * ⚠️ E É ÍNDICE PEQUENO DE PROPÓSITO — dezenas de destinos, não milhares de registros. Ele
 * responde "onde eu faço isso?", não "onde está o convênio 12/2026" (ver `BUSCA-DE-REGISTRO`
 * em `lib/busca-global.ts`). Por ser pequeno, cabe num payload e dispensa ida ao servidor a
 * cada tecla.
 *
 * ⚠️ ACESSIBILIDADE: `role="combobox"` com `aria-expanded` e `aria-controls`, lista com
 * `role="listbox"`, navegação por ↑/↓ e Enter, Esc fecha. Um campo de busca que só funciona
 * com mouse exclui quem opera o sistema por teclado o dia inteiro — que é quem mais o usa.
 */
export function BuscaGlobal({
  destinos,
}: {
  readonly destinos: readonly DestinoDaBusca[];
}): React.ReactElement {
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const [selecionado, setSelecionado] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const idLista = useId();

  const alvo = normalizar(termo);
  // ⚠️ A MESMA FUNÇÃO QUE O SERVIDOR USA. Duas ordenações "equivalentes" divergem no dia
  // em que uma ganha um critério — e o usuário vê uma ordem na busca e outra em qualquer
  // lugar que a reutilize.
  const achados = filtrarPorTexto(destinos, termo);

  // Clique fora fecha. Sem isto a lista fica pendurada sobre a tela seguinte.
  useEffect(() => {
    const fora = (e: MouseEvent): void => {
      if (caixa.current !== null && !caixa.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      setAberto(false);
      return;
    }
    if (achados.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelecionado((i) => (i + 1) % achados.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelecionado((i) => (i - 1 + achados.length) % achados.length);
    } else if (e.key === "Enter") {
      const escolhido = achados[selecionado];
      if (escolhido !== undefined) window.location.assign(escolhido.href);
    }
  };

  return (
    <div ref={caixa} className="relative w-64">
      {/* ⚠️ RÓTULO EM TODO CAMPO — aqui ele é visualmente oculto, não ausente: a caixa é
          reconhecível pelo desenho, mas o leitor de tela precisa do nome. */}
      <label htmlFor={`${idLista}-campo`} className="sr-only">
        Buscar no sistema
      </label>
      <input
        id={`${idLista}-campo`}
        type="search"
        role="combobox"
        aria-expanded={aberto && achados.length > 0}
        aria-controls={idLista}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Buscar telas e cadastros"
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
          setSelecionado(0);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={aoTeclar}
        className="w-full rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-1.5 text-sm text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-3)]"
      />
      {aberto && alvo.length >= 2 ? (
        <ul
          id={idLista}
          role="listbox"
          aria-label="Resultados da busca"
          className="absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg"
        >
          {achados.length === 0 ? (
            // ⚠️ O VAZIO DIZ O MOTIVO. "Nada encontrado" seco faz o usuário repetir a busca;
            // dizer que a lista respeita a permissão explica por que uma tela que ele já viu
            // em outro perfil não aparece.
            <li className="px-3 py-2 text-xs text-[color:var(--color-ink-3)]">
              Nada encontrado entre as telas a que você tem acesso.
            </li>
          ) : (
            achados.map((d, i) => (
              <li key={d.href} role="option" aria-selected={i === selecionado}>
                <Link
                  href={d.href}
                  onClick={() => setAberto(false)}
                  className={`block px-3 py-2 text-sm ${
                    i === selecionado
                      ? "bg-[color:var(--color-primary-soft)] text-[color:var(--color-primary)]"
                      : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
                  }`}
                >
                  <span className="block truncate font-medium">{d.rotulo}</span>
                  <span className="block truncate text-xs text-[color:var(--color-ink-3)]">
                    {d.contexto}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
