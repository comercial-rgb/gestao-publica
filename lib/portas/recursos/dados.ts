import { Decimal, toMoney } from "../../../packages/contracts/index.js";
import {
  competenciaCivil,
  diaCivil,
  diaCivilBr,
  fimDoDiaCivil,
  meioDiaCivil,
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


const ROTULO_MOV_PROVISAO: Readonly<Record<string, string>> = {
  CONSTITUICAO: "Constituição",
  ATUALIZACAO: "Atualização",
  REVERSAO: "Reversão",
  ESTORNO_CONSTITUICAO: "Estorno da constituição",
  ESTORNO_ATUALIZACAO: "Estorno da atualização",
  ESTORNO_REVERSAO: "Estorno da reversão",
};

export async function listarProvisoes(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const where = q === "" ? {} : { OR: [{ identificador: texto(q) }, { descricao: texto(q) }] };

  const [total, linhas] = await Promise.all([
    prisma.provisaoMatematica.count({ where }),
    prisma.provisaoMatematica.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { identificador: "asc" } : { [c.ordem]: c.direcao },
      select: {
        id: true, identificador: true, descricao: true,
        movimentos: { select: { tipo: true, valor: true } },
      },
    }),
  ]);

  return {
    total,
    linhas: linhas.map((p) => ({
      id: p.id,
      identificador: p.identificador,
      descricao: p.descricao,
      constituido: somaDosTipos(p.movimentos, ["CONSTITUICAO", "ATUALIZACAO"]),
      revertido: somaDosTipos(p.movimentos, ["REVERSAO"]),
      // ⚠️ O SALDO VEM DO MÓDULO, não de `constituido − revertido`: os estornos entram com
      // o sinal deles, e quem conhece os sinais é `SINAL_MOVIMENTO_PROVISAO`.
      saldo: saldoDaProvisao(
        p.movimentos.map((m) => ({
          tipo: m.tipo as TipoMovimentoProvisao,
          valor: toMoney(m.valor.toFixed(2)),
        }))
      ).toFixed(2),
    })),
  };
}

