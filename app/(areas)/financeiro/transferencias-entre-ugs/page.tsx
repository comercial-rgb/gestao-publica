import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerTransferenciasEntreUgs, ROTULO_DA_TRANSFERENCIA_ENTRE_UGS } from "../../../../lib/portas/transferencias-entre-ugs";
import { inicioDoDiaCivil } from "../../../../packages/datas/index";
import { FormContabilizacao, FormEstornar, FormTransferencia } from "./Forms";

/**
 * V26 — TRANSFERÊNCIAS FINANCEIRAS ENTRE AS UNIDADES GESTORAS DO MUNICÍPIO (o duodécimo à Câmara, os aportes, a
 * devolução): as contas decididas por tipo, o registro, o estorno e a conciliação do período.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const TITULO = "Transferências entre unidades gestoras";
const SUBTITULO = "Duodécimo, aportes e devoluções entre as unidades do município";

export default async function TransferenciasEntreUgsPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const ano = typeof sp.ano === "string" && /^\d{4}$/.test(sp.ano) ? sp.ano : String(new Date().getFullYear());
  let dados: Awaited<ReturnType<typeof lerTransferenciasEntreUgs>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_FINANCEIRO");
    dados = await lerTransferenciasEntreUgs({ de: inicioDoDiaCivil(`${ano}-01-01`), ate: inicioDoDiaCivil(`${ano}-12-31`) });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo={TITULO} subtitulo={SUBTITULO} />
        <EstadoVazio titulo="Não foi possível carregar" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo={TITULO} subtitulo={`${SUBTITULO} — ${ano}`} />
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        A transferência entre unidades do município não é receita nem despesa orçamentária: quem concede registra a
        variação diminutiva contra o banco, e quem recebe, o banco contra a variação aumentativa. Quando as duas unidades
        são escrituradas aqui, os dois lados nascem juntos. Quando uma é de fora, só o lado daqui é registrado, e a
        confirmação do outro aparece como pendente.{" "}
        <a href="/contabilidade/unidades-gestoras" className="underline">Unidades gestoras</a>
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Contas decididas por tipo</h2>
        {dados.contabilizacoes.length === 0 ? (
          <p className="text-xs text-[color:var(--color-status-erro-fg)]" data-teste="sem-contas-da-transferencia">Nenhum tipo tem as contas decididas: a transferência é recusada até a decisão.</p>
        ) : (
          <ul className="space-y-1 text-xs" data-lista="contas-da-transferencia">
            {dados.contabilizacoes.map((c) => (
              <li key={c.id}><strong>{c.tipo}</strong> desde {c.desde}: concede em {c.concedida}; recebe em {c.recebida}. <span className="text-[color:var(--color-ink-3)]">{c.fundamento}</span></li>
            ))}
          </ul>
        )}
      </Card>
      <FormContabilizacao tipos={ROTULO_DA_TRANSFERENCIA_ENTRE_UGS} vpds={dados.vpds} vpas={dados.vpas} />
      <FormTransferencia tipos={ROTULO_DA_TRANSFERENCIA_ENTRE_UGS} ugs={dados.ugs} contas={dados.contasBancarias} />

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Conciliação do ano</h2>
        {dados.linhas.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">Nenhuma transferência em {ano}.</p>
        ) : (
          <>
            <table className="w-full text-sm" data-lista="transferencias-entre-ugs">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-3">Data</th><th className="py-1.5 pr-3">Tipo</th><th className="py-1.5 pr-3">De → para</th>
                  <th className="py-1.5 pr-3 text-right">Valor</th><th className="py-1.5 pr-3">Situação</th><th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <tr key={l.id} className="border-b border-[color:var(--color-border)] align-top" data-transferencia={l.id}>
                    <td className="py-1.5 pr-3 text-xs">{l.data}</td>
                    <td className="py-1.5 pr-3 text-xs">{l.estorno ? `Estorno de ${l.tipo.toLowerCase()}` : l.tipo}</td>
                    <td className="py-1.5 pr-3 text-xs">{l.origem} → {l.destino}</td>
                    <td className="py-1.5 pr-3 text-right"><ValorMonetario valor={l.estorno ? `-${l.valor}` : l.valor} /></td>
                    <td className={`py-1.5 pr-3 text-xs ${l.ladoSemConfirmacao ? "text-[color:var(--color-status-erro-fg)]" : ""}`}>{l.situacao}{l.estornada ? " · estornada" : ""}</td>
                    <td className="py-1.5 text-xs">{!l.estorno && !l.estornada ? <FormEstornar transferenciaId={l.id} rotulo={`a transferência de ${l.data}`} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-3 space-y-1 text-xs" data-lista="liquido-por-par">
              {dados.liquidoPorPar.map((p) => (
                <li key={`${p.origem}|${p.destino}`}>Líquido de {p.origem} para {p.destino}: <strong><ValorMonetario valor={p.liquido} /></strong></li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
