import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { EMENTARIO_DA_RECEITA } from "../../../../lib/portas/recursos/ementario-receita";
import { listarNaturezasDeReceita, PortaSemBancoError } from "../../../../lib/portas/recursos/ementario-receita-dados";
import { acaoDoEmentarioAction } from "./actions";

/**
 * Naturezas de receita — o ementário da receita do ente (M04), pela superfície do molde.
 *
 * ⚠️ O QUE É DESTA TELA, E SÓ ISSO: qual porta ler e qual Server Action ligar. A estrutura do
 * código, a duplicata e a autorização são do serviço `cadastrarNaturezaReceita`.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_RECEITA");
  const consulta = lerConsulta(EMENTARIO_DA_RECEITA, await searchParams);

  try {
    const [pagina, permitidas] = await Promise.all([
      listarNaturezasDeReceita(consulta),
      acoesPermitidas(
        Object.values(EMENTARIO_DA_RECEITA.permissoes).filter((p): p is string => p !== undefined)
      ),
    ]);

    return (
      <ListaDeRecurso
        definicao={EMENTARIO_DA_RECEITA}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={{}}
        formulario={
          <FormsDoRecurso
            definicao={EMENTARIO_DA_RECEITA}
            permitidas={[...permitidas]}
            opcoes={{}}
            action={acaoDoEmentarioAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={EMENTARIO_DA_RECEITA.rotulo} subtitulo={EMENTARIO_DA_RECEITA.descricao} />
          <EstadoVazio
            titulo="Dados indisponíveis"
            descricao="Não foi possível acessar o ementário da receita no momento. Tente novamente em instantes."
          />
        </div>
      );
    }
    throw e;
  }
}
