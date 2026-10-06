import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerOrdenadoresEResponsavel } from "../../../../lib/portas/ordenadores";
import { FormDesignar, FormEncerrar, FormResponsavel } from "./Forms";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * V26 — QUEM ORDENA A DESPESA E QUEM RESPONDE PELO SISTEMA, para a prestação de contas.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function OrdenadoresPage(): Promise<React.ReactElement> {
  let dados: Awaited<ReturnType<typeof lerOrdenadoresEResponsavel>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_DESPESA");
    dados = await lerOrdenadoresEResponsavel();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Ordenadores e responsável pelo sistema" subtitulo="Quem ordena a despesa e quem mantém o sistema" />
        <EstadoVazio titulo="Não foi possível carregar" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Ordenadores e responsável pelo sistema" subtitulo="Quem ordena a despesa e quem mantém o sistema" />
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Cada empenho vai ao Tribunal de Contas com o CPF do ordenador designado na data dele, para a unidade orçamentária da
        ficha (ou para toda a despesa). A designação acompanha o ato de nomeação, delegação ou substituição, e o
        encerramento acompanha o ato que a revoga.
      </div>
      <FormDesignar unidades={dados.unidades} />
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Ordenadores designados</h2>
        {dados.designacoes.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">Nenhuma designação. Enquanto não houver, os empenhos levam o ordenador do cadastro do município.</p>
        ) : (
          <table className="w-full text-sm" data-lista="ordenadores">
            <tbody>
              {dados.designacoes.map((d) => (
                <tr key={d.id} className="border-b border-[color:var(--color-border)] align-top" data-ordenador={d.cpf}>
                  <td className="py-1.5 pr-4"><strong>{d.nome}</strong><span className="block text-xs">{d.cpf}</span></td>
                  <td className="py-1.5 pr-4 text-xs">{d.escopo}<span className="block text-[color:var(--color-ink-3)]">{d.ato}</span></td>
                  <td className="py-1.5 pr-4 text-xs">desde {d.desde}{d.ate !== null ? <span className="block">até {d.ate} ({d.atoDoFim})</span> : null}</td>
                  <td className="py-1.5 text-xs">{d.ate === null ? <FormEncerrar designacaoId={d.id} nome={d.nome} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Responsável pelo sistema</h2>
        {dados.responsavel === null ? (
          <p className="text-xs text-[color:var(--color-status-erro-fg)]" data-teste="sem-responsavel">Não declarado: o balancete de janeiro sai sem esse arquivo até a declaração.</p>
        ) : (
          <dl className="grid gap-1 text-xs sm:grid-cols-2" data-teste="responsavel-siafic">
            <dt className="text-[color:var(--color-ink-3)]">Manutenção</dt><dd>{dados.responsavel.modalidade}</dd>
            <dt className="text-[color:var(--color-ink-3)]">Empresa ou prefeitura</dt><dd>{dados.responsavel.empresa}</dd>
            <dt className="text-[color:var(--color-ink-3)]">Sistema</dt><dd>{dados.responsavel.sistema}</dd>
            <dt className="text-[color:var(--color-ink-3)]">Responsável técnico</dt><dd>{dados.responsavel.tecnico}</dd>
            <dt className="text-[color:var(--color-ink-3)]">Desde</dt><dd>{dados.responsavel.desde} — {dados.responsavel.fundamento}</dd>
          </dl>
        )}
      </Card>
      <FormResponsavel />
    </div>
  );
}
