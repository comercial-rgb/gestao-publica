import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { CAMPANHAS_PUBLICITARIAS } from "../../../../lib/portas/recursos/campanhas-publicitarias";
import { listarCampanhasPublicitarias, PortaSemBancoError } from "../../../../lib/portas/recursos/campanhas-publicitarias-dados";
import { acaoDasCampanhasAction } from "./actions";

/**
 * Campanhas publicitárias (V22, M05) — o cadastro do vínculo da nota de empenho, pela superfície do molde.
 *
 * ⚠️ O QUE É DESTA TELA, E SÓ ISSO: qual porta ler e qual Server Action ligar. O período, a
 * duplicata e a autorização são do serviço `cadastrarCampanhaPublicitaria`.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_DESPESA");
  const consulta = lerConsulta(CAMPANHAS_PUBLICITARIAS, await searchParams);

  try {
    const [pagina, permitidas] = await Promise.all([
      listarCampanhasPublicitarias(consulta),
      acoesPermitidas(
        Object.values(CAMPANHAS_PUBLICITARIAS.permissoes).filter((p): p is string => p !== undefined)
      ),
    ]);

    return (
      <ListaDeRecurso
        definicao={CAMPANHAS_PUBLICITARIAS}
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
            definicao={CAMPANHAS_PUBLICITARIAS}
            permitidas={[...permitidas]}
            opcoes={{}}
            action={acaoDasCampanhasAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={CAMPANHAS_PUBLICITARIAS.rotulo} subtitulo={CAMPANHAS_PUBLICITARIAS.descricao} />
          <EstadoVazio
            titulo="Dados indisponíveis"
            descricao="Não foi possível acessar as campanhas publicitárias no momento. Tente novamente em instantes."
          />
        </div>
      );
    }
    throw e;
  }
}
