import { cliente } from "./cliente";
import { ROTULO_COMBUSTIVEL } from "../../modules/m36-frota/dominio";
import { cadastrarTanqueDeCombustivel, saldoDoTanqueNaTx } from "../../modules/m36-frota/tanque";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { acoesPermitidas } from "./molde";
import { diaCivil, diaCivilBr, diferencaEmDiasCivis, meioDiaCivil } from "../../packages/datas/index";
import { toMoney } from "../../packages/contracts/index.js";
import {
  abrirManutencaoDaFrota,
  autorizarManutencaoDaFrota,
  cadastrarCondutor,
  cancelarManutencaoDaFrota,
  cancelarOrdemDeAbastecimento,
  concluirManutencaoDaFrota,
  consumoDoBemDaFrota,
  declararExigenciaDeHabilitacao,
  emitirOrdemDeAbastecimento,
  publicarVersaoDoCondutor,
  registrarLeituraDoMarcador,
  type ConsumoNoAbastecimento,
} from "../../modules/m36-frota/operacao";

/**
 * V39-R2 (R2-025 a R2-028) — A TELA DA OPERAÇÃO DA FROTA: condutores (com o alerta da CNH), exigência de habilitação,
 * ordens de abastecimento (com o abastecido e o saldo), leituras e consumo de um bem, e manutenções. Leitura sob
 * CONSULTAR_PATRIMONIO; cada ato cobra a sua ação no serviço.
 */

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
/** O aviso da CNH: quantos dias antes do vencimento a tela começa a avisar. Parâmetro de tela, não regra. */
export const DIAS_DE_AVISO_DA_CNH = 30;

export interface TelaDaOperacaoDaFrota {
  readonly bens: readonly { readonly chave: string; readonly rotulo: string }[];
  readonly condutores: readonly { readonly id: string; readonly nome: string; readonly matricula: string; readonly categoria: string; readonly validade: string; readonly ativo: boolean; readonly aviso: string | null }[];
  readonly ordens: readonly { readonly id: string; readonly numero: number; readonly bem: string; readonly condutor: string; readonly combustivel: string; readonly autorizado: string; readonly abastecido: string; readonly saldo: string; readonly prazo: string; readonly situacao: string }[];
  readonly manutencoes: readonly { readonly id: string; readonly numero: number; readonly bem: string; readonly tipo: string; readonly descricao: string; readonly situacao: "PEDIDA" | "AUTORIZADA" | "CONCLUIDA" | "CANCELADA"; readonly detalhe: string }[];
  readonly contratos: readonly { readonly id: string; readonly rotulo: string }[];
  readonly bemEscolhido: { readonly chave: string; readonly rotulo: string; readonly unidade: string; readonly consumo: readonly ConsumoNoAbastecimento[]; readonly leituras: readonly { readonly id: string; readonly rotulo: string }[] } | null;
  readonly pode: { readonly cadastrar: boolean; readonly ordem: boolean; readonly leitura: boolean; readonly autorizarManutencao: boolean };
  /** V39-R3 (R3-018) — os tanques próprios, com o saldo pela soma dos movimentos, e o que o cadastro oferece. */
  readonly tanques: readonly { readonly id: string; readonly codigo: string; readonly descricao: string; readonly deposito: string; readonly combustivel: string; readonly saldo: string; readonly capacidade: string }[];
  readonly depositosParaTanque: readonly { readonly id: string; readonly rotulo: string }[];
  readonly combustiveisDoAlmoxarifado: readonly { readonly id: string; readonly rotulo: string }[];
}

const alvoDaChave = (chave: string): { veiculoId: string } | { maquinaId: string } | null =>
  chave.startsWith("v:") ? { veiculoId: chave.slice(2) } : chave.startsWith("m:") ? { maquinaId: chave.slice(2) } : null;