export async function verProvisao(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const p = await prisma.provisaoMatematica.findUnique({
    where: { id },
    select: {
      identificador: true, descricao: true,
      contaContabil: { select: { codigo: true, nome: true } },
      movimentos: {
        select: {
          id: true, tipo: true, valor: true, competencia: true, dataMovimento: true,
          motivo: true, criadoEm: true, criadoPor: true,
          estornos: { select: { id: true } },
        },
        orderBy: { dataMovimento: "desc" },
      },
    },
  });
  if (p === null) return null;

  const saldo = saldoDaProvisao(
    p.movimentos.map((m) => ({
      tipo: m.tipo as TipoMovimentoProvisao,
      valor: toMoney(m.valor.toFixed(2)),
    }))
  );

  return {
    titulo: `Provisão ${p.identificador}`,
    subtitulo: p.descricao,
    selos: [
      {
        texto: saldo.isZero() ? "Sem saldo provisionado" : "Provisionada",
        tom: saldo.isZero() ? "ok" : "neutro",
      },
    ],
    dados: [
      { rotulo: "Descrição", valor: p.descricao, tipo: "longo" },
      { rotulo: "Constituído", valor: somaDosTipos(p.movimentos, ["CONSTITUICAO"]), tipo: "dinheiro",
        nota: "Variação patrimonial DIMINUTIVA — não é despesa orçamentária e não consome dotação." },
      { rotulo: "Atualizações", valor: somaDosTipos(p.movimentos, ["ATUALIZACAO"]), tipo: "dinheiro",
        nota: "Por competência, e idempotente: a mesma competência duas vezes é recusada." },
      { rotulo: "Revertido", valor: somaDosTipos(p.movimentos, ["REVERSAO"]), tipo: "dinheiro",
        nota: "O risco não se concretizou. Reverter acima do saldo é recusado no servidor." },
      { rotulo: "Saldo provisionado", valor: saldo.toFixed(2), tipo: "dinheiro",
        nota: "Derivado dos movimentos. Tem de bater com o saldo da conta de passivo." },
      { rotulo: "Conta do passivo", valor: `${p.contaContabil.codigo} — ${p.contaContabil.nome}` },
    ],
    historico: p.movimentos.map((m) => ({
      id: m.id,
      oQue: `${ROTULO_MOV_PROVISAO[m.tipo] ?? m.tipo}${m.competencia === null ? "" : ` — ${competenciaCivil(m.competencia)}`}`,
      quando: diaCivilBr(m.dataMovimento),
      registradoEm: diaCivilBr(m.criadoEm),
      por: m.criadoPor,
      motivo: m.motivo,
      valor: m.valor.toFixed(2),
      estornado: m.estornos.length > 0,
    })),
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

import {
  atualizarProvisao,
  cadastrarProvisao,
  constituirProvisao,
  reverterProvisao,
  saldoDaProvisao,
  type TipoMovimentoProvisao,
} from "../../../modules/m10-patrimonial/provisoes.js";
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
  cadastrarDivida,
  registrarAtualizacaoMonetaria,
  saldoDaDivida,
} from "../../../modules/m10-patrimonial/divida.js";
import type { TipoMovimentoDivida } from "../../../modules/m10-patrimonial/divida.js";
import {
  atualizarDividaAtiva,
  cadastrarDividaAtiva,
  cancelarDividaAtiva,
  inscreverDividaAtiva,
  saldoDaDividaAtiva,
  type TipoMovimentoDividaAtiva,
} from "../../../modules/m10-patrimonial/divida-ativa.js";
import {
  cadastrarObra,
  TIP_OBRA_SERVICO,
  type TipoObraServicoRepo,
} from "../../../modules/m11-licitacoes/obras.js";
import {
  aprovarMedicao,
  registrarMedicao,
} from "../../../modules/m11-licitacoes/medicoes.js";
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

// ══════════════════════════════════════════════════════════════════════════════
// ENT03c — DÍVIDA FUNDADA, DÍVIDA ATIVA E OBRAS
//
// ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Estas funções LEEM para a tela e DESPACHAM para o
// caso de uso. Todo saldo abaixo é `Σ(valor × sinal)` calculado pela função PURA do
// próprio módulo — nunca uma soma reescrita aqui. Duas aritméticas para o mesmo saldo é
// uma a mais do que se precisa para divergirem, e a que diverge é sempre a da tela.
// ══════════════════════════════════════════════════════════════════════════════

const ROTULO_TIPO_DIVIDA: Readonly<Record<string, string>> = {
  CONTRATUAL: "Contratual",
  MOBILIARIA: "Mobiliária",
};

const ROTULO_MOV_DIVIDA: Readonly<Record<string, string>> = {
  INGRESSO_OPERACAO_CREDITO: "Ingresso de operação de crédito",
  ATUALIZACAO_MONETARIA: "Atualização monetária",
  AMORTIZACAO: "Amortização",
  ESTORNO_INGRESSO_OPERACAO_CREDITO: "Estorno do ingresso",
  ESTORNO_ATUALIZACAO_MONETARIA: "Estorno da atualização",
  ESTORNO_AMORTIZACAO: "Estorno da amortização",
};

/** Σ de um subconjunto de tipos, em Decimal. O sinal vem do módulo, não daqui. */
function somaDosTipos(
  movimentos: readonly { readonly tipo: string; readonly valor: { toFixed(n: number): string } }[],
  tipos: readonly string[]
): string {
  let total = new Decimal("0.00");
  for (const m of movimentos) {
    if (tipos.includes(m.tipo)) total = total.plus(new Decimal(m.valor.toFixed(2)));
  }
  return total.toFixed(2);
}

export async function listarDividasFundadas(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const tipo = c.filtros["tipo"] ?? "";

  const where = {
    ...(q === "" ? {} : { OR: [{ identificador: texto(q) }, { credorNome: texto(q) }] }),
    ...(tipo === "" ? {} : { tipo: tipo as "CONTRATUAL" | "MOBILIARIA" }),
  };

  const [total, linhas] = await Promise.all([
    prisma.dividaConsolidada.count({ where }),
    prisma.dividaConsolidada.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { identificador: "asc" } : { [c.ordem]: c.direcao },
      select: {
        id: true, identificador: true, credorNome: true, tipo: true,
        movimentos: { select: { tipo: true, valor: true } },
      },
    }),
  ]);

  return {
    total,
    linhas: linhas.map((d) => {
      const movimentos = d.movimentos.map((m) => ({
        tipo: m.tipo as TipoMovimentoDivida,
        valor: toMoney(m.valor.toFixed(2)),
      }));
      return {
        id: d.id,
        identificador: d.identificador,
        credorNome: d.credorNome,
        tipo: ROTULO_TIPO_DIVIDA[d.tipo] ?? d.tipo,
        ingressado: somaDosTipos(d.movimentos, ["INGRESSO_OPERACAO_CREDITO"]),
        amortizado: somaDosTipos(d.movimentos, ["AMORTIZACAO"]),
        // ⚠️ O SALDO NÃO É `ingressado − amortizado`: a atualização monetária também o
        // move, e o estorno soma com o sinal dele. Quem sabe a conta é o módulo.
        saldo: saldoDaDivida(movimentos).toFixed(2),
      };
    }),
  };
}

