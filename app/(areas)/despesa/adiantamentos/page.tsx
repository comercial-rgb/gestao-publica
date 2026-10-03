import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { lerAdiantamentos, type AdiantamentoNaLista } from "../../../../lib/portas/adiantamentos";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { formatarDocumento } from "../../../../packages/documento/index";
import { formatarMoeda } from "../../../../packages/contracts/moeda";
import { FormConceder, FormDecisao, FormPrestacao } from "./FormsDoAdiantamento";

/**
 * DIÁRIAS E SUPRIMENTO DE FUNDOS — a concessão, o prazo e a prestação de contas (V32).
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO e da data (a situação "em atraso" muda com o dia).
 */
export const dynamic = "force-dynamic";

const SITUACAO: Readonly<Record<AdiantamentoNaLista["situacao"], { readonly rotulo: string; readonly status: "ok" | "alerta" | "neutro" | "erro" }>> = {
  A_COMPROVAR: { rotulo: "A comprovar", status: "neutro" },
  EM_ANALISE: { rotulo: "Prestação em análise", status: "alerta" },
  EM_ATRASO: { rotulo: "Prestação em atraso", status: "erro" },
  COMPROVADA: { rotulo: "Comprovada", status: "ok" },
};
const brData = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

export default async function AdiantamentosPage(): Promise<React.ReactElement> {
  const cabecalho = <PageHeader titulo="Diárias e suprimento de fundos" subtitulo="Concessão, prazo e prestação de contas" />;
  let linhas: readonly AdiantamentoNaLista[];
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_DESPESA");
    linhas = await lerAdiantamentos();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio titulo="Não foi possível ler as concessões" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }
  const emAtraso = linhas.filter((l) => l.situacao === "EM_ATRASO");

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        A concessão se apoia num empenho em nome do beneficiário (diária: elemento 14 ou 15) e lança a responsabilidade a
        comprovar nas contas de controle declaradas em Contabilidade &gt; Roteiros. A aprovação da prestação de contas baixa
        essa responsabilidade. O valor devolvido volta ao caixa pela anulação do pagamento, da liquidação e do empenho.{" "}
        <strong>Não se concede suprimento a quem está com prestação em atraso nem a quem já tem dois em aberto.</strong>
      </div>

      {emAtraso.length > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs" data-teste="prestacoes-em-atraso">
          <strong>{emAtraso.length} concessão(ões) com prestação de contas em atraso</strong>:{" "}
          {emAtraso.map((l) => `${l.numero} (${l.beneficiarioNome}, prazo ${brData(l.diaPrazo)})`).join("; ")}.
        </div>
      ) : null}

      <FormConceder />

      <Card>
        {linhas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma concessão" descricao="As diárias e os suprimentos concedidos aparecem aqui, com o prazo e a prestação de contas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Diárias e suprimentos de fundos concedidos, com a situação da prestação de contas</caption>
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-2 pr-3">Concessão</th>
                  <th scope="col" className="py-2 pr-3">Beneficiário</th>
                  <th scope="col" className="py-2 pr-3">Período e prazo</th>
                  <th scope="col" className="py-2 pr-3">Valor</th>
                  <th scope="col" className="py-2 pr-3">Situação</th>
                  <th scope="col" className="py-2 pr-3">Prestação de contas</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} data-concessao={l.numero} className="border-t border-[color:var(--color-border)] align-top">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {l.especie === "DIARIA" ? "Diária" : "Suprimento"} {l.numero}
                      <span className="block text-[color:var(--color-ink-3)]">empenho {l.empenhoNumero}</span>
                      <span className="block text-[color:var(--color-ink-3)]">{l.finalidade}{l.destino !== null ? ` — ${l.destino}` : ""}</span>
                    </th>
                    <td className="py-2 pr-3">
                      {l.beneficiarioNome}
                      <span className="block text-[color:var(--color-ink-3)]">{formatarDocumento(l.beneficiarioDocumento)}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {brData(l.diaInicio)} a {brData(l.diaFim)}
                      <span className="block text-[color:var(--color-ink-3)]">prestar contas até {brData(l.diaPrazo)}</span>
                    </td>
                    <td className="py-2 pr-3">R$ {formatarMoeda(l.valor).texto}</td>
                    <td className="py-2 pr-3" data-papel="situacao" data-situacao={l.situacao}>
                      <Badge status={SITUACAO[l.situacao].status}>{SITUACAO[l.situacao].rotulo}</Badge>
                      {l.ultimaDecisao !== null ? (
                        <span className="block text-[color:var(--color-ink-3)]">
                          {l.ultimaDecisao.aprovada ? "aprovada" : "rejeitada"}: {l.ultimaDecisao.motivo}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 min-w-[20rem]">
                      {l.situacao === "COMPROVADA" ? (
                        "—"
                      ) : l.prestacaoEmAnalise !== null ? (
                        <div className="space-y-2">
                          <p className="text-[color:var(--color-ink-2)]">
                            Comprovado R$ {formatarMoeda(l.prestacaoEmAnalise.valorComprovado).texto}, devolvido R${" "}
                            {formatarMoeda(l.prestacaoEmAnalise.valorDevolvido).texto}. {l.prestacaoEmAnalise.relatorio}
                          </p>
                          <FormDecisao prestacaoId={l.prestacaoEmAnalise.id} numero={l.numero} />
                        </div>
                      ) : (
                        <FormPrestacao concessaoId={l.id} numero={l.numero} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
