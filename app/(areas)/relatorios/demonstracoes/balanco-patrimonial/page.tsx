import { Badge } from "../../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  gerarBalancoPatrimonial,
  INDICADOR_SUPERAVIT,
  PortaSemBancoError,
  type BalancoPatrimonial,
  type ContaDoQuadroFP,
  type GrupoBalanco,
  type LinhaDoBalanco,
} from "../../../../../lib/portas/demonstrativos";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { fimDoDiaCivil } from "../../../../../packages/datas/index";
import { SeletorCorte } from "../SeletorCorte";
import { lerCorteStr } from "../exercicio";
import { ContasDaLinha, LinkDoBalancete } from "../ContasDaLinha";

import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
/** ANEXO 14 — Balanço Patrimonial (Lei 4.320, art. 105). Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

/**
 * Os rótulos dos grupos — o enum do domínio nunca chega cru à tela.
 *
 * ⚠️ `Record<GrupoBalanco, string>`, e não `Record<string, string>`: assim um grupo NOVO no
 * domínio vira erro de compilação aqui, em vez de cair num `?? g.grupo` que imprimiria
 * "Total do ativo_realizavel_a_longo_prazo" na legenda. Guarda que enumera formas acha só as
 * formas que enumerou; o tipo afirma a propriedade.
 */
const ROTULO_DO_GRUPO: Record<GrupoBalanco, string> = {
  ATIVO_CIRCULANTE: "Ativo circulante",
  ATIVO_NAO_CIRCULANTE: "Ativo não circulante",
  PASSIVO_CIRCULANTE: "Passivo circulante",
  PASSIVO_NAO_CIRCULANTE: "Passivo não circulante",
  PATRIMONIO_LIQUIDO: "Patrimônio líquido",
};

