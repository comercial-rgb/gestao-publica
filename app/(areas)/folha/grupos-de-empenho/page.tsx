import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { GRUPOS_DE_EMPENHO_DA_FOLHA } from "../../../../lib/portas/recursos/folha";
import { listarGruposDeEmpenho, opcoesDoGrupoDeEmpenho, rubricasParaGrupoDeEmpenho, PortaSemBancoError } from "../../../../lib/portas/recursos/folha-dados";
import { FormGrupoDeEmpenho } from "./FormGrupoDeEmpenho";

/**
 * OS GRUPOS DE EMPENHO DA FOLHA — lista do molde; o cadastro é a ilha `FormGrupoDeEmpenho`
 * (rubricas em caixas, credor só quando o empenho não é por servidor).
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const consulta = lerConsulta(GRUPOS_DE_EMPENHO_DA_FOLHA, await searchParams);
  try {
    const [pagina, opcoes, rubricas, permitidas] = await Promise.all([
      listarGruposDeEmpenho(consulta),
      opcoesDoGrupoDeEmpenho(),
      rubricasParaGrupoDeEmpenho(),
      acoesPermitidas(["CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA"]),
    ]);
    const podeCriar = permitidas.has("CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA");
    return (
      <ListaDeRecurso
        definicao={GRUPOS_DE_EMPENHO_DA_FOLHA}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, GRUPOS_DE_EMPENHO_DA_FOLHA.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        {...(podeCriar
          ? { formulario: <FormGrupoDeEmpenho fichas={(opcoes["fichaId"] ?? []).map((o) => ({ id: o.valor, rotulo: o.rotulo }))} credores={(opcoes["credorId"] ?? []).map((o) => ({ id: o.valor, rotulo: o.rotulo }))} rubricas={rubricas} /> }
          : { motivoSemCriar: "Você não tem a permissão CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA. Peça ao administrador — a concessão é por ação, e é registrada." })}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={GRUPOS_DE_EMPENHO_DA_FOLHA.rotulo} subtitulo={GRUPOS_DE_EMPENHO_DA_FOLHA.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê e grava os grupos de empenho. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
