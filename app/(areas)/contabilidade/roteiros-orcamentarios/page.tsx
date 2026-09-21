import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerContasDoRoteiro, lerRoteirosOrcamentarios } from "../../../../lib/portas/roteiro-orcamentario";
import { FormDoPar, RoteirosDoEnte } from "./FormRoteiro";

/**
 * O ROTEIRO ORÇAMENTÁRIO — ONDE O ENTE DIZ EM QUE CONTAS CADA MOVIMENTO LANÇA (M05, V11 V8.4).
 *
 * ═══ ⚠️ POR QUE ESTA TELA EXISTE ═══
 * Duas pendências viviam da mesma ausência. `ROTEIRO-RESERVA-SEM-CONTA`: o sistema chama a conta
 * de "crédito reservado"; no PCASP ela é CRÉDITO INDISPONÍVEL, com BLOQUEIO, PRÉ-EMPENHADO e
 * OUTRAS sob ela. `ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS`: a redução de dotação tem
 * DUAS candidatas com o nome IDÊNTICO, em ramos diferentes do plano.
 *
 * Nenhuma das duas se fecha escolhendo a conta — isso seria inventar norma da STN. O que faltava
 * era o ente ter ONDE escolher: o roteiro só nascia por seed, e o seed recusa (com razão) o que
 * não pode decidir. Um roteiro que ninguém pode configurar é um movimento que o sistema recusa
 * para sempre.
 *
 * ⚠️ A AUSÊNCIA APARECE, COM NOME. Um par sem roteiro é mostrado como RECUSADO, e a explicação diz
 * o que o movimento faz — para quem configura saber o que está classificando.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function RoteirosOrcamentariosPage(): Promise<React.ReactElement> {
  let linhas: Awaited<ReturnType<typeof lerRoteirosOrcamentarios>>;
  let contas: Awaited<ReturnType<typeof lerContasDoRoteiro>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
    linhas = await lerRoteirosOrcamentarios();
    contas = await lerContasDoRoteiro();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Roteiro orçamentário" subtitulo="Em que contas cada movimento de dotação lança" />
        <EstadoVazio titulo="Não foi possível ler os roteiros" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }

  const faltando = linhas.filter((l) => l.debito === null);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Roteiro orçamentário" subtitulo="Em que contas cada movimento de dotação lança" />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Todo movimento de dotação tem <strong>perna no razão</strong> — e é aqui que o ente diz
        quais contas do plano dele recebem cada uma. Enquanto um par não tiver roteiro,{" "}
        <strong>o movimento é recusado</strong>, e é assim que deve ser: um orçamento que cresce
        sem contrapartida no razão é o furo que este roteiro existe para impedir. Publicar de novo
        cria uma <strong>versão</strong> — o que já foi escriturado continua como estava.
      </div>

      {faltando.length > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs" data-teste="roteiros-faltando">
          <strong>{faltando.length} movimento(s) sem roteiro — {faltando.map((l) => l.rotulo).join("; ")}</strong>. Eles são
          recusados enquanto o ente não decidir as contas.
        </div>
      ) : null}

      <Card>
        <RoteirosDoEnte contas={contas}>
          <table className="w-full text-sm" data-teste="roteiros-orcamentarios">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                <th className="py-1.5 pr-4">Movimento</th>
                <th className="py-1.5 pr-4">Débito</th>
                <th className="py-1.5 pr-4">Crédito</th>
                <th className="py-1.5">Decisão</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr
                  key={`${l.tipo}|${l.tipoCredito ?? ""}`}
                  className="border-b border-[color:var(--color-border)] align-top"
                  data-teste={`roteiro-${l.tipo}${l.tipoCredito === null ? "" : `-${l.tipoCredito}`}`}
                >
                  <td className="py-1.5 pr-4">
                    <strong>{l.rotulo}</strong>
                    <span className="block text-xs text-[color:var(--color-ink-3)]">{l.explicacao}</span>
                  </td>
                  <td className="py-1.5 pr-4">
                    {l.debito === null ? (
                      <Badge status="alerta">sem roteiro</Badge>
                    ) : (
                      <>
                        <span className="font-mono">{l.debito}</span>
                        <span className="block text-xs text-[color:var(--color-ink-3)]">{l.debitoNome}</span>
                      </>
                    )}
                  </td>
                  <td className="py-1.5 pr-4">
                    {l.credito === null ? (
                      <span className="text-xs text-[color:var(--color-status-erro-fg)]">o movimento é recusado</span>
                    ) : (
                      <>
                        <span className="font-mono">{l.credito}</span>
                        <span className="block text-xs text-[color:var(--color-ink-3)]">{l.creditoNome}</span>
                      </>
                    )}
                  </td>
                  <td className="py-1.5 text-xs text-[color:var(--color-ink-2)]">
                    {l.versao !== null && l.versao > 1 ? <Badge status="neutro">v{l.versao}</Badge> : null}{" "}
                    {/* ⚠️ A LINHA DO SEED É NOMEADA. Ela funciona, e ninguém do ente a decidiu —
                        quem olhar precisa saber disso antes de citá-la numa prestação de contas. */}
                    {l.semFundamento ? (
                      <em>Veio da instalação — ninguém do ente decidiu estas contas ainda.</em>
                    ) : l.fundamento !== null ? (
                      <>
                        {l.fundamento}
                        <span className="block text-[color:var(--color-ink-3)]">por {l.criadoPor}</span>
                      </>
                    ) : null}
                    <FormDoPar tipo={l.tipo} tipoCredito={l.tipoCredito} debito={l.debito} credito={l.credito} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </RoteirosDoEnte>
      </Card>
    </div>
  );
}