export default async function BalancoPatrimonialPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const corteStr = lerCorteStr(sp);

  const cabecalho = (
    <PageHeader
      titulo="Balanço Patrimonial"
      subtitulo="Ativo, passivo e patrimônio líquido na data, com o quadro financeiro e permanente (art. 105 da Lei 4.320)"
      acoes={
        <div className="flex flex-col items-end gap-1">
          <SeletorCorte corte={corteStr} />
          <LinkDoBalancete desde={`${corteStr.slice(0, 4)}-01-01`} ate={corteStr} />
        </div>
      }
    />
  );

  let dados: BalancoPatrimonial;
  try {
    // ⚠️ `fimDoDiaCivil`, NUNCA `inicioDoDiaCivil`. O motor corta por `dataTransacao <= corte`,
    // então o começo do dia EXCLUI o próprio dia do corte — e os lançamentos de apuração do
    // resultado e de encerramento dos controles nascem em 31/12 às 23:59:59 civis. Um balanço
    // de encerramento cortado às 00:00 sai SEM eles, e sai calado: cada lançamento excluído é
    // balanceado em si, então a equação fundamental continua fechando. Balanço errado com selo
    // de certo. O teste do módulo corta em `janelaCivilDoAno(ano).fim` pela mesma razão.
    dados = await gerarBalancoPatrimonial({ corte: fimDoDiaCivil(corteStr) });
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Serviço indisponível"
              : "Não foi possível emitir o Balanço Patrimonial"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  if (dados.grupos.length === 0) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo="Mapeamento do balanço não configurado"
          descricao="Nenhuma linha do balanço patrimonial está cadastrada. Cadastre as linhas e as contas que compõem cada uma antes de emitir o balanço."
        />
      </div>
    );
  }

  // ⚠️ A TELA NÃO CONFERE A EQUAÇÃO FUNDAMENTAL, E ISSO É DE PROPÓSITO. O motor LANÇA quando
  // ATIVO != PASSIVO + PL (amarração A1) — então um balanço que CHEGOU aqui é um balanço que
  // fechou, e a emissão é a própria prova. Somar os totais outra vez nesta página criaria a
  // segunda aritmética do razão: no dia em que o módulo mudar o tratamento do resultado, a tela
  // continuaria somando do jeito antigo e discordaria do relatório, com a mesma cara de certeza.
  const q = dados.quadroFinanceiroPermanente;

  return (
    <div className="space-y-4">
      {cabecalho}
      <div className="flex flex-wrap gap-2">
        <Badge status="neutro">
          Resultado do exercício: <ValorMonetario valor={dados.resultadoDoExercicio} />
        </Badge>
      </div>

      {dados.grupos.map((g) => (
        <TabelaDeDados
          key={g.grupo}
          colunas={colunasLinha(`${corteStr.slice(0, 4)}-01-01`, corteStr)}
          linhas={[...g.linhas, { codigoLinha: "TOTAL", rotulo: `Total do ${ROTULO_DO_GRUPO[g.grupo].toLowerCase()}`, valor: g.total, contas: [] }]}
          keyDe={(l) => `${g.grupo}-${l.codigoLinha}`}
          ehTotal={(l) => l.codigoLinha === "TOTAL"}
          legenda={`${ROTULO_DO_GRUPO[g.grupo]} — valores em R$`}
        />
      ))}

      <TabelaDeDados
        colunas={COLUNAS_RESUMO}
        linhas={[
          { rotulo: "Total do ativo", valor: dados.totalAtivo },
          { rotulo: "Total do passivo", valor: dados.totalPassivo },
          { rotulo: "Patrimônio líquido", valor: dados.totalPatrimonioLiquido },
        ]}
        keyDe={(l) => l.rotulo}
        legenda="Resumo — valores em R$"
      />

      <TabelaDeDados
        colunas={COLUNAS_RESUMO}
        linhas={[
          { rotulo: "Ativo financeiro", valor: q.ativoFinanceiro },
          { rotulo: "Ativo permanente", valor: q.ativoPermanente },
          { rotulo: "Passivo financeiro", valor: q.passivoFinanceiro },
          { rotulo: "Passivo permanente", valor: q.passivoPermanente },
          { rotulo: "Superávit (déficit) financeiro", valor: q.superavitFinanceiro },
        ]}
        keyDe={(l) => l.rotulo}
        ehTotal={(l) => l.rotulo.startsWith("Superávit")}
        legenda="Quadro financeiro e permanente (art. 105) — valores em R$ · déficit aparece negativo"
      />

      {q.composicao.length > 0 ? (
        <TabelaDeDados
          colunas={COLUNAS_COMPOSICAO}
          linhas={q.composicao}
          keyDe={(c) => c.codigo}
          legenda="Composição por conta do quadro financeiro e permanente — valores em R$"
        />
      ) : null}

      {/* ⚠️ O LADO POSITIVO TEM DE EXISTIR. Este bloco já mostrava o aviso quando o superávit por
          fonte NÃO era apurado — e não mostrava NADA quando ele era. O operador lia o aviso, ia
          amarrar a conta contábil das contas bancárias, voltava, e a única mudança era o aviso
          desaparecer: tinha feito o trabalho pedido e não recebia o número (o do art. 43, § 1º,
          III, com o qual se abre crédito adicional). O dado ficava apurado no servidor e
          invisível na tela. */}
      {dados.superavitPorFonte === null ? (
        <EstadoVazio
          titulo="Superávit financeiro por fonte não apurado"
          descricao="Informe a conta contábil de cada conta bancária em Financeiro / Contas bancárias para que o superávit possa ser apurado por fonte."
        />
      ) : (
        <TabelaDeDados
          colunas={COLUNAS_SUPERAVIT}
          linhas={[
            ...dados.superavitPorFonte.linhas,
            {
              fonte: "TOTAL",
              descricao: "Total",
              caixa: dados.superavitPorFonte.totalCaixa,
              obrigacoesAPagar: "",
              consignacoesARepassar: "",
              restosAPagar: "",
              superavit: dados.superavitPorFonte.totalSuperavit,
            },
          ]}
          keyDe={(l) => l.fonte}
          ehTotal={(l) => l.fonte === "TOTAL"}
          legenda="Superávit financeiro por fonte (art. 43, § 1º, III) — valores em R$ · fonte deficitária aparece negativa · a coluna restos a pagar é informativa e não é deduzida"
        />
      )}
    </div>
  );
}

