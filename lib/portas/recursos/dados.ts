import { Decimal, toMoney } from "../../../packages/contracts/index.js";
import {
  competenciaCivil,
  diaCivil,
  diaCivilBr,
  fimDoDiaCivil,
} from "../../../packages/datas/index.js";
import {
  estadoDoConvenio,
  glosadoLiquido,
  pendenteDePrestacao,
  ROTULO_DO_ESTADO,
  saldoALiberar,
  type MovimentoParaSaldo as MovConvenio,
  type TipoMovimentoConvenio,
} from "../../../modules/m28-convenios/dominio.js";
import {
  ordenarFilaDePrecatorios,
  saldoDoPrecatorio,
  type NaturezaDoPrecatorio,
  type PreferenciaDoPrecatorio,
  type TipoMovimentoPrecatorio,
} from "../../../modules/m29-precatorios/dominio.js";
import {
  saldoDoRateio,
  repassadoLiquido,
  tetoDoExercicio,
  type TipoMovimentoConsorcio,
} from "../../../modules/m30-consorcios/dominio.js";
import {
  contarChecklist,
  estadoDaAuditoria,
  respostasVigentes,
  type RespostaDoChecklist,
  type TipoMovimentoDaAuditoria,
} from "../../../modules/m31-controle-interno/dominio.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type {
  DadoDoDetalhe,
  LinhaDoHistorico,
  LinhaDoMolde,
} from "../../molde/tipos.js";
import { cliente, PortaSemBancoError } from "../cliente";

export { PortaSemBancoError };

/**
 * OS DADOS DOS CADASTROS DO MOLDE — leitura, e só leitura.
 *
 * ⚠️ O MOLDE NÃO GENERALIZA A CONSULTA, e essa é a fronteira que ele não atravessa. Cada
 * cadastro tem o SEU `where`, os SEUS saldos derivados e o SEU estado — e uma camada genérica
 * que montasse `where` a partir do descritor teria de aprender, uma a uma, todas as regras de
 * domínio que este arquivo delega aos módulos. O molde monta a SUPERFÍCIE; a pergunta continua
 * sendo de quem sabe respondê-la.
 *
 * ⚠️ E NADA AQUI DERIVA NÚMERO POR CONTA PRÓPRIA. Os saldos vêm das funções puras dos módulos
 * (`saldoALiberar`, `saldoDoPrecatorio`, `saldoDoRateio`) — um `SUM` novo nesta porta seria a
 * segunda verdade sobre o mesmo fato.
 */

export interface PaginaDoMolde {
  readonly linhas: readonly LinhaDoMolde[];
  readonly total: number;
}

function paginacao(c: ConsultaDoMolde): { readonly skip: number; readonly take: number } {
  return { skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA };
}

