import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { PLANOS_PLURIANUAIS } from "../../../../lib/portas/recursos/plurianual";
import { listarPlanos, opcoesDoPlano, PortaSemBancoError } from "../../../../lib/portas/recursos/plurianual-dados";
import { planosplurianuaisAction } from "./actions";

/**
 * O PLANO PLURIANUAL — gerado pelo MOLDE (M02b, V4 §8). O programa, a receita e a série histórica entram pelo detalhe.
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md). `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PLANEJAMENTO");
  const consulta = lerConsulta(PLANOS_PLURIANUAIS, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarPlanos(consulta),
      opcoesDoPlano(),
      acoesPermitidas(Object.values(PLANOS_PLURIANUAIS.permissoes).filter((p): p is string => p !== undefined)),
    ]);
    void opcoes;
    void permitidas;
    return (
      <ListaDeRecurso
        definicao={PLANOS_PLURIANUAIS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, PLANOS_PLURIANUAIS.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={
          <FormsDoRecurso
            definicao={PLANOS_PLURIANUAIS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={planosplurianuaisAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={PLANOS_PLURIANUAIS.rotulo} subtitulo={PLANOS_PLURIANUAIS.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê e grava o planejamento. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
