import { toMoney } from "../../packages/contracts/index.js";
import { cargoVigenteEm, lotacaoVigenteEm } from "../../modules/m32-pessoal/dominio.js";
import { bordasDaCompetencia } from "../../modules/m33-folha/dominio.js";
import {
  COLUNAS_DO_DEMONSTRATIVO,
  escolherPoliticaVigente,
  projetarLinhaPublica,
  TODAS_AS_COLUNAS,
  type ColunaDoDemonstrativo,
  type LinhaBrutaDePessoal,
  type PoliticaLida,
} from "../../modules/m13-transparencia/publicacao-de-pessoal.js";
// ⚠️ DO DOMÍNIO, NÃO DA PORTA. `lib/portas/recursos/resumo-da-folha.ts` também monta PDF, e
// importá-lo arrastaria o gerador inteiro para o projeto backend — foi exatamente o que
// aconteceu na primeira tentativa, com catorze erros de tipo em código pré-existente e correto.
import { agregarResumoDaFolha, type LinhaParaResumo } from "../../modules/m33-folha/resumo.js";
import { cliente, PortaSemBancoError } from "./cliente.js";

export { PortaSemBancoError };

/**
 * ═══ O DEMONSTRATIVO PÚBLICO DE PESSOAL (V11 V4.2) ═══
 *
 * ⚠️ DOIS NÍVEIS, E ELES TÊM REGRAS DIFERENTES PORQUE SÃO COISAS DIFERENTES.
 *
 *   · O AGREGADO (por lotação e regime) não contém dado pessoal nenhum: é quantos vínculos,
 *     quanto de bruto, de descontos e de líquido cada unidade custou. Ele publica SEMPRE, e é o
 *     que responde "quanto o município gasta com pessoal" sem expor ninguém.
 *
 *   · O INDIVIDUAL só existe com POLÍTICA APROVADA vigente na competência, e só com as colunas
 *     que ela declara. Sem política, zero linhas e o motivo dito — nunca "o básico".
 *
 * ⚠️ SÓ FOLHA FECHADA. Uma folha em cálculo muda a cada recálculo; publicá-la faria o portal
 * exibir números que mudam sozinhos, e um cidadão que baixasse hoje e amanhã teria duas verdades.
 *
 * ⚠️ NÃO É O CONTRACHEQUE PRIVADO COM COLUNAS A MENOS. `lib/portas/portal-do-servidor.ts` carrega
 * CPF, nascimento, nome social e a lista de dependentes com parentesco, plano de saúde e pensão —
 * é uma projeção para o TITULAR. Reaproveitá-la apagando campos é o antipadrão que
 * `bens-publicos.ts` nomeia: o campo novo entra em silêncio. Aqui a linha é MONTADA a partir das
 * colunas declaradas, por extratores próprios (`projetarLinhaPublica`).
 */

export interface GrupoPublicoDePessoal {
  readonly regime: string;
  readonly lotacao: string;
  readonly vinculos: number;
  readonly bruto: string;
  readonly descontos: string;
  readonly liquido: string;
}

export interface LinhaPublicaDePessoal {
  readonly celulas: readonly { readonly coluna: ColunaDoDemonstrativo; readonly rotulo: string; readonly valor: string }[];
}

export interface PoliticaNoDemonstrativo {
  readonly versao: number;
  readonly vigencia: string;
  readonly fundamentacaoLegal: string;
  readonly colunas: readonly { readonly coluna: ColunaDoDemonstrativo; readonly rotulo: string; readonly fundamento: string }[];
}

export interface DemonstrativoDePessoal {
  readonly competencia: string;
  readonly competenciasDisponiveis: readonly string[];
  /** `false` = não há folha FECHADA nesta competência. Nem o agregado sai. */
  readonly temFolhaFechada: boolean;
  readonly agregado: readonly GrupoPublicoDePessoal[];
  readonly total: GrupoPublicoDePessoal | null;
  /** `null` = sem política aprovada vigente. Zero linhas individuais, e `pendencia` diz por quê. */
  readonly politica: PoliticaNoDemonstrativo | null;
  readonly linhas: readonly LinhaPublicaDePessoal[];
  readonly cabecalho: readonly string[];
  /** A pendência nomeada, quando algo impede publicar. `null` quando não há. */
  readonly pendencia: string | null;
  readonly atualizadoEm: string;
}

