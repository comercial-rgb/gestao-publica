import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO, type AcaoDoSistema } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { Decimal, toMoney, sumMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { roteiroLiquidacaoDaFolha } from "../m01-core-contabil/roteiros.js";
import { criarM05DepsComContratos } from "../m11-licitacoes/adapter-m05.js";
import { sha256Canonico } from "./dominio.js";
import { FolhaNaoFechadaError, parcelasDoCalculo } from "./apropriacao.js";

/**
 * ═══ M33 — A CERTIFICAÇÃO (ATESTO) DA FOLHA E A SUA LIQUIDAÇÃO (V6.1 §3) ═══
 *
 * A apropriação EMPENHA: ela diz que a competência fechada comprometeu crédito. Liquidar é ato
 * PRÓPRIO — o art. 63 da Lei 4.320 manda VERIFICAR o direito adquirido pelo credor "tendo por
 * base os títulos e documentos comprobatórios do respectivo crédito". Na compra, o título é a
 * nota fiscal conferida. Na folha NÃO HÁ nota fiscal, e fabricar uma para satisfazer o validador
 * seria mentir no documento: o título é a folha FECHADA mais a CERTIFICAÇÃO de quem o ente
 * designou para atestá-la.
 *
 * ⚠️ QUEM ATESTA É QUEM O ENTE DESIGNOU, e o sistema não sabe quem é. Nenhuma norma nacional
 * nomeia "o diretor de RH" como atestador da folha: isso é ato administrativo do município. Por
 * isso não há cargo embutido aqui — há uma DESIGNAÇÃO cadastrada, com o ato que a fundamenta e a
 * sua vigência, e o ato de certificar a exige VIGENTE NO DIA. Sem ela, RECUSA dizendo o que falta
 * ao administrador; consultar, calcular e fechar continuam livres.
 *
 * ⚠️ A SEGREGAÇÃO É O PADRÃO. Preparar (calcular e fechar), certificar, liquidar e pagar são
 * quatro atos. O serviço RECUSA quem certifica a própria folha e quem liquida o próprio atesto,
 * nomeando as duas pontas. Concentrar funções num ente pequeno é decisão dele, fundamentada e
 * registrada — pendência `CONCENTRACAO-DE-FUNCOES-NA-FOLHA`, nunca um atalho silencioso daqui.
 *
 * ⚠️ E A LIQUIDAÇÃO NÃO É ATÔMICA ENTRE EMPENHOS, pela mesma medida da apropriação: o
 * `deps.despesa.liquidar` abre a própria transação no adapter do M05. Cada empenho é um fato;
 * quem interrompe DIZ onde parou, e retomar continua — o `@@unique` de `LiquidacaoDaFolha` sobre
 * o empenho e o `@@unique([empenhoId, numero])` do M05 são a idempotência REAL, não a numeração.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR PURO — vigência derivada e a situação derivada da trilha
// ═══════════════════════════════════════════════════════════════════════════════

export interface DesignacaoParaVigencia {
  readonly vigenciaInicio: Date;
  readonly vigenciaFim: Date | null;
  readonly revogacao: { readonly dataEfeito: Date } | null;
}

/**
 * A DESIGNAÇÃO VALIA NAQUELE DIA? Derivação, nunca coluna `ativa` — revogar em maio não pode
 * fazer o atesto de março passar a não ter lastro.
 *
 * ⚠️ DIA CIVIL DO ENTE, comparado como texto `AAAA-MM-DD` (ordem lexicográfica = ordem
 * cronológica). Comparar instantes faria a designação que começa "hoje" recusar o atesto das
 * 21h de Campina Grande, que em UTC já é amanhã.
 */
export function designacaoVigenteEm(d: DesignacaoParaVigencia, quando: Date): boolean {
  const dia = diaCivil(quando);
  if (diaCivil(d.vigenciaInicio) > dia) return false;
  if (d.vigenciaFim !== null && diaCivil(d.vigenciaFim) < dia) return false;
  if (d.revogacao !== null && diaCivil(d.revogacao.dataEfeito) <= dia) return false;
  return true;
}

export type SituacaoDaCertificacao = "PENDENTE" | "CERTIFICADA" | "DEVOLVIDA" | "SUPERADA";

export interface FatoDaCertificacao {
  readonly tipo: "CERTIFICACAO" | "DEVOLUCAO";
  readonly calculoId: string;
  readonly criadoEm: Date;
}

/**
 * A SITUAÇÃO É O ÚLTIMO FATO DAQUELE CÁLCULO — derivada, nunca uma coluna `situacao`.
 *
 * `SUPERADA` é o caso em que existe certificação, mas de OUTRO cálculo: certificar prende-se ao
 * objeto conferido, e um cálculo novo é outro objeto. Hoje o fechamento é único por folha e esse
 * ramo não ocorre; ele existe escrito porque a retificação (pendência `RETIFICACAO-DA-FOLHA`) vai
 * produzi-lo, e descobrir isso depois significaria marcar o atesto antigo como se tivesse
 * certificado dados que ainda não existiam.
 */
export function situacaoDaCertificacao(
  fatos: readonly FatoDaCertificacao[],
  calculoFechadoId: string
): SituacaoDaCertificacao {
  const ordenados = [...fatos].sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
  const doCalculo = ordenados.filter((f) => f.calculoId === calculoFechadoId);
  const ultimo = doCalculo[doCalculo.length - 1];
  if (ultimo === undefined) {
    return ordenados.some((f) => f.tipo === "CERTIFICACAO") ? "SUPERADA" : "PENDENTE";
  }
  return ultimo.tipo === "CERTIFICACAO" ? "CERTIFICADA" : "DEVOLVIDA";
}

/** O número da liquidação da folha — o MESMO do empenho que ela liquida (o `@@unique` é por empenho). */
export function numeroDaLiquidacaoDaFolha(numeroDoEmpenho: string): string {
  return numeroDoEmpenho;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AS RECUSAS, COM NOME
// ═══════════════════════════════════════════════════════════════════════════════

export class SemDesignacaoVigenteError extends Error {
  constructor(usuario: string, quando: Date) {
    super(
      `SEM-DESIGNACAO-VIGENTE: ${usuario} não tem designação para CERTIFICAR A FOLHA vigente em ${diaCivilBr(quando)}. ` +
        `Quem atesta a folha é quem o ente designou por ato administrativo — o sistema não escolhe um cargo por conta própria. ` +
        `Peça ao administrador o cadastro da designação (com a portaria ou o decreto que a fundamenta) antes do atesto. ` +
        `Consultar, calcular e fechar a folha continuam liberados. Nada foi gravado.`
    );
    this.name = "SemDesignacaoVigenteError";
  }
}

export class UsuarioNaoEAPessoaError extends Error {
  constructor(usuario: string, pessoa: string) {
    super(
      `USUARIO-NAO-E-A-PESSOA: o usuário ${usuario} não tem vínculo vigente com a pessoa ${pessoa} no cadastro. ` +
        `Designar assim deixaria o atesto assinado por um nome e praticado por outro. Vincule o usuário à pessoa ` +
        `(o vínculo é explícito e auditável) antes de designar. Nada foi gravado.`
    );
    this.name = "UsuarioNaoEAPessoaError";
  }
}

export class AutocertificacaoError extends Error {
  constructor(quem: string, oQueFez: string) {
    super(
      `AUTOCERTIFICACAO-DA-FOLHA: ${quem} ${oQueFez} e não pode certificá-la. Preparar e certificar são atos de sujeitos ` +
        `diferentes — é o que torna o atesto uma conferência, e não uma assinatura no próprio trabalho. ` +
        `Uma concentração autorizada de funções é decisão fundamentada do ente, registrada, não um atalho do sistema. Nada foi gravado.`
    );
    this.name = "AutocertificacaoError";
  }
}

export class AutoliquidacaoError extends Error {
  constructor(quem: string) {
    super(
      `AUTOLIQUIDACAO-DA-FOLHA: ${quem} certificou esta folha e não pode liquidá-la. Certificar é atestar que o valor é devido; ` +
        `liquidar é reconhecer a obrigação com base nesse atesto. Praticados pela mesma pessoa, o segundo ato não confere nada. Nada foi gravado.`
    );
    this.name = "AutoliquidacaoError";
  }
}

export class FolhaNaoCertificadaError extends Error {
  constructor(competencia: string, situacao: SituacaoDaCertificacao, motivo: string | null) {
    const explicacao =
      situacao === "DEVOLVIDA"
        ? `ela foi DEVOLVIDA para correção${motivo === null ? "" : `: "${motivo}"`}`
        : situacao === "SUPERADA"
          ? "a certificação que existe é de outro cálculo, e não alcança este"
          : "ela ainda não foi certificada";
    super(
      `FOLHA-NAO-CERTIFICADA: a folha de ${competencia} não pode ser liquidada porque ${explicacao}. ` +
        `A liquidação da folha se apoia no atesto de quem o ente designou — sem ele não há título comprobatório do crédito. Nada foi gravado.`
    );
    this.name = "FolhaNaoCertificadaError";
  }
}

export class FolhaNaoApropriadaError extends Error {
  constructor(competencia: string) {
    super(
      `FOLHA-NAO-APROPRIADA: a folha de ${competencia} não tem empenho nenhum. Liquidar antes de empenhar reconheceria uma ` +
        `obrigação sem crédito que a suporte. Aproprie a folha primeiro. Nada foi gravado.`
    );
    this.name = "FolhaNaoApropriadaError";
  }
}

export class GrupoSemContasDaLiquidacaoError extends Error {
  constructor(grupos: readonly string[]) {
    super(
      `GRUPO-SEM-CONTAS-DA-LIQUIDACAO: ${grupos.join(", ")} — ${grupos.length === 1 ? "este grupo de empenho não declara" : "estes grupos de empenho não declaram"} ` +
        `as duas contas patrimoniais da liquidação (a VPD que ela debita e a obrigação de pessoal que ela credita). ` +
        `O rol de contrapartida do plano de contas cobre material, serviço e amortização — não a folha —, e a VPD de serviços de ` +
        `terceiros lançaria a remuneração dos servidores como serviço contratado, fechando o lançamento sem que ninguém visse. ` +
        `Quais contas usar é decisão do contador do ente: cadastre-as no grupo. Nada foi gravado.`
    );
    this.name = "GrupoSemContasDaLiquidacaoError";
  }
}

export class LiquidacaoInterrompidaError extends Error {
  constructor(
    readonly feitos: number,
    readonly ondeParou: string,
    readonly motivo: string
  ) {
    super(
      `LIQUIDACAO-DA-FOLHA-INTERROMPIDA: ${feitos} liquidação(ões) já gravada(s), e o ato parou em ${ondeParou}. Motivo: ${motivo} ` +
        `As liquidações gravadas CONTINUAM válidas (cada uma é um fato); resolva a causa e liquidar de novo continua de onde parou — ` +
        `a folha NÃO está liquidada por inteiro, e a tela diz quantos empenhos faltam.`
    );
    this.name = "LiquidacaoInterrompidaError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// A DESIGNAÇÃO — quem o ente pôs para atestar
// ═══════════════════════════════════════════════════════════════════════════════

export const zDesignarNaFolhaInput = z.object({
  atribuicao: z.enum(["CERTIFICAR_FOLHA"]),
  pessoaId: z.string().min(1),
  usuarioIdentificador: z.string().trim().min(1),
  atoDesignacao: z.string().trim().min(3, "o ato que designou (portaria, decreto) é o fundamento do atesto"),
  vigenciaInicio: z.coerce.date(),
  vigenciaFim: z.coerce.date().optional(),
  /** A designação de quem esta substitui, quando for o caso. */
  substitutoDeId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type DesignarNaFolhaInput = z.input<typeof zDesignarNaFolhaInput>;

export async function designarNaFolha(prisma: PrismaClient, input: DesignarNaFolhaInput): Promise<{ readonly designacaoId: string }> {
  const d = zDesignarNaFolhaInput.parse(input);
  if (d.vigenciaFim !== undefined && diaCivil(d.vigenciaFim) < diaCivil(d.vigenciaInicio)) {
    throw new Error(
      `VIGENCIA-INVERTIDA: o fim (${diaCivilBr(d.vigenciaFim)}) é anterior ao início (${diaCivilBr(d.vigenciaInicio)}). ` +
        `Uma designação assim nunca vigoraria, e recusaria tudo por acidente em vez de recusar por regra. Nada foi gravado.`
    );
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.designarNaFolha, "ENTE");

    const pessoa = await tx.pessoa.findUnique({
      where: { id: d.pessoaId },
      select: { id: true, documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } },
    });
    if (pessoa === null) throw new Error(`Pessoa ${d.pessoaId} não existe no cadastro. Nada foi gravado.`);

    const usuario = await tx.usuario.findUnique({
      where: { identificador: d.usuarioIdentificador },
      select: {
        id: true, ativo: true, nome: true,
        vinculosDePessoa: { orderBy: { criadoEm: "desc" }, take: 1, select: { pessoaId: true, tipo: true } },
      },
    });
    if (usuario === null) throw new Error(`Usuário ${d.usuarioIdentificador} não existe. Nada foi gravado.`);
    // ⚠️ USUÁRIO DESATIVADO NÃO RECEBE DESIGNAÇÃO: ele não consegue praticar o ato, e uma
    // designação que nunca vigora na prática é pior que ausência — parece cobertura.
    if (!usuario.ativo) {
      throw new Error(`USUARIO-DESATIVADO: ${d.usuarioIdentificador} está desativado e não pratica ato nenhum. Designá-lo criaria uma cobertura aparente. Nada foi gravado.`);
    }
    // ⚠️ O VÍNCULO USUÁRIO↔PESSOA É EXPLÍCITO, e é o `VinculoUsuarioPessoa` do M16 que o guarda.
    // O vigente é a ÚLTIMA linha do usuário, se for VINCULO — a mesma leitura de "meus bens".
    const vinculo = usuario.vinculosDePessoa[0];
    const nomeDaPessoa = pessoa.versoes[0]?.nome ?? pessoa.documento;
    if (vinculo === undefined || vinculo.tipo !== "VINCULO" || vinculo.pessoaId !== d.pessoaId) {
      throw new UsuarioNaoEAPessoaError(d.usuarioIdentificador, nomeDaPessoa);
    }

    if (d.substitutoDeId !== undefined) {
      const titular = await tx.designacaoNaFolha.findUnique({ where: { id: d.substitutoDeId }, select: { id: true, atribuicao: true } });
      if (titular === null) throw new Error(`Designação titular ${d.substitutoDeId} não existe. Nada foi gravado.`);
      if (titular.atribuicao !== d.atribuicao) {
        throw new Error(`SUBSTITUICAO-DE-OUTRA-ATRIBUICAO: a designação titular é de ${titular.atribuicao} e esta seria de ${d.atribuicao}. Nada foi gravado.`);
      }
    }

    const r = await tx.designacaoNaFolha.create({
      data: {
        atribuicao: d.atribuicao,
        pessoaId: d.pessoaId,
        usuarioId: usuario.id,
        atoDesignacao: d.atoDesignacao,
        vigenciaInicio: d.vigenciaInicio,
        vigenciaFim: d.vigenciaFim ?? null,
        substitutoDeId: d.substitutoDeId ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { designacaoId: r.id };
  });
}

export const zRevogarDesignacaoInput = z.object({
  designacaoId: z.string().min(1),
  dataEfeito: z.coerce.date(),
  motivo: z.string().trim().min(3),
  criadoPor: z.string().min(1),
});
export type RevogarDesignacaoInput = z.input<typeof zRevogarDesignacaoInput>;

export async function revogarDesignacaoNaFolha(prisma: PrismaClient, input: RevogarDesignacaoInput): Promise<{ readonly revogacaoId: string }> {
  const d = zRevogarDesignacaoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.revogarDesignacaoNaFolha, "ENTE");
    const des = await tx.designacaoNaFolha.findUnique({
      where: { id: d.designacaoId },
      select: { id: true, vigenciaInicio: true, revogacao: { select: { id: true, dataEfeito: true } } },
    });
    if (des === null) throw new Error(`Designação ${d.designacaoId} não existe. Nada foi gravado.`);
    if (des.revogacao !== null) {
      throw new Error(`DESIGNACAO-JA-REVOGADA: esta designação já foi revogada com efeito em ${diaCivilBr(des.revogacao.dataEfeito)}. Nada foi gravado.`);
    }
    if (diaCivil(d.dataEfeito) < diaCivil(des.vigenciaInicio)) {
      throw new Error(
        `REVOGACAO-ANTES-DO-INICIO: o efeito (${diaCivilBr(d.dataEfeito)}) é anterior ao início da designação (${diaCivilBr(des.vigenciaInicio)}). ` +
          `Revogar para antes do começo apagaria a designação em vez de encerrá-la, e os atestos praticados sob ela ficariam sem lastro. Nada foi gravado.`
      );
    }
    const r = await tx.revogacaoDeDesignacao.create({
      data: { designacaoId: des.id, dataEfeito: d.dataEfeito, motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { revogacaoId: r.id };
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// O ATESTO — certificar e devolver
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * O MANIFESTO: o objeto conferido, em forma canônica. O `sha256` é DELE, e só dele.
 *
 * ⚠️ O AUTOR, A DESIGNAÇÃO E O INSTANTE FICAM DE FORA DO HASH, de propósito: assim duas
 * certificações do MESMO conjunto têm a mesma impressão digital, e qualquer mudança de valor,
 * de pessoa ou de alocação a muda. Um hash que incluísse o relógio mudaria sempre, e não
 * provaria nada sobre o objeto — que é justamente o que o atesto precisa prender.
 *
 * ⚠️ SEM CPF, SEM CONTA BANCÁRIA, SEM DEPENDENTE. O que o atestador confere é matrícula, valores
 * e onde a despesa cai. Copiar o DTO de RH para cá plantaria dado pessoal num documento que
 * circula entre contabilidade e controle interno.
 */
export interface ManifestoDaCertificacao {
  readonly ente: { readonly nome: string; readonly cnpj: string | null; readonly codigoIbge: string };
  readonly folha: { readonly competencia: string; readonly tipo: string };
  readonly calculo: { readonly numero: number; readonly sha256: string; readonly versaoDoMotor: string; readonly contracheques: number };
  readonly totais: { readonly proventos: string; readonly descontos: string; readonly liquido: string };
  readonly vinculos: readonly { readonly matricula: string; readonly proventos: string; readonly descontos: string; readonly liquido: string; readonly sha256: string }[];
  readonly alocacoes: readonly { readonly grupo: string; readonly descricao: string; readonly ficha: number; readonly empenhos: number; readonly valor: string }[];
}

export interface ObjetoParaCertificar {
  readonly folhaId: string;
  readonly competencia: string;
  readonly calculoId: string;
  readonly fechadoPor: string;
  readonly calculadoPor: string;
  readonly manifesto: ManifestoDaCertificacao;
  readonly sha256: string;
}

/**
 * MONTA O QUE SE VAI CERTIFICAR. Leitura pura de banco: nenhuma escrita, nenhuma autorização —
 * quem autoriza é quem chama. A tela usa a MESMA função para MOSTRAR o que será atestado, e é
 * isso que impede o atesto de dizer uma coisa e a apropriação empenhar outra.
 */
export async function objetoParaCertificar(prisma: PrismaClient, folhaId: string): Promise<ObjetoParaCertificar> {
  const folha = await prisma.folhaDePagamento.findUnique({
    where: { id: folhaId },
    select: {
      id: true, competencia: true, tipo: true,
      fechamento: { select: { calculoId: true, criadoPor: true } },
    },
  });
  if (folha === null) throw new Error(`Folha ${folhaId} não existe.`);
  if (folha.fechamento === null) throw new FolhaNaoFechadaError(folha.competencia);

  const calculo = await prisma.calculoDaFolha.findUnique({
    where: { id: folha.fechamento.calculoId },
    select: {
      id: true, numero: true, sha256: true, versaoDoMotor: true, contracheques: true, criadoPor: true,
      totalProventos: true, totalDescontos: true, totalLiquido: true,
    },
  });
  if (calculo === null) throw new Error(`Cálculo ${folha.fechamento.calculoId} não existe.`);

  const ente = await prisma.enteConfig.findFirst({ select: { nome: true, cnpj: true, codigoIbge: true } });
  if (ente === null) {
    throw new Error(
      `ENTE-NAO-CONFIGURADO: o atesto precisa dizer de qual entidade é a folha, e o cadastro do ente está vazio. ` +
        `Um manifesto sem entidade não prende nada. Configure o ente antes de certificar. Nada foi gravado.`
    );
  }

  const contracheques = await prisma.contracheque.findMany({
    where: { calculoId: calculo.id },
    orderBy: { vinculo: { matricula: "asc" } },
    select: { sha256: true, totalProventos: true, totalDescontos: true, liquido: true, vinculo: { select: { matricula: true } } },
  });

  const agrupamento = await parcelasDoCalculo(prisma, calculo.id);
  const porGrupo = new Map<string, { grupo: string; descricao: string; ficha: number; empenhos: number; valor: Money }>();
  for (const p of agrupamento.parcelas) {
    const acc = porGrupo.get(p.grupo.codigo) ?? { grupo: p.grupo.codigo, descricao: p.grupo.descricao, ficha: p.grupo.ficha.numero, empenhos: 0, valor: toMoney(0) };
    acc.empenhos += 1;
    acc.valor = toMoney(acc.valor.plus(p.valor));
    porGrupo.set(p.grupo.codigo, acc);
  }

  const manifesto: ManifestoDaCertificacao = {
    ente: { nome: ente.nome, cnpj: ente.cnpj, codigoIbge: ente.codigoIbge },
    folha: { competencia: folha.competencia, tipo: folha.tipo },
    calculo: { numero: calculo.numero, sha256: calculo.sha256, versaoDoMotor: calculo.versaoDoMotor, contracheques: calculo.contracheques },
    totais: {
      proventos: toMoney(calculo.totalProventos).toFixed(2),
      descontos: toMoney(calculo.totalDescontos).toFixed(2),
      liquido: toMoney(calculo.totalLiquido).toFixed(2),
    },
    vinculos: contracheques.map((c) => ({
      matricula: c.vinculo.matricula,
      proventos: toMoney(c.totalProventos).toFixed(2),
      descontos: toMoney(c.totalDescontos).toFixed(2),
      liquido: toMoney(c.liquido).toFixed(2),
      sha256: c.sha256,
    })),
    alocacoes: [...porGrupo.values()].map((g) => ({ grupo: g.grupo, descricao: g.descricao, ficha: g.ficha, empenhos: g.empenhos, valor: g.valor.toFixed(2) })),
  };

  return {
    folhaId: folha.id,
    competencia: folha.competencia,
    calculoId: calculo.id,
    fechadoPor: folha.fechamento.criadoPor,
    calculadoPor: calculo.criadoPor,
    manifesto,
    sha256: sha256Canonico(manifesto),
  };
}

export const zCertificarFolhaInput = z.object({
  folhaId: z.string().min(1),
  /** O dia do ato — é nele que a designação tem de estar vigente. */
  data: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type CertificarFolhaInput = z.input<typeof zCertificarFolhaInput>;

export const zDevolverFolhaInput = zCertificarFolhaInput.extend({
  motivo: z.string().trim().min(3, "devolver sem dizer o quê é devolver nada"),
});
export type DevolverFolhaInput = z.input<typeof zDevolverFolhaInput>;

/** A designação vigente do usuário para a atribuição, no dia — ou `null`. */
async function designacaoVigenteDe(
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">,
  usuarioIdentificador: string,
  quando: Date
): Promise<{ readonly id: string; readonly atoDesignacao: string; readonly nomeDaPessoa: string } | null> {
  const candidatas = await tx.designacaoNaFolha.findMany({
    where: { atribuicao: "CERTIFICAR_FOLHA", usuario: { identificador: usuarioIdentificador, ativo: true } },
    orderBy: { vigenciaInicio: "desc" },
    select: {
      id: true, atoDesignacao: true, vigenciaInicio: true, vigenciaFim: true,
      revogacao: { select: { dataEfeito: true } },
      pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } },
    },
  });
  // ⚠️ A MAIS RECENTE ENTRE AS VIGENTES, e não "a única". Renovar uma designação antes de a
  // anterior terminar é o caso normal, e recusar por ambiguidade travaria o ente numa data de
  // borda. Qual foi usada FICA GRAVADA na certificação — não se decide de novo depois.
  for (const c of candidatas) {
    if (designacaoVigenteEm({ vigenciaInicio: c.vigenciaInicio, vigenciaFim: c.vigenciaFim, revogacao: c.revogacao }, quando)) {
      return { id: c.id, atoDesignacao: c.atoDesignacao, nomeDaPessoa: c.pessoa.versoes[0]?.nome ?? c.pessoa.documento };
    }
  }
  return null;
}

/**
 * ⚠️ A AÇÃO É PARÂMETRO, e não escolhida aqui dentro por um `switch` sobre o tipo. É a lição
 * escrita no censo (t6b): quem lê `certificarFolha` tem de ver, ali, qual crachá ela exige.
 * Certificar e devolver são o MESMO corpo — montar o objeto, conferir designação, conferir que
 * o objeto não mudou, gravar o fato — com um tipo diferente; duas cópias seriam dois lugares
 * para alguém corrigir uma guarda e esquecer a outra.
 */
async function registrarFatoDaCertificacao(
  prisma: PrismaClient,
  d: { readonly folhaId: string; readonly data: Date; readonly criadoPor: string; readonly motivo?: string },
  tipo: "CERTIFICACAO" | "DEVOLUCAO",
  acao: AcaoDoSistema
): Promise<{ readonly certificacaoId: string; readonly sha256: string; readonly competencia: string }> {
  // ⚠️ A MONTAGEM É FORA DA TRANSAÇÃO (leitura pesada: todos os contracheques), e a CONFERÊNCIA
  // do objeto é DENTRO — o `calculoId` e o `sha256` entram na gravação e são comparados com o
  // fechamento lido na transação. Se o objeto mudar no intervalo, a gravação recusa.
  const objeto = await objetoParaCertificar(prisma, d.folhaId);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, acao, "ENTE");

    const designacao = await designacaoVigenteDe(tx, d.criadoPor, d.data);
    if (designacao === null) throw new SemDesignacaoVigenteError(d.criadoPor, d.data);

    const folha = await tx.folhaDePagamento.findUnique({
      where: { id: d.folhaId },
      select: {
        competencia: true,
        fechamento: { select: { calculoId: true } },
        certificacoes: { select: { tipo: true, calculoId: true, criadoEm: true } },
      },
    });
    if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi gravado.`);
    if (folha.fechamento === null) throw new FolhaNaoFechadaError(folha.competencia);
    if (folha.fechamento.calculoId !== objeto.calculoId) {
      throw new Error(
        `OBJETO-MUDOU-NO-ATO: o cálculo fechado de ${folha.competencia} não é mais o que foi conferido. ` +
          `Certificar assim atestaria dados que não foram examinados. Reveja a folha e refaça o atesto. Nada foi gravado.`
      );
    }

    // ⚠️ SEGREGAÇÃO, e ela é conferida AQUI, dentro da transação — não na tela.
    if (tipo === "CERTIFICACAO") {
      if (objeto.fechadoPor === d.criadoPor) throw new AutocertificacaoError(d.criadoPor, "fechou esta folha");
      if (objeto.calculadoPor === d.criadoPor) throw new AutocertificacaoError(d.criadoPor, "calculou esta folha");
    }

    const situacao = situacaoDaCertificacao(folha.certificacoes, folha.fechamento.calculoId);
    if (tipo === "CERTIFICACAO" && situacao === "CERTIFICADA") {
      throw new Error(`FOLHA-JA-CERTIFICADA: a folha de ${folha.competencia} já está certificada. Nada foi gravado.`);
    }
    if (tipo === "DEVOLUCAO" && situacao === "DEVOLVIDA") {
      throw new Error(`FOLHA-JA-DEVOLVIDA: a folha de ${folha.competencia} já foi devolvida para correção. Nada foi gravado.`);
    }
    // ⚠️ DEVOLVER O QUE JÁ FOI LIQUIDADO NÃO DESFAZ A LIQUIDAÇÃO — e fingir que desfaz seria
    // pior do que recusar. Desfazer é ato próprio do M05 (anulação), com o seu lançamento.
    if (tipo === "DEVOLUCAO") {
      const liquidadas = await tx.liquidacaoDaFolha.count({ where: { empenhoDaFolha: { apropriacao: { folhaId: d.folhaId } } } });
      if (liquidadas > 0) {
        throw new Error(
          `FOLHA-JA-LIQUIDADA: ${liquidadas} liquidação(ões) desta folha já existe(m), e devolver o atesto não as desfaz. ` +
            `Desfazer obrigação liquidada é anulação pelo M05, com lançamento próprio. Nada foi gravado.`
        );
      }
    }

    const c = await tx.certificacaoDaFolha.create({
      data: {
        folhaId: d.folhaId,
        calculoId: objeto.calculoId,
        designacaoId: designacao.id,
        tipo,
        motivo: d.motivo ?? null,
        manifesto: objeto.manifesto as unknown as object,
        sha256: objeto.sha256,
        vinculos: objeto.manifesto.vinculos.length,
        totalProventos: objeto.manifesto.totais.proventos,
        totalDescontos: objeto.manifesto.totais.descontos,
        totalLiquido: objeto.manifesto.totais.liquido,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { certificacaoId: c.id, sha256: objeto.sha256, competencia: folha.competencia };
  });
}

export async function certificarFolha(prisma: PrismaClient, input: CertificarFolhaInput): Promise<{ readonly certificacaoId: string; readonly sha256: string; readonly competencia: string }> {
  const d = zCertificarFolhaInput.parse(input);
  return registrarFatoDaCertificacao(prisma, d, "CERTIFICACAO", ACAO_DO_SERVICO.certificarFolha);
}

export async function devolverFolhaParaCorrecao(prisma: PrismaClient, input: DevolverFolhaInput): Promise<{ readonly certificacaoId: string; readonly sha256: string; readonly competencia: string }> {
  const d = zDevolverFolhaInput.parse(input);
  return registrarFatoDaCertificacao(prisma, d, "DEVOLUCAO", ACAO_DO_SERVICO.devolverFolhaParaCorrecao);
}

// ═══════════════════════════════════════════════════════════════════════════════
// A LIQUIDAÇÃO — a obrigação reconhecida, pelo M05
// ═══════════════════════════════════════════════════════════════════════════════

export const zLiquidarFolhaInput = z.object({
  folhaId: z.string().min(1),
  /** A data das liquidações; o M05 confere o exercício e o período aberto. */
  data: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type LiquidarFolhaInput = z.input<typeof zLiquidarFolhaInput>;

export interface ResultadoDaLiquidacaoDaFolha {
  readonly competencia: string;
  readonly certificacaoId: string;
  /** Liquidações gravadas NESTA execução. */
  readonly liquidadas: number;
  /** Já existiam (execução anterior interrompida, ou repetição do ato). */
  readonly jaExistiam: number;
  /** Empenhos da folha que continuam sem liquidação — zero quando o ato completou. */
  readonly pendentes: number;
  readonly total: Money;
}

export async function liquidarFolha(prisma: PrismaClient, input: LiquidarFolhaInput): Promise<ResultadoDaLiquidacaoDaFolha> {
  const d = zLiquidarFolhaInput.parse(input);

  const folha = await prisma.folhaDePagamento.findUnique({
    where: { id: d.folhaId },
    select: {
      id: true, competencia: true, tipo: true,
      fechamento: { select: { calculoId: true } },
      certificacoes: { orderBy: { criadoEm: "asc" }, select: { id: true, tipo: true, calculoId: true, criadoEm: true, motivo: true, criadoPor: true, designacao: { select: { atoDesignacao: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } } } },
      apropriacao: { select: { id: true } },
    },
  });
  if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi gravado.`);
  if (folha.fechamento === null) throw new FolhaNaoFechadaError(folha.competencia);

  const situacao = situacaoDaCertificacao(folha.certificacoes, folha.fechamento.calculoId);
  if (situacao !== "CERTIFICADA") {
    const ultima = [...folha.certificacoes].reverse()[0];
    throw new FolhaNaoCertificadaError(folha.competencia, situacao, ultima?.motivo ?? null);
  }
  const certificacao = [...folha.certificacoes].reverse().find((c) => c.tipo === "CERTIFICACAO" && c.calculoId === folha.fechamento?.calculoId);
  if (certificacao === undefined) throw new FolhaNaoCertificadaError(folha.competencia, situacao, null);

  // ⚠️ QUEM CERTIFICOU NÃO LIQUIDA. Atestar é dizer que o valor é devido; liquidar é reconhecer a
  // obrigação COM BASE nesse atesto. Na mesma mão, o segundo ato não confere nada.
  if (certificacao.criadoPor === d.criadoPor) throw new AutoliquidacaoError(d.criadoPor);

  if (folha.apropriacao === null) throw new FolhaNaoApropriadaError(folha.competencia);

  // A autorização do ATO (a de LIQUIDAR é exigida de novo, por liquidação, dentro do M05).
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.liquidarFolha, "ENTE");
  });

  const empenhos = await prisma.empenhoDaFolha.findMany({
    where: { apropriacaoId: folha.apropriacao.id },
    orderBy: [{ grupo: { codigo: "asc" } }, { criadoEm: "asc" }],
    select: {
      id: true, valor: true, empenhoId: true,
      vinculo: { select: { matricula: true } },
      empenho: { select: { numero: true } },
      grupo: { select: { codigo: true, descricao: true, contaVariacao: { select: { codigo: true } }, contaObrigacao: { select: { codigo: true } } } },
      liquidacaoDaFolha: { select: { id: true } },
    },
  });
  if (empenhos.length === 0) throw new FolhaNaoApropriadaError(folha.competencia);

  // ⚠️ AS CONTAS SÃO CONFERIDAS ANTES DE QUALQUER GRAVAÇÃO. Descobrir na décima liquidação que o
  // décimo primeiro grupo não tem conta deixaria a folha metade liquidada por falta de cadastro —
  // e o efeito colateral antes da guarda é um defeito que já custou caro nesta obra.
  const semContas = [
    ...new Set(
      empenhos
        .filter((e) => e.liquidacaoDaFolha === null && (e.grupo.contaVariacao === null || e.grupo.contaObrigacao === null))
        .map((e) => e.grupo.codigo)
    ),
  ].sort();
  if (semContas.length > 0) throw new GrupoSemContasDaLiquidacaoError(semContas);

  const nomeDoCertificador = certificacao.designacao.pessoa.versoes[0]?.nome ?? certificacao.designacao.pessoa.documento;
  const responsavelAtesto = `${nomeDoCertificador} (${certificacao.designacao.atoDesignacao})`;

  const deps = criarM05DepsComContratos(prisma);
  let liquidadas = 0;
  let jaExistiam = 0;
  let total = toMoney(0);

  for (const e of empenhos) {
    const onde = `${e.grupo.codigo} / ${e.vinculo?.matricula ?? e.grupo.codigo} (empenho ${e.empenho.numero})`;
    const valor = toMoney(e.valor);
    total = toMoney(total.plus(valor));

    if (e.liquidacaoDaFolha !== null) {
      jaExistiam += 1;
      continue;
    }

    const numero = numeroDaLiquidacaoDaFolha(e.empenho.numero);
    try {
      // ⚠️ A RECUPERAÇÃO DA JANELA. Entre o `liquidar` do M05 (transação própria) e a gravação do
      // elo há um intervalo. Se o processo morrer nele, a liquidação EXISTE e o elo não — e uma
      // nova execução tentaria liquidar de novo. Procurar a liquidação pelo par (empenho, número)
      // e só amarrar o elo é o que torna a retomada honesta, em vez de duplicar a despesa.
      const ja = await prisma.liquidacao.findUnique({ where: { empenhoId_numero: { empenhoId: e.empenhoId, numero } }, select: { id: true } });
      const liquidacaoId =
        ja?.id ??
        (
          await liquidar(
            {
              empenhoId: e.empenhoId,
              numero,
              valor: valor.toFixed(2),
              data: d.data,
              responsavelAtesto,
              historico:
                `Folha ${folha.tipo.toLowerCase()} de ${folha.competencia} — ${e.grupo.descricao}` +
                (e.vinculo === null ? "" : `, matrícula ${e.vinculo.matricula}`) +
                `. Certificada em ${diaCivil(certificacao.criadoEm)} por ${responsavelAtesto}; liquidação de ${diaCivil(d.data)}.`,
              criadoPor: d.criadoPor,
            },
            roteiroLiquidacaoDaFolha({
              variacaoDiminutiva: e.grupo.contaVariacao!.codigo,
              obrigacaoAPagar: e.grupo.contaObrigacao!.codigo,
            }),
            deps
          )
        ).liquidacaoId;

      await prisma.liquidacaoDaFolha.create({
        data: { empenhoDaFolhaId: e.id, certificacaoId: certificacao.id, liquidacaoId, valor: valor.toFixed(2), criadoPor: d.criadoPor },
      });
      liquidadas += 1;
    } catch (err) {
      throw new LiquidacaoInterrompidaError(liquidadas, onde, err instanceof Error ? err.message : String(err));
    }
  }

  return {
    competencia: folha.competencia,
    certificacaoId: certificacao.id,
    liquidadas,
    jaExistiam,
    pendentes: empenhos.length - liquidadas - jaExistiam,
    total,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AS LEITURAS DA TELA — derivadas, nunca coluna
// ═══════════════════════════════════════════════════════════════════════════════

export interface CertificacaoLida {
  readonly situacao: SituacaoDaCertificacao;
  readonly fatos: readonly {
    readonly id: string;
    readonly tipo: "CERTIFICACAO" | "DEVOLUCAO";
    readonly motivo: string | null;
    readonly sha256: string;
    readonly vinculos: number;
    readonly totalProventos: Money;
    readonly totalLiquido: Money;
    readonly ato: string;
    readonly responsavel: string;
    readonly criadoPor: string;
    readonly criadoEm: Date;
  }[];
}

export async function certificacaoDaFolha(prisma: PrismaClient, folhaId: string): Promise<CertificacaoLida | null> {
  const folha = await prisma.folhaDePagamento.findUnique({
    where: { id: folhaId },
    select: {
      fechamento: { select: { calculoId: true } },
      certificacoes: {
        orderBy: { criadoEm: "asc" },
        select: {
          id: true, tipo: true, motivo: true, sha256: true, vinculos: true, calculoId: true, criadoEm: true, criadoPor: true,
          totalProventos: true, totalLiquido: true,
          designacao: { select: { atoDesignacao: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } },
        },
      },
    },
  });
  if (folha === null || folha.fechamento === null) return null;
  return {
    situacao: situacaoDaCertificacao(folha.certificacoes, folha.fechamento.calculoId),
    fatos: folha.certificacoes.map((c) => ({
      id: c.id,
      tipo: c.tipo,
      motivo: c.motivo,
      sha256: c.sha256,
      vinculos: c.vinculos,
      totalProventos: toMoney(c.totalProventos),
      totalLiquido: toMoney(c.totalLiquido),
      ato: c.designacao.atoDesignacao,
      responsavel: c.designacao.pessoa.versoes[0]?.nome ?? c.designacao.pessoa.documento,
      criadoPor: c.criadoPor,
      criadoEm: c.criadoEm,
    })),
  };
}

export interface LiquidacaoDaFolhaLida {
  readonly liquidadas: number;
  readonly pendentes: number;
  readonly total: Money;
  readonly linhas: readonly {
    readonly empenho: string;
    readonly grupo: string;
    readonly matricula: string | null;
    readonly valor: Money;
    readonly liquidacaoId: string | null;
    readonly numero: string | null;
    readonly responsavelAtesto: string | null;
    readonly data: Date | null;
  }[];
}

export async function liquidacaoDaFolha(prisma: PrismaClient, folhaId: string): Promise<LiquidacaoDaFolhaLida | null> {
  const ap = await prisma.apropriacaoDaFolha.findUnique({ where: { folhaId }, select: { id: true } });
  if (ap === null) return null;
  const empenhos = await prisma.empenhoDaFolha.findMany({
    where: { apropriacaoId: ap.id },
    orderBy: [{ grupo: { codigo: "asc" } }, { criadoEm: "asc" }],
    select: {
      valor: true,
      vinculo: { select: { matricula: true } },
      empenho: { select: { numero: true } },
      grupo: { select: { codigo: true, descricao: true } },
      liquidacaoDaFolha: { select: { liquidacaoId: true, liquidacao: { select: { numero: true, responsavelAtesto: true, data: true } } } },
    },
  });
  const linhas = empenhos.map((e) => ({
    empenho: e.empenho.numero,
    grupo: `${e.grupo.codigo} — ${e.grupo.descricao}`,
    matricula: e.vinculo?.matricula ?? null,
    valor: toMoney(e.valor),
    liquidacaoId: e.liquidacaoDaFolha?.liquidacaoId ?? null,
    numero: e.liquidacaoDaFolha?.liquidacao.numero ?? null,
    responsavelAtesto: e.liquidacaoDaFolha?.liquidacao.responsavelAtesto ?? null,
    data: e.liquidacaoDaFolha?.liquidacao.data ?? null,
  }));
  return {
    liquidadas: linhas.filter((l) => l.liquidacaoId !== null).length,
    pendentes: linhas.filter((l) => l.liquidacaoId === null).length,
    total: sumMoney(linhas.filter((l) => l.liquidacaoId !== null).map((l) => l.valor)),
    linhas,
  };
}

export interface DesignacaoLida {
  readonly id: string;
  readonly atribuicao: string;
  readonly responsavel: string;
  readonly documento: string;
  readonly usuario: string;
  readonly atoDesignacao: string;
  readonly vigenciaInicio: Date;
  readonly vigenciaFim: Date | null;
  readonly revogadaEm: Date | null;
  readonly vigenteHoje: boolean;
  readonly substitutoDe: string | null;
}

export async function designacoesNaFolha(prisma: PrismaClient, quando: Date = new Date()): Promise<readonly DesignacaoLida[]> {
  const ds = await prisma.designacaoNaFolha.findMany({
    orderBy: [{ vigenciaInicio: "desc" }],
    select: {
      id: true, atribuicao: true, atoDesignacao: true, vigenciaInicio: true, vigenciaFim: true,
      revogacao: { select: { dataEfeito: true } },
      usuario: { select: { identificador: true } },
      pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } },
      substitutoDe: { select: { atoDesignacao: true } },
    },
  });
  return ds.map((d) => ({
    id: d.id,
    atribuicao: d.atribuicao,
    responsavel: d.pessoa.versoes[0]?.nome ?? d.pessoa.documento,
    documento: d.pessoa.documento,
    usuario: d.usuario.identificador,
    atoDesignacao: d.atoDesignacao,
    vigenciaInicio: d.vigenciaInicio,
    vigenciaFim: d.vigenciaFim,
    revogadaEm: d.revogacao?.dataEfeito ?? null,
    vigenteHoje: designacaoVigenteEm({ vigenciaInicio: d.vigenciaInicio, vigenciaFim: d.vigenciaFim, revogacao: d.revogacao }, quando),
    substitutoDe: d.substitutoDe?.atoDesignacao ?? null,
  }));
}

export { Decimal };
