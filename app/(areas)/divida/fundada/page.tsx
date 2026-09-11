import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { DIVIDA_FUNDADA } from "../../../../lib/portas/recursos/definicoes";
import {
  listarDividasFundadas,
  opcoesDoCadastro,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/dados";
import { acaoDeDividaFundadaAction } from "./actions";

/**
 * DÍVIDA FUNDADA — gerada pelo MOLDE.
 *
 * ⚠️ O SALDO DEVEDOR É DERIVADO dos movimentos, nunca uma coluna — e a
 * atualização monetária também o move, por isso ele não é `ingressado − amortizado`.
 */
export const dynamic = "force-dynamic";

export default async function DividaFundadaPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const consulta = lerConsulta(DIVIDA_FUNDADA, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarDividasFundadas(consulta),
      opcoesDoCadastro({ classesDeConta: DIVIDA_FUNDADA.classesDeConta ?? [] }),
      acoesPermitidas([
        ...Object.values(DIVIDA_FUNDADA.permissoes).filter((p): p is string => p !== undefined),
        ...DIVIDA_FUNDADA.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = DIVIDA_FUNDADA.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={DIVIDA_FUNDADA}
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
            definicao={DIVIDA_FUNDADA}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeDividaFundadaAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={DIVIDA_FUNDADA.rotulo} subtitulo={DIVIDA_FUNDADA.descricao} />
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