export async function lerTelaDaOperacaoDaFrota(bemChave: string | undefined): Promise<TelaDaOperacaoDaFrota> {
  await exigirLeituraDoEnte("CONSULTAR_PATRIMONIO");
  const prisma = cliente();
  const hoje = diaCivil(new Date());
  const [veiculos, maquinas, condutores, ordens, manutencoes, contratos, permitidas] = await Promise.all([
    prisma.veiculoDaFrota.findMany({ orderBy: { placa: "asc" }, select: { id: true, placa: true } }),
    prisma.maquinaDaFrota.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, versoes: { orderBy: { versao: "desc" }, take: 1, select: { descricao: true } } } }),
    prisma.condutorDaFrota.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, matricula: true, versoes: { orderBy: { versao: "asc" }, select: { cnhCategoria: true, cnhValidade: true, ativo: true, vigenteDesde: true } } } }),
    prisma.ordemDeAbastecimento.findMany({
      orderBy: { numero: "desc" }, take: 50,
      select: { id: true, numero: true, combustivel: true, quantidadeAutorizada: true, emitidaEm: true, validaAte: true, veiculo: { select: { placa: true } }, maquina: { select: { codigo: true } }, condutor: { select: { nome: true } }, cancelamento: { select: { id: true } }, abastecimentos: { select: { quantidade: true, anulacao: { select: { id: true } } } } },
    }),
    prisma.manutencaoDaFrota.findMany({
      orderBy: { numero: "desc" }, take: 50,
      select: { id: true, numero: true, tipo: true, descricao: true, dataDoPedido: true, veiculo: { select: { placa: true } }, maquina: { select: { codigo: true } }, autorizacao: { select: { data: true, fornecedor: true, valorEstimado: true, contrato: { select: { numeroContrato: true } } } }, conclusao: { select: { data: true, custo: true, documento: true } }, cancelamento: { select: { motivo: true } } },
    }),
    prisma.contrato.findMany({ orderBy: { numeroContrato: "asc" }, take: 200, select: { id: true, numeroContrato: true } }),
    acoesPermitidas(["CADASTRAR_FROTA", "EMITIR_ORDEM_DE_ABASTECIMENTO", "REGISTRAR_ABASTECIMENTO", "AUTORIZAR_MANUTENCAO_DA_FROTA"]),
  ]);
  const bens = [...veiculos.map((v) => ({ chave: `v:${v.id}`, rotulo: `Veículo ${v.placa}` })), ...maquinas.map((m) => ({ chave: `m:${m.id}`, rotulo: `Máquina ${m.codigo}${m.versoes[0] ? ` — ${m.versoes[0].descricao}` : ""}` }))];
  let bemEscolhido: TelaDaOperacaoDaFrota["bemEscolhido"] = null;
  const alvo = bemChave === undefined ? null : alvoDaChave(bemChave);
  if (alvo !== null && bemChave !== undefined) {
    const ehVeiculo = "veiculoId" in alvo;
    const [consumo, leituras] = await Promise.all([
      consumoDoBemDaFrota(prisma, alvo, ehVeiculo),
      prisma.leituraDoMarcadorDaFrota.findMany({ where: { ...alvo, corrigidaPor: null }, orderBy: { data: "desc" }, take: 30, select: { id: true, data: true, valor: true } }),
    ]);
    bemEscolhido = {
      chave: bemChave, rotulo: bens.find((b) => b.chave === bemChave)?.rotulo ?? "", unidade: ehVeiculo ? "km por litro" : "litros por hora", consumo,
      leituras: leituras.map((l) => ({ id: l.id, rotulo: `${diaCivilBr(l.data)}: ${l.valor.toFixed(1)} ${ehVeiculo ? "km" : "h"}` })),
    };
  }
  return {
    bens,
    condutores: condutores.flatMap((c) => {
      // A versão que vale HOJE (a mesma régua do serviço), não a última publicada, que pode valer só no futuro.
      const v = c.versoes.filter((x) => diaCivil(x.vigenteDesde) <= hoje).pop() ?? c.versoes[0];
      if (v === undefined) return [];
      const validade = diaCivil(v.cnhValidade);
      const dias = diferencaEmDiasCivis(v.cnhValidade, meioDiaCivil(hoje));
      const aviso = !v.ativo ? null : validade < hoje ? "CNH vencida" : dias <= DIAS_DE_AVISO_DA_CNH ? `CNH vence em ${String(dias)} dia(s)` : null;
      return [{ id: c.id, nome: c.nome, matricula: c.matricula, categoria: v.cnhCategoria, validade: diaCivilBr(v.cnhValidade), ativo: v.ativo, aviso }];
    }),
    ordens: ordens.map((o) => {
      const autorizado = toMoney(o.quantidadeAutorizada.toFixed(2));
      const abastecido = o.abastecimentos.filter((a) => a.anulacao === null).reduce((s, a) => toMoney(s.plus(a.quantidade.toFixed(2))), toMoney(0));
      const saldo = toMoney(autorizado.minus(abastecido));
      const situacao = o.cancelamento !== null ? "cancelada" : !saldo.greaterThan(0) ? "atendida" : diaCivil(o.validaAte) < hoje ? "vencida" : "aberta";
      return {
        id: o.id, numero: o.numero, bem: o.veiculo !== null ? o.veiculo.placa : (o.maquina?.codigo ?? ""), condutor: o.condutor.nome, combustivel: o.combustivel.toLowerCase().replace("_", " "),
        autorizado: autorizado.toFixed(2), abastecido: abastecido.toFixed(2), saldo: saldo.toFixed(2), prazo: `${diaCivilBr(o.emitidaEm)} a ${diaCivilBr(o.validaAte)}`, situacao,
      };
    }),
    manutencoes: manutencoes.map((m) => {
      const situacao = m.cancelamento !== null ? "CANCELADA" : m.conclusao !== null ? "CONCLUIDA" : m.autorizacao !== null ? "AUTORIZADA" : "PEDIDA";
      const partes = [`pedida em ${diaCivilBr(m.dataDoPedido)}`];
      if (m.autorizacao !== null) partes.push(`autorizada em ${diaCivilBr(m.autorizacao.data)} a ${m.autorizacao.fornecedor}${m.autorizacao.contrato !== null ? ` (contrato ${m.autorizacao.contrato.numeroContrato})` : ""}, estimada em R$ ${m.autorizacao.valorEstimado.toFixed(2).replace(".", ",")}`);
      if (m.conclusao !== null) partes.push(`concluída em ${diaCivilBr(m.conclusao.data)}, custo R$ ${m.conclusao.custo.toFixed(2).replace(".", ",")} (${m.conclusao.documento})`);
      if (m.cancelamento !== null) partes.push(`cancelada: ${m.cancelamento.motivo}`);
      return { id: m.id, numero: m.numero, bem: m.veiculo !== null ? m.veiculo.placa : (m.maquina?.codigo ?? ""), tipo: m.tipo === "PREVENTIVA" ? "preventiva" : "corretiva", descricao: m.descricao, situacao, detalhe: partes.join("; ") };
    }),
    contratos: contratos.map((c) => ({ id: c.id, rotulo: c.numeroContrato })),
    bemEscolhido,
    ...(await tanquesDaTela(prisma)),
    pode: { cadastrar: permitidas.has("CADASTRAR_FROTA"), ordem: permitidas.has("EMITIR_ORDEM_DE_ABASTECIMENTO"), leitura: permitidas.has("REGISTRAR_ABASTECIMENTO"), autorizarManutencao: permitidas.has("AUTORIZAR_MANUTENCAO_DA_FROTA") },
  };
}

