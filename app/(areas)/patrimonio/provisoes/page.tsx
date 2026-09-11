import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { PROVISOES } from "../../../../lib/portas/recursos/definicoes";
import {
  listarProvisoes,
  opcoesDoCadastro,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/dados";
import { acaoDeProvisaoAction } from "./actions";

/**
 * PROVISÕES — gerada pelo MOLDE.
 *
 * ⚠️ O SALDO PROVISIONADO É DERIVADO dos movimentos, nunca uma coluna — e não é
 * `constituído − revertido`: os estornos entram com o sinal deles, e quem conhece os
 * sinais é `SINAL_MOVIMENTO_PROVISAO`, no módulo.
 */
export const dynamic = "force-dynamic";

export default async function ProvisoesPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const consulta = lerConsulta(PROVISOES, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarProvisoes(consulta),
      opcoesDoCadastro({ classesDeConta: PROVISOES.classesDeConta ?? [] }),
      acoesPermitidas([
        ...Object.values(PROVISOES.permissoes).filter((p): p is string => p !== undefined),
        ...PROVISOES.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = PROVISOES.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={PROVISOES}
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
            definicao={PROVISOES}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeProvisaoAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={PROVISOES.rotulo} subtitulo={PROVISOES.descricao} />
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
