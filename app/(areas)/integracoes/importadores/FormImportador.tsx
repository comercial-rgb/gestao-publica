"use client";

import { useActionState } from "react";
import { Badge } from "../../../../components/ui/Badge";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { previaAction, confirmarAction, type EstadoImportacao } from "./actions";

/**
 * IMPORTADOR — ilha client em DOIS ATOS (TR 7.10-7.11): a PRÉVIA lê e valida (nada grava); a
 * CONFIRMAÇÃO gera os fatos pelos serviços reais. Um arquivo com violação não é confirmável.
 */
export function FormImportador(): React.ReactElement {
  const [previa, acaoPrevia, pendentePrevia] = useActionState<EstadoImportacao, FormData>(previaAction, {});
  const [conf, acaoConfirmar, pendenteConf] = useActionState<EstadoImportacao, FormData>(confirmarAction, {});

  const p = previa.previaFolha ?? previa.previaTributos;
  const linhasFolha = previa.previaFolha?.linhas ?? [];
  const linhasTrib = previa.previaTributos?.linhas ?? [];

  return (
    <div className="space-y-4">
      <form action={acaoPrevia} className={CLASSE_PAINEL_FORMULARIO}>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">1 · Enviar arquivo e ver a prévia</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-xs text-[color:var(--color-ink-2)]"><span className={ROTULO}>Tipo</span>
            <select name="tipo" className={CAMPO} defaultValue="FOLHA">
              <option value="FOLHA">Folha de pagamento</option>
              <option value="TRIBUTOS">Arrecadação tributária</option>
            </select></label>
          <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2"><span className={ROTULO}>Arquivo CSV (UTF-8, separador “;”)</span>
            <input type="file" name="arquivo" accept=".csv,text/csv" required className={CAMPO} /></label>
        </div>
        <button type="submit" disabled={pendentePrevia} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
          {pendentePrevia ? "Lendo…" : "Ver prévia"}
        </button>
        {previa.erro !== undefined ? (
          <p role="alert" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{previa.erro}</p>
        ) : null}
      </form>

      {p !== undefined ? (
        <div className={CLASSE_PAINEL_FORMULARIO}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">2 · Prévia — {p.nomeArquivo}</h2>
            {p.confirmavel ? <Badge status="ok">confirmável</Badge> : <Badge status="erro">{p.violacoes.length} violação(ões)</Badge>}
            <span className="text-xs text-[color:var(--color-ink-3)]">{p.linhas.length} linha(s) · total {p.totalBruto} · sha256 {p.arquivoHash.slice(0, 12)}…</span>
          </div>

          {p.violacoes.length > 0 ? (
            <ul className="mb-3 space-y-1 text-sm">
              {p.violacoes.slice(0, 20).map((v, i) => (
                <li key={i} className="text-[color:var(--color-status-erro-fg)]">
                  linha <strong>{v.linha}</strong> · campo <code>{v.campo}</code>: {v.detalhe}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  {previa.tipo === "FOLHA" ? (
                    <><th className="py-1 pr-3">Matrícula</th><th className="py-1 pr-3">Nome</th><th className="py-1 pr-3">Ficha</th><th className="py-1 pr-3 text-right">Bruto</th><th className="py-1 pr-3">Consignações</th><th className="py-1 text-right">Líquido</th></>
                  ) : (
                    <><th className="py-1 pr-3">Guia</th><th className="py-1 pr-3">Natureza</th><th className="py-1 pr-3">Fonte</th><th className="py-1 pr-3">Data</th><th className="py-1 text-right">Valor</th></>
                  )}
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {previa.tipo === "FOLHA"
                  ? linhasFolha.map((l) => (
                      <tr key={l.linha} className="border-b border-[color:var(--color-border)]">
                        <td className="py-1 pr-3">{l.matricula}</td><td className="py-1 pr-3">{l.nome}</td>
                        <td className="py-1 pr-3">{l.fichaNumero}</td><td className="py-1 pr-3 text-right">{l.valorBruto}</td>
                        <td className="py-1 pr-3">{l.consignacoes.map((c) => `${c.tipoCodigo} ${c.valor}`).join(" · ") || "—"}</td>
                        <td className="py-1 text-right">{l.valorLiquido}</td>
                      </tr>
                    ))
                  : linhasTrib.map((l) => (
                      <tr key={l.linha} className="border-b border-[color:var(--color-border)]">
                        <td className="py-1 pr-3">{l.guia}</td><td className="py-1 pr-3">{l.naturezaCodigo}</td>
                        <td className="py-1 pr-3">{l.fonteCodigo}</td><td className="py-1 pr-3">{new Date(l.data).toLocaleDateString("pt-BR")}</td>
                        <td className="py-1 text-right">{l.valor}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          <form action={acaoConfirmar} className="mt-4">
            <input type="hidden" name="tipo" value={previa.tipo ?? "FOLHA"} />
            <input type="hidden" name="conteudo" value={previa.conteudo ?? ""} />
            <input type="hidden" name="nomeArquivo" value={previa.nomeArquivo ?? ""} />
            <button type="submit" disabled={!p.confirmavel || pendenteConf} className={CLASSE_BOTAO_PRIMARIO}>
              {pendenteConf ? "Confirmando…" : "3 · Confirmar e gerar os fatos"}
            </button>
            {!p.confirmavel ? (
              <span className="ml-3 text-xs text-[color:var(--color-ink-3)]">Corrija a origem: um arquivo com violação não é confirmável.</span>
            ) : null}
          </form>

          {conf.erro !== undefined ? (
            <p role="alert" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{conf.erro}</p>
          ) : null}
          {conf.sucesso !== undefined ? (
            <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{conf.sucesso}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
