import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { PARAMETROS_DE_ATUALIZACAO } from "../../../../lib/portas/recursos/parametros";
import {
  listarParametros,
  opcoesDosParametros,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/parametros-dados";
import { acaoDeParametrosAction } from "./actions";

/**
 * OS PARÂMETROS DE DEPRECIAÇÃO, AMORTIZAÇÃO E EXAUSTÃO — gerada pelo MOLDE (V3, pacote 2).
 *
 * A lista traz TODAS as classes ativas, parametrizadas ou não: o que falta é o que precisa
 * ser visto. Cada definição é uma versão; o detalhe tem o histórico.
 */
export const dynamic = "force-dynamic";

export default async function ParametrosDeAtualizacaoPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PATRIMONIO");
  const consulta = lerConsulta(PARAMETROS_DE_ATUALIZACAO, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarParametros(consulta),
      opcoesDosParametros(),
      acoesPermitidas([
        ...Object.values(PARAMETROS_DE_ATUALIZACAO.permissoes).filter((p): p is string => p !== undefined),
        ...PARAMETROS_DE_ATUALIZACAO.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);
    return (
      <ListaDeRecurso
        definicao={PARAMETROS_DE_ATUALIZACAO}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, [])}
        formulario={
          <FormsDoRecurso
            definicao={PARAMETROS_DE_ATUALIZACAO}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeParametrosAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={PARAMETROS_DE_ATUALIZACAO.rotulo} subtitulo={PARAMETROS_DE_ATUALIZACAO.descricao} />
          <EstadoVazio
            titulo="Dados indisponíveis"
            descricao="Não foi possível acessar os parâmetros no momento. Tente novamente em instantes."
          />
        </div>
      );
    }
    throw e;
  }
}
