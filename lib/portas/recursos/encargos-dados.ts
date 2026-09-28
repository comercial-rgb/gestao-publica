import { Decimal, preCondicao, toMoney } from "../../../packages/contracts/index.js";
import { diaCivilBr } from "../../../packages/datas/index.js";
import {
  aprovarVersaoDoEncargo,
  cadastrarComponenteDeEncargo,
  cadastrarGrupoDosEncargos,
  cadastrarVersaoDoEncargo,
  encargosDaFolha,
  retratoDosEncargos,
} from "../../../modules/m33-folha/encargos-servico.js";
import {
  elegibilidadeParaAprovarVersao,
  elegibilidadeParaAjustarEncargos,
  elegibilidadeParaApropriarEncargos,
  elegibilidadeParaApurarEncargos,
  elegibilidadeParaCertificarEncargos,
  elegibilidadeParaLiquidarEncargos,
} from "../../../modules/m33-folha/encargos.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { DadoDoDetalhe, DisponibilidadeDaAcao, LinhaDoHistorico } from "../../molde/tipos.js";
import { apresentar } from "../disponibilidade";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";
import { OPCOES_DE_TIPO_DE_ENCARGO } from "./encargos";

/**
 * A PORTA DOS ENCARGOS DO EMPREGADOR (M33, V6.2 U1). Lê e chama; quem decide é o domínio.
 * A "versão vigente hoje" da lista é DERIVADA a cada leitura, pela competência de hoje.
 */
export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const ROTULO_DO_TIPO: Readonly<Record<string, string>> = Object.fromEntries(OPCOES_DE_TIPO_DE_ENCARGO.map((o) => [o.valor, o.rotulo]));
const competenciaDeHoje = (): string => diaCivilBr(new Date()).split("/").reverse().slice(0, 2).join("-");
const vigente = (v: { competenciaInicio: string; competenciaFim: string | null }, c: string): boolean => v.competenciaInicio <= c && (v.competenciaFim === null || v.competenciaFim >= c);
const pct = (d: Decimal | string): string => `${new Decimal(d).times(100).toFixed(2).replace(".", ",")}%`;

const SELECAO = {
  id: true, codigo: true, descricao: true, tipo: true, regime: true, criadoEm: true, criadoPor: true,
  grupoDeEmpenho: { select: { grupo: { select: { codigo: true } } } },
  versoes: { orderBy: { competenciaInicio: "desc" as const }, select: { id: true, competenciaInicio: true, competenciaFim: true, aliquota: true, teto: true, fundamentacaoLegal: true, sintetica: true, criadoEm: true, criadoPor: true, aprovacao: { select: { id: true, criadoEm: true, criadoPor: true, motivo: true } }, incidencias: { select: { rubrica: { select: { codigo: true } } } } } },
};

export async function listarComponentesDeEncargo(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const q = (c.filtros["q"] ?? "").trim();
  const where = q === "" ? {} : { OR: [{ codigo: { contains: q, mode: "insensitive" as const } }, { descricao: { contains: q, mode: "insensitive" as const } }] };
  const [total, lista] = await Promise.all([
    cliente().componenteDeEncargo.count({ where }),
    cliente().componenteDeEncargo.findMany({ where, orderBy: { codigo: "asc" }, skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA, select: SELECAO }),
  ]);
  const hoje = competenciaDeHoje();
  return {
    total,
    linhas: lista.map((k) => {
      const v = k.versoes.find((x) => x.aprovacao !== null && vigente(x, hoje));
      return {
        id: k.id, codigo: k.codigo, descricao: k.descricao, tipo: ROTULO_DO_TIPO[k.tipo] ?? k.tipo, regime: k.regime,
        vigente: v === undefined ? "nenhuma aprovada" : `${pct(v.aliquota)} desde ${v.competenciaInicio}${v.sintetica ? " (versão sintética de demonstração)" : ""}`,
        grupo: k.grupoDeEmpenho?.grupo.codigo ?? "sem grupo",
      };
    }),
  };
}

