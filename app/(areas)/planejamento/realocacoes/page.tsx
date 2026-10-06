import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  recorteDePagina,
  type RecorteDaPagina,
} from "../../../../lib/portas/contexto";
import {
  lerAutorizacoesDaLoa,
  lerFichasParaRealocacao,
  lerRealocacoes,
  PortaSemBancoError,
  type AtoDeRealocacaoNaLista,
  type FichaParaRealocacao,
} from "../../../../lib/portas/realocacao";
import { dataBr } from "../../../../lib/recorte";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { EXTENSOES_ACEITAS, lerAnexosDasRealocacoes, TAMANHO_MAXIMO_BYTES, type AnexoNaLista } from "../../../../lib/portas/documentos";
import { ListaDeAnexos } from "../../../../components/ui/ListaDeAnexos";
import { FormAnexo } from "../../documentos/FormAnexo";
import { FormAnularRealocacao } from "./FormAnularRealocacao";
import { FormRealocacao } from "./FormRealocacao";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * REMANEJAMENTO, TRANSPOSIÇÃO E TRANSFERÊNCIA DE DOTAÇÃO (M03 V21).
 *
 * A dotação que uma lei específica move de uma programação para outra. A tela consome a PORTA; as
 * regras (fechar por fonte, saldo para ceder, lei prévia, exercício aberto, permissão) são do caso de
 * uso, no servidor. O efeito aparece no QDD (coluna "Realocações") e no razão.
 */
export const dynamic = "force-dynamic";

const ESPECIE_ROTULO: Record<string, string> = {
  REMANEJAMENTO: "Remanejamento",
  TRANSPOSICAO: "Transposição",
  TRANSFERENCIA: "Transferência",
};

function Pernas({ ato }: { readonly ato: AtoDeRealocacaoNaLista }): React.ReactElement {
  return (
    <ul className="space-y-0.5 text-xs">
      {ato.pernas.map((p) => (
        <li key={p.id} className="text-[color:var(--color-ink-2)]">
          <strong className={p.tipo === "REDUCAO" ? "text-[color:var(--color-status-erro-fg)]" : "text-[color:var(--color-status-ok-fg)]"}>
            {p.tipo === "REDUCAO" ? "cede" : "recebe"}
          </strong>{" "}
          <ValorMonetario valor={p.valor} /> · ficha {p.fichaNumero} · {p.unidadeCodigo} {p.unidadeNome} · programa{" "}
          {p.programaCodigo} · {p.naturezaCodigo} · fonte {p.fonteCodigo}
        </li>
      ))}
    </ul>
  );
}

const COLUNAS: readonly ColunaTabela<AtoDeRealocacaoNaLista>[] = [
  { chave: "ato", cabecalho: "Ato", alinhamento: "esquerda", largura: "9rem", celula: (a) => <strong>{a.numero}</strong> },
  { chave: "especie", cabecalho: "Espécie", alinhamento: "esquerda", largura: "8rem", celula: (a) => ESPECIE_ROTULO[a.especie] ?? "—" },
  { chave: "data", cabecalho: "Data", alinhamento: "esquerda", largura: "7rem", celula: (a) => dataBr(a.data) },
  { chave: "lei", cabecalho: "Lei", alinhamento: "esquerda", largura: "10rem", celula: (a) => `${a.leiNumero} (${dataBr(a.leiDataPublicacao)})` },
  { chave: "total", cabecalho: "Total movido", alinhamento: "direita", largura: "9rem", celula: (a) => <ValorMonetario valor={a.total} /> },
  {
    chave: "fichas",
    cabecalho: "Fichas",
    alinhamento: "esquerda",
    celula: (a) => (
      <div className="space-y-1">
        <Pernas ato={a} />
        <p className="text-xs text-[color:var(--color-ink-3)]">{a.justificativa}</p>
      </div>
    ),
  },
  {
    chave: "situacao",
    cabecalho: "Situação",
    alinhamento: "esquerda",
    largura: "12rem",
    celula: (a) =>
      a.anulacao === null ? (
        <Badge status="ok">Vigente</Badge>
      ) : (
        <div className="space-y-1">
          <Badge status="neutro">Desfeito em {dataBr(a.anulacao.data)}</Badge>
          <p className="text-xs text-[color:var(--color-ink-3)]">{a.anulacao.motivo}</p>
        </div>
      ),
  },
];

