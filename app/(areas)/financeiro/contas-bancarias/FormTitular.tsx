"use client";

import { useActionState, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { declararTitularAction, type EstadoDoTitular } from "./actions";

export interface OpcaoDeEntidade {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
}

export interface OpcaoDeAto {
  readonly codigo: string;
  readonly rotulo: string;
}

/**
 * DECLARAR DE QUEM É UMA CONTA (V11 V9).
 *
 * ⚠️ O FORMULÁRIO CONFIRMA ACIMA DA LINHA QUE ELE MUDA. Declarar titular altera a própria linha
 * da conta; um aviso guardado dentro dela morreria junto com o `revalidatePath`. É a mesma cura
 * que o guichê (V8) precisou.
 *
 * ⚠️ E ELE DIZ O QUE **NÃO** ACONTECE. Trocar o titular não reescreve as guias já arrecadadas.
 * Sem essa frase, quem troca supõe que "arrumou" o passado — e depois estranha a consulta.
 */
export function FormTitular({
  contaBancariaId,
  contaCodigo,
  entidades,
  tiposDeAto,
  jaTemTitular,
  identificacaoBancaria,
}: {
  readonly contaBancariaId: string;
  readonly contaCodigo: string;
  readonly entidades: readonly OpcaoDeEntidade[];
  readonly tiposDeAto: readonly OpcaoDeAto[];
  readonly jaTemTitular: boolean;
  readonly identificacaoBancaria: string | null;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoTitular, FormData>(
    declararTitularAction,
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
        data-resultado-da-acao="declarar-titular"
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

  if (entidades.length === 0) {
    return (
      <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">
        Nenhuma entidade contábil cadastrada ainda. Cadastre em{" "}
        <strong>Contabilidade &gt; Entidades contábeis</strong> antes de declarar o titular.
      </p>
    );
  }

  if (!aberto) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="text-xs underline"
          data-papel={`declarar-titular-${contaCodigo}`}
        >
          {jaTemTitular ? "Alterar o titular desta conta" : "Declarar o titular desta conta"}
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
      <input type="hidden" name="contaBancariaId" value={contaBancariaId} />
      <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">
        Informe o ato de <strong>criação da entidade</strong> (com o nome ou o CNPJ) ou o ato de{" "}
        <strong>abertura desta conta</strong>
        {identificacaoBancaria === null
          ? "; como a conta ainda não tem banco, agência e número cadastrados, o ato deve citar a entidade"
          : ` (com a identificação ${identificacaoBancaria})`}
        . O trecho citado deve mencionar a entidade ou a conta.
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
          <input name="atoDispositivo" required className={CAMPO} placeholder="art. 1º" />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Trecho citado do ato</span>
          <textarea name="atoCitacao" required rows={3} className={CAMPO} />
        </label>
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>
        {pendente ? "Declarando…" : "Declarar titular"}
      </button>
      {resultado}
    </form>
  );
}
