import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { CONSORCIOS } from "../../../../lib/portas/recursos/definicoes";
import {
  listarConsorcios,
  opcoesDoCadastro,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/dados";
import { acaoDeConsorcioAction } from "./actions";

/**
 * CONSÓRCIOS PÚBLICOS — gerada pelo MOLDE.
 *
 * ⚠️ OS SALDOS SÃO DO EXERCÍCIO ESCOLHIDO NO FILTRO, e o padrão é o ano CIVIL DO ENTE — não
 * `new Date().getFullYear()`, que às 22:00 de 31/12 já diria o ano seguinte e mostraria um
 * rateio que ainda não existe.
 */
export const dynamic = "force-dynamic";

export default async function ConsorciosPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  // ⚠️ O GATE DE LEITURA É A SESSÃO, fail-closed. Não há ação de censo para LER: o censo é o
  // rol dos atos que MUTAM estado, e inventar um `LER_CONVENIO` criaria uma segunda régua de
  // visibilidade ao lado do recorte por unidade gestora.
  await exigirLeitura();
  const consulta = lerConsulta(CONSORCIOS, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarConsorcios(consulta),
      opcoesDoCadastro({ classesDeConta: CONSORCIOS.classesDeConta ?? [] }),
      acoesPermitidas([
        ...Object.values(CONSORCIOS.permissoes).filter((p): p is string => p !== undefined),
        ...CONSORCIOS.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = CONSORCIOS.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={CONSORCIOS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, somaveis)}
        formulario={
          <FormsDoRecurso
            definicao={CONSORCIOS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeConsorcioAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={CONSORCIOS.rotulo} subtitulo={CONSORCIOS.descricao} />
          <EstadoVazio
            titulo="Banco de dados indisponível"
            descricao="Este cadastro lê e escreve no banco. Sem ele, esta tela não tem o que mostrar — e não vai fingir que tem."
          />
        </div>
      );
    }
    throw e;
  }
}
