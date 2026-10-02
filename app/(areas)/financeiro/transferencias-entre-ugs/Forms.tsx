"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CampoValor } from "../../../../components/ui/Campos";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO as PAINEL, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { definirContabilizacaoAction, estornarTransferenciaAction, registrarTransferenciaAction, type EstadoDaTransferencia } from "./actions";

type Opcao = { readonly id: string; readonly rotulo: string };
type OpcaoConta = { readonly codigo: string; readonly rotulo: string };

function Resultado({ estado, acao }: { readonly estado: EstadoDaTransferencia; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) return <p role="alert" className="mt-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  if (estado.sucesso !== undefined) return <p role="status" data-resultado-da-acao={acao} className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  return null;
}

function SelectTipo({ tipos }: { readonly tipos: Readonly<Record<string, string>> }): React.ReactElement {
  return (
    <label className="text-xs">
      <span className={ROTULO}>Tipo</span>
      <select name="tipo" required defaultValue="" className={CAMPO}>
        <option value="">Escolha…</option>
        {Object.entries(tipos).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
    </label>
  );
}

export function FormContabilizacao({ tipos, vpds, vpas }: { readonly tipos: Readonly<Record<string, string>>; readonly vpds: readonly OpcaoConta[]; readonly vpas: readonly OpcaoConta[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaTransferencia, FormData>(definirContabilizacaoAction, {});
  return (
    <form action={action} className={PAINEL} data-acao="decidir-contas-da-transferencia" aria-label="Decidir as contas de um tipo de transferência">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Decidir as contas de um tipo de transferência</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">Quem concede lança a variação diminutiva; quem recebe, a aumentativa. As contas são as de transferência dentro do município.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectTipo tipos={tipos} />
        <label className="text-xs"><span className={ROTULO}>Vale desde</span><input name="vigenteDesde" type="date" required className={CAMPO} /></label>
        <label className="text-xs">
          <span className={ROTULO}>Conta de quem concede</span>
          <select name="contaConcedida" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {vpds.map((c) => <option key={c.codigo} value={c.codigo}>{c.rotulo}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Conta de quem recebe</span>
          <select name="contaRecebida" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {vpas.map((c) => <option key={c.codigo} value={c.codigo}>{c.rotulo}</option>)}
          </select>
        </label>
        <label className="text-xs sm:col-span-2"><span className={ROTULO}>Fundamento</span><input name="fundamento" required minLength={10} className={CAMPO} /></label>
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>{pendente ? "Gravando…" : "Decidir"}</button>
      <Resultado estado={estado} acao="decidir-contas-da-transferencia" />
    </form>
  );
}

export function FormTransferencia({ tipos, ugs, contas }: { readonly tipos: Readonly<Record<string, string>>; readonly ugs: readonly Opcao[]; readonly contas: readonly Opcao[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaTransferencia, FormData>(registrarTransferenciaAction, {});
  const select = (name: string, rotulo: string, opcoes: readonly Opcao[], vazio: string, obrigatorio: boolean): React.ReactElement => (
    <label className="text-xs">
      <span className={ROTULO}>{rotulo}</span>
      <select name={name} required={obrigatorio} defaultValue="" className={CAMPO}>
        <option value="">{vazio}</option>
        {opcoes.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
      </select>
    </label>
  );
  return (
    <form action={action} className={PAINEL} data-acao="registrar-transferencia-entre-ugs" aria-label="Registrar uma transferência entre unidades gestoras">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Registrar uma transferência</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">Informe a conta só do lado escriturado aqui. O lado de uma unidade de fora fica sem conta e sem lançamento.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectTipo tipos={tipos} />
        <label className="text-xs"><span className={ROTULO}>Data</span><input name="data" type="date" required className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Valor</span><CampoValor name="valor" required placeholder="0,00" className={CAMPO} aria-label="Valor da transferência" /></label>
        {select("ugOrigemId", "Unidade que concede", ugs, "Escolha…", true)}
        {select("contaOrigemId", "Conta de saída (se escriturada aqui)", contas, "Nenhuma: unidade de fora", false)}
        <span />
        {select("ugDestinoId", "Unidade que recebe", ugs, "Escolha…", true)}
        {select("contaDestinoId", "Conta de entrada (se escriturada aqui)", contas, "Nenhuma: unidade de fora", false)}
        <span />
        <label className="text-xs sm:col-span-3"><span className={ROTULO}>Ato ou documento (ex.: duodécimo de março, ofício)</span><input name="vinculo" required minLength={5} className={CAMPO} /></label>
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>{pendente ? "Gravando…" : "Registrar"}</button>
      <Resultado estado={estado} acao="registrar-transferencia-entre-ugs" />
    </form>
  );
}

export function FormEstornar({ transferenciaId, rotulo }: { readonly transferenciaId: string; readonly rotulo: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaTransferencia, FormData>(estornarTransferenciaAction, {});
  return (
    <details>
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Estornar</summary>
      <form action={action} data-acao="estornar-transferencia-entre-ugs" className="mt-2 grid gap-2" aria-label={`Estornar ${rotulo}`}>
        <ChaveDeComando />
        <input type="hidden" name="transferenciaId" value={transferenciaId} />
        <label className="text-xs"><span className={ROTULO}>Data do estorno</span><input name="data" type="date" required className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Motivo</span><input name="motivo" required minLength={5} className={CAMPO} /></label>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Estornar"}</button>
        <Resultado estado={estado} acao="estornar-transferencia-entre-ugs" />
      </form>
    </details>
  );
}