export async function verComponenteDeEncargo(id: string): Promise<(DetalheLido & { readonly versoes: readonly { readonly id: string; readonly rotulo: string; readonly aprovada: boolean }[] }) | null> {
  const k = await cliente().componenteDeEncargo.findUnique({ where: { id }, select: SELECAO });
  if (k === null) return null;
  const dados: DadoDoDetalhe[] = [
    { rotulo: "Código", valor: k.codigo },
    { rotulo: "Descrição", valor: k.descricao },
    { rotulo: "Tipo", valor: ROTULO_DO_TIPO[k.tipo] ?? k.tipo },
    { rotulo: "Regime do contracheque", valor: k.regime, nota: "O componente não se aplica a contracheques de outro regime." },
    { rotulo: "Grupo de empenho", valor: k.grupoDeEmpenho?.grupo.codigo ?? "", nota: "Sem grupo de empenho, a apuração é feita, mas o empenho do componente não é realizado." },
    ...k.versoes.map((v) => ({
      rotulo: `Versão desde ${v.competenciaInicio}${v.competenciaFim === null ? "" : ` até ${v.competenciaFim}`}`,
      valor: `${pct(v.aliquota)} sobre ${v.incidencias.map((i) => i.rubrica.codigo).sort().join(" + ")}${v.teto === null ? "" : `, teto ${toMoney(v.teto).toFixed(2)}`} — ${v.aprovacao === null ? "aguardando aprovação" : "aprovada"}${v.sintetica ? " — versão sintética de demonstração, sem validade normativa" : ""}`,
      nota: `Fundamento: ${v.fundamentacaoLegal}`,
      tipo: "longo" as const,
    })),
  ];
  const historico: LinhaDoHistorico[] = [
    { id: `k-${k.id}`, oQue: "Componente cadastrado", quando: diaCivilBr(k.criadoEm), registradoEm: diaCivilBr(k.criadoEm), por: k.criadoPor },
    ...k.versoes.flatMap((v) => [
      { id: v.id, oQue: `Versão desde ${v.competenciaInicio} cadastrada (${pct(v.aliquota)})`, quando: diaCivilBr(v.criadoEm), registradoEm: diaCivilBr(v.criadoEm), por: v.criadoPor, motivo: v.fundamentacaoLegal },
      ...(v.aprovacao === null ? [] : [{ id: v.aprovacao.id, oQue: `Versão desde ${v.competenciaInicio} aprovada`, quando: diaCivilBr(v.aprovacao.criadoEm), registradoEm: diaCivilBr(v.aprovacao.criadoEm), por: v.aprovacao.criadoPor, motivo: v.aprovacao.motivo }]),
    ]),
  ];
  return {
    titulo: `${k.codigo} — ${k.descricao}`,
    subtitulo: `${ROTULO_DO_TIPO[k.tipo] ?? k.tipo} · ${k.regime}`,
    selos: k.versoes.some((v) => v.aprovacao === null) ? [{ texto: "Versão aguardando aprovação", tom: "alerta" }] : [],
    dados,
    historico,
    versoes: k.versoes.map((v) => ({ id: v.id, rotulo: `desde ${v.competenciaInicio} — ${pct(v.aliquota)}`, aprovada: v.aprovacao !== null })),
  };
}

/** V6.2 — a disponibilidade de "aprovar-versao" para a sessão: há pendente de OUTRA pessoa? */
export async function disponibilidadeDoComponenteDeEncargo(componenteId: string, identificador: string): Promise<{ readonly versao: string; readonly porAcao: Readonly<Record<string, DisponibilidadeDaAcao>> }> {
  const vs = await cliente().versaoDoEncargo.findMany({ where: { componenteId, aprovacao: null }, select: { id: true, criadoPor: true } });
  return {
    versao: vs.map((v) => v.id).sort().join(",") || "sem-pendentes",
    porAcao: { "aprovar-versao": apresentar(elegibilidadeParaAprovarVersao({ pendentes: vs.length, pendentesDeOutros: vs.filter((v) => v.criadoPor !== identificador).length })) },
  };
}

/** As versões ainda não aprovadas DESTE componente — o recorte do formulário de aprovar. */
export async function opcoesDoComponenteDeEncargo(componenteId?: string): Promise<OpcoesDoCadastro> {
  if (componenteId === undefined) return { versaoId: [] };
  const vs = await cliente().versaoDoEncargo.findMany({ where: { componenteId, aprovacao: null }, orderBy: { competenciaInicio: "asc" }, select: { id: true, competenciaInicio: true, aliquota: true, criadoPor: true } });
  return { versaoId: vs.map((v) => ({ valor: v.id, rotulo: `desde ${v.competenciaInicio} — ${pct(v.aliquota)} (cadastrada por ${v.criadoPor})` })) };
}