function texto(v: string): { readonly contains: string; readonly mode: "insensitive" } {
  return { contains: v, mode: "insensitive" };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVÊNIOS
// ═══════════════════════════════════════════════════════════════════════════

const ROTULO_DO_PAPEL = { CONCEDENTE: "Concedente", CONVENENTE: "Convenente" } as const;

export async function listarConvenios(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const papel = c.filtros["papel"] ?? "";
  const venceAte = c.filtros["venceAte"] ?? "";

  const where = {
    ...(q !== ""
      ? { OR: [{ identificador: texto(q) }, { partidaNome: texto(q) }] }
      : {}),
    ...(papel !== "" ? { papelDoEnte: papel as "CONCEDENTE" | "CONVENENTE" } : {}),
    // ⚠️ O CORTE DE DATA É PELO ÚLTIMO INSTANTE CIVIL DO DIA. `lte` sobre a meia-noite
    // deixaria de fora todo convênio que vence NO dia escolhido.
    ...(venceAte !== "" ? { vigenciaFim: { lte: fimDoDiaCivil(venceAte) } } : {}),
  };

  const [total, linhas] = await Promise.all([
    prisma.convenio.count({ where }),
    prisma.convenio.findMany({
      where,
      ...paginacao(c),
      orderBy:
        c.ordem === null
          ? { identificador: "asc" }
          : { [c.ordem]: c.direcao },
      select: {
        id: true, identificador: true, papelDoEnte: true, partidaNome: true,
        valorRepasse: true, vigenciaFim: true, diasParaPrestacaoDeContas: true,
        movimentos: { select: { tipo: true, valor: true } },
      },
    }),
  ]);

  const agora = new Date();
  return {
    total,
    linhas: linhas.map((v) => {
      const movimentos = paraMovConvenio(v.movimentos);
      const repasse = toMoney(v.valorRepasse.toFixed(2));
      const estado = estadoDoConvenio({
        valorRepasse: repasse,
        vigenciaFim: v.vigenciaFim,
        diasParaPrestacaoDeContas: v.diasParaPrestacaoDeContas,
        movimentos,
        hoje: agora,
      });
      return {
        id: v.id,
        identificador: v.identificador,
        papel: ROTULO_DO_PAPEL[v.papelDoEnte],
        partidaNome: v.partidaNome,
        valorRepasse: repasse.toFixed(2),
        aLiberar: saldoALiberar(repasse, movimentos).toFixed(2),
        aPrestarContas: pendenteDePrestacao(movimentos).toFixed(2),
        vigenciaFim: diaCivilBr(v.vigenciaFim),
        estado: ROTULO_DO_ESTADO[estado],
        // ⚠️ O TOM É DADO, e não decisão da tela: quem sabe que "prestação vencida" é alerta
        // é o domínio que derivou o estado.
        estadoTom: estado === "PRESTACAO_VENCIDA" ? "alerta" : "neutro",
      };
    }),
  };
}

function paraMovConvenio(
  movimentos: readonly { readonly tipo: string; readonly valor: Decimal }[]
): readonly MovConvenio[] {
  return movimentos.map((m) => ({
    tipo: m.tipo as TipoMovimentoConvenio,
    valor: toMoney(m.valor.toFixed(2)),
  }));
}

export interface DetalheLido {
  readonly titulo: string;
  readonly subtitulo: string;
  readonly selos: readonly { readonly texto: string; readonly tom: "neutro" | "ok" | "alerta" | "erro" }[];
  readonly dados: readonly DadoDoDetalhe[];
  readonly historico: readonly LinhaDoHistorico[];
}

export async function verConvenio(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const v = await prisma.convenio.findUnique({
    where: { id },
    select: {
      identificador: true, objeto: true, papelDoEnte: true, partidaNome: true,
      partidaDocumento: true, leiAutorizativa: true, valorRepasse: true,
      valorContrapartida: true, vigenciaInicio: true, vigenciaFim: true,
      diasParaPrestacaoDeContas: true,
      fonteRecurso: { select: { codigo: true, descricao: true } },
      contaContabil: { select: { codigo: true, nome: true } },
      movimentos: {
        select: {
          id: true, tipo: true, valor: true, parcela: true, dataMovimento: true,
          competencia: true, motivo: true, criadoEm: true, criadoPor: true,
          estornos: { select: { id: true } },
        },
        orderBy: { dataMovimento: "desc" },
      },
    },
  });
  if (v === null) return null;

  const movimentos = paraMovConvenio(v.movimentos);
  const repasse = toMoney(v.valorRepasse.toFixed(2));
  const estado = estadoDoConvenio({
    valorRepasse: repasse,
    vigenciaFim: v.vigenciaFim,
    diasParaPrestacaoDeContas: v.diasParaPrestacaoDeContas,
    movimentos,
    hoje: new Date(),
  });

  return {
    titulo: `Convênio ${v.identificador}`,
    subtitulo: `${ROTULO_DO_PAPEL[v.papelDoEnte]} · ${v.partidaNome}`,
    selos: [
      { texto: ROTULO_DO_ESTADO[estado], tom: estado === "PRESTACAO_VENCIDA" ? "alerta" : "neutro" },
      { texto: ROTULO_DO_PAPEL[v.papelDoEnte], tom: "neutro" },
    ],
    dados: [
      { rotulo: "Objeto", valor: v.objeto, tipo: "longo" },
      { rotulo: "Outra parte", valor: `${v.partidaNome} · ${v.partidaDocumento}` },
      { rotulo: "Lei autorizativa", valor: v.leiAutorizativa, nota: "LRF art. 25" },
      { rotulo: "Valor do repasse", valor: repasse.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Contrapartida", valor: v.valorContrapartida.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Saldo a liberar", valor: saldoALiberar(repasse, movimentos).toFixed(2), tipo: "dinheiro",
        nota: "Derivado dos movimentos — nunca uma coluna." },
      { rotulo: "Pendente de prestação", valor: pendenteDePrestacao(movimentos).toFixed(2), tipo: "dinheiro",
        nota: "Conta independente do saldo a liberar." },
      { rotulo: "Glosado (líquido)", valor: glosadoLiquido(movimentos).toFixed(2), tipo: "dinheiro" },
      { rotulo: "Vigência", valor: `${diaCivilBr(v.vigenciaInicio)} a ${diaCivilBr(v.vigenciaFim)}`, tipo: "data" },
      { rotulo: "Prazo de prestação", valor: `${v.diasParaPrestacaoDeContas} dias após a vigência` },
      { rotulo: "Fonte de recurso", valor: `${v.fonteRecurso.codigo} — ${v.fonteRecurso.descricao}` },
      { rotulo: "Conta de controle", valor: `${v.contaContabil.codigo} — ${v.contaContabil.nome}` },
    ],
    historico: v.movimentos.map((m) => ({
      id: m.id,
      oQue: `${rotuloDoMovimento(m.tipo)}${m.parcela === null ? "" : ` — parcela ${m.parcela}`}`,
      quando: diaCivilBr(m.dataMovimento),
      registradoEm: diaCivilBr(m.criadoEm),
      por: m.criadoPor,
      motivo: m.motivo,
      valor: m.valor.toFixed(2),
      estornado: m.estornos.length > 0,
    })),
  };
}

function rotuloDoMovimento(tipo: string): string {
  return tipo
    .replace(/^ESTORNO_/, "Estorno de ")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════════════════
// PRECATÓRIOS — e a listagem JÁ SAI NA ORDEM DO ART. 100
// ═══════════════════════════════════════════════════════════════════════════

const ROTULO_DA_NATUREZA = { ALIMENTAR: "Alimentar", COMUM: "Comum" } as const;
const ROTULO_DA_PREFERENCIA = {
  NENHUMA: "—",
  IDOSO: "Idoso",
  DOENCA_GRAVE: "Doença grave",
  DEFICIENCIA: "Deficiência",
} as const;

export async function listarPrecatorios(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const natureza = c.filtros["natureza"] ?? "";
  const exercicio = c.filtros["exercicio"] ?? "";

  const where = {
    ...(q !== ""
      ? { OR: [{ numeroProcesso: texto(q) }, { beneficiarioNome: texto(q) }] }
      : {}),
    ...(natureza !== "" ? { natureza: natureza as NaturezaDoPrecatorio } : {}),
    ...(exercicio !== "" ? { exercicioDePagamento: Number(exercicio) } : {}),
  };

  // ⚠️ A ORDEM DA FILA NÃO É UM `orderBy` DO SQL, E NÃO PODERIA SER. Ela depende do SALDO
  // DEVIDO — que é Σ dos movimentos — e da regra de que a preferência do §2º só vale DENTRO
  // dos alimentares. Um `ORDER BY natureza, preferencia, dataApresentacao` poria um comum
  // idoso à frente de um alimentar sem preferência, e a inversão seria invisível.
  //
  // ⚠️ POR ISSO ELA LÊ TUDO E PAGINA DEPOIS. Com o volume de precatórios de um município,
  // isso é aceitável; se um dia não for, o caminho é materializar a posição num fato — não
  // aproximar a ordem no SQL.
  const todos = await prisma.precatorio.findMany({
    where,
    select: {
      id: true, numeroProcesso: true, beneficiarioNome: true, natureza: true,
      preferencia: true, dataApresentacao: true, valorOriginal: true,
      movimentos: { select: { tipo: true, valor: true } },
    },
  });

  const comSaldo = todos.map((p) => ({
    id: p.id,
    numeroProcesso: p.numeroProcesso,
    natureza: p.natureza as NaturezaDoPrecatorio,
    preferencia: p.preferencia as PreferenciaDoPrecatorio,
    dataApresentacao: p.dataApresentacao,
    saldoDevido: saldoDoPrecatorio(
      p.movimentos.map((m) => ({
        tipo: m.tipo as TipoMovimentoPrecatorio,
        valor: toMoney(m.valor.toFixed(2)),
      }))
    ),
    beneficiarioNome: p.beneficiarioNome,
    valorOriginal: toMoney(p.valorOriginal.toFixed(2)),
  }));

  const ordenados = ordenarFilaDePrecatorios(comSaldo) as readonly (typeof comSaldo)[number][];
  const { skip, take } = paginacao(c);

  return {
    total: ordenados.length,
    linhas: ordenados.slice(skip, skip + take).map((p, i) => ({
      id: p.id,
      posicao: String(skip + i + 1),
      numeroProcesso: p.numeroProcesso,
      beneficiarioNome: p.beneficiarioNome,
      natureza: ROTULO_DA_NATUREZA[p.natureza],
      preferencia: ROTULO_DA_PREFERENCIA[p.preferencia],
      dataApresentacao: diaCivilBr(p.dataApresentacao),
      valorOriginal: p.valorOriginal.toFixed(2),
      saldoDevido: p.saldoDevido.toFixed(2),
    })),
  };
}

export async function verPrecatorio(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const p = await prisma.precatorio.findUnique({
    where: { id },
    select: {
      numeroProcesso: true, tribunal: true, oficioRequisitorio: true,
      beneficiarioNome: true, beneficiarioDocumento: true, natureza: true,
      preferencia: true, dataApresentacao: true, exercicioDePagamento: true,
      valorOriginal: true,
      contaContabil: { select: { codigo: true, nome: true } },
      movimentos: {
        select: {
          id: true, tipo: true, valor: true, dataMovimento: true, competencia: true,
          motivo: true, criadoEm: true, criadoPor: true,
          justificativaQuebraDeOrdem: true,
          estornos: { select: { id: true } },
        },
        orderBy: { dataMovimento: "desc" },
      },
    },
  });
  if (p === null) return null;

  const saldo = saldoDoPrecatorio(
    p.movimentos.map((m) => ({
      tipo: m.tipo as TipoMovimentoPrecatorio,
      valor: toMoney(m.valor.toFixed(2)),
    }))
  );

  return {
    titulo: `Precatório ${p.numeroProcesso}`,
    subtitulo: `${p.tribunal} · ${p.beneficiarioNome}`,
    selos: [
      { texto: ROTULO_DA_NATUREZA[p.natureza as NaturezaDoPrecatorio], tom: p.natureza === "ALIMENTAR" ? "alerta" : "neutro" },
      ...(p.preferencia === "NENHUMA"
        ? []
        : [{ texto: ROTULO_DA_PREFERENCIA[p.preferencia as PreferenciaDoPrecatorio], tom: "alerta" as const }]),
      { texto: saldo.lte(0) ? "Quitado" : "Devendo", tom: saldo.lte(0) ? "ok" : "neutro" },
    ],
    dados: [
      { rotulo: "Beneficiário", valor: `${p.beneficiarioNome} · ${p.beneficiarioDocumento}` },
      { rotulo: "Tribunal", valor: p.tribunal },
      { rotulo: "Ofício requisitório", valor: p.oficioRequisitorio ?? "" },
      { rotulo: "Natureza", valor: ROTULO_DA_NATUREZA[p.natureza as NaturezaDoPrecatorio],
        nota: "CF art. 100, §1º — alimentar paga-se antes de comum." },
      { rotulo: "Preferência (§2º)", valor: ROTULO_DA_PREFERENCIA[p.preferencia as PreferenciaDoPrecatorio],
        nota: "Só ordena dentro dos alimentares." },
      { rotulo: "Apresentação", valor: diaCivilBr(p.dataApresentacao), tipo: "data",
        nota: "É ela que ordena a fila — nunca a data do cadastro." },
      { rotulo: "Exercício de pagamento", valor: String(p.exercicioDePagamento), tipo: "inteiro" },
      { rotulo: "Valor requisitado", valor: p.valorOriginal.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Saldo devido", valor: saldo.toFixed(2), tipo: "dinheiro",
        nota: "Σ dos movimentos — nunca uma coluna." },
      { rotulo: "Conta de passivo", valor: `${p.contaContabil.codigo} — ${p.contaContabil.nome}` },
    ],
    historico: p.movimentos.map((m) => ({
      id: m.id,
      oQue:
        rotuloDoMovimento(m.tipo) +
        (m.competencia === null ? "" : ` (${competenciaCivil(m.competencia)})`) +
        (m.justificativaQuebraDeOrdem === null ? "" : " — COM quebra da ordem do art. 100"),
      quando: diaCivilBr(m.dataMovimento),
      registradoEm: diaCivilBr(m.criadoEm),
      por: m.criadoPor,
      motivo:
        m.justificativaQuebraDeOrdem === null
          ? m.motivo
          : `${m.motivo}\nJustificativa da quebra: ${m.justificativaQuebraDeOrdem}`,
      valor: m.valor.toFixed(2),
      estornado: m.estornos.length > 0,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSÓRCIOS
// ═══════════════════════════════════════════════════════════════════════════

function exercicioVigente(c: ConsultaDoMolde): number {
  const pedido = c.filtros["exercicio"] ?? "";
  // ⚠️ O PADRÃO É O ANO CIVIL DO ENTE, e não `new Date().getFullYear()` — que às 22:00 de
  // 31/12 já diria o ano seguinte e mostraria um rateio que ainda não existe.
  return pedido === "" ? Number(diaCivil(new Date()).slice(0, 4)) : Number(pedido);
}

export async function listarConsorcios(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const exercicio = exercicioVigente(c);

  const where = q === "" ? {} : { OR: [{ identificador: texto(q) }, { denominacao: texto(q) }] };

  const [total, linhas] = await Promise.all([
    prisma.consorcioPublico.count({ where }),
    prisma.consorcioPublico.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { identificador: "asc" } : { [c.ordem]: c.direcao },
      select: {
        id: true, identificador: true, denominacao: true, areaDeAtuacao: true,
        rateios: { where: { exercicio }, select: { valorDoEnte: true, aditivoDeId: true } },
        movimentos: { where: { exercicio }, select: { tipo: true, valor: true } },
      },
    }),
  ]);

  return {
    total,
    linhas: linhas.map((v) => {
      const rateios = v.rateios.map((r) => ({
        valorDoEnte: toMoney(r.valorDoEnte.toFixed(2)),
        ehAditivo: r.aditivoDeId !== null,
      }));
      const movimentos = v.movimentos.map((m) => ({
        tipo: m.tipo as TipoMovimentoConsorcio,
        valor: toMoney(m.valor.toFixed(2)),
      }));
      return {
        id: v.id,
        identificador: v.identificador,
        denominacao: v.denominacao,
        areaDeAtuacao: v.areaDeAtuacao,
        teto: tetoDoExercicio(rateios).toFixed(2),
        repassado: repassadoLiquido(movimentos).toFixed(2),
        saldo: saldoDoRateio(rateios, movimentos).toFixed(2),
      };
    }),
  };
}

export async function verConsorcio(id: string, exercicio: number): Promise<DetalheLido | null> {
  const prisma = cliente();
  const v = await prisma.consorcioPublico.findUnique({
    where: { id },
    select: {
      identificador: true, denominacao: true, cnpj: true, areaDeAtuacao: true,
      protocoloDeIntencoes: true, leiRatificadora: true,
      fonteRecurso: { select: { codigo: true, descricao: true } },
      contaContabil: { select: { codigo: true, nome: true } },
      rateios: {
        select: { id: true, exercicio: true, valorDoEnte: true, dataAssinatura: true, aditivoDeId: true, criadoEm: true, criadoPor: true },
        orderBy: [{ exercicio: "desc" }, { dataAssinatura: "asc" }],
      },
      movimentos: {
        select: {
          id: true, tipo: true, valor: true, exercicio: true, dataMovimento: true,
          motivo: true, criadoEm: true, criadoPor: true, estornos: { select: { id: true } },
        },
        orderBy: { dataMovimento: "desc" },
      },
    },
  });
  if (v === null) return null;

  const doExercicio = v.rateios
    .filter((r) => r.exercicio === exercicio)
    .map((r) => ({ valorDoEnte: toMoney(r.valorDoEnte.toFixed(2)), ehAditivo: r.aditivoDeId !== null }));
  const movimentosDoExercicio = v.movimentos
    .filter((m) => m.exercicio === exercicio)
    .map((m) => ({ tipo: m.tipo as TipoMovimentoConsorcio, valor: toMoney(m.valor.toFixed(2)) }));

  return {
    titulo: `Consórcio ${v.identificador}`,
    subtitulo: `${v.denominacao} · ${v.areaDeAtuacao}`,
    selos: [
      { texto: `Rateio de ${exercicio}`, tom: doExercicio.length === 0 ? "alerta" : "neutro" },
    ],
    dados: [
      { rotulo: "Denominação", valor: v.denominacao },
      { rotulo: "CNPJ", valor: v.cnpj },
      { rotulo: "Área de atuação", valor: v.areaDeAtuacao },
      { rotulo: "Protocolo de intenções", valor: v.protocoloDeIntencoes, tipo: "longo" },
      { rotulo: "Lei ratificadora", valor: v.leiRatificadora, nota: "Lei 11.107, art. 5º" },
      { rotulo: `Teto do rateio de ${exercicio}`, valor: tetoDoExercicio(doExercicio).toFixed(2), tipo: "dinheiro",
        nota: "Soma do contrato original com os aditivos — nunca 'o último vale'." },
      { rotulo: "Repassado no exercício", valor: repassadoLiquido(movimentosDoExercicio).toFixed(2), tipo: "dinheiro" },
      { rotulo: "A repassar", valor: saldoDoRateio(doExercicio, movimentosDoExercicio).toFixed(2), tipo: "dinheiro" },
      { rotulo: "Fonte de recurso", valor: `${v.fonteRecurso.codigo} — ${v.fonteRecurso.descricao}` },
      { rotulo: "Conta de controle", valor: `${v.contaContabil.codigo} — ${v.contaContabil.nome}` },
    ],
    historico: [
      ...v.rateios.map((r) => ({
        id: r.id,
        oQue: `${r.aditivoDeId === null ? "Contrato de rateio" : "Aditivo ao rateio"} de ${r.exercicio}`,
        quando: diaCivilBr(r.dataAssinatura),
        registradoEm: diaCivilBr(r.criadoEm),
        por: r.criadoPor,
        motivo: null,
        valor: r.valorDoEnte.toFixed(2),
      })),
      ...v.movimentos.map((m) => ({
        id: m.id,
        oQue: `${rotuloDoMovimento(m.tipo)} (cota de ${m.exercicio})`,
        quando: diaCivilBr(m.dataMovimento),
        registradoEm: diaCivilBr(m.criadoEm),
        por: m.criadoPor,
        motivo: m.motivo,
        valor: m.valor.toFixed(2),
        estornado: m.estornos.length > 0,
      })),
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORIAS INTERNAS
// ═══════════════════════════════════════════════════════════════════════════

const ROTULO_DO_TIPO_DE_AUDITORIA = {
  PROGRAMADA: "Programada",
  EXTRAORDINARIA: "Extraordinária",
  MONITORAMENTO: "Monitoramento",
} as const;

export async function listarAuditorias(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const tipo = c.filtros["tipo"] ?? "";

  const where = {
    ...(q !== "" ? { OR: [{ identificador: texto(q) }, { objeto: texto(q) }] } : {}),
    ...(tipo !== "" ? { tipo: tipo as "PROGRAMADA" | "EXTRAORDINARIA" | "MONITORAMENTO" } : {}),
  };

  const [total, linhas] = await Promise.all([
    prisma.auditoriaInterna.count({ where }),
    prisma.auditoriaInterna.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { identificador: "desc" } : { [c.ordem]: c.direcao },
      select: {
        id: true, identificador: true, tipo: true, periodoInicio: true, periodoFim: true,
        orgao: { select: { codigo: true, nome: true } },
        itens: { select: { id: true, respostas: { select: { itemId: true, resposta: true, observacao: true, criadoEm: true, criadoPor: true } } } },
        irregularidades: { select: { id: true } },
        movimentos: { select: { tipo: true, dataMovimento: true, criadoEm: true } },
      },
    }),
  ]);

  return {
    total,
    linhas: linhas.map((a) => {
      const vigentes = respostasVigentes(
        a.itens.flatMap((i) =>
          i.respostas.map((r) => ({
            itemId: r.itemId,
            resposta: r.resposta as RespostaDoChecklist,
            observacao: r.observacao,
            criadoEm: r.criadoEm,
            criadoPor: r.criadoPor,
          }))
        )
      );
      const c2 = contarChecklist(a.itens.length, vigentes);
      const estado = estadoDaAuditoria(
        a.movimentos.map((m) => ({
          tipo: m.tipo as TipoMovimentoDaAuditoria,
          dataMovimento: m.dataMovimento,
          criadoEm: m.criadoEm,
        }))
      );
      return {
        id: a.id,
        identificador: a.identificador,
        orgao: `${a.orgao.codigo} — ${a.orgao.nome}`,
        tipo: ROTULO_DO_TIPO_DE_AUDITORIA[a.tipo],
        periodo: `${diaCivilBr(a.periodoInicio)} a ${diaCivilBr(a.periodoFim)}`,
        checklist: `${c2.respondidos}/${c2.total}`,
        achados: String(a.irregularidades.length),
        estado: estado === "ABERTA" ? "Aberta" : "Encerrada",
        estadoTom: c2.pendentes > 0 && estado === "ABERTA" ? "alerta" : "neutro",
      };
    }),
  };
}

export async function verAuditoria(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const a = await prisma.auditoriaInterna.findUnique({
    where: { id },
    select: {
      identificador: true, objeto: true, tipo: true, responsavel: true,
      periodoInicio: true, periodoFim: true,
      orgao: { select: { codigo: true, nome: true } },
      itens: {
        select: {
          id: true, ordem: true, pergunta: true, baseLegal: true,
          respostas: {
            select: { id: true, itemId: true, resposta: true, observacao: true, criadoEm: true, criadoPor: true },
            orderBy: { criadoEm: "asc" },
          },
        },
        orderBy: { ordem: "asc" },
      },
      irregularidades: {
        select: {
          id: true, descricao: true, gravidade: true, providencia: true, prazo: true,
          criadoEm: true, criadoPor: true,
          providencias: { select: { aceita: true, criadoEm: true } },
        },
      },
      movimentos: {
        select: { id: true, tipo: true, dataMovimento: true, motivo: true, criadoEm: true, criadoPor: true },
        orderBy: { dataMovimento: "desc" },
      },
      relatorios: { select: { id: true, versao: true, hashConteudo: true, criadoEm: true, criadoPor: true }, orderBy: { versao: "desc" } },
    },
  });
  if (a === null) return null;

  const vigentes = respostasVigentes(
    a.itens.flatMap((i) =>
      i.respostas.map((r) => ({
        itemId: r.itemId,
        resposta: r.resposta as RespostaDoChecklist,
        observacao: r.observacao,
        criadoEm: r.criadoEm,
        criadoPor: r.criadoPor,
      }))
    )
  );
  const contagem = contarChecklist(a.itens.length, vigentes);
  const estado = estadoDaAuditoria(
    a.movimentos.map((m) => ({
      tipo: m.tipo as TipoMovimentoDaAuditoria,
      dataMovimento: m.dataMovimento,
      criadoEm: m.criadoEm,
    }))
  );

  return {
    titulo: `Auditoria ${a.identificador}`,
    subtitulo: `${a.orgao.codigo} — ${a.orgao.nome} · ${ROTULO_DO_TIPO_DE_AUDITORIA[a.tipo]}`,
    selos: [
      { texto: estado === "ABERTA" ? "Aberta" : "Encerrada", tom: estado === "ABERTA" ? "neutro" : "ok" },
      ...(contagem.pendentes > 0
        ? [{ texto: `${contagem.pendentes} item(ns) sem resposta`, tom: "alerta" as const }]
        : []),
      ...(a.irregularidades.length > 0
        ? [{ texto: `${a.irregularidades.length} achado(s)`, tom: "alerta" as const }]
        : []),
    ],
    dados: [
      { rotulo: "Objeto", valor: a.objeto, tipo: "longo" },
      { rotulo: "Órgão auditado", valor: `${a.orgao.codigo} — ${a.orgao.nome}` },
      { rotulo: "Responsável", valor: a.responsavel },
      { rotulo: "Período auditado", valor: `${diaCivilBr(a.periodoInicio)} a ${diaCivilBr(a.periodoFim)}`, tipo: "data" },
      { rotulo: "Checklist", valor: `${contagem.respondidos} de ${contagem.total} respondidos`,
        nota: `${contagem.conformes} conformes · ${contagem.naoConformes} não conformes · ${contagem.naoAplicaveis} não aplicáveis` },
      { rotulo: "Achados", valor: String(a.irregularidades.length), tipo: "inteiro" },
      { rotulo: "Relatório circunstanciado",
        valor: a.relatorios.length === 0 ? "" : `versão ${a.relatorios[0]!.versao}`,
        nota: a.relatorios.length === 0
          ? "Ainda não emitido."
          : `SHA-256 ${a.relatorios[0]!.hashConteudo.slice(0, 16)}…` },
      ...a.itens.map((i) => {
        const v = vigentes.get(i.id);
        return {
          rotulo: `Item ${i.ordem}`,
          valor: `${i.pergunta} — ${v === undefined ? "SEM RESPOSTA" : v.resposta}`,
          tipo: "longo" as const,
          nota: `${i.baseLegal}${v?.observacao === undefined || v.observacao === null ? "" : ` · ${v.observacao}`}`,
        };
      }),
    ],
    historico: [
      ...a.movimentos.map((m) => ({
        id: m.id,
        oQue: rotuloDoMovimento(m.tipo),
        quando: diaCivilBr(m.dataMovimento),
        registradoEm: diaCivilBr(m.criadoEm),
        por: m.criadoPor,
        motivo: m.motivo,
      })),
      ...a.irregularidades.map((i) => ({
        id: i.id,
        oQue: `Irregularidade ${i.gravidade} — prazo ${diaCivilBr(i.prazo)}`,
        quando: diaCivilBr(i.criadoEm),
        registradoEm: diaCivilBr(i.criadoEm),
        por: i.criadoPor,
        motivo: `${i.descricao}\nProvidência: ${i.providencia}`,
      })),
      ...a.relatorios.map((r) => ({
        id: r.id,
        oQue: `Relatório circunstanciado — versão ${r.versao}`,
        quando: diaCivilBr(r.criadoEm),
        registradoEm: diaCivilBr(r.criadoEm),
        por: r.criadoPor,
        motivo: `SHA-256 ${r.hashConteudo}`,
      })),
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AS ESCRITAS — todas por `comEscritaAutenticada`
//
// ⚠️ A PORTA ENCAMINHA, NÃO DECIDE. Saldo do termo, teto do rateio, ordem do art. 100,
// período aberto, segregação de função — tudo é decidido pelo domínio, dentro da transação, e
// a mensagem de lá sobe COMO VEIO. Parafrasear aqui criaria uma segunda explicação para a
// mesma recusa, e as duas divergiriam no dia em que o guard aprendesse um caso novo.
// ═══════════════════════════════════════════════════════════════════════════

import { comEscritaAutenticada } from "../sessao";
import {
  aprovarPrestacaoDeContas,
  cadastrarConvenio,
  glosar,
  liberarParcela,
  registrarDevolucao,
} from "../../../modules/m28-convenios/servico.js";
import {
  cadastrarPrecatorio,
  cancelarPrecatorio,
  inscreverPrecatorio,
  registrarAtualizacaoDePrecatorio,
} from "../../../modules/m29-precatorios/servico.js";
import {
  cadastrarConsorcio,
  registrarContratoDeRateio,
  repassarAoConsorcio,
} from "../../../modules/m30-consorcios/servico.js";
import {
  abrirAuditoria,
  encerrarAuditoria,
  registrarIrregularidade,
} from "../../../modules/m31-controle-interno/servico.js";

type Campos = Readonly<Record<string, string>>;

const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const n = (c: Campos, k: string, padrao: number): number => {
  const v = Number(t(c, k));
  return Number.isFinite(v) && v !== 0 ? v : padrao;
};
const opcional = (c: Campos, k: string): string | undefined => {
  const v = t(c, k);
  return v === "" ? undefined : v;
};

export async function criarConvenio(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_CONVENIO", (criadoPor) =>
    cadastrarConvenio(cliente(), {
      identificador: t(c, "identificador"),
      objeto: t(c, "objeto"),
      papelDoEnte: t(c, "papelDoEnte") as "CONCEDENTE" | "CONVENENTE",
      partidaNome: t(c, "partidaNome"),
      partidaDocumento: t(c, "partidaDocumento"),
      leiAutorizativa: t(c, "leiAutorizativa"),
      valorRepasse: t(c, "valorRepasse"),
      valorContrapartida: t(c, "valorContrapartida"),
      diaVigenciaInicio: t(c, "diaVigenciaInicio"),
      diaVigenciaFim: t(c, "diaVigenciaFim"),
      diasParaPrestacaoDeContas: n(c, "diasParaPrestacaoDeContas", 60),
      fonteRecursoId: t(c, "fonteRecursoId"),
      contaContabilId: t(c, "contaContabilId"),
      criadoPor,
    })
  );
}

export async function acaoDoConvenio(
  acao: string,
  convenioId: string,
  c: Campos
): Promise<void> {
  const comum = (criadoPor: string) => ({
    convenioId,
    valor: t(c, "valor"),
    diaMovimento: t(c, "diaMovimento"),
    competencia: t(c, "competencia"),
    motivo: t(c, "motivo"),
    criadoPor,
  });

  switch (acao) {
    case "liberar-parcela":
      await comEscritaAutenticada("LIBERAR_PARCELA_DE_CONVENIO", (criadoPor) =>
        liberarParcela(cliente(), {
          ...comum(criadoPor),
          parcela: n(c, "parcela", 1),
          ...(opcional(c, "empenhoId") !== undefined ? { empenhoId: t(c, "empenhoId") } : {}),
        })
      );
      return;
    case "aprovar-prestacao":
      await comEscritaAutenticada("APROVAR_PRESTACAO_DE_CONTAS", (criadoPor) =>
        aprovarPrestacaoDeContas(cliente(), comum(criadoPor))
      );
      return;
    case "glosar":
      await comEscritaAutenticada("GLOSAR_CONVENIO", (criadoPor) =>
        glosar(cliente(), comum(criadoPor))
      );
      return;
    case "registrar-devolucao":
      await comEscritaAutenticada("REGISTRAR_DEVOLUCAO_DE_CONVENIO", (criadoPor) =>
        registrarDevolucao(cliente(), comum(criadoPor))
      );
      return;
    default:
      // ⚠️ FAIL-CLOSED. Ação desconhecida NÃO cai num caminho feliz: um `default` silencioso
      // aqui deixaria a tela dizer "salvo" sem ter gravado nada.
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

export async function criarPrecatorio(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_PRECATORIO", (criadoPor) =>
    cadastrarPrecatorio(cliente(), {
      numeroProcesso: t(c, "numeroProcesso"),
      tribunal: t(c, "tribunal"),
      ...(opcional(c, "oficioRequisitorio") !== undefined
        ? { oficioRequisitorio: t(c, "oficioRequisitorio") }
        : {}),
      beneficiarioNome: t(c, "beneficiarioNome"),
      beneficiarioDocumento: t(c, "beneficiarioDocumento"),
      natureza: t(c, "natureza") as NaturezaDoPrecatorio,
      preferencia: (opcional(c, "preferencia") ?? "NENHUMA") as PreferenciaDoPrecatorio,
      diaApresentacao: t(c, "diaApresentacao"),
      exercicioDePagamento: n(c, "exercicioDePagamento", 0),
      valorOriginal: t(c, "valorOriginal"),
      contaContabilId: t(c, "contaContabilId"),
      criadoPor,
    })
  );
}

export async function acaoDoPrecatorio(
  acao: string,
  precatorioId: string,
  c: Campos
): Promise<void> {
  const comum = (criadoPor: string) => ({
    precatorioId,
    valor: t(c, "valor"),
    diaMovimento: t(c, "diaMovimento"),
    motivo: t(c, "motivo"),
    criadoPor,
  });
  switch (acao) {
    case "inscrever":
      await comEscritaAutenticada("INSCREVER_PRECATORIO", (criadoPor) =>
        inscreverPrecatorio(cliente(), comum(criadoPor))
      );
      return;
    case "atualizar":
      await comEscritaAutenticada("ATUALIZAR_PRECATORIO", (criadoPor) =>
        registrarAtualizacaoDePrecatorio(cliente(), {
          ...comum(criadoPor),
          competencia: t(c, "competencia"),
        })
      );
      return;
    case "cancelar":
      await comEscritaAutenticada("CANCELAR_PRECATORIO", (criadoPor) =>
        cancelarPrecatorio(cliente(), comum(criadoPor))
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

export async function criarConsorcio(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_CONSORCIO", (criadoPor) =>
    cadastrarConsorcio(cliente(), {
      identificador: t(c, "identificador"),
      denominacao: t(c, "denominacao"),
      cnpj: t(c, "cnpj"),
      protocoloDeIntencoes: t(c, "protocoloDeIntencoes"),
      leiRatificadora: t(c, "leiRatificadora"),
      areaDeAtuacao: t(c, "areaDeAtuacao"),
      fonteRecursoId: t(c, "fonteRecursoId"),
      contaContabilId: t(c, "contaContabilId"),
      criadoPor,
    })
  );
}

export async function acaoDoConsorcio(
  acao: string,
  consorcioId: string,
  c: Campos
): Promise<void> {
  switch (acao) {
    case "registrar-rateio":
      await comEscritaAutenticada("REGISTRAR_CONTRATO_DE_RATEIO", (criadoPor) =>
        registrarContratoDeRateio(cliente(), {
          consorcioId,
          exercicio: n(c, "exercicio", 0),
          valorDoEnte: t(c, "valorDoEnte"),
          diaAssinatura: t(c, "diaAssinatura"),
          ...(opcional(c, "aditivoDeId") !== undefined ? { aditivoDeId: t(c, "aditivoDeId") } : {}),
          criadoPor,
        })
      );
      return;
    case "repassar":
      await comEscritaAutenticada("REPASSAR_AO_CONSORCIO", (criadoPor) =>
        repassarAoConsorcio(cliente(), {
          consorcioId,
          exercicio: n(c, "exercicio", 0),
          valor: t(c, "valor"),
          diaMovimento: t(c, "diaMovimento"),
          competencia: t(c, "competencia"),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

export async function criarAuditoria(c: Campos): Promise<void> {
  await comEscritaAutenticada("ABRIR_AUDITORIA_INTERNA", (criadoPor) =>
    abrirAuditoria(cliente(), {
      identificador: t(c, "identificador"),
      objeto: t(c, "objeto"),
      tipo: t(c, "tipo") as "PROGRAMADA" | "EXTRAORDINARIA" | "MONITORAMENTO",
      orgaoId: t(c, "orgaoId"),
      diaPeriodoInicio: t(c, "diaPeriodoInicio"),
      diaPeriodoFim: t(c, "diaPeriodoFim"),
      responsavel: t(c, "responsavel"),
      diaAbertura: t(c, "diaAbertura"),
      motivo: t(c, "motivo"),
      itens: [],
      criadoPor,
    })
  );
}

export async function acaoDaAuditoria(
  acao: string,
  auditoriaId: string,
  c: Campos
): Promise<void> {
  switch (acao) {
    case "registrar-irregularidade":
      await comEscritaAutenticada("REGISTRAR_IRREGULARIDADE", (criadoPor) =>
        registrarIrregularidade(cliente(), {
          auditoriaId,
          descricao: t(c, "descricao"),
          gravidade: t(c, "gravidade") as "FORMAL" | "GRAVE" | "GRAVISSIMA",
          providencia: t(c, "providencia"),
          diaPrazo: t(c, "diaPrazo"),
          criadoPor,
        })
      );
      return;
    case "encerrar":
      await comEscritaAutenticada("ENCERRAR_AUDITORIA_INTERNA", (criadoPor) =>
        encerrarAuditoria(cliente(), {
          auditoriaId,
          diaEncerramento: t(c, "diaEncerramento"),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AS OPÇÕES DOS CAMPOS DE SELEÇÃO — lidas do banco, nunca constantes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * As opções por NOME DE CAMPO do descritor.
 *
 * ⚠️ O TIPO É INDEXADO POR STRING de propósito: quem o consome é o molde, que não conhece os
 * nomes dos campos deste cadastro. Uma interface com as três chaves fixas obrigaria cada
 * consumidor a mapeá-la à mão — e o mapeamento seria o lugar onde alguém esqueceria um campo.
 */
export type OpcoesDoCadastro = Readonly<
  Record<string, readonly { readonly valor: string; readonly rotulo: string }[]>
>;

export async function opcoesDoCadastro(): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [fontes, contas, orgaos] = await Promise.all([
    prisma.fonteRecurso.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
    // ⚠️ SÓ ANALÍTICAS. Lançar em conta sintética é o erro que o funil do M01 recusa — e
    // oferecê-la aqui seria montar um formulário que o domínio vai rejeitar.
    prisma.contaPcasp.findMany({
      where: { analitica: true },
      select: { id: true, codigo: true, nome: true },
      orderBy: { codigo: "asc" },
      take: 500,
    }),
    prisma.orgao.findMany({ select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" } }),
  ]);
  return {
    fonteRecursoId: fontes.map((f) => ({ valor: f.id, rotulo: `${f.codigo} — ${f.descricao}` })),
    contaContabilId: contas.map((c) => ({ valor: c.id, rotulo: `${c.codigo} — ${c.nome}` })),
    orgaoId: orgaos.map((o) => ({ valor: o.id, rotulo: `${o.codigo} — ${o.nome}` })),
  };
}
