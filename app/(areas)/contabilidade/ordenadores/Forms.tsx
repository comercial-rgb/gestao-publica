"use client";

import { useActionState, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO as PAINEL, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { designarAction, encerrarAction, responsavelAction, type EstadoDoAto } from "./actions";

function Resultado({ estado, acao }: { readonly estado: EstadoDoAto; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) return <p role="alert" className="mt-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  if (estado.sucesso !== undefined) return <p role="status" data-resultado-da-acao={acao} className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  return null;
}

export function FormDesignar({ unidades }: { readonly unidades: readonly { readonly id: string; readonly rotulo: string }[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(designarAction, {});
  const [escopo, setEscopo] = useState("ENTE");
  return (
    <form action={action} className={PAINEL} data-acao="designar-ordenador" aria-label="Designar um ordenador de despesa">
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Designar um ordenador de despesa</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs"><span className={ROTULO}>CPF</span><input name="cpf" required inputMode="numeric" className={CAMPO} /></label>
        <label className="text-xs sm:col-span-2"><span className={ROTULO}>Nome (até 50 caracteres)</span><input name="nome" required maxLength={50} className={CAMPO} /></label>
        <label className="text-xs">
          <span className={ROTULO}>Ordena</span>
          <select name="escopo" value={escopo} onChange={(e) => setEscopo(e.target.value)} className={CAMPO}>
            <option value="ENTE">Toda a despesa</option>
            <option value="UNIDADE_ORCAMENTARIA">Uma unidade orçamentária</option>
          </select>
        </label>
        {escopo === "UNIDADE_ORCAMENTARIA" ? (
          <label className="text-xs sm:col-span-2">
            <span className={ROTULO}>Unidade orçamentária</span>
            <select name="unidadeOrcId" required defaultValue="" className={CAMPO}>
              <option value="">Escolha…</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.rotulo}</option>)}
            </select>
          </label>
        ) : null}
        <label className="text-xs">
          <span className={ROTULO}>Tipo do ato</span>
          <select name="tipoDoAto" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            <option value="NOMEACAO">Nomeação</option>
            <option value="DELEGACAO">Delegação</option>
            <option value="SUBSTITUICAO">Substituição</option>
          </select>
        </label>
        <label className="text-xs"><span className={ROTULO}>Ato (ex.: Portaria 12/2026)</span><input name="ato" required minLength={5} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Vale desde</span><input name="vigenteDesde" type="date" required className={CAMPO} /></label>
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>{pendente ? "Gravando…" : "Designar"}</button>
      <Resultado estado={estado} acao="designar-ordenador" />
    </form>
  );
}

export function FormEncerrar({ designacaoId, nome }: { readonly designacaoId: string; readonly nome: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(encerrarAction, {});
  return (
    <details>
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Encerrar</summary>
      <form action={action} data-acao="encerrar-designacao" className="mt-2 grid gap-2" aria-label={`Encerrar a designação de ${nome}`}>
        <ChaveDeComando />
        <input type="hidden" name="designacaoId" value={designacaoId} />
        <label className="text-xs"><span className={ROTULO}>Último dia</span><input name="vigenteAte" type="date" required className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Ato que encerra</span><input name="ato" required minLength={5} className={CAMPO} /></label>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Encerrar"}</button>
        <Resultado estado={estado} acao="encerrar-designacao" />
      </form>
    </details>
  );
}

export function FormResponsavel(): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(responsavelAction, {});
  return (
    <form action={action} className={PAINEL} data-acao="declarar-responsavel-siafic" aria-label="Declarar o responsável pelo sistema">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Declarar o responsável pelo sistema</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Com manutenção terceirizada: a empresa e o responsável técnico dela. Com manutenção própria: os dados da prefeitura
        e do encarregado pela manutenção. Os dados vêm do contrato ou do ato de designação.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          <span className={ROTULO}>Manutenção</span>
          <select name="modalidade" defaultValue="TERCEIRIZADA" className={CAMPO}>
            <option value="TERCEIRIZADA">Terceirizada</option>
            <option value="PROPRIA">Própria (da prefeitura)</option>
          </select>
        </label>
        <label className="text-xs"><span className={ROTULO}>CNPJ da empresa ou prefeitura</span><input name="cnpjEmpresa" required className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Nome (até 80)</span><input name="nomeEmpresa" required maxLength={80} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Telefone com DDD</span><input name="telefoneEmpresa" inputMode="numeric" className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>E-mail para o Tribunal (até 30)</span><input name="emailEmpresa" type="email" required maxLength={30} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Nome do sistema (até 30)</span><input name="denominacaoSiafic" required maxLength={30} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>CPF do responsável técnico</span><input name="cpfResponsavelTecnico" required inputMode="numeric" className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Nome do responsável técnico (até 60)</span><input name="nomeResponsavelTecnico" required maxLength={60} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>E-mail do responsável técnico (até 30)</span><input name="emailResponsavelTecnico" type="email" required maxLength={30} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Telefone do responsável técnico</span><input name="telefoneResponsavelTecnico" inputMode="numeric" className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Vale desde</span><input name="vigenteDesde" type="date" required className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>De onde vêm os dados (contrato, ato)</span><input name="fundamento" required minLength={10} className={CAMPO} /></label>
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>{pendente ? "Gravando…" : "Declarar"}</button>
      <Resultado estado={estado} acao="declarar-responsavel-siafic" />
    </form>
  );
}