export async function criarComponenteDeEncargo(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_ENCARGO_DA_FOLHA", (criadoPor) =>
    cadastrarComponenteDeEncargo(cliente(), { codigo: t(c, "codigo").toUpperCase(), descricao: t(c, "descricao"), tipo: t(c, "tipo") as never, regime: t(c, "regime") as never, criadoPor })
  );
  return r.componenteId;
}

export async function acaoDoComponenteDeEncargo(acao: string, _componenteId: string, c: Campos): Promise<string> {
  if (acao !== "aprovar-versao") throw new Error(`Ação desconhecida: ${acao}`);
  await comEscritaAutenticada("APROVAR_ENCARGO_DA_FOLHA", (criadoPor) => aprovarVersaoDoEncargo(cliente(), { versaoId: t(c, "versaoId"), ...(t(c, "motivo") !== "" ? { motivo: t(c, "motivo") } : {}), criadoPor }));
  return "Versão aprovada. Ela passa a valer nas apurações das competências da vigência; as apurações já registradas não mudam. Para aplicar a nova versão, apure novamente.";
}

export interface RubricaParaBase {
  readonly id: string;
  readonly rotulo: string;
}

export async function rubricasDeProvento(): Promise<readonly RubricaParaBase[]> {
  const rs = await cliente().rubrica.findMany({ where: { tipo: "PROVENTO" }, orderBy: { ordem: "asc" }, select: { id: true, codigo: true, descricao: true } });
  return rs.map((r) => ({ id: r.id, rotulo: `${r.codigo} — ${r.descricao}` }));
}

export async function criarVersaoDoEncargo(componenteId: string, c: Campos, rubricaIds: readonly string[]): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_ENCARGO_DA_FOLHA", (criadoPor) =>
    cadastrarVersaoDoEncargo(cliente(), {
      componenteId,
      competenciaInicio: t(c, "competenciaInicio"),
      ...(t(c, "competenciaFim") !== "" ? { competenciaFim: t(c, "competenciaFim") } : {}),
      // ⚠️ O PERCENTUAL CHEGA COMO A PESSOA O LÊ NO ATO ("20" ou "20,5") e vira fração AQUI, com vírgula
      // decimal. Guardar "20" como alíquota multiplicaria a folha por vinte — o CHECK do banco recusaria.
      aliquota: new Decimal(t(c, "percentual").replace(",", ".") || "NaN").div(100).toFixed(6),
      ...(t(c, "teto") !== "" ? { teto: t(c, "teto").replace(/\./g, "").replace(",", ".") } : {}),
      fundamentacaoLegal: t(c, "fundamentacaoLegal"),
      sintetica: t(c, "sintetica") === "sim",
      rubricaIds: [...rubricaIds],
      criadoPor,
    })
  );
  return r.versaoId;
}

export async function criarGrupoDosEncargos(c: Campos, componenteIds: readonly string[]): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA", (criadoPor) =>
    cadastrarGrupoDosEncargos(cliente(), {
      codigo: t(c, "codigo").toUpperCase(), descricao: t(c, "descricao"), fichaId: t(c, "fichaId"), serie: t(c, "serie"), credorId: t(c, "credorId"),
      tipoEmpenho: (t(c, "tipoEmpenho") || "ORDINARIO") as never, categoriaOrdemCronologica: (t(c, "categoriaOrdemCronologica") || "PRESTACAO_SERVICOS") as never,
      contaVariacaoId: t(c, "contaVariacaoId"), contaObrigacaoId: t(c, "contaObrigacaoId"), componenteIds: [...componenteIds], criadoPor,
    })
  );
  return r.grupoId;
}

