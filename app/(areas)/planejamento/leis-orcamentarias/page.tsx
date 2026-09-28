import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { LEIS_ORCAMENTARIAS } from "../../../../lib/portas/recursos/leis-orcamentarias";
import { listarLeisOrcamentarias, PortaSemBancoError } from "../../../../lib/portas/recursos/leis-orcamentarias-dados";
import { acaoDasLeisOrcamentariasAction } from "./actions";

/**
 * O projeto e a lei da LOA (V22, M02b), pela superfície do molde. O orçamento em si é a consulta
 * /planejamento/loa; aqui fica o ato — projeto, lei e anexos.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PLANEJAMENTO");
  const consulta = lerConsulta(LEIS_ORCAMENTARIAS, await searchParams);

  try {
    const [pagina, permitidas] = await Promise.all([
      listarLeisOrcamentarias(consulta),
      acoesPermitidas(Object.values(LEIS_ORCAMENTARIAS.permissoes).filter((p): p is string => p !== undefined)),
    ]);

    return (
      <ListaDeRecurso
        definicao={LEIS_ORCAMENTARIAS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={{}}
        formulario={
          <FormsDoRecurso
            definicao={LEIS_ORCAMENTARIAS}
            permitidas={[...permitidas]}
            opcoes={{}}
            action={acaoDasLeisOrcamentariasAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={LEIS_ORCAMENTARIAS.rotulo} subtitulo={LEIS_ORCAMENTARIAS.descricao} />
          <EstadoVazio
            titulo="Dados indisponíveis"
            descricao="Não foi possível acessar as leis orçamentárias no momento. Tente novamente em instantes."
          />
        </div>
      );
    }
    throw e;
  }
}
