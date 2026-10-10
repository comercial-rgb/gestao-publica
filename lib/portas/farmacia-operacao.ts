import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { acoesPermitidas } from "./molde";
import { diaCivil, diaCivilBr } from "../../packages/datas/index";
import { toMoney } from "../../packages/contracts/index.js";
import { dispensarMedicamentos, podeVerDadosDaDispensacao, registrarAjusteDaFarmacia, vincularDepositoAFarmacia } from "../../modules/m37-farmacia/operacao";
import { SINAL_MOVIMENTO_FISICO } from "../../modules/m10-patrimonial/estoque-fisico-dominio";
import { fimDoDiaCivil } from "../../packages/datas/index";

/**
 * V39-R2 (R2-030, R2-031) — A TELA DE OPERAÇÃO DA FARMÁCIA: o depósito, o estoque por lote (com o vencido marcado), a
 * dispensação, a perda e a sobra. Leitura sob CONSULTAR_PATRIMONIO; o IDENTIFICADOR DO USUÁRIO nas dispensações só vem
 * para quem tem DISPENSAR_MEDICAMENTO (dado de saúde). Os atos cobram, no serviço, a ação própria.
 */

type Campos = Readonly<Record<string, string>>;

export interface LoteNaTela {
  readonly materialId: string;
  readonly material: string;
  readonly loteId: string;
  readonly lote: string;
  readonly validade: string;
  readonly vencido: boolean;
  readonly saldo: string;
}

export interface TelaDaFarmacia {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly deposito: { readonly codigo: string; readonly nome: string } | null;
  readonly depositosLivres: readonly { readonly id: string; readonly rotulo: string }[];
  readonly lotes: readonly LoteNaTela[];
  readonly dispensacoes: readonly { readonly numero: number; readonly data: string; readonly usuario: string | null; readonly receita: string | null; readonly itens: string; readonly por: string }[];
  readonly ajustes: readonly { readonly sentido: string; readonly data: string; readonly item: string; readonly motivo: string; readonly destino: string | null; readonly por: string }[];
  readonly inventarios: readonly { readonly id: string; readonly rotulo: string }[];
  readonly pode: { readonly vincular: boolean; readonly dispensar: boolean; readonly ajustar: boolean };
  /** O identificador do usuário e a receita estão na lista (quem pode dispensar na unidade do depósito). */
  readonly dadosDoUsuarioVisiveis: boolean;
}


export async function lerTelaDaFarmacia(farmaciaId: string): Promise<TelaDaFarmacia | null> {
  const sessao = await exigirLeituraDoEnte("CONSULTAR_PATRIMONIO");
  const prisma = cliente();
  const f = await prisma.farmaciaPublica.findUnique({
    where: { id: farmaciaId },
    select: { id: true, codigo: true, versoes: { orderBy: { versao: "desc" }, take: 1, select: { descricao: true } }, deposito: { select: { depositoId: true, deposito: { select: { codigo: true, nome: true } } } } },
  });
  if (f === null) return null;
  const permitidas = await acoesPermitidas(["CADASTRAR_FARMACIA", "DISPENSAR_MEDICAMENTO", "REGISTRAR_AJUSTE_DA_FARMACIA"]);
  const pode = { vincular: permitidas.has("CADASTRAR_FARMACIA"), dispensar: permitidas.has("DISPENSAR_MEDICAMENTO"), ajustar: permitidas.has("REGISTRAR_AJUSTE_DA_FARMACIA") };
  // O identificador e a receita: só para quem pode dispensar NA UNIDADE do depósito (o menu acima é por ação, sem unidade).
  const verDados = await podeVerDadosDaDispensacao(prisma, sessao.identificador, farmaciaId);
  const depositoId = f.deposito?.depositoId ?? null;
  const hoje = diaCivil(new Date());
  const [livres, lotesDb, disp, ajustes, inventarios] = await Promise.all([
    depositoId === null ? prisma.deposito.findMany({ where: { ativo: true, farmacia: null }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }) : Promise.resolve([]),
    depositoId === null ? Promise.resolve([]) : prisma.loteDeMaterial.findMany({
      where: { depositoId }, orderBy: [{ material: { codigo: "asc" } }, { validade: "asc" }],
      select: { id: true, identificacao: true, validade: true, material: { select: { id: true, codigo: true, descricaoSucinta: true } }, movimentos: { where: { dataMovimento: { lte: fimDoDiaCivil(diaCivil(new Date())) } }, select: { tipo: true, quantidade: true } } },
    }),
    prisma.dispensacaoDeMedicamento.findMany({
      where: { farmaciaId }, orderBy: { numero: "desc" }, take: 50,
      select: { numero: true, data: true, identificacaoDoUsuario: true, receita: true, criadoPor: true, itens: { select: { quantidade: true, material: { select: { codigo: true } }, lote: { select: { identificacao: true } } } } },
    }),
    prisma.ajusteDaFarmacia.findMany({ where: { farmaciaId }, orderBy: { criadoEm: "desc" }, take: 50, select: { sentido: true, data: true, quantidade: true, motivo: true, destino: true, criadoPor: true, material: { select: { codigo: true } }, lote: { select: { identificacao: true } } } }),
    depositoId === null ? Promise.resolve([]) : prisma.inventarioDeEstoque.findMany({ where: { depositoId }, orderBy: { dataAbertura: "desc" }, take: 12, select: { id: true, dataAbertura: true, dataFechamento: true } }),
  ]);
  const lotes: LoteNaTela[] = lotesDb.flatMap((l) => {
    const saldo = l.movimentos.reduce((t, m) => toMoney(t.plus(toMoney(m.quantidade.toFixed(4)).times(SINAL_MOVIMENTO_FISICO[m.tipo]))), toMoney(0));
    if (!saldo.greaterThan(0)) return [];
    return [{
      materialId: l.material.id, material: `${l.material.codigo} ${l.material.descricaoSucinta}`, loteId: l.id, lote: l.identificacao,
      validade: l.validade === null ? "sem validade" : diaCivilBr(l.validade), vencido: l.validade !== null && diaCivil(l.validade) < hoje, saldo: saldo.toFixed(4),
    }];
  });
  return {
    id: f.id, codigo: f.codigo, descricao: f.versoes[0]?.descricao ?? f.codigo,
    deposito: f.deposito === null ? null : { codigo: f.deposito.deposito.codigo, nome: f.deposito.deposito.nome },
    depositosLivres: livres.map((d) => ({ id: d.id, rotulo: `${d.codigo} — ${d.nome}` })),
    lotes,
    dispensacoes: disp.map((d) => ({
      numero: d.numero, data: diaCivilBr(d.data),
      // Dado de saúde: só quem dispensa vê o identificador e a receita.
      usuario: verDados ? d.identificacaoDoUsuario : null, receita: verDados ? d.receita : null,
      itens: d.itens.map((i) => `${i.material.codigo} lote ${i.lote.identificacao}: ${i.quantidade.toFixed(4)}`).join("; "), por: d.criadoPor,
    })),
    ajustes: ajustes.map((a) => ({ sentido: a.sentido === "PERDA" ? "perda" : "sobra", data: diaCivilBr(a.data), item: `${a.material.codigo}${a.lote === null ? "" : ` lote ${a.lote.identificacao}`}: ${a.quantidade.toFixed(4)}`, motivo: a.motivo, destino: a.destino, por: a.criadoPor })),
    inventarios: inventarios.map((i) => ({ id: i.id, rotulo: `aberto em ${diaCivilBr(i.dataAbertura)}${i.dataFechamento === null ? " (em andamento)" : `, fechado em ${diaCivilBr(i.dataFechamento)}`}` })),
    pode,
    dadosDoUsuarioVisiveis: verDados,
  };
}

