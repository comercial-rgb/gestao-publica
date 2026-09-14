import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { FICHAS } from "../../../../lib/portas/recursos/fichas";
import { listarFichas, opcoesDaFicha, PortaSemBancoError } from "../../../../lib/portas/recursos/fichas-dados";
import { fichasAction } from "./actions";

/**
 * AS FICHAS ORÇAMENTÁRIAS — listagem e criação pelo MOLDE (M02, V6.2 U0).
 * ⚠️ A ficha criada aqui nasce SEM crédito (ver `lib/portas/recursos/fichas.ts`). `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PLANEJAMENTO");
  const consulta = lerConsulta(FICHAS, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([listarFichas(consulta), opcoesDaFicha(), acoesPermitidas(["CRIAR_FICHA"])]);
    return (
      <ListaDeRecurso
        definicao={FICHAS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, FICHAS.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={<FormsDoRecurso definicao={FICHAS} permitidas={[...permitidas]} opcoes={opcoes} action={fichasAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={FICHAS.rotulo} subtitulo={FICHAS.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê e grava o orçamento. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
