import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { telaExigeLeituraEmAlgumEscopo } from "../../../../lib/portas/leitura";
import { SOLICITACOES_DA_MESA } from "../../../../lib/portas/recursos/solicitacoes-da-mesa";
import { listarSolicitacoesDaMesa, PortaSemBancoError } from "../../../../lib/portas/recursos/solicitacoes-da-mesa-dados";

/**
 * A MESA DAS SOLICITAÇÕES (M21, V6.2 P3): contagem por situação e a lista, recortada pela visão do
 * processo (setor, sigilo, gestor). As contagens são das solicitações que a sessão VÊ — não do ente.
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  const sessao = await telaExigeLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
  const consulta = lerConsulta(SOLICITACOES_DA_MESA, await searchParams);
  try {
    const pagina = await listarSolicitacoesDaMesa(sessao, consulta);
    return (
      <div className="space-y-4">
        <ul className="flex flex-wrap gap-2" aria-label="Solicitações por situação" data-contagens-da-mesa>
          {pagina.contagens.map((c) => (
            <li key={c.situacao} data-contagem={c.situacao} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-xs">
              <a href={`${SOLICITACOES_DA_MESA.rota}?situacao=${c.situacao}`} className="text-[color:var(--color-ink)]"><strong className="tabular-nums">{c.quantidade}</strong> {c.rotulo}</a>
            </li>
          ))}
        </ul>
        <ListaDeRecurso
          definicao={SOLICITACOES_DA_MESA}
          linhas={pagina.linhas}
          total={pagina.total}
          pagina={consulta.pagina}
          tamanhoPagina={TAMANHO_DE_PAGINA}
          filtrosVigentes={consulta.filtros}
          ordem={consulta.ordem}
          direcao={consulta.direcao}
          selecionados={consulta.selecionados}
          somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, [])}
          motivoSemCriar="As solicitações nascem na carta de serviços, pelo requerente. A mesa não as cria."
        />
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={SOLICITACOES_DA_MESA.rotulo} subtitulo={SOLICITACOES_DA_MESA.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê as solicitações. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
