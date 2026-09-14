import { diaCivilBr, instanteCivilBr } from "../../../packages/datas/index.js";
import { ELEGIVEL, naoAplicavel } from "../../../packages/contracts/index.js";
import { CAMPOS_DO_CADASTRO, TIPOS_DE_CAMPO, type CampoDoFormulario } from "../../../modules/m21-protocolo/carta.js";
import { cadastrarServicoDaCarta, cadastrarVersaoDoServico, publicarVersaoDoServico } from "../../../modules/m21-protocolo/servico.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { DadoDoDetalhe, DisponibilidadeDoRegistro, LinhaDoHistorico } from "../../molde/tipos.js";
import { cliente, PortaSemBancoError } from "../cliente";
import { apresentar, RegistroMudouError, versaoDoEstado } from "../disponibilidade";
import { comEscritaAutenticada } from "../sessao";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";
import { OPCOES_DE_TIPO_DE_SERVICO } from "./servicos-da-carta";

/**
 * A PORTA DA CONFIGURAÇÃO DA CARTA (M21, V6.2 P3). Lê e chama; quem decide é o domínio — formulário
 * fora do vocabulário, campo fora do cadastro, prazo sem fundamento e versão já publicada são recusas
 * do caso de uso, e sobem como vieram.
 */
export { PortaSemBancoError };

/** Os tipos de campo com rótulo de tela — a ilha os recebe por prop (não importa porta). */
export const CAMPOS_DO_CADASTRO_DA_TELA: readonly string[] = CAMPOS_DO_CADASTRO;
export const TIPOS_DE_CAMPO_DA_TELA: readonly { readonly valor: string; readonly rotulo: string }[] = TIPOS_DE_CAMPO.map((t) => ({ valor: t, rotulo: { texto: "Texto curto", textoLongo: "Texto longo", data: "Data", email: "E-mail", telefone: "Telefone" }[t] }));

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const ROTULO_DO_TIPO: Readonly<Record<string, string>> = Object.fromEntries(OPCOES_DE_TIPO_DE_SERVICO.map((o) => [o.valor, o.rotulo.replace(/ \(.*\)$/, "")]));

const SELECAO = {
  id: true, slug: true, titulo: true, categoria: true, publico: true, tipo: true, criadoEm: true, criadoPor: true,
  assunto: { select: { codigo: true, nome: true } },
  versoes: {
    orderBy: { numero: "desc" as const },
    select: {
      id: true, numero: true, descricao: true, requisitos: true, documentos: true, canais: true, custo: true, prazoDias: true, fundamentoDoPrazo: true, campos: true, criadoEm: true, criadoPor: true,
      setorDeEntrada: { select: { codigo: true, nome: true } }, publicacao: { select: { id: true, criadoEm: true, criadoPor: true, etapas: true } }, _count: { select: { solicitacoes: true } },
    },
  },
} as const;

export async function listarServicosDaCarta(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const q = (c.filtros["q"] ?? "").trim();
  const where = q === "" ? {} : { OR: [{ titulo: { contains: q, mode: "insensitive" as const } }, { slug: { contains: q.toLowerCase() } }] };
  const [total, lista] = await Promise.all([
    cliente().servicoDaCarta.count({ where }),
    cliente().servicoDaCarta.findMany({ where, orderBy: [{ categoria: "asc" }, { titulo: "asc" }], skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA, select: SELECAO }),
  ]);
  return {
    total,
    linhas: lista.map((s) => {
      const publicada = s.versoes.find((v) => v.publicacao !== null);
      const rascunhos = s.versoes.filter((v) => v.publicacao === null);
      return {
        id: s.id, titulo: s.titulo, endereco: `/servicos/${s.slug}`, tipo: ROTULO_DO_TIPO[s.tipo] ?? s.tipo,
        publicada: publicada === undefined ? "nenhuma — fora da carta" : `versão ${publicada.numero} desde ${diaCivilBr(publicada.publicacao?.criadoEm ?? publicada.criadoEm)}`,
        rascunho: rascunhos.length === 0 ? "—" : rascunhos.map((v) => `v${v.numero}`).join(", "),
        solicitacoes: String(s.versoes.reduce((n, v) => n + v._count.solicitacoes, 0)),
      };
    }),
  };
}

