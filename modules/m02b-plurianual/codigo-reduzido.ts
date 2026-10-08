import { z } from "zod";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "../m01-core-contabil/adapter-prisma.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * V36 (TR 5.9.1.8) — O CÓDIGO REDUZIDO DA DESPESA DO PPA. Ver `prisma/schema/m02b-codigo-reduzido.prisma`.
 *
 * ═══ O QUE É ═══
 * Um número sequencial no plano para cada combinação de unidade orçamentária (o órgão vem dela), função, subfunção,
 * programa e ação (a ação é única no programa, e o programa no plano: cada ação do PPA tem a sua combinação). A
 * combinação nova recebe o próximo número; o número atribuído não muda. Reordenar antes do início da execução (cláusula
 * irmã) não está construído: exigirá versionar a numeração (a tabela é só de acréscimo) e um marco de início da execução.
 *
 * ═══ AUTOMÁTICO ═══
 * `criarAcaoPpa` atribui na mesma transação em que cadastra a ação (todas as ações novas nascem classificadas). Para as
 * ações cadastradas antes, sem código, `gerarCodigosReduzidosDoPlano` atribui na ordem da classificação (órgão, unidade,
 * função, subfunção, programa, ação), e a ação sem unidade, função ou subfunção fica de fora, nomeada.
 *
 * ═══ A TRAVA ═══
 * A do plano (posto PlanoPlurianual): o próximo número é o maior do plano mais um, e duas atribuições simultâneas leriam o
 * mesmo maior. O índice único da combinação é a garantia dura contra o mesmo código duas vezes.
 */

export interface CombinacaoDaDespesa {
  readonly unidadeExecutoraId: string;
  readonly funcaoId: string;
  readonly subfuncaoId: string;
  readonly programaId: string;
  readonly acaoId: string;
}

/** Atribui (ou devolve) o código reduzido da combinação no plano. Chamado DENTRO da transação de quem cadastra. */
export async function atribuirCodigoReduzidoNaTransacao(
  tx: Tx,
  p: CombinacaoDaDespesa & { readonly planoId: string; readonly criadoPor: string }
): Promise<{ readonly numero: number; readonly novo: boolean }> {
  await travar(tx, "PlanoPlurianual", [p.planoId]);
  const existente = await tx.codigoReduzidoDaDespesaPpa.findUnique({
    where: {
      planoId_unidadeExecutoraId_funcaoId_subfuncaoId_programaId_acaoId: {
        planoId: p.planoId, unidadeExecutoraId: p.unidadeExecutoraId, funcaoId: p.funcaoId, subfuncaoId: p.subfuncaoId, programaId: p.programaId, acaoId: p.acaoId,
      },
    },
    select: { numero: true },
  });
  if (existente !== null) return { numero: existente.numero, novo: false };
  const ultimo = await tx.codigoReduzidoDaDespesaPpa.aggregate({ where: { planoId: p.planoId }, _max: { numero: true } });
  const numero = (ultimo._max.numero ?? 0) + 1;
  await tx.codigoReduzidoDaDespesaPpa.create({
    data: { planoId: p.planoId, numero, unidadeExecutoraId: p.unidadeExecutoraId, funcaoId: p.funcaoId, subfuncaoId: p.subfuncaoId, programaId: p.programaId, acaoId: p.acaoId, criadoPor: p.criadoPor },
  });
  return { numero, novo: true };
}

const zGerar = z.object({ planoId: z.string().min(1), criadoPor: z.string().min(1) });

