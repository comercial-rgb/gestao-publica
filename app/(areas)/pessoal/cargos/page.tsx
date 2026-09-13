import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { CARGOS } from "../../../../lib/portas/recursos/pessoal";
import { listarCargos, opcoesDoCargo, PortaSemBancoError } from "../../../../lib/portas/recursos/pessoal-dados";
import { cargosAction } from "./actions";

/**
 * OS CARGOS — gerados pelo MOLDE (M32). Vagas fixadas em lei × ocupadas contadas a cada leitura.
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PESSOAL");
  const consulta = lerConsulta(CARGOS, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([listarCargos(consulta), opcoesDoCargo(), acoesPermitidas(Object.values(CARGOS.permissoes).filter((p): p is string => p !== undefined))]);
    return (
      <ListaDeRecurso
        definicao={CARGOS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, CARGOS.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={<FormsDoRecurso definicao={CARGOS} permitidas={[...permitidas]} opcoes={opcoes} action={cargosAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={CARGOS.rotulo} subtitulo={CARGOS.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê e grava o pessoal. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
