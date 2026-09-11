import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { AUDITORIAS } from "../../../../lib/portas/recursos/definicoes";
import {
  listarAuditorias,
  opcoesDoCadastro,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/dados";
import { acaoDeAuditoriaAction } from "./actions";

/**
 * AUDITORIAS INTERNAS — gerada pelo MOLDE.
 *
 * ⚠️ REGIME DE SUPERFÍCIE, declarado. Este cadastro não move o razão: não há coluna de
 * dinheiro somável, e por isso a listagem não oferece seleção com soma — caixa de marcação
 * sem total é interface que promete uma operação que não existe.
 */
export const dynamic = "force-dynamic";

export default async function AuditoriasPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  // ⚠️ O GATE DE LEITURA É A SESSÃO, fail-closed. Não há ação de censo para LER: o censo é o
  // rol dos atos que MUTAM estado, e inventar um `LER_CONVENIO` criaria uma segunda régua de
  // visibilidade ao lado do recorte por unidade gestora.
  await exigirLeitura();
  const consulta = lerConsulta(AUDITORIAS, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarAuditorias(consulta),
      opcoesDoCadastro(),
      acoesPermitidas([
        ...Object.values(AUDITORIAS.permissoes).filter((p): p is string => p !== undefined),
        ...AUDITORIAS.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = AUDITORIAS.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={AUDITORIAS}
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
            definicao={AUDITORIAS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeAuditoriaAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={AUDITORIAS.rotulo} subtitulo={AUDITORIAS.descricao} />
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
