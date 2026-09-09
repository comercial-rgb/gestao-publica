"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { mascararCpfCnpj } from "../../../../lib/format/mascaras";

/**
 * O FILTRO DO RELATÓRIO GERENCIAL DE EMPENHOS — credor e fonte. Ilha client mínima, no
 * padrão do `SeletorPeriodo` e do `FiltroAtualizacoes`: escreve na URL e deixa o Server
 * Component reler.
 *
 * ⚠️ O FILTRO MORA NA URL, e isso não é detalhe de implementação. Um filtro guardado só no
 * estado do React não sobrevive ao "Imprimir PDF" (que é uma ROTA, não um clique) nem ao
 * link colado num e-mail. Estando na query string, tela, PDF e CSV mostram
 * necessariamente o MESMO recorte — e é isso que permite conferir um contra o outro.
 *
 * ═══ ⚠️ POR QUE O CREDOR É UM `select` DE DOCUMENTOS, E NÃO UM CAMPO "NOME DO CREDOR" ═══
 * Não existe entidade Credor/Fornecedor no schema. O `Empenho` guarda uma STRING —
 * `credorCpfCnpj` — e mais nada: sem nome, sem cadastro, sem FK. Um campo "nome do
 * credor" seria uma promessa que o banco não pode cumprir; ele devolveria vazio SEMPRE, e
 * o usuário leria isso como "este credor não recebeu nada".
 *
 * O `select` é a forma honesta: as opções são os documentos que ESTÃO no exercício, então
 * toda escolha rende ao menos uma linha, e não há erro de digitação possível. O rótulo vai
 * MASCARADO (`mascararCpfCnpj`) porque é assim que uma pessoa lê um CPF/CNPJ; o `value`
 * vai CRU (só dígitos), porque é assim que a coluna guarda. A máscara é apresentação e
 * morre aqui — a URL e a porta recebem o documento cru, como sempre.
 */
export interface FiltroGerencialProps {
  readonly credores: readonly string[];
  readonly fontes: readonly string[];
  readonly credor: string;
  readonly fonte: string;
}

export function FiltroGerencial(p: FiltroGerencialProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [credor, setCredor] = useState(p.credor);
  const [fonte, setFonte] = useState(p.fonte);

  const aplicar = (): void => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of [
      ["credor", credor],
      ["fonte", fonte],
    ] as const) {
      if (v.trim() !== "") q.set(k, v.trim());
      else q.delete(k);
    }
    router.push(`${pathname}?${q.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3" data-chrome>
      <label className="text-xs text-[color:var(--color-ink-2)]">
        <span className={ROTULO}>Credor (CPF/CNPJ)</span>
        <select
          aria-label="Credor por CPF/CNPJ"
          className={`${CAMPO} w-52`}
          value={credor}
          onChange={(e) => setCredor(e.target.value)}
        >
          <option value="">todos os credores</option>
          {p.credores.map((d) => (
            <option key={d} value={d}>
              {mascararCpfCnpj(d)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-[color:var(--color-ink-2)]">
        <span className={ROTULO}>Fonte</span>
        <select
          aria-label="Fonte de recursos"
          className={`${CAMPO} w-32`}
          value={fonte}
          onChange={(e) => setFonte(e.target.value)}
        >
          <option value="">todas</option>
          {p.fontes.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>

      <button type="button" onClick={aplicar} className={CLASSE_BOTAO_PRIMARIO}>
        Filtrar
      </button>
    </div>
  );
}
