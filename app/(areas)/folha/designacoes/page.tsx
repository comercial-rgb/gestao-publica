import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { DESIGNACOES_DA_FOLHA } from "../../../../lib/portas/recursos/folha";
import { listarDesignacoes, opcoesDaDesignacao, PortaSemBancoError } from "../../../../lib/portas/recursos/folha-dados";
import { designacoesAction } from "./actions";

/**
 * AS DESIGNAÇÕES PARA O ATESTO DA FOLHA (V6.1) — geradas pelo MOLDE.
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO e do DIA (a vigência é derivada).
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const consulta = lerConsulta(DESIGNACOES_DA_FOLHA, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarDesignacoes(consulta),
      opcoesDaDesignacao(),
      acoesPermitidas(Object.values(DESIGNACOES_DA_FOLHA.permissoes).filter((p): p is string => p !== undefined)),
    ]);
    return (
      <ListaDeRecurso
        definicao={DESIGNACOES_DA_FOLHA}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, DESIGNACOES_DA_FOLHA.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={<FormsDoRecurso definicao={DESIGNACOES_DA_FOLHA} permitidas={[...permitidas]} opcoes={opcoes} action={designacoesAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={DESIGNACOES_DA_FOLHA.rotulo} subtitulo={DESIGNACOES_DA_FOLHA.descricao} />
          <EstadoVazio titulo="Dados indisponíveis no momento" descricao="Não foi possível acessar as informações. Tente novamente mais tarde." />
        </div>
      );
    }
    throw e;
  }
}
