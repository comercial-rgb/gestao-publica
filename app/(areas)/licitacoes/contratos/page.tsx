import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { CONTRATOS } from "../../../../lib/portas/recursos/contratacao";
import { listarContratos, PortaSemBancoError } from "../../../../lib/portas/recursos/contratacao-dados";
import { contratosAction } from "./actions";

/**
 * OS CONTRATOS — listagem do molde com valor e vigência DERIVADOS; aditivos e estornos no detalhe.
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md). `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const consulta = lerConsulta(CONTRATOS, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([listarContratos(consulta), Promise.resolve({}), Promise.resolve(new Set<string>())]);
    void opcoes;
    void permitidas;
    return (
      <ListaDeRecurso
        definicao={CONTRATOS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, CONTRATOS.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        motivoSemCriar="O contrato entra pelo detalhe do processo homologado (Licitações > Processos > abrir o processo > Cadastrar contrato)."
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={CONTRATOS.rotulo} subtitulo={CONTRATOS.descricao} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê e grava a contratação. Sem banco, não tem o que mostrar — e não vai fingir que tem." />
        </div>
      );
    }
    throw e;
  }
}
