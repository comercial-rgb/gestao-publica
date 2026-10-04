import type { PrismaClient } from "../../../../prisma/generated/client/client.js";
import { diaCivil } from "../../../../packages/datas/index.js";
import { ugDasUnidadesOrcamentarias, ugVigenteNoDia } from "../../../../modules/m01-core-contabil/unidade-gestora.js";
import { ordenadorNaData } from "../../../../modules/m05-despesa/ordenador.js";

/**
 * ═══ V34 — DE QUAL UG É CADA REGISTRO QUE A LINHA NÃO DIZ ═══
 *
 * Com duas ou mais UGs escrituradas aqui, a receita orçamentária, os extraorçamentários (e os estornos deles) e o
 * ordenador não podem sair carimbados com o código de quem pediu: cada registro leva a UG do FATO ORIGINAL, por um
 * vínculo comprovado e lido como era no dia do fato. Nenhuma UG sai do primeiro cadastro, do órgão, do nome ou do
 * titular ATUAL da conta.
 *
 *   · retenção (ingresso nascido num pagamento): a UG da unidade orçamentária do empenho que reteve, no dia do fato;
 *   · estorno extraorçamentário: a UG do movimento que ele desfaz (recursivo);
 *   · ingresso avulso e recolhimento: a entidade atribuída ao movimento (regularização), senão o titular declarado da
 *     conta NO INSTANTE em que o movimento foi gravado (`titularNoInstante`); a entidade → a UG dela vigente no dia;
 *   · guia de receita: a entidade carimbada na guia (`entidadeTitularId`, fato do instante), senão a atribuída a ela
 *     (M04); a anulação herda a da guia que desfaz;
 *   · designação de ordenador: a de unidade orçamentária vai à UG da unidade; a do ente vai a cada UG cujos empenhos do
 *     dia a CITARIAM — pela mesma regra do arquivo de empenhos (`ordenadorNaData`), e só a essas.
 *
 * O que não tem vínculo devolve o MOTIVO; quem gera o arquivo omite o registro e o nomeia (`omitir`), e o pacote sai de
 * conferência. A NUMERAÇÃO NÃO MUDA: os números dos extraorçamentários continuam os do exercício do ente inteiro
 * (`numeracaoNoExercicio`), contados antes de qualquer recorte — a chave do leiaute é (UG, número, exercício), e um
 * número único no ente já é único em cada UG. A UG vê buracos na própria sequência; nenhum número já remetido muda.
 */

export type UgOuMotivo = { readonly ug: string } | { readonly ug: null; readonly motivo: string };

export interface DocumentoOmitido {
  readonly arquivo: string;
  readonly documento: string;
  readonly motivo: string;
}

/**
 * ⚠️ O TITULAR DA CONTA NUM INSTANTE. A declaração é versionada e insert-only: a que vale para um fato é a última
 * gravada até o instante do fato. Uma troca de titular gravada DEPOIS não alcança o fato de antes — é isto que impede a
 * mudança posterior de titularidade de reescrever a exportação histórica. Antes da PRIMEIRA declaração vale a primeira:
 * a conta não teve outro titular declarado, e a declaração registra de quem ela é desde a abertura (é o caso do ente
 * que declara os titulares depois de começar a escriturar). Conta sem declaração nenhuma: nulo.
 */
export function titularNoInstante(
  declaracoes: readonly { readonly entidadeId: string; readonly versao: number; readonly criadoEm: Date }[],
  instante: Date
): string | null {
  if (declaracoes.length === 0) return null;
  const ordenadas = [...declaracoes].sort((a, b) => a.versao - b.versao);
  const ate = ordenadas.filter((d) => d.criadoEm.getTime() <= instante.getTime());
  return (ate[ate.length - 1] ?? ordenadas[0])!.entidadeId;
}

