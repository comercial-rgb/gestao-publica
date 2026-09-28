import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { ENCARGOS_DA_FOLHA } from "../../../../lib/portas/recursos/encargos";
import { listarComponentesDeEncargo, PortaSemBancoError } from "../../../../lib/portas/recursos/encargos-dados";
import { encargosAction } from "./actions";

/**
 * OS COMPONENTES DE ENCARGO DO EMPREGADOR — listagem e cadastro pelo MOLDE (M33, V6.2 U1).
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const consulta = lerConsulta(ENCARGOS_DA_FOLHA, await searchParams);
  try {
    const [pagina, permitidas] = await Promise.all([listarComponentesDeEncargo(consulta), acoesPermitidas(["CADASTRAR_ENCARGO_DA_FOLHA"])]);
    return (
      <ListaDeRecurso
        definicao={ENCARGOS_DA_FOLHA}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, [])}
        formulario={<FormsDoRecurso definicao={ENCARGOS_DA_FOLHA} permitidas={[...permitidas]} opcoes={{}} action={encargosAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={ENCARGOS_DA_FOLHA.rotulo} subtitulo={ENCARGOS_DA_FOLHA.descricao} />
          <EstadoVazio titulo="Dados indisponíveis no momento" descricao="Não foi possível acessar as informações. Tente novamente mais tarde." />
        </div>
      );
    }
    throw e;
  }
}
