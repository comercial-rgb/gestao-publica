import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { SERVIDORES } from "../../../../lib/portas/recursos/pessoal";
import { listarServidores, opcoesDoServidor, PortaSemBancoError } from "../../../../lib/portas/recursos/pessoal-dados";
import { servidoresAction } from "./actions";

/**
 * OS SERVIDORES — gerados pelo MOLDE (M32, V6 P2.2). A ficha nasce de uma pessoa FÍSICA do cadastro único; os atos da vida funcional ficam no detalhe.
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PESSOAL");
  const consulta = lerConsulta(SERVIDORES, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([listarServidores(consulta), opcoesDoServidor(), acoesPermitidas(Object.values(SERVIDORES.permissoes).filter((p): p is string => p !== undefined))]);
    return (
      <ListaDeRecurso
        definicao={SERVIDORES}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, SERVIDORES.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={<FormsDoRecurso definicao={SERVIDORES} permitidas={[...permitidas]} opcoes={opcoes} action={servidoresAction} modo="criar" />}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={SERVIDORES.rotulo} subtitulo={SERVIDORES.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê e grava o pessoal. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
