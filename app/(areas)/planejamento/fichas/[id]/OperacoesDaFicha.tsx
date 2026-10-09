import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import type { OperacoesDaFicha, ReservaDaFicha } from "../../../../../lib/portas/operacoes-da-ficha";
import type { EmpenhoDaTela } from "../../../../../lib/portas/empenho";
import { dataBr } from "../../../../../lib/recorte";
import { toMoney } from "../../../../../packages/contracts/index";
import { FormLiberarReserva, FormReservar } from "./FormsDaDotacao";
import { diaCivil } from "../../../../../packages/datas/index";

/**
 * AS OPERAÇÕES DA DOTAÇÃO (V31) — da ficha para as reservas (e o processo de cada uma) e para os empenhos,
 * com o que falta liquidar e pagar. Os números vêm das portas; a tela não refaz conta.
 */

const LINK = "text-[color:var(--color-primary)] underline";

export function OperacoesDaFichaSecao({
  o,
  disponivel,
  podeReservar,
  podeLiberar,
  podeEmpenhar = false,
}: {
  readonly o: OperacoesDaFicha;
  readonly disponivel: string;
  readonly podeReservar: boolean;
  readonly podeLiberar: boolean;
  /** V37 — o passo seguinte da trilha: empenhar com a reserva, para quem empenha. */
  readonly podeEmpenhar?: boolean;
}): React.ReactElement {
  const colunasReserva: readonly ColunaTabela<ReservaDaFicha>[] = [
    { chave: "data", cabecalho: "Data", celula: (r) => dataBr(r.data) },
    {
      chave: "finalidade",
      cabecalho: "Finalidade",
      celula: (r) => (
        <span>
          {r.historico}
          <span className="block text-xs text-[color:var(--color-ink-3)]">
            {r.processo === null ? (
              "reserva avulsa"
            ) : (
              <Link className={LINK} href={`/licitacoes/processos/${r.processo.id}`}>
                processo {r.processo.numero}
              </Link>
            )}{" "}
            · por {r.criadoPor}
          </span>
        </span>
      ),
    },
    { chave: "valor", cabecalho: "Reservado", alinhamento: "direita", celula: (r) => <ValorMonetario valor={r.valor} /> },
    { chave: "consumido", cabecalho: "Consumido por empenhos", alinhamento: "direita", celula: (r) => <ValorMonetario valor={r.consumido} /> },
    {
      chave: "saldo",
      cabecalho: "Saldo",
      alinhamento: "direita",
      celula: (r) => (r.liberada ? <Badge status="neutro">Liberada</Badge> : <ValorMonetario valor={r.saldo} />),
    },
    {
      chave: "acao",
      cabecalho: "",
      celula: (r) =>
        // Montado também depois de liberada, para a confirmação não sumir com o próprio sucesso.
        // V36 — o bloqueio de uma prévia se desfaz pela prévia (efetivação ou descarte), não aqui.
        r.previa !== null ? (
          <Link className={LINK} href={`/planejamento/previas/${r.previa.id}`}>
            Bloqueio da {r.previa.rotulo}
          </Link>
        ) : (podeLiberar && (r.liberada || toMoney(r.saldo).greaterThan(0))) || (podeEmpenhar && !r.liberada && toMoney(r.saldo).greaterThan(0)) ? (
          <span className="flex flex-wrap items-center gap-3">
            {podeEmpenhar && !r.liberada && toMoney(r.saldo).greaterThan(0) ? (
              <Link className={LINK} href={`/despesa/empenhos?exercicio=${String(o.exercicio)}&reservaId=${r.id}`} data-proximo-passo="empenhar">
                Empenhar com esta reserva
              </Link>
            ) : null}
            {podeLiberar && (r.liberada || toMoney(r.saldo).greaterThan(0)) ? (
              <FormLiberarReserva fichaId={o.fichaId} reservaId={r.id} rotulo={`a reserva de ${dataBr(r.criadoEm)}`} liberada={r.liberada} />
            ) : null}
          </span>
        ) : null,
    },
  ];
  const colunasEmpenho: readonly ColunaTabela<EmpenhoDaTela>[] = [
    {
      chave: "numero",
      cabecalho: "Empenho",
      celula: (e) => (
        <Link className={LINK} href={`/despesa/empenhos/${e.id}`}>
          {e.numero}
        </Link>
      ),
    },
    { chave: "data", cabecalho: "Data", celula: (e) => dataBr(e.data) },
    { chave: "credor", cabecalho: "Credor", celula: (e) => e.credorNome ?? e.credorCpfCnpj },
    { chave: "valor", cabecalho: "Empenhado líquido", alinhamento: "direita", celula: (e) => <ValorMonetario valor={e.empenhadoLiquido} /> },
    { chave: "aliq", cabecalho: "A liquidar", alinhamento: "direita", celula: (e) => <ValorMonetario valor={e.saldoALiquidar} /> },
    { chave: "apag", cabecalho: "A pagar", alinhamento: "direita", celula: (e) => <ValorMonetario valor={e.saldoAPagar} /> },
  ];
  const soma = (k: "empenhadoLiquido" | "saldoALiquidar" | "saldoAPagar"): string =>
    (o.empenhos ?? []).reduce((s, e) => s.plus(e[k]), toMoney("0")).toFixed(2);
  return (
    <section className="space-y-4" aria-label="Operações da dotação" data-operacoes-da-ficha>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Reservas ({o.reservas.length})</h2>
        {o.reservas.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">Nenhuma reserva nesta ficha.</p>
        ) : (
          <TabelaDeDados colunas={colunasReserva} linhas={o.reservas} keyDe={(r) => r.id} legenda="valores em R$" />
        )}
        {podeReservar ? <FormReservar fichaId={o.fichaId} disponivel={disponivel} hoje={diaCivil(new Date())} /> : null}
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Empenhos {o.empenhos === null ? "" : `(${o.empenhos.length})`}</h2>
        {o.empenhos === null ? (
          <p className="text-xs text-[color:var(--color-ink-3)]" data-motivo-sem-empenhos>
            {o.motivoSemEmpenhos}
          </p>
        ) : o.empenhos.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">Nenhum empenho nesta ficha.</p>
        ) : (
          <>
            <p className="text-xs text-[color:var(--color-ink-3)]" data-total-dos-empenhos>
              {o.empenhos.length} empenho(s) desta ficha: empenhado líquido <ValorMonetario valor={soma("empenhadoLiquido")} />, a liquidar{" "}
              <ValorMonetario valor={soma("saldoALiquidar")} />, a pagar <ValorMonetario valor={soma("saldoAPagar")} />.
            </p>
            <TabelaDeDados colunas={colunasEmpenho} linhas={o.empenhos} keyDe={(e) => e.id} legenda="valores em R$" />
          </>
        )}
      </div>
    </section>
  );
}