export async function verDividaFundada(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const d = await prisma.dividaConsolidada.findUnique({
    where: { id },
    select: {
      identificador: true, credorNome: true, credorDocumento: true, tipo: true,
      leiAutorizativa: true, objeto: true,
      contaContabil: { select: { codigo: true, nome: true } },
      movimentos: {
        select: {
          id: true, tipo: true, valor: true, competencia: true, dataMovimento: true,
          motivo: true, criadoEm: true, criadoPor: true,
          estornos: { select: { id: true } },
        },
        orderBy: { dataMovimento: "desc" },
      },
    },
  });
  if (d === null) return null;

  const movimentos = d.movimentos.map((m) => ({
    tipo: m.tipo as TipoMovimentoDivida,
    valor: toMoney(m.valor.toFixed(2)),
  }));
  const saldo = saldoDaDivida(movimentos);

  return {
    titulo: `Dívida ${d.identificador}`,
    subtitulo: `${ROTULO_TIPO_DIVIDA[d.tipo] ?? d.tipo} · ${d.credorNome}`,
    selos: [
      { texto: ROTULO_TIPO_DIVIDA[d.tipo] ?? d.tipo, tom: "neutro" },
      {
        texto: saldo.isZero() ? "Quitada" : "Em aberto",
        tom: saldo.isZero() ? "ok" : "neutro",
      },
    ],
    dados: [
      { rotulo: "Objeto", valor: d.objeto, tipo: "longo" },
      { rotulo: "Credor", valor: `${d.credorNome} · ${d.credorDocumento}` },
      { rotulo: "Lei autorizativa", valor: d.leiAutorizativa, nota: "LRF art. 32" },
      { rotulo: "Ingressado", valor: somaDosTipos(d.movimentos, ["INGRESSO_OPERACAO_CREDITO"]), tipo: "dinheiro",
        nota: "Lançado pelo M04 — o ingresso é receita de operação de crédito, e é fato permutativo." },
      { rotulo: "Atualização monetária", valor: somaDosTipos(d.movimentos, ["ATUALIZACAO_MONETARIA"]), tipo: "dinheiro",
        nota: "O único movimento que nasce aqui — e o único que reduz o patrimônio." },
      { rotulo: "Amortizado", valor: somaDosTipos(d.movimentos, ["AMORTIZACAO"]), tipo: "dinheiro",
        nota: "Lançado pelo M05 dentro do pagamento — pagar principal é permutativo, não é VPD." },
      { rotulo: "Saldo devedor", valor: saldo.toFixed(2), tipo: "dinheiro",
        nota: "Derivado dos movimentos. Tem de bater com o saldo da conta contábil do passivo." },
      { rotulo: "Conta do passivo", valor: `${d.contaContabil.codigo} — ${d.contaContabil.nome}` },
    ],
    historico: d.movimentos.map((m) => ({
      id: m.id,
      oQue: `${ROTULO_MOV_DIVIDA[m.tipo] ?? m.tipo}${m.competencia === null ? "" : ` — ${competenciaCivil(m.competencia)}`}`,
      quando: diaCivilBr(m.dataMovimento),
      registradoEm: diaCivilBr(m.criadoEm),
      por: m.criadoPor,
      motivo: m.motivo,
      valor: m.valor.toFixed(2),
      estornado: m.estornos.length > 0,
    })),
  };
}

const ROTULO_ORIGEM_ATIVA: Readonly<Record<string, string>> = {
  TRIBUTARIA: "Tributária",
  NAO_TRIBUTARIA: "Não tributária",
};

