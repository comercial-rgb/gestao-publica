import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { criarM19Deps } from "../../modules/m19-pessoas/adapter-prisma.js";
import { cadastrarPessoa, moverPapelDePessoa } from "../../modules/m19-pessoas/servico.js";
import {
  cadastrarGrupoDeMaterial,
  cadastrarMaterial,
  cadastrarUnidadeDeMedida,
} from "../../modules/m10-patrimonial/estoque-fisico.js";
import { cadastrarClasseDeMaterial } from "../../modules/m10-patrimonial/almoxarifado.js";
import {
  emitirOrdemDeCompra,
  relacionarElementoAoMaterial,
} from "../../modules/m11-licitacoes/compras.js";
import {
  cadastrarContrato,
  cadastrarProcesso,
  homologarProcesso,
} from "../../modules/m11-licitacoes/contratos.js";
import { criarM05DepsComContratos } from "../../modules/m11-licitacoes/adapter-m05.js";
import { reservarDotacao } from "../../modules/m05-despesa/servico.js";
import {
  calcularDvDoCnpj,
  documentoTemDigitoValido,
} from "../../packages/documento/index.js";
import { toMoney } from "../../packages/contracts/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";

/**
 * DADOS DE DEMONSTRAÇÃO DA EXECUÇÃO DA DESPESA — fornecedores, catálogo mínimo, ordens de
 * compra, um processo homologado com dois contratos e reservas de dotação.
 *
 * Tudo passa pelos SERVIÇOS DE DOMÍNIO (autorização, guards, Zod). Nada de insert cru: se um
 * serviço recusa, a recusa é registrada com o motivo e o script segue com o resto.
 *
 * Idempotente: cada item é procurado pela sua chave natural (documento, código, sigla,
 * número, histórico) antes de ser criado. Rodar duas vezes não duplica nada.
 *
 * Só roda contra o banco `gestao_publica_local`.
 *
 * Uso: npx tsx scripts/demonstracao/semear-execucao-da-despesa.ts
 */

// Só os dois bancos de demonstração: o local (onde a apresentação foi montada) e o da apresentação.
const BANCOS_PERMITIDOS: readonly string[] = ["gestao_publica_local", "gestao_publica_apresentacao"];
const AUTOR = "admin@cg.pb.gov.br";

function exigirBancoPermitido(): string {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL ausente. Nada foi gravado.");
  }
  let nome: string;
  try {
    nome = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("DATABASE_URL ilegível. Nada foi gravado.");
  }
  if (!BANCOS_PERMITIDOS.includes(nome)) {
    throw new Error(
      `Recusado: este script só semeia o banco "${BANCOS_PERMITIDOS.join(" ou ")}", e o DATABASE_URL aponta ` +
        `para "${nome}". Nada foi gravado.`
    );
  }
  return url;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTOS — DV calculado aqui e conferido pelo validador do pacote
// ═══════════════════════════════════════════════════════════════════════════

function cnpjComDv(raiz12: string): string {
  const doc = raiz12 + calcularDvDoCnpj(raiz12);
  if (!documentoTemDigitoValido(doc)) throw new Error(`CNPJ gerado sem DV válido: ${doc}`);
  return doc;
}

/** DV do CPF pela regra oficial (módulo 11), escrito aqui e conferido pelo pacote. */
function cpfComDv(raiz9: string): string {
  const digitos = raiz9.split("").map(Number);
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += (digitos[i] as number) * (tamanho + 1 - i);
    const resto = soma % 11;
    digitos.push(resto < 2 ? 0 : 11 - resto);
  }
  const doc = digitos.join("");
  if (!documentoTemDigitoValido(doc)) throw new Error(`CPF gerado sem DV válido: ${doc}`);
  return doc;
}

interface Fornecedor {
  readonly chave: string;
  readonly documento: string;
  readonly nome: string;
  readonly nomeFantasia?: string;
  readonly logradouro: string;
  readonly numero: string;
  readonly bairro: string;
  readonly municipio: string;
  readonly uf: string;
  readonly cep: string;
  readonly telefone: string;
  readonly email: string;
}

