import {
  anularAbastecimento,
  anularSituacaoDaFrota,
  cadastrarMaquina,
  cadastrarVeiculo,
  publicarVersaoDaMaquina,
  publicarVersaoDoVeiculo,
  registrarAbastecimento,
  registrarSituacaoDaFrota,
  type CadastrarMaquinaInput,
  type CadastrarVeiculoInput,
} from "../../modules/m36-frota/servico.js";
import { ROTULO_COMBUSTIVEL, ROTULO_SITUACAO, ROTULO_TIPO_DE_FROTA, situacaoNoDia } from "../../modules/m36-frota/dominio.js";
import { cadastrarFarmacia, informarEstoqueDaFarmacia, publicarVersaoDaFarmacia, type CadastrarFarmaciaInput } from "../../modules/m37-farmacia/servico.js";
import { unidadesGestorasOperadas } from "../../modules/m01-core-contabil/unidade-gestora.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * V27 — A FROTA E AS FARMÁCIAS PÚBLICAS na tela (M36, M37). As regras ficam nos serviços; aqui só a leitura para a tela
 * e a autorização da escrita pela ação nomeada.
 */

export { ROTULO_COMBUSTIVEL, ROTULO_SITUACAO, ROTULO_TIPO_DE_FROTA };

type SemAutor<T> = Omit<T, "criadoPor">;

export interface BemNaTela {
  readonly id: string;
  readonly categoria: "VEICULO" | "MAQUINA";
  readonly identificacao: string;
  readonly ug: string;
  readonly descricao: string;
  readonly tipo: string;
  readonly dono: string;
  readonly locador: string | null;
  readonly combustivel: string;
  readonly situacao: string;
  readonly pendencia: string | null;
  readonly versao: number;
  /** Dados da versão vigente, para preencher a versão nova. */
  readonly dados: Readonly<Record<string, string>>;
  readonly situacoes: readonly { readonly id: string; readonly dia: string; readonly situacao: string; readonly motivo: string; readonly anulada: boolean }[];
  readonly abastecimentos: readonly { readonly id: string; readonly dia: string; readonly combustivel: string; readonly quantidade: string; readonly documento: string; readonly anulado: boolean }[];
}

