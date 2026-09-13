import { diaCivilBr, meioDiaCivil } from "../../../packages/datas/index.js";
import { toMoney } from "../../../packages/contracts/index.js";
import { formatarDocumento } from "../../../packages/documento/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import {
  cargoVigenteEm,
  gratificacoesVigentesEm,
  lotacaoVigenteEm,
  lotadosNaLotacao,
  salarioBaseVigenteEm,
  situacaoDoVinculo,
  vagasOcupadasDoCargo,
  type EventoDoVinculo,
  type SituacaoVinculo,
} from "../../../modules/m32-pessoal/dominio.js";
import {
  admitirServidor,
  cadastrarCargo,
  cadastrarDependente,
  cadastrarLotacao,
  cadastrarServidor,
  desligarServidor,
  registrarAlteracaoRemuneratoria,
  registrarAnotacaoServidor,
  registrarMovimentacao,
  registrarPortaria,
  registrarTreinamento,
} from "../../../modules/m32-pessoal/servico.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { LinhaDoHistorico } from "../../molde/tipos.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";

/**
 * A PORTA DO PESSOAL (M32, V6 P2.2). A porta lê e chama — quem decide é o domínio. Cargo, lotação,
 * salário e situação de cada vínculo saem das derivações puras de `dominio.ts` sobre os eventos,
 * na data pedida (hoje, nas telas). Nenhuma coluna de situação.
 */
export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const opcional = (c: Campos, k: string): string | undefined => (t(c, k) === "" ? undefined : t(c, k));
const dia = (c: Campos, k: string): Date => meioDiaCivil(t(c, k));
const inteiro = (c: Campos, k: string): number | undefined => (t(c, k) === "" ? undefined : Number.parseInt(t(c, k), 10));
export function decimalDaTela(v: string): string {
  const s = v.trim();
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) return s.replace(/\./g, "").replace(",", ".");
  return s;
}
function paginacao(c: ConsultaDoMolde): { readonly skip: number; readonly take: number } {
  return { skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA };
}

const ROTULO_DO_EVENTO: Readonly<Record<string, string>> = {
  ADMISSAO: "Admissão", PROMOCAO: "Promoção", MUDANCA_CARGO: "Mudança de cargo", MUDANCA_LOTACAO: "Mudança de lotação",
  REAJUSTE_SALARIAL: "Reajuste salarial", GRATIFICACAO: "Gratificação", AFASTAMENTO: "Afastamento", RETORNO_AFASTAMENTO: "Retorno de afastamento", DESLIGAMENTO: "Desligamento",
};
const ROTULO_DA_SITUACAO: Readonly<Record<SituacaoVinculo, string>> = { ATIVO: "ATIVO", AFASTADO: "AFASTADO", DESLIGADO: "DESLIGADO" };

const SELECAO_DE_EVENTOS = {
  orderBy: [{ data: "asc" as const }, { criadoEm: "asc" as const }],
  select: {
    id: true, data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true,
    gratificacaoDescricao: true, gratificacaoValor: true, motivo: true, criadoPor: true,
    cargo: { select: { codigo: true, denominacao: true } }, lotacao: { select: { codigo: true, nome: true } },
    portaria: { select: { numero: true, ano: true } },
  },
};
type EventoLido = Prisma.HistoricoVinculoGetPayload<{ select: (typeof SELECAO_DE_EVENTOS)["select"] }>;

function eventos(es: readonly EventoLido[]): readonly (EventoDoVinculo & { readonly gratificacaoDescricao: string | null; readonly gratificacaoValor: ReturnType<typeof toMoney> | null })[] {
  return es.map((e) => ({
    data: e.data, criadoEm: e.criadoEm, tipo: e.tipo, cargoId: e.cargoId, lotacaoId: e.lotacaoId,
    salarioBase: e.salarioBase === null ? null : toMoney(e.salarioBase.toFixed(2)),
    gratificacaoDescricao: e.gratificacaoDescricao, gratificacaoValor: e.gratificacaoValor === null ? null : toMoney(e.gratificacaoValor.toFixed(2)),
  }));
}

