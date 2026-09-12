import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { BENS_PATRIMONIAIS } from "../../../../lib/portas/recursos/acervo";
import {
  listarBensPatrimoniais,
  opcoesDoAcervo,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/acervo-dados";
import { acaoDeBensPatrimoniaisAction } from "./actions";

/**
 * BENS PATRIMONIAIS — o acervo, gerado pelo MOLDE.
 *
 * ⚠️ ESTA ROTA NÃO É `/patrimonio/bens`. Aquela já existe e é a posição patrimonial por
 * classe, com emissão em PDF — um demonstrativo. Sobrepô-la teria trocado um relatório por um
 * cadastro sem que ninguém tivesse pedido.
 *
 * ⚠️ O BEM NÃO NASCE COM VALOR, e a tela não pede um. Valor é movimento patrimonial:
 * aquisição, reavaliação, depreciação, baixa. Um campo de valor aqui faria o operador acreditar
 * que cadastrar já incorpora — e a posição patrimonial contaria o acervo duas vezes.
 */
export const dynamic = "force-dynamic";

export default async function BensPatrimoniaisPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const consulta = lerConsulta(BENS_PATRIMONIAIS, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarBensPatrimoniais(consulta),
      opcoesDoAcervo(),
      acoesPermitidas([
        ...Object.values(BENS_PATRIMONIAIS.permissoes).filter((p): p is string => p !== undefined),
        ...BENS_PATRIMONIAIS.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = BENS_PATRIMONIAIS.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={BENS_PATRIMONIAIS}
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
            definicao={BENS_PATRIMONIAIS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeBensPatrimoniaisAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={BENS_PATRIMONIAIS.rotulo} subtitulo={BENS_PATRIMONIAIS.descricao} />
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