/** As ações do plano sem código recebem o seu, na ordem da classificação; as sem classificação completa ficam nomeadas. */
export async function gerarCodigosReduzidosDoPlano(
  prisma: PrismaClient,
  input: z.input<typeof zGerar>
): Promise<{ readonly atribuidos: number; readonly jaTinham: number; readonly semClassificacao: readonly string[] }> {
  const d = zGerar.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.gerarCodigosReduzidosDoPlano, "ENTE");
    const plano = await tx.planoPlurianual.findUnique({ where: { id: d.planoId }, select: { id: true } });
    if (plano === null) throw new Error("Plano plurianual não encontrado. Nada foi gravado.");
    const acoes = await tx.acaoPpa.findMany({
      where: { programaPpa: { planoId: d.planoId } },
      select: {
        produto: true,
        acao: { select: { id: true, codigo: true } },
        programaPpa: { select: { programa: { select: { id: true, codigo: true } } } },
        unidadeExecutora: { select: { id: true, codigo: true, orgao: { select: { codigo: true } } } },
        funcao: { select: { id: true, codigo: true } },
        subfuncao: { select: { id: true, codigo: true } },
      },
    });
    const semClassificacao: string[] = [];
    const completas: { readonly chave: string; readonly c: CombinacaoDaDespesa }[] = [];
    for (const a of acoes) {
      if (a.unidadeExecutora === null || a.funcao === null || a.subfuncao === null) {
        const falta = [a.unidadeExecutora === null ? "unidade" : null, a.funcao === null ? "função" : null, a.subfuncao === null ? "subfunção" : null].filter((x) => x !== null).join(", ");
        semClassificacao.push(`ação ${a.acao.codigo} do programa ${a.programaPpa.programa.codigo} (${a.produto}): falta ${falta}`);
        continue;
      }
      completas.push({
        chave: [a.unidadeExecutora.orgao.codigo, a.unidadeExecutora.codigo, a.funcao.codigo, a.subfuncao.codigo, a.programaPpa.programa.codigo, a.acao.codigo].join("."),
        c: { unidadeExecutoraId: a.unidadeExecutora.id, funcaoId: a.funcao.id, subfuncaoId: a.subfuncao.id, programaId: a.programaPpa.programa.id, acaoId: a.acao.id },
      });
    }
    // Ordem da classificação com os trechos de algarismos comparados como números ("2" antes de "10", com ou sem zero à esquerda).
    completas.sort((x, y) => x.chave.localeCompare(y.chave, "pt-BR", { numeric: true }));
    let atribuidos = 0;
    let jaTinham = 0;
    const vistas = new Set<string>();
    for (const { chave, c } of completas) {
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      const r = await atribuirCodigoReduzidoNaTransacao(tx, { ...c, planoId: d.planoId, criadoPor: d.criadoPor });
      if (r.novo) atribuidos += 1;
      else jaTinham += 1;
    }
    return { atribuidos, jaTinham, semClassificacao };
  });
}

export interface CodigoReduzidoNaLista {
  readonly numero: number;
  /** órgão.unidade.função.subfunção.programa.ação */
  readonly classificacao: string;
  readonly unidade: string;
  readonly funcao: string;
  readonly subfuncao: string;
  readonly programa: string;
  readonly acao: string;
}

/** Os códigos reduzidos do plano, pelo número. Leitura pura. */
export async function listarCodigosReduzidos(prisma: PrismaClient, planoId: string): Promise<readonly CodigoReduzidoNaLista[]> {
  const cs = await prisma.codigoReduzidoDaDespesaPpa.findMany({
    where: { planoId },
    orderBy: { numero: "asc" },
    select: {
      numero: true,
      unidadeExecutora: { select: { codigo: true, descricao: true, orgao: { select: { codigo: true } } } },
      funcao: { select: { codigo: true, nome: true } },
      subfuncao: { select: { codigo: true, nome: true } },
      programa: { select: { codigo: true, descricao: true } },
      acao: { select: { codigo: true, descricao: true } },
    },
  });
  return cs.map((c) => ({
    numero: c.numero,
    classificacao: [c.unidadeExecutora.orgao.codigo, c.unidadeExecutora.codigo, c.funcao.codigo, c.subfuncao.codigo, c.programa.codigo, c.acao.codigo].join("."),
    unidade: `${c.unidadeExecutora.codigo} — ${c.unidadeExecutora.descricao}`,
    funcao: `${c.funcao.codigo} — ${c.funcao.nome}`,
    subfuncao: `${c.subfuncao.codigo} — ${c.subfuncao.nome}`,
    programa: `${c.programa.codigo} — ${c.programa.descricao}`,
    acao: `${c.acao.codigo} — ${c.acao.descricao}`,
  }));
}

const semAcento = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * A busca: só algarismos e sem zero à esquerda é o NÚMERO do código (exato: "12" traz o 12, não a função 12); qualquer
 * outra coisa ("0012", "12.361", "ensino") é termo, que tem de aparecer na classificação ou nos nomes (sem caixa nem
 * acento; vários termos restringem).
 */
export function codigosQueCasam(codigos: readonly CodigoReduzidoNaLista[], busca: string): readonly CodigoReduzidoNaLista[] {
  const b = busca.trim();
  if (b === "") return codigos;
  if (/^[1-9]\d*$/.test(b)) return codigos.filter((c) => String(c.numero) === b);
  const termos = semAcento(b).split(/\s+/).filter((t) => t !== "");
  return codigos.filter((c) => {
    const alvo = semAcento([c.classificacao, c.unidade, c.funcao, c.subfuncao, c.programa, c.acao].join(" "));
    return termos.every((t) => alvo.includes(t));
  });
}