export async function lerFrota(): Promise<{ readonly bens: readonly BemNaTela[]; readonly ugs: readonly { readonly id: string; readonly rotulo: string }[] }> {
  await exigirLeituraDoEnte("CONSULTAR_PATRIMONIO");
  const prisma = cliente();
  const hoje = diaCivil(new Date());
  const pessoaSel = { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" as const }, take: 1, select: { nome: true } } } };
  const comum = {
    ug: { select: { codigoTce: true, nome: true } },
    situacoes: { orderBy: { desde: "desc" as const }, select: { id: true, desde: true, situacao: true, motivo: true, anulacao: { select: { id: true } } } },
    abastecimentos: { orderBy: { data: "desc" as const }, take: 12, select: { id: true, data: true, combustivel: true, quantidade: true, documento: true, anulacao: { select: { id: true } } } },
  };
  const [veiculos, maquinas, ugs] = await Promise.all([
    prisma.veiculoDaFrota.findMany({
      orderBy: { placa: "asc" },
      select: { id: true, placa: true, ...comum, versoes: { orderBy: { versao: "desc" }, take: 1, select: { versao: true, anoModelo: true, renavam: true, numeroModelo: true, tipoFrota: true, combustivelPrincipal: true, proprietario: pessoaSel, locador: pessoaSel } } },
    }),
    prisma.maquinaDaFrota.findMany({
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, ...comum, versoes: { orderBy: { versao: "desc" }, take: 1, select: { versao: true, anoFabricacao: true, descricao: true, tipoFrota: true, combustivelPrincipal: true, proprietario: pessoaSel, locador: pessoaSel } } },
    }),
    unidadesGestorasOperadas(prisma, new Date()),
  ]);
  const nomeDe = (p: { readonly documento: string; readonly versoes: readonly { readonly nome: string }[] } | null): string | null => (p === null ? null : `${p.versoes[0]?.nome ?? ""} (${p.documento})`);
  const comuns = (b: (typeof veiculos)[number] | (typeof maquinas)[number]) => ({
    ug: `${b.ug.codigoTce} — ${b.ug.nome}`,
    situacao: ROTULO_SITUACAO[situacaoNoDia(b.situacoes.filter((s) => s.anulacao === null).map((s) => ({ dia: diaCivil(s.desde), situacao: s.situacao })), hoje) ?? "EM_USO"],
    situacoes: b.situacoes.map((s) => ({ id: s.id, dia: diaCivilBr(s.desde), situacao: ROTULO_SITUACAO[s.situacao], motivo: s.motivo, anulada: s.anulacao !== null })),
    abastecimentos: b.abastecimentos.map((a) => ({ id: a.id, dia: diaCivilBr(a.data), combustivel: ROTULO_COMBUSTIVEL[a.combustivel], quantidade: a.quantidade.toFixed(2).replace(".", ","), documento: a.documento, anulado: a.anulacao !== null })),
  });
  const bens: BemNaTela[] = [
    ...veiculos.flatMap((v) => {
      const x = v.versoes[0];
      if (x === undefined) return [];
      return [{
        id: v.id,
        categoria: "VEICULO" as const,
        identificacao: v.placa,
        descricao: `Ano modelo ${String(x.anoModelo)} · RENAVAM ${x.renavam}${x.numeroModelo === null ? "" : ` · modelo ${x.numeroModelo}`}`,
        tipo: ROTULO_TIPO_DE_FROTA[x.tipoFrota],
        dono: x.tipoFrota === "PROPRIO" ? "A própria unidade gestora" : (nomeDe(x.proprietario) ?? ""),
        locador: nomeDe(x.locador),
        combustivel: ROTULO_COMBUSTIVEL[x.combustivelPrincipal],
        pendencia: x.numeroModelo === null ? "Falta o número do modelo da tabela do Tribunal: publique uma versão com ele." : null,
        versao: x.versao,
        dados: { anoModelo: String(x.anoModelo), renavam: x.renavam, numeroModelo: x.numeroModelo ?? "", tipoFrota: x.tipoFrota, combustivelPrincipal: x.combustivelPrincipal, proprietarioDocumento: x.proprietario?.documento ?? "", locadorDocumento: x.locador?.documento ?? "" },
        ...comuns(v),
      }];
    }),
    ...maquinas.flatMap((m) => {
      const x = m.versoes[0];
      if (x === undefined) return [];
      return [{
        id: m.id,
        categoria: "MAQUINA" as const,
        identificacao: m.codigo,
        descricao: `${x.descricao} · fabricação ${String(x.anoFabricacao)}`,
        tipo: ROTULO_TIPO_DE_FROTA[x.tipoFrota],
        dono: x.tipoFrota === "PROPRIO" ? "A própria unidade gestora" : (nomeDe(x.proprietario) ?? ""),
        locador: nomeDe(x.locador),
        combustivel: ROTULO_COMBUSTIVEL[x.combustivelPrincipal],
        pendencia: null,
        versao: x.versao,
        dados: { anoFabricacao: String(x.anoFabricacao), descricao: x.descricao, tipoFrota: x.tipoFrota, combustivelPrincipal: x.combustivelPrincipal, proprietarioDocumento: x.proprietario?.documento ?? "", locadorDocumento: x.locador?.documento ?? "" },
        ...comuns(m),
      }];
    }),
  ];
  return { bens, ugs: ugs.map((u) => ({ id: u.id, rotulo: `${u.codigoTce} — ${u.nome}` })) };
}

export async function cadastrarVeiculoPelaTela(input: SemAutor<CadastrarVeiculoInput>): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_FROTA", (criadoPor) => cadastrarVeiculo(cliente(), { ...input, criadoPor }));
  return `Veículo ${input.placa.toUpperCase()} cadastrado.`;
}
export async function cadastrarMaquinaPelaTela(input: SemAutor<CadastrarMaquinaInput>): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_FROTA", (criadoPor) => cadastrarMaquina(cliente(), { ...input, criadoPor }));
  return `Máquina ${input.codigo.toUpperCase()} cadastrada.`;
}
export async function publicarVersaoDoVeiculoPelaTela(input: SemAutor<Parameters<typeof publicarVersaoDoVeiculo>[1]>): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_FROTA", (criadoPor) => publicarVersaoDoVeiculo(cliente(), { ...input, criadoPor }));
  return `Versão ${String(r.versao)} do veículo publicada. Ela vai ao Tribunal no arquivo do mês do registro (ou do mês em que começa, se for depois).`;
}
export async function publicarVersaoDaMaquinaPelaTela(input: SemAutor<Parameters<typeof publicarVersaoDaMaquina>[1]>): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_FROTA", (criadoPor) => publicarVersaoDaMaquina(cliente(), { ...input, criadoPor }));
  return `Versão ${String(r.versao)} da máquina publicada. Ela vai ao Tribunal no arquivo do mês do registro (ou do mês em que começa, se for depois).`;
}
export async function registrarSituacaoPelaTela(input: SemAutor<Parameters<typeof registrarSituacaoDaFrota>[1]>): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_FROTA", (criadoPor) => registrarSituacaoDaFrota(cliente(), { ...input, criadoPor }));
  return "Situação registrada.";
}
export async function anularSituacaoPelaTela(input: { readonly id: string; readonly motivo: string }): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_FROTA", (criadoPor) => anularSituacaoDaFrota(cliente(), { ...input, criadoPor }));
  return "Situação anulada. O registro fica na história, fora do arquivo do mês.";
}
export async function registrarAbastecimentoPelaTela(input: SemAutor<Parameters<typeof registrarAbastecimento>[1]>): Promise<string> {
  await comEscritaAutenticada("REGISTRAR_ABASTECIMENTO", (criadoPor) => registrarAbastecimento(cliente(), { ...input, criadoPor }));
  return "Abastecimento registrado.";
}
export async function anularAbastecimentoPelaTela(input: { readonly id: string; readonly motivo: string }): Promise<string> {
  await comEscritaAutenticada("REGISTRAR_ABASTECIMENTO", (criadoPor) => anularAbastecimento(cliente(), { ...input, criadoPor }));
  return "Abastecimento anulado.";
}