function nomeDaPessoa(p: { readonly documento: string; readonly versoes: readonly { readonly nome: string }[] }, nomeSocial: string | null): string {
  return nomeSocial ?? p.versoes[0]?.nome ?? p.documento;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVIDORES
// ═══════════════════════════════════════════════════════════════════════════

const SELECAO_DO_SERVIDOR = {
  id: true, nomeSocial: true, dataNascimento: true, sexo: true, pisPasep: true, rgNumero: true, rgOrgaoEmissor: true, rgUf: true,
  tituloEleitor: true, ctpsNumero: true, ctpsSerie: true, nomeMae: true, nomePai: true, criadoEm: true, criadoPor: true,
  pessoa: { select: { id: true, documento: true, versoes: { orderBy: { criadoEm: "desc" as const }, take: 1, select: { nome: true, email: true, telefone: true, municipio: true, uf: true } } } },
  vinculos: { orderBy: { dataAdmissao: "asc" as const }, select: { id: true, matricula: true, tipo: true, regimeJuridico: true, dataAdmissao: true, criadoPor: true, criadoEm: true, eventos: SELECAO_DE_EVENTOS } },
};

export async function listarServidores(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const sit = c.filtros["situacao"] ?? "";
  const where: Prisma.ServidorWhereInput = q === "" ? {} : {
    OR: [
      { pessoa: { documento: { contains: q.replace(/\D/g, "") || q } } },
      { pessoa: { versoes: { some: { nome: { contains: q, mode: "insensitive" } } } } },
      { nomeSocial: { contains: q, mode: "insensitive" } },
      { vinculos: { some: { matricula: { contains: q, mode: "insensitive" } } } },
    ],
  };
  const hoje = new Date();
  const [total, linhas] = await Promise.all([
    prisma.servidor.count({ where }),
    prisma.servidor.findMany({ where, orderBy: c.ordem === "nome" ? { pessoa: { documento: c.direcao } } : { criadoEm: "desc" }, ...paginacao(c), select: SELECAO_DO_SERVIDOR }),
  ]);
  const cargos = new Map((await prisma.cargo.findMany({ select: { id: true, codigo: true, denominacao: true } })).map((x) => [x.id, `${x.codigo} — ${x.denominacao}`]));
  const lotacoes = new Map((await prisma.lotacao.findMany({ select: { id: true, codigo: true, nome: true } })).map((x) => [x.id, `${x.codigo} — ${x.nome}`]));
  const mapeadas = linhas.map((s) => {
    const vivos = s.vinculos.map((v) => ({ v, situacao: situacaoDoVinculo(eventos(v.eventos), hoje) })).filter((x) => x.situacao !== "DESLIGADO");
    const principal = vivos[0];
    const situacao = s.vinculos.length === 0 ? "SEM_VINCULO" : principal === undefined ? "DESLIGADO" : vivos.some((x) => x.situacao === "AFASTADO") && vivos.every((x) => x.situacao === "AFASTADO") ? "AFASTADO" : "ATIVO";
    const evs = principal === undefined ? [] : eventos(principal.v.eventos);
    return {
      id: s.id,
      nome: nomeDaPessoa(s.pessoa, s.nomeSocial),
      documento: formatarDocumento(s.pessoa.documento),
      vinculos: String(s.vinculos.length),
      cargo: principal === undefined ? "—" : (cargos.get(cargoVigenteEm(evs, hoje) ?? "") ?? "—"),
      lotacao: principal === undefined ? "—" : (lotacoes.get(lotacaoVigenteEm(evs, hoje) ?? "") ?? "—"),
      situacao,
    };
  });
  const filtradas = sit === "" ? mapeadas : mapeadas.filter((l) => l.situacao === sit);
  return { total: sit === "" ? total : filtradas.length, linhas: filtradas };
}

export interface ServidorLido extends DetalheLido {
  readonly vinculos: readonly { readonly id: string; readonly matricula: string; readonly situacao: SituacaoVinculo }[];
}

export async function verServidor(id: string): Promise<ServidorLido | null> {
  const prisma = cliente();
  const s = await prisma.servidor.findUnique({
    where: { id },
    select: {
      ...SELECAO_DO_SERVIDOR,
      dependentes: { orderBy: { criadoEm: "asc" }, select: { id: true, nome: true, dataNascimento: true, grauParentesco: true, criadoEm: true, criadoPor: true, finalidades: { select: { finalidade: true, dataInicio: true, dataBaixa: true, limiteIdadeAnos: true } } } },
      anotacoes: { orderBy: { data: "asc" }, select: { id: true, data: true, tipo: true, titulo: true, texto: true, criadoEm: true, criadoPor: true } },
      treinamentos: { orderBy: { dataInicio: "asc" }, select: { id: true, descricao: true, instituicao: true, cargaHoraria: true, dataInicio: true, dataTermino: true, criadoEm: true, criadoPor: true } },
    },
  });
  if (s === null) return null;
  const hoje = new Date();
  const [cargos, lotacoes] = await Promise.all([
    prisma.cargo.findMany({ select: { id: true, codigo: true, denominacao: true } }),
    prisma.lotacao.findMany({ select: { id: true, codigo: true, nome: true } }),
  ]);
  const cargoDe = new Map(cargos.map((x) => [x.id, `${x.codigo} — ${x.denominacao}`]));
  const lotacaoDe = new Map(lotacoes.map((x) => [x.id, `${x.codigo} — ${x.nome}`]));
  const nome = nomeDaPessoa(s.pessoa, s.nomeSocial);
  const versao = s.pessoa.versoes[0];

  const vinculos = s.vinculos.map((v) => {
    const evs = eventos(v.eventos);
    return { v, evs, situacao: situacaoDoVinculo(evs, hoje), cargo: cargoDe.get(cargoVigenteEm(evs, hoje) ?? "") ?? "—", lotacao: lotacaoDe.get(lotacaoVigenteEm(evs, hoje) ?? "") ?? "—", salario: salarioBaseVigenteEm(evs, hoje), gratificacoes: gratificacoesVigentesEm(evs, hoje) };
  });

  const dados = [
    { rotulo: "Pessoa (cadastro único)", valor: `${versao?.nome ?? s.pessoa.documento} · ${formatarDocumento(s.pessoa.documento)}`, nota: "CPF, nome, endereço e contatos vivem no cadastro de pessoas (M19); aqui só o que é do servidor." },
    { rotulo: "Nome social", valor: s.nomeSocial ?? "—" },
    { rotulo: "Nascimento", valor: diaCivilBr(s.dataNascimento), tipo: "data" as const },
    { rotulo: "Sexo", valor: s.sexo },
    { rotulo: "PIS/PASEP", valor: s.pisPasep ?? "—" },
    { rotulo: "RG", valor: s.rgNumero === null ? "—" : `${s.rgNumero}${s.rgOrgaoEmissor !== null ? ` ${s.rgOrgaoEmissor}` : ""}${s.rgUf !== null ? `/${s.rgUf}` : ""}` },
    { rotulo: "Título de eleitor", valor: s.tituloEleitor ?? "—" },
    { rotulo: "CTPS", valor: s.ctpsNumero === null ? "—" : `${s.ctpsNumero}${s.ctpsSerie !== null ? ` série ${s.ctpsSerie}` : ""}` },
    { rotulo: "Filiação", valor: [s.nomeMae, s.nomePai].filter((x) => x !== null).join(" · ") || "—" },
    { rotulo: "Contato (da pessoa)", valor: [versao?.email, versao?.telefone].filter((x) => x !== null && x !== undefined).join(" · ") || "—" },
    ...vinculos.map((x) => ({
      rotulo: `Vínculo ${x.v.matricula}`,
      valor: `${x.situacao} · ${x.v.tipo} · ${x.v.regimeJuridico} · desde ${diaCivilBr(x.v.dataAdmissao)} · cargo: ${x.cargo} · lotação: ${x.lotacao} · salário base: ${x.salario?.toFixed(2) ?? "—"}${x.gratificacoes.length > 0 ? ` · gratificações: ${x.gratificacoes.map((g) => `${g.descricao} ${g.valor.toFixed(2)}`).join(", ")}` : ""}`,
      nota: "Cargo, lotação, salário e situação derivados dos eventos até hoje.",
    })),
    { rotulo: "Cadastrado em", valor: diaCivilBr(s.criadoEm), tipo: "data" as const },
    { rotulo: "Cadastrado por", valor: s.criadoPor },
  ];

  const historico: LinhaDoHistorico[] = [
    ...vinculos.flatMap((x) => [
      { id: x.v.id, oQue: `Vínculo ${x.v.matricula} (${x.v.tipo})`, quando: diaCivilBr(x.v.dataAdmissao), registradoEm: diaCivilBr(x.v.criadoEm), por: x.v.criadoPor, motivo: x.v.regimeJuridico },
      ...x.v.eventos.map((e) => ({
        id: e.id,
        oQue: `${ROTULO_DO_EVENTO[e.tipo] ?? e.tipo} · ${x.v.matricula}`,
        quando: diaCivilBr(e.data), registradoEm: diaCivilBr(e.criadoEm), por: e.criadoPor,
        motivo: [
          e.cargo !== null ? `cargo ${e.cargo.codigo} — ${e.cargo.denominacao}` : null,
          e.lotacao !== null ? `lotação ${e.lotacao.codigo} — ${e.lotacao.nome}` : null,
          e.salarioBase !== null ? `salário ${e.salarioBase.toFixed(2)}` : null,
          e.gratificacaoDescricao !== null ? `gratificação ${e.gratificacaoDescricao} ${e.gratificacaoValor?.toFixed(2) ?? ""}` : null,
          e.portaria !== null ? `portaria ${e.portaria.numero}/${e.portaria.ano}` : null,
          e.motivo,
        ].filter((p) => p !== null).join(" · "),
        ...(e.salarioBase !== null ? { valor: e.salarioBase.toFixed(2) } : {}),
      })),
    ]),
    ...s.dependentes.map((d) => ({ id: d.id, oQue: `Dependente: ${d.nome} (${d.grauParentesco})`, quando: diaCivilBr(d.dataNascimento), registradoEm: diaCivilBr(d.criadoEm), por: d.criadoPor, motivo: d.finalidades.map((f) => `${f.finalidade} desde ${diaCivilBr(f.dataInicio)}${f.dataBaixa !== null ? ` (baixa ${diaCivilBr(f.dataBaixa)})` : f.limiteIdadeAnos !== null ? ` (até ${f.limiteIdadeAnos} anos)` : ""}`).join(" · ") })),
    ...s.anotacoes.map((a) => ({ id: a.id, oQue: `Anotação: ${a.tipo} — ${a.titulo}`, quando: diaCivilBr(a.data), registradoEm: diaCivilBr(a.criadoEm), por: a.criadoPor, motivo: a.texto })),
    ...s.treinamentos.map((tr) => ({ id: tr.id, oQue: `Treinamento: ${tr.descricao}`, quando: diaCivilBr(tr.dataInicio), registradoEm: diaCivilBr(tr.criadoEm), por: tr.criadoPor, motivo: [tr.instituicao, tr.cargaHoraria !== null ? `${tr.cargaHoraria} h` : null, tr.dataTermino !== null ? `até ${diaCivilBr(tr.dataTermino)}` : null].filter((p) => p !== null).join(" · ") })),
  ];

  const ativos = vinculos.filter((x) => x.situacao !== "DESLIGADO").length;
  return {
    titulo: nome,
    subtitulo: `${formatarDocumento(s.pessoa.documento)} · ${s.vinculos.length} vínculo(s), ${ativos} vivo(s)`,
    selos: [
      s.vinculos.length === 0 ? { texto: "SEM VÍNCULO", tom: "neutro" as const } : ativos === 0 ? { texto: "DESLIGADO", tom: "erro" as const } : vinculos.some((x) => x.situacao === "AFASTADO") ? { texto: "AFASTADO", tom: "alerta" as const } : { texto: "ATIVO", tom: "ok" as const },
      ...(s.vinculos.length > 1 ? [{ texto: `${s.vinculos.length} matrículas — confira a acumulação`, tom: "alerta" as const }] : []),
    ],
    dados,
    historico,
    vinculos: vinculos.map((x) => ({ id: x.v.id, matricula: x.v.matricula, situacao: x.situacao })),
  };
}

/** As opções das telas do servidor. Com `servidorId`, as matrículas oferecidas são SÓ as dele (vivas). */
export async function opcoesDoServidor(servidorId?: string): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [pessoas, cargos, lotacoes, vinculos] = await Promise.all([
    prisma.pessoa.findMany({
      where: { tipo: "FISICA", servidor: null },
      orderBy: { documento: "asc" }, take: 500,
      select: { id: true, documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } },
    }),
    prisma.cargo.findMany({ where: { dataExtincao: null }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, denominacao: true } }),
    prisma.lotacao.findMany({ where: { dataExtincao: null }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
    servidorId === undefined ? Promise.resolve([]) : prisma.vinculo.findMany({ where: { servidorId }, orderBy: { dataAdmissao: "asc" }, select: { id: true, matricula: true, tipo: true, eventos: SELECAO_DE_EVENTOS } }),
  ]);
  const hoje = new Date();
  return {
    pessoaId: pessoas.map((p) => ({ valor: p.id, rotulo: `${p.versoes[0]?.nome ?? p.documento} (${formatarDocumento(p.documento)})` })),
    cargoId: cargos.map((c) => ({ valor: c.id, rotulo: `${c.codigo} — ${c.denominacao}` })),
    lotacaoId: lotacoes.map((l) => ({ valor: l.id, rotulo: `${l.codigo} — ${l.nome}` })),
    vinculoId: vinculos
      .map((v) => ({ v, situacao: situacaoDoVinculo(eventos(v.eventos), hoje) }))
      .filter((x) => x.situacao !== "DESLIGADO")
      .map((x) => ({ valor: x.v.id, rotulo: `${x.v.matricula} · ${x.v.tipo} · ${ROTULO_DA_SITUACAO[x.situacao]}` })),
  };
}