const ROTULO_MOV_ATIVA: Readonly<Record<string, string>> = {
  INSCRICAO: "Inscrição",
  ATUALIZACAO: "Atualização (juros, multa, correção)",
  RECEBIMENTO: "Recebimento",
  CANCELAMENTO: "Cancelamento",
  ESTORNO_INSCRICAO: "Estorno da inscrição",
  ESTORNO_ATUALIZACAO: "Estorno da atualização",
  ESTORNO_RECEBIMENTO: "Estorno do recebimento",
  ESTORNO_CANCELAMENTO: "Estorno do cancelamento",
};

export async function listarDividasAtivas(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const origem = c.filtros["origem"] ?? "";

  const where = {
    ...(q === "" ? {} : { OR: [{ identificador: texto(q) }, { devedorNome: texto(q) }] }),
    ...(origem === "" ? {} : { origem: origem as "TRIBUTARIA" | "NAO_TRIBUTARIA" }),
  };

  const [total, linhas] = await Promise.all([
    prisma.dividaAtiva.count({ where }),
    prisma.dividaAtiva.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { identificador: "asc" } : { [c.ordem]: c.direcao },
      select: {
        id: true, identificador: true, devedorNome: true, origem: true,
        movimentos: { select: { tipo: true, valor: true } },
      },
    }),
  ]);

  return {
    total,
    linhas: linhas.map((d) => {
      const movimentos = d.movimentos.map((m) => ({
        tipo: m.tipo as TipoMovimentoDividaAtiva,
        valor: toMoney(m.valor.toFixed(2)),
      }));
      return {
        id: d.id,
        identificador: d.identificador,
        devedorNome: d.devedorNome,
        origem: ROTULO_ORIGEM_ATIVA[d.origem] ?? d.origem,
        inscrito: somaDosTipos(d.movimentos, ["INSCRICAO", "ATUALIZACAO"]),
        baixado: somaDosTipos(d.movimentos, ["RECEBIMENTO", "CANCELAMENTO"]),
        saldo: saldoDaDividaAtiva(movimentos).toFixed(2),
      };
    }),
  };
}

export async function verDividaAtiva(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const d = await prisma.dividaAtiva.findUnique({
    where: { id },
    select: {
      identificador: true, devedorNome: true, devedorDocumento: true, origem: true,
      contaContabil: { select: { codigo: true, nome: true } },
      movimentos: {
        select: {
          id: true, tipo: true, valor: true, competencia: true, dataMovimento: true,
          motivo: true, criadoEm: true, criadoPor: true,
          estornos: { select: { id: true } },
        },
        orderBy: { dataMovimento: "desc" },
      },
    },
  });
  if (d === null) return null;

  const movimentos = d.movimentos.map((m) => ({
    tipo: m.tipo as TipoMovimentoDividaAtiva,
    valor: toMoney(m.valor.toFixed(2)),
  }));
  const saldo = saldoDaDividaAtiva(movimentos);

  return {
    titulo: `Dívida ativa ${d.identificador}`,
    subtitulo: `${ROTULO_ORIGEM_ATIVA[d.origem] ?? d.origem} · ${d.devedorNome}`,
    selos: [
      { texto: ROTULO_ORIGEM_ATIVA[d.origem] ?? d.origem, tom: "neutro" },
      {
        texto: saldo.isZero() ? "Baixada" : "A receber",
        tom: saldo.isZero() ? "ok" : "neutro",
      },
    ],
    dados: [
      { rotulo: "Devedor", valor: `${d.devedorNome} · ${d.devedorDocumento}` },
      { rotulo: "Origem", valor: ROTULO_ORIGEM_ATIVA[d.origem] ?? d.origem,
        nota: "Art. 39, § 2º da Lei 4.320/64 — o rol tem DUAS origens, e só duas." },
      { rotulo: "Inscrito", valor: somaDosTipos(d.movimentos, ["INSCRICAO"]), tipo: "dinheiro",
        nota: "A inscrição reconhece um crédito que o ente não tinha: o patrimônio cresce (VPA)." },
      { rotulo: "Atualizações", valor: somaDosTipos(d.movimentos, ["ATUALIZACAO"]), tipo: "dinheiro",
        nota: "Juros, multa e correção — também VPA, e idempotentes por competência." },
      { rotulo: "Recebido", valor: somaDosTipos(d.movimentos, ["RECEBIMENTO"]), tipo: "dinheiro",
        nota: "Entra pela receita (M04). Aqui é permutativo: um ativo vira outro, SEM nova VPA." },
      { rotulo: "Cancelado", valor: somaDosTipos(d.movimentos, ["CANCELAMENTO"]), tipo: "dinheiro",
        nota: "Prescrição, remissão ou decisão judicial — o crédito morre e a perda é VPD." },
      { rotulo: "Saldo a receber", valor: saldo.toFixed(2), tipo: "dinheiro",
        nota: "Derivado dos movimentos, e conferido contra o razão pelo teste de integração." },
      { rotulo: "Conta do ativo", valor: `${d.contaContabil.codigo} — ${d.contaContabil.nome}` },
    ],
    historico: d.movimentos.map((m) => ({
      id: m.id,
      oQue: `${ROTULO_MOV_ATIVA[m.tipo] ?? m.tipo}${m.competencia === null ? "" : ` — ${competenciaCivil(m.competencia)}`}`,
      quando: diaCivilBr(m.dataMovimento),
      registradoEm: diaCivilBr(m.criadoEm),
      por: m.criadoPor,
      motivo: m.motivo,
      valor: m.valor.toFixed(2),
      estornado: m.estornos.length > 0,
    })),
  };
}

