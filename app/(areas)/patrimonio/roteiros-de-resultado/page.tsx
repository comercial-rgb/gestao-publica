import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { ROTEIROS_DE_RESULTADO } from "../../../../lib/portas/recursos/roteiros";
import {
  listarRoteirosDeResultado,
  opcoesDosRoteiros,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/roteiros-dados";
import { acaoDeRoteirosDeResultadoAction } from "./actions";

/**
 * OS ROTEIROS DO RESULTADO DA ALIENAÇÃO — gerada pelo MOLDE.
 *
 * ⚠️ SÃO DUAS LINHAS, GANHO E PERDA, e é tabela separada de propósito: o resultado não muda
 * o ativo — o bem já saiu pela baixa. Enfiá-lo no enum dos movimentos poluiria os dois
 * Records exaustivos que seguram a corretude do M10.
 */
export const dynamic = "force-dynamic";

export default async function RoteirosDeResultadoPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const consulta = lerConsulta(ROTEIROS_DE_RESULTADO, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarRoteirosDeResultado(consulta),
      opcoesDosRoteiros(),
      acoesPermitidas([
        ...Object.values(ROTEIROS_DE_RESULTADO.permissoes).filter(
          (p): p is string => p !== undefined
        ),
        ...ROTEIROS_DE_RESULTADO.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    return (
      <ListaDeRecurso
        definicao={ROTEIROS_DE_RESULTADO}
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
            definicao={ROTEIROS_DE_RESULTADO}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeRoteirosDeResultadoAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader
            titulo={ROTEIROS_DE_RESULTADO.rotulo}
            subtitulo={ROTEIROS_DE_RESULTADO.descricao}
          />
          <EstadoVazio
            titulo="Banco de dados indisponível"
            descricao="Esta tela lê o plano de contas e grava a parametrização. Sem banco, não tem o que mostrar — e não vai fingir que tem."
          />
        </div>
      );
    }
    throw e;
  }
}