export async function criarServidor(c: Campos): Promise<string> {
  return comEscritaAutenticada("CADASTRAR_SERVIDOR", async (criadoPor) => {
    const r = await cadastrarServidor(cliente(), {
      pessoaId: t(c, "pessoaId"),
      ...(opcional(c, "nomeSocial") !== undefined ? { nomeSocial: t(c, "nomeSocial") } : {}),
      dataNascimento: dia(c, "dataNascimento"),
      sexo: t(c, "sexo") as "MASCULINO" | "FEMININO" | "NAO_INFORMADO",
      ...(opcional(c, "pisPasep") !== undefined ? { pisPasep: t(c, "pisPasep") } : {}),
      ...(opcional(c, "rgNumero") !== undefined ? { rgNumero: t(c, "rgNumero") } : {}),
      ...(opcional(c, "rgOrgaoEmissor") !== undefined ? { rgOrgaoEmissor: t(c, "rgOrgaoEmissor") } : {}),
      ...(opcional(c, "rgUf") !== undefined ? { rgUf: t(c, "rgUf") } : {}),
      ...(opcional(c, "tituloEleitor") !== undefined ? { tituloEleitor: t(c, "tituloEleitor") } : {}),
      ...(opcional(c, "ctpsNumero") !== undefined ? { ctpsNumero: t(c, "ctpsNumero") } : {}),
      ...(opcional(c, "ctpsSerie") !== undefined ? { ctpsSerie: t(c, "ctpsSerie") } : {}),
      ...(opcional(c, "nomeMae") !== undefined ? { nomeMae: t(c, "nomeMae") } : {}),
      ...(opcional(c, "nomePai") !== undefined ? { nomePai: t(c, "nomePai") } : {}),
      criadoPor,
    });
    return r.servidorId;
  });
}