export async function verServicoDaCarta(id: string): Promise<(DetalheLido & { readonly slug: string; readonly tipo: string }) | null> {
  const s = await cliente().servicoDaCarta.findUnique({ where: { id }, select: SELECAO });
  if (s === null) return null;
  const dados: DadoDoDetalhe[] = [
    { rotulo: "Endereço público", valor: `/servicos/${s.slug}` },
    { rotulo: "Tipo", valor: ROTULO_DO_TIPO[s.tipo] ?? s.tipo },
    { rotulo: "Público e categoria", valor: `${s.publico} · ${s.categoria}` },
    { rotulo: "Assunto do protocolo", valor: `${s.assunto.codigo} — ${s.assunto.nome}`, nota: "Roteiro, sigilo e termo de aceite vêm do assunto." },
    ...s.versoes.map((v) => {
      const campos = (v.campos as unknown as CampoDoFormulario[]) ?? [];
      return {
        rotulo: `Versão ${v.numero} — ${v.publicacao === null ? "RASCUNHO" : `publicada em ${diaCivilBr(v.publicacao.criadoEm)}`}`,
        valor: [
          v.descricao,
          `Requisitos: ${v.requisitos}`,
          `Documentos: ${v.documentos.length === 0 ? "nenhum" : v.documentos.join("; ")}`,
          `Canais: ${v.canais}`,
          `Custo: ${v.custo ?? "não declarado"}`,
          `Prazo: ${v.prazoDias === null ? "não declarado" : `${v.prazoDias} dias — ${v.fundamentoDoPrazo ?? ""}`}`,
          `Entrada: ${v.setorDeEntrada.codigo} — ${v.setorDeEntrada.nome}`,
          `Formulário: ${campos.map((c) => `${c.rotulo} (${c.tipo}${c.obrigatorio ? ", obrigatório" : ""})`).join("; ")}`,
          ...(v.publicacao === null ? [] : [`Etapas publicadas: ${((v.publicacao.etapas as unknown as { ordem: number; setor: string }[]) ?? []).map((e) => `${e.ordem}. ${e.setor}`).join("; ") || "o assunto não tem roteiro"}`]),
          `Solicitações nesta versão: ${v._count.solicitacoes}`,
        ].join("\n"),
        tipo: "longo" as const,
      };
    }),
  ];
  const historico: LinhaDoHistorico[] = [
    { id: `s-${s.id}`, oQue: "Serviço cadastrado", quando: diaCivilBr(s.criadoEm), registradoEm: instanteCivilBr(s.criadoEm), por: s.criadoPor },
    ...s.versoes.flatMap((v) => [
      { id: v.id, oQue: `Versão ${v.numero} cadastrada`, quando: diaCivilBr(v.criadoEm), registradoEm: instanteCivilBr(v.criadoEm), por: v.criadoPor },
      ...(v.publicacao === null ? [] : [{ id: v.publicacao.id, oQue: `Versão ${v.numero} PUBLICADA`, quando: diaCivilBr(v.publicacao.criadoEm), registradoEm: instanteCivilBr(v.publicacao.criadoEm), por: v.publicacao.criadoPor }]),
    ]),
  ];
  const publicada = s.versoes.find((v) => v.publicacao !== null);
  return {
    titulo: s.titulo,
    subtitulo: `/servicos/${s.slug} · ${ROTULO_DO_TIPO[s.tipo] ?? s.tipo}`,
    selos: publicada === undefined ? [{ texto: "FORA DA CARTA — nenhuma versão publicada", tom: "alerta" }] : [{ texto: `NA CARTA — versão ${publicada.numero}`, tom: "ok" }],
    dados,
    historico,
    slug: s.slug,
    tipo: s.tipo,
  };
}

export async function opcoesDoServicoDaCarta(servicoId?: string): Promise<OpcoesDoCadastro> {
  const assuntos = await cliente().assunto.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } });
  const rascunhos = servicoId === undefined ? [] : await cliente().versaoDoServico.findMany({ where: { servicoId, publicacao: null }, orderBy: { numero: "asc" }, select: { id: true, numero: true, criadoPor: true } });
  return {
    assuntoId: assuntos.map((a) => ({ valor: a.id, rotulo: `${a.codigo} — ${a.nome}` })),
    versaoId: rascunhos.map((v) => ({ valor: v.id, rotulo: `versão ${v.numero} (cadastrada por ${v.criadoPor})` })),
  };
}

