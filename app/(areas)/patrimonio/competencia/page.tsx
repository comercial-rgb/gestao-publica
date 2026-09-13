import Link from "next/link";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { CampoSelect, CampoTexto } from "../../../../components/ui/Campos";
import { CLASSE_BOTAO_PRIMARIO } from "../../../../components/ui/Formulario";
import type { ParametrosBrutos } from "../../../../lib/molde/consulta";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import {
  classesComParametro,
  competenciasProcessadas,
  previaDaCompetencia,
  PortaSemBancoError,
  type CompetenciaProcessada,
  type PreviaLida,
} from "../../../../lib/portas/recursos/competencia-dados";
import { ProcessarCompetencia } from "./ProcessarCompetencia";

/**
 * O PROCESSAMENTO POR COMPETÊNCIA (V3, pacote 2) — prévia com memória de cálculo, depois o
 * lançamento, depois o histórico do que já foi processado.
 *
 * ⚠️ A PRÉVIA É GET: classe e competência vêm da URL, e nada muda de estado. Processar é
 * POST, com chave de comando. O botão só aparece quando a prévia está PRONTA e o servidor
 * autoriza — o resto da tela é leitura.
 */
export const dynamic = "force-dynamic";

const primeiro = (v: string | readonly string[] | undefined): string =>
  (Array.isArray(v) ? (v[0] ?? "") : ((v as string | undefined) ?? "")).trim();

const ROTULO_DA_SITUACAO: Readonly<Record<PreviaLida["situacao"], string>> = {
  PRONTA: "Pronta para processar",
  SEM_PARAMETRO: "Classe sem parâmetro",
  PARAMETRO_INATIVO: "Atualização encerrada para a classe",
  JA_ATUALIZADA: "Competência já processada",
  TOTALMENTE_ATUALIZADA: "Classe totalmente atualizada",
};

