import { diaCivilBr } from "../../../packages/datas/index.js";
import {
  cadastrarLocalizacaoFisica,
  cadastrarMotivoDeBaixa,
  cadastrarTipoDeIncorporacao,
  definirDivulgacaoDaLocalizacao,
  historicoDaDivulgacao,
} from "../../../modules/m10-patrimonial/gestao-do-bem.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import { comEscritaAutenticada } from "../sessao";
import { acoesPermitidas } from "../molde";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";

/**
 * ═══ OS DADOS DA GESTÃO DO BEM — M10, TR 5.19 ═══
 *
 * Leitura e escrita dos três cadastros de apoio, pelo molde. Nenhuma regra de negócio mora
 * aqui: a escrita chama o serviço do domínio, e a recusa dele sobe como veio.
 *
 * ⚠️ AS OPÇÕES SÃO CHAVEADAS PELO NOME DO CAMPO, e isso agora é cobrado por teste (t20 de
 * `test/molde/molde.test.ts`). `paiId` e `setorId` existem aqui porque os campos do descritor
 * têm esses nomes — se um deles fosse renomeado sem renomear a chave, o select apareceria
 * desabilitado dizendo "nenhuma opção cadastrada", que é uma mensagem que explica a causa
 * errada quando os registros existem.
 */

export { PortaSemBancoError };

function paginacao(c: ConsultaDoMolde): { readonly skip: number; readonly take: number } {
  return { skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA };
}

function texto(v: string): { readonly contains: string; readonly mode: "insensitive" } {
  return { contains: v, mode: "insensitive" };
}

type Campos = Readonly<Record<string, string>>;

const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const opcional = (c: Campos, k: string): string | undefined => {
  const v = t(c, k);
  return v === "" ? undefined : v;
};

// ═══════════════════════════════════════════════════════════════════════════
// LOCALIZAÇÕES FÍSICAS (TR 5.19.9)
// ═══════════════════════════════════════════════════════════════════════════

export async function listarLocalizacoes(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const where = q === "" ? {} : { OR: [{ codigo: texto(q) }, { descricao: texto(q) }] };

  const [total, linhas] = await Promise.all([
    prisma.localizacaoFisica.count({ where }),
    prisma.localizacaoFisica.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { codigo: "asc" } : { [c.ordem]: c.direcao },
      select: {
        id: true,
        codigo: true,
        descricao: true,
        ativa: true,
        publicavelNaTransparencia: true,
        pai: { select: { codigo: true, descricao: true } },
        setor: { select: { codigo: true, nome: true } },
      },
    }),
  ]);

  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id,
      codigo: x.codigo,
      descricao: x.descricao,
      pai: x.pai === null ? "—" : `${x.pai.codigo} — ${x.pai.descricao}`,
      setor: x.setor === null ? "—" : `${x.setor.codigo} — ${x.setor.nome}`,
      publicacao: x.publicavelNaTransparencia ? "Divulgada" : "Não divulgada",
      situacao: x.ativa ? "Ativa" : "Inativa",
    })),
  };
}

export async function verLocalizacao(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.localizacaoFisica.findUnique({
    where: { id },
    select: {
      codigo: true,
      descricao: true,
      ativa: true,
      publicavelNaTransparencia: true,
      criadoEm: true,
      criadoPor: true,
      pai: { select: { codigo: true, descricao: true } },
      setor: { select: { codigo: true, nome: true } },
      filhos: {
        select: { id: true, codigo: true, descricao: true, criadoEm: true, criadoPor: true },
        orderBy: { codigo: "asc" },
        take: 100,
      },
      _count: { select: { movimentos: true } },
    },
  });
  if (x === null) return null;

  return {
    titulo: `${x.codigo} — ${x.descricao}`,
    subtitulo:
      x.pai === null
        ? "Localização de primeiro nível"
        : `Dentro de ${x.pai.codigo} — ${x.pai.descricao}`,
    selos: [{ texto: x.ativa ? "Ativa" : "Inativa", tom: x.ativa ? "ok" : "neutro" }],
    dados: [
      {
        rotulo: "Setor responsável",
        valor: x.setor === null ? "—" : `${x.setor.codigo} — ${x.setor.nome}`,
        nota: "Setor responsável pela guarda dos bens neste local.",
      },
      {
        rotulo: "Consulta pública de bens",
        valor: x.publicavelNaTransparencia ? "Localização divulgada" : "Localização não divulgada",
        nota:
          "Quando não divulgada, os bens continuam na consulta pública, sem a indicação deste local.",
      },
      { rotulo: "Sublocalizações", valor: String(x.filhos.length), tipo: "inteiro" },
      {
        rotulo: "Movimentos de bem nesta localização",
        valor: String(x._count.movimentos),
        tipo: "inteiro",
        nota: "Transferências e demais movimentações de bens para este local.",
      },
      { rotulo: "Criada em", valor: diaCivilBr(x.criadoEm), tipo: "data" },
      { rotulo: "Criada por", valor: x.criadoPor },
    ],
    // ⚠️ O "HISTÓRICO" DESTE CADASTRO É A ÁRVORE ABAIXO DELE. Um cadastro de apoio não tem
    // movimento próprio — o que muda embaixo dele é o que interessa a quem procura um bem.
    historico: x.filhos.map((f) => ({
      id: f.id,
      oQue: `Sublocalização ${f.codigo} — ${f.descricao}`,
      quando: diaCivilBr(f.criadoEm),
      registradoEm: diaCivilBr(f.criadoEm),
      por: f.criadoPor,
      motivo: null,
      estornado: false,
    })),
  };
}

