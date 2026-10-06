import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { importarExtrato } from "./extrato.js";

/**
 * V36 — O EXTRATO DE UMA CONTA NÃO ENTRA EM OUTRA.
 *
 * Os dois arquivos imitam a FORMA de extratos reais medidos em 06/10/2026 (números inventados aqui):
 *  · estilo Itaú: SGML puro (folhas sem fechamento), BANKID com quatro dígitos ("0341"), ACCTID de dez dígitos;
 *  · estilo Sicredi: cada folha fechada (</CODE>, </TRNAMT>...), BANKID "748", ACCTID de dezesseis dígitos.
 * N=2 em contas, em bancos e em arquivos; cada recusa afirma o motivo e que nada foi gravado.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "tesouraria@cg.pb.gov.br";

const CABECALHO = "OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n";

function estiloItau(acctid: string, fitid: string, valor: string): string {
  return `${CABECALHO}<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20261005100000[-03:EST]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0341
<ACCTID>${acctid}
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260101100000[-03:EST]
<DTEND>20260131100000[-03:EST]
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260110100000[-03:EST]
<TRNAMT>${valor}
<FITID>${fitid}
<CHECKNUM>${fitid}
<MEMO>PIX RECEBIDO
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>${valor}
<DTASOF>20260131100000[-03:EST]
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;
}

function estiloSicredi(acctid: string, fitid: string, valor: string): string {
  return `${CABECALHO}<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<DTSERVER>20261005184829[-3:GMT]</DTSERVER>
<LANGUAGE>ENG</LANGUAGE>
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1</TRNUID>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<STMTRS>
<CURDEF>BRL</CURDEF>
<BANKACCTFROM>
<BANKID>748</BANKID>
<ACCTID>${acctid}</ACCTID>
<ACCTTYPE>CHECKING</ACCTTYPE>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260201000000[-3:GMT]</DTSTART>
<DTEND>20260228000000[-3:GMT]</DTEND>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260212000000[-3:GMT]</DTPOSTED>
<TRNAMT>-${valor}</TRNAMT>
<FITID>${fitid}</FITID>
<MEMO>TARIFA</MEMO>
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>0.00</BALAMT>
<DTASOF>20260228000000[-3:GMT]</DTASOF>
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;
}

const ITAU_A = "1111222223";
const ITAU_B = "1111999994";
const SICREDI = "0101990000123456";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb-a", codigo: "CC-ITAU-A", descricao: "Itaú A", fonteId: "fnt-500", banco: "341", agencia: "1111", conta: "22222", digitoConta: "3" },
      { id: "cb-b", codigo: "CC-ITAU-B", descricao: "Itaú B", fonteId: "fnt-500", banco: "341", agencia: "1111", conta: "99999", digitoConta: "4" },
      { id: "cb-s", codigo: "CC-SICREDI", descricao: "Sicredi", fonteId: "fnt-500", banco: "748" },
      // Conta antiga, sem banco no cadastro: o banco não é conferido, a ligação ao ACCTID vale.
      { id: "cb-velha", codigo: "CC-VELHA", descricao: "Sem identificação", fonteId: "fnt-500" },
    ],
  });
}

const importar = (contaBancariaId: string, arquivoOfx: string) => importarExtrato(prisma, { contaBancariaId, arquivoOfx, importadoPor: POR });
async function recusa(contaBancariaId: string, arquivoOfx: string): Promise<string> {
  try {
    await importar(contaBancariaId, arquivoOfx);
    return "importou";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe("M09 V36 — a conta do arquivo é a conta escolhida", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: os dois estilos reais entram, e o extrato guarda o banco (sem zeros à esquerda) e a conta do arquivo", async () => {
    await importar("cb-a", estiloItau(ITAU_A, "I1", "567.09"));
    await importar("cb-s", estiloSicredi(SICREDI, "S1", "12.50"));
    const ex = await prisma.extratoBancario.findMany({ orderBy: { contaBancariaId: "asc" }, select: { contaBancariaId: true, bancoDoArquivo: true, contaDoArquivo: true } });
    expect(ex).toEqual([
      { contaBancariaId: "cb-a", bancoDoArquivo: "341", contaDoArquivo: ITAU_A },
      { contaBancariaId: "cb-s", bancoDoArquivo: "748", contaDoArquivo: SICREDI },
    ]);
    const linhas = await prisma.lancamentoExtrato.findMany({ orderBy: { fitid: "asc" }, select: { fitid: true, natureza: true, valor: true } });
    expect(linhas.map((l) => [l.fitid, l.natureza, l.valor.toFixed(2)])).toEqual([["I1", "CREDITO", "567.09"], ["S1", "DEBITO", "12.50"]]);
  });

  it("t2: arquivo de outro banco na conta é recusado, nomeando os dois bancos", async () => {
    expect(await recusa("cb-a", estiloSicredi(SICREDI, "S1", "12.50"))).toMatch(/arquivo é do banco 748 e a conta CC-ITAU-A está cadastrada no banco 341[\s\S]*Nada foi importado/);
    expect(await prisma.extratoBancario.count()).toBe(0);
    // Banco de dois dígitos aparece com três, como no cadastro.
    await prisma.contaBancaria.update({ where: { id: "cb-velha" }, data: { banco: "001" } });
    expect(await recusa("cb-velha", estiloSicredi(SICREDI, "S1", "12.50"))).toMatch(/banco 748 e a conta CC-VELHA está cadastrada no banco 001/);
  });

  it("t3: a mesma conta do banco não entra em duas contas do sistema", async () => {
    await importar("cb-a", estiloItau(ITAU_A, "I1", "100.00"));
    // Outro arquivo (outro FITID) da MESMA conta do banco, pedido na conta B do mesmo banco.
    expect(await recusa("cb-b", estiloItau(ITAU_A, "I2", "200.00"))).toMatch(/conta final 2223 do banco, que já teve extrato importado na conta CC-ITAU-A[\s\S]*Nada foi importado/);
    expect(await prisma.lancamentoExtrato.count({ where: { contaBancariaId: "cb-b" } })).toBe(0);
  });

  it("t4: a conta ligada a um ACCTID recusa arquivo de outro — também na conta sem banco cadastrado", async () => {
    await importar("cb-a", estiloItau(ITAU_A, "I1", "100.00"));
    expect(await recusa("cb-a", estiloItau(ITAU_B, "I9", "50.00"))).toMatch(/CC-ITAU-A recebe extratos da conta final 2223 do banco, e este arquivo é da final 9994[\s\S]*Nada foi importado/);
    await importar("cb-velha", estiloSicredi(SICREDI, "S1", "12.50"));
    expect(await recusa("cb-velha", estiloItau(ITAU_B, "I9", "50.00"))).toMatch(/CC-VELHA recebe extratos da conta final 3456/);
    // A conta B, sem extrato, aceita o ACCTID dela.
    await importar("cb-b", estiloItau(ITAU_B, "I9", "50.00"));
    expect(await prisma.extratoBancario.count()).toBe(3);
  });

  it("t5: o MESMO arquivo em outra conta é recusado nomeando onde está; na mesma conta continua idempotente", async () => {
    const arq = estiloItau(ITAU_A, "I1", "100.00");
    await importar("cb-a", arq);
    expect((await importar("cb-a", arq)).jaImportado).toBe(true);
    expect(await recusa("cb-velha", arq)).toMatch(/Este arquivo já foi importado na conta CC-ITAU-A, não na CC-VELHA[\s\S]*Nada foi importado/);
  });
});
