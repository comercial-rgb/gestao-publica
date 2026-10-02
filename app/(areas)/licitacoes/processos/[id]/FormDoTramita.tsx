"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO as PAINEL, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import type { TramitaDoProcesso } from "../../../../../lib/portas/tramita";
import { informarTramitaAction, type EstadoDoAto } from "./tramita-actions";

/**
 * V26 — a licitação deste processo como está cadastrada no Tramita do Tribunal de Contas. O número é o de lá; a
 * modalidade oferecida é só a que corresponde ao procedimento do processo.
 */
export function FormDoTramita({ processoId, tramita }: { readonly processoId: string; readonly tramita: TramitaDoProcesso }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(informarTramitaAction, {});
  return (
    <section className={PAINEL} data-teste="licitacao-no-tramita" aria-label="A licitação no Tramita do Tribunal de Contas">
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">A licitação no Tramita do Tribunal de Contas</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Os empenhos dos contratos deste processo vão ao Tribunal com o número da licitação cadastrada no Tramita — não com o
        número do processo. Copie o número, a unidade gestora e a modalidade do cadastro de lá.
      </p>
      {tramita.vigente !== null ? (
        <p className="mb-3 text-xs" data-tramita-numero={tramita.vigente.numero}>
          <strong>Nº {tramita.vigente.numero}</strong> · unidade gestora {tramita.vigente.ug} · modalidade {tramita.vigente.modalidade}
          <span className="block text-[color:var(--color-ink-3)]">
            registrado em {tramita.vigente.desde} por {tramita.vigente.por} — {tramita.vigente.fundamento}
          </span>
        </p>
      ) : (
        <p className="mb-3 text-xs text-[color:var(--color-status-erro-fg)]">Sem o número do Tramita: os empenhos dos contratos deste processo ficam fora da remessa ao Tribunal.</p>
      )}
      <form action={action} data-acao="informar-tramita" className="grid gap-3 sm:grid-cols-2" aria-label="Registrar a licitação no Tramita">
        <ChaveDeComando />
        <input type="hidden" name="processoId" value={processoId} />
        <label className="text-xs">
          <span className={ROTULO}>Número no Tramita (até 9 posições)</span>
          <input name="numeroNoTramita" required maxLength={9} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Unidade gestora no Tramita (6 dígitos)</span>
          <input name="codUnidadeGestora" required inputMode="numeric" maxLength={6} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Modalidade no Tramita</span>
          <select name="modalidadeSagres" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {tramita.modalidadesPermitidas.map((m) => (
              <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.descricao}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>De onde vem (consulta ao Tramita, comprovante)</span>
          <input name="fundamento" required minLength={10} className={CAMPO} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : tramita.vigente === null ? "Registrar" : "Corrigir"}</button>
          {estado.erro !== undefined ? <p role="alert" className="mt-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
          {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao="informar-tramita" className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
        </div>
      </form>
    </section>
  );
}