/**
 * A POLÍTICA DE DIVULGAÇÃO de uma localização já cadastrada, e o histórico dela (V10 T3 · N2).
 *
 * ⚠️ FECHA `LOCALIZACAO-PUBLICAVEL-SO-NA-CRIACAO`. A política só podia ser escolhida no
 * cadastro: um município com o acervo já cadastrado não tinha caminho nenhum para publicar a
 * localização de uma escola, nem para RETIRAR do portal um depósito que nunca deveria ter
 * entrado. A regra (ação própria, motivo obrigatório, histórico append-only, repetição
 * recusada) é do domínio — `modules/m10-patrimonial/gestao-do-bem.ts`.
 */
export interface DivulgacaoDaLocalizacaoNaTela {
  readonly id: string;
  readonly descricao: string;
  readonly divulgada: boolean;
  readonly podeDefinir: boolean;
  readonly historico: readonly {
    readonly de: boolean;
    readonly para: boolean;
    readonly motivo: string;
    readonly quando: string;
    readonly por: string;
  }[];
}

export async function divulgacaoDaLocalizacao(id: string): Promise<DivulgacaoDaLocalizacaoNaTela | null> {
  const prisma = cliente();
  const [loc, historico, permitidas] = await Promise.all([
    prisma.localizacaoFisica.findUnique({
      where: { id },
      select: { id: true, descricao: true, publicavelNaTransparencia: true },
    }),
    historicoDaDivulgacao(prisma, id),
    acoesPermitidas(["DEFINIR_DIVULGACAO_DA_LOCALIZACAO"]),
  ]);
  if (loc === null) return null;
  return {
    id: loc.id,
    descricao: loc.descricao,
    divulgada: loc.publicavelNaTransparencia,
    podeDefinir: permitidas.has("DEFINIR_DIVULGACAO_DA_LOCALIZACAO"),
    historico: historico.map((h) => ({
      de: h.de,
      para: h.para,
      motivo: h.motivo,
      quando: diaCivilBr(h.criadoEm),
      por: h.criadoPor,
    })),
  };
}

export async function definirDivulgacaoNaTela(c: Campos): Promise<string> {
  const publicavel = t(c, "publicavel") === "sim";
  const r = await comEscritaAutenticada("DEFINIR_DIVULGACAO_DA_LOCALIZACAO", (criadoPor) =>
    definirDivulgacaoDaLocalizacao(cliente(), {
      localizacaoId: t(c, "__localizacao"),
      publicavel,
      motivo: t(c, "motivo"),
      criadoPor,
    })
  );
  return r.para
    ? "A localização passou a ser divulgada na consulta pública de bens."
    : "A localização deixou de ser divulgada. Os bens continuam na consulta pública, sem a indicação deste local.";
}

export async function criarLocalizacao(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_LOCALIZACAO_FISICA", (criadoPor) =>
    cadastrarLocalizacaoFisica(cliente(), {
      codigo: t(c, "codigo"),
      descricao: t(c, "descricao"),
      ...(opcional(c, "paiId") !== undefined ? { paiId: t(c, "paiId") } : {}),
      ...(opcional(c, "setorId") !== undefined ? { setorId: t(c, "setorId") } : {}),
      // ⚠️ O checkbox do molde chega como "on"/ausente. `=== "on"` (e não "truthy") para que
      // um campo vazio, que é o caso comum, não vire divulgação por acidente.
      publicavelNaTransparencia: t(c, "publicavelNaTransparencia") === "on",
      criadoPor,
    })
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MOTIVOS DE BAIXA (TR 5.19.30)
// ═══════════════════════════════════════════════════════════════════════════

export async function listarMotivosDeBaixa(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const where = q === "" ? {} : { OR: [{ codigo: texto(q) }, { descricao: texto(q) }] };

  const [total, linhas] = await Promise.all([
    prisma.motivoDeBaixa.count({ where }),
    prisma.motivoDeBaixa.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { codigo: "asc" } : { [c.ordem]: c.direcao },
      select: { id: true, codigo: true, descricao: true, ativo: true },
    }),
  ]);

  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id,
      codigo: x.codigo,
      descricao: x.descricao,
      situacao: x.ativo ? "Ativo" : "Inativo",
    })),
  };
}