const FORNECEDORES: readonly Fornecedor[] = [
  { chave: "papelaria", documento: cnpjComDv("417283950001"), nome: "Papelaria Central Ltda", nomeFantasia: "Papelaria Central", logradouro: "Rua Maciel Pinheiro", numero: "215", bairro: "Centro", municipio: "Campina Grande", uf: "PB", cep: "58400-100", telefone: "(83) 3321-4410", email: "vendas@papelariacentral.com.br" },
  { chave: "construtora", documento: cnpjComDv("286405170001"), nome: "Construtora Serra Azul Ltda", nomeFantasia: "Serra Azul Engenharia", logradouro: "Avenida Brasília", numero: "1840", bairro: "Catolé", municipio: "Campina Grande", uf: "PB", cep: "58410-455", telefone: "(83) 3337-2090", email: "contato@serraazulengenharia.com.br" },
  { chave: "autopecas", documento: cnpjComDv("359172640001"), nome: "Auto Peças e Serviços Nordeste Ltda", nomeFantasia: "Auto Peças Nordeste", logradouro: "Avenida Floriano Peixoto", numero: "3120", bairro: "Bodocongó", municipio: "Campina Grande", uf: "PB", cep: "58430-012", telefone: "(83) 3333-8712", email: "oficina@autopecasnordeste.com.br" },
  { chave: "alimentos", documento: cnpjComDv("503816290001"), nome: "Distribuidora de Alimentos Boa Mesa Ltda", nomeFantasia: "Boa Mesa", logradouro: "Rua João Suassuna", numero: "88", bairro: "Liberdade", municipio: "Campina Grande", uf: "PB", cep: "58414-350", telefone: "(83) 3341-5566", email: "comercial@boamesadistribuidora.com.br" },
  { chave: "clinica", documento: cnpjComDv("264719830001"), nome: "Clínica Vida Saudável Ltda", nomeFantasia: "Clínica Vida Saudável", logradouro: "Rua Vigário Calixto", numero: "452", bairro: "Catolé", municipio: "Campina Grande", uf: "PB", cep: "58410-340", telefone: "(83) 3322-7070", email: "atendimento@clinicavidasaudavel.com.br" },
  { chave: "posto", documento: cnpjComDv("381590420001"), nome: "Posto Rota 230 Ltda", nomeFantasia: "Posto Rota 230", logradouro: "Rodovia BR-230, km 148", numero: "s/n", bairro: "Distrito Industrial", municipio: "Campina Grande", uf: "PB", cep: "58434-700", telefone: "(83) 3335-2300", email: "financeiro@postorota230.com.br" },
  { chave: "grafica", documento: cnpjComDv("447028160001"), nome: "Gráfica e Copiadora Borborema Ltda", nomeFantasia: "Gráfica Borborema", logradouro: "Rua Venâncio Neiva", numero: "310", bairro: "Centro", municipio: "Campina Grande", uf: "PB", cep: "58400-150", telefone: "(83) 3321-9080", email: "orcamentos@graficaborborema.com.br" },
  { chave: "maria", documento: cpfComDv("284617395"), nome: "Maria das Graças Lima", logradouro: "Rua Rodrigues Alves", numero: "57", bairro: "Prata", municipio: "Campina Grande", uf: "PB", cep: "58400-550", telefone: "(83) 98812-3344", email: "mariadasgracas.lima@exemplo.com.br" },
  { chave: "jose", documento: cpfComDv("517382946"), nome: "José Carlos Ferreira de Souza", logradouro: "Rua Tavares Cavalcanti", numero: "140", bairro: "Alto Branco", municipio: "Campina Grande", uf: "PB", cep: "58401-270", telefone: "(83) 98745-6021", email: "josecarlos.souza@exemplo.com.br" },
];

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRO DO QUE ACONTECEU
// ═══════════════════════════════════════════════════════════════════════════

const criados: string[] = [];
const existentes: string[] = [];
const recusados: string[] = [];

