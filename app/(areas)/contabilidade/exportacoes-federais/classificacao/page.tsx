import Link from "next/link";
import { Alerta } from "../../../../../components/ui/Alerta";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { PortaSemBancoError } from "../../../../../lib/portas/cliente";
import {
  INDICADORES_DE_CENTRALIZACAO,
  lerClassificacaoDoManadPara,
  TETO_DAS_CLASSIFICADAS,
  TIPO_DE_CONTA_MANAD,
  TIPO_MANAD,
  TIPO_MANAD_DA_ACAO,
  type ClassificacaoNaTela,
  type GrupoDaClassificacao,
  type ItemDaClassificacao,
} from "../../../../../lib/portas/classificacao-do-manad";
import { FormCentralizacao, FormClassificacao } from "./FormsDaClassificacao";

/**
 * A CLASSIFICAÇÃO DO CADASTRO PARA O ARQUIVO DA RECEITA (MANAD) — o que só o ente responde e sem
 * o que o arquivo não é gerado: o tipo de cada unidade orçamentária, se cada ação é do RPPS, a
 * hierarquia das naturezas de despesa e de receita, e a forma de escrituração.
 *
 * Pendentes primeiro; as já classificadas a pedido (`?todas=1`), com teto.
 */
export const dynamic = "force-dynamic";

const OPCOES_UNIDADE = Object.entries(TIPO_MANAD).sort(([x], [y]) => x.localeCompare(y)) as [string, string][];
const OPCOES_ACAO = Object.entries(TIPO_MANAD_DA_ACAO).sort(([x], [y]) => x.localeCompare(y)) as [string, string][];
const OPCOES_CONTA = Object.entries(TIPO_DE_CONTA_MANAD).sort(([x], [y]) => x.localeCompare(y)) as [string, string][];
const OPCOES_CENTRALIZACAO = Object.entries(INDICADORES_DE_CENTRALIZACAO).sort(([x], [y]) => x.localeCompare(y)) as [string, string][];

