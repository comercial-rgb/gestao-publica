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
import { adotarModoDoInforme, calcularInformeDaFarmacia, declararCodigoDoMaterialNoInforme, modoDoInformeNoMes, origensDoModo } from "../../modules/m37-farmacia/informe-calculado.js";
import { acoesPermitidas } from "./molde";
import { diaCivil, diaCivilBr, meioDiaCivil } from "../../packages/datas/index.js";
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
/** V39-R2 (R2-026/027) — a ordem chega pelo NÚMERO (o que está no papel) e vira o id aqui; a leitura é opcional. */
export async function registrarAbastecimentoPelaTela(input: SemAutor<Omit<Parameters<typeof registrarAbastecimento>[1], "ordemId" | "leitura">> & { readonly ordemNumero?: string; readonly leitura?: string }): Promise<string> {
  const { ordemNumero, leitura, ...resto } = input;
  const comOrdem = ordemNumero !== undefined && ordemNumero.trim() !== "";
  // A busca da ordem pelo número fica DENTRO do envelope autenticado: sem sessão, nada se lê (nem se a ordem existe).
  await comEscritaAutenticada("REGISTRAR_ABASTECIMENTO", async (criadoPor) => {
    let ordemId: string | undefined;
    if (comOrdem) {
      const n = Number(ordemNumero.trim());
      const o = Number.isInteger(n) ? await cliente().ordemDeAbastecimento.findUnique({ where: { numero: n }, select: { id: true } }) : null;
      if (o === null) throw new Error(`A ordem de abastecimento nº ${ordemNumero.trim()} não existe. Nada foi gravado.`);
      ordemId = o.id;
    }
    return registrarAbastecimento(cliente(), { ...resto, ...(ordemId !== undefined ? { ordemId } : {}), ...(leitura !== undefined && leitura.trim() !== "" ? { leitura: leitura.trim() } : {}), criadoPor });
  });
  return comOrdem ? "Abastecimento registrado pela ordem, conferido com o autorizado." : "Abastecimento registrado.";
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
  /** V39-R3 (R3-022) — de onde vem a posição deste mês, e os medicamentos do depósito com o código no informe. */
  readonly modoAtual: string;
  readonly totalDeMedicamentos: number;
  readonly medicamentos: readonly { readonly materialId: string; readonly codigo: string; readonly nome: string; readonly codigoNoInforme: string | null; readonly descricaoNoInforme: string | null }[];
}

const ROTULO_DA_ORIGEM: Readonly<Record<string, string>> = { ARQUIVO: "importado de arquivo", DIGITADO: "digitado", CALCULADO: "calculado dos movimentos" };

