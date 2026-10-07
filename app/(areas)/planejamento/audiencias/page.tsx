import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { AUDIENCIAS_PUBLICAS } from "../../../../lib/portas/recursos/audiencias";
import { listarAudiencias, opcoesDaAudiencia, PortaSemBancoError } from "../../../../lib/portas/recursos/audiencias-dados";
import { audienciasAction } from "./actions";

/**
 * V36 — AS AUDIÊNCIAS PÚBLICAS do planejamento, pelo MOLDE (M02b, TR 5.9.1.1-2). Solicitações e documentos entram pelo detalhe.
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md). `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PLANEJAMENTO");
  const consulta = lerConsulta(AUDIENCIAS_PUBLICAS, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarAudiencias(consulta),
      opcoesDaAudiencia(),
      acoesPermitidas(Object.values(AUDIENCIAS_PUBLICAS.permissoes).filter((p): p is string => p !== undefined)),
    ]);
    void opcoes;
    void permitidas;
    return (
      <ListaDeRecurso
        definicao={AUDIENCIAS_PUBLICAS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, AUDIENCIAS_PUBLICAS.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={
          <FormsDoRecurso
            definicao={AUDIENCIAS_PUBLICAS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={audienciasAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={AUDIENCIAS_PUBLICAS.rotulo} subtitulo={AUDIENCIAS_PUBLICAS.descricao} />
          <EstadoVazio titulo="Serviço indisponível" descricao="Não foi possível carregar os dados. Tente novamente em instantes." />
        </div>
      );
    }
    throw e;
  }
}
