import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { OBRAS } from "../../../../lib/portas/recursos/definicoes";
import {
  listarObras,
  opcoesDoCadastro,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/dados";
import { acaoDeObraAction } from "./actions";

/**
 * OBRAS — gerada pelo MOLDE.
 *
 * ⚠️ MEDIDO E APROVADO SÃO COLUNAS SEPARADAS de propósito: a diferença entre as duas
 * é exatamente o que ainda NÃO autoriza liquidar.
 */
export const dynamic = "force-dynamic";

export default async function ObrasPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const consulta = lerConsulta(OBRAS, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarObras(consulta),
      opcoesDoCadastro(),
      acoesPermitidas([
        ...Object.values(OBRAS.permissoes).filter((p): p is string => p !== undefined),
        ...OBRAS.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = OBRAS.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={OBRAS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, somaveis)}
        formulario={
          <FormsDoRecurso
            definicao={OBRAS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeObraAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={OBRAS.rotulo} subtitulo={OBRAS.descricao} />
          <EstadoVazio
            titulo="Banco de dados indisponível"
            descricao="Este cadastro lê e escreve no banco. Sem ele, esta tela não tem o que mostrar — e não vai fingir que tem."
          />
        </div>
      );
    }
    throw e;
  }
}