export async function verMotivoDeBaixa(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.motivoDeBaixa.findUnique({
    where: { id },
    select: { codigo: true, descricao: true, ativo: true, criadoEm: true, criadoPor: true },
  });
  if (x === null) return null;

  return {
    titulo: `${x.codigo} — ${x.descricao}`,
    subtitulo: "Motivo de baixa do acervo patrimonial",
    selos: [{ texto: x.ativo ? "Ativo" : "Inativo", tom: x.ativo ? "ok" : "neutro" }],
    dados: [
      {
        rotulo: "O que este motivo significa",
        valor: x.descricao,
        nota: "Motivo definido pelo ente e registrado em cada baixa.",
      },
      { rotulo: "Criado em", valor: diaCivilBr(x.criadoEm), tipo: "data" },
      { rotulo: "Criado por", valor: x.criadoPor },
    ],
    historico: [],
  };
}

export async function criarMotivoDeBaixa(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_MOTIVO_DE_BAIXA", (criadoPor) =>
    cadastrarMotivoDeBaixa(cliente(), {
      codigo: t(c, "codigo"),
      descricao: t(c, "descricao"),
      criadoPor,
    })
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS DE INCORPORAÇÃO (TR 5.19.3 e 5.19.7)
// ═══════════════════════════════════════════════════════════════════════════

export async function listarTiposDeIncorporacao(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const where = q === "" ? {} : { OR: [{ codigo: texto(q) }, { descricao: texto(q) }] };

  const [total, linhas] = await Promise.all([
    prisma.tipoDeIncorporacao.count({ where }),
    prisma.tipoDeIncorporacao.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { codigo: "asc" } : { [c.ordem]: c.direcao },
      select: {
        id: true,
        codigo: true,
        descricao: true,
        ativo: true,
        _count: { select: { bens: true } },
      },
    }),
  ]);

  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id,
      codigo: x.codigo,
      descricao: x.descricao,
      bens: String(x._count.bens),
      situacao: x.ativo ? "Ativo" : "Inativo",
    })),
  };
}

export async function verTipoDeIncorporacao(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.tipoDeIncorporacao.findUnique({
    where: { id },
    select: {
      codigo: true,
      descricao: true,
      ativo: true,
      criadoEm: true,
      criadoPor: true,
      bens: {
        select: {
          id: true,
          numeroTombamento: true,
          descricao: true,
          dataAquisicao: true,
          criadoEm: true,
          criadoPor: true,
        },
        orderBy: { numeroTombamento: "asc" },
        take: 100,
      },
    },
  });
  if (x === null) return null;

  return {
    titulo: `${x.codigo} — ${x.descricao}`,
    subtitulo: "Como o bem entrou no acervo",
    selos: [{ texto: x.ativo ? "Ativo" : "Inativo", tom: x.ativo ? "ok" : "neutro" }],
    dados: [
      {
        rotulo: "Bens incorporados por este tipo",
        valor: String(x.bens.length),
        tipo: "inteiro",
        nota: "Forma de entrada do bem no acervo; aquisição e doação geram lançamentos contábeis distintos.",
      },
      { rotulo: "Criado em", valor: diaCivilBr(x.criadoEm), tipo: "data" },
      { rotulo: "Criado por", valor: x.criadoPor },
    ],
    // ⚠️ AS DUAS DATAS SÃO DIFERENTES, E O MOLDE AS SEPARA DE PROPÓSITO: `quando` é a data do
    // FATO (a aquisição do bem) e `registradoEm` é o instante em que alguém digitou. Repetir
    // `criadoEm` nas duas faria um bem adquirido em março, cadastrado em maio, parecer de
    // maio — que é exatamente a confusão que a aba de histórico existe para desfazer.
    historico: x.bens.map((b) => ({
      id: b.id,
      oQue: `Bem ${b.numeroTombamento} — ${b.descricao}`,
      quando: diaCivilBr(b.dataAquisicao),
      registradoEm: diaCivilBr(b.criadoEm),
      por: b.criadoPor,
      motivo: null,
      estornado: false,
    })),
  };
}

export async function criarTipoDeIncorporacao(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_TIPO_DE_INCORPORACAO", (criadoPor) =>
    cadastrarTipoDeIncorporacao(cliente(), {
      codigo: t(c, "codigo"),
      descricao: t(c, "descricao"),
      criadoPor,
    })
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AS OPÇÕES — chaveadas pelo NOME DO CAMPO do descritor (ver o cabeçalho)
// ═══════════════════════════════════════════════════════════════════════════

export async function opcoesDaGestaoDoBem(): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [localizacoes, setores] = await Promise.all([
    prisma.localizacaoFisica.findMany({
      where: { ativa: true },
      select: { id: true, codigo: true, descricao: true },
      orderBy: { codigo: "asc" },
      take: 500,
    }),
    prisma.setor.findMany({
      where: { ativo: true },
      select: { id: true, codigo: true, nome: true },
      orderBy: { codigo: "asc" },
      take: 300,
    }),
  ]);

  return {
    paiId: localizacoes.map((l) => ({
      valor: l.id,
      rotulo: `${l.codigo} — ${l.descricao}`,
    })),
    setorId: setores.map((s) => ({ valor: s.id, rotulo: `${s.codigo} — ${s.nome}` })),
  };
}
