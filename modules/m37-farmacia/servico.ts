import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaCivil, diaCivilBr, meioDiaCivil } from "../../packages/datas/index.js";
import { documentoTemDigitoValido } from "../../packages/documento/index.js";
import { travar } from "../../packages/locks/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { ugVigenteNoDia } from "../m01-core-contabil/unidade-gestora.js";
import { lerInformeDeEstoque, motivoDoItemInvalido, type ItemDeEstoque } from "./dominio.js";

/**
 * V27 — M37 FARMÁCIA PÚBLICA: os serviços. Ver `prisma/schema/m37-farmacia.prisma` e `MODULO.md`.
 */

const zDia = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");

const zDadosDaFarmacia = {
  descricao: z.string().trim().min(3, "Informe o nome da farmácia.").max(60, "O nome da farmácia tem até 60 caracteres."),
  endereco: z.string().trim().min(5, "Informe o endereço.").max(120, "O endereço tem até 120 caracteres."),
  nomeResponsavel: z.string().trim().min(3, "Informe o farmacêutico responsável.").max(60, "O nome do responsável tem até 60 caracteres."),
  cpfResponsavel: z.string().trim().transform((s) => s.replace(/\D/g, "")),
  crfResponsavel: z.string().trim().min(1, "Informe o número do registro no Conselho Regional de Farmácia.").max(10, "O CRF tem até 10 caracteres."),
  vigenteDesde: zDia,
  fundamento: z.string().trim().min(5, "Diga de onde vêm os dados (ato de designação do responsável, alvará)."),
  criadoPor: z.string().min(1),
};

function exigirCpf(cpf: string): void {
  if (cpf.length !== 11 || !documentoTemDigitoValido(cpf)) throw new Error(`O CPF do responsável técnico (${cpf}) não é válido. Nada foi gravado.`);
}

export const zCadastrarFarmacia = z.object({
  ugId: z.string().min(1),
  codigo: z.string().trim().regex(/^\d{1,7}$/, "O código da farmácia tem até 7 dígitos."),
  ...zDadosDaFarmacia,
});
export type CadastrarFarmaciaInput = z.input<typeof zCadastrarFarmacia>;

export async function cadastrarFarmacia(prisma: PrismaClient, input: CadastrarFarmaciaInput): Promise<{ readonly id: string }> {
  const d = zCadastrarFarmacia.parse(input);
  exigirCpf(d.cpfResponsavel);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarFarmacia, "ENTE");
    const ug = await tx.unidadeGestora.findUnique({ where: { id: d.ugId }, select: { codigoTce: true, nome: true, entidadeContabilId: true, vigenteDesde: true, encerramento: { select: { vigenteAte: true } } } });
    if (ug === null) throw new Error("Unidade gestora não encontrada. Nada foi gravado.");
    if (ug.entidadeContabilId === null) throw new Error(`A unidade gestora ${ug.codigoTce} (${ug.nome}) não é escriturada neste sistema. Nada foi gravado.`);
    if (!ugVigenteNoDia(ug, meioDiaCivil(d.vigenteDesde))) throw new Error(`A unidade gestora ${ug.codigoTce} não vale em ${d.vigenteDesde.split("-").reverse().join("/")}. Nada foi gravado.`);
    const ja = await tx.farmaciaPublica.findUnique({ where: { ugId_codigo: { ugId: d.ugId, codigo: d.codigo } }, select: { id: true } });
    if (ja !== null) throw new Error(`A unidade gestora ${ug.codigoTce} já tem a farmácia de código ${d.codigo}. Nada foi gravado.`);
    const f = await tx.farmaciaPublica.create({ data: { ugId: d.ugId, codigo: d.codigo, criadoPor: d.criadoPor }, select: { id: true } });
    await tx.versaoDaFarmacia.create({
      data: { farmaciaId: f.id, versao: 1, descricao: d.descricao, endereco: d.endereco, nomeResponsavel: d.nomeResponsavel, cpfResponsavel: d.cpfResponsavel, crfResponsavel: d.crfResponsavel, ativa: true, vigenteDesde: meioDiaCivil(d.vigenteDesde), fundamento: d.fundamento, criadoPor: d.criadoPor },
    });
    return { id: f.id };
  });
}

export const zPublicarVersaoDaFarmacia = z.object({ farmaciaId: z.string().min(1), ativa: z.boolean(), ...zDadosDaFarmacia });

export async function publicarVersaoDaFarmacia(prisma: PrismaClient, input: z.input<typeof zPublicarVersaoDaFarmacia>): Promise<{ readonly versao: number }> {
  const d = zPublicarVersaoDaFarmacia.parse(input);
  exigirCpf(d.cpfResponsavel);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarVersaoDaFarmacia, "ENTE");
    await travar(tx, "FarmaciaPublica", [d.farmaciaId]);
    const ultima = await tx.versaoDaFarmacia.findFirst({ where: { farmaciaId: d.farmaciaId }, orderBy: { versao: "desc" }, select: { versao: true, vigenteDesde: true, ativa: true, farmacia: { select: { codigo: true } } } });
    if (ultima === null) throw new Error("Farmácia não encontrada. Nada foi gravado.");
    if (!ultima.ativa) throw new Error(`A farmácia ${ultima.farmacia.codigo} está encerrada. Nada foi gravado.`);
    if (d.vigenteDesde < diaCivil(ultima.vigenteDesde)) {
      throw new Error(`A versão vigente da farmácia ${ultima.farmacia.codigo} vale desde ${diaCivilBr(ultima.vigenteDesde)}; a nova não pode começar antes. Nada foi gravado.`);
    }
    const versao = ultima.versao + 1;
    await tx.versaoDaFarmacia.create({
      data: { farmaciaId: d.farmaciaId, versao, descricao: d.descricao, endereco: d.endereco, nomeResponsavel: d.nomeResponsavel, cpfResponsavel: d.cpfResponsavel, crfResponsavel: d.crfResponsavel, ativa: d.ativa, vigenteDesde: meioDiaCivil(d.vigenteDesde), fundamento: d.fundamento, criadoPor: d.criadoPor },
    });
    return { versao };
  });
}

