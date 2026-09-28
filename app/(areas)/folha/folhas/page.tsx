import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { FOLHAS } from "../../../../lib/portas/recursos/folha";
import { listarFolhas, opcoesDaFolha, PortaSemBancoError } from "../../../../lib/portas/recursos/folha-dados";
import { folhasAction } from "./actions";

/**
 * AS FOLHAS DE PAGAMENTO — geradas pelo MOLDE (M33, V6 P2.3). Abrir a folha é o ato; calcular, cancelar o cálculo e fechar ficam no detalhe. A situação é DERIVADA dos fatos.
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const consulta = lerConsulta(FOLHAS, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([listarFolhas(consulta), opcoesDaFolha(), acoesPermitidas(Object.values(FOLHAS.permissoes).filter((p): p is string => p !== undefined))]);
    return (
      <ListaDeRecurso
        definicao={FOLHAS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, FOLHAS.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={<FormsDoRecurso definicao={FOLHAS} permitidas={[...permitidas]} opcoes={opcoes} action={folhasAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={FOLHAS.rotulo} subtitulo={FOLHAS.descricao} />
          <EstadoVazio titulo="Dados indisponíveis no momento" descricao="Não foi possível acessar as informações. Tente novamente mais tarde." />
        </div>
      );
    }
    throw e;
  }
}
