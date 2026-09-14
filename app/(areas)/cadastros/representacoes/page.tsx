import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { REPRESENTACOES } from "../../../../lib/portas/recursos/representacoes";
import { listarRepresentacoes, PortaSemBancoError } from "../../../../lib/portas/recursos/representacoes-dados";
import { representacoesAction } from "./actions";

/**
 * AS REPRESENTAÇÕES (M19, V6.2 P3) — listagem e registro pelo MOLDE, com os seletores referenciados de
 * pessoa e de conta. ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_CADASTROS");
  const consulta = lerConsulta(REPRESENTACOES, await searchParams);
  try {
    const [pagina, permitidas] = await Promise.all([listarRepresentacoes(consulta), acoesPermitidas(["REGISTRAR_REPRESENTACAO"])]);
    return (
      <ListaDeRecurso
        definicao={REPRESENTACOES}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, [])}
        formulario={<FormsDoRecurso definicao={REPRESENTACOES} permitidas={[...permitidas]} opcoes={{}} action={representacoesAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={REPRESENTACOES.rotulo} subtitulo={REPRESENTACOES.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê e grava as representações. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
