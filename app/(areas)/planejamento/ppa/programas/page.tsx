import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { PROGRAMAS_DO_PPA } from "../../../../../lib/portas/recursos/plurianual";
import { listarProgramasDoPpa, PortaSemBancoError } from "../../../../../lib/portas/recursos/plurianual-dados";
import { programasdoppaAction } from "./actions";

/**
 * OS PROGRAMAS DO PPA — listagem do molde; indicadores e ações entram pelo detalhe de cada programa no plano.
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md). `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PLANEJAMENTO");
  const consulta = lerConsulta(PROGRAMAS_DO_PPA, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarProgramasDoPpa(consulta),
      Promise.resolve({}),
      Promise.resolve(new Set<string>()),
    ]);
    void opcoes;
    void permitidas;
    return (
      <ListaDeRecurso
        definicao={PROGRAMAS_DO_PPA}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, PROGRAMAS_DO_PPA.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        motivoSemCriar="Para incluir um programa, abra o PPA correspondente e use a opção Incluir programa no plano."
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={PROGRAMAS_DO_PPA.rotulo} subtitulo={PROGRAMAS_DO_PPA.descricao} />
          <EstadoVazio titulo="Serviço indisponível" descricao="Não foi possível carregar os dados. Tente novamente em instantes." />
        </div>
      );
    }
    throw e;
  }
}
