import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { SOLICITACOES_DE_COMPRA } from "../../../../lib/portas/recursos/compras";
import { listarSolicitacoes, materiaisAtivos, opcoesDaSolicitacao, PortaSemBancoError } from "../../../../lib/portas/recursos/compras-dados";
import { FormSolicitacao } from "./FormSolicitacao";

/**
 * AS SOLICITAÇÕES DE COMPRA — lista do molde; a criação (cabeçalho + itens) é a ilha FormSolicitacao.
 * ⚠️ A criação é uma ILHA escrita à mão (itens em linhas) passada como `formulario` — o molde monta a lista.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const consulta = lerConsulta(SOLICITACOES_DE_COMPRA, await searchParams);
  try {
    const [pagina, permitidas, opcoes, materiais] = await Promise.all([listarSolicitacoes(consulta), acoesPermitidas(["REGISTRAR_SOLICITACAO_DE_COMPRA"]), opcoesDaSolicitacao(), materiaisAtivos()]);
    const podeCriar = permitidas.has("REGISTRAR_SOLICITACAO_DE_COMPRA");
    return (
      <ListaDeRecurso
        definicao={SOLICITACOES_DE_COMPRA}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, SOLICITACOES_DE_COMPRA.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        {...(podeCriar ? { formulario: <FormSolicitacao setores={(opcoes["setorId"] ?? []).map((o) => ({ id: o.valor, rotulo: o.rotulo }))} materiais={materiais} /> } : { motivoSemCriar: "Seu perfil não tem permissão para registrar solicitações de compra. Solicite a permissão ao administrador do sistema." })}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={SOLICITACOES_DE_COMPRA.rotulo} subtitulo={SOLICITACOES_DE_COMPRA.descricao} />
          <EstadoVazio titulo="Serviço indisponível" descricao="Não foi possível carregar os dados. Tente novamente em instantes." />
        </div>
      );
    }
    throw e;
  }
}
