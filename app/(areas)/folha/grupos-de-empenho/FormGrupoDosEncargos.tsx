"use client";

import { useActionState, useRef } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import type { OpcaoDaIlha } from "./FormGrupoDeEmpenho";

interface Estado {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * O GRUPO DE EMPENHO DOS ENCARGOS — ilha client (V6.2 U1).
 *
 * ⚠️ OUTRA ILHA, E NÃO UMA CAIXA A MAIS NO FORMULÁRIO DOS PROVENTOS. O grupo dos encargos junta
 * COMPONENTES (não rubricas), empenha UMA vez por grupo com o credor declarado (o regime, o fundo) e
 * declara as SUAS contas: a VPD de encargos e a obrigação de encargos a recolher — herdar as da
 * remuneração lançaria o patronal como salário a pagar.
 */
export function FormGrupoDosEncargos({ fichas, credores, contasDeVariacao, contasDeObrigacao, componentes, action }: {
  readonly fichas: readonly OpcaoDaIlha[];
  readonly credores: readonly OpcaoDaIlha[];
  readonly contasDeVariacao: readonly OpcaoDaIlha[];
  readonly contasDeObrigacao: readonly OpcaoDaIlha[];
  readonly componentes: readonly OpcaoDaIlha[];
  readonly action: (e: Estado, f: FormData) => Promise<Estado>;
}): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<Estado, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();
  const sel = (name: string, rotulo: string, opcoes: readonly OpcaoDaIlha[], largura = "sm:col-span-2") => (
    <label className={`text-xs text-[color:var(--color-ink-2)] ${largura}`}>
      <span className={ROTULO}>{rotulo}</span>
      <select name={name} required defaultValue="" className={CAMPO}>
        <option value="">Selecione</option>
        {opcoes.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
      </select>
    </label>
  );
  return (
    <form ref={ref} action={disparar} data-acao="criar-grupo-dos-encargos" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Novo grupo de empenho dos encargos do empregador</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Os encargos apurados sobre a folha fechada são empenhados neste grupo, um empenho por apuração (apenas a diferença
        sobre o valor já empenhado), para o credor informado. A escolha das contas cabe ao contador do ente.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)]"><span className={ROTULO}>Código</span><input name="codigo" required placeholder="ENCARGOS-RGPS" className={CAMPO} /></label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2"><span className={ROTULO}>Descrição (constará no histórico do empenho)</span><input name="descricao" required className={CAMPO} /></label>
        <label className="text-xs text-[color:var(--color-ink-2)]"><span className={ROTULO}>Série do número</span><input name="serie" required pattern="[A-Za-z0-9-]{1,10}" placeholder="FE" className={CAMPO} /></label>
        {sel("fichaId", "Ficha orçamentária (obrigações patronais)", fichas, "sm:col-span-2 lg:col-span-4")}
        {sel("credorId", "Credor do empenho (regime, instituto ou fundo)", credores)}
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Tipo de empenho</span>
          <select name="tipoEmpenho" required defaultValue="ORDINARIO" className={CAMPO}><option value="ORDINARIO">Ordinário</option><option value="GLOBAL">Global</option><option value="ESTIMATIVO">Estimativo</option></select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Categoria da ordem cronológica</span>
          <select name="categoriaOrdemCronologica" required defaultValue="PRESTACAO_SERVICOS" className={CAMPO}><option value="FORNECIMENTO_BENS">Fornecimento de bens</option><option value="LOCACAO">Locação</option><option value="PRESTACAO_SERVICOS">Prestação de serviços</option><option value="REALIZACAO_OBRAS">Realização de obras</option></select>
        </label>
        {sel("contaVariacaoId", "Variação patrimonial diminutiva dos encargos (debitada na liquidação)", contasDeVariacao)}
        {sel("contaObrigacaoId", "Encargos a recolher (creditada na liquidação)", contasDeObrigacao)}
      </div>
      <fieldset data-secao="componentes" className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Componentes de encargo deste grupo</legend>
        {componentes.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-2)]">Não há componente de encargo sem grupo. Cadastre em Folha &gt; Encargos do empregador.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {componentes.map((k, i) => (
              <label key={k.id} className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)]"><input type="checkbox" name={`componentes.${i}.id`} value={k.id} className="h-4 w-4" /><span>{k.rotulo}</span></label>
            ))}
          </div>
        )}
      </fieldset>
      {estado.erro !== undefined ? <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Gravando…" : "Cadastrar grupo dos encargos"}</button>
    </form>
  );
}
