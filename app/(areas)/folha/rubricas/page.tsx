import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { RUBRICAS } from "../../../../lib/portas/recursos/folha";
import { listarRubricas, opcoesDaRubrica, PortaSemBancoError } from "../../../../lib/portas/recursos/folha-dados";
import { rubricasAction } from "./actions";

/**
 * AS RUBRICAS DA FOLHA — geradas pelo MOLDE (M33). Natureza, incidências e proporcionalidade são do cadastro; o valor de cada uma sai do cálculo.
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const consulta = lerConsulta(RUBRICAS, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([listarRubricas(consulta), opcoesDaRubrica(), acoesPermitidas(Object.values(RUBRICAS.permissoes).filter((p): p is string => p !== undefined))]);
    return (
      <ListaDeRecurso
        definicao={RUBRICAS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, RUBRICAS.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={<FormsDoRecurso definicao={RUBRICAS} permitidas={[...permitidas]} opcoes={opcoes} action={rubricasAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={RUBRICAS.rotulo} subtitulo={RUBRICAS.descricao} />
          <EstadoVazio titulo="Dados indisponíveis no momento" descricao="Não foi possível acessar as informações. Tente novamente mais tarde." />
        </div>
      );
    }
    throw e;
  }
}
