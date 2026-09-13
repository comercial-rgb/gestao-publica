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
  conciliacao,
  previaDaCompetencia,
  PortaSemBancoError,
  type ConciliacaoLida,
  type ExecucaoProcessada,
  type ItemDaPreviaLido,
  type PreviaLida,
} from "../../../../lib/portas/recursos/competencia-dados";
import { ProcessarCompetencia } from "./ProcessarCompetencia";

/**
 * O PROCESSAMENTO POR COMPETÊNCIA (V3 pacote 2; V4 §4) — a prévia ITEM A ITEM com o corte e a
 * versão vigente na competência, depois o lançamento (uma execução com escopo declarado: a
 * classe ou um bem), depois o histórico das execuções e a conciliação item → classe → razão.
 *
 * ⚠️ A PRÉVIA É GET: classe, competência e (opcionalmente) o bem vêm da URL, e nada muda de
 * estado. Processar é POST, com chave de comando. O botão só aparece quando a prévia está PRONTA
 * e o servidor autoriza — o resto da tela é leitura.
 */
export const dynamic = "force-dynamic";

const primeiro = (v: string | readonly string[] | undefined): string =>
  (Array.isArray(v) ? (v[0] ?? "") : ((v as string | undefined) ?? "")).trim();

const ROTULO_DA_SITUACAO: Readonly<Record<PreviaLida["situacao"], string>> = {
  PRONTA: "Pronta para processar",
  SEM_PARAMETRO: "Classe sem parâmetro vigente nesta competência",
  PARAMETRO_INATIVO: "Atualização encerrada para a classe",
  JA_ATUALIZADA: "Competência já processada",
  TOTALMENTE_ATUALIZADA: "Totalmente atualizada",
  SEM_BASE: "Nenhum item elegível",
};

