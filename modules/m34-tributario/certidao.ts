import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { diaCivil, somarDiasCivis } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { shaDaMemoria } from "./lancamento.js";

/**
 * ═══ M34 B2.4 — A CERTIDÃO (V10 T2 · N5) ═══
 *
 * ═══ ⚠️ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA NÃO COMETER ═══
 * **A negativa automática.** "Não achei dívida" e "não olhei" produzem a mesma tela e são
 * coisas opostas para quem assina o documento. Uma certidão negativa é uma declaração do
 * município de que aquela pessoa nada deve — e se a base de dívida ativa não respondeu, ou se
 * o ente tem um cadastro de ISS que este sistema não alcança, o município estaria declarando
 * o que não conferiu.
 *
 * A saída é a COBERTURA: cada base do ente aparece como uma linha, com a situação em que ela
 * respondeu. Quatro situações, e a terceira e a quarta são as que impedem a negativa falsa:
 *   · SEM_PENDENCIA    — consultada, e nada devido;
 *   · COM_PENDENCIA    — consultada, e há débito vivo;
 *   · INDISPONIVEL     — existe e NÃO respondeu;
 *   · FORA_DO_ALCANCE  — existe no ente e este sistema não a cobre.
 *
 * ⚠️ E O SISTEMA NÃO EMITE NEGATIVA SOZINHO enquanto houver base fora do alcance. O que ele
 * faz é o pedido e a análise, com a lista do que falta — e a decisão fica com quem responde
 * pela base fiscal, que declara por escrito o que conferiu fora daqui. Isso é honestidade
 * sobre o alcance, não funcionalidade faltando: a ordem V10 pede exatamente esta forma.
 *
 * ⚠️ A CHAVE DE AUTENTICIDADE NÃO É ENUMERÁVEL (32 bytes de `randomBytes`). O protocolo é
 * sequencial e serve ao balcão; a chave é o que um terceiro usa para conferir, e a conferência
 * devolve o MÍNIMO — existe, de quem é com o documento MASCARADO, quando, até quando. Nunca o
 * extrato de débitos: quem tem a chave de uma certidão não ganha o cadastro fiscal de ninguém.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * ⚠️ AS BASES SÃO UM CENSO DECLARADO, e não "o que o código lembrou de consultar". Uma base
 * que o ente tem e este sistema não alcança PRECISA aparecer — é ela que impede a negativa.
 */
export const BASES_DA_CERTIDAO = [
  {
    id: "LANCAMENTO_TRIBUTARIO",
    nome: "Lançamentos tributários deste sistema",
    alcancada: true,
  },
  {
    id: "CREDITO_RECONHECIDO",
    nome: "Créditos reconhecidos com saldo em aberto",
    alcancada: true,
  },
  {
    id: "DIVIDA_ATIVA",
    nome: "Dívida ativa",
    // ⚠️ A dívida ativa EXISTE no sistema (M10), e não há hoje vínculo entre uma inscrição em
    // dívida ativa e a Pessoa do cadastro canônico: ela guarda o devedor como texto. Consultar
    // por nome seria pior que não consultar — homônimo vira certidão errada nos dois sentidos.
    alcancada: false,
  },
  {
    id: "PARCELAMENTO",
    nome: "Parcelamentos de débito",
    alcancada: false,
  },
  {
    id: "CADASTRO_ECONOMICO_ISS",
    nome: "Cadastro econômico e ISS",
    alcancada: false,
  },
] as const;

export type IdDaBase = (typeof BASES_DA_CERTIDAO)[number]["id"];

export type SituacaoDaBase = "SEM_PENDENCIA" | "COM_PENDENCIA" | "INDISPONIVEL" | "FORA_DO_ALCANCE";

export interface LinhaDaCobertura {
  readonly base: IdDaBase;
  readonly nome: string;
  readonly situacao: SituacaoDaBase;
  readonly detalhe: string;
  readonly pendencias: number | null;
}