async function rascunhos(servicoId: string): Promise<readonly string[]> {
  return (await cliente().versaoDoServico.findMany({ where: { servicoId, publicacao: null }, select: { id: true } })).map((v) => v.id).sort();
}

export async function disponibilidadeDoServicoDaCarta(servicoId: string): Promise<DisponibilidadeDoRegistro> {
  const rs = await rascunhos(servicoId);
  return {
    versao: versaoDoEstado(rs),
    porAcao: { "publicar-versao": apresentar(rs.length === 0 ? naoAplicavel("SEM-VERSAO-EM-RASCUNHO", "Não há versão em rascunho a publicar. Cadastre uma versão nova para mudar a carta.") : ELEGIVEL) },
  };
}

export async function criarServicoDaCarta(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("CONFIGURAR_CARTA_DE_SERVICOS", (criadoPor) =>
    cadastrarServicoDaCarta(cliente(), { slug: t(c, "slug").toLowerCase(), titulo: t(c, "titulo"), categoria: t(c, "categoria"), publico: t(c, "publico") as never, tipo: t(c, "tipo") as never, assuntoId: t(c, "assuntoId"), criadoPor })
  );
  return r.servicoId;
}

export async function acaoDoServicoDaCarta(acao: string, servicoId: string, c: Campos): Promise<string> {
  if (acao !== "publicar-versao") throw new Error(`Ação desconhecida: ${acao}. Nada foi gravado.`);
  const versaoDoFormulario = t(c, "__versao");
  if (versaoDoFormulario !== "" && versaoDoEstado(await rascunhos(servicoId)) !== versaoDoFormulario) throw new RegistroMudouError("Este serviço");
  const r = await comEscritaAutenticada("CONFIGURAR_CARTA_DE_SERVICOS", (criadoPor) => publicarVersaoDoServico(cliente(), { versaoId: t(c, "versaoId"), criadoPor }));
  return `Versão publicada — é a que a carta mostra agora, com ${r.etapas} etapa(s) copiada(s) do roteiro do assunto.`;
}

export interface LinhaDoCampoDoFormulario {
  readonly nome: string;
  readonly rotulo: string;
  readonly tipo: string;
  readonly obrigatorio: string;
}

/**
 * A VERSÃO NOVA pela ilha. As linhas do formulário vêm como texto e são convertidas SEM julgar: linha
 * vazia some, o resto vai ao Zod do caso de uso, que diz o que está errado em cada campo.
 */
export async function criarVersaoDoServicoDaCarta(servicoId: string, c: Campos, linhas: readonly LinhaDoCampoDoFormulario[]): Promise<number> {
  const campos = linhas
    .filter((l) => l.nome.trim() !== "" || l.rotulo.trim() !== "")
    .map((l) => ({ nome: l.nome.trim(), rotulo: l.rotulo.trim(), tipo: l.tipo, obrigatorio: l.obrigatorio === "sim" }));
  const prazo = t(c, "prazoDias");
  const r = await comEscritaAutenticada("CONFIGURAR_CARTA_DE_SERVICOS", (criadoPor) =>
    cadastrarVersaoDoServico(cliente(), {
      servicoId, descricao: t(c, "descricao"), requisitos: t(c, "requisitos"),
      documentos: t(c, "documentos").split("\n").map((x) => x.trim()).filter((x) => x !== ""),
      canais: t(c, "canais"), ...(t(c, "custo") !== "" ? { custo: t(c, "custo") } : {}),
      ...(prazo !== "" ? { prazoDias: Number.parseInt(prazo, 10) } : {}), ...(t(c, "fundamentoDoPrazo") !== "" ? { fundamentoDoPrazo: t(c, "fundamentoDoPrazo") } : {}),
      exigeAutenticacao: t(c, "exigeAutenticacao") !== "nao", setorDeEntradaId: t(c, "setorDeEntradaId"), campos, criadoPor,
    })
  );
  return r.numero;
}