function Linha({ rotulo, valor }: { readonly rotulo: string; readonly valor: string }): React.ReactElement {
  return (
    <div className="flex justify-between gap-4 border-b border-[color:var(--color-linha)] py-1 text-sm">
      <dt className="text-[color:var(--color-ink-2)]">{rotulo}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}

function Memoria({ previa }: { readonly previa: PreviaLida }): React.ReactElement {
  return (
    <section data-previa={previa.situacao} className="rounded border border-[color:var(--color-linha)] p-4">
      <h2 className="font-medium">
        Prévia de {previa.competencia} — {previa.classe.rotulo}
      </h2>
      <p className="mt-1 text-sm">
        <strong>{ROTULO_DA_SITUACAO[previa.situacao]}</strong>
        {previa.tipo !== null ? ` · ${previa.tipo}` : ""}
      </p>
      {previa.recusa !== null ? (
        <p role="alert" className="mt-2 whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">{previa.recusa}</p>
      ) : null}
      <dl className="mt-3">
        {previa.parametro !== null ? (
          <>
            <Linha rotulo="Parâmetro" valor={`${previa.parametro.versao} — ${previa.parametro.metodo}`} />
            <Linha rotulo="Vida útil" valor={`${previa.parametro.vidaUtilMeses} meses`} />
            <Linha rotulo="Valor residual" valor={previa.parametro.residual} />
          </>
        ) : null}
        <Linha rotulo="Base (valor bruto da classe)" valor={previa.base} />
        <Linha rotulo="Valor contábil atual" valor={previa.valorContabil} />
        {previa.situacao === "JA_ATUALIZADA" ? <Linha rotulo="Já aplicado nesta competência" valor={previa.jaAplicado} /> : null}
        {previa.calculo !== null ? (
          <>
            <Linha rotulo="Valor residual (base × residual)" valor={previa.calculo.valorResidual} />
            <Linha rotulo="Parcela cheia ((base − residual) ÷ vida útil)" valor={previa.calculo.parcelaCheia} />
            <Linha rotulo="Teto (contábil − residual)" valor={previa.calculo.teto} />
            <Linha rotulo="Parcela a lançar (mínimo entre parcela cheia e teto)" valor={previa.calculo.valorDaParcela} />
          </>
        ) : null}
      </dl>
    </section>
  );
}

const COLUNAS: readonly ColunaTabela<CompetenciaProcessada>[] = [
  { chave: "comp", cabecalho: "Competência", alinhamento: "esquerda", celula: (p) => p.competencia },
  { chave: "tipo", cabecalho: "Tipo", alinhamento: "esquerda", celula: (p) => p.tipo },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", celula: (p) => p.valor },
  {
    chave: "mem",
    cabecalho: "Memória de cálculo",
    alinhamento: "esquerda",
    celula: (p) =>
      p.memoria === null
        ? "sem memória (anterior ao registro da memória)"
        : `${p.memoria.versao} · ${p.memoria.metodo}, ${p.memoria.vidaUtilMeses} meses, residual ${p.memoria.residual} · base ${p.memoria.base}, contábil antes ${p.memoria.valorContabilAntes}, residual ${p.memoria.valorResidual}, parcela cheia ${p.memoria.parcelaCheia}, teto ${p.memoria.teto}`,
  },
  { chave: "quando", cabecalho: "Lançada em", alinhamento: "esquerda", celula: (p) => `${p.lancadaEm} por ${p.por}` },
  { chave: "sit", cabecalho: "Situação", alinhamento: "esquerda", celula: (p) => (p.estornada ? "estornada" : "vigente") },
  {
    chave: "est",
    cabecalho: "Estorno",
    alinhamento: "esquerda",
    celula: (p) =>
      p.estornada ? "—" : <Link className="underline underline-offset-2" href={`/patrimonio/estornos/valor/${p.movimentoId}`}>analisar</Link>,
  },
];

export default async function CompetenciaPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PATRIMONIO");
  const sp = await searchParams;
  const classeId = primeiro(sp["classe"]);
  const competencia = primeiro(sp["competencia"]);

  const cabecalho = (
    <PageHeader
      titulo="Processamento por competência"
      subtitulo="A depreciação, amortização ou exaustão do mês, por classe. Veja a memória de cálculo antes de lançar; o que já foi processado fica abaixo, com a memória de cada um."
    />
  );

  try {
    const [classes, permitidas] = await Promise.all([classesComParametro(), acoesPermitidas(["ATUALIZAR_COMPETENCIA_PATRIMONIAL"])]);
    const podeProcessar = [...permitidas].includes("ATUALIZAR_COMPETENCIA_PATRIMONIAL");
    let previa: PreviaLida | null = null;
    let erro: string | null = null;
    let processadas: readonly CompetenciaProcessada[] = [];
    if (classeId !== "") {
      processadas = await competenciasProcessadas(classeId);
      if (competencia !== "") {
        try {
          previa = await previaDaCompetencia(classeId, competencia);
          if (previa === null) erro = "Classe não encontrada.";
        } catch (e) {
          erro = e instanceof Error ? e.message : "Não foi possível calcular a prévia.";
        }
      }
    }

    return (
      <div className="space-y-6">
        {cabecalho}
        <form method="get" data-acao="prever-competencia" className="grid gap-3 rounded border border-[color:var(--color-linha)] p-4 md:grid-cols-4">
          {/* Os ids dos campos vêm do `useId` dentro de `CampoEnvolvido` — nunca literais. */}
          <CampoSelect
            name="classe"
            rotulo="Classe de bens (com parâmetro em vigor)"
            largura={2}
            required
            defaultValue={classeId}
            desabilitado={classes.length === 0}
            vazio={classes.length === 0 ? "nenhuma classe parametrizada" : "escolha a classe"}
            opcoes={classes.map((c) => ({ valor: c.id, rotulo: `${c.rotulo} — ${c.metodo}` }))}
          />
          <CampoTexto
            name="competencia"
            rotulo="Competência (AAAA-MM)"
            largura={1}
            required
            defaultValue={competencia}
            placeholder="2026-03"
            ajuda="Ano e mês da competência, no formato AAAA-MM."
          />
          <div className="flex items-end">
            <button type="submit" className={CLASSE_BOTAO_PRIMARIO}>Ver a prévia</button>
          </div>
        </form>
        {classes.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma classe com parâmetro em vigor"
            descricao="A atualização por competência precisa de método, vida útil e residual por classe. Defina-os em Parâmetros de Depreciação."
          />
        ) : null}
        {erro !== null ? <p role="alert" className="text-sm text-[color:var(--color-status-erro-fg)]">{erro}</p> : null}
        {previa !== null ? <Memoria previa={previa} /> : null}
        {previa !== null && previa.situacao === "PRONTA" && previa.calculo !== null ? (
          podeProcessar ? (
            <ProcessarCompetencia
              classeDeBensId={previa.classe.id}
              competencia={previa.competencia}
              resumo={`Lança ${previa.tipo ?? "a atualização"} de ${previa.calculo.valorDaParcela} para ${previa.competencia} na classe ${previa.classe.rotulo}, pelo roteiro contábil do tipo. A memória acima é gravada com o movimento.`}
            />
          ) : (
            <p className="text-sm text-[color:var(--color-ink-2)]">A prévia está pronta, mas o seu perfil não processa competências — o lançamento é de quem tem a ação de atualizar o patrimônio.</p>
          )
        ) : null}
        {classeId !== "" ? (
          processadas.length === 0 ? (
            <EstadoVazio titulo="Nenhuma competência processada nesta classe" descricao="A primeira aparece aqui, com a memória de cálculo, assim que for lançada." />
          ) : (
            <TabelaDeDados
              colunas={COLUNAS}
              linhas={processadas}
              keyDe={(p) => p.movimentoId}
              legenda={`${processadas.length} competência(s) processada(s) nesta classe`}
            />
          )
        ) : null}
        <p className="text-xs text-[color:var(--color-ink-2)]">
          Os parâmetros (método, vida útil, residual) e as versões deles estão em{" "}
          <Link className="underline underline-offset-2" href="/patrimonio/parametros-de-atualizacao">Parâmetros de Depreciação</Link>.
        </p>
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-4">
          {cabecalho}
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê os movimentos da classe e grava a atualização. Sem banco, não tem o que mostrar." />
        </div>
      );
    }
    throw e;
  }
}