function Linha({ rotulo, valor }: { readonly rotulo: string; readonly valor: string }): React.ReactElement {
  return (
    <div className="flex justify-between gap-4 border-b border-[color:var(--color-linha)] py-1 text-sm">
      <dt className="text-[color:var(--color-ink-2)]">{rotulo}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}

const COLUNAS_DOS_ITENS: readonly ColunaTabela<ItemDaPreviaLido>[] = [
  { chave: "alvo", cabecalho: "Bem", alinhamento: "esquerda", celula: (i) => i.alvo },
  { chave: "entrada", cabecalho: "Entrada", alinhamento: "esquerda", celula: (i) => i.entradaEm },
  { chave: "base", cabecalho: "Base (bruto no corte)", alinhamento: "direita", celula: (i) => i.base },
  { chave: "contabil", cabecalho: "Contábil no corte", alinhamento: "direita", celula: (i) => i.valorContabil },
  { chave: "residual", cabecalho: "Residual", alinhamento: "direita", celula: (i) => i.valorResidual },
  { chave: "cheia", cabecalho: "Parcela cheia", alinhamento: "direita", celula: (i) => i.parcelaCheia },
  { chave: "teto", cabecalho: "Teto", alinhamento: "direita", celula: (i) => i.teto },
  { chave: "parcela", cabecalho: "Parcela a lançar", alinhamento: "direita", celula: (i) => i.valorDaParcela },
  { chave: "sit", cabecalho: "Situação", alinhamento: "esquerda", celula: (i) => (i.nota === "" ? i.situacaoRotulo : `${i.situacaoRotulo} — ${i.nota}`) },
];

function Memoria({ previa }: { readonly previa: PreviaLida }): React.ReactElement {
  return (
    <section data-previa={previa.situacao} data-escopo={previa.escopo === "BEM" ? "bem" : "classe"} className="rounded border border-[color:var(--color-linha)] p-4">
      <h2 className="font-medium">
        Prévia de {previa.competencia} — {previa.classe.rotulo}
        {previa.escopo === "BEM" ? " (um bem)" : ""}
      </h2>
      <p className="mt-1 text-sm">
        <strong>{ROTULO_DA_SITUACAO[previa.situacao]}</strong>
        {previa.tipo !== null ? ` · ${previa.tipo}` : ""}
        {` · escopo: ${previa.escopo === "BEM" ? "um bem" : "a classe (todos os itens prontos)"}`}
        {` · corte: ${previa.corte}`}
      </p>
      {previa.recusa !== null ? (
        <p role="alert" className="mt-2 whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">{previa.recusa}</p>
      ) : null}
      <dl className="mt-3">
        {previa.parametro !== null ? (
          <>
            <Linha rotulo="Parâmetro vigente na competência" valor={`${previa.parametro.versao} (${previa.parametro.vigenteDesde}) — ${previa.parametro.metodo}`} />
            <Linha rotulo="Vida útil" valor={`${previa.parametro.vidaUtilMeses} meses`} />
            <Linha rotulo="Valor residual" valor={previa.parametro.residual} />
          </>
        ) : null}
        <Linha rotulo="Valor contábil da classe no corte" valor={previa.valorContabil} />
        {previa.situacao === "JA_ATUALIZADA" ? <Linha rotulo="Já aplicado nesta competência" valor={previa.jaAplicado} /> : null}
        {previa.calculo !== null ? (
          <>
            <Linha rotulo={`Base dos itens prontos (${previa.prontos})`} valor={previa.base} />
            <Linha rotulo="Residual dos itens prontos" valor={previa.calculo.valorResidual} />
            <Linha rotulo="Parcela cheia (soma dos itens)" valor={previa.calculo.parcelaCheia} />
            <Linha rotulo="Teto (soma dos itens)" valor={previa.calculo.teto} />
            <Linha rotulo="Parcela a lançar (soma dos itens, um lançamento)" valor={previa.calculo.valorDaParcela} />
          </>
        ) : null}
      </dl>
      {previa.itens.length > 0 ? (
        <div className="mt-4">
          <TabelaDeDados colunas={COLUNAS_DOS_ITENS} linhas={previa.itens} keyDe={(i) => i.chave} legenda={`${previa.itens.length} item(ns): cada bem com movimento de valor e, se houver, o acervo sem individualização. Cada item é arredondado a duas casas; o total é a soma dos itens.`} />
        </div>
      ) : null}
    </section>
  );
}

const COLUNAS: readonly ColunaTabela<ExecucaoProcessada>[] = [
  { chave: "comp", cabecalho: "Competência", alinhamento: "esquerda", celula: (p) => p.competencia },
  { chave: "escopo", cabecalho: "Escopo", alinhamento: "esquerda", celula: (p) => p.escopo },
  { chave: "tipo", cabecalho: "Tipo", alinhamento: "esquerda", celula: (p) => p.tipo },
  { chave: "itens", cabecalho: "Itens", alinhamento: "direita", celula: (p) => String(p.itens) },
  { chave: "valor", cabecalho: "Valor lançado", alinhamento: "direita", celula: (p) => p.valor },
  {
    chave: "mem",
    cabecalho: "Memória de cálculo",
    alinhamento: "esquerda",
    celula: (p) =>
      p.detalhes.length === 0
        ? "sem memória (anterior ao registro da memória)"
        : `${p.versao} · ` + p.detalhes.map((d) => `${d.alvo}: base ${d.base}, contábil antes ${d.valorContabilAntes}, residual ${d.valorResidual}, parcela cheia ${d.parcelaCheia}, teto ${d.teto} → ${d.valor}`).join(" · "),
  },
  { chave: "quando", cabecalho: "Lançada em", alinhamento: "esquerda", celula: (p) => `${p.lancadaEm} por ${p.por}` },
  { chave: "sit", cabecalho: "Situação", alinhamento: "esquerda", celula: (p) => (p.estornada ? "estornada" : "vigente") },
  {
    chave: "est",
    cabecalho: "Estorno",
    alinhamento: "esquerda",
    celula: (p) =>
      p.movimentoId === null ? "—" : <Link className="underline underline-offset-2" href={`/patrimonio/estornos/valor/${p.movimentoId}`}>analisar</Link>,
  },
];

function Conciliacao({ c }: { readonly c: ConciliacaoLida }): React.ReactElement {
  return (
    <section data-conciliacao={c.diferenca === "0.00" ? "fecha" : "nao-fecha"} className="rounded border border-[color:var(--color-linha)] p-4">
      <h2 className="font-medium">Conciliação item → classe → razão</h2>
      <dl className="mt-2">
        <Linha rotulo={`Soma dos bens (${c.bens})`} valor={c.somaDosBens} />
        <Linha rotulo="Acervo sem individualização" valor={c.semIndividualizacao} />
        <Linha rotulo="Valor contábil da classe" valor={c.classe} />
        <Linha rotulo="Diferença" valor={c.diferenca} />
        <Linha rotulo="Depreciação lançada pela classe inteira antes do item por bem (reconciliação histórica a definir)" valor={c.acumuladaHistoricaSemBem} />
      </dl>
    </section>
  );
}

export default async function CompetenciaPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PATRIMONIO");
  const sp = await searchParams;
  const classeId = primeiro(sp["classe"]);
  const competencia = primeiro(sp["competencia"]);
  const bemId = primeiro(sp["bem"]);

  const cabecalho = (
    <PageHeader
      titulo="Processamento por competência"
      subtitulo="A depreciação, amortização ou exaustão do mês, por bem elegível, com a base cortada na competência e a versão do parâmetro vigente nela. Veja cada item antes de lançar; o que já foi executado fica abaixo, com a memória de cada item."
    />
  );

  try {
    const [classes, permitidas] = await Promise.all([classesComParametro(), acoesPermitidas(["ATUALIZAR_COMPETENCIA_PATRIMONIAL"])]);
    const podeProcessar = [...permitidas].includes("ATUALIZAR_COMPETENCIA_PATRIMONIAL");
    let previa: PreviaLida | null = null;
    let erro: string | null = null;
    let processadas: readonly ExecucaoProcessada[] = [];
    let conc: ConciliacaoLida | null = null;
    if (classeId !== "") {
      [processadas, conc] = await Promise.all([competenciasProcessadas(classeId), conciliacao(classeId)]);
      if (competencia !== "") {
        try {
          previa = await previaDaCompetencia(classeId, competencia, bemId === "" ? undefined : bemId);
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
            rotulo="Classe de bens (com parâmetro)"
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
          <CampoTexto
            name="bem"
            rotulo="Só um bem (opcional)"
            largura={1}
            defaultValue={bemId}
            ajuda="Em branco, a classe inteira: todos os bens elegíveis e o acervo sem individualização."
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
              bemId={previa.bemId}
              resumo={
                `Processa ${previa.escopo === "BEM" ? "UM BEM" : "A CLASSE"} ${previa.classe.rotulo} em ${previa.competencia}: ` +
                `${previa.prontos} item(ns) pronto(s), ${previa.tipo ?? "atualização"} de ${previa.calculo.valorDaParcela} num único lançamento, ` +
                `pelo roteiro contábil do tipo. Cada item grava a sua memória; a execução ganha identidade própria e é estornável inteira.`
              }
            />
          ) : (
            <p className="text-sm text-[color:var(--color-ink-2)]">A prévia está pronta, mas o seu perfil não processa competências — o lançamento é de quem tem a ação de atualizar o patrimônio.</p>
          )
        ) : null}
        {conc !== null ? <Conciliacao c={conc} /> : null}
        {classeId !== "" ? (
          processadas.length === 0 ? (
            <EstadoVazio titulo="Nenhuma competência processada nesta classe" descricao="A primeira aparece aqui, com a memória de cálculo de cada item, assim que for lançada." />
          ) : (
            <TabelaDeDados
              colunas={COLUNAS}
              linhas={processadas}
              keyDe={(p) => p.execucaoId}
              legenda={`${processadas.length} execução(ões) nesta classe`}
            />
          )
        ) : null}
        <p className="text-xs text-[color:var(--color-ink-2)]">
          Os parâmetros (método, vida útil, residual, vigência) e as versões deles estão em{" "}
          <Link className="underline underline-offset-2" href="/patrimonio/parametros-de-atualizacao">Parâmetros de Depreciação</Link>.
        </p>
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          {cabecalho}
          <EstadoVazio titulo="Banco de dados indisponível" descricao={e.message} />
        </div>
      );
    }
    throw e;
  }
}