// ── Farmácias públicas ────────────────────────────────────────────────────────────────────────────

export interface FarmaciaNaTela {
  readonly id: string;
  readonly codigo: string;
  readonly ug: string;
  readonly descricao: string;
  readonly endereco: string;
  readonly responsavel: string;
  readonly ativa: boolean;
  readonly versao: number;
  readonly dados: Readonly<Record<string, string>>;
  readonly informes: readonly { readonly mes: string; readonly origem: string; readonly itens: number; readonly quando: string; readonly vale: boolean }[];
}

export async function lerFarmacias(): Promise<{ readonly farmacias: readonly FarmaciaNaTela[]; readonly ugs: readonly { readonly id: string; readonly rotulo: string }[] }> {
  await exigirLeituraDoEnte("CONSULTAR_PATRIMONIO");
  const prisma = cliente();
  const [fs, ugs] = await Promise.all([
    prisma.farmaciaPublica.findMany({
      orderBy: { codigo: "asc" },
      select: {
        id: true,
        codigo: true,
        ug: { select: { codigoTce: true, nome: true } },
        versoes: { orderBy: { versao: "desc" }, take: 1, select: { versao: true, descricao: true, endereco: true, nomeResponsavel: true, cpfResponsavel: true, crfResponsavel: true, ativa: true } },
        informes: { orderBy: { criadoEm: "desc" }, take: 24, select: { ano: true, mes: true, origem: true, criadoEm: true, _count: { select: { itens: true } } } },
      },
    }),
    unidadesGestorasOperadas(prisma, new Date()),
  ]);
  return {
    farmacias: fs.flatMap((f) => {
      const v = f.versoes[0];
      if (v === undefined) return [];
      const vistos = new Set<string>();
      return [{
        id: f.id,
        codigo: f.codigo,
        ug: `${f.ug.codigoTce} — ${f.ug.nome}`,
        descricao: v.descricao,
        endereco: v.endereco,
        responsavel: `${v.nomeResponsavel} (CRF ${v.crfResponsavel})`,
        ativa: v.ativa,
        versao: v.versao,
        dados: { descricao: v.descricao, endereco: v.endereco, nomeResponsavel: v.nomeResponsavel, cpfResponsavel: v.cpfResponsavel, crfResponsavel: v.crfResponsavel },
        informes: f.informes.map((i) => {
          const mes = `${String(i.mes).padStart(2, "0")}/${String(i.ano)}`;
          const vale = !vistos.has(mes);
          vistos.add(mes);
          return { mes, origem: i.origem === "ARQUIVO" ? "arquivo" : "digitado", itens: i._count.itens, quando: diaCivilBr(i.criadoEm), vale };
        }),
      }];
    }),
    ugs: ugs.map((u) => ({ id: u.id, rotulo: `${u.codigoTce} — ${u.nome}` })),
  };
}

export async function cadastrarFarmaciaPelaTela(input: SemAutor<CadastrarFarmaciaInput>): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_FARMACIA", (criadoPor) => cadastrarFarmacia(cliente(), { ...input, criadoPor }));
  return `Farmácia ${input.codigo} cadastrada.`;
}
export async function publicarVersaoDaFarmaciaPelaTela(input: SemAutor<Parameters<typeof publicarVersaoDaFarmacia>[1]>): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_FARMACIA", (criadoPor) => publicarVersaoDaFarmacia(cliente(), { ...input, criadoPor }));
  return input.ativa ? `Versão ${String(r.versao)} da farmácia publicada.` : "Farmácia encerrada a partir da data informada.";
}
export async function informarEstoquePelaTela(input: SemAutor<Parameters<typeof informarEstoqueDaFarmacia>[1]>): Promise<string> {
  const r = await comEscritaAutenticada("INFORMAR_ESTOQUE_DA_FARMACIA", (criadoPor) => informarEstoqueDaFarmacia(cliente(), { ...input, criadoPor }));
  return `Estoque de ${String(input.mes).padStart(2, "0")}/${String(input.ano)} informado com ${String(r.itens)} produto(s). Ele substitui, na remessa, o informe anterior do mesmo mês.`;
}
