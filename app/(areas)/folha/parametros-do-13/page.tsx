import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { PARAMETROS_DO_DECIMO_TERCEIRO } from "../../../../lib/portas/recursos/folha";
import {
  listarParametrosDoDecimoTerceiro,
  rubricasParaOParametroDo13,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/folha-dados";
import { FormParametroDo13 } from "./FormParametroDo13";

/**
 * OS PARÂMETROS DO 13º DO ENTE (M33, V11 V9.1) — lista do molde; o cadastro é a ilha
 * `FormParametroDo13` (as rubricas da base são linhas, e o molde não monta múltiplas linhas).
 *
 * ⚠️ A SITUAÇÃO É DERIVADA a cada leitura: vigente é a de maior versão do exercício. Não há coluna
 * de situação, e as versões anteriores continuam listadas — as folhas que elas calcularam citam o
 * id e a versão na memória, e sem a linha o contracheque deixaria de se explicar.
 *
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const consulta = lerConsulta(PARAMETROS_DO_DECIMO_TERCEIRO, await searchParams);
  try {
    const [pagina, rubricas, permitidas] = await Promise.all([
      listarParametrosDoDecimoTerceiro(consulta),
      rubricasParaOParametroDo13(),
      acoesPermitidas(["CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO"]),
    ]);
    const podeCriar = permitidas.has("CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO");
    return (
      <ListaDeRecurso
        definicao={PARAMETROS_DO_DECIMO_TERCEIRO}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        // Nenhuma coluna deste recurso é somável (não há dinheiro na lista de parâmetros), então
        // a coluna de marcação nem aparece — mas a prop é obrigatória, e o vazio diz isso.
        somaDaSelecao={{}}
        {...(podeCriar
          ? { formulario: <FormParametroDo13 proventos={rubricas.proventos} base={rubricas.base} abatimento={rubricas.abatimento} adiantamentosQuePermitemPago={rubricas.adiantamentosQuePermitemPago} /> }
          : {
              motivoSemCriar:
                "Seu perfil não tem permissão para configurar os parâmetros do 13º. Essa permissão é específica e não " +
                "acompanha a de configurar as tabelas da folha. Solicite a permissão ao administrador do sistema.",
            })}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={PARAMETROS_DO_DECIMO_TERCEIRO.rotulo} subtitulo={PARAMETROS_DO_DECIMO_TERCEIRO.descricao} />
          <EstadoVazio
            titulo="Dados indisponíveis no momento"
            descricao="Não foi possível acessar as informações. Tente novamente mais tarde."
          />
        </div>
      );
    }
    throw e;
  }
}