export const zInformarEstoqueDaFarmacia = z.object({
  farmaciaId: z.string().min(1),
  ano: z.coerce.number().int().min(2000).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
  /** Digitado: os itens um a um, ou `texto` com um produto por linha (codigoProduto;descricao;unidade;quantidade). */
  itens: z.array(z.object({ codigoProduto: z.string().trim(), descricao: z.string().trim(), unidadeMedida: z.string().trim(), quantidade: z.string().trim() })).optional(),
  texto: z.string().optional(),
  /** Arquivo: o conteúdo do arquivo, lido aqui (com o cabeçalho). */
  arquivo: z.string().optional(),
  fundamento: z.string().trim().min(5, "Diga de onde vem a posição (o inventário, o relatório do sistema da farmácia)."),
  criadoPor: z.string().min(1),
});

/**
 * O estoque do mês. Um informe novo para o mesmo mês substitui o anterior na remessa; o anterior fica guardado.
 * Qualquer linha inválida recusa o informe inteiro, nomeando a linha — nada é gravado pela metade.
 */
export async function informarEstoqueDaFarmacia(prisma: PrismaClient, input: z.input<typeof zInformarEstoqueDaFarmacia>): Promise<{ readonly id: string; readonly itens: number }> {
  const d = zInformarEstoqueDaFarmacia.parse(input);
  let itens: readonly ItemDeEstoque[];
  let arquivoHash: string | null = null;
  if (d.arquivo !== undefined) {
    const l = lerInformeDeEstoque(d.arquivo);
    if (l.erros.length > 0) throw new Error(`O arquivo do estoque tem erro: ${l.erros.slice(0, 10).join(" ")}${l.erros.length > 10 ? ` (e mais ${String(l.erros.length - 10)})` : ""} Nada foi gravado.`);
    itens = l.itens;
    arquivoHash = createHash("sha256").update(d.arquivo).digest("hex");
  } else if (d.texto !== undefined && d.texto.trim() !== "") {
    // O mesmo leitor do arquivo, com o cabeçalho posto aqui: a linha errada é nomeada pelo número dela na caixa.
    const l = lerInformeDeEstoque(`codigoProduto;descricao;unidade;quantidade\n${d.texto}`);
    if (l.erros.length > 0) throw new Error(`A lista de produtos tem erro: ${l.erros.slice(0, 10).map((e) => e.replace(/^Linha (\d+)/, (_m, n: string) => `Linha ${String(Number(n) - 1)}`)).join(" ")} Nada foi gravado.`);
    itens = l.itens;
  } else {
    const digitados = (d.itens ?? []).map((i) => ({ ...i, quantidade: i.quantidade.replace(",", ".") }));
    if (digitados.length === 0) throw new Error("Informe ao menos um produto. Nada foi gravado.");
    const codigos = new Set<string>();
    for (const [k, i] of digitados.entries()) {
      const motivo = motivoDoItemInvalido(i);
      if (motivo !== null) throw new Error(`Produto ${String(k + 1)}: ${motivo}. Nada foi gravado.`);
      if (codigos.has(i.codigoProduto)) throw new Error(`O produto ${i.codigoProduto} aparece duas vezes. Nada foi gravado.`);
      codigos.add(i.codigoProduto);
    }
    itens = digitados;
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.informarEstoqueDaFarmacia, "ENTE");
    await travar(tx, "FarmaciaPublica", [d.farmaciaId]);
    const f = await tx.farmaciaPublica.findUnique({ where: { id: d.farmaciaId }, select: { codigo: true, versoes: { orderBy: { versao: "asc" }, select: { vigenteDesde: true, ativa: true } } } });
    if (f === null) throw new Error("Farmácia não encontrada. Nada foi gravado.");
    const fimDoMes = `${String(d.ano)}-${String(d.mes).padStart(2, "0")}-31`;
    const inicio = f.versoes[0];
    const competencia = `${String(d.mes).padStart(2, "0")}/${String(d.ano)}`;
    if (inicio === undefined || diaCivil(inicio.vigenteDesde) > fimDoMes) throw new Error(`A farmácia ${f.codigo} ainda não existia em ${competencia}. Nada foi gravado.`);
    const vigenteNoFim = f.versoes.filter((v) => diaCivil(v.vigenteDesde) <= fimDoMes).pop();
    if (vigenteNoFim !== undefined && !vigenteNoFim.ativa) throw new Error(`A farmácia ${f.codigo} estava encerrada no fim de ${competencia}. Nada foi gravado.`);
    const c = await tx.informeDeEstoqueDaFarmacia.create({
      data: {
        farmaciaId: d.farmaciaId,
        ano: d.ano,
        mes: d.mes,
        origem: arquivoHash === null ? "DIGITADO" : "ARQUIVO",
        arquivoHash,
        fundamento: d.fundamento,
        criadoPor: d.criadoPor,
        itens: { create: itens.map((i) => ({ codigoProduto: i.codigoProduto, descricao: i.descricao, unidadeMedida: i.unidadeMedida, quantidade: i.quantidade })) },
      },
      select: { id: true },
    });
    return { id: c.id, itens: itens.length };
  });
}
