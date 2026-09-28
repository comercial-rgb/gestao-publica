"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { definirDivulgacaoAction, type EstadoDaDivulgacao } from "./actions";

export interface DivulgacaoNaCarta {
  readonly id: string;
  readonly descricao: string;
  readonly divulgada: boolean;
  readonly podeDefinir: boolean;
  readonly historico: readonly {
    readonly de: boolean;
    readonly para: boolean;
    readonly motivo: string;
    readonly quando: string;
    readonly por: string;
  }[];
}

/**
 * A POLÍTICA DE DIVULGAÇÃO DESTA LOCALIZAÇÃO (V10 T3 · N2).
 *
 * ⚠️ O EFEITO VEM ANTES DO BOTÃO, e é o mesmo que o servidor cumpre: divulgar faz o LUGAR
 * aparecer na consulta pública de bens; reservar o tira de lá. Os BENS continuam públicos nos
 * dois casos — o patrimônio é público, e o que se protege é onde ele está.
 */
export function FormDivulgacao({ d }: { readonly d: DivulgacaoNaCarta }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaDivulgacao, FormData>(definirDivulgacaoAction, {});
  const alvo = !d.divulgada;

  return (
    <section
      data-papel="divulgacao-da-localizacao"
      data-divulgada={d.divulgada ? "sim" : "nao"}
      className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4"
    >
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
        Divulgação na consulta pública de bens
      </h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        Situação atual:{" "}
        <strong>{d.divulgada ? "localização divulgada" : "localização não divulgada"}</strong>. Os bens desta
        localização constam da consulta pública em ambos os casos; a divulgação define se o nome da localização é exibido.
      </p>

      {d.podeDefinir ? (
        <form action={action} className="grid gap-3 sm:grid-cols-4" data-acao="definir-divulgacao">
          <ChaveDeComando />
          <input type="hidden" name="__localizacao" value={d.id} />
          <input type="hidden" name="publicavel" value={alvo ? "sim" : "nao"} />
          <label className="text-xs sm:col-span-3">
            <span className={ROTULO}>
              Motivo {alvo ? "da divulgação da localização" : "da retirada da divulgação da localização"}
            </span>
            <input name="motivo" required minLength={10} maxLength={500} className={CAMPO} />
          </label>
          <div className="sm:col-span-4">
            <p className="mb-1 text-xs text-[color:var(--color-ink-2)]">
              {alvo
                ? "Após a confirmação, o nome desta localização será exibido no portal público junto aos bens nela registrados."
                : "Após a confirmação, o nome desta localização deixará de ser exibido no portal público. Os bens continuarão listados, com a localização indicada como não divulgada."}
            </p>
            <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
              {pendente ? "Gravando…" : alvo ? "Divulgar localização" : "Retirar divulgação"}
            </button>
            {estado.erro !== undefined ? (
              <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]">
                {estado.erro}
              </p>
            ) : null}
            {estado.sucesso !== undefined ? (
              <p role="status" className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]">
                {estado.sucesso}
              </p>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="text-xs text-[color:var(--color-ink-3)]">
          O seu perfil permite apenas a consulta desta configuração.
        </p>
      )}

      <h3 className="mt-4 mb-1 text-xs font-semibold text-[color:var(--color-ink-2)]">
        Histórico de alterações
      </h3>
      {d.historico.length === 0 ? (
        <p className="text-xs text-[color:var(--color-ink-3)]">
          Nenhuma alteração registrada. Vale a opção definida no cadastro da localização.
        </p>
      ) : (
        <ul role="list" className="space-y-0.5 text-xs" data-papel="historico-da-divulgacao">
          {d.historico.map((h, i) => (
            <li key={`${h.quando}-${i}`} className="text-[color:var(--color-ink)]">
              {h.quando} — de {h.de ? "divulgada" : "não divulgada"} para {h.para ? "divulgada" : "não divulgada"}, por{" "}
              {h.por}: {h.motivo}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
