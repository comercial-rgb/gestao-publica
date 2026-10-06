"use client";

import { useActionState, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { estornarDeducaoAction, registrarDeducaoAction, registrarLoteDeDeducoesAction, type EstadoDaDeducao } from "./actions";

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

/** V36 (TR 5.10.2.5) — os dados de uma dedução escolhida em "duplicar". */
export interface CopiaParaDeducao {
  readonly origem: string;
  readonly natureza: string;
  readonly fonte: string;
  readonly contaBancaria: string;
  readonly valor: string;
  readonly documento: string;
}

export function FormDeducao({
  naturezas,
  fontes,
  contas,
  copia,
}: {
  readonly naturezas: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly fontes: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly contas: readonly { readonly codigo: string; readonly descricao: string }[];
  /** V36 — preenchimento a partir de uma dedução existente; a data fica para o usuário. */
  readonly copia?: CopiaParaDeducao | undefined;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaDeducao, FormData>(registrarDeducaoAction, {});
  return (
    <form action={action} data-acao="registrar-deducao" className="grid gap-3 text-xs sm:grid-cols-2" aria-label="Registrar a dedução da receita para o FUNDEB">
      <ChaveDeComando />
      {copia !== undefined ? (
        <p data-copia-de={copia.origem} className="rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-[color:var(--color-status-alerta-fg)] sm:col-span-2">
          Preenchido a partir da {copia.origem}. Informe a data do crédito e confira o valor antes de registrar.
        </p>
      ) : null}
      <label>
        <span className={ROTULO}>Receita deduzida (natureza arrecadada no exercício)</span>
        <select name="naturezaReceita" required defaultValue={copia?.natureza ?? ""} className={CAMPO}>
          <option value="">Escolha a natureza…</option>
          {naturezas.map((n) => (
            <option key={n.codigo} value={n.codigo}>{n.codigo} — {n.descricao}</option>
          ))}
        </select>
      </label>
      <label>
        <span className={ROTULO}>Fonte da receita</span>
        <select name="fonte" required defaultValue={copia?.fonte ?? ""} className={CAMPO}>
          <option value="">Escolha a fonte…</option>
          {fontes.map((x) => (
            <option key={x.codigo} value={x.codigo}>{x.codigo} — {x.descricao}</option>
          ))}
        </select>
      </label>
      <label>
        <span className={ROTULO}>Valor retido (do demonstrativo do banco)</span>
        <input name="valor" required inputMode="decimal" defaultValue={copia?.valor.replace(".", ",")} placeholder="0,00" className={CAMPO} />
      </label>
      <label>
        <span className={ROTULO}>Data do crédito</span>
        <input name="dia" type="date" required className={CAMPO} />
      </label>
      <label>
        <span className={ROTULO}>Conta em que a receita foi creditada</span>
        <select name="contaBancaria" required defaultValue={copia?.contaBancaria ?? ""} className={CAMPO}>
          <option value="">Escolha a conta…</option>
          {contas.map((c) => (
            <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>
          ))}
        </select>
      </label>
      <label>
        <span className={ROTULO}>Documento da retenção</span>
        <input name="documento" required minLength={10} maxLength={300} defaultValue={copia?.documento} placeholder="Demonstrativo de distribuição da arrecadação, decêndio e mês" className={CAMPO} />
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

/**
 * V36 (TR 5.10.2.11) — VÁRIAS DEDUÇÕES DE UMA VEZ, COM UMA SÓ CONTA: o demonstrativo do banco do dia, linha a linha.
 * Dia, conta e documento valem para o lote inteiro; o lote é gravado inteiro ou recusado inteiro, com a linha nomeada.
 */
export function FormLoteDeDeducoes({
  naturezas,
  fontes,
  contas,
}: {
  readonly naturezas: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly fontes: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly contas: readonly { readonly codigo: string; readonly descricao: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaDeducao, FormData>(registrarLoteDeDeducoesAction, {});
  const [linhas, setLinhas] = useState(2);
  return (
    <form action={action} data-acao="registrar-lote-de-deducoes" className="grid gap-3 text-xs" aria-label="Registrar várias deduções da receita com uma só conta">
      <ChaveDeComando />
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className={ROTULO}>Data do crédito</span>
          <input name="dia" type="date" required className={CAMPO} />
        </label>
        <label>
          <span className={ROTULO}>Conta em que as receitas foram creditadas</span>
          <select name="contaBancaria" required defaultValue="" className={CAMPO}>
            <option value="">Escolha a conta…</option>
            {contas.map((c) => (
              <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={ROTULO}>Documento da retenção</span>
          <input name="documento" required minLength={10} maxLength={300} placeholder="Demonstrativo de distribuição da arrecadação do dia" className={CAMPO} />
        </label>
      </div>
      <table className="w-full text-left" data-lista="linhas-do-lote">
        <caption className="sr-only">Deduções do lote</caption>
        <thead>
          <tr className="text-[color:var(--color-ink-3)]">
            <th scope="col" className="py-1 pr-2">Linha</th>
            <th scope="col" className="py-1 pr-2">Receita deduzida</th>
            <th scope="col" className="py-1 pr-2">Fonte</th>
            <th scope="col" className="py-1 pr-2">Valor retido</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: linhas }, (_, i) => (
            <tr key={i} data-linha-do-lote={i + 1}>
              <td className="py-1 pr-2">{i + 1}</td>
              <td className="py-1 pr-2">
                <select name="naturezaReceita" defaultValue="" aria-label={`Receita deduzida da linha ${String(i + 1)}`} className={CAMPO}>
                  <option value="">Escolha a natureza…</option>
                  {naturezas.map((n) => (
                    <option key={n.codigo} value={n.codigo}>{n.codigo} — {n.descricao}</option>
                  ))}
                </select>
              </td>
              <td className="py-1 pr-2">
                <select name="fonte" defaultValue="" aria-label={`Fonte da linha ${String(i + 1)}`} className={CAMPO}>
                  <option value="">Escolha a fonte…</option>
                  {fontes.map((x) => (
                    <option key={x.codigo} value={x.codigo}>{x.codigo} — {x.descricao}</option>
                  ))}
                </select>
              </td>
              <td className="py-1 pr-2">
                <input name="valor" inputMode="decimal" placeholder="0,00" aria-label={`Valor retido da linha ${String(i + 1)}`} className={CAMPO} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setLinhas((n) => n + 1)} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 py-1.5">
          Acrescentar linha
        </button>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Registrando…" : "Registrar o lote"}</button>
      </div>
      <p className="text-[color:var(--color-ink-3)]">Linhas em branco são ignoradas. Se uma linha não couber na receita arrecadada, nada do lote é gravado e a mensagem diz qual linha.</p>
      <Resultado estado={estado} acao="registrar-lote-de-deducoes" />
    </form>
  );
}