export async function listarObras(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const tipo = c.filtros["tipoObraServico"] ?? "";

  const where = {
    ...(q === "" ? {} : { OR: [{ identificador: texto(q) }, { descricao: texto(q) }] }),
    ...(tipo === "" ? {} : { tipoObraServico: tipo as TipoObraServicoRepo }),
  };

  const [total, linhas] = await Promise.all([
    prisma.obra.count({ where }),
    prisma.obra.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { identificador: "asc" } : { [c.ordem]: c.direcao },
      select: {
        id: true, identificador: true, descricao: true, tipoObraServico: true, ativa: true,
        medicoes: { select: { valorMedido: true, aprovadaEm: true } },
      },
    }),
  ]);

  return {
    total,
    linhas: linhas.map((o) => {
      let medido = new Decimal("0.00");
      let aprovado = new Decimal("0.00");
      for (const m of o.medicoes) {
        medido = medido.plus(new Decimal(m.valorMedido.toFixed(2)));
        if (m.aprovadaEm !== null) aprovado = aprovado.plus(new Decimal(m.valorMedido.toFixed(2)));
      }
      return {
        id: o.id,
        identificador: o.identificador,
        descricao: o.descricao,
        tipo: `${TIP_OBRA_SERVICO[o.tipoObraServico as TipoObraServicoRepo]} — ${o.tipoObraServico}`,
        medicoes: String(o.medicoes.length),
        medido: medido.toFixed(2),
        aprovado: aprovado.toFixed(2),
        // ⚠️ A SITUAÇÃO É DERIVADA, e a diferença entre medido e aprovado é a informação:
        // medição pendente é obra que ainda NÃO pode ser liquidada.
        estado: !o.ativa
          ? "Inativa"
          : o.medicoes.length === 0
            ? "Sem medição"
            : medido.equals(aprovado)
              ? "Medições aprovadas"
              : "Medição pendente de aprovação",
      };
    }),
  };
}