export async function lerFarmacias(): Promise<{ readonly farmacias: readonly FarmaciaNaTela[]; readonly ugs: readonly { readonly id: string; readonly rotulo: string }[]; readonly podeInformar: boolean }> {
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
        informes: { orderBy: [{ criadoEm: "desc" }, { id: "desc" }], take: 24, select: { ano: true, mes: true, origem: true, criadoEm: true, _count: { select: { itens: true } } } },
      },
    }),
    unidadesGestorasOperadas(prisma, new Date()),
  ]);
  // V39-R3 (R3-022) — o informe que VALE em cada mês é o mais recente da fonte do modo daquele mês (o mesmo critério
  // da remessa); o da outra fonte fica guardado e não vale.
  const hoje = diaCivil(new Date());
  const [anoHoje, mesHoje] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))];
  const extras = new Map<string, { modoAtual: string; modoDoMes: Map<string, "IMPORTADO" | "CALCULADO">; totalDeMedicamentos: number; medicamentos: FarmaciaNaTela["medicamentos"] }>();
  for (const f of fs) {
    const modoDoMes = new Map<string, "IMPORTADO" | "CALCULADO">();
    for (const i of f.informes) {
      const k = `${String(i.ano)}-${String(i.mes)}`;
      if (!modoDoMes.has(k)) modoDoMes.set(k, (await modoDoInformeNoMes(prisma, f.id, i.ano, i.mes)).modo);
    }
    const atual = await modoDoInformeNoMes(prisma, f.id, anoHoje, mesHoje);
    // Os medicamentos de TODOS os depósitos que a farmácia já teve (o cálculo de um mês passado usa o depósito daquele
    // mês, não o de hoje): o que o cálculo pode cobrar tem formulário aqui.
    const [vinculo, trocas] = await Promise.all([
      prisma.depositoDaFarmacia.findUnique({ where: { farmaciaId: f.id }, select: { depositoId: true } }),
      prisma.trocaDoDepositoDaFarmacia.findMany({ where: { farmaciaId: f.id }, select: { depositoNovoId: true } }),
    ]);
    const depositos = [...new Set([...(vinculo === null ? [] : [vinculo.depositoId]), ...trocas.map((t) => t.depositoNovoId)])];
    const filtro = { movimentos: { some: { depositoId: { in: depositos } } } };
    const totalDeMateriais = depositos.length === 0 ? 0 : await prisma.material.count({ where: filtro });
    const materiais = depositos.length === 0 ? [] : await prisma.material.findMany({
      where: filtro,
      orderBy: { codigo: "asc" },
      take: 300,
      select: { id: true, codigo: true, descricaoSucinta: true, codigosNoInforme: { orderBy: [{ criadoEm: "desc" }, { id: "desc" }], take: 1, select: { codigoProduto: true, descricao: true } } },
    });
    extras.set(f.id, {
      modoAtual: atual.modo === "CALCULADO" ? `calculada dos movimentos do depósito desde ${atual.desde ?? ""}` : atual.desde === null ? "digitada ou importada de arquivo" : `digitada ou importada de arquivo desde ${atual.desde}`,
      modoDoMes,
      totalDeMedicamentos: totalDeMateriais,
      medicamentos: materiais.map((m) => ({ materialId: m.id, codigo: m.codigo, nome: m.descricaoSucinta, codigoNoInforme: m.codigosNoInforme[0]?.codigoProduto ?? null, descricaoNoInforme: m.codigosNoInforme[0]?.descricao ?? null })),
    });
  }
  const permitidas = await acoesPermitidas(["INFORMAR_ESTOQUE_DA_FARMACIA"]);
  return {
    podeInformar: permitidas.has("INFORMAR_ESTOQUE_DA_FARMACIA"),
    farmacias: fs.flatMap((f) => {
      const v = f.versoes[0];
      if (v === undefined) return [];
      const x = extras.get(f.id)!;
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
        modoAtual: x.modoAtual,
        medicamentos: x.medicamentos,
        totalDeMedicamentos: x.totalDeMedicamentos,
        informes: f.informes.map((i) => {
          const mes = `${String(i.mes).padStart(2, "0")}/${String(i.ano)}`;
          const daFonte = origensDoModo(x.modoDoMes.get(`${String(i.ano)}-${String(i.mes)}`) ?? "IMPORTADO").includes(i.origem);
          const vale = daFonte && !vistos.has(mes);
          if (vale) vistos.add(mes);
          return { mes, origem: ROTULO_DA_ORIGEM[i.origem] ?? i.origem, itens: i._count.itens, quando: diaCivilBr(i.criadoEm), vale };
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

/** V39-R3 (R3-022) — adotar o modo da posição do mês, declarar o código do medicamento no informe, calcular a posição. */
export async function adotarModoDoInformePelaTela(input: { readonly farmaciaId: string; readonly modo: "IMPORTADO" | "CALCULADO"; readonly desdeAno: number; readonly desdeMes: number; readonly fundamento: string }): Promise<string> {
  await comEscritaAutenticada("INFORMAR_ESTOQUE_DA_FARMACIA", (criadoPor) => adotarModoDoInforme(cliente(), { ...input, criadoPor }));
  const mes = `${String(input.desdeMes).padStart(2, "0")}/${String(input.desdeAno)}`;
  return input.modo === "CALCULADO" ? `A partir de ${mes}, a posição do mês vem dos movimentos do depósito. Os informes anteriores continuam valendo nos meses deles.` : `A partir de ${mes}, a posição do mês volta a ser digitada ou importada.`;
}
export async function declararCodigoNoInformePelaTela(input: { readonly materialId: string; readonly codigoProduto: string; readonly descricao: string; readonly fundamento: string }): Promise<string> {
  await comEscritaAutenticada("INFORMAR_ESTOQUE_DA_FARMACIA", (criadoPor) => declararCodigoDoMaterialNoInforme(cliente(), { ...input, criadoPor }));
  return `Código ${input.codigoProduto} declarado para o informe.`;
}
export async function calcularPosicaoPelaTela(input: { readonly farmaciaId: string; readonly ano: number; readonly mes: number }): Promise<string> {
  const r = await comEscritaAutenticada("INFORMAR_ESTOQUE_DA_FARMACIA", (criadoPor) => calcularInformeDaFarmacia(cliente(), { ...input, criadoPor }));
  const mes = `${String(input.mes).padStart(2, "0")}/${String(input.ano)}`;
  return r.novo
    ? `Posição de ${mes} calculada dos movimentos: ${String(r.itens.length)} produto(s) em ${diaCivilBr(meioDiaCivil(r.dia))}.`
    : `A posição de ${mes} já estava calculada com o mesmo resultado (${String(r.itens.length)} produto(s)). Nada foi gravado de novo.`;
}

/** V39-R3 (R3-018) — os tanques próprios, para o abastecimento interno escolher de onde saiu o combustível. */
export async function lerTanquesParaAbastecimento(): Promise<Readonly<Record<string, string>>> {
  const ts = await cliente().tanqueDeCombustivel.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true, combustivel: true } });
  return Object.fromEntries(ts.map((t) => [t.id, `Tanque ${t.codigo} — ${t.descricao} (${ROTULO_COMBUSTIVEL[t.combustivel].toLowerCase()})`]));
}
