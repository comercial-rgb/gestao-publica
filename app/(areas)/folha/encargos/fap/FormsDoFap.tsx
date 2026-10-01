"use client";

import { useActionState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { aprovarFapAction, registrarEstabelecimentoAction, registrarFapAction, type EstadoDoFap } from "./actions";

function Resultado({ estado }: { readonly estado: EstadoDoFap }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p role="alert" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

/** Cadastro do FAP do ano. O CNPJ vem preenchido com o do ente; para um estabelecimento com CNPJ próprio, troque-o. */
export function FormCadastrarFap({ cnpjDoEnte }: { readonly cnpjDoEnte: string | null }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoFap, FormData>(registrarFapAction, {});
  const campo = "text-xs text-[color:var(--color-ink-2)]";
  return (
    <form action={action} data-acao="cadastrar-fap" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Cadastrar o FAP do ano</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        O FAP é publicado uma vez por ano para cada CNPJ e varia de 0,5000 a 2,0000. Depois do cadastro, outra pessoa confere e aprova.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={campo}>
          <span className={ROTULO}>CNPJ</span>
          <input name="cnpj" required defaultValue={cnpjDoEnte ?? ""} inputMode="numeric" className={CAMPO} />
        </label>
        <label className={campo}>
          <span className={ROTULO}>Ano de vigência</span>
          <input name="ano" required inputMode="numeric" maxLength={4} placeholder="2026" className={CAMPO} />
        </label>
        <label className={campo}>
          <span className={ROTULO}>FAP</span>
          <input name="fator" required inputMode="decimal" placeholder="1,2345" className={CAMPO} />
        </label>
        <label className={`${campo} sm:col-span-2 lg:col-span-4`}>
          <span className={ROTULO}>De onde veio (consulta ao FAP do CNPJ, com a data)</span>
          <input name="fonte" required minLength={10} placeholder="Consulta ao FAP 2026 do CNPJ em 10/01/2026" className={CAMPO} />
        </label>
      </div>
      <Resultado estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Cadastrando…" : "Cadastrar FAP"}
      </button>
    </form>
  );
}

/** V25 — o estabelecimento (CNPJ) de uma lotação, a partir de uma competência. */
export function FormEstabelecimentoDaLotacao({ lotacoes }: { readonly lotacoes: readonly { readonly id: string; readonly rotulo: string }[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoFap, FormData>(registrarEstabelecimentoAction, {});
  const campo = "text-xs text-[color:var(--color-ink-2)]";
  return (
    <form action={action} data-acao="registrar-estabelecimento" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Estabelecimento de uma lotação</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        O FAP é de cada estabelecimento (CNPJ completo). Quando uma lotação pertence a um fundo ou órgão com CNPJ próprio, registre aqui: quem
        está nela e nas lotações abaixo dela passa a usar o FAP desse CNPJ. Lotação sem registro usa o CNPJ do ente.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={`${campo} sm:col-span-2`}>
          <span className={ROTULO}>Lotação</span>
          <select name="lotacaoId" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha a lotação
            </option>
            {lotacoes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className={campo}>
          <span className={ROTULO}>CNPJ do estabelecimento</span>
          <input name="cnpj" required inputMode="numeric" placeholder="00.000.000/0000-00" className={CAMPO} />
        </label>
        <label className={campo}>
          <span className={ROTULO}>A partir da competência</span>
          <input name="competenciaInicio" required type="month" className={CAMPO} />
        </label>
        <label className={`${campo} sm:col-span-2 lg:col-span-4`}>
          <span className={ROTULO}>O que liga a lotação a esse CNPJ</span>
          <input name="fundamento" required minLength={10} placeholder="Fundo Municipal de Saúde, cadastro do estabelecimento no eSocial" className={CAMPO} />
        </label>
      </div>
      <Resultado estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Registrando…" : "Registrar estabelecimento"}
      </button>
    </form>
  );
}

/** A aprovação de um FAP — de outra pessoa que não a que cadastrou. */
export function FormAprovarFap({ fatorId, ano }: { readonly fatorId: string; readonly ano: number }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoFap, FormData>(aprovarFapAction, {});
  return (
    <form action={action} data-acao="aprovar-fap" data-fap={fatorId} aria-label={`Aprovar o FAP de ${ano}`}>
      <ChaveDeComando />
      <input type="hidden" name="fatorId" value={fatorId} />
      <button type="submit" disabled={pendente} className="text-xs font-medium text-[color:var(--color-primary)] underline">
        {pendente ? "Aprovando…" : "Aprovar"}
      </button>
      <Resultado estado={estado} />
    </form>
  );
}
