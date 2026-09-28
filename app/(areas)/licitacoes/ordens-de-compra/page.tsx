import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { ORDENS_DE_COMPRA } from "../../../../lib/portas/recursos/compras";
import { listarOrdens, materiaisAtivos, opcoesDaOrdem, PortaSemBancoError } from "../../../../lib/portas/recursos/compras-dados";
import { FormOrdemDeCompra } from "./FormOrdemDeCompra";

/**
 * AS ORDENS DE COMPRA — lista do molde com total e saldo a receber derivados; a emissão (cabeçalho + itens) é a ilha FormOrdemDeCompra.
 * ⚠️ A criação é uma ILHA escrita à mão (itens em linhas) passada como `formulario` — o molde monta a lista.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const consulta = lerConsulta(ORDENS_DE_COMPRA, await searchParams);
  try {
    const [pagina, permitidas, opcoes, materiais] = await Promise.all([listarOrdens(consulta), acoesPermitidas(["EMITIR_ORDEM_DE_COMPRA"]), opcoesDaOrdem(), materiaisAtivos()]);
    const podeCriar = permitidas.has("EMITIR_ORDEM_DE_COMPRA");
    return (
      <ListaDeRecurso
        definicao={ORDENS_DE_COMPRA}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, ORDENS_DE_COMPRA.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        {...(podeCriar ? { formulario: <FormOrdemDeCompra materiais={materiais} fornecedores={(opcoes["fornecedorId"] ?? []).map((o) => ({ id: o.valor, rotulo: o.rotulo }))} processos={(opcoes["processoId"] ?? []).map((o) => ({ id: o.valor, rotulo: o.rotulo }))} fichas={(opcoes["fichaId"] ?? []).map((o) => ({ id: o.valor, rotulo: o.rotulo }))} /> } : { motivoSemCriar: "Seu perfil não tem permissão para emitir ordens de compra. Solicite a permissão ao administrador do sistema." })}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={ORDENS_DE_COMPRA.rotulo} subtitulo={ORDENS_DE_COMPRA.descricao} />
          <EstadoVazio titulo="Serviço indisponível" descricao="Não foi possível carregar os dados. Tente novamente em instantes." />
        </div>
      );
    }
    throw e;
  }
}
