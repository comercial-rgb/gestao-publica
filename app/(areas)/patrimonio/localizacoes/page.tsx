import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { LOCALIZACOES_FISICAS } from "../../../../lib/portas/recursos/gestao-do-bem";
import {
  listarLocalizacoes,
  opcoesDaGestaoDoBem,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/gestao-do-bem-dados";
import { acaoDeLocalizacoesAction } from "./actions";

/**
 * LOCALIZAÇÕES FÍSICAS (TR 5.19.9) — gerada pelo MOLDE.
 *
 * ⚠️ REGIME DE SUPERFÍCIE, declarado. É cadastro de apoio: não move o razão, não tem coluna
 * de dinheiro e por isso não oferece seleção com soma — caixa de marcação sem total promete
 * uma operação que não existe.
 */
export const dynamic = "force-dynamic";

export default async function LocalizacoesPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const consulta = lerConsulta(LOCALIZACOES_FISICAS, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarLocalizacoes(consulta),
      // ⚠️ AS OPÇÕES VÊM DA PORTA, chaveadas pelo NOME DO CAMPO (`paiId`, `setorId`). O t20
      // do molde cobra essa correspondência: sem ela o select apareceria desabilitado
      // dizendo "nenhuma opção cadastrada" mesmo havendo registros.
      opcoesDaGestaoDoBem(),
      acoesPermitidas([
        ...Object.values(LOCALIZACOES_FISICAS.permissoes).filter((p): p is string => p !== undefined),
        ...LOCALIZACOES_FISICAS.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = LOCALIZACOES_FISICAS.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={LOCALIZACOES_FISICAS}
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
            definicao={LOCALIZACOES_FISICAS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeLocalizacoesAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={LOCALIZACOES_FISICAS.rotulo} subtitulo={LOCALIZACOES_FISICAS.descricao} />
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
