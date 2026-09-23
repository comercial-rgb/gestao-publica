"use client";

import { useActionState, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { atribuirEntidadeAction, type EstadoDaAtribuicao } from "./actions";

export interface OpcaoDeEntidade {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
}

export interface OpcaoDeAto {
  readonly codigo: string;
  readonly rotulo: string;
}

export function FormAtribuir({
  receitaArrecadadaId,
  numeroReceita,
  entidades,
  tiposDeAto,
}: {
  readonly receitaArrecadadaId: string;
  readonly numeroReceita: string;
  readonly entidades: readonly OpcaoDeEntidade[];
  readonly tiposDeAto: readonly OpcaoDeAto[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaAtribuicao, FormData>(
    atribuirEntidadeAction,
    {}
  );
  const [aberto, setAberto] = useState(false);
  const [seq, setSeq] = useState(0);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);
  const marca = estado.sucesso ?? estado.erro;
  if (marca !== undefined && marca !== ultimo) {
    setUltimo(marca);
    setSeq((n) => n + 1);
    if (estado.sucesso !== undefined) setAberto(false);
  }

  const resultado =
    marca === undefined ? null : (
      <p
        role={estado.erro !== undefined ? "alert" : "status"}
        data-resultado-da-acao="atribuir-entidade"
        data-resultado-seq={String(seq)}
        className={`mt-2 rounded-[var(--radius-md)] px-3 py-2 text-sm ${
          estado.erro !== undefined
            ? "bg-[color:var(--color-status-erro-bg)] text-[color:var(--color-status-erro-fg)]"
            : "bg-[color:var(--color-status-ok-bg)] text-[color:var(--color-status-ok-fg)]"
        }`}
      >
        {estado.erro ?? estado.sucesso}
      </p>
    );

  if (!aberto) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="text-xs underline"
          data-papel={`atribuir-${numeroReceita}`}
        >
          Atribuir entidade a esta guia
        </button>
        {resultado}
      </div>
    );
  }

  return (
    <form
      action={action}
      className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3"
    >
      <ChaveDeComando />
      <input type="hidden" name="receitaArrecadadaId" value={receitaArrecadadaId} />
      <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">
        Isto <strong>não altera a guia</strong>: grava um registro novo, com o seu nome, o motivo e
        o ato que fundamenta. O ato precisa mencionar a entidade que você escolher.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Entidade titular</span>
          <select name="entidadeId" required defaultValue="" className={CAMPO}>
            <option value="">Escolha a entidade…</option>
            {entidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo} — {e.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Motivo</span>
          <input name="motivo" required minLength={5} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Tipo do ato</span>
          <select name="atoTipo" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {tiposDeAto.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Número do ato</span>
          <input name="atoNumero" required className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Ano do ato</span>
          <input name="atoAno" required inputMode="numeric" className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Dispositivo</span>
          <input name="atoDispositivo" required className={CAMPO} placeholder="art. 2º" />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Trecho citado do ato</span>
          <textarea name="atoCitacao" required rows={3} className={CAMPO} />
        </label>
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>
        {pendente ? "Atribuindo…" : "Atribuir entidade"}
      </button>
      {resultado}
    </form>
  );
}
