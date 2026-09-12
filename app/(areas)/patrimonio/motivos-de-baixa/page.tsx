import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { MOTIVOS_DE_BAIXA } from "../../../../lib/portas/recursos/gestao-do-bem";
import {
  listarMotivosDeBaixa,
  opcoesDaGestaoDoBem,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/gestao-do-bem-dados";
import { acaoDeMotivosDeBaixaAction } from "./actions";

/**
 * MOTIVOS DE BAIXA (TR 5.19.30) — gerada pelo MOLDE.
 *
 * ⚠️ O ROL É DO ENTE, e é por isso que ele é cadastro e não `enum`: a cláusula manda que os
 * motivos sejam configuráveis pela instituição. Fechá-los no código obrigaria uma migração a
 * cada motivo novo que uma prefeitura precisasse.
 */
export const dynamic = "force-dynamic";

export default async function MotivosDeBaixaPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const consulta = lerConsulta(MOTIVOS_DE_BAIXA, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarMotivosDeBaixa(consulta),
      opcoesDaGestaoDoBem(),
      acoesPermitidas([
        ...Object.values(MOTIVOS_DE_BAIXA.permissoes).filter((p): p is string => p !== undefined),
        ...MOTIVOS_DE_BAIXA.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = MOTIVOS_DE_BAIXA.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={MOTIVOS_DE_BAIXA}
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
            definicao={MOTIVOS_DE_BAIXA}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeMotivosDeBaixaAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={MOTIVOS_DE_BAIXA.rotulo} subtitulo={MOTIVOS_DE_BAIXA.descricao} />
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
