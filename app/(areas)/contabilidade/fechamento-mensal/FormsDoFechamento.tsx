"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { fecharMesAction, reabrirMesAction, type EstadoDoFechamento } from "./actions";

/**
 * Fechar e reabrir um mês (V32). Um formulário por mês: o resultado aparece na linha do mês que o
 * operador acionou, e não num aviso solto no topo da página.
 */

function Resultado({ estado, acao }: { readonly estado: EstadoDoFechamento; readonly acao: string }): React.ReactElement | null {
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" data-resultado-da-acao={acao} className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-2 py-1 text-xs text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  if (estado.erro !== undefined) {
    return (
      <p role="alert" data-resultado-da-acao={acao} className="mt-2 whitespace-pre-line text-xs text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  return null;
}

/**
 * ⚠️ AS DUAS AÇÕES DO MÊS NUM COMPONENTE SÓ, SEMPRE MONTADO (V33). Fechar recarrega a página e a linha
 * passa a oferecer "reabrir"; com um formulário por situação, o de fechar desmontava e a confirmação
 * sumia com o próprio sucesso (a classe de defeito que o percurso da V31 mediu na reserva). E cada
 * ação só aparece para quem a tem: o servidor recusaria de qualquer modo, mas um botão que sempre
 * recusa é um botão que finge função.
 */
export function AcoesDoMes({
  competencia,
  rotulo,
  aberto,
  podeFechar,
  podeReabrir,
}: {
  readonly competencia: string;
  readonly rotulo: string;
  readonly aberto: boolean;
  readonly podeFechar: boolean;
  readonly podeReabrir: boolean;
}): React.ReactElement {
  const [fechou, fechar, fechando] = useActionState<EstadoDoFechamento, FormData>(fecharMesAction, {});
  const [reabriu, reabrir, reabrindo] = useActionState<EstadoDoFechamento, FormData>(reabrirMesAction, {});
  const podeAgora = aberto ? podeFechar : podeReabrir;
  return (
    <div>
      {aberto && podeFechar ? (
        <form action={fechar} data-acao="fechar-mes" data-competencia={competencia}>
          <ChaveDeComando />
          <input type="hidden" name="competencia" value={competencia} />
          <button type="submit" disabled={fechando} className={CLASSE_BOTAO_PRIMARIO} aria-label={`Conferir e fechar ${rotulo}`}>
            {fechando ? "Conferindo…" : "Conferir e fechar"}
          </button>
        </form>
      ) : null}
      {!aberto && podeReabrir ? (
        <form action={reabrir} data-acao="reabrir-mes" data-competencia={competencia} className="flex flex-wrap items-end gap-2">
          <ChaveDeComando />
          <input type="hidden" name="competencia" value={competencia} />
          <label className="min-w-[16rem] flex-1 text-xs text-[color:var(--color-ink-2)]">
            <span className={ROTULO}>Motivo da reabertura de {rotulo}</span>
            <input name="motivo" required minLength={10} maxLength={500} placeholder="Por que o mês precisa ser reaberto" className={CAMPO} />
          </label>
          <button type="submit" disabled={reabrindo} className={CLASSE_BOTAO_PRIMARIO}>
            {reabrindo ? "Reabrindo…" : "Reabrir"}
          </button>
        </form>
      ) : null}
      {!podeAgora ? (
        <span className="text-xs text-[color:var(--color-ink-3)]" data-sem-acao-do-mes>
          {aberto ? "Fechar o mês não está no seu acesso." : "Reabrir o mês não está no seu acesso."}
        </span>
      ) : null}
      <Resultado estado={fechou} acao="fechar-mes" />
      <Resultado estado={reabriu} acao="reabrir-mes" />
    </div>
  );
}
