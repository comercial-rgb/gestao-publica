import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { MOVIMENTOS_ESCOLHIVEIS, lerRoteirosPatrimoniais, type RoteiroNaLista } from "../../../../lib/portas/roteiros-patrimoniais";
import { FormRoteiroPatrimonial } from "./FormRoteiroPatrimonial";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * OS ROTEIROS DE PRECATÓRIOS E CONVÊNIOS — onde a contabilidade diz em que contas cada movimento lança (V32).
 *
 * ⚠️ POR QUE ESTA TELA EXISTE. Inscrever, atualizar e cancelar precatório, e aprovar, glosar e devolver
 * convênio eram recusados numa instalação nova: o roteiro só era escrito por teste. Aqui o contador declara,
 * com fundamento e versão, e o movimento passa a lançar.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const SITUACAO: Readonly<Record<RoteiroNaLista["situacao"], { readonly rotulo: string; readonly status: "ok" | "alerta" | "neutro" }>> = {
  DECLARADO: { rotulo: "Declarado", status: "ok" },
  ANTERIOR: { rotulo: "Carga anterior", status: "neutro" },
  PENDENTE: { rotulo: "Sem roteiro", status: "alerta" },
};

export default async function RoteirosPatrimoniaisPage(): Promise<React.ReactElement> {
  const cabecalho = <PageHeader titulo="Roteiros de precatórios, convênios e adiantamentos" subtitulo="Em que contas cada movimento é lançado" />;
  let linhas: readonly RoteiroNaLista[];
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
    linhas = await lerRoteirosPatrimoniais();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio titulo="Não foi possível ler os roteiros" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const pendentes = linhas.filter((l) => l.situacao === "PENDENTE");

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Cada movimento de precatório, convênio, adiantamento e multa de trânsito gera um lançamento com as contas declaradas aqui.{" "}
        <strong>Movimento sem roteiro não é aceito.</strong> Uma nova declaração cria outra versão, sem alterar o que já foi lançado.
      </div>

      {pendentes.length > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs" data-teste="movimentos-sem-roteiro">
          <strong>{pendentes.length} movimento(s) sem roteiro</strong>: {pendentes.map((p) => p.rotulo).join("; ")}.
        </div>
      ) : null}

      <FormRoteiroPatrimonial
        movimentos={MOVIMENTOS_ESCOLHIVEIS}
        {...(pendentes[0] !== undefined ? { movimentoInicial: `${pendentes[0].familia}|${pendentes[0].chave}` } : {})}
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Os movimentos de precatórios e convênios e as contas de cada um</caption>
            <thead>
              <tr className="text-[color:var(--color-ink-3)]">
                <th scope="col" className="py-2 pr-3">Movimento</th>
                <th scope="col" className="py-2 pr-3">Situação</th>
                <th scope="col" className="py-2 pr-3">Débito</th>
                <th scope="col" className="py-2 pr-3">Crédito</th>
                <th scope="col" className="py-2 pr-3">Histórico e fundamento</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={`${l.familia}|${l.chave}`} data-roteiro={`${l.familia}|${l.chave}`} className="border-t border-[color:var(--color-border)] align-top">
                  <th scope="row" className="py-2 pr-3 font-normal">{l.rotulo}</th>
                  <td className="py-2 pr-3" data-papel="situacao" data-situacao={l.situacao}>
                    <Badge status={SITUACAO[l.situacao].status}>{SITUACAO[l.situacao].rotulo}</Badge>
                    {l.versao !== null ? <span className="ml-2 text-[color:var(--color-ink-3)]">versão {String(l.versao)}</span> : null}
                  </td>
                  <td className="py-2 pr-3">{l.contaDebitoCodigo ?? "—"}</td>
                  <td className="py-2 pr-3">{l.contaCreditoCodigo ?? "—"}</td>
                  <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">
                    {l.historicoPadrao ?? "—"}
                    {l.fundamento !== null ? <span className="block text-[color:var(--color-ink-3)]">{l.fundamento}</span> : null}
                    {l.criadoPor !== null ? <span className="block text-[color:var(--color-ink-3)]">por {l.criadoPor}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
