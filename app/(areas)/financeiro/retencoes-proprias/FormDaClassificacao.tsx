"use client";

import { useActionState, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import type { OpcoesDaClassificacao } from "../../../../lib/portas/retencoes-proprias";
import { classificarAction, type EstadoDoAto } from "./actions";

/**
 * V26 — O FORMULÁRIO DA DECISÃO DO ENTE sobre o IR e o ISS retidos pelo próprio município.
 *
 * ⚠️ SEM DEFAULT EM NENHUM CAMPO CONTÁBIL. Natureza, destinação e contas são decisão do ente; um valor pré-escolhido
 * a tomaria em silêncio. As listas já vêm recortadas pelo servidor (só principal, só analíticas da família).
 */
export function FormDaClassificacao({ opcoes }: { readonly opcoes: OpcoesDaClassificacao }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(classificarAction, {});
  const [aberto, setAberto] = useState(false);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);
  const [seq, setSeq] = useState(0);
  const [fato, setFato] = useState("");

  if (estado.sucesso !== undefined && estado.sucesso !== ultimo) {
    setUltimo(estado.sucesso);
    setSeq((n) => n + 1);
    setAberto(false);
  }

  const confirmacao =
    estado.sucesso === undefined ? null : (
      <p
        role="status"
        data-resultado-da-acao="classificar-retencao-propria"
        data-resultado-seq={String(seq)}
        className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
      >
        {estado.sucesso}
      </p>
    );

  if (!aberto) {
    return (
      <div className={CLASSE_PAINEL_FORMULARIO}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Registrar uma decisão</h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
              Para cada imposto retido pelo município: a natureza de receita, a destinação e as contas do reconhecimento.
            </p>
          </div>
          <button type="button" onClick={() => setAberto(true)} className={CLASSE_BOTAO_PRIMARIO}>
            Registrar decisão
          </button>
        </div>
        {confirmacao}
      </div>
    );
  }

  // A VPA do IR é de imposto sobre a renda; a do ISS, de imposto sobre serviços. O recorte acompanha o imposto.
  const familia = fato === "" ? null : fato === "ISS" ? "4.1.1.3." : "4.1.1.2.";
  const vpas = familia === null ? [] : opcoes.contasVpa.filter((c) => c.codigo.startsWith(familia));

  return (
    <form action={action} data-acao="classificar-retencao-propria" className={CLASSE_PAINEL_FORMULARIO} aria-label="Registrar a decisão sobre um imposto retido pelo município">
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Registrar uma decisão</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs">
          <span className={ROTULO}>Imposto retido</span>
          <select name="fato" required value={fato} onChange={(e) => setFato(e.target.value)} className={CAMPO}>
            <option value="">Escolha…</option>
            {opcoes.fatos.map((o) => (
              <option key={o.fato} value={o.fato}>{o.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Consignação em que era retido</span>
          <select name="tipoConsignacaoCodigo" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {opcoes.tipos.map((o) => (
              <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.descricao}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Natureza de receita (principal)</span>
          <select name="naturezaReceitaCodigo" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {opcoes.naturezas.map((o) => (
              <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.descricao}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Destinação (fonte) da receita</span>
          <select name="fonteCodigo" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {opcoes.fontes.map((o) => (
              <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.descricao}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Conta do crédito tributário</span>
          <select name="contaCreditoCodigo" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {opcoes.contasCredito.map((o) => (
              <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.nome}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Conta da variação patrimonial do imposto</span>
          <select name="contaVpaCodigo" required defaultValue="" className={CAMPO} disabled={familia === null}>
            <option value="">{familia === null ? "Escolha primeiro o imposto" : "Escolha…"}</option>
            {vpas.map((o) => (
              <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.nome}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Entidade titular da receita</span>
          <select name="entidadeTitularId" defaultValue="" className={CAMPO}>
            <option value="">Município (sem entidades cadastradas)</option>
            {opcoes.entidades.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Vale a partir de</span>
          <input type="date" name="vigenteDesde" required className={CAMPO} />
        </label>
        <label className="text-xs sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>De onde vem a decisão</span>
          <input name="fundamento" required minLength={10} maxLength={500} placeholder="Orientação do contador, ato do município ou manual de contabilidade" className={CAMPO} />
        </label>
      </div>
      <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">
        A decisão fica registrada com o seu nome e a data. Ela vale para os pagamentos a partir da data informada;
        os pagamentos anteriores não mudam. Pagamentos feitos de conta de outra entidade continuam retendo o imposto
        para repasse ao município.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Gravando…" : "Registrar decisão"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-[color:var(--color-ink-3)] hover:underline">
          Cancelar
        </button>
        {estado.erro !== undefined ? (
          <span role="alert" className="text-xs whitespace-pre-line text-[color:var(--color-status-erro-fg)]">{estado.erro}</span>
        ) : null}
      </div>
    </form>
  );
}
