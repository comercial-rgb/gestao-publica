"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CampoCpfCnpj } from "../../../../components/ui/Campos";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO as PAINEL, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { cadastrarUgAction, encerrarUgAction, type EstadoDaUg } from "./actions";

function Resultado({ estado, acao }: { readonly estado: EstadoDaUg; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) return <p role="alert" className="mt-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  if (estado.sucesso !== undefined) return <p role="status" data-resultado-da-acao={acao} className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  return null;
}

export function FormCadastrarUg({ entidades, naturezas }: { readonly entidades: readonly { readonly id: string; readonly rotulo: string }[]; readonly naturezas: Readonly<Record<string, string>> }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaUg, FormData>(cadastrarUgAction, {});
  return (
    <form action={action} className={PAINEL} data-acao="cadastrar-unidade-gestora" aria-label="Cadastrar uma unidade gestora">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Cadastrar uma unidade gestora</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">O código é o do cadastro de unidades gestoras do Tribunal de Contas do Estado.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs"><span className={ROTULO}>Código no Tribunal (6 dígitos)</span><input name="codigoTce" required inputMode="numeric" maxLength={6} pattern="\d{6}" className={CAMPO} /></label>
        <label className="text-xs sm:col-span-2"><span className={ROTULO}>Nome</span><input name="nome" required maxLength={100} className={CAMPO} /></label>
        <label className="text-xs">
          <span className={ROTULO}>Natureza jurídica</span>
          <select name="naturezaJuridica" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {Object.entries(naturezas).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
        <label className="text-xs"><span className={ROTULO}>CNPJ (se houver)</span><CampoCpfCnpj name="cnpj" className={CAMPO} aria-label="CNPJ da unidade gestora" /></label>
        <label className="text-xs">
          <span className={ROTULO}>Escriturada neste sistema pela entidade</span>
          <select name="entidadeContabilId" defaultValue="" className={CAMPO}>
            <option value="">Nenhuma: é de fora</option>
            {entidades.map((e) => <option key={e.id} value={e.id}>{e.rotulo}</option>)}
          </select>
        </label>
        <label className="text-xs"><span className={ROTULO}>Vale desde</span><input name="vigenteDesde" type="date" required className={CAMPO} /></label>
        <label className="text-xs sm:col-span-2"><span className={ROTULO}>De onde vêm o código e a vigência</span><input name="fundamento" required minLength={10} className={CAMPO} /></label>
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>{pendente ? "Gravando…" : "Cadastrar"}</button>
      <Resultado estado={estado} acao="cadastrar-unidade-gestora" />
    </form>
  );
}

export function FormEncerrarUg({ ugId, codigo }: { readonly ugId: string; readonly codigo: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaUg, FormData>(encerrarUgAction, {});
  return (
    <details>
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Encerrar</summary>
      <form action={action} data-acao="encerrar-unidade-gestora" className="mt-2 grid gap-2" aria-label={`Encerrar a unidade gestora ${codigo}`}>
        <ChaveDeComando />
        <input type="hidden" name="ugId" value={ugId} />
        <label className="text-xs"><span className={ROTULO}>Último dia</span><input name="vigenteAte" type="date" required className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Ato que encerra</span><input name="ato" required minLength={5} className={CAMPO} /></label>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Encerrar"}</button>
        <Resultado estado={estado} acao="encerrar-unidade-gestora" />
      </form>
    </details>
  );
}
