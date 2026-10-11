import { cliente } from "./cliente";
import { autorizarNo } from "../../modules/m16-travamento/escopo";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { acoesPermitidas } from "./molde";
import { diaCivil, diaCivilBr } from "../../packages/datas/index";
import { toMoney } from "../../packages/contracts/index.js";
import { corrigirDispensacao, depositoDaFarmaciaNoDia, dispensarMedicamentos, podeVerDadosDaDispensacao, registrarAjusteDaFarmacia, trocarDepositoDaFarmacia, vincularDepositoAFarmacia } from "../../modules/m37-farmacia/operacao";
import { SINAL_MOVIMENTO_FISICO } from "../../modules/m10-patrimonial/estoque-fisico-dominio";
import { fimDoDiaCivil, meioDiaCivil } from "../../packages/datas/index";

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
  readonly dispensacoes: readonly {
    readonly id: string;
    /** V39-R3 — quem vê tem a ação de corrigir na unidade do depósito em que a dispensação aconteceu. */
    readonly podeCorrigir: boolean;
    readonly numero: number;
    readonly data: string;
    readonly usuario: string | null;
    readonly receita: string | null;
    readonly itens: string;
    readonly por: string;
    /** V39-R3 — os itens com a correção de cada um (cancelamento ou devolução), para o formulário e a lista. */
    readonly itensDetalhados: readonly { readonly id: string; readonly rotulo: string; readonly correcao: string | null }[];
  }[];
  /** V39-R3 — as trocas do depósito, e os depósitos que podem receber a farmácia. */
  readonly trocas: readonly { readonly vigenteDesde: string; readonly de: string; readonly para: string; readonly fundamento: string; readonly por: string }[];
  readonly depositosParaTroca: readonly { readonly id: string; readonly rotulo: string }[];
  /** O que ficou no depósito anterior depois da última troca (sai por transferência do almoxarifado). */
  readonly saldoNoDepositoAnterior: readonly { readonly material: string; readonly saldo: string }[];
  readonly ajustes: readonly { readonly sentido: string; readonly data: string; readonly item: string; readonly motivo: string; readonly destino: string | null; readonly por: string; readonly valor: string }[];
  readonly inventarios: readonly { readonly id: string; readonly rotulo: string }[];
  readonly pode: { readonly vincular: boolean; readonly dispensar: boolean; readonly ajustar: boolean; readonly corrigir: boolean; readonly trocar: boolean };
  /** O identificador do usuário e a receita estão na lista (quem pode dispensar na unidade do depósito). */
  readonly dadosDoUsuarioVisiveis: boolean;
}