const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

export async function vincularDepositoPelaTela(farmaciaId: string, c: Campos): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_FARMACIA", (criadoPor) => vincularDepositoAFarmacia(cliente(), { farmaciaId, depositoId: t(c, "depositoId"), fundamento: t(c, "fundamento"), criadoPor }));
  return "Depósito vinculado: o estoque da farmácia passa a ser o deste depósito.";
}

/** Os itens: um por linha, "lote;quantidade" pelo id do lote escolhido na lista (o formulário monta as linhas). */
export async function dispensarPelaTela(farmaciaId: string, c: Campos, itens: readonly { readonly loteId: string; readonly quantidade: string }[]): Promise<string> {
  const prisma = cliente();
  const lotes = await prisma.loteDeMaterial.findMany({ where: { id: { in: itens.map((i) => i.loteId) } }, select: { id: true, materialId: true } });
  const comMaterial = itens.map((i) => {
    const l = lotes.find((x) => x.id === i.loteId);
    if (l === undefined) throw new Error("Um dos lotes escolhidos não existe. Nada foi gravado.");
    return { materialId: l.materialId, loteId: i.loteId, quantidade: i.quantidade };
  });
  const r = await comEscritaAutenticada("DISPENSAR_MEDICAMENTO", (criadoPor) =>
    dispensarMedicamentos(cliente(), { farmaciaId, data: t(c, "data"), identificacaoDoUsuario: t(c, "identificacaoDoUsuario"), receita: t(c, "receita"), prescritor: t(c, "prescritor"), itens: comMaterial, criadoPor })
  );
  return `Dispensação nº ${String(r.numero)} registrada com ${String(r.itens)} item(ns). O estoque do depósito baixou.`;
}

export async function ajustarPelaTela(farmaciaId: string, c: Campos): Promise<string> {
  const prisma = cliente();
  const lote = await prisma.loteDeMaterial.findUnique({ where: { id: t(c, "loteId") }, select: { materialId: true } });
  if (lote === null) throw new Error("Escolha o lote. Nada foi gravado.");
  const sentido = t(c, "sentido") === "SOBRA" ? "SOBRA" : "PERDA";
  const r = await comEscritaAutenticada("REGISTRAR_AJUSTE_DA_FARMACIA", (criadoPor) =>
    registrarAjusteDaFarmacia(cliente(), {
      farmaciaId, sentido, materialId: lote.materialId, loteId: t(c, "loteId"), quantidade: t(c, "quantidade"), data: t(c, "data"), motivo: t(c, "motivo"),
      ...(t(c, "destino") !== "" ? { destino: t(c, "destino") } : {}), ...(t(c, "inventarioId") !== "" ? { inventarioId: t(c, "inventarioId") } : {}), criadoPor,
    })
  );
  return `${sentido === "PERDA" ? "Perda" : "Sobra"} registrada: R$ ${r.valor.replace(".", ",")} ao custo médio, no estoque e no razão.`;
}