type Grupo = "unidade" | "acao" | "natureza-despesa" | "natureza-receita";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly todas?: string }>;
}): Promise<React.ReactElement> {
  const sessao = await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const todas = (await searchParams).todas === "1";

  let dados: ClassificacaoNaTela | null = null;
  try {
    dados = await lerClassificacaoDoManadPara(sessao, todas);
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
  }

  const pendentes =
    dados === null
      ? 0
      : dados.unidades.pendentes.length + dados.acoes.pendentes.length + dados.naturezasDespesa.pendentes.length + dados.naturezasReceita.pendentes.length;

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Classificação para o arquivo da Receita Federal"
        subtitulo="Tipo das unidades orçamentárias, vínculo das ações ao regime próprio, hierarquia das naturezas de despesa e de receita e forma de escrituração, exigidos no arquivo digital da Receita (MANAD)."
        acoes={
          <Link href="/contabilidade/exportacoes-federais" className="text-sm font-medium text-[color:var(--color-primary)] hover:underline">
            Voltar aos arquivos para a STN e a Receita
          </Link>
        }
      />

      {dados === null ? (
        <EstadoVazio titulo="Banco de dados não configurado" descricao="A classificação é lida do cadastro orçamentário e precisa do banco." />
      ) : (
        <>
          {pendentes === 0 ? (
            <Alerta status="ok" titulo="Cadastro classificado">
              Todas as unidades, ações e naturezas cadastradas têm a classificação exigida pelo arquivo da Receita.
            </Alerta>
          ) : (
            <Alerta status="alerta" titulo={`${pendentes} ${pendentes === 1 ? "item pendente" : "itens pendentes"} de classificação`}>
              O arquivo da Receita não é gerado enquanto houver unidade, ação ou natureza com movimento sem classificação.
            </Alerta>
          )}

          <section aria-label="Forma de escrituração" className="space-y-3">
            <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">Forma de escrituração</h2>
            <Card>
              {dados.podeClassificar ? (
                <FormCentralizacao opcoes={OPCOES_CENTRALIZACAO} atual={dados.centralizacao} />
              ) : (
                <p className="text-sm text-[color:var(--color-ink)]">
                  {dados.centralizacao === null
                    ? "Não informada."
                    : INDICADORES_DE_CENTRALIZACAO[dados.centralizacao as keyof typeof INDICADORES_DE_CENTRALIZACAO] ?? dados.centralizacao}
                </p>
              )}
            </Card>
          </section>

          <Secao
            titulo="Unidades orçamentárias"
            descricao="Tipo de cada unidade, pela tabela oficial da Receita. É por ele que a fiscalização sabe onde procurar a retenção previdenciária."
            grupo="unidade"
            rotuloDoItem="da unidade"
            dados={dados.unidades}
            opcoes={OPCOES_UNIDADE}
            comNivel={false}
            pode={dados.podeClassificar}
            todas={todas}
          />
          <Secao
            titulo="Ações"
            descricao="Se a ação (projeto, atividade ou operação especial) é do regime próprio de previdência (RPPS) ou não."
            grupo="acao"
            rotuloDoItem="da ação"
            dados={dados.acoes}
            opcoes={OPCOES_ACAO}
            comNivel={false}
            pode={dados.podeClassificar}
            todas={todas}
          />
          <Secao
            titulo="Naturezas de despesa"
            descricao="Se a natureza é sintética ou analítica e o nível dela na hierarquia do plano de despesa do ente."
            grupo="natureza-despesa"
            rotuloDoItem="da natureza"
            dados={dados.naturezasDespesa}
            opcoes={OPCOES_CONTA}
            comNivel
            pode={dados.podeClassificar}
            todas={todas}
          />
          <Secao
            titulo="Naturezas de receita"
            descricao="Se a natureza é sintética ou analítica e o nível dela na hierarquia do plano de receita do ente."
            grupo="natureza-receita"
            rotuloDoItem="da natureza"
            dados={dados.naturezasReceita}
            opcoes={OPCOES_CONTA}
            comNivel
            pode={dados.podeClassificar}
            todas={todas}
          />

          <p className="text-sm">
            {todas ? (
              <Link href="/contabilidade/exportacoes-federais/classificacao" className="font-medium text-[color:var(--color-primary)] hover:underline">
                Mostrar só as pendentes
              </Link>
            ) : (
              <Link href="/contabilidade/exportacoes-federais/classificacao?todas=1" className="font-medium text-[color:var(--color-primary)] hover:underline">
                Mostrar também as já classificadas
              </Link>
            )}
          </p>

          {dados.podeClassificar ? null : (
            <p className="text-sm text-[color:var(--color-ink-2)]">
              Seu perfil permite consultar a classificação. Para alterá-la, solicite a permissão de cadastro da entidade contábil ao administrador do sistema.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function rotuloAtual(i: ItemDaClassificacao, opcoes: readonly [string, string][]): string {
  if (i.tipo === null) return "Pendente";
  const r = opcoes.find(([c]) => c === i.tipo)?.[1] ?? i.tipo;
  return i.nivel === null ? `${i.tipo} - ${r}` : `${r}, nível ${i.nivel}`;
}

function Secao({
  titulo,
  descricao,
  grupo,
  rotuloDoItem,
  dados,
  opcoes,
  comNivel,
  pode,
  todas,
}: {
  readonly titulo: string;
  readonly descricao: string;
  readonly grupo: Grupo;
  readonly rotuloDoItem: string;
  readonly dados: GrupoDaClassificacao;
  readonly opcoes: [string, string][];
  readonly comNivel: boolean;
  readonly pode: boolean;
  readonly todas: boolean;
}): React.ReactElement {
  const itens = [...dados.pendentes, ...dados.classificadas];
  return (
    <section aria-label={titulo} className="space-y-3" data-papel={`secao-${grupo}`}>
      <div>
        <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">
          {titulo}{" "}
          {dados.pendentes.length > 0 ? <Badge status="alerta">{dados.pendentes.length} pendente(s)</Badge> : <Badge status="ok">Classificadas</Badge>}
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{descricao}</p>
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-2)]">
          {dados.totalClassificadas > 0 ? `Nenhuma pendente. ${dados.totalClassificadas} já classificada(s).` : "Nenhum item cadastrado."}
        </p>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{titulo}: pendentes primeiro</caption>
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-ink-2)]">
                  <th scope="col" className="py-1 pr-4">Código</th>
                  <th scope="col" className="py-1 pr-4">Descrição</th>
                  <th scope="col" className="py-1 pr-4">Classificação atual</th>
                  {pode ? <th scope="col" className="py-1">Classificar</th> : null}
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id} className="border-t border-[color:var(--color-border)] align-top">
                    <td className="py-2 pr-4 tabular">{i.codigo}</td>
                    <td className="py-2 pr-4">{i.descricao}</td>
                    <td className="py-2 pr-4">{i.tipo === null ? <Badge status="alerta">Pendente</Badge> : rotuloAtual(i, opcoes)}</td>
                    {pode ? (
                      <td className="py-2">
                        <FormClassificacao
                          grupo={grupo}
                          id={i.id}
                          codigo={i.codigo}
                          rotuloDoItem={rotuloDoItem}
                          opcoes={opcoes}
                          tipoAtual={i.tipo}
                          comNivel={comNivel}
                          nivelAtual={i.nivel}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {todas && dados.totalClassificadas > TETO_DAS_CLASSIFICADAS ? (
            <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">
              Mostrando as primeiras {TETO_DAS_CLASSIFICADAS} de {dados.totalClassificadas} já classificadas, por código.
            </p>
          ) : null}
        </Card>
      )}
    </section>
  );
}
