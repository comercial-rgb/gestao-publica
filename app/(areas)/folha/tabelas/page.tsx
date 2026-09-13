import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { TABELAS_DA_FOLHA } from "../../../../lib/portas/recursos/folha";
import { listarTabelas, PortaSemBancoError } from "../../../../lib/portas/recursos/folha-dados";
import { FormTabela } from "./FormTabela";

/**
 * AS TABELAS DO ENTE — lista do molde; o cadastro é a ilha `FormTabela` (faixas em linhas e campos
 * que mudam com o tipo). A coluna "hoje" é DERIVADA da vigência a cada leitura.
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const consulta = lerConsulta(TABELAS_DA_FOLHA, await searchParams);
  try {
    const [pagina, permitidas] = await Promise.all([listarTabelas(consulta), acoesPermitidas(["CONFIGURAR_TABELAS_DA_FOLHA"])]);
    const podeCriar = permitidas.has("CONFIGURAR_TABELAS_DA_FOLHA");
    return (
      <ListaDeRecurso
        definicao={TABELAS_DA_FOLHA}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, TABELAS_DA_FOLHA.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        {...(podeCriar ? { formulario: <FormTabela /> } : { motivoSemCriar: "Você não tem a permissão CONFIGURAR_TABELAS_DA_FOLHA. Peça ao administrador — a concessão é por ação, e é registrada." })}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={TABELAS_DA_FOLHA.rotulo} subtitulo={TABELAS_DA_FOLHA.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê e grava as tabelas da folha. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
