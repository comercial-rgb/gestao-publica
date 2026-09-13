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
        motivoSemCriar="O programa entra no plano pelo detalhe do PPA (Planejamento > PPA > abrir o plano > Incluir programa no plano)."
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={PROGRAMAS_DO_PPA.rotulo} subtitulo={PROGRAMAS_DO_PPA.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê e grava o planejamento. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