/** V39-R3 (R3-018) — os tanques com o saldo, os depósitos livres e os combustíveis do almoxarifado. */
async function tanquesDaTela(prisma: ReturnType<typeof cliente>): Promise<Pick<TelaDaOperacaoDaFrota, "tanques" | "depositosParaTanque" | "combustiveisDoAlmoxarifado">> {
  const [tanques, livres, combustiveis] = await Promise.all([
    prisma.tanqueDeCombustivel.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true, combustivel: true, capacidade: true, depositoId: true, materialId: true, deposito: { select: { codigo: true } } } }),
    prisma.deposito.findMany({ where: { ativo: true, tanque: null, farmacia: null }, orderBy: { codigo: "asc" }, take: 200, select: { id: true, codigo: true, nome: true } }),
    prisma.material.findMany({ where: { categoria: "COMBUSTIVEL" }, orderBy: { codigo: "asc" }, take: 200, select: { id: true, codigo: true, descricaoSucinta: true } }),
  ]);
  const comSaldo = [];
  for (const t of tanques) {
    const saldo = await saldoDoTanqueNaTx(prisma, t.depositoId, t.materialId);
    comSaldo.push({ id: t.id, codigo: t.codigo, descricao: t.descricao, deposito: t.deposito.codigo, combustivel: ROTULO_COMBUSTIVEL[t.combustivel].toLowerCase(), saldo: saldo.toFixed(2).replace(".", ","), capacidade: t.capacidade.toFixed(2).replace(".", ",") });
  }
  return {
    tanques: comSaldo,
    depositosParaTanque: livres.map((d) => ({ id: d.id, rotulo: `${d.codigo} — ${d.nome}` })),
    combustiveisDoAlmoxarifado: combustiveis.map((m) => ({ id: m.id, rotulo: `${m.codigo} — ${m.descricaoSucinta}` })),
  };
}

