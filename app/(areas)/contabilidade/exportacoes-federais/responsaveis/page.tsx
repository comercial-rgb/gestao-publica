import Link from "next/link";
import { Alerta } from "../../../../../components/ui/Alerta";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { PortaSemBancoError } from "../../../../../lib/portas/cliente";
import {
  lerResponsaveisDoManadPara,
  type ResponsaveisNaTela,
  type ResponsavelNaTela,
} from "../../../../../lib/portas/responsaveis-do-manad";
import { formatarDocumento } from "../../../../../packages/documento/index";
import { FormContabilista, FormEmpresaGeradora } from "./FormsDosResponsaveis";

/**
 * OS RESPONSÁVEIS PELO ARQUIVO DA RECEITA — o contabilista, a empresa ou técnico que gera o
 * arquivo, e o indicador de centralização da escrituração.
 *
 * ⚠️ LEITURA: `CONSULTAR_CONTABILIDADE` no ente (a mesma dos arquivos federais). Os formulários só
 * aparecem para quem tem a ação de cadastro — e o servidor confere de novo ao gravar.
 *
 * ⚠️ SEM `id` LITERAL: as seções se rotulam por `aria-label`; os campos recebem id do `useId`.
 */
export const dynamic = "force-dynamic";

/** "AAAA-MM-DD" -> "DD/MM/AAAA". A data do cadastro é dia do leiaute, sem fuso. */
function diaBr(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${d ?? ""}/${m ?? ""}/${a ?? ""}`;
}

export default async function Pagina(): Promise<React.ReactElement> {
  const sessao = await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");

  let dados: ResponsaveisNaTela | null = null;
  try {
    dados = await lerResponsaveisDoManadPara(sessao);
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Responsáveis pelo arquivo da Receita Federal"
        subtitulo="Contabilista, empresa ou técnico que gera o arquivo e forma de escrituração do ente, informados no arquivo digital da Receita (MANAD)."
        acoes={
          <Link
            href="/contabilidade/exportacoes-federais"
            className="text-sm font-medium text-[color:var(--color-primary)] hover:underline"
          >
            Voltar aos arquivos para a STN e a Receita
          </Link>
        }
      />

      {dados === null ? (
        <EstadoVazio
          titulo="Banco de dados não configurado"
          descricao="Os responsáveis são lidos do cadastro do ente e precisam do banco."
        />
      ) : (
        <>
          <section aria-label="Forma de escrituração do ente" className="space-y-3" data-papel="secao-centralizacao">
            <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">Forma de escrituração</h2>
            {dados.centralizacao === null ? (
              <Alerta status="alerta" titulo="Forma de escrituração não informada">
                O arquivo da Receita informa se a escrituração do ente é centralizada. Informe-a em{" "}
                <Link href="/contabilidade/exportacoes-federais/classificacao" className="font-medium text-[color:var(--color-primary)] hover:underline">
                  Classificação para o arquivo da Receita
                </Link>
                .
              </Alerta>
            ) : (
              <Card>
                <p className="text-sm text-[color:var(--color-ink)]" data-papel="centralizacao">
                  {dados.centralizacao.descricao}
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
                  Para alterá-la, use a{" "}
                  <Link href="/contabilidade/exportacoes-federais/classificacao" className="font-medium text-[color:var(--color-primary)] hover:underline">
                    Classificação para o arquivo da Receita
                  </Link>
                  .
                </p>
              </Card>
            )}
          </section>

          <section aria-label="Contabilista responsável" className="space-y-3" data-papel="secao-contabilistas">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">Contabilista responsável</h2>
              <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
                O arquivo de cada exercício leva o contabilista que respondeu pela escrituração
                naquele período. Os registros anteriores permanecem no histórico.
              </p>
            </div>
            <ListaDeResponsaveis
              itens={dados.contabilistas}
              vazio="Nenhum contabilista registrado."
              rotuloDoDocumento="CPF"
              papel="lista-contabilistas"
            />
            {dados.podeCadastrar ? <FormContabilista /> : null}
          </section>

          <section aria-label="Empresa ou técnico responsável pela geração" className="space-y-3" data-papel="secao-geradoras">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">
                Empresa ou técnico responsável pela geração do arquivo
              </h2>
              <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
                Quem presta o serviço de informática que gera o arquivo, com o período da prestação.
              </p>
            </div>
            <ListaDeResponsaveis
              itens={dados.geradoras}
              vazio="Nenhuma empresa ou técnico registrado."
              rotuloDoDocumento="CNPJ ou CPF"
              papel="lista-geradoras"
            />
            {dados.podeCadastrar ? <FormEmpresaGeradora /> : null}
          </section>

          {dados.podeCadastrar ? null : (
            <p className="text-sm text-[color:var(--color-ink-2)]" data-papel="sem-permissao-de-cadastro">
              Seu perfil permite consultar estes registros. Para registrar responsáveis, solicite a
              permissão de cadastro da entidade contábil ao administrador do sistema.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ListaDeResponsaveis({
  itens,
  vazio,
  rotuloDoDocumento,
  papel,
}: {
  readonly itens: readonly ResponsavelNaTela[];
  readonly vazio: string;
  readonly rotuloDoDocumento: string;
  readonly papel: string;
}): React.ReactElement {
  if (itens.length === 0) {
    return <p className="text-sm text-[color:var(--color-ink-2)]" data-papel={`${papel}-vazia`}>{vazio}</p>;
  }
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-papel={papel}>
          <caption className="sr-only">Registros, do mais recente ao mais antigo</caption>
          <thead>
            <tr className="text-left text-xs text-[color:var(--color-ink-2)]">
              <th scope="col" className="py-1 pr-4">Nome</th>
              <th scope="col" className="py-1 pr-4">{rotuloDoDocumento}</th>
              <th scope="col" className="py-1 pr-4">Registro ou função</th>
              <th scope="col" className="py-1 pr-4">Período</th>
              <th scope="col" className="py-1">Registrado por</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((r) => (
              <tr key={r.id} className="border-t border-[color:var(--color-border)]">
                <td className="py-1 pr-4">{r.nome}</td>
                <td className="py-1 pr-4 tabular">{r.documento === null ? "" : formatarDocumento(r.documento)}</td>
                <td className="py-1 pr-4">{r.detalhe}</td>
                <td className="py-1 pr-4">
                  {diaBr(r.inicio)} a {r.fim === null ? "atual" : diaBr(r.fim)}{" "}
                  {r.fim === null ? <Badge status="ok">Vigente</Badge> : null}
                  {r.fimPelaSucessao ? (
                    <span className="block text-xs text-[color:var(--color-ink-3)]">encerrado pelo registro seguinte</span>
                  ) : null}
                </td>
                <td className="py-1 text-xs text-[color:var(--color-ink-2)]">{r.conferidoPor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
