import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { ROTEIROS_DO_ALMOXARIFADO } from "../../../../../lib/portas/recursos/roteiros";
import { listarRoteirosDoAlmoxarifadoDoMolde } from "../../../../../lib/portas/recursos/roteiros-dados";
import { PortaSemBancoError } from "../../../../../lib/portas/recursos/dados";
import { acaoDeRoteirosDoAlmoxarifadoAction } from "./actions";

/**
 * V37 — Roteiros contábeis do almoxarifado, tela do MOLDE (M10). Sem roteiro a saída de material é recusada, e não
 * havia onde cadastrá-lo. Lista, filtro e formulário saem do descritor em `lib/portas/recursos/roteiros.ts`.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PATRIMONIO");
  const consulta = lerConsulta(ROTEIROS_DO_ALMOXARIFADO, await searchParams);

  try {
    const [pagina, permitidas] = await Promise.all([
      listarRoteirosDoAlmoxarifadoDoMolde(consulta),
      acoesPermitidas(Object.values(ROTEIROS_DO_ALMOXARIFADO.permissoes).filter((p): p is string => p !== undefined)),
    ]);
    return (
      <ListaDeRecurso
        definicao={ROTEIROS_DO_ALMOXARIFADO}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, [])}
        formulario={<FormsDoRecurso definicao={ROTEIROS_DO_ALMOXARIFADO} permitidas={[...permitidas]} opcoes={{}} action={acaoDeRoteirosDoAlmoxarifadoAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={ROTEIROS_DO_ALMOXARIFADO.rotulo} subtitulo={ROTEIROS_DO_ALMOXARIFADO.descricao} />
          <EstadoVazio titulo="Dados indisponíveis" descricao="Não foi possível acessar os dados deste cadastro no momento. Tente novamente em instantes." />
        </div>
      );
    }
    throw e;
  }
}
