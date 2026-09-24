import { createHash } from "node:crypto";
import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO, type AcaoDoSistema } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { AtoInelegivelError, Decimal, toMoney, sumMoney, type Elegibilidade, type Money } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { roteiroLiquidacaoDaFolha } from "../m01-core-contabil/roteiros.js";
import { criarM05DepsComContratos } from "../m11-licitacoes/adapter-m05.js";
import { sha256Canonico } from "./dominio.js";
import { FolhaNaoFechadaError, parcelasDoCalculo } from "./apropriacao.js";
import {
  elegibilidadeParaCertificar,
  elegibilidadeParaDevolver,
  elegibilidadeParaLiquidar,
  type AtorNaFolha,
  type EstadoDaFolhaParaAtos,
} from "./elegibilidade.js";
/**
 * ⚠️ V11 V9.3 — SEM CICLO EM TEMPO DE EXECUÇÃO. `decimo-terceiro-servico.ts` importa
 * `decimo-terceiro.ts` e o M16, e nada daqui; o único elo de volta é um `import type` (apagado
 * na compilação) do `SituacaoDaCertificacao`. A direção continua sendo uma só.
 */
import { criterioDoAbatimentoNoCalculo } from "./decimo-terceiro-servico.js";

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
  atribuicao: z.enum(["CERTIFICAR_FOLHA", "CERTIFICAR_ENCARGOS_DA_FOLHA"]),
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

/**
 * A designação que sustenta um ato NOVO: vigente no dia do ato E no instante do servidor.
 *
 * ⚠️ A SEGUNDA CONDIÇÃO É O QUE FECHA O RETROATIVO. Sem ela, a pessoa revogada em 5 de junho
 * registra em setembro um atesto "de 2 de junho" e ele passa — o histórico da designação
 * sustentaria um ato praticado depois de ela deixar de valer. O atesto de junho REGISTRADO em
 * junho continua sustentado para sempre; o que se recusa é o ato novo. Data de negócio e
 * instante de registro são duas coisas, e as duas ficam gravadas.
 */
export async function designacaoVigenteParaOAto(
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">,
  usuarioIdentificador: string,
  dataDoAto: Date
): Promise<{ readonly id: string; readonly atoDesignacao: string; readonly nomeDaPessoa: string } | null> {
  // ⚠️ A MESMA DESIGNAÇÃO NAS DUAS DATAS. A primeira versão perguntava "há alguma vigente no dia do
  // ato?" e "há alguma vigente hoje?" separadamente — e aceitava o atesto sob a designação que só
  // COMEÇA no futuro (cobre o dia do ato, não cobre hoje), porque OUTRA, já quase vencida, cobria
  // hoje. O percurso do atesto achou: o manifesto saiu com o ato de uma portaria ainda não vigente.
  const agora = new Date();
  const candidatas = await tx.designacaoNaFolha.findMany({
    where: { atribuicao: "CERTIFICAR_FOLHA", usuario: { identificador: usuarioIdentificador, ativo: true } },
    orderBy: { vigenciaInicio: "desc" },
    select: { id: true, atoDesignacao: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } }, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } },
  });
  const c = candidatas.find((x) => designacaoVigenteEm(x, dataDoAto) && designacaoVigenteEm(x, agora));
  return c === undefined ? null : { id: c.id, atoDesignacao: c.atoDesignacao, nomeDaPessoa: c.pessoa.versoes[0]?.nome ?? c.pessoa.documento };
}