/** As ações do detalhe do servidor. A pertença da matrícula ao servidor é conferida aqui; a regra é do domínio. */
export async function acaoDoServidor(acao: string, servidorId: string, c: Campos): Promise<string> {
  const prisma = cliente();
  const exigirVinculoDoServidor = async (): Promise<string> => {
    const v = await prisma.vinculo.findUnique({ where: { id: t(c, "vinculoId") }, select: { id: true, servidorId: true, matricula: true } });
    if (v === null || v.servidorId !== servidorId) throw new Error("O vínculo informado não é deste servidor. Nada foi gravado.");
    return v.id;
  };
  switch (acao) {
    case "admitir": {
      const r = await comEscritaAutenticada("ADMITIR_SERVIDOR", (criadoPor) =>
        admitirServidor(prisma, {
          servidorId, matricula: t(c, "matricula"), tipo: t(c, "tipo") as "EFETIVO", regimeJuridico: t(c, "regimeJuridico"),
          dataAdmissao: dia(c, "dataAdmissao"), cargoId: t(c, "cargoId"), lotacaoId: t(c, "lotacaoId"), salarioBase: decimalDaTela(t(c, "salarioBase")),
          ...(opcional(c, "observacao") !== undefined ? { observacao: t(c, "observacao") } : {}), criadoPor,
        })
      );
      return r.alertaAcumulacao.length > 0
        ? `Vínculo admitido. ATENÇÃO — acumulação: esta pessoa já tem ${r.alertaAcumulacao.map((a) => `${a.matricula} (${a.tipo})`).join(", ")}. Confira o limite constitucional.`
        : "Vínculo admitido: matrícula, cargo, lotação e salário registrados como evento de admissão.";
    }
    case "movimentar": {
      const vinculoId = await exigirVinculoDoServidor();
      await comEscritaAutenticada("MOVIMENTAR_SERVIDOR", (criadoPor) =>
        registrarMovimentacao(prisma, {
          vinculoId, tipo: t(c, "tipo") as "MUDANCA_CARGO", data: dia(c, "data"), motivo: t(c, "motivo"),
          ...(opcional(c, "cargoId") !== undefined ? { cargoId: t(c, "cargoId") } : {}),
          ...(opcional(c, "lotacaoId") !== undefined ? { lotacaoId: t(c, "lotacaoId") } : {}), criadoPor,
        })
      );
      return "Movimentação registrada como evento do vínculo; cargo e lotação de hoje já refletem.";
    }
    case "alterar-remuneracao": {
      const vinculoId = await exigirVinculoDoServidor();
      await comEscritaAutenticada("ALTERAR_REMUNERACAO", (criadoPor) =>
        registrarAlteracaoRemuneratoria(prisma, {
          vinculoId, tipo: t(c, "tipo") as "PROMOCAO", data: dia(c, "data"), motivo: t(c, "motivo"),
          ...(opcional(c, "cargoId") !== undefined ? { cargoId: t(c, "cargoId") } : {}),
          ...(opcional(c, "salarioBase") !== undefined ? { salarioBase: decimalDaTela(t(c, "salarioBase")) } : {}),
          ...(opcional(c, "gratificacaoDescricao") !== undefined ? { gratificacaoDescricao: t(c, "gratificacaoDescricao") } : {}),
          ...(opcional(c, "gratificacaoValor") !== undefined ? { gratificacaoValor: decimalDaTela(t(c, "gratificacaoValor")) } : {}), criadoPor,
        })
      );
      return "Alteração remuneratória registrada como evento; o salário vigente já reflete.";
    }
    case "desligar": {
      const vinculoId = await exigirVinculoDoServidor();
      await comEscritaAutenticada("DESLIGAR_SERVIDOR", (criadoPor) => desligarServidor(prisma, { vinculoId, data: dia(c, "data"), motivo: t(c, "motivo"), criadoPor }));
      return "Vínculo desligado — evento terminal; readmitir é outro vínculo.";
    }
    case "dependente": {
      await comEscritaAutenticada("GERIR_DEPENDENTE", (criadoPor) =>
        cadastrarDependente(prisma, {
          servidorId, nome: t(c, "nome"), ...(opcional(c, "cpf") !== undefined ? { cpf: t(c, "cpf") } : {}), dataNascimento: dia(c, "dataNascimento"),
          grauParentesco: t(c, "grauParentesco") as "FILHO", invalidezPermanente: t(c, "invalidezPermanente") === "on" || t(c, "invalidezPermanente") === "true" || t(c, "invalidezPermanente") === "1",
          finalidade: t(c, "finalidade") as "IMPOSTO_RENDA", dataInicio: dia(c, "dataInicio"), criadoPor,
        })
      );
      return "Dependente cadastrado com a finalidade; a baixa por idade é derivada do limite legal.";
    }
    case "portaria": {
      const vinculoId = await exigirVinculoDoServidor();
      await comEscritaAutenticada("REGISTRAR_PORTARIA", (criadoPor) =>
        registrarPortaria(prisma, { vinculoId, numero: t(c, "numero"), ano: inteiro(c, "ano") ?? 0, tipo: t(c, "tipo") as "NOMEACAO", data: dia(c, "data"), ementa: t(c, "ementa"), criadoPor })
      );
      return "Portaria registrada no vínculo.";
    }
    case "anotacao": {
      await comEscritaAutenticada("REGISTRAR_ANOTACAO", (criadoPor) =>
        registrarAnotacaoServidor(prisma, { servidorId, data: dia(c, "data"), tipo: t(c, "tipo") as "ELOGIO", titulo: t(c, "titulo"), texto: t(c, "texto"), criadoPor })
      );
      return "Anotação registrada na ficha (append-only, com autor).";
    }
    case "treinamento": {
      await comEscritaAutenticada("REGISTRAR_TREINAMENTO", (criadoPor) =>
        registrarTreinamento(prisma, {
          servidorId, descricao: t(c, "descricao"), ...(opcional(c, "instituicao") !== undefined ? { instituicao: t(c, "instituicao") } : {}),
          ...(inteiro(c, "cargaHoraria") !== undefined ? { cargaHoraria: inteiro(c, "cargaHoraria") as number } : {}),
          dataInicio: dia(c, "dataInicio"), ...(opcional(c, "dataTermino") !== undefined ? { dataTermino: dia(c, "dataTermino") } : {}), criadoPor,
        })
      );
      return "Treinamento registrado.";
    }
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CARGOS
// ═══════════════════════════════════════════════════════════════════════════

const ROTULO_DO_TIPO_DE_CARGO: Readonly<Record<string, string>> = { EFETIVO: "Efetivo", COMISSAO: "Em comissão", FUNCAO_GRATIFICADA: "Função gratificada", EMPREGO_PUBLICO: "Emprego público", TEMPORARIO: "Temporário", AGENTE_POLITICO: "Agente político" };

async function vinculosParaOcupacao(): Promise<readonly { readonly eventos: readonly EventoDoVinculo[] }[]> {
  const vs = await cliente().vinculo.findMany({ select: { eventos: SELECAO_DE_EVENTOS } });
  return vs.map((v) => ({ eventos: eventos(v.eventos) }));
}

export async function listarCargos(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const where: Prisma.CargoWhereInput = q === "" ? {} : { OR: [{ codigo: { contains: q, mode: "insensitive" } }, { denominacao: { contains: q, mode: "insensitive" } }] };
  const [total, linhas, vinculos] = await Promise.all([
    prisma.cargo.count({ where }),
    prisma.cargo.findMany({ where, orderBy: c.ordem === "denominacao" ? { denominacao: c.direcao } : { codigo: c.direcao }, ...paginacao(c), select: { id: true, codigo: true, denominacao: true, tipo: true, vagasFixadas: true, dataExtincao: true } }),
    vinculosParaOcupacao(),
  ]);
  const hoje = new Date();
  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id, codigo: x.codigo, denominacao: x.denominacao, tipo: ROTULO_DO_TIPO_DE_CARGO[x.tipo] ?? x.tipo, vagasFixadas: String(x.vagasFixadas),
      ocupadas: String(vagasOcupadasDoCargo(vinculos, x.id, hoje)),
      situacao: x.dataExtincao !== null ? "EXTINTO" : vagasOcupadasDoCargo(vinculos, x.id, hoje) >= x.vagasFixadas ? "SEM VAGA" : "COM VAGA",
    })),
  };
}

