import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { SETORES } from "../../../../lib/portas/recursos/setores";
import { listarSetoresDoMolde } from "../../../../lib/portas/recursos/setores-dados";
import { PortaSemBancoError } from "../../../../lib/portas/recursos/dados";
import { acaoDeSetoresAction } from "./actions";

/**
 * V37 — Setores, tela do MOLDE (M21). O setor é exigido pela requisição de material e pela solicitação de compra, e
 * não havia onde cadastrá-lo. Filtros, ordenação e o formulário saem do descritor em `lib/portas/recursos/setores.ts`.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PROTOCOLO");
  const consulta = lerConsulta(SETORES, await searchParams);

  try {
    const [pagina, permitidas] = await Promise.all([
      listarSetoresDoMolde(consulta),
      acoesPermitidas(Object.values(SETORES.permissoes).filter((p): p is string => p !== undefined)),
    ]);
    return (
      <ListaDeRecurso
        definicao={SETORES}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, [])}
        formulario={<FormsDoRecurso definicao={SETORES} permitidas={[...permitidas]} opcoes={{}} action={acaoDeSetoresAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={SETORES.rotulo} subtitulo={SETORES.descricao} />
          <EstadoVazio titulo="Dados indisponíveis" descricao="Não foi possível acessar os dados deste cadastro no momento. Tente novamente em instantes." />
        </div>
      );
    }
    throw e;
  }
}
