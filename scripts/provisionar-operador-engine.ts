import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { definirSenha } from "../modules/m16-travamento/autenticacao.js";
import { COMPRIMENTO_MINIMO_DA_SENHA } from "../modules/m16-travamento/credenciais.js";
import { ACOES_DO_FORNECEDOR } from "../modules/m16-travamento/acoes.js";

/**
 * PROVISIONAR O OPERADOR DO FORNECEDOR (V10 T1 · N6.1).
 *
 * ═══ ⚠️ POR QUE ISTO É UM SCRIPT, E NÃO UMA TELA ═══
 * As ações de `ACOES_DO_FORNECEDOR` são RESERVADAS: `concederAcaoAoPerfil` — a tela de
 * permissões do ente — as recusa. Se houvesse uma tela dentro do sistema que as concedesse,
 * ela estaria atrás de alguma permissão municipal, e o administrador do município acabaria
 * concedendo a si próprio a habilitação comercial. O contrato viraria enfeite.
 *
 * Então a capacidade é PROVISIONADA EXPLICITAMENTE, por quem opera a instalação, com autor
 * registrado — não atribuída por e-mail, por papel municipal "admin" nem por nome de perfil.
 *
 * ═══ ⚠️ O QUE ISTO **NÃO** PROMETE ═══
 * Quem tem o shell do servidor e o banco provisiona o que quiser, aqui ou fora daqui. A
 * fronteira que este desenho estabelece é a da APLICAÇÃO: nenhuma tela, rota ou ação do
 * sistema concede estas seis. Dizer mais seria mentir sobre o que software consegue impedir.
 *
 * Uso:
 *   npm run engine:operador                              mostra a situação (nada grava)
 *   npm run engine:operador -- --aplicar                 cria/completa o operador
 *
 * Variáveis: ENGINE_OPERADOR (identificador), ENGINE_OPERADOR_SENHA, ENGINE_OPERADOR_NOME.
 */

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") throw new Error("DATABASE_URL não configurada.");

const NOME_PERFIL = "OPERADOR ENGINE";
const aplicar = process.argv.slice(2).includes("--aplicar");

const prisma = criarPrismaClient(url);
try {
  const jaTem = await prisma.permissaoDePerfil.findMany({
    // ⚠️ SEM `as string[]` (V11 V5.2). O cast transformava o filtro em `string[]`, que o cliente
    // gerado não aceita — e o erro de tipo do `where` fazia o `select` inteiro deixar de estreitar,
    // produzindo mais dois erros em `p.perfil` que pareciam outro defeito. Eram o mesmo, em cascata.
    where: { acao: { in: [...ACOES_DO_FORNECEDOR] } },
    select: { acao: true, perfil: { select: { nome: true } } },
  });
  console.log(`Ações reservadas ao fornecedor: ${ACOES_DO_FORNECEDOR.length}`);
  if (jaTem.length === 0) {
    console.log("Nenhum perfil desta instalação tem qualquer uma delas.");
  } else {
    const porPerfil = new Map<string, number>();
    for (const p of jaTem) porPerfil.set(p.perfil.nome, (porPerfil.get(p.perfil.nome) ?? 0) + 1);
    for (const [nome, n] of porPerfil) console.log(`  perfil "${nome}": ${n} de ${ACOES_DO_FORNECEDOR.length}`);
  }

  if (!aplicar) {
    console.log("\nPré-visualização: NADA foi gravado. Rode de novo com --aplicar para provisionar.");
    process.exit(0);
  }

  const identificador = (process.env["ENGINE_OPERADOR"] ?? "").trim();
  const senha = process.env["ENGINE_OPERADOR_SENHA"] ?? "";
  const nome = (process.env["ENGINE_OPERADOR_NOME"] ?? "Operador Engine").trim();
  if (identificador === "") {
    throw new Error("ENGINE_OPERADOR não definida — o identificador do operador. Nada foi gravado.");
  }
  if (senha.length < COMPRIMENTO_MINIMO_DA_SENHA) {
    throw new Error(
      `ENGINE_OPERADOR_SENHA ausente ou curta demais (mínimo ${COMPRIMENTO_MINIMO_DA_SENHA}). ` +
        `Não existe senha padrão neste código de propósito: uma senha default nasceria igual em ` +
        `toda instalação e ficaria versionada, pública, para sempre. Nada foi gravado.`
    );
  }

  const perfil =
    (await prisma.perfil.findFirst({ where: { nome: NOME_PERFIL }, select: { id: true } })) ??
    (await prisma.perfil.create({
      data: {
        nome: NOME_PERFIL,
        descricao:
          "Operador do fornecedor — o contrato comercial desta implantação e os módulos habilitados. " +
          "NÃO administra usuários, perfis nem dados do município.",
        criadoPor: identificador,
      },
      select: { id: true },
    }));

  // ⚠️ SÓ AS RESERVADAS. Este perfil NÃO recebe ação municipal nenhuma: o operador do
  // fornecedor não empenha, não paga, não lê folha e não administra usuários do ente. Dar-lhe
  // "tudo" seria criar um superusuário externo dentro do banco do município.
  let concedidas = 0;
  for (const acao of ACOES_DO_FORNECEDOR) {
    const ja = await prisma.permissaoDePerfil.findFirst({
      where: { perfilId: perfil.id, acao, unidadeOrcId: null },
      select: { id: true },
    });
    if (ja !== null) continue;
    await prisma.permissaoDePerfil.create({
      data: { perfilId: perfil.id, acao, unidadeOrcId: null, criadoPor: identificador },
    });
    concedidas += 1;
  }

  const usuario =
    (await prisma.usuario.findUnique({ where: { identificador }, select: { id: true } })) ??
    (await prisma.usuario.create({
      data: { identificador, nome, ativo: true, criadoPor: identificador },
      select: { id: true },
    }));

  const vinculo = await prisma.vinculoUsuarioPerfil.findFirst({
    where: { usuarioId: usuario.id, perfilId: perfil.id },
    select: { id: true },
  });
  if (vinculo === null) {
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: usuario.id, perfilId: perfil.id, criadoPor: identificador },
    });
  }

  await definirSenha(prisma, { usuarioId: usuario.id, senha, criadoPor: identificador });

  console.log(
    `\nOperador "${identificador}" provisionado no perfil "${NOME_PERFIL}": ` +
      `${concedidas} ação(ões) concedida(s) nesta execução, ${ACOES_DO_FORNECEDOR.length} no total do perfil.`
  );
  console.log("A tela dele é /licenciamento. Ele não tem ação municipal nenhuma.");
} finally {
  await prisma.$disconnect();
}
