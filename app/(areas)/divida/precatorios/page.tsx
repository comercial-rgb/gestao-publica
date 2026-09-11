import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { PRECATORIOS } from "../../../../lib/portas/recursos/definicoes";
import {
  listarPrecatorios,
  opcoesDoCadastro,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/dados";
import { acaoDePrecatorioAction } from "./actions";

/**
 * PRECATÓRIOS JUDICIAIS — gerada pelo MOLDE.
 *
 * ⚠️ A LISTAGEM JÁ SAI NA ORDEM DO ART. 100, e essa ordem NÃO é um `orderBy` do SQL: ela
 * depende do saldo devido (Σ dos movimentos) e da regra de que a preferência do §2º só vale
 * DENTRO dos alimentares. Quem ordena é `ordenarFilaDePrecatorios`, no domínio.
 */
export const dynamic = "force-dynamic";

export default async function PrecatoriosPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  // ⚠️ O GATE DE LEITURA É A SESSÃO, fail-closed. Não há ação de censo para LER: o censo é o
  // rol dos atos que MUTAM estado, e inventar um `LER_CONVENIO` criaria uma segunda régua de
  // visibilidade ao lado do recorte por unidade gestora.
  await exigirLeitura();
  const consulta = lerConsulta(PRECATORIOS, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarPrecatorios(consulta),
      opcoesDoCadastro(),
      acoesPermitidas([
        ...Object.values(PRECATORIOS.permissoes).filter((p): p is string => p !== undefined),
        ...PRECATORIOS.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = PRECATORIOS.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={PRECATORIOS}
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
            definicao={PRECATORIOS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDePrecatorioAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={PRECATORIOS.rotulo} subtitulo={PRECATORIOS.descricao} />
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