const SEM_POLITICA =
  "O município ainda não declarou a política de publicação de pessoal. O demonstrativo por servidor depende de um ato do ente que diga, com fundamento, quais informações são publicáveis — e enquanto esse ato não existir, nada por servidor é publicado. Os totais por unidade abaixo não dependem dele: não contêm dado pessoal.";

const SEM_FOLHA_FECHADA =
  "Não há folha fechada nesta competência. O demonstrativo publica apenas folhas fechadas: uma folha ainda em cálculo muda a cada recálculo, e publicá-la faria o portal exibir números que mudam sozinhos.";

export async function demonstrativoDePessoal(competenciaPedida: string): Promise<DemonstrativoDePessoal> {
  const prisma = cliente();

  const fechadas = await prisma.folhaDePagamento.findMany({
    where: { fechamento: { isNot: null } },
    select: { competencia: true },
    distinct: ["competencia"],
    orderBy: { competencia: "desc" },
  });
  const disponiveis = fechadas.map((f) => f.competencia);
  const competencia = /^\d{4}-(0[1-9]|1[0-2])$/.test(competenciaPedida) ? competenciaPedida : (disponiveis[0] ?? "");
  const hoje = new Date().toISOString().slice(0, 10).split("-").reverse().join("/");

  const vazio = (pendencia: string): DemonstrativoDePessoal => ({
    competencia, competenciasDisponiveis: disponiveis, temFolhaFechada: false,
    agregado: [], total: null, politica: null, linhas: [], cabecalho: [], pendencia, atualizadoEm: hoje,
  });

  if (competencia === "") return vazio(SEM_FOLHA_FECHADA);

  const folhas = await prisma.folhaDePagamento.findMany({
    where: { competencia, fechamento: { isNot: null } },
    select: { fechamento: { select: { calculoId: true } } },
  });
  const calculos = folhas.map((f) => f.fechamento?.calculoId).filter((c): c is string => c !== undefined);
  if (calculos.length === 0) return vazio(SEM_FOLHA_FECHADA);

  const fim = bordasDaCompetencia(competencia).fim;
  const [contracheques, lotacoes, cargos, politicasBrutas] = await Promise.all([
    prisma.contracheque.findMany({
      where: { calculoId: { in: calculos } },
      select: {
        regime: true, totalProventos: true, totalDescontos: true, liquido: true,
        vinculo: {
          select: {
            matricula: true, tipo: true,
            servidor: { select: { pessoa: { select: { versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } },
            eventos: { select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true } },
          },
        },
      },
      orderBy: { vinculo: { matricula: "asc" } },
    }),
    prisma.lotacao.findMany({ select: { id: true, codigo: true, nome: true } }),
    prisma.cargo.findMany({ select: { id: true, codigo: true, denominacao: true } }),
    prisma.politicaDePublicacaoDePessoal.findMany({
      select: {
        id: true, versao: true, competenciaInicio: true, competenciaFim: true,
        fundamentacaoLegal: true, situacao: true, colunas: { select: { coluna: true } },
      },
    }),
  ]);

  const nomeDaLotacao = new Map(lotacoes.map((l) => [l.id, `${l.codigo} — ${l.nome}`]));
  const nomeDoCargo = new Map(cargos.map((c) => [c.id, `${c.codigo} — ${c.denominacao}`]));

  const eventosDe = (e: (typeof contracheques)[number]["vinculo"]["eventos"]): Parameters<typeof lotacaoVigenteEm>[0] =>
    e.map((x) => ({ ...x, tipo: x.tipo as never, salarioBase: x.salarioBase === null ? null : toMoney(x.salarioBase) }));

  // ═══ O AGREGADO — sem dado pessoal, publica sempre ═══
  // ⚠️ REUSA `agregarResumoDaFolha`, a MESMA função pura do resumo interno. Somar de novo aqui
  // faria o portal e a tela interna divergirem no dia em que uma das duas mudasse.
  const paraResumo: LinhaParaResumo[] = contracheques.map((c) => {
    const lot = lotacaoVigenteEm(eventosDe(c.vinculo.eventos), fim);
    return {
      regime: c.regime,
      lotacao: lot === null ? "sem lotação" : (nomeDaLotacao.get(lot) ?? lot),
      bruto: toMoney(c.totalProventos).toFixed(2),
      descontos: toMoney(c.totalDescontos).toFixed(2),
      liquido: toMoney(c.liquido).toFixed(2),
      patronal: null,
    };
  });
  const a = agregarResumoDaFolha(paraResumo);
  const semPatronal = (g: { readonly regime: string; readonly lotacao: string; readonly vinculos: number; readonly bruto: string; readonly descontos: string; readonly liquido: string }): GrupoPublicoDePessoal => ({
    regime: g.regime, lotacao: g.lotacao, vinculos: g.vinculos, bruto: g.bruto, descontos: g.descontos, liquido: g.liquido,
  });

  // ═══ O INDIVIDUAL — só com política aprovada vigente ═══
  const politicas: PoliticaLida[] = politicasBrutas.map((p) => ({
    id: p.id, versao: p.versao, competenciaInicio: p.competenciaInicio, competenciaFim: p.competenciaFim,
    fundamentacaoLegal: p.fundamentacaoLegal, situacao: p.situacao as PoliticaLida["situacao"],
    colunas: p.colunas.map((c) => c.coluna as ColunaDoDemonstrativo),
  }));
  const vigente = escolherPoliticaVigente(politicas, competencia);

  const base = {
    competencia,
    competenciasDisponiveis: disponiveis,
    temFolhaFechada: true,
    agregado: a.grupos.map(semPatronal),
    total: semPatronal(a.total),
    atualizadoEm: hoje,
  };

  if (vigente === null) {
    return { ...base, politica: null, linhas: [], cabecalho: [], pendencia: SEM_POLITICA };
  }

  const declaradas = TODAS_AS_COLUNAS.filter((c) => vigente.colunas.includes(c));
  const linhas: LinhaPublicaDePessoal[] = contracheques.map((c) => {
    const lot = lotacaoVigenteEm(eventosDe(c.vinculo.eventos), fim);
    const car = cargoVigenteEm(eventosDe(c.vinculo.eventos), fim);
    const bruta: LinhaBrutaDePessoal = {
      nome: c.vinculo.servidor.pessoa.versoes[0]?.nome ?? "não cadastrado",
      matricula: c.vinculo.matricula,
      cargo: car === null ? "sem cargo" : (nomeDoCargo.get(car) ?? car),
      lotacao: lot === null ? "sem lotação" : (nomeDaLotacao.get(lot) ?? lot),
      tipoDeVinculo: c.vinculo.tipo,
      regimePrevidenciario: c.regime,
      proventos: toMoney(c.totalProventos).toFixed(2),
      descontos: toMoney(c.totalDescontos).toFixed(2),
      liquido: toMoney(c.liquido).toFixed(2),
    };
    return { celulas: projetarLinhaPublica(bruta, declaradas) };
  });

  return {
    ...base,
    politica: {
      versao: vigente.versao,
      vigencia: vigente.competenciaFim === null ? `de ${vigente.competenciaInicio} (aberta)` : `de ${vigente.competenciaInicio} a ${vigente.competenciaFim}`,
      fundamentacaoLegal: vigente.fundamentacaoLegal,
      colunas: declaradas.map((c) => ({ coluna: c, rotulo: COLUNAS_DO_DEMONSTRATIVO[c].rotulo, fundamento: COLUNAS_DO_DEMONSTRATIVO[c].fundamento })),
    },
    linhas,
    cabecalho: declaradas.map((c) => COLUNAS_DO_DEMONSTRATIVO[c].rotulo),
    pendencia: null,
  };
}