const FORA_DO_ALCANCE_DETALHE: Record<string, string> = {
  DIVIDA_ATIVA:
    "A dívida ativa deste sistema registra o devedor como texto e não tem vínculo com o cadastro " +
    "de pessoas — consultar por nome faria de um homônimo uma certidão errada. Quem responde pela " +
    "base precisa conferi-la fora daqui e declarar o que encontrou.",
  PARCELAMENTO:
    "O parcelamento de débitos tributários ainda não existe neste sistema. Se o ente concede " +
    "parcelamento por outro meio, a conferência é fora daqui.",
  CADASTRO_ECONOMICO_ISS:
    "O cadastro econômico e o ISS ainda não existem neste sistema. Um contribuinte sem débito de " +
    "IPTU pode dever ISS, e esta certidão não tem como saber.",
};

/**
 * LEVANTA a cobertura — a consulta a cada base, com o que ela respondeu. LEITURA pura.
 *
 * ⚠️ FAIL-CLOSED POR BASE: uma base alcançada que ESTOURE vira `INDISPONIVEL`, e não
 * `SEM_PENDENCIA`. Engolir o erro da consulta e responder "nada devido" é o modo exato de
 * emitir uma negativa falsa — e o `catch` que devolve vazio é como isso acontece na prática.
 */
export async function levantarCobertura(
  prisma: Tx,
  entrada: { readonly pessoaId: string; readonly imovelId: string | null }
): Promise<readonly LinhaDaCobertura[]> {
  const linhas: LinhaDaCobertura[] = [];

  for (const base of BASES_DA_CERTIDAO) {
    if (!base.alcancada) {
      linhas.push({
        base: base.id,
        nome: base.nome,
        situacao: "FORA_DO_ALCANCE",
        detalhe: FORA_DO_ALCANCE_DETALHE[base.id] ?? "Base fora do alcance deste sistema.",
        pendencias: null,
      });
      continue;
    }
    try {
      linhas.push(await consultar(prisma, base.id, base.nome, entrada));
    } catch (e) {
      linhas.push({
        base: base.id,
        nome: base.nome,
        situacao: "INDISPONIVEL",
        detalhe:
          `A consulta a esta base falhou, e por isso ela NÃO conta como "nada devido": ` +
          `${e instanceof Error ? e.message : String(e)}`,
        pendencias: null,
      });
    }
  }
  return linhas;
}