export async function verCargo(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.cargo.findUnique({ where: { id } });
  if (x === null) return null;
  const vinculos = await vinculosParaOcupacao();
  const hoje = new Date();
  const ocupadas = vagasOcupadasDoCargo(vinculos, x.id, hoje);
  const eventosDoCargo = await prisma.historicoVinculo.findMany({ where: { cargoId: x.id }, orderBy: { data: "asc" }, select: { id: true, tipo: true, data: true, criadoEm: true, criadoPor: true, motivo: true, vinculo: { select: { matricula: true } } } });
  return {
    titulo: `${x.codigo} — ${x.denominacao}`,
    subtitulo: `${ROTULO_DO_TIPO_DE_CARGO[x.tipo] ?? x.tipo} · ${x.vagasFixadas} vaga(s) fixada(s) · ${ocupadas} ocupada(s)`,
    selos: [x.dataExtincao !== null ? { texto: "EXTINTO", tom: "erro" } : ocupadas >= x.vagasFixadas ? { texto: "SEM VAGA", tom: "alerta" } : { texto: "COM VAGA", tom: "ok" }],
    dados: [
      { rotulo: "Código", valor: x.codigo }, { rotulo: "Denominação", valor: x.denominacao }, { rotulo: "Tipo", valor: ROTULO_DO_TIPO_DE_CARGO[x.tipo] ?? x.tipo },
      { rotulo: "Vagas fixadas em lei", valor: String(x.vagasFixadas), tipo: "inteiro" }, { rotulo: "Vagas ocupadas (contadas hoje)", valor: String(ocupadas), tipo: "inteiro", nota: "Vínculos vivos cujo cargo vigente hoje é este — contados a cada leitura." },
      { rotulo: "Lei de criação", valor: `${x.leiAutorizativa} (${diaCivilBr(x.dataPublicacaoLei)})` },
      { rotulo: "Extinção", valor: x.dataExtincao === null ? "—" : `${x.leiExtincao ?? ""} (${diaCivilBr(x.dataExtincao)})` },
      { rotulo: "Carga horária semanal", valor: x.cargaHorariaSemanal === null ? "—" : `${x.cargaHorariaSemanal} h` },
      { rotulo: "Requisito de ingresso", valor: x.requisitoIngresso ?? "—", tipo: "longo" },
      { rotulo: "Cadastrado por", valor: `${x.criadoPor} em ${diaCivilBr(x.criadoEm)}` },
    ],
    historico: eventosDoCargo.map((e) => ({ id: e.id, oQue: `${ROTULO_DO_EVENTO[e.tipo] ?? e.tipo} · ${e.vinculo.matricula}`, quando: diaCivilBr(e.data), registradoEm: diaCivilBr(e.criadoEm), por: e.criadoPor, motivo: e.motivo })),
  };
}

