import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { FUNCOES } from "../../../../lib/portas/recursos/pessoal";
import { listarFuncoes, opcoesDaFuncao, PortaSemBancoError } from "../../../../lib/portas/recursos/pessoal-dados";
import { funcoesAction } from "./actions";

/**
 * AS FUNÇÕES DE PESSOAL — geradas pelo MOLDE (M32, TR 5.12.50).
 *
 * ⚠️ É A PONTA DE ENTRADA QUE FALTAVA. Sem ela o filtro "Função exercida" da lista de servidores
 * devolvia vazio PARA SEMPRE — não por erro do filtro, mas porque nada podia ser designado.
 *
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PESSOAL");
  const consulta = lerConsulta(FUNCOES, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarFuncoes(consulta),
      opcoesDaFuncao(),
      acoesPermitidas(Object.values(FUNCOES.permissoes).filter((p): p is string => p !== undefined)),
    ]);
    return (
      <ListaDeRecurso
        definicao={FUNCOES}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, FUNCOES.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={<FormsDoRecurso definicao={FUNCOES} permitidas={[...permitidas]} opcoes={opcoes} action={funcoesAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={FUNCOES.rotulo} subtitulo={FUNCOES.descricao} />
          <EstadoVazio titulo="Dados indisponíveis no momento" descricao="Não foi possível acessar as informações. Tente novamente mais tarde." />
        </div>
      );
    }
    throw e;
  }
}