export interface ResolvedorDeUgs {
  ugDoMovimentoExtra(movimentoId: string): Promise<UgOuMotivo>;
  ugDaReceita(receitaId: string): Promise<UgOuMotivo>;
  /** As UGs a que a designação pertence no dia em que começa (vazio com motivo quando nenhuma). */
  ugsDaDesignacao(designacaoId: string): Promise<{ readonly ugs: readonly string[]; readonly motivo: string | null }>;
  omitir(o: DocumentoOmitido): void;
  omitidos(): readonly DocumentoOmitido[];
}

export function criarResolvedorDeUgs(prisma: PrismaClient): ResolvedorDeUgs {
  const porDia = new Map<string, Promise<ReadonlyMap<string, string>>>();
  const ugDaUoNoDia = async (codigoUo: string, dia: Date): Promise<string | null> => {
    const k = diaCivil(dia);
    let m = porDia.get(k);
    if (m === undefined) {
      m = ugDasUnidadesOrcamentarias(prisma, dia);
      porDia.set(k, m);
    }
    return (await m).get(codigoUo) ?? null;
  };
  let ugsCache: Promise<readonly { codigoTce: string; entidadeContabilId: string | null; vigenteDesde: Date; encerramento: { vigenteAte: Date } | null }[]> | null = null;
  const ugDaEntidadeNoDia = async (entidadeId: string, dia: Date): Promise<UgOuMotivo> => {
    ugsCache ??= prisma.unidadeGestora.findMany({ where: { entidadeContabilId: { not: null } }, select: { codigoTce: true, entidadeContabilId: true, vigenteDesde: true, encerramento: { select: { vigenteAte: true } } } });
    const daEntidade = (await ugsCache).filter((u) => u.entidadeContabilId === entidadeId && ugVigenteNoDia(u, dia));
    if (daEntidade.length === 1) return { ug: daEntidade[0]!.codigoTce };
    if (daEntidade.length === 0) return { ug: null, motivo: `a entidade titular não tem unidade gestora vigente em ${diaBr(dia)}` };
    return { ug: null, motivo: `a entidade titular tem ${String(daEntidade.length)} unidades gestoras vigentes em ${diaBr(dia)} (${daEntidade.map((u) => u.codigoTce).join(", ")}), e o fato não diz de qual delas é` };
  };

  const memoMov = new Map<string, Promise<UgOuMotivo>>();
  const ugDoMovimentoExtra = (id: string): Promise<UgOuMotivo> => {
    let p = memoMov.get(id);
    if (p === undefined) {
      p = (async (): Promise<UgOuMotivo> => {
        const m = await prisma.movimentoExtraorcamentario.findUnique({
          where: { id },
          select: {
            data: true,
            criadoEm: true,
            estornoDeId: true,
            pagamento: { select: { numero: true, liquidacao: { select: { empenho: { select: { numero: true, ficha: { select: { unidadeOrc: { select: { codigo: true } } } } } } } } } },
            atribuicaoDeEntidade: { select: { entidadeId: true } },
            contaBancaria: { select: { codigo: true, declaracoesDeTitular: { select: { entidadeId: true, versao: true, criadoEm: true } } } },
          },
        });
        if (m === null) return { ug: null, motivo: "o movimento não existe" };
        if (m.estornoDeId !== null) {
          const o = await ugDoMovimentoExtra(m.estornoDeId);
          return o.ug !== null ? o : { ug: null, motivo: `o movimento que ele estorna não tem unidade gestora: ${o.motivo}` };
        }
        if (m.pagamento !== null) {
          const empenho = m.pagamento.liquidacao.empenho;
          const uo = empenho.ficha.unidadeOrc.codigo;
          const ug = await ugDaUoNoDia(uo, m.data);
          return ug !== null ? { ug } : { ug: null, motivo: `a unidade orçamentária ${uo}, do empenho ${empenho.numero} que reteve, não tem unidade gestora declarada em ${diaBr(m.data)}` };
        }
        if (m.atribuicaoDeEntidade !== null) return ugDaEntidadeNoDia(m.atribuicaoDeEntidade.entidadeId, m.data);
        const titular = titularNoInstante(m.contaBancaria.declaracoesDeTitular, m.criadoEm);
        if (titular !== null) return ugDaEntidadeNoDia(titular, m.data);
        return { ug: null, motivo: `a conta ${m.contaBancaria.codigo} não tem titular declarado, e o movimento não foi atribuído a nenhuma entidade` };
      })();
      memoMov.set(id, p);
    }
    return p;
  };

  const memoRec = new Map<string, Promise<UgOuMotivo>>();
  const ugDaReceita = (id: string): Promise<UgOuMotivo> => {
    let p = memoRec.get(id);
    if (p === undefined) {
      p = (async (): Promise<UgOuMotivo> => {
        const r = await prisma.receitaArrecadada.findUnique({
          where: { id },
          select: { numeroReceita: true, dataArrecadacao: true, entidadeTitularId: true, estornoDeId: true, atribuicaoDeEntidade: { select: { entidadeId: true } } },
        });
        if (r === null) return { ug: null, motivo: "a guia não existe" };
        const entidade = r.entidadeTitularId ?? r.atribuicaoDeEntidade?.entidadeId ?? null;
        if (entidade !== null) return ugDaEntidadeNoDia(entidade, r.dataArrecadacao);
        if (r.estornoDeId !== null) {
          const o = await ugDaReceita(r.estornoDeId);
          return o.ug !== null ? o : { ug: null, motivo: `a guia que ela desfaz não tem unidade gestora: ${o.motivo}` };
        }
        return { ug: null, motivo: `a guia ${r.numeroReceita} não declara a entidade titular e não foi atribuída a nenhuma` };
      })();
      memoRec.set(id, p);
    }
    return p;
  };

  const ugsDaDesignacao = async (id: string): Promise<{ readonly ugs: readonly string[]; readonly motivo: string | null }> => {
    const g = await prisma.designacaoDeOrdenador.findUnique({ where: { id }, select: { cpf: true, escopo: true, vigenteDesde: true, unidadeOrc: { select: { codigo: true } } } });
    if (g === null) return { ugs: [], motivo: "a designação não existe" };
    if (g.escopo === "UNIDADE_ORCAMENTARIA") {
      const uo = g.unidadeOrc?.codigo;
      const ug = uo === undefined ? null : await ugDaUoNoDia(uo, g.vigenteDesde);
      return ug !== null ? { ugs: [ug], motivo: null } : { ugs: [], motivo: `a unidade orçamentária ${uo ?? "(sem código)"} da designação não tem unidade gestora declarada em ${diaBr(g.vigenteDesde)}` };
    }
    // Do ente: vai a cada UG em que alguma unidade orçamentária teria este ordenador nos empenhos do dia.
    const mapa = await ugDasUnidadesOrcamentarias(prisma, g.vigenteDesde);
    const uos = await prisma.unidadeOrcamentaria.findMany({ where: { codigo: { in: [...mapa.keys()] } }, select: { id: true, codigo: true } });
    const ugs = new Set<string>();
    for (const u of uos) {
      const o = await ordenadorNaData(prisma, { data: g.vigenteDesde, unidadeOrcId: u.id });
      if (o?.cpf === g.cpf) ugs.add(mapa.get(u.codigo)!);
    }
    return ugs.size > 0 ? { ugs: [...ugs].sort(), motivo: null } : { ugs: [], motivo: `nenhuma unidade orçamentária com unidade gestora declarada em ${diaBr(g.vigenteDesde)} tem este ordenador nos empenhos do dia` };
  };

  const lista: DocumentoOmitido[] = [];
  const vistos = new Set<string>();
  return {
    ugDoMovimentoExtra,
    ugDaReceita,
    ugsDaDesignacao,
    omitir(o) {
      const k = `${o.arquivo}|${o.documento}`;
      if (vistos.has(k)) return;
      vistos.add(k);
      lista.push(o);
    },
    omitidos: () => lista,
  };
}

const diaBr = (d: Date): string => diaCivil(d).split("-").reverse().join("/");
