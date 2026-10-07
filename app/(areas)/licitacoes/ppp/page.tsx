import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { PARCERIAS_PUBLICO_PRIVADAS } from "../../../../lib/portas/recursos/ppp";
import { listarPpps, PortaSemBancoError } from "../../../../lib/portas/recursos/ppp-dados";
import { pppAction } from "./actions";

/**
 * V36 — AS PARCERIAS PÚBLICO-PRIVADAS, pelo MOLDE (M11, TR 5.10.1.87-89). Situação, parcelas, documentos e empenhos no detalhe.
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md). `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const consulta = lerConsulta(PARCERIAS_PUBLICO_PRIVADAS, await searchParams);
  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarPpps(consulta),
      Promise.resolve({}),
      acoesPermitidas(Object.values(PARCERIAS_PUBLICO_PRIVADAS.permissoes).filter((p): p is string => p !== undefined)),
    ]);
    void opcoes;
    void permitidas;
    return (
      <ListaDeRecurso
        definicao={PARCERIAS_PUBLICO_PRIVADAS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, PARCERIAS_PUBLICO_PRIVADAS.colunas.filter((c) => c.somavel === true).map((c) => c.nome))}
        formulario={
          <FormsDoRecurso
            definicao={PARCERIAS_PUBLICO_PRIVADAS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={pppAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={PARCERIAS_PUBLICO_PRIVADAS.rotulo} subtitulo={PARCERIAS_PUBLICO_PRIVADAS.descricao} />
          <EstadoVazio titulo="Serviço indisponível" descricao="Não foi possível carregar os dados. Tente novamente em instantes." />
        </div>
      );
    }
    throw e;
  }
}
