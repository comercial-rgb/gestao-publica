"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO as PAINEL, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { registrarAgrupamentoAction, type EstadoDoAgrupamento } from "./actions";

type Opcao = { readonly id: string; readonly rotulo: string };

export function FormDoAgrupamento({ ano, liquidacoes, ugs }: { readonly ano: number; readonly liquidacoes: readonly Opcao[]; readonly ugs: readonly Opcao[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAgrupamento, FormData>(registrarAgrupamentoAction, {});
  return (
    <form action={action} className={PAINEL} data-acao="registrar-agrupamento-da-folha" aria-label="Registrar o código de agrupamento da folha">
      <ChaveDeComando />
      <input type="hidden" name="ano" value={ano} />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Registrar o código de agrupamento da folha</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        O código é o que o sistema da folha mandou na remessa de pessoal ao Tribunal: o mês e mais oito posições. Cada
        liquidação recebe o seu, e um código serve a uma liquidação só.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Liquidação da folha deste sistema</span>
          <select name="liquidacaoId" defaultValue="" className={CAMPO}>
            <option value="">Nenhuma (folha de outro sistema)</option>
            {liquidacoes.map((l) => <option key={l.id} value={l.id}>{l.rotulo}</option>)}
          </select>
        </label>
        <label className="text-xs"><span className={ROTULO}>Ou o número da liquidação (folha de outro sistema)</span><input name="numeroDaLiquidacao" className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Código de agrupamento (10 posições)</span><input name="codigo" required minLength={10} maxLength={10} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Competência da folha</span><input name="competencia" type="month" required className={CAMPO} /></label>
        <label className="text-xs">
          <span className={ROTULO}>Unidade gestora</span>
          <select name="ugId" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {ugs.map((u) => <option key={u.id} value={u.id}>{u.rotulo}</option>)}
          </select>
        </label>
        <label className="text-xs"><span className={ROTULO}>Sistema que gerou a folha</span><input name="sistemaDeOrigem" required minLength={3} className={CAMPO} /></label>
        <label className="text-xs sm:col-span-2"><span className={ROTULO}>De onde vem o código</span><input name="fundamento" required minLength={10} className={CAMPO} /></label>
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>{pendente ? "Gravando…" : "Registrar"}</button>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao="registrar-agrupamento-da-folha" className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </form>
  );
}
