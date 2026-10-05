"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { registrarProjecaoAction, retirarProjecaoAction, type EstadoDaProjecao } from "./actions";

export interface OpcaoDePlano {
  readonly valor: string;
  readonly rotulo: string;
}

function Resultado({ estado, acao }: { readonly estado: EstadoDaProjecao; readonly acao: string }): React.ReactElement | null {
  if (estado.sucesso !== undefined) return <p role="status" data-resultado-da-acao={acao} className="text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  if (estado.erro !== undefined) return <p role="alert" data-resultado-da-acao={acao} className="text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  return null;
}

/** Registrar (ou substituir) a projeção de um plano: a tabela vem colada do relatório da avaliação atuarial. */
export function FormProjecao({ exercicio, planos, anosMinimos }: { readonly exercicio: number; readonly planos: readonly OpcaoDePlano[]; readonly anosMinimos: number }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProjecao, FormData>(registrarProjecaoAction, {});
  return (
    <form action={action} data-acao="registrar-projecao-atuarial" className="grid gap-3 text-xs sm:grid-cols-4" aria-label="Registrar a projeção atuarial">
      <ChaveDeComando />
      <input type="hidden" name="exercicio" value={exercicio} />
      <label>
        <span className={ROTULO}>Plano</span>
        <select name="plano" className={CAMPO} defaultValue={planos[0]?.valor} required>
          {planos.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={ROTULO}>Data da avaliação atuarial</span>
        <input type="date" name="dataDaAvaliacao" className={CAMPO} required />
      </label>
      <label>
        <span className={ROTULO}>Saldo financeiro de {exercicio - 2} (controles do ente)</span>
        <input name="saldoFinanceiroAnterior" className={CAMPO} inputMode="decimal" placeholder="0,00" required />
      </label>
      <label className="sm:col-span-4">
        <span className={ROTULO}>Documento (relatório da avaliação, atuário, envio à Secretaria de Previdência)</span>
        <input name="documento" className={CAMPO} required minLength={10} />
      </label>
      <label className="sm:col-span-4">
        <span className={ROTULO}>
          Projeção: uma linha por ano, de {exercicio - 1} em diante, ao menos {anosMinimos} anos — ano; receitas; despesas (ponto e vírgula ou tabulação, como sai da planilha)
        </span>
        <textarea name="tabela" rows={10} className={`${CAMPO} font-mono`} placeholder={`${String(exercicio - 1)};1.234.567,89;987.654,32`} required />
      </label>
      <div className="sm:col-span-4 flex items-center gap-3">
        <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
          Registrar a projeção
        </button>
        <Resultado estado={estado} acao="registrar-projecao-atuarial" />
      </div>
    </form>
  );
}

export function FormRetirarProjecao({ exercicio, plano, rotulo }: { readonly exercicio: number; readonly plano: string; readonly rotulo: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProjecao, FormData>(retirarProjecaoAction, {});
  return (
    <form action={action} data-acao={`retirar-projecao-atuarial-${plano}`} className="flex items-center gap-2 text-xs" aria-label={`Retirar a projeção do ${rotulo}`}>
      <ChaveDeComando />
      <input type="hidden" name="exercicio" value={exercicio} />
      <input type="hidden" name="plano" value={plano} />
      <button type="submit" className="underline" disabled={pendente}>
        Retirar do demonstrativo
      </button>
      <Resultado estado={estado} acao={`retirar-projecao-atuarial-${plano}`} />
    </form>
  );
}