async function passo(rotulo: string, fn: () => Promise<"criado" | "existente" | string>): Promise<void> {
  try {
    const r = await fn();
    if (r === "criado") criados.push(rotulo);
    else if (r === "existente") existentes.push(rotulo);
    else recusados.push(`${rotulo}: ${r}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    recusados.push(`${rotulo}: ${msg.split("\n")[0]}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const url = exigirBancoPermitido();
  const prisma = criarPrismaClient(url);
  const m19 = criarM19Deps(prisma);
  const m05 = criarM05DepsComContratos(prisma);

  try {
    // ── 0. Credores dos empenhos já existentes: o DV confere? ─────────────────
    const credoresDosEmpenhos = await prisma.empenho.findMany({
      distinct: ["credorCpfCnpj"],
      select: { credorCpfCnpj: true },
    });
    for (const c of credoresDosEmpenhos) {
      const doc = c.credorCpfCnpj;
      const valido = documentoTemDigitoValido(doc);
      const cadastrado = (await prisma.pessoa.findUnique({ where: { documento: doc }, select: { id: true } })) !== null;
      console.log(
        `[empenho existente] credor ${doc}: DV ${valido ? "válido" : "INVÁLIDO"}; ` +
          `${cadastrado ? "já cadastrado" : "não cadastrado"}` +
          (valido ? "" : " — não será cadastrado (um documento com DV errado não é de ninguém).")
      );
    }

    // ── 1. Fornecedores/credores (M19) ────────────────────────────────────────
    const pessoaId = new Map<string, string>();
    for (const f of FORNECEDORES) {
      await passo(`Pessoa ${f.documento} ${f.nome}`, async () => {
        const existente = await m19.pessoas.buscarPorDocumento(f.documento);
        if (existente !== null) {
          pessoaId.set(f.chave, existente.id);
          return "existente";
        }
        const { pessoaId: id } = await cadastrarPessoa(
          {
            documento: f.documento,
            nome: f.nome,
            ...(f.nomeFantasia !== undefined ? { nomeFantasia: f.nomeFantasia } : {}),
            email: f.email,
            telefone: f.telefone,
            logradouro: f.logradouro,
            numero: f.numero,
            bairro: f.bairro,
            municipio: f.municipio,
            uf: f.uf,
            cep: f.cep,
            criadoPor: AUTOR,
          },
          m19
        );
        pessoaId.set(f.chave, id);
        return "criado";
      });
      const id = pessoaId.get(f.chave);
      if (id === undefined) continue;
      await passo(`Papel CREDOR de ${f.nome}`, async () => {
        const p = await m19.pessoas.buscarPorId(id);
        if (p !== null && p.papeis.includes("CREDOR")) return "existente";
        await moverPapelDePessoa(
          {
            pessoaId: id,
            papel: "CREDOR",
            movimento: "CONCEDIDO",
            data: meioDiaCivil("2026-09-01"),
            motivo: "Fornecedor habilitado para contratar com o município.",
            criadoPor: AUTOR,
          },
          m19
        );
        return "criado";
      });
    }

    // ── 2. Catálogo mínimo de materiais e serviços (M10/M11) ──────────────────
    // As contas de estoque vêm do PCASP JÁ CARREGADO no banco; nada é inventado.
    const conta = async (codigo: string): Promise<string> => {
      const c = await prisma.contaPcasp.findUnique({ where: { codigo }, select: { id: true, analitica: true } });
      if (c === null || !c.analitica) throw new Error(`Conta ${codigo} ausente ou não analítica no PCASP carregado.`);
      return c.id;
    };
    const natureza = async (codigoCompleto: string): Promise<string> => {
      const n = await prisma.naturezaDespesa.findFirst({ where: { codigoCompleto }, select: { id: true } });
      if (n === null) throw new Error(`Natureza de despesa ${codigoCompleto} não existe no banco.`);
      return n.id;
    };

    const unidadeId = new Map<string, string>();
    for (const u of [
      { sigla: "UN", descricao: "Unidade" },
      { sigla: "RSM", descricao: "Resma" },
      { sigla: "SC", descricao: "Saco" },
      { sigla: "L", descricao: "Litro" },
      { sigla: "SV", descricao: "Serviço" },
    ]) {
      await passo(`Unidade de medida ${u.sigla}`, async () => {
        const e = await prisma.unidadeDeMedida.findUnique({ where: { sigla: u.sigla }, select: { id: true } });
        if (e !== null) { unidadeId.set(u.sigla, e.id); return "existente"; }
        const r = await cadastrarUnidadeDeMedida(prisma, { ...u, criadoPor: AUTOR });
        unidadeId.set(u.sigla, r.unidadeDeMedidaId);
        return "criado";
      });
    }

    const grupoId = new Map<string, string>();
    for (const g of [
      { codigo: "01", descricao: "Material de expediente" },
      { codigo: "02", descricao: "Materiais de construção" },
      { codigo: "03", descricao: "Combustíveis e lubrificantes" },
      { codigo: "09", descricao: "Serviços de terceiros" },
    ]) {
      await passo(`Grupo de material ${g.codigo} ${g.descricao}`, async () => {
        const e = await prisma.grupoDeMaterial.findUnique({ where: { codigo: g.codigo }, select: { id: true } });
        if (e !== null) { grupoId.set(g.codigo, e.id); return "existente"; }
        const r = await cadastrarGrupoDeMaterial(prisma, { ...g, criadoPor: AUTOR });
        grupoId.set(g.codigo, r.grupoId);
        return "criado";
      });
    }

    const classeId = new Map<string, string>();
    for (const c of [
      { codigo: "EXP", descricao: "Material de expediente", conta: "1.1.5.6.1.07.00" },
      { codigo: "CONST", descricao: "Materiais de construção", conta: "1.1.5.6.1.03.00" },
      { codigo: "CONS", descricao: "Material de consumo em geral", conta: "1.1.5.6.1.01.00" },
      // Serviço não entra em estoque (a entrada de almoxarifado só aceita o elemento 30),
      // mas o cadastro de material exige classe: a conta fica inerte para estes itens.
      { codigo: "OUTROS", descricao: "Outros itens do catálogo (serviços)", conta: "1.1.5.6.1.99.00" },
    ]) {
      await passo(`Classe de material ${c.codigo}`, async () => {
        const e = await prisma.classeDeMaterial.findUnique({ where: { codigo: c.codigo }, select: { id: true } });
        if (e !== null) { classeId.set(c.codigo, e.id); return "existente"; }
        const r = await cadastrarClasseDeMaterial(prisma, {
          codigo: c.codigo, descricao: c.descricao, contaContabilId: await conta(c.conta), criadoPor: AUTOR,
        });
        classeId.set(c.codigo, r.classeDeMaterialId);
        return "criado";
      });
    }

    interface ItemDoCatalogo {
      readonly codigo: string;
      readonly sucinta: string;
      readonly detalhada: string;
      readonly grupo: string;
      readonly classe: string;
      readonly classificacao: "CONSUMO" | "SERVICO";
      readonly categoria: "NAO_PERECIVEL" | "ESTOCAVEL" | "COMBUSTIVEL";
      readonly unidade: string;
      readonly elemento: string;
    }
    const CATALOGO: readonly ItemDoCatalogo[] = [
      { codigo: "MC-0001", sucinta: "Papel A4 75 g/m², resma com 500 folhas", detalhada: "Papel sulfite branco, formato A4 (210 x 297 mm), gramatura 75 g/m², resma com 500 folhas.", grupo: "01", classe: "EXP", classificacao: "CONSUMO", categoria: "ESTOCAVEL", unidade: "RSM", elemento: "339030" },
      { codigo: "MC-0002", sucinta: "Toner para impressora laser monocromática", detalhada: "Cartucho de toner preto para impressora laser monocromática, rendimento mínimo de 3.000 páginas.", grupo: "01", classe: "EXP", classificacao: "CONSUMO", categoria: "ESTOCAVEL", unidade: "UN", elemento: "339030" },
      { codigo: "MC-0003", sucinta: "Cimento Portland CP II, saco de 50 kg", detalhada: "Cimento Portland composto CP II-E-32, saco de 50 kg.", grupo: "02", classe: "CONST", classificacao: "CONSUMO", categoria: "NAO_PERECIVEL", unidade: "SC", elemento: "339030" },
      { codigo: "MC-0004", sucinta: "Óleo diesel S10", detalhada: "Óleo diesel S10 para abastecimento da frota municipal, fornecido por litro.", grupo: "03", classe: "CONS", classificacao: "CONSUMO", categoria: "COMBUSTIVEL", unidade: "L", elemento: "339030" },
      { codigo: "SV-0001", sucinta: "Cópia reprográfica A4 preto e branco", detalhada: "Serviço de cópia reprográfica em papel A4, preto e branco, por página.", grupo: "09", classe: "OUTROS", classificacao: "SERVICO", categoria: "NAO_PERECIVEL", unidade: "SV", elemento: "339039" },
      { codigo: "SV-0002", sucinta: "Encadernação em espiral até 200 folhas", detalhada: "Serviço de encadernação com espiral plástico e capa transparente, até 200 folhas.", grupo: "09", classe: "OUTROS", classificacao: "SERVICO", categoria: "NAO_PERECIVEL", unidade: "SV", elemento: "339039" },
      { codigo: "SV-0003", sucinta: "Manutenção corretiva de veículo leve", detalhada: "Serviço de manutenção corretiva de veículo leve da frota, com diagnóstico e mão de obra.", grupo: "09", classe: "OUTROS", classificacao: "SERVICO", categoria: "NAO_PERECIVEL", unidade: "SV", elemento: "339039" },
      { codigo: "SV-0004", sucinta: "Exame médico ocupacional", detalhada: "Exame médico ocupacional (admissional ou periódico), com emissão de atestado de saúde ocupacional.", grupo: "09", classe: "OUTROS", classificacao: "SERVICO", categoria: "NAO_PERECIVEL", unidade: "SV", elemento: "339039" },
      { codigo: "SV-0005", sucinta: "Pequenos reparos prediais", detalhada: "Serviço de pequenos reparos prediais (alvenaria, pintura e hidráulica) em prédio público.", grupo: "09", classe: "OUTROS", classificacao: "SERVICO", categoria: "NAO_PERECIVEL", unidade: "SV", elemento: "339039" },
      { codigo: "SV-0006", sucinta: "Coffee break para evento, por pessoa", detalhada: "Serviço de coffee break para eventos institucionais, por participante.", grupo: "09", classe: "OUTROS", classificacao: "SERVICO", categoria: "NAO_PERECIVEL", unidade: "SV", elemento: "339039" },
    ];

    const materialId = new Map<string, string>();
    for (const m of CATALOGO) {
      await passo(`Material ${m.codigo} ${m.sucinta}`, async () => {
        const e = await prisma.material.findUnique({ where: { codigo: m.codigo }, select: { id: true } });
        if (e !== null) { materialId.set(m.codigo, e.id); return "existente"; }
        const g = grupoId.get(m.grupo); const c = classeId.get(m.classe); const u = unidadeId.get(m.unidade);
        if (g === undefined || c === undefined || u === undefined) return "grupo, classe ou unidade não disponível";
        const r = await cadastrarMaterial(prisma, {
          codigo: m.codigo, descricaoSucinta: m.sucinta, descricaoDetalhada: m.detalhada,
          grupoId: g, classificacao: m.classificacao, categoria: m.categoria, classeDeMaterialId: c,
          unidades: [{ unidadeDeMedidaId: u, fatorParaEstoque: "1", ehDeEstoque: true }],
          criadoPor: AUTOR,
        });
        materialId.set(m.codigo, r.materialId);
        return "criado";
      });
      const id = materialId.get(m.codigo);
      if (id === undefined) continue;
      await passo(`Elemento ${m.elemento} do material ${m.codigo}`, async () => {
        const natId = await natureza(m.elemento);
        const e = await prisma.materialElementoDespesa.findUnique({
          where: { materialId_naturezaDespesaId: { materialId: id, naturezaDespesaId: natId } },
          select: { id: true },
        });
        if (e !== null) return "existente";
        await relacionarElementoAoMaterial(prisma, { materialId: id, naturezaDespesaId: natId, criadoPor: AUTOR });
        return "criado";
      });
    }

    // ── 3. Processo licitatório homologado ────────────────────────────────────
    const NUMERO_PROCESSO = "PE 004/2026";
    let processoId: string | undefined;
    await passo(`Processo ${NUMERO_PROCESSO}`, async () => {
      const e = await prisma.processoLicitatorio.findUnique({ where: { numeroProcesso: NUMERO_PROCESSO }, select: { id: true } });
      if (e !== null) { processoId = e.id; return "existente"; }
      const r = await cadastrarProcesso(prisma, {
        numeroProcesso: NUMERO_PROCESSO,
        modalidade: "PREGAO_ELETRONICO",
        objeto: "Contratação de empresas para manutenção preventiva e corretiva da frota municipal e para serviços de reprografia e encadernação.",
        valorLicitado: "180000.00",
        criadoPor: AUTOR,
      });
      processoId = r.processoId;
      return "criado";
    });
    if (processoId !== undefined) {
      const pid = processoId;
      await passo(`Homologação do ${NUMERO_PROCESSO} em 15/08/2026`, async () => {
        const e = await prisma.homologacaoProcesso.findUnique({ where: { processoId: pid }, select: { id: true } });
        if (e !== null) return "existente";
        await homologarProcesso(prisma, { processoId: pid, data: meioDiaCivil("2026-08-15"), criadoPor: AUTOR });
        return "criado";
      });
    }

    // ── 4. Contratos vigentes ─────────────────────────────────────────────────
    const CONTRATOS = [
      { numero: "CT 012/2026", fornecedor: "autopecas", valor: "96000.00", categoria: "PRESTACAO_SERVICOS" as const },
      { numero: "CT 013/2026", fornecedor: "grafica", valor: "42000.00", categoria: "PRESTACAO_SERVICOS" as const },
    ];
    for (const c of CONTRATOS) {
      const f = FORNECEDORES.find((x) => x.chave === c.fornecedor)!;
      await passo(`Contrato ${c.numero} com ${f.nome} (R$ ${c.valor})`, async () => {
        const e = await prisma.contrato.findUnique({ where: { numeroContrato: c.numero }, select: { id: true } });
        if (e !== null) return "existente";
        if (processoId === undefined) return "processo licitatório indisponível";
        await cadastrarContrato(prisma, {
          numeroContrato: c.numero,
          processoId,
          contratadoDocumento: f.documento,
          contratadoNome: f.nome,
          valorInicial: c.valor,
          vigenciaInicio: meioDiaCivil("2026-09-01"),
          vigenciaFimInicial: meioDiaCivil("2027-08-31"),
          categoriaOrdemCronologica: c.categoria,
          criadoPor: AUTOR,
        });
        return "criado";
      });
    }

    // ── 5. Ordens de compra (todas as fichas existentes são do elemento 339039) ──
    const fichas = await prisma.fichaOrcamentaria.findMany({
      select: { id: true, numero: true, saldoDisponivel: true, naturezaDespesa: { select: { codigoCompleto: true } } },
    });
    for (const f of fichas) {
      console.log(`[ficha] ${f.id} (nº ${f.numero}) elemento ${f.naturezaDespesa.codigoCompleto}, saldo disponível ${f.saldoDisponivel.toFixed(2)}`);
    }
    const ORDENS = [
      { numero: "OC 001/2026", ficha: "ficha-poc", fornecedor: "grafica", processo: true, data: "2026-09-08",
        finalidade: "Reprodução e encadernação de material das audiências públicas do orçamento.",
        itens: [{ material: "SV-0001", quantidade: "2000", unitario: "0.25" }, { material: "SV-0002", quantidade: "40", unitario: "6.50" }] },
      { numero: "OC 002/2026", ficha: "ficha-poc", fornecedor: "autopecas", processo: true, data: "2026-09-10",
        finalidade: "Manutenção corretiva do veículo da Secretaria de Administração.",
        itens: [{ material: "SV-0003", quantidade: "1", unitario: "1850.00" }] },
      { numero: "OC 003/2026", ficha: "ac-ficha-reexec", fornecedor: "clinica", processo: false, data: "2026-09-15",
        finalidade: "Exames médicos admissionais dos servidores nomeados em setembro.",
        itens: [{ material: "SV-0004", quantidade: "12", unitario: "95.00" }] },
      { numero: "OC 004/2026", ficha: "ac-ficha-reexec", fornecedor: "construtora", processo: false, data: "2026-09-18",
        finalidade: "Pequenos reparos no prédio da Secretaria de Educação.",
        itens: [{ material: "SV-0005", quantidade: "1", unitario: "2400.00" }] },
      { numero: "OC 005/2026", ficha: "ac-ficha", fornecedor: "alimentos", processo: false, data: "2026-09-22",
        finalidade: "Coffee break da capacitação de servidores em gestão orçamentária.",
        itens: [{ material: "SV-0006", quantidade: "60", unitario: "17.50" }] },
      // V22 — mais ordens para a apresentação: sobrar ordem com saldo depois de empenhar, e duas
      // GLOBAIS, que admitem mais de um empenho até o total (o seletor oferece o residual).
      { numero: "OC 006/2026", ficha: "ficha-poc", fornecedor: "grafica", processo: true, data: "2026-09-23",
        finalidade: "Impressão de cartilhas do orçamento participativo.",
        itens: [{ material: "SV-0001", quantidade: "3000", unitario: "0.30" }] },
      { numero: "OC 007/2026", ficha: "ficha-poc", fornecedor: "autopecas", processo: true, data: "2026-09-24", tipo: "GLOBAL" as const,
        finalidade: "Manutenção preventiva da frota administrativa no último trimestre.",
        itens: [{ material: "SV-0003", quantidade: "4", unitario: "1250.00" }] },
      { numero: "OC 008/2026", ficha: "ac-ficha-reexec", fornecedor: "clinica", processo: false, data: "2026-09-24",
        finalidade: "Exames periódicos dos servidores da Secretaria de Saúde.",
        itens: [{ material: "SV-0004", quantidade: "20", unitario: "95.00" }] },
      { numero: "OC 009/2026", ficha: "ac-ficha-reexec", fornecedor: "construtora", processo: false, data: "2026-09-25", tipo: "GLOBAL" as const,
        finalidade: "Reparos na cobertura de escolas municipais.",
        itens: [{ material: "SV-0005", quantidade: "2", unitario: "1800.00" }] },
      { numero: "OC 010/2026", ficha: "ac-ficha", fornecedor: "alimentos", processo: false, data: "2026-09-26",
        finalidade: "Lanche do seminário de controle interno.",
        itens: [{ material: "SV-0006", quantidade: "40", unitario: "17.50" }] },
    ];
    for (const o of ORDENS) {
      const total = o.itens.reduce((s, i) => s.plus(toMoney(i.quantidade).times(toMoney(i.unitario))), toMoney("0"));
      await passo(`Ordem de compra ${o.numero} (ficha ${o.ficha}, R$ ${total.toFixed(2)})`, async () => {
        const e = await prisma.ordemDeCompra.findUnique({ where: { numero: o.numero }, select: { id: true } });
        if (e !== null) return "existente";
        const ficha = fichas.find((f) => f.id === o.ficha);
        if (ficha === undefined) return `ficha ${o.ficha} não existe neste banco`;
        if (toMoney(ficha.saldoDisponivel.toFixed(2)).lessThan(total)) {
          return `saldo disponível da ficha (${ficha.saldoDisponivel.toFixed(2)}) menor que a ordem`;
        }
        const fornecedorId = pessoaId.get(o.fornecedor);
        if (fornecedorId === undefined) return "fornecedor não cadastrado";
        const itens = o.itens.map((i) => {
          const mid = materialId.get(i.material);
          if (mid === undefined) throw new Error(`material ${i.material} não cadastrado`);
          return { materialId: mid, quantidade: i.quantidade, valorUnitario: i.unitario };
        });
        await emitirOrdemDeCompra(prisma, {
          numero: o.numero,
          tipo: "tipo" in o ? o.tipo : "ORDINARIA",
          ...(o.processo && processoId !== undefined ? { processoId } : {}),
          fornecedorId,
          dataEmissao: meioDiaCivil(o.data),
          finalidade: o.finalidade,
          fichaId: o.ficha,
          itens,
          criadoPor: AUTOR,
        });
        return "criado";
      });
    }

    // ── 6. Reservas de dotação (M05) ──────────────────────────────────────────
    const RESERVAS = [
      { ficha: "ac-ficha-reexec", valor: "45000.00", processo: true,
        historico: "Reserva para o pregão eletrônico 004/2026 - manutenção da frota municipal" },
      { ficha: "ficha-poc", valor: "3000.00", processo: false,
        historico: "Reserva para serviços gráficos do último trimestre de 2026" },
      { ficha: "ac-ficha", valor: "1500.00", processo: false,
        historico: "Reserva para eventos de capacitação de servidores - 2026" },
    ];
    for (const r of RESERVAS) {
      await passo(`Reserva de R$ ${r.valor} na ficha ${r.ficha}${r.processo ? " (vinculada ao PE 004/2026)" : ""}`, async () => {
        const e = await prisma.reservaDotacao.findFirst({
          where: { fichaId: r.ficha, historico: r.historico, estornoDeId: null },
          select: { id: true },
        });
        if (e !== null) return "existente";
        if (r.processo && processoId === undefined) return "processo licitatório indisponível";
        await reservarDotacao(
          {
            fichaId: r.ficha,
            valor: r.valor,
            historico: r.historico,
            ...(r.processo && processoId !== undefined ? { processoId } : {}),
            criadoPor: AUTOR,
          },
          m05
        );
        return "criado";
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\nCriados (${criados.length}):`);
  for (const c of criados) console.log(`  + ${c}`);
  console.log(`Já existentes (${existentes.length}):`);
  for (const c of existentes) console.log(`  = ${c}`);
  console.log(`Recusados (${recusados.length}):`);
  for (const c of recusados) console.log(`  ! ${c}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
