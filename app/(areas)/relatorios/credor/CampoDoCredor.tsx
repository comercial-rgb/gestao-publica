"use client";

import { useId } from "react";

/**
 * V36 — o campo do credor da ficha, com a lista de sugestões. O id da lista vem do `useId`, nunca literal: a guarda
 * de formulários (test/ui/formularios-na-mesma-pagina) exige, porque um id fixo repete quando a tela renderiza o
 * campo mais de uma vez e o `list` passa a apontar para a lista de outro formulário.
 */
export function CampoDoCredor({
  className,
  documento,
  credores,
}: {
  readonly className: string;
  readonly documento: string;
  readonly credores: readonly { readonly documento: string; readonly rotulo: string }[];
}): React.ReactElement {
  const lista = useId();
  return (
    <>
      <label>
        <span className="block font-semibold">Credor (nome ou CPF/CNPJ)</span>
        <input className={className} defaultValue={documento} list={lista} name="documento" />
      </label>
      <datalist id={lista}>
        {credores.map((c) => (
          <option key={c.documento} value={c.documento}>
            {c.rotulo}
          </option>
        ))}
      </datalist>
    </>
  );
}
