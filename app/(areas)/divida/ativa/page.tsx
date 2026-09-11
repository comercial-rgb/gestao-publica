import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { DIVIDA_ATIVA } from "../../../../lib/portas/recursos/definicoes";
import {
  listarDividasAtivas,
  opcoesDoCadastro,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/dados";
import { acaoDeDividaAtivaAction } from "./actions";

/**
 * DÍVIDA ATIVA — gerada pelo MOLDE.
 *
 * ⚠️ O RECEBIMENTO NÃO ESTÁ ENTRE AS AÇÕES desta tela, e isso é decisão: ele é
 * RECEITA ORÇAMENTÁRIA e entra pela guia de arrecadação (M04). Oferecê-lo aqui criaria um
 * segundo caminho para o mesmo fato — e o segundo caminho contaria a receita duas vezes.
 */
export const dynamic = "force-dynamic";

export default async function DividaAtivaPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const consulta = lerConsulta(DIVIDA_ATIVA, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarDividasAtivas(consulta),
      opcoesDoCadastro(),
      acoesPermitidas([
        ...Object.values(DIVIDA_ATIVA.permissoes).filter((p): p is string => p !== undefined),
        ...DIVIDA_ATIVA.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = DIVIDA_ATIVA.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={DIVIDA_ATIVA}
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
            definicao={DIVIDA_ATIVA}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeDividaAtivaAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={DIVIDA_ATIVA.rotulo} subtitulo={DIVIDA_ATIVA.descricao} />
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
