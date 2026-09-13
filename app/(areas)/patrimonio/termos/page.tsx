import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { TERMOS_PATRIMONIAIS } from "../../../../lib/portas/recursos/termos";
import { listarTermos, opcoesDosTermos, PortaSemBancoError } from "../../../../lib/portas/recursos/termos-dados";
import { acaoDeTermosAction } from "./actions";

/**
 * OS TERMOS PATRIMONIAIS — gerada pelo MOLDE (V3, pacote 2, unidade 5). Emitir é o ato que
 * registra o movimento de cada bem; o papel sai em PDF pelo detalhe.
 */
export const dynamic = "force-dynamic";

export default async function TermosPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PATRIMONIO");
  const consulta = lerConsulta(TERMOS_PATRIMONIAIS, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarTermos(consulta),
      opcoesDosTermos(),
      acoesPermitidas(Object.values(TERMOS_PATRIMONIAIS.permissoes).filter((p): p is string => p !== undefined)),
    ]);
    return (
      <ListaDeRecurso
        definicao={TERMOS_PATRIMONIAIS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, [])}
        formulario={
          <FormsDoRecurso
            definicao={TERMOS_PATRIMONIAIS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeTermosAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={TERMOS_PATRIMONIAIS.rotulo} subtitulo={TERMOS_PATRIMONIAIS.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê e grava termos. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
