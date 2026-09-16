"use client";

import { useActionState, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { prepararLoteAction, type EstadoDoLancamento } from "./actions";

export interface OpcoesDoLote {
  readonly hoje: string;
  readonly fontes: readonly { readonly id: string; readonly codigo: string; readonly descricao: string }[];
  readonly imoveis: readonly { readonly id: string; readonly inscricao: string }[];
}

/**
 * O FORMULÁRIO DO LOTE — ilha client.
 *
 * ⚠️ OS IMÓVEIS SÃO ESCOLHIDOS POR CAIXA, e a lista vem RECORTADA do servidor (200, ordenada
 * pela inscrição). Um `select` com todos os imóveis de um município seria o formulário bonito e
 * inútil que a interface deste repositório proíbe.
 *
 * ⚠️ OS VENCIMENTOS SÃO DIGITADOS PELO ENTE, um por linha. Não há calendário padrão: um
 * calendário tributário cravado no código seria calendário inventado.
 */
export function FormLote({ opcoes }: { readonly opcoes: OpcoesDoLote }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoLancamento, FormData>(prepararLoteAction, {});
  const [selecionados, setSelecionados] = useState<readonly string[]>([]);
  const exercicio = Number(opcoes.hoje.slice(0, 4));

  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} data-acao="preparar-lote">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Preparar um lote</h2>
      <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
        Preparar calcula e congela a memória de cada imóvel. <strong>Não constitui crédito nenhum</strong>:
        o lote sai revisável, e constituir é ato à parte, um lançamento por vez.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-xs">
          <span className={ROTULO}>Número do lote</span>
          <input name="numero" required maxLength={40} defaultValue={`IPTU/${exercicio}/001`} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Tributo</span>
          <select name="tributo" defaultValue="IPTU" className={CAMPO}>
            <option value="IPTU">IPTU</option>
            <option value="ITBI">ITBI</option>
            <option value="ISS">ISS</option>
            <option value="TAXA">Taxa</option>
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Exercício</span>
          <input name="exercicio" type="number" required min={2000} max={2100} defaultValue={exercicio} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Data do fato gerador</span>
          <input name="fatoGerador" type="date" required defaultValue={`${exercicio}-01-01`} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Natureza da receita (8 dígitos)</span>
          <input name="naturezaCodigo" required pattern="\d{8}" maxLength={8} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Fonte de recurso</span>
          <select name="fonteId" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              escolha a fonte
            </option>
            {opcoes.fontes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo} — {f.descricao}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs sm:col-span-3">
          <span className={ROTULO}>Descrição do lote</span>
          <input name="descricao" required minLength={5} maxLength={200} className={CAMPO} />
        </label>
        <label className="text-xs sm:col-span-3">
          <span className={ROTULO}>Vencimentos, em ordem, separados por vírgula (AAAA-MM-DD)</span>
          <input
            name="vencimentos"
            required
            defaultValue={`${exercicio}-03-10`}
            placeholder={`${exercicio}-03-10, ${exercicio}-04-10, ${exercicio}-05-10`}
            className={CAMPO}
          />
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className={ROTULO}>Imóveis do lote</legend>
        <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
          {opcoes.imoveis.length} imóvel(is) na lista, ordenados pela inscrição. Selecionados:{" "}
          <span data-papel="selecionados">{selecionados.length}</span>.
        </p>
        <div className="max-h-56 overflow-y-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2">
          {opcoes.imoveis.map((i) => (
            <label key={i.id} className="flex items-center gap-2 py-0.5 text-xs">
              <input
                type="checkbox"
                value={i.id}
                checked={selecionados.includes(i.id)}
                onChange={(e) =>
                  setSelecionados((atual) =>
                    e.target.checked ? [...atual, i.id] : atual.filter((x) => x !== i.id)
                  )
                }
                className="h-4 w-4"
              />
              <span className="tabular text-[color:var(--color-ink)]">{i.inscricao}</span>
            </label>
          ))}
        </div>
        <input type="hidden" name="imoveisIds" value={selecionados.join(",")} />
      </fieldset>

      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}

      <button type="submit" disabled={pendente || selecionados.length === 0} className={`${CLASSE_BOTAO_PRIMARIO} mt-4`}>
        {pendente ? "Preparando…" : `Preparar ${selecionados.length} lançamento(s)`}
      </button>
    </form>
  );
}