/** Converte a elegibilidade negativa na RECUSA NOMEADA que o módulo já tinha (os testes pegam a classe). */
function recusarSeInelegivel(
  e: Elegibilidade,
  ctx: {
    readonly competencia: string;
    readonly usuario: string;
    readonly data: Date;
    readonly situacao: SituacaoDaCertificacao | null;
    readonly motivoDaDevolucao: string | null;
    readonly fechou: boolean;
  }
): void {
  if (e.situacao === "ELEGIVEL") return;
  switch (e.codigo) {
    case "FOLHA-NAO-FECHADA":
      throw new FolhaNaoFechadaError(ctx.competencia);
    case "SEM-DESIGNACAO-VIGENTE":
      throw new SemDesignacaoVigenteError(ctx.usuario, ctx.data);
    case "AUTOCERTIFICACAO-DA-FOLHA":
      throw new AutocertificacaoError(ctx.usuario, ctx.fechou ? "fechou esta folha" : "calculou esta folha");
    case "AUTOLIQUIDACAO-DA-FOLHA":
      throw new AutoliquidacaoError(ctx.usuario);
    case "FOLHA-NAO-CERTIFICADA":
      throw new FolhaNaoCertificadaError(ctx.competencia, ctx.situacao ?? "PENDENTE", ctx.motivoDaDevolucao);
    case "FOLHA-NAO-APROPRIADA":
      throw new FolhaNaoApropriadaError(ctx.competencia);
    default:
      throw new AtoInelegivelError(e);
  }
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

    const folha = await tx.folhaDePagamento.findUnique({
      where: { id: d.folhaId },
      select: {
        competencia: true,
        // V11 V9.3 — o tipo entra para que o critério do abatimento só seja consultado onde ele
        // pode existir: um cálculo MENSAL não tem linha de abatimento do 13º para consultar.
        tipo: true,
        fechamento: { select: { calculoId: true } },
        certificacoes: { select: { tipo: true, calculoId: true, criadoEm: true } },
      },
    });
    if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi gravado.`);
    if (folha.fechamento !== null && folha.fechamento.calculoId !== objeto.calculoId) {
      throw new Error(
        `OBJETO-MUDOU-NO-ATO: o cálculo fechado de ${folha.competencia} não é mais o que foi conferido. ` +
          `Certificar assim atestaria dados que não foram examinados. Reveja a folha e refaça o atesto. Nada foi gravado.`
      );
    }

    // ⚠️ A DESIGNAÇÃO NAS DUAS DATAS. O dia do ato sustenta o atesto; HOJE (instante do servidor)
    // impede que uma revogação já registrada seja contornada datando o comando novo de antes dela.
    const designacao = await designacaoVigenteParaOAto(tx, d.criadoPor, d.data);

    const liquidadas = folha.fechamento === null ? 0 : await tx.liquidacaoDaFolha.count({ where: { empenhoDaFolha: { apropriacao: { folhaId: d.folhaId } } } });
    const estado: EstadoDaFolhaParaAtos = {
      competencia: folha.competencia,
      fechada: folha.fechamento !== null,
      temCalculoVivo: true,
      certificacao: folha.fechamento === null ? null : situacaoDaCertificacao(folha.certificacoes, folha.fechamento.calculoId),
      empenhosGravados: 0,
      empenhosEsperados: null,
      empenhosLiquidados: liquidadas,
      /**
       * ⚠️ V11 V9.3 — DERIVADO, e não `false` porque "estes predicados não olham".
       *
       * A primeira versão deste sítio cravava `false` com um comentário explicando que
       * `elegibilidadeParaCertificar` e `...Devolver` ignoram o campo. Estava errado por dois
       * motivos: o literal é um valor escolhido para o compilador, não lido do fato; e ele vira
       * uma armadilha no dia em que alguém fizer o predicado consultá-lo — a guarda nasceria
       * morta, com um `false` que ninguém lembraria de ter sido conveniência.
       *
       * ⚠️ O ATESTO CONTINUA SENDO OFERECIDO sobre uma folha em simulação, e isso é decisão: a
       * certificação é o CONTROLE INTERNO, e é justamente quem deveria enxergar a lacuna. Quem
       * é barrado são os atos em que a despesa nasce (apropriar) e em que o valor se torna
       * exigível (liquidar). Bloquear o atesto tiraria de cena o único olhar que falta.
       */
      abatimentoSemCriterioDeclarado:
        folha.tipo !== "DECIMO_TERCEIRO" || folha.fechamento === null
          ? false
          : await criterioDoAbatimentoNoCalculo(tx, folha.fechamento.calculoId).then((c) => c.abateu && c.criterioDeclarado === null),
    };
    const ator: AtorNaFolha = {
      fechou: objeto.fechadoPor === d.criadoPor,
      calculouOFechado: objeto.calculadoPor === d.criadoPor,
      certificou: false,
      designado: designacao !== null,
    };
    // ⚠️ O MESMO PREDICADO QUE A TELA PROJETA (`elegibilidade.ts`), sobre o estado lido AQUI.
    const e = tipo === "CERTIFICACAO" ? elegibilidadeParaCertificar(estado, ator) : elegibilidadeParaDevolver(estado, ator);
    recusarSeInelegivel(e, { competencia: folha.competencia, usuario: d.criadoPor, data: d.data, situacao: estado.certificacao, motivoDaDevolucao: null, fechou: ator.fechou });
    if (designacao === null) throw new SemDesignacaoVigenteError(d.criadoPor, d.data);

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

  const situacao = folha.fechamento === null ? null : situacaoDaCertificacao(folha.certificacoes, folha.fechamento.calculoId);
  const certificacao = folha.fechamento === null ? undefined : [...folha.certificacoes].reverse().find((c) => c.tipo === "CERTIFICACAO" && c.calculoId === folha.fechamento?.calculoId);
  const contagem = folha.apropriacao === null
    ? { gravados: 0 }
    : { gravados: await prisma.empenhoDaFolha.count({ where: { apropriacaoId: folha.apropriacao.id } }) };
  // ⚠️ O MESMO PREDICADO QUE A TELA PROJETA. "Já liquidada por inteiro" continua NÃO sendo recusa
  // aqui: reexecutar é idempotente e devolve `jaExistiam` — a tela deixa de oferecer, o serviço
  // não precisa gritar com quem chegou segundo.
  /**
   * ⚠️ V11 V9.3 — DERIVADO DO FATO, NUNCA LITERAL. O valor sai da MEMÓRIA do cálculo fechado,
   * pela mesma leitura que a apropriação usa — nunca do parâmetro vigente agora, que pode ter
   * ganhado o critério DEPOIS de este cálculo ter rodado sem conferir nada.
   *
   * ⚠️ E AQUI NÃO HÁ `catch`, ao contrário do retrato da tela. Este é o CASO DE USO: memória
   * ilegível num cálculo que abateu sobe como `CRITERIO-DO-ABATIMENTO-IRRECUPERAVEL` e o ato não
   * acontece. Uma tela pode se degradar; um ato que torna valor exigível, não.
   */
  const semCriterio =
    folha.tipo === "DECIMO_TERCEIRO" && folha.fechamento !== null
      ? await criterioDoAbatimentoNoCalculo(prisma, folha.fechamento.calculoId).then((c) => c.abateu && c.criterioDeclarado === null)
      : false;
  const e = elegibilidadeParaLiquidar(
    { competencia: folha.competencia, fechada: folha.fechamento !== null, temCalculoVivo: true, certificacao: situacao, empenhosGravados: contagem.gravados, empenhosEsperados: null, empenhosLiquidados: 0, abatimentoSemCriterioDeclarado: semCriterio },
    { fechou: false, calculouOFechado: false, certificou: certificacao?.criadoPor === d.criadoPor, designado: null }
  );
  const ultima = [...folha.certificacoes].reverse()[0];
  recusarSeInelegivel(e, { competencia: folha.competencia, usuario: d.criadoPor, data: d.data, situacao, motivoDaDevolucao: ultima?.motivo ?? null, fechou: false });
  if (certificacao === undefined || folha.apropriacao === null) throw new FolhaNaoCertificadaError(folha.competencia, situacao ?? "PENDENTE", null);

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
// O RETRATO DOS ATOS (V6.2 U0) — o estado que os predicados de `elegibilidade.ts` leem
// ═══════════════════════════════════════════════════════════════════════════════

export interface RetratoDosAtosDaFolha {
  readonly estado: EstadoDaFolhaParaAtos;
  readonly ator: AtorNaFolha;
  /** Impressão dos fatos que decidem os atos. Muda quando qualquer um deles muda. */
  readonly versao: string;
}

/**
 * LEITURA PURA do estado de uma folha para decidir quais atos cabem, e para quem.
 *
 * ⚠️ É O MESMO RETRATO NA TELA E NO TESTE DE PARIDADE. A porta projeta a barra a partir dele; o
 * `m33-elegibilidade.test.ts` o monta sobre folhas reais e confere que o caso de uso recusa com o
 * MESMO código que o predicado anunciou.
 */
export async function retratoDosAtosDaFolha(
  prisma: PrismaClient,
  folhaId: string,
  usuarioIdentificador: string,
  opcoes: { readonly consultarDesignacao: boolean; readonly lerDistribuicao: boolean }
): Promise<RetratoDosAtosDaFolha | null> {
  const f = await prisma.folhaDePagamento.findUnique({
    where: { id: folhaId },
    select: {
      competencia: true,
      tipo: true,
      fechamento: { select: { id: true, calculoId: true, criadoPor: true, calculo: { select: { criadoPor: true } } } },
      calculos: { select: { id: true, cancelamento: { select: { id: true } } } },
      certificacoes: { select: { id: true, tipo: true, calculoId: true, criadoEm: true, criadoPor: true } },
      apropriacao: { select: { id: true, _count: { select: { empenhos: true } } } },
    },
  });
  if (f === null) return null;
  const liquidados = f.apropriacao === null ? 0 : await prisma.liquidacaoDaFolha.count({ where: { empenhoDaFolha: { apropriacaoId: f.apropriacao.id } } });
  const certificacao = f.fechamento === null ? null : situacaoDaCertificacao(f.certificacoes, f.fechamento.calculoId);
  let esperados: number | null = null;
  if (opcoes.lerDistribuicao && f.fechamento !== null && f.apropriacao !== null) {
    // Parar a apropriação no meio é estado real; saber se ela COMPLETOU pede a distribuição do
    // cálculo fechado. Falhar aqui não trava a retomada — quem decide é o serviço.
    esperados = await parcelasDoCalculo(prisma, f.fechamento.calculoId).then((p) => p.parcelas.length, () => null);
  }
  /**
   * ⚠️ V11 V9.3 — A SIMULAÇÃO ENTRA NO RETRATO, para que a BARRA DA TELA a mostre pelo mesmo
   * predicado com que o caso de uso recusa. Só se consulta quando há o que consultar: folha de
   * 13º, fechada. Falhar aqui não pode travar a barra inteira — uma tela que some porque um fato
   * secundário não pôde ser lido é pior que uma tela que oferece um ato que o serviço recusará
   * com o motivo na mão. O `catch` devolve `false`, e a recusa REAL continua em `apropriarFolha`,
   * que é fail-closed e não tem `catch` nenhum.
   */
  const semCriterio =
    f.tipo === "DECIMO_TERCEIRO" && f.fechamento !== null
      ? await criterioDoAbatimentoNoCalculo(prisma, f.fechamento.calculoId).then(
          (c) => c.abateu && c.criterioDeclarado === null,
          () => false
        )
      : false;
  const doFechado = f.fechamento === null ? [] : f.certificacoes.filter((c) => c.calculoId === f.fechamento!.calculoId).sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
  const ultimo = doFechado[doFechado.length - 1];
  const designado = opcoes.consultarDesignacao ? (await designacaoVigenteParaOAto(prisma, usuarioIdentificador, new Date())) !== null : null;
  const versao = createHash("sha256")
    .update(JSON.stringify([
      f.fechamento?.id ?? null,
      f.calculos.map((c) => [c.id, c.cancelamento?.id ?? null]).sort(),
      f.certificacoes.map((c) => c.id).sort(),
      f.apropriacao?._count.empenhos ?? null,
      liquidados,
      // ⚠️ SEM ISTO A BARRA FICARIA VELHA. Declarar o critério e recalcular a folha muda o que o
      // ato oferece, e a `versao` é a impressão dos fatos que DECIDEM os atos — omitir um fato
      // que decide faz a tela continuar mostrando a recusa depois de ela ter deixado de valer.
      semCriterio,
    ]))
    .digest("hex")
    .slice(0, 16);
  return {
    estado: {
      competencia: f.competencia,
      fechada: f.fechamento !== null,
      temCalculoVivo: f.calculos.some((c) => c.cancelamento === null),
      certificacao,
      empenhosGravados: f.apropriacao?._count.empenhos ?? 0,
      empenhosEsperados: esperados,
      empenhosLiquidados: liquidados,
      abatimentoSemCriterioDeclarado: semCriterio,
    },
    ator: {
      fechou: f.fechamento?.criadoPor === usuarioIdentificador,
      calculouOFechado: f.fechamento?.calculo.criadoPor === usuarioIdentificador,
      certificou: ultimo?.tipo === "CERTIFICACAO" && ultimo.criadoPor === usuarioIdentificador,
      designado,
    },
    versao,
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
