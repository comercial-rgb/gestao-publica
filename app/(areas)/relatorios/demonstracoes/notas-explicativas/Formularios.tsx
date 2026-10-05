"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { redigirNotaAction, retirarNotaAction, type EstadoDaNota } from "./actions";

export interface Opcao {
  readonly valor: string;
  readonly rotulo: string;
}

export interface NotaInicial {
  readonly chave: string;
  readonly secao: string;
  readonly demonstracao: string;
  readonly ordem: number;
  readonly titulo: string;
  readonly texto: string;
}

function Resultado({ estado, acao }: { readonly estado: EstadoDaNota; readonly acao: string }): React.ReactElement | null {
  if (estado.sucesso !== undefined) return <p role="status" data-resultado-da-acao={acao} className="text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  if (estado.erro !== undefined) return <p role="alert" data-resultado-da-acao={acao} className="text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  return null;
}

/** Nota nova (tema em branco ou um tema obrigatório) ou revisão de uma nota existente (`inicial`, chave fixa). */
export function FormNota({
  exercicio,
  secoes,
  demonstracoes,
  temas,
  inicial,
}: {
  readonly exercicio: number;
  readonly secoes: readonly Opcao[];
  readonly demonstracoes: readonly Opcao[];
  readonly temas: readonly Opcao[];
  readonly inicial?: NotaInicial;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaNota, FormData>(redigirNotaAction, {});
  const acao = inicial === undefined ? "redigir-nota-explicativa" : `revisar-nota-explicativa-${inicial.chave}`;
  return (
    <form action={action} data-acao={acao} className="grid gap-3 text-xs sm:grid-cols-4" aria-label={inicial === undefined ? "Redigir nota explicativa" : `Revisar a nota ${inicial.chave}`}>
      <ChaveDeComando />
      <input type="hidden" name="exercicio" value={exercicio} />
      {inicial === undefined ? (
        <label>
          <span className={ROTULO}>Tema</span>
          <select name="chave" className={CAMPO} defaultValue="">
            <option value="">Nota nova (numerada pelo sistema)</option>
            {temas.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="chave" value={inicial.chave} />
      )}
      <label>
        <span className={ROTULO}>Seção</span>
        <select name="secao" required className={CAMPO} defaultValue={inicial?.secao ?? ""}>
          <option value="" disabled>
            Escolha
          </option>
          {secoes.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={ROTULO}>Refere-se a</span>
        <select name="demonstracao" required className={CAMPO} defaultValue={inicial?.demonstracao ?? "CONJUNTO"}>
          {demonstracoes.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={ROTULO}>Posição na seção</span>
        <input name="ordem" inputMode="numeric" defaultValue={inicial?.ordem ?? 1} className={CAMPO} />
      </label>
      <label className="sm:col-span-4">
        <span className={ROTULO}>Título</span>
        <input name="titulo" required minLength={3} maxLength={200} defaultValue={inicial?.titulo ?? ""} className={CAMPO} />
      </label>
      <label className="sm:col-span-4">
        <span className={ROTULO}>Texto (linha em branco separa parágrafos)</span>
        <textarea name="texto" required minLength={20} rows={6} defaultValue={inicial?.texto ?? ""} className={CAMPO} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-4">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Gravando…" : inicial === undefined ? "Gravar nota" : "Gravar nova versão"}
        </button>
        <Resultado estado={estado} acao={acao} />
      </div>
    </form>
  );
}

export function FormRetirar({ exercicio, chave }: { readonly exercicio: number; readonly chave: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaNota, FormData>(retirarNotaAction, {});
  const acao = `retirar-nota-explicativa-${chave}`;
  return (
    <form action={action} data-acao={acao} className="flex flex-col gap-2 text-xs" aria-label={`Retirar a nota ${chave}`}>
      <ChaveDeComando />
      <input type="hidden" name="exercicio" value={exercicio} />
      <input type="hidden" name="chave" value={chave} />
      <button type="submit" disabled={pendente} className="self-start rounded border border-[color:var(--color-border)] px-3 py-1">
        {pendente ? "Retirando…" : "Retirar do documento"}
      </button>
      <Resultado estado={estado} acao={acao} />
    </form>
  );
}