export async function verObra(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const o = await prisma.obra.findUnique({
    where: { id },
    select: {
      identificador: true, descricao: true, tipoObraServico: true, cei: true, ativa: true,
      orgao: { select: { codigo: true, nome: true } },
      medicoes: {
        select: {
          id: true, numero: true, valorMedido: true, periodoInicio: true, periodoFim: true,
          responsavelTecnico: true, registroProfissional: true,
          aprovadaEm: true, aprovadaPor: true, criadoEm: true, criadoPor: true,
          contrato: { select: { numeroContrato: true } },
        },
        orderBy: { numero: "desc" },
      },
    },
  });
  if (o === null) return null;

  let medido = new Decimal("0.00");
  let aprovado = new Decimal("0.00");
  for (const m of o.medicoes) {
    medido = medido.plus(new Decimal(m.valorMedido.toFixed(2)));
    if (m.aprovadaEm !== null) aprovado = aprovado.plus(new Decimal(m.valorMedido.toFixed(2)));
  }
  const pendentes = o.medicoes.filter((m) => m.aprovadaEm === null).length;

  return {
    titulo: `Obra ${o.identificador}`,
    subtitulo: o.descricao,
    selos: [
      { texto: o.ativa ? "Ativa" : "Inativa", tom: o.ativa ? "ok" : "neutro" },
      ...(pendentes > 0
        ? [{ texto: `${pendentes} medição(ões) a aprovar`, tom: "alerta" as const }]
        : []),
    ],
    dados: [
      { rotulo: "Descrição", valor: o.descricao, tipo: "longo" },
      { rotulo: "Tipo", valor: `${TIP_OBRA_SERVICO[o.tipoObraServico as TipoObraServicoRepo]} — ${o.tipoObraServico}`,
        nota: "Rol FECHADO da IN/INSS/DC 100/2003 — é norma, não catálogo do ente." },
      {
        rotulo: "CEI",
        valor: o.cei ?? "não informado",
        ...(o.cei === null
          ? { nota: "A obra existe antes da matrícula; um CEI inventado seria pior que o vazio." }
          : {}),
      },
      { rotulo: "Órgão responsável", valor: o.orgao === null ? "não informado" : `${o.orgao.codigo} — ${o.orgao.nome}` },
      { rotulo: "Total medido", valor: medido.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Total aprovado", valor: aprovado.toFixed(2), tipo: "dinheiro",
        nota: "Só o APROVADO autoriza liquidar — e não se liquida acima do medido." },
    ],
    historico: o.medicoes.map((m) => ({
      id: m.id,
      oQue:
        `Medição ${m.numero} (contrato ${m.contrato.numeroContrato}) — ` +
        `${diaCivilBr(m.periodoInicio)} a ${diaCivilBr(m.periodoFim)} · ` +
        `${m.responsavelTecnico}${m.registroProfissional === null ? "" : ` (${m.registroProfissional})`}` +
        (m.aprovadaEm === null ? " · AGUARDANDO APROVAÇÃO" : ` · aprovada por ${m.aprovadaPor ?? ""}`),
      quando: diaCivilBr(m.periodoFim),
      registradoEm: diaCivilBr(m.criadoEm),
      por: m.criadoPor,
      motivo: null,
      valor: m.valorMedido.toFixed(2),
      estornado: false,
    })),
  };
}

// ── AS ESCRITAS ────────────────────────────────────────────────────────────

export async function criarDividaFundada(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_DIVIDA", (criadoPor) =>
    cadastrarDivida(cliente(), {
      identificador: t(c, "identificador"),
      credorNome: t(c, "credorNome"),
      credorDocumento: t(c, "credorDocumento"),
      tipo: t(c, "tipo") as "CONTRATUAL" | "MOBILIARIA",
      leiAutorizativa: t(c, "leiAutorizativa"),
      objeto: t(c, "objeto"),
      contaContabilId: t(c, "contaContabilId"),
      criadoPor,
    })
  );
}

