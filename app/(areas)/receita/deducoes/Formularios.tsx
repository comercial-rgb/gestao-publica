"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { estornarDeducaoAction, registrarDeducaoAction, type EstadoDaDeducao } from "./actions";

function Resultado({ estado, acao }: { readonly estado: EstadoDaDeducao; readonly acao: string }): React.ReactElement | null {
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" data-resultado-da-acao={acao} className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  if (estado.erro !== undefined) {
    return (
      <p role="alert" data-resultado-da-acao={acao} className="whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  return null;
}

export function FormDeducao({
  naturezas,
  fontes,
  contas,
}: {
  readonly naturezas: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly fontes: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly contas: readonly { readonly codigo: string; readonly descricao: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaDeducao, FormData>(registrarDeducaoAction, {});
  return (
    <form action={action} data-acao="registrar-deducao" className="grid gap-3 text-xs sm:grid-cols-2" aria-label="Registrar a dedução da receita para o FUNDEB">
      <ChaveDeComando />
      <label>
        <span className={ROTULO}>Receita deduzida (natureza arrecadada no exercício)</span>
        <select name="naturezaReceita" required defaultValue="" className={CAMPO}>
          <option value="">Escolha a natureza…</option>
          {naturezas.map((n) => (
            <option key={n.codigo} value={n.codigo}>{n.codigo} — {n.descricao}</option>
          ))}
        </select>
      </label>
      <label>
        <span className={ROTULO}>Fonte da receita</span>
        <select name="fonte" required defaultValue="" className={CAMPO}>
          <option value="">Escolha a fonte…</option>
          {fontes.map((x) => (
            <option key={x.codigo} value={x.codigo}>{x.codigo} — {x.descricao}</option>
          ))}
        </select>
      </label>
      <label>
        <span className={ROTULO}>Valor retido (do demonstrativo do banco)</span>
        <input name="valor" required inputMode="decimal" placeholder="0,00" className={CAMPO} />
      </label>
      <label>
        <span className={ROTULO}>Data do crédito</span>
        <input name="dia" type="date" required className={CAMPO} />
      </label>
      <label>
        <span className={ROTULO}>Conta em que a receita foi creditada</span>
        <select name="contaBancaria" required defaultValue="" className={CAMPO}>
          <option value="">Escolha a conta…</option>
          {contas.map((c) => (
            <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>
          ))}
        </select>
      </label>
      <label>
        <span className={ROTULO}>Documento da retenção</span>
        <input name="documento" required minLength={10} maxLength={300} placeholder="Demonstrativo de distribuição da arrecadação, decêndio e mês" className={CAMPO} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Registrando…" : "Registrar dedução"}</button>
        <Resultado estado={estado} acao="registrar-deducao" />
      </div>
    </form>
  );
}

export function FormEstornoDeducao({ deducaoId, rotulo }: { readonly deducaoId: string; readonly rotulo: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaDeducao, FormData>(estornarDeducaoAction, {});
  return (
    <details>
      <summary className="cursor-pointer text-xs underline">Estornar</summary>
      <form action={action} data-acao="estornar-deducao" className="mt-2 grid gap-2 text-xs" aria-label={`Estornar a dedução ${rotulo}`}>
        <ChaveDeComando />
        <input type="hidden" name="deducaoId" value={deducaoId} />
        <label>
          <span className={ROTULO}>Data do estorno</span>
          <input name="dia" type="date" required className={CAMPO} />
        </label>
        <label>
          <span className={ROTULO}>Motivo</span>
          <input name="motivo" required minLength={10} maxLength={300} className={CAMPO} />
        </label>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Estornando…" : "Confirmar estorno"}</button>
        <Resultado estado={estado} acao="estornar-deducao" />
      </form>
    </details>
  );
}
