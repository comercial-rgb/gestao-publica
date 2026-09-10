import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  baixarTaxaDoProcesso,
  criarAssunto,
  criarSetor,
  lotarUsuarioNoSetor,
  registrarTaxaDoProcesso,
} from "./cadastros.js";
import { abrirProcesso, tramitar } from "./servico.js";

/**
 * M21 — OS CADASTROS. Sem eles o módulo não é configurável pela entidade, e um sistema
 * que só o fornecedor parametriza é o oposto do que "altamente configurável" significa.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const ADMIN = "protocolo@cg.pb.gov.br";
let requerenteId = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "cd-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "cd-uo", codigo: "01001", descricao: "Administração", orgaoId: "cd-org" },
  });
  await prisma.exercicio.create({ data: { id: "cd-ex", ano: 2026, criadoPor: "SEED" } });
  requerenteId = (
    await prisma.pessoa.create({
      data: {
        documento: "11144477735", tipo: "FISICA", criadoPor: "SEED",
        versoes: { create: { nome: "Maria", ativa: true, criadoPor: "SEED" } },
      },
      select: { id: true },
    })
  ).id;
}

beforeEach(semear);

describe("M21 — setor e lotação", () => {
  it("t1: cria o setor e recusa o código repetido, nomeando quem já o tem", async () => {
    const s = await criarSetor(prisma, {
      codigo: "PROT", nome: "Protocolo Geral", unidadeOrcId: "cd-uo", criadoPor: ADMIN,
    });
    expect(s.setorId).toBeTruthy();

    await expect(
      criarSetor(prisma, {
        codigo: "PROT", nome: "Outro protocolo", unidadeOrcId: "cd-uo", criadoPor: ADMIN,
      })
    ).rejects.toThrow(/Já existe o setor "PROT" \(Protocolo Geral\)[\s\S]*histórico de dois setores/);
  });

  it("t2: o setor exige unidade gestora existente — é ela que amarra a permissão", async () => {
    await expect(
      criarSetor(prisma, {
        codigo: "X", nome: "Setor fantasma", unidadeOrcId: "nao-existe", criadoPor: ADMIN,
      })
    ).rejects.toThrow(/Unidade gestora .* não existe/);
  });

  it("t3: lotar exige usuário CADASTRADO e ATIVO", async () => {
    const s = await criarSetor(prisma, {
      codigo: "PROT", nome: "Protocolo", unidadeOrcId: "cd-uo", criadoPor: ADMIN,
    });

    await expect(
      lotarUsuarioNoSetor(prisma, {
        usuarioIdent: "fantasma@cg.pb.gov.br", setorId: s.setorId, criadoPor: ADMIN,
      })
    ).rejects.toThrow(/USUÁRIO NÃO CADASTRADO[\s\S]*nunca dá acesso a ninguém/);

    // ⚠️ E O REVOGADO TAMBÉM É RECUSADO: lotá-lo seria devolver alcance a quem o perdeu.
    const revogado = await prisma.usuario.create({
      data: {
        identificador: "revogado@cg.pb.gov.br", nome: "Revogado", ativo: false, criadoPor: "SEED",
      },
      select: { id: true },
    });
    void revogado;
    await expect(
      lotarUsuarioNoSetor(prisma, {
        usuarioIdent: "revogado@cg.pb.gov.br", setorId: s.setorId, criadoPor: ADMIN,
      })
    ).rejects.toThrow(/USUÁRIO INATIVO[\s\S]*devolver alcance a quem o perdeu/);

    // O caminho feliz, e ele é IDEMPOTENTE: lotar duas vezes não duplica.
    const a = await lotarUsuarioNoSetor(prisma, {
      usuarioIdent: ADMIN, setorId: s.setorId, criadoPor: ADMIN,
    });
    const b = await lotarUsuarioNoSetor(prisma, {
      usuarioIdent: ADMIN, setorId: s.setorId, criadoPor: ADMIN,
    });
    expect(a.lotacaoId).toBe(b.lotacaoId);
  });
});

describe("M21 — assunto e roteiro", () => {
  it("t4: o assunto nasce com subassuntos e roteiro, numa transação", async () => {
    const s1 = await criarSetor(prisma, {
      codigo: "PROT", nome: "Protocolo", unidadeOrcId: "cd-uo", criadoPor: ADMIN,
    });
    const s2 = await criarSetor(prisma, {
      codigo: "JUR", nome: "Procuradoria", unidadeOrcId: "cd-uo", criadoPor: ADMIN,
    });

    const a = await criarAssunto(prisma, {
      codigo: "REQ",
      nome: "Requerimento geral",
      unidadeOrcId: "cd-uo",
      subassuntos: [{ codigo: "CERT", nome: "Certidão" }],
      roteiro: [
        { ordem: 1, setorId: s1.setorId, prazoDias: 3, descricao: "Triagem" },
        { ordem: 2, setorId: s2.setorId, prazoDias: 10, descricao: "Análise jurídica" },
      ],
      criadoPor: ADMIN,
    });

    const salvo = await prisma.assunto.findUniqueOrThrow({
      where: { id: a.assuntoId },
      select: {
        subassuntos: { select: { codigo: true } },
        roteiro: { select: { ordem: true, prazoDias: true }, orderBy: { ordem: "asc" } },
      },
    });
    expect(salvo.subassuntos.map((s) => s.codigo)).toEqual(["CERT"]);
    expect(salvo.roteiro).toEqual([
      { ordem: 1, prazoDias: 3 },
      { ordem: 2, prazoDias: 10 },
    ]);
  });

  it("t5: recusa ordem repetida e setor inexistente no roteiro", async () => {
    const s = await criarSetor(prisma, {
      codigo: "PROT", nome: "Protocolo", unidadeOrcId: "cd-uo", criadoPor: ADMIN,
    });

    await expect(
      criarAssunto(prisma, {
        codigo: "A", nome: "Assunto", unidadeOrcId: "cd-uo", criadoPor: ADMIN,
        roteiro: [
          { ordem: 1, setorId: s.setorId, prazoDias: 3, descricao: "Uma" },
          { ordem: 1, setorId: s.setorId, prazoDias: 5, descricao: "Outra" },
        ],
      })
    ).rejects.toThrow(/mesma ordem[\s\S]*não dizem qual vem antes/);

    await expect(
      criarAssunto(prisma, {
        codigo: "B", nome: "Assunto", unidadeOrcId: "cd-uo", criadoPor: ADMIN,
        roteiro: [{ ordem: 1, setorId: "nao-existe", prazoDias: 3, descricao: "Etapa" }],
      })
    ).rejects.toThrow(/setor inexistente ou desativado/);

    // ⚠️ E NADA FOI GRAVADO nos dois casos — o roteiro nasce com o assunto, na mesma
    // transação, justamente para não existir assunto sem o roteiro que ele prometeu.
    expect(await prisma.assunto.count()).toBe(0);
  });
});

describe("M21 — taxas do processo", () => {
  it("t6: registrar e baixar; e a taxa em aberto bloqueia a tramitação do assunto que exige", async () => {
    const s1 = await criarSetor(prisma, {
      codigo: "PROT", nome: "Protocolo", unidadeOrcId: "cd-uo", criadoPor: ADMIN,
    });
    const s2 = await criarSetor(prisma, {
      codigo: "JUR", nome: "Procuradoria", unidadeOrcId: "cd-uo", criadoPor: ADMIN,
    });
    await lotarUsuarioNoSetor(prisma, { usuarioIdent: ADMIN, setorId: s1.setorId, criadoPor: ADMIN });

    const assunto = await criarAssunto(prisma, {
      codigo: "ALV", nome: "Alvará", unidadeOrcId: "cd-uo",
      bloqueiaTramiteComTaxaAberta: true, criadoPor: ADMIN,
    });

    const p = await abrirProcesso(prisma, {
      exercicio: 2026, assuntoId: assunto.assuntoId, requerenteId,
      finalidade: "ATENDIMENTO_AO_PUBLICO",
      textoAbertura: "Solicito alvará de funcionamento.",
      setorAberturaId: s1.setorId, criadoPor: ADMIN,
    });

    const taxa = await registrarTaxaDoProcesso(prisma, {
      processoId: p.processoId, descricao: "Taxa de expediente", valor: "45.00",
      vencimento: new Date("2026-04-01T00:00:00Z"), criadoPor: ADMIN,
    });

    await expect(
      tramitar(prisma, {
        processoId: p.processoId, setorDestinoId: s2.setorId, texto: "Ao jurídico.",
        criadoPor: ADMIN,
      })
    ).rejects.toThrow(/TAXA EM ABERTO[\s\S]*Taxa de expediente — R\$ 45\.00/);

    await baixarTaxaDoProcesso(prisma, {
      taxaId: taxa.taxaId, tipo: "PAGAMENTO", criadoPor: ADMIN,
    });

    const ok = await tramitar(prisma, {
      processoId: p.processoId, setorDestinoId: s2.setorId, texto: "Ao jurídico.",
      criadoPor: ADMIN,
    });
    expect(ok.alvos).toBe(1);

    // ⚠️ BAIXAR DUAS VEZES É RECUSADO: seria um segundo fato sobre o mesmo pagamento.
    await expect(
      baixarTaxaDoProcesso(prisma, {
        taxaId: taxa.taxaId, tipo: "PAGAMENTO", criadoPor: ADMIN,
      })
    ).rejects.toThrow(/já foi baixada/);
  });

  it("t7: cancelar taxa exige motivo — é ato que o controle interno vai querer explicado", async () => {
    const s = await criarSetor(prisma, {
      codigo: "PROT", nome: "Protocolo", unidadeOrcId: "cd-uo", criadoPor: ADMIN,
    });
    await lotarUsuarioNoSetor(prisma, { usuarioIdent: ADMIN, setorId: s.setorId, criadoPor: ADMIN });
    const assunto = await criarAssunto(prisma, {
      codigo: "REQ", nome: "Requerimento", unidadeOrcId: "cd-uo", criadoPor: ADMIN,
    });
    const p = await abrirProcesso(prisma, {
      exercicio: 2026, assuntoId: assunto.assuntoId, requerenteId,
      finalidade: "INTERNO", textoAbertura: "Processo para a taxa.",
      setorAberturaId: s.setorId, criadoPor: ADMIN,
    });
    const taxa = await registrarTaxaDoProcesso(prisma, {
      processoId: p.processoId, descricao: "Taxa", valor: "10.00",
      vencimento: new Date("2026-04-01T00:00:00Z"), criadoPor: ADMIN,
    });

    await expect(
      baixarTaxaDoProcesso(prisma, {
        taxaId: taxa.taxaId, tipo: "CANCELAMENTO", motivo: "erro", criadoPor: ADMIN,
      })
    ).rejects.toThrow(/exige motivo/);

    await baixarTaxaDoProcesso(prisma, {
      taxaId: taxa.taxaId, tipo: "CANCELAMENTO",
      motivo: "Lançada em duplicidade pelo atendimento.", criadoPor: ADMIN,
    });
    const m = await prisma.movimentoDaTaxa.findFirstOrThrow({
      where: { taxaId: taxa.taxaId },
      select: { tipo: true, motivo: true },
    });
    expect(m.tipo).toBe("CANCELAMENTO");
    expect(m.motivo).toMatch(/duplicidade/);
  });
});
