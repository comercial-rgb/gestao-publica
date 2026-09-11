import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { CONVENIOS } from "../../../../lib/portas/recursos/definicoes";
import {
  listarConvenios,
  opcoesDoCadastro,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/dados";
import { acaoDeConvenioAction } from "./actions";

/**
 * CONVÊNIOS DE REPASSE — a primeira tela gerada pelo MOLDE.
 *
 * ⚠️ ELA NÃO TEM LAYOUT PRÓPRIO, e é esse o ponto. Filtros compostos, ordenação por URL,
 * paginação, exportação, seleção múltipla com soma no servidor e o formulário de criação
 * saem do descritor (`lib/portas/recursos/definicoes.ts`). O que sobra aqui é o que é
 * genuinamente deste cadastro: QUAL porta ler e QUAL Server Action ligar.
 */
export const dynamic = "force-dynamic";

export default async function ConveniosPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  // ⚠️ O GATE DE LEITURA É A SESSÃO, fail-closed. Não há ação de censo para LER: o censo é o
  // rol dos atos que MUTAM estado, e inventar um `LER_CONVENIO` criaria uma segunda régua de
  // visibilidade ao lado do recorte por unidade gestora.
  await exigirLeitura();
  const consulta = lerConsulta(CONVENIOS, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarConvenios(consulta),
      opcoesDoCadastro({ classesDeConta: CONVENIOS.classesDeConta ?? [] }),
      acoesPermitidas([
        ...Object.values(CONVENIOS.permissoes).filter((p): p is string => p !== undefined),
        ...CONVENIOS.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = CONVENIOS.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={CONVENIOS}
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
            definicao={CONVENIOS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeConvenioAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={CONVENIOS.rotulo} subtitulo={CONVENIOS.descricao} />
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