export async function opcoesDoCargo(): Promise<OpcoesDoCadastro> {
  return {};
}

export async function criarCargo(c: Campos): Promise<string> {
  return comEscritaAutenticada("CADASTRAR_CARGO", async (criadoPor) => {
    const r = await cadastrarCargo(cliente(), {
      codigo: t(c, "codigo"), denominacao: t(c, "denominacao"), tipo: t(c, "tipo") as "EFETIVO", vagasFixadas: inteiro(c, "vagasFixadas") ?? -1,
      leiAutorizativa: t(c, "leiAutorizativa"), dataPublicacaoLei: dia(c, "dataPublicacaoLei"),
      ...(opcional(c, "requisitoIngresso") !== undefined ? { requisitoIngresso: t(c, "requisitoIngresso") } : {}),
      ...(inteiro(c, "cargaHorariaSemanal") !== undefined ? { cargaHorariaSemanal: inteiro(c, "cargaHorariaSemanal") as number } : {}),
      criadoPor,
    });
    return r.cargoId;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LOTAÇÕES
// ═══════════════════════════════════════════════════════════════════════════

export async function listarLotacoes(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const where: Prisma.LotacaoWhereInput = q === "" ? {} : { OR: [{ codigo: { contains: q, mode: "insensitive" } }, { nome: { contains: q, mode: "insensitive" } }] };
  const [total, linhas, vinculos] = await Promise.all([
    prisma.lotacao.count({ where }),
    prisma.lotacao.findMany({ where, orderBy: c.ordem === "nome" ? { nome: c.direcao } : { codigo: c.direcao }, ...paginacao(c), select: { id: true, codigo: true, nome: true, pai: { select: { codigo: true } }, unidadeOrc: { select: { codigo: true, descricao: true } } } }),
    vinculosParaOcupacao(),
  ]);
  const hoje = new Date();
  return {
    total,
    linhas: linhas.map((x) => ({ id: x.id, codigo: x.codigo, nome: x.nome, pai: x.pai?.codigo ?? "—", unidade: x.unidadeOrc === null ? "—" : `${x.unidadeOrc.codigo} — ${x.unidadeOrc.descricao}`, lotados: String(lotadosNaLotacao(vinculos, x.id, hoje)) })),
  };
}

export async function verLotacao(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.lotacao.findUnique({ where: { id }, include: { pai: { select: { codigo: true, nome: true } }, unidadeOrc: { select: { codigo: true, descricao: true } }, filhas: { select: { codigo: true, nome: true } } } });
  if (x === null) return null;
  const vinculos = await vinculosParaOcupacao();
  const hoje = new Date();
  const eventosDaLotacao = await prisma.historicoVinculo.findMany({ where: { lotacaoId: x.id }, orderBy: { data: "asc" }, select: { id: true, tipo: true, data: true, criadoEm: true, criadoPor: true, motivo: true, vinculo: { select: { matricula: true } } } });
  return {
    titulo: `${x.codigo} — ${x.nome}`,
    subtitulo: `${lotadosNaLotacao(vinculos, x.id, hoje)} lotado(s) hoje`,
    selos: [x.dataExtincao !== null ? { texto: "EXTINTA", tom: "erro" } : { texto: "VIGENTE", tom: "ok" }],
    dados: [
      { rotulo: "Código", valor: x.codigo }, { rotulo: "Nome", valor: x.nome },
      { rotulo: "Superior", valor: x.pai === null ? "— (raiz)" : `${x.pai.codigo} — ${x.pai.nome}` },
      { rotulo: "Unidade orçamentária", valor: x.unidadeOrc === null ? "—" : `${x.unidadeOrc.codigo} — ${x.unidadeOrc.descricao}` },
      { rotulo: "Subordinadas", valor: x.filhas.length === 0 ? "—" : x.filhas.map((f) => `${f.codigo} — ${f.nome}`).join(" · ") },
      { rotulo: "Lotados hoje", valor: String(lotadosNaLotacao(vinculos, x.id, hoje)), tipo: "inteiro", nota: "Vínculos vivos cuja lotação vigente hoje é esta — contados a cada leitura." },
      { rotulo: "Cadastrada por", valor: `${x.criadoPor} em ${diaCivilBr(x.criadoEm)}` },
    ],
    historico: eventosDaLotacao.map((e) => ({ id: e.id, oQue: `${ROTULO_DO_EVENTO[e.tipo] ?? e.tipo} · ${e.vinculo.matricula}`, quando: diaCivilBr(e.data), registradoEm: diaCivilBr(e.criadoEm), por: e.criadoPor, motivo: e.motivo })),
  };
}

export async function opcoesDaLotacao(): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [lotacoes, unidades] = await Promise.all([
    prisma.lotacao.findMany({ where: { dataExtincao: null }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
    prisma.unidadeOrcamentaria.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true } }),
  ]);
  return {
    paiId: lotacoes.map((l) => ({ valor: l.id, rotulo: `${l.codigo} — ${l.nome}` })),
    unidadeOrcId: unidades.map((u) => ({ valor: u.id, rotulo: `${u.codigo} — ${u.descricao}` })),
  };
}

export async function criarLotacao(c: Campos): Promise<string> {
  return comEscritaAutenticada("CADASTRAR_LOTACAO", async (criadoPor) => {
    const r = await cadastrarLotacao(cliente(), {
      codigo: t(c, "codigo"), nome: t(c, "nome"),
      ...(opcional(c, "paiId") !== undefined ? { paiId: t(c, "paiId") } : {}),
      ...(opcional(c, "unidadeOrcId") !== undefined ? { unidadeOrcId: t(c, "unidadeOrcId") } : {}),
      criadoPor,
    });
    return r.lotacaoId;
  });
}
