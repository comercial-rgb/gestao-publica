import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { LOTACOES } from "../../../../lib/portas/recursos/pessoal";
import { listarLotacoes, opcoesDaLotacao, PortaSemBancoError } from "../../../../lib/portas/recursos/pessoal-dados";
import { lotacoesAction } from "./actions";

/**
 * AS LOTAÇÕES — geradas pelo MOLDE (M32). A árvore do ente, com os lotados contados a cada leitura.
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PESSOAL");
  const consulta = lerConsulta(LOTACOES, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([listarLotacoes(consulta), opcoesDaLotacao(), acoesPermitidas(Object.values(LOTACOES.permissoes).filter((p): p is string => p !== undefined))]);
    return (
      <ListaDeRecurso
        definicao={LOTACOES}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, LOTACOES.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={<FormsDoRecurso definicao={LOTACOES} permitidas={[...permitidas]} opcoes={opcoes} action={lotacoesAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={LOTACOES.rotulo} subtitulo={LOTACOES.descricao} />
          <EstadoVazio titulo="Dados indisponíveis no momento" descricao="Não foi possível acessar as informações. Tente novamente mais tarde." />
        </div>
      );
    }
    throw e;
  }
}
