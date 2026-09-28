import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { telaExigeLeituraEmAlgumEscopo } from "../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { SERVICOS_DA_CARTA } from "../../../../lib/portas/recursos/servicos-da-carta";
import { listarServicosDaCarta, opcoesDoServicoDaCarta, PortaSemBancoError } from "../../../../lib/portas/recursos/servicos-da-carta-dados";
import { servicosDaCartaAction } from "./actions";

/**
 * A CONFIGURAÇÃO DA CARTA DE SERVIÇOS — listagem e cadastro do serviço pelo MOLDE (M21, V6.2 P3).
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await telaExigeLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
  const consulta = lerConsulta(SERVICOS_DA_CARTA, await searchParams);
  try {
    const [pagina, permitidas, opcoes] = await Promise.all([listarServicosDaCarta(consulta), acoesPermitidas(["CONFIGURAR_CARTA_DE_SERVICOS"]), opcoesDoServicoDaCarta()]);
    return (
      <ListaDeRecurso
        definicao={SERVICOS_DA_CARTA}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, [])}
        formulario={<FormsDoRecurso definicao={SERVICOS_DA_CARTA} permitidas={[...permitidas]} opcoes={opcoes} action={servicosDaCartaAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={SERVICOS_DA_CARTA.rotulo} subtitulo={SERVICOS_DA_CARTA.descricao} />
          <EstadoVazio titulo="Dados indisponíveis" descricao="Não foi possível acessar a base de dados deste ambiente." />
        </div>
      );
    }
    throw e;
  }
}