export async function componentesSemGrupo(): Promise<readonly { readonly id: string; readonly rotulo: string }[]> {
  const ks = await cliente().componenteDeEncargo.findMany({ where: { grupoDeEmpenho: null }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true, regime: true } });
  return ks.map((k) => ({ id: k.id, rotulo: `${k.codigo} — ${k.descricao} (${k.regime})` }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// NA FOLHA — o painel e a disponibilidade dos quatro atos
// ═══════════════════════════════════════════════════════════════════════════════

export async function disponibilidadeDosEncargos(folhaId: string, identificador: string, permitidas: ReadonlySet<string>): Promise<{ readonly versao: string; readonly porAcao: Readonly<Record<string, DisponibilidadeDaAcao>> } | null> {
  const r = await retratoDosEncargos(cliente(), folhaId, identificador, { consultarDesignacao: permitidas.has("CERTIFICAR_ENCARGOS_DA_FOLHA") });
  if (r === null) return null;
  const hrefDesignacao = permitidas.has("DESIGNAR_NA_FOLHA") ? "/folha/designacoes" : undefined;
  const cert = elegibilidadeParaCertificarEncargos(r.estado, r.ator);
  const apr = elegibilidadeParaApropriarEncargos(r.estado);
  return {
    versao: r.versao,
    porAcao: {
      "apurar-encargos": apresentar(elegibilidadeParaApurarEncargos(r.estado)),
      "certificar-encargos": apresentar(cert, cert.situacao === "PRE_CONDICAO" && cert.codigo === "SEM-DESIGNACAO-VIGENTE" ? hrefDesignacao : undefined),
      "apropriar-encargos": apresentar(apr, apr.situacao === "PRE_CONDICAO" && apr.codigo === "COMPONENTE-SEM-GRUPO-DE-EMPENHO" && permitidas.has("CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA") ? "/folha/grupos-de-empenho" : undefined),
      "liquidar-encargos": apresentar(elegibilidadeParaLiquidarEncargos(r.estado, r.ator)),
      // ⚠️ O AJUSTE É ATO COMPOSTO: ele anula pelo M05, e cada anulação cobra a PRÓPRIA ação (achado do percurso
      // de V7 U6: a barra ofereceu o formulário e o servidor recusou "ANULAR_LIQUIDACAO_PARCIAL"). A tela diz
      // antes, pelo mesmo contrato de elegibilidade; o servidor continua recusando se a concessão faltar na UG.
      "ajustar-encargos": apresentar(((): ReturnType<typeof elegibilidadeParaAjustarEncargos> => {
        const e = elegibilidadeParaAjustarEncargos(r.estado, r.ator);
        const faltam = ["ANULAR_LIQUIDACAO_PARCIAL", "ANULAR_EMPENHO_PARCIAL"].filter((x) => !permitidas.has(x));
        return e.situacao === "ELEGIVEL" && faltam.length > 0
          ? preCondicao("AJUSTE-EXIGE-ANULACAO-DO-M05", `O ajuste anula liquidação e empenho pela despesa, e seu perfil não tem ${faltam.join(" e ")}.`, "Peça ao administrador as ações de anulação parcial da despesa, ou outra pessoa que as tenha pratica o ajuste.")
          : e;
      })()),
    },
  };
}

export async function lerEncargosDaFolha(folhaId: string) {
  const e = await encargosDaFolha(cliente(), folhaId);
  return {
    vigente: e.vigente === null ? null : {
      numero: e.vigente.numero, complementar: e.vigente.complementar, completa: e.vigente.completa, esperados: e.vigente.esperados,
      total: e.vigente.total.toFixed(2), sha256: e.vigente.sha256, apuradaPor: e.vigente.apuradaPor, apuradaEm: diaCivilBr(e.vigente.apuradaEm), situacao: e.vigente.situacao,
      porComponente: e.vigente.porComponente,
      itens: e.vigente.itens.map((i) => ({
        matricula: String(i["matricula"] ?? ""), componente: String(i["componente"] ?? ""), situacao: String(i["situacao"] ?? ""),
        base: i["base"] === undefined ? "" : String(i["base"]), aliquota: i["aliquota"] === undefined ? "" : pct(String(i["aliquota"])),
        valor: i["valor"] === undefined ? "" : String(i["valor"]), motivo: i["motivo"] === undefined ? "" : String(i["motivo"]),
        rubricas: Array.isArray(i["rubricasNaBase"]) ? (i["rubricasNaBase"] as { codigo: string }[]).map((r) => r.codigo).join(" + ") : "",
        fundamentacao: i["fundamentacao"] === undefined ? "" : String(i["fundamentacao"]), sintetica: i["sintetica"] === true, tetoAplicado: i["tetoAplicado"] === true,
      })),
    },
    anteriores: e.anteriores.map((a) => ({ numero: a.numero, total: a.total.toFixed(2), apuradaEm: diaCivilBr(a.apuradaEm) })),
    comparativo: e.comparativo,
    atestos: e.atestos.map((a) => ({ ...a, quando: diaCivilBr(a.quando) })),
    empenhos: e.empenhos.map((x) => ({ apuracao: x.apuracao, grupo: x.grupo, numero: x.numero, empenhoId: x.empenhoId, valor: x.valor.toFixed(2), liquidacao: x.liquidacao === null ? null : { numero: x.liquidacao.numero, data: diaCivilBr(x.liquidacao.data) } })),
  };
}
