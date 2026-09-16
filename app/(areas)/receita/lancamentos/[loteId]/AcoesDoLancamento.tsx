"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import {
  cancelarAction,
  constituirAction,
  retificarAction,
  type EstadoDoLancamento,
} from "../actions";

function Resultado({ estado }: { readonly estado: EstadoDoLancamento }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

/**
 * OS ATOS DE UM LANÇAMENTO — ilha client, uma por linha da tabela.
 *
 * ⚠️ A PRÉVIA DA CONSEQUÊNCIA VEM ANTES DO BOTÃO, e é o texto que o servidor cumpre:
 * constituir faz o crédito nascer no razão sem tocar o caixa; cancelar baixa por VPD e
 * preserva a VPA do fato gerador; retificar cria um substituto PREPARADO — não constituído.
 */
export function AcoesDoLancamento({
  loteId,
  lancamentoId,
  inscricao,
  situacao,
  temInconsistencia,
  podeConstituir,
  podeRetificar,
  podeCancelar,
}: {
  readonly loteId: string;
  readonly lancamentoId: string;
  readonly inscricao: string;
  readonly situacao: string;
  readonly temInconsistencia: boolean;
  readonly podeConstituir: boolean;
  readonly podeRetificar: boolean;
  readonly podeCancelar: boolean;
}): React.ReactElement {
  const [estCon, acaoCon, pendCon] = useActionState<EstadoDoLancamento, FormData>(constituirAction, {});
  const [estRet, acaoRet, pendRet] = useActionState<EstadoDoLancamento, FormData>(retificarAction, {});
  const [estCan, acaoCan, pendCan] = useActionState<EstadoDoLancamento, FormData>(cancelarAction, {});

  const encerrado = situacao === "CANCELADO" || situacao === "RETIFICADO";

  return (
    <div className="space-y-3" data-lancamento={inscricao}>
      {podeConstituir && situacao === "PREPARADO" ? (
        <form action={acaoCon} data-acao="constituir-credito">
          <ChaveDeComando />
          <input type="hidden" name="__lancamento" value={lancamentoId} />
          <input type="hidden" name="__lote" value={loteId} />
          <p className="mb-1 text-xs text-[color:var(--color-ink-3)]">
            Constituir faz o crédito nascer no razão (crédito a receber contra variação patrimonial
            aumentativa). O caixa não é tocado: arrecadar é outro fato, e ele baixa este crédito.
            {temInconsistencia ? " Este lançamento tem pendência de revisão, e o servidor vai recusar." : ""}
          </p>
          <button type="submit" disabled={pendCon} className={CLASSE_BOTAO_PRIMARIO}>
            {pendCon ? "Constituindo…" : `Constituir o crédito do imóvel ${inscricao}`}
          </button>
          <Resultado estado={estCon} />
        </form>
      ) : null}

      {podeRetificar && !encerrado ? (
        <form action={acaoRet} className="grid gap-2 sm:grid-cols-4" data-acao="retificar-lancamento">
          <ChaveDeComando />
          <input type="hidden" name="__lancamento" value={lancamentoId} />
          <input type="hidden" name="__lote" value={loteId} />
          <label className="text-xs sm:col-span-3">
            <span className={ROTULO}>Motivo da retificação</span>
            <input name="motivo" required minLength={10} maxLength={500} className={CAMPO} />
          </label>
          <div className="sm:col-span-4">
            <p className="mb-1 text-xs text-[color:var(--color-ink-3)]">
              Retificar cancela este lançamento e prepara um substituto com o cadastro e a tabela de
              hoje. O substituto nasce PREPARADO — constituir o crédito dele continua sendo ato à parte.
            </p>
            <button type="submit" disabled={pendRet} className={CLASSE_BOTAO_PRIMARIO}>
              {pendRet ? "Retificando…" : `Retificar o lançamento do imóvel ${inscricao}`}
            </button>
            <Resultado estado={estRet} />
          </div>
        </form>
      ) : null}

      {podeCancelar && !encerrado ? (
        <form action={acaoCan} className="grid gap-2 sm:grid-cols-4" data-acao="cancelar-lancamento">
          <ChaveDeComando />
          <input type="hidden" name="__lancamento" value={lancamentoId} />
          <input type="hidden" name="__lote" value={loteId} />
          <label className="text-xs sm:col-span-3">
            <span className={ROTULO}>Motivo do cancelamento</span>
            <input name="motivo" required minLength={10} maxLength={500} className={CAMPO} />
          </label>
          <div className="sm:col-span-4">
            <p className="mb-1 text-xs text-[color:var(--color-ink-3)]">
              Cancelar um crédito já constituído o baixa por variação patrimonial DIMINUTIVA — a
              renúncia fica registrada. A variação aumentativa do fato gerador permanece: ela foi
              verdadeira quando aconteceu.
            </p>
            <button type="submit" disabled={pendCan} className={CLASSE_BOTAO_PRIMARIO}>
              {pendCan ? "Cancelando…" : `Cancelar o lançamento do imóvel ${inscricao}`}
            </button>
            <Resultado estado={estCan} />
          </div>
        </form>
      ) : null}
    </div>
  );
}