async function consultar(
  prisma: Tx,
  id: IdDaBase,
  nome: string,
  entrada: { readonly pessoaId: string; readonly imovelId: string | null }
): Promise<LinhaDaCobertura> {
  if (id === "LANCAMENTO_TRIBUTARIO") {
    // ⚠️ O RECORTE É PELA RESPONSABILIDADE CONGELADA no lançamento — não pelos vínculos de
    // hoje. Quem vendeu o imóvel em março continua devendo o lançamento de janeiro, e quem
    // comprou não passou a dever o que não era dele.
    const vivos = await prisma.lancamentoTributario.findMany({
      where: {
        situacao: { in: ["PREPARADO", "CONSTITUIDO"] },
        responsaveis: { some: { pessoaId: entrada.pessoaId } },
        ...(entrada.imovelId === null ? {} : { imovelId: entrada.imovelId }),
      },
      select: { valor: true, tributo: true, exercicio: true, imovel: { select: { inscricao: true } } },
    });
    if (vivos.length === 0) {
      return { base: id, nome, situacao: "SEM_PENDENCIA", detalhe: "Nenhum lançamento em aberto.", pendencias: 0 };
    }
    let total = new Decimal(0);
    for (const v of vivos) total = total.plus(new Decimal(v.valor.toFixed(2)));
    return {
      base: id,
      nome,
      situacao: "COM_PENDENCIA",
      detalhe:
        `${vivos.length} lançamento(s) em aberto, somando ${toMoney(total).toFixed(2)}: ` +
        vivos.map((v) => `${v.tributo}/${v.exercicio} do imóvel ${v.imovel.inscricao}`).join("; "),
      pendencias: vivos.length,
    };
  }

  // CREDITO_RECONHECIDO — o saldo dos créditos amarrados a lançamentos desta pessoa.
  const constituidos = await prisma.constituicaoDoLancamento.findMany({
    where: {
      lancamento: {
        responsaveis: { some: { pessoaId: entrada.pessoaId } },
        ...(entrada.imovelId === null ? {} : { imovelId: entrada.imovelId }),
      },
    },
    select: { reconhecimentoId: true },
  });
  if (constituidos.length === 0) {
    return { base: id, nome, situacao: "SEM_PENDENCIA", detalhe: "Nenhum crédito constituído.", pendencias: 0 };
  }
  const ids = constituidos.map((c) => c.reconhecimentoId);
  const [recs, arrec, insc, canc] = await Promise.all([
    prisma.receitaReconhecida.findMany({ where: { id: { in: ids } }, select: { id: true, valor: true } }),
    prisma.vinculoArrecadacaoReconhecimento.findMany({
      where: { reconhecimentoId: { in: ids }, arrecadacao: { estornoDeId: null, estornos: { none: {} } } },
      select: { reconhecimentoId: true, valor: true },
    }),
    prisma.inscricaoDeReconhecimento.findMany({ where: { reconhecimentoId: { in: ids } }, select: { reconhecimentoId: true, valor: true } }),
    prisma.cancelamentoDeReconhecimento.findMany({ where: { reconhecimentoId: { in: ids } }, select: { reconhecimentoId: true, valor: true } }),
  ]);
  const baixado = new Map<string, Decimal>();
  for (const lista of [arrec, insc, canc]) {
    for (const x of lista) {
      baixado.set(x.reconhecimentoId, (baixado.get(x.reconhecimentoId) ?? new Decimal(0)).plus(new Decimal(x.valor.toFixed(2))));
    }
  }
  let saldo = new Decimal(0);
  let abertos = 0;
  for (const r of recs) {
    const s = new Decimal(r.valor.toFixed(2)).minus(baixado.get(r.id) ?? new Decimal(0));
    if (s.gt(0)) {
      saldo = saldo.plus(s);
      abertos += 1;
    }
  }
  if (abertos === 0) {
    return { base: id, nome, situacao: "SEM_PENDENCIA", detalhe: "Todos os créditos estão quitados, inscritos ou cancelados.", pendencias: 0 };
  }
  return {
    base: id,
    nome,
    situacao: "COM_PENDENCIA",
    detalhe: `${abertos} crédito(s) com saldo em aberto, somando ${toMoney(saldo).toFixed(2)}.`,
    pendencias: abertos,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// O PEDIDO
// ═══════════════════════════════════════════════════════════════════════════

export const zSolicitar = z
  .object({
    /** O documento da Pessoa (CPF/CNPJ sem máscara). A pessoa tem de existir no cadastro. */
    documento: z.string().trim().regex(/^\d{11}$|^\d{14}$/, "O documento é CPF (11) ou CNPJ (14), sem máscara."),
    imovelId: z.string().min(1).optional(),
    criadoPor: z.string().min(1),
  })
  .strict();

export interface ResultadoDoPedido {
  readonly solicitacaoId: string;
  readonly protocolo: string;
  readonly chaveDeAutenticidade: string;
  readonly cobertura: readonly LinhaDaCobertura[];
  readonly sugestao: "NEGATIVA" | "POSITIVA" | "ANALISE";
  readonly pendencia: string | null;
}

/**
 * SOLICITA a certidão: grava o pedido e a cobertura levantada. Não emite nada.
 *
 * ⚠️ A SEPARAÇÃO PEDIR/DECIDIR É O PRODUTO. O pedido levanta o que dá para levantar e diz o
 * que NÃO deu; a decisão é ato de quem responde pela base fiscal. Emendar os dois faria o
 * sistema assinar, no lugar do município, uma declaração sobre bases que ele não leu.
 */
export async function solicitarCertidao(
  prisma: PrismaClient,
  input: z.input<typeof zSolicitar>
): Promise<ResultadoDoPedido> {
  const d = zSolicitar.parse(input);
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.solicitarCertidao, "ENTE");

  const pessoa = await prisma.pessoa.findUnique({ where: { documento: d.documento }, select: { id: true } });
  if (pessoa === null) {
    throw new Error(
      `PESSOA-NAO-CADASTRADA: não há pessoa com o documento informado. A certidão é de uma ` +
        `Pessoa do cadastro canônico — cadastrá-la aqui, de passagem, criaria um segundo ` +
        `cadastro de pessoas. Nada foi gravado.`
    );
  }
  if (d.imovelId !== undefined) {
    const im = await prisma.imovel.findUnique({ where: { id: d.imovelId }, select: { id: true } });
    if (im === null) throw new Error(`IMOVEL-INEXISTENTE: o imóvel indicado não existe. Nada foi gravado.`);
  }

  const cobertura = await levantarCobertura(prisma, { pessoaId: pessoa.id, imovelId: d.imovelId ?? null });
  const sugerida = sugestaoDaCobertura(cobertura);

  const protocolo = await proximoProtocolo(prisma);
  const solicitacao = await prisma.solicitacaoDeCertidao.create({
    data: {
      protocolo,
      pessoaId: pessoa.id,
      imovelId: d.imovelId ?? null,
      situacao: "EM_ANALISE",
      // ⚠️ 32 BYTES DE `randomBytes` = 64 hex. Não é o protocolo, não é o id, e não se adivinha.
      chaveDeAutenticidade: randomBytes(32).toString("hex"),
      pendencia: sugerida.pendencia,
      criadoPor: d.criadoPor,
      cobertura: {
        create: cobertura.map((c) => ({
          base: c.base,
          situacao: c.situacao,
          detalhe: c.detalhe,
          pendencias: c.pendencias,
        })),
      },
    },
    select: { id: true, chaveDeAutenticidade: true },
  });

  return {
    solicitacaoId: solicitacao.id,
    protocolo,
    chaveDeAutenticidade: solicitacao.chaveDeAutenticidade,
    cobertura,
    sugestao: sugerida.sugestao,
    pendencia: sugerida.pendencia,
  };
}

/**
 * A SUGESTÃO, e ela é SUGESTÃO — quem decide é gente.
 *
 * ⚠️ A REGRA QUE IMPORTA: base fora do alcance ou indisponível **nunca** produz sugestão de
 * negativa, mesmo que tudo o mais esteja limpo. "Nada encontrei nas bases que li" não é "nada
 * deve".
 */
export function sugestaoDaCobertura(
  cobertura: readonly LinhaDaCobertura[]
): { readonly sugestao: "NEGATIVA" | "POSITIVA" | "ANALISE"; readonly pendencia: string | null } {
  const comPendencia = cobertura.filter((c) => c.situacao === "COM_PENDENCIA");
  if (comPendencia.length > 0) {
    return {
      sugestao: "POSITIVA",
      pendencia:
        `Há débito nas bases: ${comPendencia.map((c) => c.nome).join(", ")}. ` +
        `A certidão negativa não cabe; cabe positiva, ou positiva com efeito de negativa se o ` +
        `débito estiver com exigibilidade suspensa (art. 206 do CTN) — e isso quem declara é ` +
        `quem analisa.`,
    };
  }
  const semResposta = cobertura.filter((c) => c.situacao === "INDISPONIVEL" || c.situacao === "FORA_DO_ALCANCE");
  if (semResposta.length > 0) {
    return {
      sugestao: "ANALISE",
      pendencia:
        `Nada foi encontrado nas bases consultadas, mas ${semResposta.length} base(s) não ` +
        `responderam: ${semResposta.map((c) => c.nome).join(", ")}. O sistema NÃO emite negativa ` +
        `sobre base que não leu. Quem responde pela base fiscal precisa conferi-las e declarar o ` +
        `que encontrou ao decidir.`,
    };
  }
  return { sugestao: "NEGATIVA", pendencia: null };
}

async function proximoProtocolo(prisma: Tx): Promise<string> {
  const ano = new Date().getFullYear();
  const n = await prisma.solicitacaoDeCertidao.count({ where: { protocolo: { startsWith: `CND/${ano}/` } } });
  return `CND/${ano}/${String(n + 1).padStart(6, "0")}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// A DECISÃO
// ═══════════════════════════════════════════════════════════════════════════

export const zDecidir = z
  .object({
    solicitacaoId: z.string().min(1),
    decisao: z.enum(["EMITIR", "INDEFERIR"]),
    tipo: z.enum(["NEGATIVA", "POSITIVA", "POSITIVA_COM_EFEITO_DE_NEGATIVA"]).optional(),
    /**
     * ⚠️ O QUE FOI CONFERIDO FORA DAQUI. Obrigatório quando alguma base ficou sem resposta —
     * é a declaração de quem assina, e ela vai CONGELADA no documento. Sem ela, a emissão de
     * negativa é recusada.
     */
    declaracaoDeConferencia: z.string().trim().min(20).optional(),
    motivo: z.string().trim().min(10).optional(),
    /** `true` quando a implantação não é produção: o documento sai marcado. */
    semValidadeOficial: z.boolean(),
    criadoPor: z.string().min(1),
  })
  .strict();

export interface ResultadoDaDecisao {
  readonly solicitacaoId: string;
  readonly situacao: "EMITIDA" | "INDEFERIDA";
  readonly tipo: string | null;
  readonly validadeAte: string | null;
  readonly detalhe: string;
}

/**
 * DECIDE a solicitação — emite ou indefere.
 *
 * ⚠️ AS TRÊS RECUSAS ANTES DE QUALQUER ESCRITA:
 *   1. solicitação já decidida — decidir duas vezes produziria duas certidões válidas do mesmo
 *      pedido, com validades diferentes;
 *   2. NEGATIVA com base sem resposta e SEM a declaração de conferência — é a negativa falsa;
 *   3. emissão SEM configuração de validade vigente — inventar "90 dias" seria inventar prazo
 *      do município.
 */
export async function decidirCertidao(
  prisma: PrismaClient,
  input: z.input<typeof zDecidir>,
  agora: Date = new Date()
): Promise<ResultadoDaDecisao> {
  const d = zDecidir.parse(input);
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.decidirCertidao, "ENTE");

  const s = await prisma.solicitacaoDeCertidao.findUnique({
    where: { id: d.solicitacaoId },
    select: {
      id: true, protocolo: true, situacao: true, chaveDeAutenticidade: true,
      pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } },
      imovel: { select: { inscricao: true } },
      cobertura: { select: { base: true, situacao: true, detalhe: true, pendencias: true } },
    },
  });
  if (s === null) throw new Error(`SOLICITACAO-INEXISTENTE: não há solicitação com id "${d.solicitacaoId}". Nada foi gravado.`);
  if (s.situacao !== "EM_ANALISE") {
    throw new Error(
      `SOLICITACAO-JA-DECIDIDA: o protocolo ${s.protocolo} está ${s.situacao}. Decidir de novo ` +
        `produziria duas certidões do mesmo pedido, com validades diferentes, ambas conferíveis. ` +
        `Se a situação do contribuinte mudou, o caminho é um pedido NOVO. Nada foi gravado.`
    );
  }

  if (d.decisao === "INDEFERIR") {
    if (d.motivo === undefined) {
      throw new Error("MOTIVO-OBRIGATORIO: indeferir uma certidão exige fundamento (ao menos 10 caracteres). Nada foi gravado.");
    }
    await prisma.solicitacaoDeCertidao.update({
      where: { id: s.id },
      data: { situacao: "INDEFERIDA", motivo: d.motivo },
    });
    return { solicitacaoId: s.id, situacao: "INDEFERIDA", tipo: null, validadeAte: null, detalhe: `Protocolo ${s.protocolo} indeferido.` };
  }

  if (d.tipo === undefined) {
    throw new Error("TIPO-OBRIGATORIO: emitir exige dizer QUAL certidão — negativa, positiva ou positiva com efeito de negativa. Nada foi gravado.");
  }

  const semResposta = s.cobertura.filter((c) => c.situacao === "INDISPONIVEL" || c.situacao === "FORA_DO_ALCANCE");
  if (d.tipo === "NEGATIVA" && semResposta.length > 0 && d.declaracaoDeConferencia === undefined) {
    throw new Error(
      `NEGATIVA-SEM-COBERTURA: ${semResposta.length} base(s) desta solicitação não responderam ` +
        `(${semResposta.map((c) => c.base).join(", ")}), e uma certidão negativa é a declaração do ` +
        `município de que a pessoa NADA DEVE.\n` +
        `  o que NÃO se faz: emitir porque "não apareceu nada". Não aparecer e não existir são ` +
        `coisas diferentes.\n` +
        `  o que se faz: confira as bases fora do alcance e escreva, no campo de declaração, o ` +
        `que encontrou. O texto vai CONGELADO no documento, com o seu nome. Nada foi gravado.`
    );
  }

  const config = await configuracaoVigente(prisma, diaCivil(agora));
  if (config === null) {
    throw new Error(
      `CERTIDAO-SEM-CONFIGURACAO: não há configuração de certidão vigente (validade em dias e ` +
        `fundamento).\n` +
        `  o que NÃO se faz: usar 90 dias porque é o que muitos municípios usam. O prazo é do ` +
        `ente, e inventá-lo aqui seria inventar norma municipal.\n` +
        `  quem resolve: publique a configuração da certidão com a validade e o fundamento legal. ` +
        `O pedido e a análise continuam funcionando — o que fica impedido é EMITIR. Nada foi gravado.`
    );
  }

  const emitidaEmDia = diaCivil(agora);
  // ⚠️ `somarDiasCivis` SOMA NO CALENDÁRIO CIVIL, e não em milissegundos: atravessar a virada
  // do horário de verão com `getTime() + N*86400000` desloca a hora e pode mudar o DIA de
  // vencimento. A régua é `packages/datas`, e o resultado volta a ser lido como dia civil.
  const validadeAte = diaCivil(somarDiasCivis(agora, config.validadeEmDias));

  const emissao = {
    protocolo: s.protocolo,
    tipo: d.tipo,
    pessoa: { nome: s.pessoa.versoes[0]?.nome ?? "(sem versão de cadastro)", documento: mascarar(s.pessoa.documento) },
    imovel: s.imovel?.inscricao ?? null,
    emitidaEm: emitidaEmDia,
    validadeAte,
    fundamento: config.fundamento,
    observacao: config.observacao,
    cobertura: s.cobertura.map((c) => ({ base: c.base, situacao: c.situacao, detalhe: c.detalhe, pendencias: c.pendencias })),
    declaracaoDeConferencia: d.declaracaoDeConferencia ?? null,
    emitidaPor: d.criadoPor,
    // ⚠️ A MARCA DA DEMONSTRAÇÃO VAI DENTRO DO DOCUMENTO CONGELADO, e não só na tela: um PDF
    // de ambiente de avaliação que circule sem a marca é um documento falso em circulação.
    semValidadeOficial: d.semValidadeOficial,
  };

  await prisma.solicitacaoDeCertidao.update({
    where: { id: s.id },
    data: {
      situacao: "EMITIDA",
      tipo: d.tipo,
      validadeAte,
      pendencia: null,
      emissao,
      emissaoSha256: shaDaMemoria(emissao),
      modeloDaEmissao: "certidao-v1",
      emitidaEm: agora,
      emitidaPor: d.criadoPor,
    },
  });

  return {
    solicitacaoId: s.id,
    situacao: "EMITIDA",
    tipo: d.tipo,
    validadeAte,
    detalhe:
      `Protocolo ${s.protocolo} emitido como ${d.tipo}, válido até ${validadeAte.split("-").reverse().join("/")}` +
      (d.semValidadeOficial ? " — SEM VALIDADE OFICIAL (ambiente de avaliação)." : "."),
  };
}

/** A configuração vigente no dia — a de maior versão com vigência até ele. */
export async function configuracaoVigente(
  prisma: Tx,
  dia: string
): Promise<{ readonly validadeEmDias: number; readonly fundamento: string; readonly observacao: string | null } | null> {
  const c = await prisma.versaoDaConfiguracaoDaCertidao.findFirst({
    where: { vigenciaInicio: { lte: dia } },
    orderBy: { versao: "desc" },
    select: { validadeEmDias: true, fundamento: true, observacao: true },
  });
  return c;
}

export const zConfigurar = z
  .object({
    vigenciaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    validadeEmDias: z.number().int().min(1).max(3650),
    fundamento: z.string().trim().min(5, "Diga a lei, o decreto ou o artigo que fixa o prazo."),
    observacao: z.string().trim().max(2000).optional(),
    criadoPor: z.string().min(1),
  })
  .strict();

/**
 * PUBLICA uma versão da configuração da certidão.
 *
 * ⚠️ A AÇÃO É `GERIR_PARAMETROS_TRIBUTARIOS`, a MESMA da tabela do IPTU, e não uma nova. A
 * validade e o fundamento de uma certidão são parâmetro normativo do ente, como a alíquota:
 * quem publica um publica o outro. Uma ação a mais aqui inventaria uma segregação que o ente
 * não tem — e o censo do M16 existe para não inventar.
 */
export async function configurarCertidao(
  prisma: PrismaClient,
  input: z.input<typeof zConfigurar>
): Promise<{ readonly versao: number }> {
  const d = zConfigurar.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.configurarCertidao, "ENTE");
    const ultima = await tx.versaoDaConfiguracaoDaCertidao.findFirst({
      orderBy: { versao: "desc" },
      select: { versao: true, vigenciaInicio: true },
    });
    if (ultima !== null && d.vigenciaInicio < ultima.vigenciaInicio) {
      throw new Error(
        `VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE: a versão ${ultima.versao} vale desde ` +
          `${ultima.vigenciaInicio}; a nova não pode valer antes. Nada foi gravado.`
      );
    }
    const versao = (ultima?.versao ?? 0) + 1;
    await tx.versaoDaConfiguracaoDaCertidao.create({
      data: {
        versao,
        vigenciaInicio: d.vigenciaInicio,
        validadeEmDias: d.validadeEmDias,
        fundamento: d.fundamento,
        observacao: d.observacao ?? null,
        criadoPor: d.criadoPor,
      },
    });
    return { versao };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A CONFERÊNCIA DE AUTENTICIDADE
// ═══════════════════════════════════════════════════════════════════════════

export interface Autenticidade {
  readonly existe: boolean;
  readonly protocolo: string | null;
  readonly tipo: string | null;
  readonly titular: string | null;
  readonly documentoMascarado: string | null;
  readonly emitidaEm: string | null;
  readonly validadeAte: string | null;
  readonly vigente: boolean | null;
  readonly semValidadeOficial: boolean | null;
}

/**
 * CONFERE uma certidão pela chave. **Público, e MÍNIMO.**
 *
 * ⚠️ O QUE ELA NÃO DEVOLVE, e cada omissão tem motivo: o extrato de débitos (quem tem a chave
 * de uma certidão não ganha o cadastro fiscal de ninguém), o CPF em claro (o documento sai
 * mascarado), a cobertura detalhada e o id interno. O que ela responde é a pergunta que quem
 * confere tem: este documento existe, é de quem diz ser, e está valendo?
 *
 * ⚠️ E A CHAVE ERRADA RESPONDE `existe: false`, sem distinguir "não existe" de "formato
 * inválido": a diferença ensinaria quem varre chaves o que está perto de acertar.
 */
export async function conferirAutenticidade(prisma: Tx, chave: string, hoje: string): Promise<Autenticidade> {
  const vazia: Autenticidade = {
    existe: false, protocolo: null, tipo: null, titular: null, documentoMascarado: null,
    emitidaEm: null, validadeAte: null, vigente: null, semValidadeOficial: null,
  };
  if (!/^[0-9a-f]{64}$/.test(chave)) return vazia;

  const s = await prisma.solicitacaoDeCertidao.findUnique({
    where: { chaveDeAutenticidade: chave },
    select: { protocolo: true, situacao: true, tipo: true, validadeAte: true, emitidaEm: true, emissao: true },
  });
  if (s === null || s.situacao !== "EMITIDA" || s.emitidaEm === null) return vazia;

  const emissao = s.emissao as { readonly pessoa?: { readonly nome?: string; readonly documento?: string }; readonly semValidadeOficial?: boolean } | null;
  return {
    existe: true,
    protocolo: s.protocolo,
    tipo: s.tipo,
    titular: emissao?.pessoa?.nome ?? null,
    documentoMascarado: emissao?.pessoa?.documento ?? null,
    emitidaEm: diaCivil(s.emitidaEm),
    validadeAte: s.validadeAte,
    vigente: s.validadeAte !== null && hoje <= s.validadeAte,
    semValidadeOficial: emissao?.semValidadeOficial ?? null,
  };
}

/**
 * ⚠️ A MÁSCARA DO DOCUMENTO — CPF com os três primeiros e os dois últimos escondidos, CNPJ
 * inteiro. É a mesma regra da consulta pública de despesas (V9 N2): pessoa jurídica que
 * contrata ou é lançada com o município é identificável por CNPJ; pessoa física não.
 */
export function mascarar(documento: string): string {
  if (documento.length === 14) {
    return `${documento.slice(0, 2)}.${documento.slice(2, 5)}.${documento.slice(5, 8)}/${documento.slice(8, 12)}-${documento.slice(12)}`;
  }
  return `***.${documento.slice(3, 6)}.${documento.slice(6, 9)}-**`;
}
