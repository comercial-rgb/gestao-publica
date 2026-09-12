import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { TIPOS_DE_INCORPORACAO } from "../../../../lib/portas/recursos/gestao-do-bem";
import {
  listarTiposDeIncorporacao,
  opcoesDaGestaoDoBem,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/gestao-do-bem-dados";
import { acaoDeTiposDeIncorporacaoAction } from "./actions";

/**
 * TIPOS DE INCORPORAÇÃO (TR 5.19.3 e 5.19.7) — gerada pelo MOLDE.
 *
 * ⚠️ A COLUNA "BENS" É DERIVADA, e não um contador guardado: ela conta os bens que apontam
 * para este tipo. Um contador em coluna divergiria do fato na primeira baixa.
 */
export const dynamic = "force-dynamic";

export default async function TiposDeIncorporacaoPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const consulta = lerConsulta(TIPOS_DE_INCORPORACAO, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarTiposDeIncorporacao(consulta),
      opcoesDaGestaoDoBem(),
      acoesPermitidas([
        ...Object.values(TIPOS_DE_INCORPORACAO.permissoes).filter((p): p is string => p !== undefined),
        ...TIPOS_DE_INCORPORACAO.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = TIPOS_DE_INCORPORACAO.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={TIPOS_DE_INCORPORACAO}
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
            definicao={TIPOS_DE_INCORPORACAO}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeTiposDeIncorporacaoAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={TIPOS_DE_INCORPORACAO.rotulo} subtitulo={TIPOS_DE_INCORPORACAO.descricao} />
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
