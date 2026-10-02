"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO as PAINEL, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import type { TramitaDoProcesso } from "../../../../../lib/portas/tramita";
import { importarLicitacoesAction, informarTramitaAction, informarTramitaPelaListaAction, type EstadoDoAto } from "./tramita-actions";

function Resultado({ estado, acao }: { readonly estado: EstadoDoAto; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) return <p role="alert" className="mt-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  if (estado.sucesso !== undefined) return <p role="status" data-resultado-da-acao={acao} className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  return null;
}

/**
 * V27 — escolher a licitação na lista que o Tribunal publica nos dados abertos (licitações do município, com o protocolo
 * do Tramita). O número, a unidade gestora, a modalidade e o protocolo vêm de lá; a lista só mostra as de modalidade
 * compatível com o processo.
 */
function FormDaLista({ processoId, tramita }: { readonly processoId: string; readonly tramita: TramitaDoProcesso }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(informarTramitaPelaListaAction, {});
  const [estadoImp, actionImp, pendenteImp] = useActionState<EstadoDoAto, FormData>(importarLicitacoesAction, {});
  return (
    <div className="space-y-2">
      {tramita.candidatas.length > 0 ? (
        <form action={action} data-acao="informar-tramita-pela-lista" className="grid gap-2 sm:grid-cols-[1fr_auto]" aria-label="Escolher a licitação na lista do Tribunal">
          <ChaveDeComando />
          <input type="hidden" name="processoId" value={processoId} />
          <label className="text-xs">
            <span className={ROTULO}>Licitação na lista do Tribunal</span>
            <select name="licitacaoNoTribunalId" required defaultValue="" className={CAMPO}>
              <option value="">Escolha…</option>
              {tramita.candidatas.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
            </select>
          </label>
          <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} self-end`}>{pendente ? "Gravando…" : "Usar esta"}</button>
          <div className="sm:col-span-2"><Resultado estado={estado} acao="informar-tramita-pela-lista" /></div>
        </form>
      ) : (
        <p className="text-xs text-[color:var(--color-ink-3)]" data-teste="sem-lista-do-tribunal">Nenhuma licitação compatível na lista do Tribunal. Importe o arquivo de licitações do município ou informe à mão.</p>
      )}
      <details>
        <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Importar a lista de licitações do Tribunal</summary>
        <form action={actionImp} data-acao="importar-licitacoes-do-tribunal" className="mt-2 grid gap-2" aria-label="Importar a lista de licitações do Tribunal">
          <ChaveDeComando />
          <input type="hidden" name="processoId" value={processoId} />
          <label className="text-xs">
            <span className={ROTULO}>Arquivo de licitações do município (dados abertos do Tribunal de Contas, formato CSV)</span>
            <input name="arquivo" type="file" accept=".csv,text/csv" required className={CAMPO} />
          </label>
          <button type="submit" disabled={pendenteImp} className={CLASSE_BOTAO_PRIMARIO}>{pendenteImp ? "Importando…" : "Importar"}</button>
          <Resultado estado={estadoImp} acao="importar-licitacoes-do-tribunal" />
        </form>
      </details>
    </div>
  );
}

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
          {tramita.vigente.protocolo !== null ? <> · protocolo {tramita.vigente.protocolo}</> : null}
          <span className="block text-[color:var(--color-ink-3)]">
            registrado em {tramita.vigente.desde} por {tramita.vigente.por} — {tramita.vigente.fundamento}
          </span>
        </p>
      ) : (
        <p className="mb-3 text-xs text-[color:var(--color-status-erro-fg)]">Sem o número do Tramita: os empenhos dos contratos deste processo ficam fora da remessa ao Tribunal.</p>
      )}
      <FormDaLista processoId={processoId} tramita={tramita} />
      <p className="mb-2 mt-4 text-xs font-semibold text-[color:var(--color-ink-2)]">Ou informe à mão, copiando do Tramita</p>
      <form action={action} data-acao="informar-tramita" className="grid gap-3 sm:grid-cols-2" aria-label="Registrar a licitação no Tramita">
        <ChaveDeComando />
        <input type="hidden" name="processoId" value={processoId} />
        <label className="text-xs">
          <span className={ROTULO}>Número da licitação no Tramita (como o Tribunal publica, por exemplo 00001/2026)</span>
          <input name="numeroNoTramita" required maxLength={10} className={CAMPO} />
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
