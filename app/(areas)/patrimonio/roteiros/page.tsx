import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { ROTEIROS_PATRIMONIAIS } from "../../../../lib/portas/recursos/roteiros";
import {
  listarRoteirosPatrimoniais,
  opcoesDosRoteiros,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/roteiros-dados";
import { acaoDeRoteirosPatrimoniaisAction } from "./actions";

/**
 * OS ROTEIROS CONTÁBEIS DO PATRIMÔNIO — gerada pelo MOLDE.
 *
 * ⚠️ ESTA TELA DESTRAVA O EIXO FINANCEIRO INTEIRO, e a medição é o argumento:
 * `RoteiroPatrimonial` tinha ZERO linhas e `MovimentoPatrimonial` também. Não por acaso —
 * `roteiroDoTipo` é fail-closed e recusa todo movimento de tipo sem roteiro. O acervo podia
 * ser cadastrado, classificado e movido de sala, e nenhum bem podia receber um centavo.
 *
 * ⚠️ A LISTA TRAZ OS TREZE EVENTOS, parametrizados ou não. Uma listagem das linhas gravadas
 * mostraria hoje uma tela vazia — verdadeira e inútil: o que falta é o que precisa ser visto.
 */
export const dynamic = "force-dynamic";

export default async function RoteirosPatrimoniaisPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const consulta = lerConsulta(ROTEIROS_PATRIMONIAIS, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarRoteirosPatrimoniais(consulta),
      opcoesDosRoteiros(),
      acoesPermitidas([
        ...Object.values(ROTEIROS_PATRIMONIAIS.permissoes).filter(
          (p): p is string => p !== undefined
        ),
        ...ROTEIROS_PATRIMONIAIS.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    return (
      <ListaDeRecurso
        definicao={ROTEIROS_PATRIMONIAIS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={
          // ⚠️ SOMA VAZIA, E NÃO `null`: este cadastro não tem coluna de dinheiro — um
          // roteiro é um par de contas, não um valor. O molde espera o MAPA (vazio ⇒ nada a
          // somar); `null` passa no editor e estoura no `next build`, que foi como apareceu.
          somarSelecionadas(pagina.linhas, consulta.selecionados, [])
        }
        formulario={
          <FormsDoRecurso
            definicao={ROTEIROS_PATRIMONIAIS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeRoteirosPatrimoniaisAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader
            titulo={ROTEIROS_PATRIMONIAIS.rotulo}
            subtitulo={ROTEIROS_PATRIMONIAIS.descricao}
          />
          <EstadoVazio
            titulo="Banco de dados indisponível"
            descricao="Esta tela lê o plano de contas e grava a parametrização. Sem banco, não tem o que mostrar — e não vai fingir que tem."
          />
        </div>
      );
    }
    throw e;
  }
}
