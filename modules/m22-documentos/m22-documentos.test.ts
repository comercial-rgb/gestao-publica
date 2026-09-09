import "dotenv/config";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { RAIZES_DE_ESCRITA, raizesExistentes } from "../../test/raizes-dominio.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { abrirProcesso, tramitar } from "../m21-protocolo/servico.js";
import { anexarArquivo, baixarAnexo } from "./anexos.js";
import {
  assinarDocumento,
  assinarNaFila,
  criarFilaDeAssinatura,
  estadoDaAssinaturaQualificada,
  hashDoTexto,
} from "./assinatura.js";
import { caminhoDoAnexo, sha256 } from "./armazenamento.js";

/**
 * M22 — ANEXOS E ASSINATURA, contra banco e disco de verdade.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA ═══
 * Os testes do lote que recaem sobre documentos: anexo de processo não é acessível a
 * quem não tem permissão NO REGISTRO (4); anexo permanece acessível ao setor de origem
 * depois da tramitação (5); documento assinado mantém o original recuperável e a
 * assinatura verificável em separado (14); o segundo signatário recebe notificação real
 * e a fila só conclui com todas as assinaturas (15); o modo indisponível devolve motivo
 * explícito e NÃO produz assinatura simulada (16).
 *
 * ⚠️ O ARMAZENAMENTO VAI PARA UM DIRETÓRIO TEMPORÁRIO. Escrever na pasta do repositório
 * durante a suíte deixaria lixo versionável e faria um teste ver o arquivo do outro.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const RAIZ_TEMPORARIA = mkdtempSync(join(tmpdir(), "anexos-teste-"));
beforeAll(() => {
  process.env["ANEXOS_DIR"] = RAIZ_TEMPORARIA;
});

const PROTOCOLO = "protocolo@cg.pb.gov.br";
const JURIDICO = "juridico@cg.pb.gov.br";
const PDF = new TextEncoder().encode("%PDF-1.7\nconteudo do requerimento\n");

let assuntoId = "";
let assuntoSigiloso = "";
let requerenteId = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.orgao.create({ data: { id: "d-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "d-uo", codigo: "01001", descricao: "Administração", orgaoId: "d-org" },
  });
  await prisma.exercicio.create({ data: { id: "d-ex", ano: 2026, criadoPor: "SEED" } });
  await prisma.setor.createMany({
    data: [
      { id: "d-s1", codigo: "PROT", nome: "Protocolo Geral", unidadeOrcId: "d-uo", criadoPor: "SEED" },
      { id: "d-s2", codigo: "JUR", nome: "Procuradoria", unidadeOrcId: "d-uo", criadoPor: "SEED" },
    ],
  });
  await prisma.usuarioDoSetor.createMany({
    data: [
      { usuarioIdent: PROTOCOLO, setorId: "d-s1", criadoPor: "SEED" },
      { usuarioIdent: JURIDICO, setorId: "d-s2", criadoPor: "SEED" },
    ],
  });
  assuntoId = (
    await prisma.assunto.create({
      data: { codigo: "REQ", nome: "Requerimento geral", criadoPor: "SEED" },
      select: { id: true },
    })
  ).id;
  assuntoSigiloso = (
    await prisma.assunto.create({
      data: { codigo: "SIG", nome: "Denúncia", sigiloPadrao: true, criadoPor: "SEED" },
      select: { id: true },
    })
  ).id;
  requerenteId = (
    await prisma.pessoa.create({
      data: {
        documento: "11144477735",
        tipo: "FISICA",
        criadoPor: "SEED",
        versoes: { create: { nome: "Maria Requerente", ativa: true, criadoPor: "SEED" } },
      },
      select: { id: true },
    })
  ).id;
}

const ABERTURA = {
  exercicio: 2026,
  finalidade: "ATENDIMENTO_AO_PUBLICO" as const,
  textoAbertura: "Solicito a análise do pedido anexo.",
  setorAberturaId: "d-s1",
  criadoPor: PROTOCOLO,
};

beforeEach(semear);

describe("M22 — o anexo entra validado pelo SERVIDOR", () => {
  it("t1: anexa, calcula o hash e grava fora de qualquer pasta pública", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const a = await anexarArquivo(prisma, {
      nomeOriginal: "requerimento.pdf",
      mimeType: "application/pdf",
      conteudo: PDF,
      processoId: p.processoId,
      criadoPor: PROTOCOLO,
    });

    expect(a.sha256).toBe(sha256(PDF));
    // O nome no disco é o ID, e o caminho está sob a raiz temporária — nunca em public/.
    const caminho = caminhoDoAnexo(a.anexoId);
    expect(caminho.startsWith(RAIZ_TEMPORARIA)).toBe(true);
    expect(caminho).not.toContain("public");
    expect(caminho).toContain(a.anexoId);
  });

  it("t2: formato fora do rol é recusado — e a mensagem diz quais valem", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    await expect(
      anexarArquivo(prisma, {
        nomeOriginal: "script.sh",
        mimeType: "application/x-sh",
        conteudo: PDF,
        processoId: p.processoId,
        criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/Formato não aceito[\s\S]*PDF, DOC, DOCX/);
  });

  it("t3: arquivo vazio e arquivo acima do limite são recusados", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    await expect(
      anexarArquivo(prisma, {
        nomeOriginal: "vazio.pdf", mimeType: "application/pdf",
        conteudo: new Uint8Array(0), processoId: p.processoId, criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/Arquivo vazio/);

    await expect(
      anexarArquivo(prisma, {
        nomeOriginal: "grande.pdf", mimeType: "application/pdf",
        conteudo: new Uint8Array(26 * 1024 * 1024), processoId: p.processoId,
        criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/excede o limite de 25 MB/);
  });

  it("t4: EXATAMENTE UM dono — nem zero, nem dois", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const base = {
      nomeOriginal: "x.pdf", mimeType: "application/pdf",
      conteudo: PDF, criadoPor: PROTOCOLO,
    };
    await expect(anexarArquivo(prisma, base)).rejects.toThrow(/EXATAMENTE UM registro/);
    await expect(
      anexarArquivo(prisma, { ...base, processoId: p.processoId, pessoaId: requerenteId })
    ).rejects.toThrow(/EXATAMENTE UM registro/);
  });

  it("t5: o caminho no disco NÃO aceita travessia — o id vira nome, não caminho", () => {
    expect(() => caminhoDoAnexo("../../etc/passwd")).toThrow(/Identificador de anexo inválido/);
    expect(() => caminhoDoAnexo("a/b")).toThrow(/Identificador de anexo inválido/);
  });
});

describe("M22 — a autorização do anexo é a do REGISTRO DONO", () => {
  it("t6: anexo de processo SIGILOSO não é baixável por quem não é envolvido", async () => {
    const p = await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId: assuntoSigiloso, requerenteId,
    });
    const a = await anexarArquivo(prisma, {
      nomeOriginal: "denuncia.pdf", mimeType: "application/pdf",
      conteudo: PDF, processoId: p.processoId, criadoPor: PROTOCOLO,
    });

    // ⚠️ O JURÍDICO É DA MESMA UNIDADE GESTORA e ainda assim não baixa: o processo é
    // sigiloso e ele não está envolvido. É exatamente a diferença que o sigilo faz.
    const intruso = await prisma.usuario.create({
      data: { identificador: "curioso@cg.pb.gov.br", nome: "Curioso", criadoPor: "SEED" },
      select: { id: true },
    });
    const perfil = await prisma.perfil.create({
      data: {
        nome: "SO_LEITURA_UO", descricao: "Escopado na UG.", criadoPor: "SEED",
        permissoes: { create: [{ acao: "ANEXAR_ARQUIVO", unidadeOrcId: "d-uo", criadoPor: "SEED" }] },
      },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: intruso.id, perfilId: perfil.id, criadoPor: "SEED" },
    });
    await prisma.usuarioDoSetor.create({
      data: { usuarioIdent: "curioso@cg.pb.gov.br", setorId: "d-s2", criadoPor: "SEED" },
    });

    expect(await baixarAnexo(prisma, a.anexoId, "curioso@cg.pb.gov.br")).toBeNull();
    // E quem abriu continua baixando.
    const meu = await baixarAnexo(prisma, a.anexoId, PROTOCOLO);
    expect(meu?.sha256).toBe(sha256(PDF));
  });

  it("t7: o anexo permanece acessível ao setor de ORIGEM depois da tramitação", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const a = await anexarArquivo(prisma, {
      nomeOriginal: "instrucao.pdf", mimeType: "application/pdf",
      conteudo: PDF, processoId: p.processoId, criadoPor: PROTOCOLO,
    });

    await tramitar(prisma, {
      processoId: p.processoId, setorDestinoId: "d-s2", texto: "Ao jurídico.",
      criadoPor: PROTOCOLO,
    });

    // ⚠️ QUEM INSTRUIU O PROCESSO TEM DE PODER CONSULTAR O QUE INSTRUIU. Uma regra
    // baseada só no setor ATUAL cegaria justamente quem fez o trabalho.
    const daOrigem = await baixarAnexo(prisma, a.anexoId, PROTOCOLO);
    expect(daOrigem?.nomeOriginal).toBe("instrucao.pdf");
    // E o destino, que agora está com ele, também lê.
    const doDestino = await baixarAnexo(prisma, a.anexoId, JURIDICO);
    expect(doDestino?.nomeOriginal).toBe("instrucao.pdf");
  });

  it("t8: a integridade é conferida na ENTREGA — arquivo trocado no disco não sai", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const a = await anexarArquivo(prisma, {
      nomeOriginal: "original.pdf", mimeType: "application/pdf",
      conteudo: PDF, processoId: p.processoId, criadoPor: PROTOCOLO,
    });

    // Alguém troca o arquivo por fora. Sem a conferência, ele sairia como original.
    writeFileSync(caminhoDoAnexo(a.anexoId), "%PDF-1.7\nCONTEUDO TROCADO\n");

    await expect(baixarAnexo(prisma, a.anexoId, PROTOCOLO)).rejects.toThrow(
      /INTEGRIDADE: o anexo .* não confere com o hash registrado/
    );
  });
});

describe("M22 — assinatura: os modos NÃO são intercambiáveis", () => {
  it("t9: o modo QUALIFICADO devolve motivo explícito e NÃO produz assinatura", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const a = await anexarArquivo(prisma, {
      nomeOriginal: "termo.pdf", mimeType: "application/pdf",
      conteudo: PDF, processoId: p.processoId, criadoPor: PROTOCOLO,
    });

    await expect(
      assinarDocumento(prisma, { modo: "QUALIFICADA", anexoId: a.anexoId, criadoPor: PROTOCOLO })
    ).rejects.toThrow(/Assinatura qualificada \(ICP-Brasil\) indisponível/);

    // ⚠️ E NADA FOI GRAVADO. Uma assinatura fabricada aparece na tela exatamente como a
    // verdadeira — é por isso que a recusa tem de ser do caso de uso, não da tela.
    expect(await prisma.assinaturaDeDocumento.count()).toBe(0);

    const estado = estadoDaAssinaturaQualificada();
    expect(estado.disponivel).toBe(false);
    expect(estado.detalhe).toMatch(/ASSINATURA-ICP-HSM/);
  });

  it("t10: assina o movimento pelo HASH DO CONTEÚDO; a segunda assinatura é recusada", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const t = await tramitar(prisma, {
      processoId: p.processoId, setorDestinoId: "d-s2", texto: "Ao jurídico, com urgência.",
      criadoPor: PROTOCOLO,
    });

    const ass = await assinarDocumento(prisma, {
      modo: "AVANCADA", movimentoProcessoId: t.movimentoId, criadoPor: PROTOCOLO,
    });
    // Assinar "o movimento 42" não provaria nada; o hash prova QUAL texto foi assinado.
    expect(ass.hashConteudo).toBe(hashDoTexto("TRAMITE\nAo jurídico, com urgência."));

    await expect(
      assinarDocumento(prisma, {
        modo: "AVANCADA", movimentoProcessoId: t.movimentoId, criadoPor: JURIDICO,
      })
    ).rejects.toThrow(/já está assinado[\s\S]*FILA DE ASSINATURA/);
  });

  it("t11: documento assinado mantém o ORIGINAL recuperável e a assinatura verificável", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const a = await anexarArquivo(prisma, {
      nomeOriginal: "contrato.pdf", mimeType: "application/pdf",
      conteudo: PDF, processoId: p.processoId, criadoPor: PROTOCOLO,
    });
    const ass = await assinarDocumento(prisma, {
      modo: "AVANCADA", anexoId: a.anexoId, criadoPor: PROTOCOLO,
    });

    // O original sai igual ao que entrou — assinar não o altera.
    const baixado = await baixarAnexo(prisma, a.anexoId, PROTOCOLO);
    expect(baixado?.conteudo).toEqual(PDF);

    // E a assinatura é verificável EM SEPARADO: o hash dela bate com o do conteúdo.
    const registro = await prisma.assinaturaDeDocumento.findUniqueOrThrow({
      where: { id: ass.assinaturaId },
      select: { modo: true, assinadoPor: true, hashConteudo: true },
    });
    expect(registro.hashConteudo).toBe(sha256(PDF));
    expect(registro.assinadoPor).toBe(PROTOCOLO);
    // O MODO fica visível — avançada e qualificada não se confundem na tela.
    expect(registro.modo).toBe("AVANCADA");
  });
});

describe("M22 — a fila de assinaturas", () => {
  it("t12: notifica o próximo, recusa quem fura a fila e só conclui com todas", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const a = await anexarArquivo(prisma, {
      nomeOriginal: "portaria.pdf", mimeType: "application/pdf",
      conteudo: PDF, processoId: p.processoId, criadoPor: PROTOCOLO,
    });

    const fila = await criarFilaDeAssinatura(prisma, {
      descricao: "Portaria de designação",
      modo: "AVANCADA",
      anexoId: a.anexoId,
      signatarios: [PROTOCOLO, JURIDICO],
      criadoPor: PROTOCOLO,
    });
    expect(fila.proximo).toBe(PROTOCOLO);

    // ⚠️ SÓ O PRIMEIRO É AVISADO. Avisar todos faria dois abrirem o documento e um
    // descobrir que não é a vez dele — e da terceira vez ninguém abre.
    const avisos = await prisma.notificacao.findMany({
      where: { evento: "DOCUMENTO_AGUARDANDO_ASSINATURA" },
      select: { destinatario: true },
    });
    expect(avisos.map((n) => n.destinatario)).toEqual([PROTOCOLO]);

    await expect(
      assinarNaFila(prisma, { filaId: fila.filaId, criadoPor: JURIDICO })
    ).rejects.toThrow(/Ainda não é a sua vez: falta "protocolo@cg.pb.gov.br"/);

    const primeira = await assinarNaFila(prisma, {
      filaId: fila.filaId, criadoPor: PROTOCOLO,
    });
    expect(primeira.concluida).toBe(false);
    expect(primeira.proximo).toBe(JURIDICO);

    // O SEGUNDO SIGNATÁRIO RECEBE NOTIFICAÇÃO REAL — não uma promessa.
    const avisos2 = await prisma.notificacao.findMany({
      where: { evento: "DOCUMENTO_AGUARDANDO_ASSINATURA", destinatario: JURIDICO },
      select: { entregueEm: true, rota: true },
    });
    expect(avisos2).toHaveLength(1);
    expect(avisos2[0]?.entregueEm).not.toBeNull();

    const segunda = await assinarNaFila(prisma, { filaId: fila.filaId, criadoPor: JURIDICO });
    expect(segunda.concluida).toBe(true);
    expect(segunda.proximo).toBeNull();

    await expect(
      assinarNaFila(prisma, { filaId: fila.filaId, criadoPor: PROTOCOLO })
    ).rejects.toThrow(/já está completa/);
  });

  it("t13: signatário repetido é recusado — a fila travaria esperando a segunda vez", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const a = await anexarArquivo(prisma, {
      nomeOriginal: "x.pdf", mimeType: "application/pdf",
      conteudo: PDF, processoId: p.processoId, criadoPor: PROTOCOLO,
    });
    await expect(
      criarFilaDeAssinatura(prisma, {
        descricao: "Fila com repetido", modo: "SIMPLES", anexoId: a.anexoId,
        signatarios: [PROTOCOLO, PROTOCOLO], criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/Signatário repetido/);
  });

  it("t14: fila em modo QUALIFICADO também é recusada, com o mesmo motivo", async () => {
    const p = await abrirProcesso(prisma, { ...ABERTURA, assuntoId, requerenteId });
    const a = await anexarArquivo(prisma, {
      nomeOriginal: "y.pdf", mimeType: "application/pdf",
      conteudo: PDF, processoId: p.processoId, criadoPor: PROTOCOLO,
    });
    await expect(
      criarFilaDeAssinatura(prisma, {
        descricao: "Fila qualificada", modo: "QUALIFICADA", anexoId: a.anexoId,
        signatarios: [PROTOCOLO], criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/indisponível/);
    expect(await prisma.filaDeAssinatura.count()).toBe(0);
  });
});

describe("M22 — o invariante que o Prisma não expressa", () => {
  /**
   * ⚠️ "EXATAMENTE UM DONO" NÃO É EXPRESSÁVEL NO SCHEMA. Quatro FKs anuláveis com a
   * regra "uma e só uma" precisaria de um CHECK, e o Prisma não o gera.
   *
   * O `t4` cobra isso no CASO DE USO. Mas o caso de uso só protege quem passa por ele —
   * é a mesma lição do funil do razão (M01) e do papel de runtime (ENT00): um
   * `prisma.anexo.create()` escrito num seed, num script ou noutro módulo furaria a
   * regra sem que nada acusasse.
   *
   * Este grep é a rede que pega ISSO. Ele varre o repositório e falha se alguém criar
   * anexo fora do módulo que valida tipo, tamanho, hash e dono.
   */
  it("t15: ninguém cria Anexo fora de `anexarArquivo` — o grep pega o que o schema não pode", () => {
    const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
    const PERMITIDOS = new Set([
      "modules/m22-documentos/anexos.ts",
      // ⚠️ ESTE PRÓPRIO ARQUIVO. Ele CONTÉM o padrão — na expressão e na mensagem de
      // erro — e um grep que se acusa não é um grep, é um teste que nunca passa. Mesma
      // anatomia do grep do censo (M16), que também se exclui.
      "modules/m22-documentos/m22-documentos.test.ts",
    ]);

    const achados: string[] = [];
    const varrer = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (["node_modules", "generated", ".git", ".next", "var"].includes(e.name)) continue;
          varrer(p);
          continue;
        }
        if (!e.name.endsWith(".ts") && !e.name.endsWith(".tsx")) continue;
        const rel = p.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
        if (PERMITIDOS.has(rel)) continue;
        readFileSync(p, "utf8")
          .split("\n")
          .forEach((linha, i) => {
            if (/\banexo\.create(Many)?\s*\(/.test(linha)) {
              achados.push(`${rel}:${i + 1}`);
            }
          });
      }
    };
    // ⚠️ AS RAÍZES VÊM DA LISTA CANÔNICA, nunca escritas aqui. Foi exatamente assim que
    // dois grep-testes deste repositório pararam de guardar quando módulos se mudaram —
    // e `raizes-dominio.test.ts` existe para impedir que se repita. Ele pegou a primeira
    // versão deste arquivo, que enumerava as raízes à mão.
    for (const abs of raizesExistentes(RAIZ, [...RAIZES_DE_ESCRITA])) varrer(abs);

    expect(
      achados,
      "\n\n⚠️ ANEXO CRIADO FORA DO MÓDULO QUE O VALIDA.\n\n" +
        "`anexarArquivo` é quem confere tipo, tamanho, hash e o invariante de dono único — " +
        "e é quem autoriza. Um `prisma.anexo.create()` avulso grava uma linha sem nada " +
        "disso, e o arquivo correspondente pode nem existir no disco.\n\n" +
        "Se o caso novo é legítimo, faça-o passar por `anexarArquivo` (ou acrescente o " +
        "arquivo a PERMITIDOS, aqui, com o motivo).\n\nFora do módulo:\n"
    ).toEqual([]);
  });
});
