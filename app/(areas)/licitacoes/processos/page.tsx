import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { PROCESSOS_LICITATORIOS } from "../../../../lib/portas/recursos/contratacao";
import { listarProcessos, opcoesDoProcesso, PortaSemBancoError } from "../../../../lib/portas/recursos/contratacao-dados";
import { processoslicitatoriosAction } from "./actions";

/**
 * OS PROCESSOS LICITATÓRIOS — gerados pelo MOLDE (M11, V4 §8). Homologar, reservar e contratar ficam no detalhe.
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md). `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const consulta = lerConsulta(PROCESSOS_LICITATORIOS, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([listarProcessos(consulta), opcoesDoProcesso(), acoesPermitidas(Object.values(PROCESSOS_LICITATORIOS.permissoes).filter((p): p is string => p !== undefined))]);
    void opcoes;
    void permitidas;
    return (
      <ListaDeRecurso
        definicao={PROCESSOS_LICITATORIOS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, PROCESSOS_LICITATORIOS.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={
          <FormsDoRecurso definicao={PROCESSOS_LICITATORIOS} permitidas={[...permitidas]} opcoes={opcoes} action={processoslicitatoriosAction} modo="criar" />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={PROCESSOS_LICITATORIOS.rotulo} subtitulo={PROCESSOS_LICITATORIOS.descricao} />
          <EstadoVazio titulo="Serviço indisponível" descricao="Não foi possível carregar os dados. Tente novamente em instantes." />
        </div>
      );
    }
    throw e;
  }
}
