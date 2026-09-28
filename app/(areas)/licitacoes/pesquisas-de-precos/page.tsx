import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { PESQUISAS_DE_PRECOS } from "../../../../lib/portas/recursos/compras";
import { listarPesquisas, fornecedores, materiaisAtivos, PortaSemBancoError } from "../../../../lib/portas/recursos/compras-dados";
import { FormPesquisaDePrecos } from "./FormPesquisaDePrecos";

/**
 * AS PESQUISAS DE PREÇOS — lista do molde; a criação (itens e cotações) é a ilha FormPesquisaDePrecos.
 * ⚠️ A criação é uma ILHA escrita à mão (itens em linhas) passada como `formulario` — o molde monta a lista.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const consulta = lerConsulta(PESQUISAS_DE_PRECOS, await searchParams);
  try {
    const [pagina, permitidas, materiais, fornecedoresLidos] = await Promise.all([listarPesquisas(consulta), acoesPermitidas(["REGISTRAR_PESQUISA_DE_PRECOS"]), materiaisAtivos(), fornecedores()]);
    const podeCriar = permitidas.has("REGISTRAR_PESQUISA_DE_PRECOS");
    return (
      <ListaDeRecurso
        definicao={PESQUISAS_DE_PRECOS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, PESQUISAS_DE_PRECOS.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        {...(podeCriar ? { formulario: <FormPesquisaDePrecos materiais={materiais} fornecedores={fornecedoresLidos} /> } : { motivoSemCriar: "Seu perfil não tem permissão para registrar pesquisas de preços. Solicite a permissão ao administrador do sistema." })}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={PESQUISAS_DE_PRECOS.rotulo} subtitulo={PESQUISAS_DE_PRECOS.descricao} />
          <EstadoVazio titulo="Serviço indisponível" descricao="Não foi possível carregar os dados. Tente novamente em instantes." />
        </div>
      );
    }
    throw e;
  }
}
