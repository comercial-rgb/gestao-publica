import { toMoney, type Money } from "../../../packages/contracts/index.js";
import { somaLiquidaEstornaveis } from "../../../packages/estornaveis/index.js";
import type { PrismaClient } from "../../../prisma/generated/client/client.js";
// A soma do saldo de RP é do M08 — o dono dela. Zero segunda aritmética.
import { saldoDosRestos } from "../../m08-restos-a-pagar/restos.js";
import { TIP_OBRA_SERVICO, type TipoObraServicoRepo } from "../../m11-licitacoes/obras.js";
import {
  alfa,
  conferirN2,
  conferirN2Rp,
  conferirN3,
  contarPorTipo,
  data,
  indDebCred,
  numero,
  numeroFixo,
  serializarManad,
  sinalDoFato,
  valor,
  TIP_CRED_ADICIONAL,
  TIP_ORIG_RECURSO,
  type FatoAppendOnly,
  type LinhaManad,
  type Onde,
} from "./dominio.js";

/**
 * M14 — O GERADOR DO MANAD. LEITURA PURA (TR 7.36).
 *
 * IN MPS/SRP 12/2006 · leiaute v1.0.0.2 (COD_VER = 003) · mantido pela v1.0.0.3 /
 * ADE Cofis 44/2020.
 *
 * ═══ ZERO ESCRITA, ZERO ARITMÉTICA NOVA — E O TESTE RODA O GREP ═══
 * Como a MSC, o MANAD é DERIVADO dos fatos a cada geração. Nada é materializado: um
 * arquivo enviado à Receita tem de poder ser REPRODUZIDO amanhã, byte a byte, por quem
 * auditar. E toda soma vem do DONO do fato — `somaLiquidaEstornaveis` (packages), a MESMA
 * que a ficha, o contrato, o Anexo 12 e o relatório de restos usam.
 *
 * ═══ O ESCOPO É O EXERCÍCIO — e é o que COD_FIN=62 significa ═══
 * O bloco L é o "movimento anual do órgão público". `dtInicio`/`dtFim` DECLARAM o período
 * no registro 0000, e o gerador exige que os dois caiam no MESMO exercício: é ele que
 * define o conjunto de fatos.
 *
 * ⚠️ UMA JANELA SUB-ANUAL NÃO É SUPORTADA, e a razão é a N2. Se o arquivo levasse só os
 * fatos de, digamos, março, um empenho de fevereiro anulado em março entraria como um "C"
 * sem o seu "D" — e a confrontação com o empenhado líquido do M05 (que é do exercício
 * inteiro) deixaria de fazer sentido. Ou o recorte é o exercício, ou a identidade morre.
 * Está declarado; se a Receita pedir recorte menor, é decisão nova.
 *
 * ═══ BLOCO K: SÓ A ABERTURA ═══
 * O bloco K (folha de pagamento) depende da integração de FOLHA — o TR 7.10, que NÃO
 * existe neste repositório. Então ele sai como o manual manda para bloco sem dados:
 * `K001` com `IND_MOV = 1` ("sem dados") e o `K990`. Duas linhas, e nenhuma mentira.
 *
 * ═══ BLOCO I: NÃO SE APLICA ═══
 * É a escrituração contábil de pessoa jurídica de Direito PRIVADO. Um município não tem
 * bloco I — ele não sai nem vazio.
 */

/** O client OU uma transação dele. */
export type Leitor = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** COD_FIN (0000, campo 16). */
export type CodigoFinalidade =
  /** 61 — solicitação da AFPS via MPF. */
  | "61"
  /** 62 — movimento anual do órgão público. */
  | "62"
  /** 90 — dados internos da UF. */
  | "90";

export interface EntradaManad {
  readonly dtInicio: Date;
  readonly dtFim: Date;
  readonly codFinalidade: CodigoFinalidade;
}

/**
 * O FURO QUE SAI JUNTO COM O ARQUIVO — a "terceira via" do M14, a mesma da MSC.
 *
 * Um export que se RECUSA a existir porque falta um módulo deixa o ente sem entregar
 * nada, e o prazo não espera. Um export que OMITE em silêncio é pior. Aqui o arquivo SAI,
 * e o furo sai JUNTO, com nome e tamanho.
 */
export interface PendenciaManad {
  readonly registro: string;
  readonly motivo: string;
  /** Quantos fatos ficaram de fora (quando a pendência tem tamanho). */
  readonly quantidade?: number | undefined;
}

export interface ResultadoManad {
  readonly linhas: readonly LinhaManad[];
  /** Os bytes, já em ISO 8859-1. Ver `serializarManad`. */
  readonly arquivo: Buffer;
  readonly pendencias: readonly PendenciaManad[];
}

const onde = (registro: string, campo: string): Onde => ({ registro, campo });

/** Money a partir do Decimal do Prisma — a travessia da fronteira, por STRING. */
const m = (d: { toFixed(n: number): string }): Money => toMoney(d.toFixed(2));

// ═══════════════════════════════════════════════════════════════════════════
// O GERADOR
// ═══════════════════════════════════════════════════════════════════════════

