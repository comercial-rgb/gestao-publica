"use client";

import { useActionState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { moverPapelAction, type EstadoPessoa } from "../actions";

const PAPEIS = [
  { valor: "CREDOR", rotulo: "Credor" },
  { valor: "CONSIGNATARIO", rotulo: "Consignatário" },
  { valor: "SERVIDOR", rotulo: "Servidor" },
  { valor: "REPRESENTANTE", rotulo: "Representante" },
] as const;

/**
 * CONCEDER OU ENCERRAR PAPEL.
 *
 * ⚠️ A TELA MOSTRA O QUE JÁ ESTÁ VIGENTE, mas quem RECUSA o movimento redundante é o
 * domínio (`moverPapelDePessoa`). A lista aqui é orientação: entre o render e o submit
 * outra pessoa pode ter concedido o mesmo papel, e é o servidor que decide sobre o estado
 * de agora — nunca o que o navegador viu.
 *
 * ⚠️ CREDOR NÃO É SERVIDOR. São papéis independentes: conceder um não concede o outro, e
 * encerrar um não encerra o outro.
 */
export function FormPapel({
  pessoaId,
  papeisVigentes,
}: {
  readonly pessoaId: string;
  readonly papeisVigentes: readonly string[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoPessoa, FormData>(
    moverPapelAction,
    {}
  );

  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO}>
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
        Papéis
      </h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Conceder e encerrar são fatos, com data própria — encerrar não apaga a concessão
        anterior.
      </p>

      <input type="hidden" name="pessoaId" value={pessoaId} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Papel</span>
          <select name="papel" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha…
            </option>
            {PAPEIS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
                {papeisVigentes.includes(p.valor) ? " (vigente)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Movimento</span>
          <select name="movimento" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha…
            </option>
            <option value="CONCEDIDO">Conceder</option>
            <option value="ENCERRADO">Encerrar</option>
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do ato</span>
          {/* ⚠️ Sem default de "hoje": a data é a do FATO, e ela pode não ser hoje. */}
          <input name="data" type="date" required className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Motivo</span>
          <input name="motivo" placeholder="opcional" className={CAMPO} />
        </label>
      </div>

      {estado.erro !== undefined ? (
        <p
          role="alert"
          className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
        >
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}

      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Registrando…" : "Registrar movimento"}
      </button>
    </form>
  );
}