export async function acaoDaDividaFundada(
  acao: string,
  dividaId: string,
  c: Campos
): Promise<void> {
  switch (acao) {
    case "atualizacao-monetaria":
      await comEscritaAutenticada("REGISTRAR_ATUALIZACAO_MONETARIA", (criadoPor) =>
        registrarAtualizacaoMonetaria(cliente(), {
          dividaId,
          valor: t(c, "valor"),
          competencia: t(c, "competencia"),
          dataMovimento: meioDiaCivil(t(c, "diaMovimento")),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

export async function criarDividaAtiva(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_DIVIDA_ATIVA", (criadoPor) =>
    cadastrarDividaAtiva(cliente(), {
      identificador: t(c, "identificador"),
      devedorNome: t(c, "devedorNome"),
      devedorDocumento: t(c, "devedorDocumento"),
      origem: t(c, "origem") as "TRIBUTARIA" | "NAO_TRIBUTARIA",
      contaContabilId: t(c, "contaContabilId"),
      criadoPor,
    })
  );
}

export async function acaoDaDividaAtiva(
  acao: string,
  dividaAtivaId: string,
  c: Campos
): Promise<void> {
  const dataMovimento = meioDiaCivil(t(c, "diaMovimento"));
  switch (acao) {
    case "inscrever":
      await comEscritaAutenticada("INSCREVER_DIVIDA_ATIVA", (criadoPor) =>
        inscreverDividaAtiva(cliente(), {
          dividaAtivaId,
          valor: t(c, "valor"),
          dataMovimento,
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    case "atualizar":
      await comEscritaAutenticada("ATUALIZAR_DIVIDA_ATIVA", (criadoPor) =>
        atualizarDividaAtiva(cliente(), {
          dividaAtivaId,
          valor: t(c, "valor"),
          competencia: t(c, "competencia"),
          dataMovimento,
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    case "cancelar":
      await comEscritaAutenticada("CANCELAR_DIVIDA_ATIVA", (criadoPor) =>
        cancelarDividaAtiva(cliente(), {
          dividaAtivaId,
          valor: t(c, "valor"),
          dataMovimento,
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

export async function criarObra(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_OBRA", (criadoPor) =>
    cadastrarObra(cliente(), {
      identificador: t(c, "identificador"),
      descricao: t(c, "descricao"),
      tipoObraServico: t(c, "tipoObraServico") as TipoObraServicoRepo,
      ...(opcional(c, "cei") !== undefined ? { cei: t(c, "cei") } : {}),
      ...(opcional(c, "orgaoId") !== undefined ? { orgaoId: t(c, "orgaoId") } : {}),
      criadoPor,
    })
  );
}

export async function acaoDaObra(acao: string, obraId: string, c: Campos): Promise<void> {
  switch (acao) {
    case "medir":
      await comEscritaAutenticada("REGISTRAR_MEDICAO_DE_OBRA", (criadoPor) =>
        registrarMedicao(cliente(), {
          obraId,
          contratoId: t(c, "contratoId"),
          numero: n(c, "numero", 1),
          diaInicio: t(c, "diaInicio"),
          diaFim: t(c, "diaFim"),
          valorMedido: t(c, "valorMedido"),
          responsavelTecnico: t(c, "responsavelTecnico"),
          registroProfissional: t(c, "registroProfissional"),
          criadoPor,
        })
      );
      return;
    case "aprovar":
      // ⚠️ O `criadoPor` QUE CHEGA AQUI É QUEM ESTÁ NA SESSÃO, e é ele que o caso de uso
      // compara com quem mediu. A segregação "quem mede não aprova" é conferida NO
      // SERVIDOR — mandar o aprovador pelo formulário deixaria o próprio medidor
      // escolher o crachá.
      await comEscritaAutenticada("APROVAR_MEDICAO_DE_OBRA", (criadoPor) =>
        aprovarMedicao(cliente(), {
          medicaoId: t(c, "medicaoId"),
          diaAprovacao: t(c, "diaAprovacao"),
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

export type OpcoesDoCadastro = Readonly<
  Record<string, readonly { readonly valor: string; readonly rotulo: string }[]>
>;

/**
 * ⚠️ O PARÂMETRO OPCIONAL EXISTE POR CAUSA DA MEDIÇÃO, e ele é a exceção que o molde
 * previa: quase toda opção é do ENTE (fontes, contas, órgãos) e não depende de qual
 * registro está aberto. A medição não — "aprovar medição" só pode oferecer as medições
 * DAQUELA obra, e oferecer as de outra obra seria montar um formulário que o caso de uso
 * vai recusar (`m11-medicoes-integracao.test.ts` t6b prova a recusa).
 */
export async function opcoesDoCadastro(
  p: {
    readonly obraId?: string;
    /**
     * As CLASSES do PCASP que este formulário aceita — "2" para conta de passivo, "1"
     * para ativo, "7"/"8" para controle.
     *
     * ⚠️ ISTO NASCEU DE UM DEFEITO REAL, E DE UMA ARMADILHA DE TRUNCAMENTO. Enquanto o
     * banco tinha 64 contas, `take: 500` pegava todas e o filtro não fazia falta. Com o
     * plano oficial (7.864 contas, 6.074 analíticas) as 500 primeiras POR CÓDIGO são
     * todas da classe 1 — e o campo "Conta do passivo" da dívida fundada passou a não
     * oferecer NENHUMA conta de passivo. O formulário continuava montando, bonito e
     * inútil: o defeito não era um erro, era uma lista curta.
     *
     * Sem filtro, a alternativa seria mandar as 6.074 opções para o navegador (~400 KB
     * de HTML por `select`) e ainda deixar o operador escolher uma conta de ativo onde
     * o domínio exige passivo — que o caso de uso recusaria depois.
     */
    readonly classesDeConta?: readonly string[];
  } = {}
): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [fontes, contas, orgaos, contratos, medicoes] = await Promise.all([
    prisma.fonteRecurso.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
    // ⚠️ SÓ ANALÍTICAS. Lançar em conta sintética é o erro que o funil do M01 recusa — e
    // oferecê-la aqui seria montar um formulário que o domínio vai rejeitar.
    prisma.contaPcasp.findMany({
      where: {
        analitica: true,
        ...(p.classesDeConta === undefined || p.classesDeConta.length === 0
          ? {}
          : { OR: p.classesDeConta.map((c) => ({ codigo: { startsWith: `${c}.` } })) }),
      },
      select: { id: true, codigo: true, nome: true },
      orderBy: { codigo: "asc" },
      // ⚠️ O TETO COBRE A MAIOR CLASSE INTEIRA (a 1 tem 1.401 analíticas no plano
      // oficial). Um teto abaixo disso volta a truncar em silêncio — ver acima.
      take: 2000,
    }),
    prisma.orgao.findMany({ select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" } }),
    prisma.contrato.findMany({
      select: { id: true, numeroContrato: true, contratadoNome: true },
      orderBy: { numeroContrato: "asc" },
      take: 500,
    }),
    p.obraId === undefined
      ? Promise.resolve([])
      : prisma.medicaoDeObra.findMany({
          // ⚠️ SÓ AS NÃO APROVADAS: aprovar duas vezes é recusado no servidor porque a
          // segunda apagaria quem aprovou primeiro (t3b). Oferecer a já aprovada seria
          // convidar para uma recusa.
          where: { obraId: p.obraId, aprovadaEm: null },
          select: { id: true, numero: true, valorMedido: true, periodoFim: true },
          orderBy: { numero: "asc" },
        }),
  ]);
  return {
    fonteRecursoId: fontes.map((f) => ({ valor: f.id, rotulo: `${f.codigo} — ${f.descricao}` })),
    contaContabilId: contas.map((c) => ({ valor: c.id, rotulo: `${c.codigo} — ${c.nome}` })),
    orgaoId: orgaos.map((o) => ({ valor: o.id, rotulo: `${o.codigo} — ${o.nome}` })),
    contratoId: contratos.map((c) => ({
      valor: c.id,
      rotulo: `${c.numeroContrato} — ${c.contratadoNome}`,
    })),
    medicaoId: medicoes.map((m) => ({
      valor: m.id,
      rotulo: `Medição ${m.numero} — ${m.valorMedido.toFixed(2)} (até ${diaCivilBr(m.periodoFim)})`,
    })),
  };
}

export async function criarProvisao(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_PROVISAO", (criadoPor) =>
    cadastrarProvisao(cliente(), {
      identificador: t(c, "identificador"),
      descricao: t(c, "descricao"),
      contaContabilId: t(c, "contaContabilId"),
      criadoPor,
    })
  );
}

export async function acaoDaProvisao(
  acao: string,
  provisaoId: string,
  c: Campos
): Promise<void> {
  switch (acao) {
    case "constituir":
      await comEscritaAutenticada("CONSTITUIR_PROVISAO", (criadoPor) =>
        constituirProvisao(cliente(), {
          provisaoId,
          valor: t(c, "valor"),
          dataMovimento: meioDiaCivil(t(c, "diaMovimento")),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    case "atualizar":
      await comEscritaAutenticada("ATUALIZAR_PROVISAO", (criadoPor) =>
        atualizarProvisao(cliente(), {
          provisaoId,
          valor: t(c, "valor"),
          competencia: t(c, "competencia"),
          dataMovimento: meioDiaCivil(t(c, "diaMovimento")),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    case "reverter":
      await comEscritaAutenticada("REVERTER_PROVISAO", (criadoPor) =>
        reverterProvisao(cliente(), {
          provisaoId,
          valor: t(c, "valor"),
          dataMovimento: meioDiaCivil(t(c, "diaMovimento")),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}