export async function gerarManad(
  leitor: Leitor,
  entrada: EntradaManad
): Promise<ResultadoManad> {
  const exercicio = entrada.dtInicio.getUTCFullYear();
  if (entrada.dtFim.getUTCFullYear() !== exercicio) {
    throw new Error(
      `MANAD — DT_INI (${data(entrada.dtInicio)}) e DT_FIN (${data(entrada.dtFim)}) ` +
        `caem em EXERCÍCIOS DIFERENTES. O bloco L é o movimento anual de UM exercício ` +
        `(COD_FIN 62), e é o exercício que define o conjunto de fatos — ver a nota sobre ` +
        `a identidade N2 no topo deste arquivo.`
    );
  }
  if (entrada.dtFim < entrada.dtInicio) {
    throw new Error(
      `MANAD — período invertido: DT_INI ${data(entrada.dtInicio)} depois de DT_FIN ` +
        `${data(entrada.dtFim)}.`
    );
  }

  const pendencias: PendenciaManad[] = [];

  const linhas: LinhaManad[] = [
    ...(await bloco0(leitor, entrada, exercicio)),
    ...blocoK(),
  ];

  const l = await blocoL(leitor, entrada, exercicio, pendencias);
  linhas.push(...l);

  linhas.push(...bloco9(linhas));

  return {
    linhas,
    arquivo: serializarManad(linhas),
    pendencias,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCO 0 — abertura, contabilista, empresa geradora
// ═══════════════════════════════════════════════════════════════════════════

async function bloco0(
  leitor: Leitor,
  entrada: EntradaManad,
  exercicio: number
): Promise<readonly LinhaManad[]> {
  const ente = await leitor.enteConfig.findUnique({ where: { id: "unico" } });
  if (ente === null) {
    throw new Error(
      `MANAD — a configuração do ente NÃO está semeada (EnteConfig "unico"). O CNPJ, a ` +
        `UF e o código IBGE entram no registro 0000: sem eles o arquivo iria à Receita em ` +
        `nome de ninguém.`
    );
  }
  // FAIL-CLOSED nos campos que o MANAD exige e a MSC não usava.
  const faltando = (
    [
      ["cnpj", ente.cnpj],
      ["uf", ente.uf],
      ["indCentralizacao", ente.indCentralizacao],
    ] as const
  )
    .filter(([, v]) => v === null || v === "")
    .map(([k]) => k);
  if (faltando.length > 0) {
    throw new Error(
      `MANAD — o EnteConfig não tem os campos do registro 0000: ` +
        `${faltando.join(", ")}. Eles entraram como ADITIVO (nullable) para não quebrar a ` +
        `MSC, que não os usa — mas o MANAD não sai sem eles. Semeie-os, com quem conferiu.`
    );
  }

  const linhas: LinhaManad[] = [];

  // ── REGISTRO 0000 ─────────────────────────────────────────────────────────
  // 01|REG "0000"|C|004      02|NOME empresarial|C|-       03|CNPJ|N|014
  // 04|CPF|N|011             05|CEI|N|012                  06|NIT|N|011
  // 07|UF|C|002              08|IE|C|-                     09|COD_MUN (IBGE)|N|007
  // 10|IM|C|-                11|SUFRAMA|C|009              12|IND_CENTR|-|001
  // 13|DT_INI|N|008          14|DT_FIN|N|008               15|COD_VER|N|003
  // 16|COD_FIN|N|002         17|IND_ED|N|001
  linhas.push({
    reg: "0000",
    campos: [
      alfa(ente.nome, onde("0000", "NOME")),
      numeroFixo(ente.cnpj, 14, onde("0000", "CNPJ")),
      numeroFixo(ente.cpf, 11, onde("0000", "CPF")),
      numeroFixo(ente.cei, 12, onde("0000", "CEI")),
      numeroFixo(ente.nit, 11, onde("0000", "NIT")),
      alfa(ente.uf, onde("0000", "UF")),
      alfa(ente.inscricaoEstadual, onde("0000", "IE")),
      numeroFixo(ente.codigoIbge, 7, onde("0000", "COD_MUN")),
      alfa(ente.inscricaoMunicipal, onde("0000", "IM")),
      // SUFRAMA: vazio fora da Zona Franca — 3.1.9.
      alfa(ente.suframa, onde("0000", "SUFRAMA")),
      numero(ente.indCentralizacao, onde("0000", "IND_CENTR")),
      data(entrada.dtInicio),
      data(entrada.dtFim),
      // COD_VER = 003 -> a v1.0.0.2 da IN MPS/SRP 12/2006. NÃO é a versão do nosso
      // software: é a versão do LEIAUTE que este arquivo obedece.
      "003",
      entrada.codFinalidade,
      // IND_ED = 2 -> "validação de arquivo gerado por sistema". É o que somos: o
      // arquivo não foi digitado (0) nem importado de planilha (1).
      "2",
    ],
  });

  // ── REGISTRO 0001 ── 01|REG|C|004  02|IND_MOV 0-com dados/1-sem|N|001
  linhas.push({ reg: "0001", campos: ["0"] });

  // ── REGISTRO 0050 (contabilista; vários) ──────────────────────────────────
  // 01|REG  02|NOME  03|CNPJ escritório  04|CPF  05|CRC  06|DT_INI  07|DT_FIN
  // 08|END  09|NUM  10|COMPL  11|BAIRRO  12|CEP  13|UF  14|CP  15|CEP_CP
  // 16|FONE  17|FAX  18|EMAIL
  const contabilistas = await leitor.manadContabilista.findMany({
    orderBy: { dtInicio: "asc" },
  });
  if (contabilistas.length === 0) {
    throw new Error(
      `MANAD — nenhum CONTABILISTA cadastrado (registro 0050). O arquivo vai à Receita ` +
        `com o CRC de um responsável — não existe MANAD anônimo. Cadastre em ` +
        `ManadContabilista, com o período de responsabilidade.`
    );
  }
  for (const c of contabilistas) {
    linhas.push({
      reg: "0050",
      campos: [
        alfa(c.nome, onde("0050", "NOME")),
        numeroFixo(c.cnpjEscritorio, 14, onde("0050", "CNPJ")),
        numeroFixo(c.cpf, 11, onde("0050", "CPF")),
        alfa(c.crc, onde("0050", "CRC")),
        data(c.dtInicio),
        data(c.dtFim),
        alfa(c.endereco, onde("0050", "END")),
        alfa(c.numero, onde("0050", "NUM")),
        alfa(c.complemento, onde("0050", "COMPL")),
        alfa(c.bairro, onde("0050", "BAIRRO")),
        numeroFixo(c.cep, 8, onde("0050", "CEP")),
        alfa(c.uf, onde("0050", "UF")),
        numero(c.caixaPostal, onde("0050", "CP")),
        numeroFixo(c.cepCaixaPostal, 8, onde("0050", "CEP_CP")),
        alfa(c.fone, onde("0050", "FONE")),
        alfa(c.fax, onde("0050", "FAX")),
        alfa(c.email, onde("0050", "EMAIL")),
      ],
    });
  }

  // ── REGISTRO 0100 (empresa/técnico gerador; vários) ───────────────────────
  // 01|REG  02|EMP_TEC  03|CARGO  04|DT_INI_SERV_INF  05|DT_FIM_SERV_INF
  // 06|CNPJ  07|CPF  08|FONE  09|FAX  10|EMAIL
  const geradoras = await leitor.manadEmpresaGeradora.findMany({
    orderBy: { dtInicioServico: "asc" },
  });
  if (geradoras.length === 0) {
    throw new Error(
      `MANAD — nenhuma EMPRESA/TÉCNICO gerador cadastrado (registro 0100). Cadastre em ` +
        `ManadEmpresaGeradora.`
    );
  }
  for (const g of geradoras) {
    linhas.push({
      reg: "0100",
      campos: [
        alfa(g.empresaOuTecnico, onde("0100", "EMP_TEC")),
        alfa(g.cargo, onde("0100", "CARGO")),
        data(g.dtInicioServico),
        data(g.dtFimServico),
        numeroFixo(g.cnpj, 14, onde("0100", "CNPJ")),
        numeroFixo(g.cpf, 11, onde("0100", "CPF")),
        alfa(g.fone, onde("0100", "FONE")),
        alfa(g.fax, onde("0100", "FAX")),
        alfa(g.email, onde("0100", "EMAIL")),
      ],
    });
  }

  // ── REGISTRO 0990 ── QTD_LIN_0: TUDO entre o primeiro 0000 e o 0990, INCLUSIVE.
  // O "+1" é o próprio 0990 — e é o "inclusive" do manual que se erra.
  linhas.push({ reg: "0990", campos: [String(linhas.length + 1)] });

  void exercicio;
  return linhas;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCO K — só a abertura. Ver a nota no topo.
// ═══════════════════════════════════════════════════════════════════════════

function blocoK(): readonly LinhaManad[] {
  // K001 IND_MOV = 1 -> "SEM dados". A folha de pagamento é o TR 7.10, que não existe
  // neste repositório. Declarar 0 ("com dados") e não emitir registro nenhum seria
  // mentir para a Receita sobre o que o arquivo contém.
  const linhas: LinhaManad[] = [{ reg: "K001", campos: ["1"] }];
  // K990 conta de K001 a K990, inclusive -> 2.
  linhas.push({ reg: "K990", campos: [String(linhas.length + 1)] });
  return linhas;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCO L — o orçamento público
// ═══════════════════════════════════════════════════════════════════════════

/** A classificação de uma ficha — a fonte dos códigos do L050 e do L250. */
const FICHA_CLASSIF = {
  select: {
    id: true,
    exercicio: true,
    numero: true,
    valorDotado: true,
    orgao: { select: { codigo: true, nome: true } },
    unidadeOrc: {
      select: {
        codigo: true,
        descricao: true,
        tipoManad: true,
        cnpjManad: true,
      },
    },
    funcao: { select: { codigo: true, nome: true } },
    subfuncao: { select: { codigo: true, nome: true } },
    programa: { select: { codigo: true, descricao: true } },
    acao: { select: { codigo: true, descricao: true, tipoManad: true } },
    naturezaDespesa: {
      select: {
        codigoCompleto: true,
        descricao: true,
        indTipoContaManad: true,
        nivelContaManad: true,
      },
    },
    fonte: { select: { codigo: true } },
  },
} as const;

type FichaLida = {
  id: string;
  exercicio: number;
  numero: number;
  valorDotado: { toFixed(n: number): string };
  orgao: { codigo: string; nome: string };
  unidadeOrc: {
    codigo: string;
    descricao: string;
    tipoManad: string | null;
    cnpjManad: string | null;
  };
  funcao: { codigo: string; nome: string };
  subfuncao: { codigo: string; nome: string };
  programa: { codigo: string; descricao: string };
  acao: { codigo: string; descricao: string; tipoManad: string | null };
  naturezaDespesa: {
    codigoCompleto: string;
    descricao: string;
    indTipoContaManad: string | null;
    nivelContaManad: number | null;
  };
  fonte: { codigo: string };
};

/**
 * ⚠️ NM_EMP / NM_LIQUID / NM_PGTO — O NÚMERO COMPOSTO, E POR QUE ELE PRECISOU SER.
 *
 * O `numero` do empenho no repositório é único **por ficha** (`@@unique([fichaId,
 * numero])`), não no ente: duas fichas podem ter, ambas, o "NE-1". O MANAD usa o NM_EMP
 * como a CHAVE que costura o L050 ao L100 e ao L150 — se ele repetir, a Receita junta o
 * empenho de uma ficha com a liquidação de outra.
 *
 * Então ele sai COMPOSTO — número + a identificação do pai —, e o MESMO nos três
 * registros. É a decisão do passo 0(a), e ela é de BORDA: nada no banco muda.
 *
 * ⚠️ PENDÊNCIA NOMEADA: o certo seria numeração institucional sequencial por exercício
 * (o que o TCE e a Receita esperam ver: "2026NE00001"). O repositório não a tem — o
 * `numero` é livre, informado pelo chamador. Quando ela existir, esta função vira a
 * identidade e o resto do arquivo não muda uma vírgula.
 */
function nmEmp(ficha: { exercicio: number; numero: number }, numeroEmpenho: string): string {
  return `${numeroEmpenho}/${ficha.exercicio}.${ficha.numero}`;
}

/** O empenho ORIGINÁRIO de um movimento — subindo a cadeia de estornos/parciais. */
function raizDo<T extends FatoAppendOnly>(f: T, porId: ReadonlyMap<string, T>): T {
  const alvoId = f.estornoDeId ?? f.anulacaoParcialDeId ?? null;
  if (alvoId === null) return f;
  const alvo = porId.get(alvoId);
  return alvo === undefined ? f : raizDo(alvo, porId);
}

async function blocoL(
  leitor: Leitor,
  entrada: EntradaManad,
  exercicio: number,
  pendencias: PendenciaManad[]
): Promise<readonly LinhaManad[]> {
  const linhas: LinhaManad[] = [];

  // ── L001 ── com dados.
  linhas.push({ reg: "L001", campos: ["0"] });

  // ═══ AS FICHAS DO EXERCÍCIO — a espinha do bloco ═══
  const fichas = (await leitor.fichaOrcamentaria.findMany({
    where: { exercicio },
    ...FICHA_CLASSIF,
    orderBy: { numero: "asc" },
  })) as unknown as FichaLida[];

  const fichaPorId = new Map(fichas.map((f) => [f.id, f]));

  // ═══ OS EMPENHOS ═══
  //
  // ⚠️ E OS DE RESTOS A PAGAR ENTRAM JUNTO (orientação (b) do manual): um RP que ainda
  // tem saldo, ou que se moveu no período, traz o seu EMPENHO DE ORIGEM ao L050 — pelo
  // VALOR ORIGINAL. Sem ele, a liquidação/pagamento de RP que sai no L100/L150 apontaria
  // para um NM_EMP que não existe no arquivo.
  const empenhosDoExercicio = await leitor.empenho.findMany({
    where: { ficha: { exercicio } },
    select: EMPENHO_SELECT,
    orderBy: { data: "asc" },
  });

  // ⚠️ O RP QUE INTERESSA A ESTE EXERCÍCIO: o que TEM SALDO ou o que SE MOVEU no período.
  //
  // ⚠️ E O CORTE DO "SE MOVEU" É A DATA DO **FATO**, NÃO O `criadoEm`. O
  // `MovimentoRestosAPagar` não tem coluna de data própria — só `criadoEm`, que é o
  // instante da DIGITAÇÃO. Cortar por ele poria o pagamento de um RP feito em fevereiro e
  // digitado em março no arquivo errado. Quem TEM a data do fato é o `Pagamento` (e a
  // `Liquidacao`) que o M08 grava — e é por eles que perguntamos.
  const inscricoes = await leitor.inscricaoRestosAPagar.findMany({
    where: { exercicioOrigem: { lt: exercicio } },
    select: { id: true, empenhoId: true },
  });

  const empenhosDeRpIds = new Set<string>();
  for (const i of inscricoes) {
    // ⚠️ O SALDO DO RP É DO M08 — `saldoDosRestos`, a mesma soma que o relatório de restos
    // e o Anexo 12 usam. Recalculá-lo aqui (inscrito − pagos + estornos − cancelamentos…)
    // seria a segunda verdade sobre o saldo de RP, e ela divergiria no primeiro estorno.
    const s = await saldoDosRestos(leitor as PrismaClient, i.id);
    if (!s.saldo.isZero()) empenhosDeRpIds.add(i.empenhoId);
  }

  // ...e os que se MOVERAM no período (pela data do FATO), mesmo já zerados.
  const movidosNoPeriodo = await leitor.pagamento.findMany({
    where: {
      data: { gte: entrada.dtInicio, lte: entrada.dtFim },
      liquidacao: { empenho: { ficha: { exercicio: { lt: exercicio } } } },
    },
    select: { liquidacao: { select: { empenhoId: true } } },
  });
  for (const p of movidosNoPeriodo) empenhosDeRpIds.add(p.liquidacao.empenhoId);

  const liquidadosNoPeriodo = await leitor.liquidacao.findMany({
    where: {
      data: { gte: entrada.dtInicio, lte: entrada.dtFim },
      empenho: { ficha: { exercicio: { lt: exercicio } } },
    },
    select: { empenhoId: true },
  });
  for (const l of liquidadosNoPeriodo) empenhosDeRpIds.add(l.empenhoId);

  const empenhosDeRp =
    empenhosDeRpIds.size === 0
      ? []
      : await leitor.empenho.findMany({
          where: { id: { in: [...empenhosDeRpIds] } },
          select: EMPENHO_SELECT,
        });

  // As fichas dos empenhos de RP são de OUTRO exercício — precisamos delas para os códigos.
  const fichasDeRpIds = [
    ...new Set(empenhosDeRp.map((e) => e.fichaId).filter((id) => !fichaPorId.has(id))),
  ];
  if (fichasDeRpIds.length > 0) {
    const extras = (await leitor.fichaOrcamentaria.findMany({
      where: { id: { in: fichasDeRpIds } },
      ...FICHA_CLASSIF,
    })) as unknown as FichaLida[];
    for (const f of extras) fichaPorId.set(f.id, f);
  }

  const todosEmpenhos = [
    ...empenhosDoExercicio,
    ...empenhosDeRp.filter(
      (e) => !empenhosDoExercicio.some((x) => x.id === e.id)
    ),
  ];
  const empenhoPorId = new Map(todosEmpenhos.map((e) => [e.id, e]));

  // ═══ L050 ═══
  const l050: {
    fichaId: string;
    valor: Money;
    indDebCred: "D" | "C";
  }[] = [];

  for (const e of todosEmpenhos) {
    const ficha = fichaPorId.get(e.fichaId);
    if (ficha === undefined) {
      throw new Error(`MANAD — empenho ${e.id} sem ficha legível. Base quebrada.`);
    }
    exigirClassificacao(ficha);

    // ⚠️ O NM_EMP DE UMA ANULAÇÃO É O DO EMPENHO QUE ELA ANULA. É o que faz o D e o C
    // se encontrarem no arquivo: a Receita soma os movimentos POR NM_EMP, e a diferença
    // é o saldo do empenho. Dar um NM_EMP próprio à anulação criaria um "empenho
    // negativo" solto, que não anula coisa nenhuma.
    const raiz = raizDo(e, empenhoPorId);
    const raizFicha = fichaPorId.get(raiz.fichaId) ?? ficha;
    const nome = nmEmp(raizFicha, raiz.numero);
    const dc = indDebCred(e, empenhoPorId);

    linhas.push({
      reg: "L050",
      campos: [
        // 02|COD_ORG  03|COD_UN_ORC  04|COD_FUN  05|COD_SUBFUN  06|COD_PROGR
        numero(ficha.orgao.codigo, onde("L050", "COD_ORG")),
        numero(ficha.unidadeOrc.codigo, onde("L050", "COD_UN_ORC")),
        numero(ficha.funcao.codigo, onde("L050", "COD_FUN")),
        numero(ficha.subfuncao.codigo, onde("L050", "COD_SUBFUN")),
        numero(ficha.programa.codigo, onde("L050", "COD_PROGR")),
        // 07|COD_SUBPROGR — ⚠️ VAZIO, E É DOUTRINA, NÃO OMISSÃO. A Portaria STN 42/1999
        // EXTINGUIU o subprograma; ele não existe na classificação brasileira desde
        // então. É o caso literal do item 3.1.9 ("campo não aplicável = vazio").
        "",
        // 08|COD_PROJ_ATIV_OE — "codificação própria" (o manual não a fixa): a AÇÃO.
        numero(ficha.acao.codigo, onde("L050", "COD_PROJ_ATIV_OE")),
        // 09|COD_CTA_DESP — a rubrica: a natureza da despesa (6 dígitos).
        numero(ficha.naturezaDespesa.codigoCompleto, onde("L050", "COD_CTA_DESP")),
        // 10|COD_REC_VINC — a fonte de recurso.
        numero(ficha.fonte.codigo, onde("L050", "COD_REC_VINC")),
        // 11|COD_CONT_REC — conta corrente do recurso vinculado. Não modelada.
        "",
        alfa(nome, onde("L050", "NM_EMP")),
        data(e.data),
        valor(m(e.valor)),
        dc,
        // ⚠️ O CREDOR VEM DA **RAIZ**, E ISSO NÃO É ELEGÂNCIA — É CORREÇÃO.
        // A linha de ANULAÇÃO PARCIAL do M05 grava `credorCpfCnpj = "ANULACAO_PARCIAL"`
        // (um SENTINELA, não um documento — ver o `anularEmpenhoParcial` no adapter).
        // Copiá-lo para o arquivo poria a string "ANULACAO_PARCIAL" no COD_CREDOR e um
        // "credor" de zero dígitos no L750. O credor de uma anulação é, por definição, o
        // credor DAQUILO QUE ELA ANULA.
        alfa(raiz.credorCpfCnpj, onde("L050", "COD_CREDOR")),
        alfa(e.historico, onde("L050", "HIST_EMP")),
      ],
    });

    l050.push({ fichaId: e.fichaId, valor: m(e.valor), indDebCred: dc });
  }

  // ═══ OS CANCELAMENTOS DE RP — REGISTROS "C" NO L050 ═══
  //
  // ⚠️ É A ORIENTAÇÃO (c) DO MANUAL, LITERAL: o IND_DEB_CRED do L050 é
  // "D-empenho originário e crédito adicional / **C-anulação, cancelamento**". O manual
  // nomeia "cancelamento" — e o cancelamento de RP é exatamente isso: a obrigação
  // empenhada que deixa de existir.
  //
  // ⚠️ A DATA É A DO **FATO**, E ELA EXISTE — ao contrário do que cae5f45 concluiu. O
  // `MovimentoRestosAPagar` não tem COLUNA de data, mas o `cancelarRestosAPagar` recebe
  // `data` e a grava na `dataTransacao` do lançamento (1-1). É o MESMO caminho que já dava
  // o HIST_LIQUID. Zero coluna, zero migração — o dado sempre esteve lá.
  //
  // ⚠️ E O NM_EMP É O DA RAIZ. O cancelamento não é um empenho novo: ele REDUZ o empenho
  // de origem, e é por NM_EMP que a Receita soma o D contra o C.
  const cancelamentos = await leitor.movimentoRestosAPagar.findMany({
    where: {
      tipo: "CANCELAMENTO",
      lancamento: {
        dataTransacao: { gte: entrada.dtInicio, lte: entrada.dtFim },
      },
    },
    select: {
      id: true,
      valor: true,
      motivo: true,
      estornoDeId: true,
      lancamento: { select: { dataTransacao: true, historico: true } },
      inscricao: { select: { empenhoId: true } },
    },
  });

  /** Σ dos cancelamentos VIVOS por empenho — o "C" que o arquivo emite. */
  const canceladoPorEmpenho = new Map<string, Money>();

  for (const c of cancelamentos) {
    // ⚠️ O CANCELAMENTO ESTORNADO NÃO SAI. Um `ESTORNO_CANCELAMENTO` devolve o saldo à
    // inscrição — a obrigação voltou a existir. Emitir o "C" dele seria declarar à Receita
    // uma extinção que foi desfeita. (O estorno tem `estornoDeId`; o cancelado LÍQUIDO do
    // M08, que a N2-RP confronta, já o desconta — e é por isso que os dois lados batem.)
    if (c.estornoDeId !== null) continue;
    const estornado = cancelamentos.some((x) => x.estornoDeId === c.id);
    if (estornado) continue;

    const e = empenhoPorId.get(c.inscricao.empenhoId);
    if (e === undefined) continue; // o empenho não entrou no arquivo — nada a reduzir

    // ⚠️ FAIL-CLOSED. O `lancamentoId` do movimento é NULLABLE no schema, e é o lançamento
    // que carrega a DATA DO FATO do cancelamento. Sem ele não há data — e um registro do
    // MANAD sem data é uma linha que a Receita não sabe em que exercício pôr. Não se chuta
    // `criadoEm` (a digitação): seria o furo que este bloco veio fechar.
    if (c.lancamento === null) {
      throw new Error(
        `MANAD — o cancelamento de RP ${c.id} não tem lançamento contábil, e é dele que ` +
          `sai a DATA DO FATO (o MovimentoRestosAPagar não tem coluna de data). Sem ela, ` +
          `o registro L050 "C" sairia sem DT_EMP — ou, pior, com o \`criadoEm\` (a data da ` +
          `DIGITAÇÃO), que poria o cancelamento no exercício errado.`
      );
    }

    const ficha = fichaPorId.get(e.fichaId)!;
    const raiz = raizDo(e, empenhoPorId);
    const raizFicha = fichaPorId.get(raiz.fichaId) ?? ficha;
    const valorCancelado = m(c.valor);

    linhas.push({
      reg: "L050",
      campos: [
        numero(ficha.orgao.codigo, onde("L050", "COD_ORG")),
        numero(ficha.unidadeOrc.codigo, onde("L050", "COD_UN_ORC")),
        numero(ficha.funcao.codigo, onde("L050", "COD_FUN")),
        numero(ficha.subfuncao.codigo, onde("L050", "COD_SUBFUN")),
        numero(ficha.programa.codigo, onde("L050", "COD_PROGR")),
        "", // COD_SUBPROGR — extinto pela Portaria 42/1999
        numero(ficha.acao.codigo, onde("L050", "COD_PROJ_ATIV_OE")),
        numero(ficha.naturezaDespesa.codigoCompleto, onde("L050", "COD_CTA_DESP")),
        numero(ficha.fonte.codigo, onde("L050", "COD_REC_VINC")),
        "", // COD_CONT_REC
        alfa(nmEmp(raizFicha, raiz.numero), onde("L050", "NM_EMP")),
        // A data do FATO do cancelamento — não a do empenho, nem a da digitação.
        data(c.lancamento.dataTransacao),
        valor(valorCancelado),
        "C",
        alfa(raiz.credorCpfCnpj, onde("L050", "COD_CREDOR")),
        alfa(c.lancamento.historico, onde("L050", "HIST_EMP")),
      ],
    });

    l050.push({
      fichaId: e.fichaId,
      valor: valorCancelado,
      indDebCred: "C",
    });
    canceladoPorEmpenho.set(
      e.id,
      toMoney((canceladoPorEmpenho.get(e.id) ?? toMoney("0.00")).plus(valorCancelado))
    );
  }

  pendencias.push({
    registro: "L050",
    motivo:
      "COD_CONT_REC (conta corrente do recurso vinculado) sai VAZIO: o repositório não " +
      "modela conta corrente por recurso vinculado. Se a Receita a exigir, é dado novo.",
  });

  // ═══ L100 — LIQUIDAÇÕES ═══
  //
  // ⚠️ AS DE RESTOS A PAGAR JÁ ESTÃO AQUI, DE GRAÇA. O `liquidarRestosAPagar` (M08) cria
  // uma `Liquidacao` de verdade, pendurada no empenho de origem — não uma tabela paralela.
  // Então a leitura abaixo as pega sem saber que são RP, e o NM_EMP delas já aponta para
  // o empenho que o L050 emitiu. É o desenho do M08 pagando dividendo.
  const liquidacoes = await leitor.liquidacao.findMany({
    // ⚠️ CORTE PELA DATA DO FATO. Sem ele, a liquidação de 2026 de um empenho que virou RP
    // reapareceria no arquivo de 2027 (o empenho está lá pela orientação (b)) — e o mesmo
    // fato seria declarado à Receita em DOIS exercícios.
    where: {
      empenhoId: { in: [...empenhoPorId.keys()] },
      data: { gte: entrada.dtInicio, lte: entrada.dtFim },
    },
    select: {
      id: true,
      empenhoId: true,
      numero: true,
      valor: true,
      data: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      lancamento: { select: { historico: true } },
    },
    orderBy: { data: "asc" },
  });
  // ⚠️ MAS O ÍNDICE PRECISA DE **TODAS** ELAS. Um pagamento de RP em 2027 aponta para uma
  // liquidação de 2026 — que NÃO sai no L100 de 2027 (o corte acima), mas cujo número é
  // necessário para montar o NM_PGTO. O que se recorta é o que SAI; não o que se LÊ.
  const todasLiquidacoes = await leitor.liquidacao.findMany({
    where: { empenhoId: { in: [...empenhoPorId.keys()] } },
    select: {
      id: true,
      empenhoId: true,
      numero: true,
      valor: true,
      data: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      lancamento: { select: { historico: true } },
    },
  });
  const liqPorId = new Map(todasLiquidacoes.map((x) => [x.id, x]));

  for (const liq of liquidacoes) {
    const e = empenhoPorId.get(liq.empenhoId)!;
    const raiz = raizDo(e, empenhoPorId);
    const raizFicha = fichaPorId.get(raiz.fichaId)!;
    const raizLiq = raizDo(liq, liqPorId);

    linhas.push({
      reg: "L100",
      campos: [
        // 02|NM_EMP  03|NM_LIQUID  04|DT_LIQUID  05|VL_LIQUID  06|IND_DEB_CRED  07|HIST
        alfa(nmEmp(raizFicha, raiz.numero), onde("L100", "NM_EMP")),
        alfa(nmEmp(raizFicha, `${raiz.numero}-${raizLiq.numero}`), onde("L100", "NM_LIQUID")),
        data(liq.data),
        valor(m(liq.valor)),
        indDebCred(liq, liqPorId),
        // ⚠️ O HISTÓRICO DA LIQUIDAÇÃO VIVE NO LANÇAMENTO. A `Liquidacao` não tem coluna
        // `historico` — o `liquidar()` o grava no `LancamentoContabil` (1-1). É o MESMO
        // vínculo que dá as contas do L150: um caminho, dois campos.
        alfa(liq.lancamento.historico, onde("L100", "HIST_LIQUID")),
      ],
    });
  }

  // ═══ L150 — PAGAMENTOS ═══
  const pagamentos = await leitor.pagamento.findMany({
    // Idem: a data do FATO recorta o arquivo.
    where: {
      liquidacao: { empenhoId: { in: [...empenhoPorId.keys()] } },
      data: { gte: entrada.dtInicio, lte: entrada.dtFim },
    },
    select: {
      id: true,
      numero: true,
      valor: true,
      data: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      liquidacaoId: true,
      lancamento: {
        select: {
          historico: true,
          partidas: {
            select: {
              tipo: true,
              subsistema: true,
              conta: { select: { codigo: true } },
            },
          },
        },
      },
    },
    orderBy: { data: "asc" },
  });
  const pagPorId = new Map(pagamentos.map((x) => [x.id, x]));

  for (const p of pagamentos) {
    const liq = liqPorId.get(p.liquidacaoId)!;
    const e = empenhoPorId.get(liq.empenhoId)!;
    const raizE = raizDo(e, empenhoPorId);
    const raizFicha = fichaPorId.get(raizE.fichaId)!;
    const raizLiq = raizDo(liq, liqPorId);
    const raizPag = raizDo(p, pagPorId);
    const ficha = fichaPorId.get(e.fichaId)!;

    const contas = contasDoPagamento(p.id, p.lancamento.partidas);
    const orgUn = `${ficha.orgao.codigo}${ficha.unidadeOrc.codigo}`;

    linhas.push({
      reg: "L150",
      campos: [
        alfa(nmEmp(raizFicha, raizE.numero), onde("L150", "NM_EMP")),
        alfa(
          nmEmp(raizFicha, `${raizE.numero}-${raizLiq.numero}-${raizPag.numero}`),
          onde("L150", "NM_PGTO")
        ),
        data(p.data),
        valor(m(p.valor)),
        indDebCred(p, pagPorId),
        alfa(p.lancamento.historico, onde("L150", "HIST_PGTO")),
        numero(contas.debito, onde("L150", "CTA_DEBITO")),
        numero(orgUn, onde("L150", "COD_ORG_UN_DEB")),
        numero(contas.credito, onde("L150", "CTA_CREDITO")),
        numero(orgUn, onde("L150", "COD_ORG_UN_CRE")),
      ],
    });
  }

  // ═══ L200 — BALANCETE DA RECEITA (Anexo 10) ═══
  linhas.push(...(await l200(leitor, exercicio)));

  // ═══ L250 — BALANCETE DA DESPESA ═══
  const balancetes = await l250(leitor, entrada, exercicio, fichas, pendencias);
  linhas.push(...balancetes.linhas);

  // ═══ L300 — ALTERAÇÕES DA LOA ═══
  linhas.push(...(await l300(leitor, entrada)));

  // ═══ L350..L700 — os cadastros REFERENCIADOS (não o cadastro inteiro) ═══
  linhas.push(...cadastros(exercicio, fichas));

  // ═══ L750 — FORNECEDORES ═══
  //
  // ⚠️ SÓ AS RAÍZES. Uma linha de anulação parcial traz o sentinela "ANULACAO_PARCIAL" no
  // `credorCpfCnpj` — ela não é um credor, e listá-la aqui criaria um "fornecedor" com
  // zero dígitos no arquivo da Receita.
  const raizes = todosEmpenhos.filter(
    (e) => e.estornoDeId === null && e.anulacaoParcialDeId === null
  );
  linhas.push(...(await l750(leitor, exercicio, raizes, pendencias)));

  // ═══ L800 — OBRAS E SERVIÇOS SUJEITOS À RETENÇÃO (TR 4.50) ═══
  //
  // ⚠️ É O REGISTRO QUE A AFPS VEM PROCURAR NO MANAD. Até cae5f45 ele saía VAZIO — não
  // havia cadastro de obras. Agora sai dos FATOS: todo empenho com obra vinculada.
  //
  // ⚠️ SÓ AS RAÍZES. Uma anulação copia o `obraId` do original (para que a soma por obra
  // veja a redução), mas ela NÃO é um novo empenho de obra: emiti-la aqui duplicaria o
  // NM_EMP no L800, e a Receita veria a mesma obra empenhada duas vezes.
  linhas.push(...l800(exercicio, raizes, fichaPorId, empenhoPorId, pendencias));

  // ── L990 ── QTD_LIN_L: de L001 a L990, inclusive.
  linhas.push({ reg: "L990", campos: [String(linhas.length + 1)] });

  // ═══ AS IDENTIDADES RODAM AQUI, ANTES DE O ARQUIVO EXISTIR ═══
  //
  // ⚠️ A N2 É **COMPOSTA**: o cancelamento de RP entra no L050 como "C", e ele NÃO é um
  // `Empenho` — o `somaLiquidaEstornaveis` do M05 não o vê. O lado direito vai buscá-lo no
  // dono (o M08). Ver a nota no domínio: a cura de emitir o cancelamento não foi afrouxar
  // a identidade, foi COMPÔ-LA — agora ela amarra dois módulos em vez de um.
  const dosDonos = fichas.map((f) => ({
    fichaId: f.id,
    liquido: somaLiquidaEstornaveis(
      todosEmpenhos
        .filter((e) => e.fichaId === f.id)
        .map((e) => ({
          id: e.id,
          valor: m(e.valor),
          estornoDeId: e.estornoDeId,
          anulacaoParcialDeId: e.anulacaoParcialDeId,
        }))
    ),
    canceladoRp: todosEmpenhos
      .filter((e) => e.fichaId === f.id)
      .reduce(
        (acc, e) => toMoney(acc.plus(canceladoPorEmpenho.get(e.id) ?? toMoney("0.00"))),
        toMoney("0.00")
      ),
  }));
  conferirN2(
    l050.filter((r) => fichaPorId.get(r.fichaId)?.exercicio === exercicio),
    dosDonos
  );
  conferirN3(balancetes.paraN3, l050);

  // ═══ N2-RP — as sub-identidades do RP carregado (orientação (b)) ═══
  //
  // O RP atravessa exercícios, e a N2 principal (por ficha do exercício CORRENTE) não o
  // alcança: a ficha dele é de outro ano. Sem estas duas, o RP carregado seria a única
  // parte do arquivo sem confrontação — justamente onde o erro é mais caro.
  const doRp: Parameters<typeof conferirN2Rp>[0][number][] = [];
  for (const e of empenhosDeRp) {
    if (empenhoPorId.get(e.id) === undefined) continue;
    const raizFicha = fichaPorId.get(e.fichaId)!;
    // O "D" e os "C" que o ARQUIVO emitiu para este empenho.
    const debito = l050
      .filter((r) => r.fichaId === e.fichaId && r.indDebCred === "D")
      .reduce((a, r) => toMoney(a.plus(r.valor)), toMoney("0.00"));

    // O CANCELADO do M08, no corte — pelo dono, nunca recalculado aqui.
    const canceladoDoM08 = canceladoPorEmpenho.get(e.id) ?? toMoney("0.00");

    doRp.push({
      empenhoId: e.id,
      nmEmp: nmEmp(raizFicha, e.numero),
      debitoNoArquivo: debito,
      valorOriginal: m(e.valor),
      creditosNoArquivo: canceladoDoM08,
      canceladoDoM08,
    });
  }
  conferirN2Rp(doRp);

  return linhas;
}

// ───────────────────────────────────────────────────────────────────────────
// L800 — obras e serviços sujeitos à retenção previdenciária
// ───────────────────────────────────────────────────────────────────────────

function l800(
  exercicio: number,
  raizes: readonly EmpenhoLido[],
  fichaPorId: ReadonlyMap<string, FichaLida>,
  empenhoPorId: ReadonlyMap<string, EmpenhoLido>,
  pendencias: PendenciaManad[]
): readonly LinhaManad[] {
  const comObra = raizes.filter((e) => e.obra !== null);
  if (comObra.length === 0) return [];

  const semCei = comObra.filter((e) => e.obra!.cei === null);
  if (semCei.length > 0) {
    // ⚠️ PENDÊNCIA VIVA, NÃO ERRO. Uma obra existe ANTES da matrícula (o CEI se abre na
    // Receita, e isso leva dias). Derrubar a geração obrigaria o ente a INVENTAR um CEI
    // para conseguir entregar o arquivo — e um CEI inventado é infinitamente pior que um
    // campo vazio. A linha SAI (com o CEI em branco, item 3.1.9) e o furo sai JUNTO.
    pendencias.push({
      registro: "L800",
      quantidade: new Set(semCei.map((e) => e.obra!.identificador)).size,
      motivo:
        "Obra(s) SEM matrícula CEI: " +
        [...new Set(semCei.map((e) => e.obra!.identificador))].join(", ") +
        ". O campo sai VAZIO (3.1.9) e a linha SAI mesmo assim — uma obra existe antes " +
        "da matrícula, e derrubar a geração obrigaria o ente a INVENTAR um CEI. ⚠️ Mas a " +
        "Receita usa o CEI para amarrar a retenção previdenciária à obra: sem ele, a " +
        "linha vai incompleta. Abra a matrícula e cadastre.",
    });
  }

  return comObra.map((e) => {
    const raiz = raizDo(e, empenhoPorId);
    const raizFicha = fichaPorId.get(raiz.fichaId)!;
    const ficha = fichaPorId.get(e.fichaId)!;
    const obra = e.obra!;

    return {
      reg: "L800",
      campos: [
        // 02|EXERCICIO  03|COD_CTA_DESP  04|COD_FORNECEDOR  05|NM_EMP
        // 06|TIP_OBRA_SERVICO  07|CEI  08|DESC_SERV_OBRA
        String(exercicio),
        numero(ficha.naturezaDespesa.codigoCompleto, onde("L800", "COD_CTA_DESP")),
        alfa(raiz.credorCpfCnpj.replace(/\D/g, ""), onde("L800", "COD_FORNECEDOR")),
        alfa(nmEmp(raizFicha, raiz.numero), onde("L800", "NM_EMP")),
        // O Record EXAUSTIVO do M11: um tipo novo NÃO COMPILA sem código de 2 dígitos.
        TIP_OBRA_SERVICO[obra.tipoObraServico],
        // CEI vazio = 3.1.9. A pendência acima já o nomeou.
        numeroFixo(obra.cei, 12, onde("L800", "CEI")),
        alfa(obra.descricao, onde("L800", "DESC_SERV_OBRA")),
      ],
    };
  });
}

const EMPENHO_SELECT = {
  id: true,
  fichaId: true,
  numero: true,
  valor: true,
  data: true,
  credorCpfCnpj: true,
  historico: true,
  estornoDeId: true,
  anulacaoParcialDeId: true,
  contratoId: true,
  // M11 (TR 4.50) — a obra. É daqui que sai o L800 inteiro.
  obra: {
    select: {
      identificador: true,
      descricao: true,
      tipoObraServico: true,
      cei: true,
    },
  },
} as const;

type EmpenhoLido = {
  id: string;
  fichaId: string;
  numero: string;
  valor: { toFixed(n: number): string };
  data: Date;
  credorCpfCnpj: string;
  historico: string;
  estornoDeId: string | null;
  anulacaoParcialDeId: string | null;
  contratoId: string | null;
  obra: {
    identificador: string;
    descricao: string;
    tipoObraServico: TipoObraServicoRepo;
    cei: string | null;
  } | null;
};

/** FAIL-CLOSED nos parâmetros do MANAD que o cadastro do ente tem de trazer. */
function exigirClassificacao(f: FichaLida): void {
  if (f.unidadeOrc.tipoManad === null || f.unidadeOrc.tipoManad === "") {
    throw new Error(
      `MANAD — a unidade orçamentária ${f.unidadeOrc.codigo} ` +
        `("${f.unidadeOrc.descricao}") não tem TIP_UN_ORC (L400, campo 06). É a Receita ` +
        `que usa este campo para saber ONDE procurar a retenção previdenciária: uma ` +
        `Secretaria de Saúde (04) declarada como Prefeitura (01) manda a fiscalização ` +
        `para o lugar errado. Classifique a unidade — o gerador não escolhe por ninguém.`
    );
  }
  if (f.acao.tipoManad === null || f.acao.tipoManad === "") {
    throw new Error(
      `MANAD — a ação ${f.acao.codigo} ("${f.acao.descricao}") não tem TIP_PROJ_ATIV_OE ` +
        `(L650, campo 05): 01-RPPS ou 02-Demais. Ele NÃO é derivável do TipoAcao (que diz ` +
        `projeto/atividade/operação especial, outra pergunta). Assumir "02" seria assumir ` +
        `que o ente não tem regime próprio — o dado que a Receita veio conferir.`
    );
  }
  if (
    f.naturezaDespesa.indTipoContaManad === null ||
    f.naturezaDespesa.nivelContaManad === null
  ) {
    throw new Error(
      `MANAD — a rubrica ${f.naturezaDespesa.codigoCompleto} ` +
        `("${f.naturezaDespesa.descricao}") não tem IND_TIPO_CONTA / NM_NIVEL_CONTA ` +
        `(L700, campos 05 e 06). A hierarquia da despesa é DADO do ente — deduzi-la do ` +
        `comprimento do código poria duas verdades sobre a mesma rubrica em dois ` +
        `arquivos fiscais.`
    );
  }
}

/**
 * ⚠️ CTA_DEBITO × CTA_CREDITO — A ESCOLHA DECLARADA DO PASSO 0(b).
 *
 * O lançamento de um pagamento é COMPOSTO: ele tem as pernas PATRIMONIAIS (D fornecedor /
 * C caixa) E as ORÇAMENTÁRIAS (D crédito liquidado / C crédito pago) — e, com retenção
 * (M07), ainda uma perna de passivo por consignação.
 *
 * O L150 pede UMA conta a débito e UMA a crédito, "do balancete de verificação". O
 * balancete de verificação é PATRIMONIAL — as contas de controle (5/6) não estão nele.
 * Logo: o par PATRIMONIAL. É uma ESCOLHA, e está declarada.
 *
 * ⚠️ E SE HOUVER MAIS DE UM CANDIDATO, O GERADOR PARA. Um pagamento com retenção tem DUAS
 * pernas credoras patrimoniais (o caixa pelo líquido e a consignação pelo retido) — e aí
 * não existe "a" conta a crédito. Escolher uma delas mandaria à Receita um lançamento que
 * o razão não fez. O resolver da MSC toma exatamente a mesma postura com a fonte ambígua:
 * NÃO ESCOLHE — recusa, nomeando.
 */
function contasDoPagamento(
  pagamentoId: string,
  partidas: readonly {
    readonly tipo: string;
    readonly subsistema: string;
    readonly conta: { readonly codigo: string };
  }[]
): { readonly debito: string; readonly credito: string } {
  const patrimoniais = partidas.filter((p) => p.subsistema === "PATRIMONIAL");
  const debitos = [
    ...new Set(patrimoniais.filter((p) => p.tipo === "DEBITO").map((p) => p.conta.codigo)),
  ];
  const creditos = [
    ...new Set(patrimoniais.filter((p) => p.tipo === "CREDITO").map((p) => p.conta.codigo)),
  ];

  const recusar = (lado: string, achadas: readonly string[]): never => {
    throw new Error(
      `MANAD — o pagamento ${pagamentoId} tem ${achadas.length} conta(s) PATRIMONIAIS a ` +
        `${lado} (${achadas.join(", ") || "nenhuma"}), e o L150 pede UMA. O gerador NÃO ` +
        `ESCOLHE: mandar uma delas à Receita seria declarar um lançamento que o razão não ` +
        `fez. (O caso real é o pagamento COM RETENÇÃO — o caixa leva o líquido e a ` +
        `consignação leva o retido, e aí não existe "a" conta a crédito. É decisão de ` +
        `leiaute: o MANAD provavelmente quer um registro por perna.)`
    );
  };

  if (debitos.length !== 1) recusar("DÉBITO", debitos);
  if (creditos.length !== 1) recusar("CRÉDITO", creditos);

  // ⚠️ CTA_DEBITO/CTA_CREDITO SÃO CAMPOS **NUMÉRICOS** (tipo N no leiaute), e o código do
  // PCASP no repositório é PONTUADO ("2.1.3.1.1.00.00"). Os pontos são APRESENTAÇÃO — a
  // conta é a sequência de dígitos. Tirá-los é conversão de borda, como a vírgula do
  // decimal; deixá-los faria a Receita rejeitar o campo.
  const soDigitos = (c: string): string => c.replace(/\D/g, "");
  return { debito: soDigitos(debitos[0]!), credito: soDigitos(creditos[0]!) };
}

// ───────────────────────────────────────────────────────────────────────────
// L200 — balancete da receita
// ───────────────────────────────────────────────────────────────────────────

async function l200(leitor: Leitor, exercicio: number): Promise<readonly LinhaManad[]> {
  const previstas = await leitor.receitaPrevista.findMany({
    where: { exercicio },
    select: {
      valorPrevisto: true,
      fonte: { select: { codigo: true } },
      naturezaReceita: {
        select: {
          codigo: true,
          descricao: true,
          indTipoContaManad: true,
          nivelContaManad: true,
        },
      },
    },
  });

  const arrecadadas = await leitor.receitaArrecadada.findMany({
    where: { exercicio },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      fonte: { select: { codigo: true } },
      naturezaReceita: {
        select: {
          codigo: true,
          descricao: true,
          indTipoContaManad: true,
          nivelContaManad: true,
        },
      },
    },
  });

  type Grupo = {
    natureza: {
      codigo: string;
      descricao: string;
      indTipoContaManad: string | null;
      nivelContaManad: number | null;
    };
    fonte: string;
    prevista: Money;
    arrecadadas: { id: string; valor: Money; estornoDeId: string | null }[];
  };
  const grupos = new Map<string, Grupo>();
  const chave = (nat: string, fonte: string): string => `${nat}|${fonte}`;

  const grupo = (
    nat: Grupo["natureza"],
    fonte: string
  ): Grupo => {
    const k = chave(nat.codigo, fonte);
    const g =
      grupos.get(k) ??
      { natureza: nat, fonte, prevista: toMoney("0.00"), arrecadadas: [] };
    grupos.set(k, g);
    return g;
  };

  for (const p of previstas) {
    const g = grupo(p.naturezaReceita, p.fonte.codigo);
    g.prevista = toMoney(g.prevista.plus(m(p.valorPrevisto)));
  }
  for (const a of arrecadadas) {
    const g = grupo(a.naturezaReceita, a.fonte.codigo);
    g.arrecadadas.push({
      id: a.id,
      valor: m(a.valor),
      estornoDeId: a.estornoDeId,
    });
  }

  const linhas: LinhaManad[] = [];
  for (const g of [...grupos.values()].sort((a, b) =>
    chave(a.natureza.codigo, a.fonte).localeCompare(chave(b.natureza.codigo, b.fonte))
  )) {
    if (g.natureza.indTipoContaManad === null || g.natureza.nivelContaManad === null) {
      throw new Error(
        `MANAD — a natureza de receita ${g.natureza.codigo} ` +
          `("${g.natureza.descricao}") não tem IND_TIPO_CONTA / NM_NIVEL_CONTA (L200, ` +
          `campos 09 e 10). Ver a nota no schema: a hierarquia é dado do ente.`
      );
    }

    linhas.push({
      reg: "L200",
      campos: [
        // 02|EXERC  03|COD_CTA_RECEITA  04|COD_ORG_UN_ORC  05|VL_REC_ORCADA
        // 06|VL_REC_REALIZADA  07|COD_REC_VINC  08|DESC_RECEITA  09|IND_TIPO_CONTA
        // 10|NM_NIVEL_CONTA
        String(exercicio),
        numero(g.natureza.codigo, onde("L200", "COD_CTA_RECEITA")),
        // ⚠️ COD_ORG_UN_ORC VAZIO (3.1.9): a receita do ente NÃO é de um órgão/unidade —
        // a `ReceitaArrecadada` não tem (nem deve ter) essa dimensão. O IPTU é do
        // município, não da Secretaria de Saúde.
        "",
        valor(g.prevista),
        // ⚠️ A SOMA É DO DONO. `somaLiquidaEstornaveis` — a mesma do Anexo 12 e do
        // superávit por fonte. Uma anulação de receita NÃO é uma receita negativa: ela
        // NEUTRALIZA a original, e as duas somem da soma.
        valor(somaLiquidaEstornaveis(g.arrecadadas)),
        numero(g.fonte, onde("L200", "COD_REC_VINC")),
        alfa(g.natureza.descricao, onde("L200", "DESC_RECEITA")),
        alfa(g.natureza.indTipoContaManad, onde("L200", "IND_TIPO_CONTA")),
        numero(g.natureza.nivelContaManad, onde("L200", "NM_NIVEL_CONTA")),
      ],
    });
  }
  return linhas;
}

// ───────────────────────────────────────────────────────────────────────────
// L250 — balancete da despesa
// ───────────────────────────────────────────────────────────────────────────

async function l250(
  leitor: Leitor,
  entrada: EntradaManad,
  exercicio: number,
  fichas: readonly FichaLida[],
  pendencias: PendenciaManad[]
): Promise<{
  readonly linhas: readonly LinhaManad[];
  readonly paraN3: readonly { fichaId: string; empenhado: Money }[];
}> {
  // ⚠️ OS CRÉDITOS POR TIPO SAEM DO CAMINHO movimento -> item -> decreto -> LEI.
  // O `ItemCredito` tem `movimentoDotacaoId @unique` (1-1) — então dá para saber, de cada
  // CREDITO_ADICIONAL do razão da dotação, se ele foi SUPLEMENTAR, ESPECIAL ou
  // EXTRAORDINÁRIO, sem somar nada duas vezes e sem tabela nova.
  const movimentos = await leitor.movimentoDotacao.findMany({
    where: { ficha: { exercicio } },
    select: {
      id: true,
      fichaId: true,
      tipo: true,
      valor: true,
      estornoDeId: true,
      itemCredito: {
        select: { decreto: { select: { lei: { select: { tipoCredito: true } } } } },
      },
    },
  });

  const empenhos = await leitor.empenho.findMany({
    where: { ficha: { exercicio } },
    select: { id: true, fichaId: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  // ⚠️ O EMPENHADO é de TODOS os empenhos da ficha (a N3 o amarra ao L050). Já o
  // LIQUIDADO e o PAGO levam o corte pela DATA DO FATO: um RP da ficha de 2026 liquidado
  // e pago em 2027 é execução de RESTOS, e não pode voltar a contar como despesa
  // liquidada de 2026 — seria o mesmo dinheiro declarado duas vezes.
  const liquidacoes = await leitor.liquidacao.findMany({
    where: {
      empenho: { ficha: { exercicio } },
      data: { gte: entrada.dtInicio, lte: entrada.dtFim },
    },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      empenho: { select: { fichaId: true } },
    },
  });
  const pagamentos = await leitor.pagamento.findMany({
    where: {
      liquidacao: { empenho: { ficha: { exercicio } } },
      data: { gte: entrada.dtInicio, lte: entrada.dtFim },
    },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      liquidacao: { select: { empenho: { select: { fichaId: true } } } },
    },
  });

  const linhas: LinhaManad[] = [];
  const paraN3: { fichaId: string; empenhado: Money }[] = [];

  for (const f of fichas) {
    exigirClassificacao(f);

    const meus = movimentos.filter((mv) => mv.fichaId === f.id);
    const somaDe = (
      filtro: (mv: (typeof meus)[number]) => boolean
    ): Money =>
      somaLiquidaEstornaveis(
        meus.filter(filtro).map((mv) => ({
          id: mv.id,
          valor: m(mv.valor),
          estornoDeId: mv.estornoDeId,
        }))
      );

    const dotacaoInicial = somaDe((mv) => mv.tipo === "DOTACAO_INICIAL");
    const credPorTipo = (tipo: "SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO"): Money =>
      somaDe(
        (mv) =>
          mv.tipo === "CREDITO_ADICIONAL" &&
          mv.itemCredito?.decreto.lei.tipoCredito === tipo
      );
    const reducoes = somaDe((mv) => mv.tipo === "ANULACAO_CREDITO");

    const empenhado = somaLiquidaEstornaveis(
      empenhos
        .filter((e) => e.fichaId === f.id)
        .map((e) => ({
          id: e.id,
          valor: m(e.valor),
          estornoDeId: e.estornoDeId,
          anulacaoParcialDeId: e.anulacaoParcialDeId,
        }))
    );
    const liquidado = somaLiquidaEstornaveis(
      liquidacoes
        .filter((x) => x.empenho.fichaId === f.id)
        .map((x) => ({
          id: x.id,
          valor: m(x.valor),
          estornoDeId: x.estornoDeId,
          anulacaoParcialDeId: x.anulacaoParcialDeId,
        }))
    );
    const pago = somaLiquidaEstornaveis(
      pagamentos
        .filter((x) => x.liquidacao.empenho.fichaId === f.id)
        .map((x) => ({
          id: x.id,
          valor: m(x.valor),
          estornoDeId: x.estornoDeId,
          anulacaoParcialDeId: x.anulacaoParcialDeId,
        }))
    );

    linhas.push({
      reg: "L250",
      campos: [
        String(exercicio),
        numero(f.orgao.codigo, onde("L250", "COD_ORG")),
        numero(f.unidadeOrc.codigo, onde("L250", "COD_UN_ORC")),
        numero(f.funcao.codigo, onde("L250", "COD_FUN")),
        numero(f.subfuncao.codigo, onde("L250", "COD_SUBFUN")),
        numero(f.programa.codigo, onde("L250", "COD_PROG")),
        // COD_SUBPROG — extinto pela Portaria 42/1999. Vazio (3.1.9).
        "",
        numero(f.acao.codigo, onde("L250", "COD_PROJ_ATIV_OE")),
        // COD_SUBELEMENTO — a FICHA não tem subelemento (o EMPENHO tem, e é opcional).
        // O balancete é por ficha; vazio (3.1.9).
        "",
        numero(f.naturezaDespesa.codigoCompleto, onde("L250", "COD_CTA_DESP")),
        numero(f.fonte.codigo, onde("L250", "COD_REC_VINC")),
        valor(dotacaoInicial),
        // VL_AT_MONETARIA — atualização monetária da dotação. NÃO modelada.
        "",
        valor(credPorTipo("SUPLEMENTAR")),
        valor(credPorTipo("ESPECIAL")),
        valor(credPorTipo("EXTRAORDINARIO")),
        valor(reducoes),
        // VL_SUP_REC_VINC / VL_RED_REC_VINC — suplementação/redução POR RECURSO VINCULADO.
        // Não modeladas como dimensão própria.
        "",
        "",
        valor(empenhado),
        valor(liquidado),
        valor(pago),
        // VL_LMTDO_LRF — o limitado por contingenciamento (LRF art. 9º). Não modelado.
        "",
      ],
    });

    paraN3.push({ fichaId: f.id, empenhado });
  }

  pendencias.push({
    registro: "L250",
    motivo:
      "Saem VAZIOS (3.1.9), por não serem modelados: VL_AT_MONETARIA (atualização " +
      "monetária da dotação), VL_SUP_REC_VINC / VL_RED_REC_VINC (suplementação e redução " +
      "por recurso vinculado como dimensão própria) e VL_LMTDO_LRF (limitação de empenho " +
      "do art. 9º da LRF — o contingenciamento não é fato no repositório).",
  });

  return { linhas, paraN3 };
}

// ───────────────────────────────────────────────────────────────────────────
// L300 — alterações da lei do orçamento
// ───────────────────────────────────────────────────────────────────────────

async function l300(
  leitor: Leitor,
  entrada: EntradaManad
): Promise<readonly LinhaManad[]> {
  const decretos = await leitor.decretoCredito.findMany({
    where: { data: { gte: entrada.dtInicio, lte: entrada.dtFim } },
    select: {
      numero: true,
      data: true,
      origemRecurso: true,
      lei: { select: { tipoCredito: true } },
      itens: { select: { id: true, tipo: true, valor: true } },
    },
    orderBy: { data: "asc" },
  });

  return decretos.map((d) => {
    const soma = (tipo: "SUPLEMENTACAO" | "ANULACAO"): Money =>
      d.itens
        .filter((i) => i.tipo === tipo)
        .reduce((acc, i) => toMoney(acc.plus(m(i.valor))), toMoney("0.00"));

    return {
      reg: "L300",
      campos: [
        // 02|NM_LEI_DECRETO  03|DT_LEI_DECRETO  04|VL_CRED_ADICIONAL
        // 05|VL_RED_DOTACOES  06|TIP_CRED_ADICIONAL  07|TIP_ORIG_RECURSO
        alfa(d.numero, onde("L300", "NM_LEI_DECRETO")),
        data(d.data),
        valor(soma("SUPLEMENTACAO")),
        valor(soma("ANULACAO")),
        // Os DOIS Records exaustivos. Um tipo/origem novo NÃO COMPILA sem código.
        TIP_CRED_ADICIONAL[d.lei.tipoCredito],
        TIP_ORIG_RECURSO[d.origemRecurso],
      ],
    };
  });
}

// ───────────────────────────────────────────────────────────────────────────
// L350..L700 — os cadastros REFERENCIADOS
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ SÓ O QUE O ARQUIVO USA — e não o cadastro inteiro do ente.
 *
 * A tentação é despejar as 400 subfunções da Portaria 42. Um arquivo fiscal com 395
 * registros que nada classificam é ruído: a Receita procura o que sustenta os empenhos, e
 * cada linha a mais é uma linha a conferir. Emitimos as entidades REFERENCIADAS pelas
 * fichas que estão no arquivo — nem uma a mais, nem uma a menos.
 */
function cadastros(
  exercicio: number,
  fichas: readonly FichaLida[]
): readonly LinhaManad[] {
  const linhas: LinhaManad[] = [];
  const ex = String(exercicio);

  const unicos = <T, K extends string>(
    itens: readonly T[],
    chave: (t: T) => K
  ): readonly T[] => {
    const vistos = new Set<K>();
    const saida: T[] = [];
    for (const i of itens) {
      const k = chave(i);
      if (vistos.has(k)) continue;
      vistos.add(k);
      saida.push(i);
    }
    return saida.sort((a, b) => chave(a).localeCompare(chave(b)));
  };

  // L350 — órgão: 02|EXERCICIO  03|COD_ORG  04|NOME_ORG
  for (const o of unicos(fichas.map((f) => f.orgao), (o) => o.codigo)) {
    linhas.push({
      reg: "L350",
      campos: [ex, numero(o.codigo, onde("L350", "COD_ORG")), alfa(o.nome, onde("L350", "NOME_ORG"))],
    });
  }

  // L400 — unidade: 02|EXERCICIO  03|COD_ORG  04|COD_UN_ORC  05|NOM_UN_ORC
  //                 06|TIP_UN_ORC  07|CNPJ
  for (const f of unicos(fichas, (f) => f.unidadeOrc.codigo)) {
    linhas.push({
      reg: "L400",
      campos: [
        ex,
        numero(f.orgao.codigo, onde("L400", "COD_ORG")),
        numero(f.unidadeOrc.codigo, onde("L400", "COD_UN_ORC")),
        alfa(f.unidadeOrc.descricao, onde("L400", "NOM_UN_ORC")),
        numero(f.unidadeOrc.tipoManad, onde("L400", "TIP_UN_ORC")),
        numeroFixo(f.unidadeOrc.cnpjManad, 14, onde("L400", "CNPJ")),
      ],
    });
  }

  // L450 — função
  for (const x of unicos(fichas.map((f) => f.funcao), (x) => x.codigo)) {
    linhas.push({
      reg: "L450",
      campos: [ex, numero(x.codigo, onde("L450", "COD_FUN")), alfa(x.nome, onde("L450", "NOM_FUN"))],
    });
  }

  // L500 — subfunção
  for (const x of unicos(fichas.map((f) => f.subfuncao), (x) => x.codigo)) {
    linhas.push({
      reg: "L500",
      campos: [ex, numero(x.codigo, onde("L500", "COD_SUBFUN")), alfa(x.nome, onde("L500", "NOM_SUBFUN"))],
    });
  }

  // L550 — programa
  for (const x of unicos(fichas.map((f) => f.programa), (x) => x.codigo)) {
    linhas.push({
      reg: "L550",
      campos: [ex, numero(x.codigo, onde("L550", "COD_PROGR")), alfa(x.descricao, onde("L550", "NOM_PROGR"))],
    });
  }

  // ⚠️ L600 — SUBPROGRAMAS: ZERO registros, e é DOUTRINA. A Portaria STN 42/1999 extinguiu
  // o subprograma da classificação funcional brasileira. Emitir um L600 exigiria inventar
  // uma hierarquia que a norma apagou há 26 anos. Ver o COD_SUBPROGR vazio no L050/L250.

  // L650 — projeto/atividade: 02|EXERCICIO  03|COD  04|NOM  05|TIP_PROJ_ATIV_OE
  for (const x of unicos(fichas.map((f) => f.acao), (x) => x.codigo)) {
    linhas.push({
      reg: "L650",
      campos: [
        ex,
        numero(x.codigo, onde("L650", "COD_PROJ_ATIV_OE")),
        alfa(x.descricao, onde("L650", "NOM_PROJ_ATIV_OE")),
        alfa(x.tipoManad, onde("L650", "TIP_PROJ_ATIV_OE")),
      ],
    });
  }

  // L700 — rubrica: 02|EXERCICIO  03|COD_CTA_DESP  04|NOM_DESPESA  05|IND_TIPO_CONTA
  //                 06|NM_NIVEL_CONTA
  for (const x of unicos(fichas.map((f) => f.naturezaDespesa), (x) => x.codigoCompleto)) {
    linhas.push({
      reg: "L700",
      campos: [
        ex,
        numero(x.codigoCompleto, onde("L700", "COD_CTA_DESP")),
        alfa(x.descricao, onde("L700", "NOM_DESPESA")),
        alfa(x.indTipoContaManad, onde("L700", "IND_TIPO_CONTA")),
        numero(x.nivelContaManad, onde("L700", "NM_NIVEL_CONTA")),
      ],
    });
  }

  return linhas;
}

// ───────────────────────────────────────────────────────────────────────────
// L750 — fornecedores
// ───────────────────────────────────────────────────────────────────────────

async function l750(
  leitor: Leitor,
  exercicio: number,
  empenhos: readonly EmpenhoLido[],
  pendencias: PendenciaManad[]
): Promise<readonly LinhaManad[]> {
  const documentos = [...new Set(empenhos.map((e) => e.credorCpfCnpj))].sort();
  if (documentos.length === 0) return [];

  // O NOME do fornecedor vem do CONTRATO (M11) — é o único lugar do repositório onde ele
  // existe. Um empenho sem contrato (diária, folha, sentença) não traz nome nenhum.
  const contratos = await leitor.contrato.findMany({
    where: { contratadoDocumento: { in: documentos } },
    select: { contratadoDocumento: true, contratadoNome: true },
  });
  const nomePorDoc = new Map(
    contratos.map((c) => [c.contratadoDocumento, c.contratadoNome])
  );

  const semNome = documentos.filter((d) => !nomePorDoc.has(d));
  if (semNome.length > 0) {
    pendencias.push({
      registro: "L750",
      quantidade: semNome.length,
      motivo:
        "NOM_FORNECEDOR sai VAZIO (3.1.9) para credores SEM CONTRATO: o nome do credor só " +
        "existe no repositório dentro do `Contrato` (M11). Um empenho de diária, de folha " +
        "ou de sentença não tem contrato — e o repositório não tem cadastro de credores. " +
        "⚠️ O endereço, a cidade, a UF e o CEP do fornecedor saem vazios SEMPRE, pelo mesmo " +
        "motivo. Se a Receita exigir, é CADASTRO DE CREDORES novo — não é derivável.",
    });
  }

  return documentos.map((doc) => {
    const so = doc.replace(/\D/g, "");
    // ⚠️ TIP_FORNECEDOR SAI DO COMPRIMENTO, E ELE É VALIDADO. 11 = PF, 14 = PJ. Qualquer
    // outro comprimento é dado quebrado, e um documento quebrado num arquivo da Receita
    // é o que faz a fiscalização bater na porta do credor errado.
    if (so.length !== 11 && so.length !== 14) {
      throw new Error(
        `MANAD — o credor "${doc}" tem ${so.length} dígitos. Um documento é CPF (11) ou ` +
          `CNPJ (14) — não há terceira opção, e o TIP_FORNECEDOR (L750, campo 05) sai ` +
          `justamente daí. Corrija o empenho.`
      );
    }
    const pf = so.length === 11;

    return {
      reg: "L750",
      campos: [
        // 02|EXERCICIO  03|COD_FORNECEDOR  04|NOM_FORNECEDOR  05|TIP_FORNECEDOR
        // 06|CNPJ  07|CPF  08|NIT  09|END  10|CID  11|UF  12|CEP  13|DESC_TIP_FORN
        String(exercicio),
        alfa(so, onde("L750", "COD_FORNECEDOR")),
        alfa(nomePorDoc.get(doc) ?? null, onde("L750", "NOM_FORNECEDOR")),
        pf ? "1" : "2",
        pf ? "" : numeroFixo(so, 14, onde("L750", "CNPJ_FORNECEDOR")),
        pf ? numeroFixo(so, 11, onde("L750", "CPF_FORNECEDOR")) : "",
        // NIT — obrigatório para contribuinte individual. Não modelado.
        "",
        "",
        "",
        "",
        "",
        "",
      ],
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCO 9 — o encerramento e as contagens
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ O 9900 É UM PONTO FIXO — e é bom saber disso antes de escrever a conta.
 *
 * O manual diz: "1 por tipo presente no arquivo, com a contagem". E o 9900 É um tipo
 * presente no arquivo. Logo ele conta a si mesmo, e o 9990 e o 9999 também — que ainda
 * não foram emitidos quando a conta é feita.
 *
 * A saída não é iterar até convergir: é ARITMÉTICA. Os tipos do bloco 9 são exatamente
 * quatro e conhecidos (9001, 9900, 9990, 9999), então:
 *
 *   nº de linhas 9900  =  (tipos já emitidos)  +  4
 *
 * e é esse mesmo número que o 9900 do próprio 9900 declara. Auto-consistente por
 * construção, sem laço.
 *
 * ⚠️ ESCOLHA DECLARADA: incluir os tipos do bloco 9 no 9900 é a convenção do SPED, e é a
 * leitura LITERAL do manual ("1 por tipo presente"). Se o validador da Receita esperar o
 * 9900 totalizando só os blocos 0/K/L, é ajuste de UMA linha — e está isolado aqui.
 */
function bloco9(anteriores: readonly LinhaManad[]): readonly LinhaManad[] {
  const linhas: LinhaManad[] = [{ reg: "9001", campos: ["0"] }];

  const tiposAnteriores = contarPorTipo(anteriores);

  // Os quatro do bloco 9. O 9900 conta-se a si mesmo — ver a nota acima.
  const contagem = new Map<string, number>(tiposAnteriores);
  contagem.set("9001", 1);
  const qtd9900 = tiposAnteriores.size + 4;
  contagem.set("9900", qtd9900);
  contagem.set("9990", 1);
  contagem.set("9999", 1);

  for (const tipo of [...contagem.keys()].sort()) {
    linhas.push({
      reg: "9900",
      campos: [tipo, String(contagem.get(tipo)!)],
    });
  }

  // 9990 — QTD_LIN_9: de 9001 a 9999, inclusive. As linhas já postas (9001 + os 9900),
  // mais o próprio 9990, mais o 9999.
  linhas.push({ reg: "9990", campos: [String(linhas.length + 2)] });

  // 9999 — QTD_LIN: do primeiro 0000 ao 9999, INCLUSIVE. Tudo que veio antes, mais ele.
  linhas.push({
    reg: "9999",
    campos: [String(anteriores.length + linhas.length + 1)],
  });

  return linhas;
}

void sinalDoFato;
