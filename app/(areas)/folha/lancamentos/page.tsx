import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { LANCAMENTOS_DA_FOLHA } from "../../../../lib/portas/recursos/folha";
import { listarLancamentos, opcoesDoLancamento, PortaSemBancoError } from "../../../../lib/portas/recursos/folha-dados";
import { lancamentosAction } from "./actions";

/**
 * OS LANÇAMENTOS DA FOLHA — gerados pelo MOLDE (M33). Fixos valem por vigência; variáveis, numa competência. Append-only.
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const consulta = lerConsulta(LANCAMENTOS_DA_FOLHA, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([listarLancamentos(consulta), opcoesDoLancamento(), acoesPermitidas(Object.values(LANCAMENTOS_DA_FOLHA.permissoes).filter((p): p is string => p !== undefined))]);
    return (
      <ListaDeRecurso
        definicao={LANCAMENTOS_DA_FOLHA}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, LANCAMENTOS_DA_FOLHA.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={<FormsDoRecurso definicao={LANCAMENTOS_DA_FOLHA} permitidas={[...permitidas]} opcoes={opcoes} action={lancamentosAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={LANCAMENTOS_DA_FOLHA.rotulo} subtitulo={LANCAMENTOS_DA_FOLHA.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê e grava a folha. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
