import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { CLASSES_DE_BENS } from "../../../../lib/portas/recursos/acervo";
import {
  listarClassesDeBens,
  opcoesDoAcervo,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/acervo-dados";
import { acaoDeClassesDeBensAction } from "./actions";

/**
 * CLASSES DE BENS — gerada pelo MOLDE.
 *
 * ⚠️ ELA VEM ANTES DA TELA DO BEM, e a ordem foi medida, não intuída: `ClasseDeBens` tinha
 * ZERO registros no banco. Sem este cadastro, o seletor de classe do formulário do bem
 * nasceria desabilitado dizendo "nenhuma opção cadastrada" — mensagem correta apontando a
 * causa errada, que é exatamente o defeito que o almoxarifado já cobrou uma vez.
 */
export const dynamic = "force-dynamic";

export default async function ClassesDeBensPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const consulta = lerConsulta(CLASSES_DE_BENS, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarClassesDeBens(consulta),
      opcoesDoAcervo(),
      acoesPermitidas([
        ...Object.values(CLASSES_DE_BENS.permissoes).filter((p): p is string => p !== undefined),
        ...CLASSES_DE_BENS.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = CLASSES_DE_BENS.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={CLASSES_DE_BENS}
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
            definicao={CLASSES_DE_BENS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeClassesDeBensAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={CLASSES_DE_BENS.rotulo} subtitulo={CLASSES_DE_BENS.descricao} />
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