export async function lerTelaDaFarmacia(farmaciaId: string): Promise<TelaDaFarmacia | null> {
  const sessao = await exigirLeituraDoEnte("CONSULTAR_PATRIMONIO");
  const prisma = cliente();
  const f = await prisma.farmaciaPublica.findUnique({
    where: { id: farmaciaId },
    select: { id: true, codigo: true, versoes: { orderBy: { versao: "desc" }, take: 1, select: { descricao: true } }, deposito: { select: { depositoId: true } } },
  });
  if (f === null) return null;
  const permitidas = await acoesPermitidas(["CADASTRAR_FARMACIA", "DISPENSAR_MEDICAMENTO", "REGISTRAR_AJUSTE_DA_FARMACIA", "CORRIGIR_DISPENSACAO_DE_MEDICAMENTO"]);
  // O identificador e a receita, e os formulários de dispensar e de perda ou sobra: só para quem tem a ação NA UNIDADE do
  // depósito, o mesmo critério do serviço que grava. Ter a ação em outra unidade não basta (o formulário seria recusado).
  const verDados = permitidas.has("DISPENSAR_MEDICAMENTO") && (await podeVerDadosDaDispensacao(prisma, sessao.identificador, farmaciaId));
  const ajustaNaUnidade = permitidas.has("REGISTRAR_AJUSTE_DA_FARMACIA") && (await podeVerDadosDaDispensacao(prisma, sessao.identificador, farmaciaId, "REGISTRAR_AJUSTE_DA_FARMACIA"));
  const corrigeNaUnidade = permitidas.has("CORRIGIR_DISPENSACAO_DE_MEDICAMENTO") && (await podeVerDadosDaDispensacao(prisma, sessao.identificador, farmaciaId, "CORRIGIR_DISPENSACAO_DE_MEDICAMENTO"));
  const hoje = diaCivil(new Date());
  // V39-R3 (R3-010) — o depósito de HOJE: depois de uma troca, o novo. O estoque mostrado é o dele.
  const depositoId = f.deposito === null ? null : await depositoDaFarmaciaNoDia(prisma, farmaciaId, hoje);
  const pode = { vincular: permitidas.has("CADASTRAR_FARMACIA") && f.deposito === null, dispensar: verDados, ajustar: ajustaNaUnidade, corrigir: corrigeNaUnidade, trocar: permitidas.has("CADASTRAR_FARMACIA") && f.deposito !== null };
  const [depAtual, trocasDb, paraTroca] = await Promise.all([
    depositoId === null ? Promise.resolve(null) : prisma.deposito.findUnique({ where: { id: depositoId }, select: { codigo: true, nome: true } }),
    prisma.trocaDoDepositoDaFarmacia.findMany({ where: { farmaciaId }, orderBy: { vigenteDesde: "asc" }, select: { vigenteDesde: true, fundamento: true, criadoPor: true, depositoAnteriorId: true, depositoAnterior: { select: { codigo: true } }, depositoNovo: { select: { codigo: true } } } }),
    f.deposito === null ? Promise.resolve([]) : prisma.deposito.findMany({ where: { ativo: true, farmacia: null, trocasComoNovo: { none: {} }, id: { not: depositoId ?? "" } }, orderBy: { codigo: "asc" }, take: 200, select: { id: true, codigo: true, nome: true } }),
  ]);
  const ultimaTroca = trocasDb.at(-1);
  const saldoAnterior = ultimaTroca === undefined ? [] : await prisma.movimentoFisicoDeEstoque.findMany({ where: { depositoId: ultimaTroca.depositoAnteriorId }, select: { tipo: true, quantidade: true, material: { select: { codigo: true } } } });
  const porMaterial = new Map<string, ReturnType<typeof toMoney>>();
  for (const m of saldoAnterior) porMaterial.set(m.material.codigo, toMoney((porMaterial.get(m.material.codigo) ?? toMoney(0)).plus(toMoney(m.quantidade.toFixed(4)).times(SINAL_MOVIMENTO_FISICO[m.tipo]))));
  const [livres, lotesDb, disp, ajustes, inventarios] = await Promise.all([
    depositoId === null ? prisma.deposito.findMany({ where: { ativo: true, farmacia: null, trocasComoNovo: { none: {} } }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }) : Promise.resolve([]),
    depositoId === null ? Promise.resolve([]) : prisma.loteDeMaterial.findMany({
      where: { depositoId }, orderBy: [{ material: { codigo: "asc" } }, { validade: "asc" }],
      select: { id: true, identificacao: true, validade: true, material: { select: { id: true, codigo: true, descricaoSucinta: true } }, movimentos: { where: { dataMovimento: { lte: fimDoDiaCivil(diaCivil(new Date())) } }, select: { tipo: true, quantidade: true } } },
    }),
    prisma.dispensacaoDeMedicamento.findMany({
      where: { farmaciaId }, orderBy: { numero: "desc" }, take: 50,
      select: { id: true, numero: true, data: true, identificacaoDoUsuario: true, receita: true, criadoPor: true, itens: { select: { id: true, quantidade: true, movimentoFisico: { select: { deposito: { select: { unidadeOrcId: true } } } }, material: { select: { codigo: true } }, lote: { select: { identificacao: true } }, correcao: { select: { tipo: true, condicao: true, data: true, criadoPor: true, destino: true } } } } },
    }),
    prisma.ajusteDaFarmacia.findMany({ where: { farmaciaId }, orderBy: { criadoEm: "desc" }, take: 50, select: { sentido: true, data: true, quantidade: true, motivo: true, destino: true, criadoPor: true, material: { select: { codigo: true } }, lote: { select: { identificacao: true } }, movimentoFisico: { select: { valorUnitario: true, valorTotal: true } } } }),
    depositoId === null ? Promise.resolve([]) : prisma.inventarioDeEstoque.findMany({ where: { depositoId }, orderBy: { dataAbertura: "desc" }, take: 12, select: { id: true, dataAbertura: true, dataFechamento: true } }),
  ]);
  // V39-R3 — a permissão por unidade DO FATO (o depósito em que cada dispensação aconteceu), conferida uma vez por unidade.
  const ugDoFato = (d: (typeof disp)[number]): string => d.itens[0]?.movimentoFisico.deposito.unidadeOrcId ?? "";
  const porUg = new Map<string, { ver: boolean; corrigir: boolean }>();
  for (const ug of new Set(disp.map(ugDoFato))) {
    const pode = async (acao: "DISPENSAR_MEDICAMENTO" | "CORRIGIR_DISPENSACAO_DE_MEDICAMENTO"): Promise<boolean> => {
      if (ug === "" || !permitidas.has(acao)) return false;
      try { await autorizarNo(prisma, sessao.identificador, acao, { ug }); return true; } catch { return false; }
    };
    porUg.set(ug, { ver: await pode("DISPENSAR_MEDICAMENTO"), corrigir: await pode("CORRIGIR_DISPENSACAO_DE_MEDICAMENTO") });
  }
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
    deposito: depAtual === null ? null : { codigo: depAtual.codigo, nome: depAtual.nome },
    depositosLivres: livres.map((d) => ({ id: d.id, rotulo: `${d.codigo} — ${d.nome}` })),
    lotes,
    dispensacoes: disp.map((d) => ({
      numero: d.numero, data: diaCivilBr(d.data),
      // Dado de saúde: só quem dispensa NA UNIDADE do depósito em que a dispensação aconteceu vê o identificador e a receita
      // (depois de uma troca, a unidade do fato pode não ser a de hoje).
      usuario: (porUg.get(ugDoFato(d)) ?? { ver: false }).ver ? d.identificacaoDoUsuario : null, receita: (porUg.get(ugDoFato(d)) ?? { ver: false }).ver ? d.receita : null,
      podeCorrigir: (porUg.get(ugDoFato(d)) ?? { corrigir: false }).corrigir,
      itens: d.itens.map((i) => `${i.material.codigo} lote ${i.lote.identificacao}: ${i.quantidade.toFixed(4)}`).join("; "), por: d.criadoPor,
      id: d.id,
      itensDetalhados: d.itens.map((i) => ({
        id: i.id,
        rotulo: `${i.material.codigo} lote ${i.lote.identificacao}: ${i.quantidade.toFixed(4)}`,
        correcao: i.correcao === null ? null
          : i.correcao.tipo === "CANCELAMENTO_DO_REGISTRO" ? `registro cancelado em ${diaCivilBr(i.correcao.data)} por ${i.correcao.criadoPor}; voltou ao estoque`
          : i.correcao.condicao === "APTO_AO_REUSO" ? `devolvido em ${diaCivilBr(i.correcao.data)}, apto ao reuso; voltou ao estoque`
          : `devolvido em ${diaCivilBr(i.correcao.data)}, inapto; não voltou ao estoque (destino: ${i.correcao.destino ?? ""})`,
      })),
    })),
    trocas: trocasDb.map((x) => ({ vigenteDesde: diaCivilBr(x.vigenteDesde), de: x.depositoAnterior.codigo, para: x.depositoNovo.codigo, fundamento: x.fundamento, por: x.criadoPor })),
    depositosParaTroca: paraTroca.map((d) => ({ id: d.id, rotulo: `${d.codigo} — ${d.nome}` })),
    saldoNoDepositoAnterior: [...porMaterial.entries()].filter(([, v]) => v.greaterThan(0)).map(([material, v]) => ({ material, saldo: v.toFixed(4) })),
    ajustes: ajustes.map((a) => ({ sentido: a.sentido === "PERDA" ? "perda" : "sobra", data: diaCivilBr(a.data), item: `${a.material.codigo}${a.lote === null ? "" : ` lote ${a.lote.identificacao}`}: ${a.quantidade.toFixed(4)}`, motivo: a.motivo, destino: a.destino, por: a.criadoPor,
      // V39-R3 (R3-008) — a origem do valor: o custo médio da posição do medicamento no depósito, no dia do ajuste.
      valor: `R$ ${a.movimentoFisico.valorTotal.toFixed(2).replace(".", ",")} ao custo médio de R$ ${a.movimentoFisico.valorUnitario.toFixed(6).replace(".", ",")} por unidade (posição do depósito no dia)` })),
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

/** V39-R3 (R3-009) — corrigir a dispensação: no cancelamento vão todos os itens; na devolução, os marcados com a condição. */
export async function corrigirPelaTela(farmaciaId: string, c: Campos, itens: readonly { readonly itemId: string; readonly condicao: "APTO_AO_REUSO" | "INAPTO" }[]): Promise<string> {
  const disp = await cliente().dispensacaoDeMedicamento.findUnique({ where: { id: t(c, "dispensacaoId") }, select: { farmaciaId: true, numero: true } });
  if (disp === null || disp.farmaciaId !== farmaciaId) throw new Error("A dispensação não é desta farmácia. Nada foi gravado.");
  const tipo = t(c, "tipo") === "DEVOLUCAO" ? "DEVOLUCAO" : "CANCELAMENTO_DO_REGISTRO";
  const r = await comEscritaAutenticada("CORRIGIR_DISPENSACAO_DE_MEDICAMENTO", (criadoPor) =>
    corrigirDispensacao(cliente(), {
      dispensacaoId: t(c, "dispensacaoId"), tipo, itens: [...itens], data: t(c, "data"), motivo: t(c, "motivo"),
      ...(t(c, "conferidoPor") !== "" ? { conferidoPor: t(c, "conferidoPor") } : {}), ...(t(c, "destino") !== "" ? { destino: t(c, "destino") } : {}), criadoPor,
    })
  );
  return tipo === "CANCELAMENTO_DO_REGISTRO"
    ? `Registro da dispensação nº ${String(disp.numero)} cancelado: ${String(r.corrigidos)} item(ns) voltaram ao estoque, e o consumo foi estornado.`
    : `Devolução registrada na dispensação nº ${String(disp.numero)}: ${String(r.devolvidosAoEstoque)} de ${String(r.corrigidos)} item(ns) voltaram ao estoque (os inaptos não voltam).`;
}

/** V39-R3 (R3-010) — trocar o depósito da farmácia a partir de um dia. */
export async function trocarDepositoPelaTela(farmaciaId: string, c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_FARMACIA", (criadoPor) =>
    trocarDepositoDaFarmacia(cliente(), { farmaciaId, depositoNovoId: t(c, "depositoNovoId"), vigenteDesde: t(c, "vigenteDesde"), fundamento: t(c, "fundamento"), criadoPor })
  );
  return `Depósito trocado a partir de ${diaCivilBr(meioDiaCivil(t(c, "vigenteDesde")))}. O estoque não foi transferido: ${r.materiaisNoAnterior > 0 ? "o que ficou no depósito anterior sai por transferência do almoxarifado." : "o depósito anterior não tinha movimento."}`;
}