const alvoDoCampo = (c: Campos): { veiculoId?: string; maquinaId?: string } => {
  const a = alvoDaChave(t(c, "bem"));
  if (a === null) throw new Error("Escolha um veículo ou uma máquina. Nada foi gravado.");
  return a;
};

/** Os atos da tela, pelo nome do formulário. A ação de cada um é cobrada no serviço; aqui só o envelope da sessão. */
export async function atoDaOperacaoDaFrota(ato: string, c: Campos): Promise<string> {
  const p = cliente();
  switch (ato) {
    case "cadastrar-tanque": {
      const combustivel = t(c, "combustivel") as Parameters<typeof cadastrarTanqueDeCombustivel>[1]["combustivel"];
      await comEscritaAutenticada("CADASTRAR_FROTA", (criadoPor) => cadastrarTanqueDeCombustivel(p, { codigo: t(c, "codigo"), descricao: t(c, "descricao"), depositoId: t(c, "depositoId"), materialId: t(c, "materialId"), combustivel, capacidade: t(c, "capacidade"), fundamento: t(c, "fundamento"), criadoPor }));
      return "Tanque cadastrado. O combustível entra pela liquidação da compra, no depósito do tanque, até a capacidade.";
    }
    case "cadastrar-condutor":
      await comEscritaAutenticada("CADASTRAR_FROTA", (criadoPor) => cadastrarCondutor(p, { nome: t(c, "nome"), matricula: t(c, "matricula"), cnhNumero: t(c, "cnhNumero"), cnhCategoria: t(c, "cnhCategoria"), cnhValidade: t(c, "cnhValidade"), vinculo: t(c, "vinculo"), vigenteDesde: t(c, "vigenteDesde"), fundamento: t(c, "fundamento"), criadoPor }));
      return "Condutor cadastrado.";
    case "versao-do-condutor": {
      const r = await comEscritaAutenticada("CADASTRAR_FROTA", (criadoPor) => publicarVersaoDoCondutor(p, { condutorId: t(c, "condutorId"), ativo: t(c, "ativo") !== "nao", cnhNumero: t(c, "cnhNumero"), cnhCategoria: t(c, "cnhCategoria"), cnhValidade: t(c, "cnhValidade"), vinculo: t(c, "vinculo"), vigenteDesde: t(c, "vigenteDesde"), fundamento: t(c, "fundamento"), criadoPor }));
      return `Versão ${String(r.versao)} do condutor publicada.`;
    }
    case "exigencia-de-habilitacao": {
      const categorias = (c["categorias"] ?? "").split(",").map((x) => x.trim()).filter((x) => x !== "") as ("A" | "B" | "C" | "D" | "E" | "ACC")[];
      await comEscritaAutenticada("CADASTRAR_FROTA", (criadoPor) => declararExigenciaDeHabilitacao(p, { ...alvoDoCampo(c), categoriasAceitas: categorias, vigenteDesde: t(c, "vigenteDesde"), fundamento: t(c, "fundamento"), criadoPor }));
      return "Exigência de habilitação declarada para o bem.";
    }
    case "emitir-ordem": {
      const r = await comEscritaAutenticada("EMITIR_ORDEM_DE_ABASTECIMENTO", (criadoPor) => emitirOrdemDeAbastecimento(p, { ...alvoDoCampo(c), condutorId: t(c, "condutorId"), combustivel: t(c, "combustivel") as "GASOLINA", quantidadeAutorizada: t(c, "quantidadeAutorizada"), emitidaEm: t(c, "emitidaEm"), validaAte: t(c, "validaAte"), local: t(c, "local"), criadoPor }));
      return `Ordem de abastecimento nº ${String(r.numero)} emitida.`;
    }
    case "cancelar-ordem":
      await comEscritaAutenticada("EMITIR_ORDEM_DE_ABASTECIMENTO", (criadoPor) => cancelarOrdemDeAbastecimento(p, { ordemId: t(c, "ordemId"), motivo: t(c, "motivo"), criadoPor }));
      return "Ordem cancelada. O que já foi abastecido por ela continua registrado.";
    case "leitura":
      await comEscritaAutenticada("REGISTRAR_ABASTECIMENTO", (criadoPor) => registrarLeituraDoMarcador(p, { ...alvoDoCampo(c), data: t(c, "data"), valor: t(c, "valor"), ...(t(c, "corrigeId") !== "" ? { corrigeId: t(c, "corrigeId"), motivo: t(c, "motivo") } : {}), criadoPor }));
      return t(c, "corrigeId") !== "" ? "Leitura corrigida. A anterior fica guardada e sai da conta." : "Leitura registrada.";
    case "abrir-manutencao": {
      const r = await comEscritaAutenticada("CADASTRAR_FROTA", (criadoPor) => abrirManutencaoDaFrota(p, { ...alvoDoCampo(c), tipo: t(c, "tipo") === "PREVENTIVA" ? "PREVENTIVA" : "CORRETIVA", descricao: t(c, "descricao"), solicitante: t(c, "solicitante"), dataDoPedido: t(c, "dataDoPedido"), criadoPor }));
      return `Manutenção nº ${String(r.numero)} pedida.`;
    }
    case "autorizar-manutencao":
      await comEscritaAutenticada("AUTORIZAR_MANUTENCAO_DA_FROTA", (criadoPor) => autorizarManutencaoDaFrota(p, { manutencaoId: t(c, "manutencaoId"), data: t(c, "data"), ...(t(c, "contratoId") !== "" ? { contratoId: t(c, "contratoId") } : {}), fornecedor: t(c, "fornecedor"), valorEstimado: t(c, "valorEstimado"), criadoPor }));
      return "Manutenção autorizada.";
    case "concluir-manutencao":
      await comEscritaAutenticada("CADASTRAR_FROTA", (criadoPor) => concluirManutencaoDaFrota(p, { manutencaoId: t(c, "manutencaoId"), data: t(c, "data"), custo: t(c, "custo"), documento: t(c, "documento"), criadoPor }));
      return "Manutenção concluída com o custo.";
    case "cancelar-manutencao":
      await comEscritaAutenticada("AUTORIZAR_MANUTENCAO_DA_FROTA", (criadoPor) => cancelarManutencaoDaFrota(p, { manutencaoId: t(c, "manutencaoId"), motivo: t(c, "motivo"), criadoPor }));
      return "Manutenção cancelada.";
    default:
      throw new Error("Ato desconhecido. Nada foi gravado.");
  }
}