export default async function RealocacoesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  let recorte: RecorteDaPagina;
  let atos: readonly AtoDeRealocacaoNaLista[];
  let fichas: readonly FichaParaRealocacao[];
  let autorizacoes: readonly { readonly id: string; readonly rotulo: string }[];
  let anexos: ReadonlyMap<string, readonly AnexoNaLista[]>;
  let podeAnexar: boolean;
  try {
    recorte = await recorteDePagina(sp, "CONSULTAR_PLANEJAMENTO");
    [atos, fichas, autorizacoes] = await Promise.all([
      lerRealocacoes({ exercicio: recorte.exercicio }),
      lerFichasParaRealocacao({ exercicio: recorte.exercicio }),
      lerAutorizacoesDaLoa(),
    ]);
    // V27 — o PDF de cada decreto: vai ao Tribunal com os itens do dia (tipos 12 e 13 da atualização orçamentária).
    [anexos, podeAnexar] = await Promise.all([
      lerAnexosDasRealocacoes(atos.map((a) => a.id)),
      acoesPermitidas(["ANEXAR_ARQUIVO"]).then((x) => x.has("ANEXAR_ARQUIVO")),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Remanejamento, transposição e transferência" subtitulo="Dotação movida por lei específica" />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "O exercício pedido não é um ano"
                : erro instanceof PortaSemBancoError
                  ? "Banco de dados não configurado"
                  : "Não foi possível ler as realocações"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  const exercicio = recorte.exercicio;
  const vigentes = atos.filter((a) => a.anulacao === null);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Remanejamento, transposição e transferência"
        subtitulo={`Exercício ${String(exercicio)} — dotação movida de uma programação para outra por lei específica`}
      />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
        A Constituição proíbe remanejar, transpor ou transferir dotação <strong>sem lei anterior que autorize</strong>.
        Aqui se registra o ato com a lei e as fichas: as que <strong>cedem</strong> e as que <strong>recebem</strong>.
        Não é crédito adicional — nenhum recurso novo entra e o limite de créditos da lei orçamentária não é consumido.
        O total que sai é igual ao que entra, em cada fonte, e a ficha só cede o que ainda não foi empenhado nem
        reservado. A <strong>dotação atualizada</strong> das fichas muda na hora, no quadro de detalhamento da despesa.
      </div>

      <FormRealocacao exercicio={exercicio} fichas={fichas} autorizacoes={autorizacoes} />

      {atos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma realocação neste exercício"
          descricao={`Nenhum ato de remanejamento, transposição ou transferência registrado em ${String(exercicio)}.`}
        />
      ) : (
        <TabelaDeDados
          colunas={COLUNAS}
          linhas={atos}
          keyDe={(a) => a.id}
          legenda={`${String(atos.length)} ato(s) · ${String(vigentes.length)} vigente(s) · valores em R$`}
        />
      )}

      {atos.length > 0 ? (
        <section className="space-y-3" aria-label="Decretos publicados (PDF)">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Decretos publicados (PDF)</h2>
          {atos.map((a) => (
            <div key={a.id} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-pdf-da-realocacao={a.numero}>
              <p className="text-xs font-semibold text-[color:var(--color-ink-2)]">Decreto {a.numero} de {dataBr(a.data)}</p>
              {(anexos.get(a.id) ?? []).some((x) => x.mimeType === "application/pdf") ? null : (
                <p className="text-xs text-[color:var(--color-status-erro-fg)]">Sem o PDF: o decreto e os itens dele ficam fora da remessa ao Tribunal do dia em que foi publicado.</p>
              )}
              <ListaDeAnexos anexos={anexos.get(a.id) ?? []} />
              {podeAnexar ? <FormAnexo dono={{ atoDeRealocacaoId: a.id }} accept={EXTENSOES_ACEITAS} tamanhoMaximoBytes={TAMANHO_MAXIMO_BYTES} rotulo={`Anexar o PDF do decreto ${a.numero}`} /> : null}
            </div>
          ))}
        </section>
      ) : null}

      {atos.length > 0 ? (
        <FormAnularRealocacao
          atos={vigentes.map((a) => ({
            id: a.id,
            rotulo: `${a.numero} — ${ESPECIE_ROTULO[a.especie] ?? ""} de ${dataBr(a.data)}`,
          }))}
        />
      ) : null}
    </div>
  );
}
