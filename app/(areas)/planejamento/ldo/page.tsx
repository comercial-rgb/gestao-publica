import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { LEIS_DE_DIRETRIZES } from "../../../../lib/portas/recursos/plurianual";
import { listarLdos, opcoesDaLdo, PortaSemBancoError } from "../../../../lib/portas/recursos/plurianual-dados";
import { leisdediretrizesAction } from "./actions";

/**
 * A LDO — gerada pelo MOLDE (M02b, V4 §8). Prioridades e os anexos da LRF entram pelo detalhe; os PDFs saem de lá.
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md). `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PLANEJAMENTO");
  const consulta = lerConsulta(LEIS_DE_DIRETRIZES, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarLdos(consulta),
      opcoesDaLdo(),
      acoesPermitidas(Object.values(LEIS_DE_DIRETRIZES.permissoes).filter((p): p is string => p !== undefined)),
    ]);
    void opcoes;
    void permitidas;
    return (
      <ListaDeRecurso
        definicao={LEIS_DE_DIRETRIZES}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, LEIS_DE_DIRETRIZES.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={
          <FormsDoRecurso
            definicao={LEIS_DE_DIRETRIZES}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={leisdediretrizesAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={LEIS_DE_DIRETRIZES.rotulo} subtitulo={LEIS_DE_DIRETRIZES.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê e grava o planejamento. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