/** V33 — a coluna das contas abre o razão de cada uma no período do balanço (do 1º de janeiro do ano do corte até o corte). */
const colunasLinha = (desde: string, ate: string): readonly ColunaTabela<LinhaDoBalanco>[] => [
  { chave: "codigoLinha", cabecalho: "Linha", celula: (l) => (l.codigoLinha === "TOTAL" ? "" : l.codigoLinha) },
  { chave: "rotulo", cabecalho: "Especificação", celula: (l) => l.rotulo },
  { chave: "contas", cabecalho: "Contas (saldo)", celula: (l) => <ContasDaLinha contas={l.contas} desde={desde} ate={ate} /> },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.valor} /> },
];

interface LinhaResumo {
  readonly rotulo: string;
  readonly valor: string;
}
const COLUNAS_RESUMO: readonly ColunaTabela<LinhaResumo>[] = [
  { chave: "rotulo", cabecalho: "Especificação", celula: (l) => l.rotulo },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.valor} /> },
];

/**
 * O quadro por fonte. A linha de TOTAL traz string vazia nas colunas que o motor não totaliza —
 * `SuperavitPorFonte` só publica `totalCaixa` e `totalSuperavit`. Somar as outras AQUI seria a
 * segunda aritmética do razão; célula em branco diz a verdade (o motor não totaliza esta coluna)
 * e 0,00 mentiria.
 */
interface LinhaSuperavitNaTela {
  readonly fonte: string;
  readonly descricao: string;
  readonly caixa: string;
  readonly obrigacoesAPagar: string;
  readonly consignacoesARepassar: string;
  readonly restosAPagar: string;
  readonly superavit: string;
}
const COLUNAS_SUPERAVIT: readonly ColunaTabela<LinhaSuperavitNaTela>[] = [
  { chave: "fonte", cabecalho: "Fonte", celula: (l) => (l.fonte === "TOTAL" ? "" : l.fonte) },
  { chave: "descricao", cabecalho: "Especificação", celula: (l) => l.descricao },
  { chave: "caixa", cabecalho: "Caixa", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.caixa} /> },
  { chave: "obrigacoesAPagar", cabecalho: "Obrigações a pagar", alinhamento: "direita", celula: (l) => (l.obrigacoesAPagar === "" ? "" : <ValorMonetario valor={l.obrigacoesAPagar} />) },
  { chave: "consignacoesARepassar", cabecalho: "Consignações a repassar", alinhamento: "direita", celula: (l) => (l.consignacoesARepassar === "" ? "" : <ValorMonetario valor={l.consignacoesARepassar} />) },
  { chave: "restosAPagar", cabecalho: "Restos a pagar", alinhamento: "direita", celula: (l) => (l.restosAPagar === "" ? "" : <ValorMonetario valor={l.restosAPagar} />) },
  { chave: "superavit", cabecalho: "Superávit (déficit)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.superavit} /> },
];

const COLUNAS_COMPOSICAO: readonly ColunaTabela<ContaDoQuadroFP>[] = [
  { chave: "codigo", cabecalho: "Conta", celula: (c) => c.codigo },
  { chave: "lado", cabecalho: "Lado", celula: (c) => (c.lado === "ATIVO" ? "Ativo" : "Passivo") },
  { chave: "indicador", cabecalho: "Natureza", celula: (c) => INDICADOR_SUPERAVIT[c.indicador].nome.toLowerCase() },
  { chave: "saldo", cabecalho: "Saldo", alinhamento: "direita", celula: (c) => <ValorMonetario valor={c.saldo} /> },
];
