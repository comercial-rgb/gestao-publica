import type { PrismaClient } from "../prisma/generated/client/client.js";
import { semearUsuariosDeTeste } from "./usuarios-teste.js";
import { semearLicenciamentoDeTeste } from "./licenciamento-teste.js";

/**
 * Limpeza do banco de TESTE, compartilhada por toda a suíte de integração.
 *
 * POR QUE ISTO EXISTE: cada módulo tinha seu próprio `beforeEach` com uma
 * sequência de `deleteMany` na ordem das FKs. Quando o M05 chegou e o `Empenho`
 * passou a referenciar `LancamentoContabil` com RESTRICT, os testes do M01, M02
 * e M04 quebraram — eles apagavam o lançamento sem saber que existia um empenho
 * pendurado nele. Cada módulo novo quebraria os anteriores da mesma forma.
 *
 * ⚠️ V37 — SEM LISTA DE TABELAS. Até aqui havia uma lista de ~490 tabelas para o `TRUNCATE ... CASCADE`, com a
 * instrução "ao criar uma tabela nova, acrescente-a". A limpeza passou a achar no CATÁLOGO DO BANCO as tabelas com
 * linha e apagá-las em passadas, independente de ordem (ver `truncarTudo`); a lista não limpava mais nada, e o
 * guarda que a conferia passou a vigiar papelada. Ele foi trocado pelo efeito: `limpeza-do-banco-completa.test.ts`
 * t3 afirma que, depois da limpeza, nenhuma tabela do esquema tem linha. Tabela nova não pede cadastro aqui.
 *
 * Só rode isto contra o banco de TESTE (o guarda-chuva de `db-teste.ts` garante
 * que a suíte nunca alcança o de dev).
 */

/**
 * SÓ A LIMPEZA, sem semear ninguém.
 *
 * ⚠️ EXISTE PARA UM CASO SÓ: `test/seed-de-producao.test.ts`, que precisa de um banco
 * VAZIO e depois semeado **apenas pelos seeds de produção**. Se ele usasse `limparBanco`,
 * receberia de brinde os usuários de fixture — e passaria a provar que o sistema funciona
 * com um ator que produção nenhuma tem. Era exatamente a classe de falso-verde que aquele
 * teste existe para caçar.
 *
 * Todo o resto da suíte continua usando `limparBanco`.
 */
/**
 * (HISTÓRIA, até a V37: a forma por TRUNCATE. A medição que a substituiu está dentro da função.)
 *
 * ⚠️ TRUNCA SÓ O QUE TEM LINHA — E ISSO FOI MEDIDO, NÃO SUPOSTO.
 *
 * `TRUNCATE` de 141 tabelas VAZIAS custava **1,8 segundo**. O custo não é das linhas:
 * o Postgres toma `ACCESS EXCLUSIVE` em cada tabela e cria um relfilenode novo para
 * cada tabela E cada índice, tenha ela zero linhas ou um milhão. Medido contra
 * `gestao_publica_test`:
 *
 *     TRUNCATE TABLE <141 tabelas vazias> ...     -> 1794 ms
 *     detecção das não-vazias (141 EXISTS)        ->  174 ms
 *
 * Como a suíte limpa o banco uma vez por arquivo (às vezes por teste), esse 1,8 s
 * multiplicava por centenas — e foi o que fez a regressão do ENT02 sair de 7 minutos
 * para 107, com treze testes caindo por espera em módulos que ninguém tinha tocado.
 * O sintoma não apontava para a limpeza: apontava para o M05, o M08, o M12 e o M20.
 *
 * ⚠️ A DETECÇÃO LÊ LINHA, NÃO ESTATÍSTICA. `EXISTS (SELECT 1 FROM t)` para em cima da
 * primeira linha e diz a verdade. A tentação seria `pg_stat_user_tables.n_live_tup`,
 * que é barato e é ESTIMATIVA: uma estimativa velha faria a limpeza PULAR uma tabela
 * com dados, e o estado do teste anterior vazaria para o seguinte. É exatamente a
 * classe de falso-verde que esta suíte existe para não ter.
 *
 * ⚠️ E TUDO NUMA IDA SÓ. O bloco roda no servidor: detectar aqui e truncar noutra
 * chamada abriria uma janela em que outra sessão insere entre as duas — inofensiva
 * hoje (a suíte é serial), e a espécie de coisa que deixa de ser inofensiva sem aviso.
 */
export async function truncarTudo(prisma: PrismaClient): Promise<void> {
  // ⚠️ V37 — DELETE NAS TABELAS COM LINHA, NÃO TRUNCATE ... CASCADE. Medido no banco de teste, depois de um arquivo
  // deixar 28 tabelas com linha: a detecção custou 0,4 s e o `TRUNCATE <28> CASCADE` custou 31 s (em outra corrida,
  // 13,6 s). O CASCADE arrasta o fecho das chaves estrangeiras — centenas de tabelas VAZIAS —, e cada uma (e cada
  // índice) ganha um relfilenode novo no volume do Docker. Era a causa dos "Hook timed out in 10000ms" no PRIMEIRO
  // teste de cada arquivo (a limpeza do que o arquivo anterior deixou), que a V36 e a V37 atribuíram a inchaço.
  //
  // O DELETE só toca o que tem linha. Sem ordem conhecida, ele repete as passadas: a tabela recusada por chave
  // estrangeira (uma filha ainda com linha) fica para a passada seguinte. O que sobrar preso (um ciclo) vai para o
  // TRUNCATE antigo — correto e lento, nunca errado. Toda sequência de tabela do esquema recomeça, como o
  // RESTART IDENTITY com CASCADE fazia (ele alcançava as tabelas vazias também).
  //
  // ⚠️ A DETECÇÃO PERCORRE O CATÁLOGO DO BANCO, NÃO A LISTA: a lista só alcança as filhas pelo CASCADE (ver
  // limpeza-do-banco-completa.test.ts). Sem o CASCADE, uma filha com linha fora da lista seguraria a mãe — e o estado
  // vazaria. O banco diz quais tabelas existem; _prisma_migrations é a exceção nomeada de sempre.
  //
  // ⚠️ O DELIMITADOR É NOMEADO ($limpeza$), E NÃO $$ — E ISSO CUSTOU UMA DEPURAÇÃO.
  // Com $$, o driver ACEITA a chamada, não levanta erro nenhum e NÃO EXECUTA o bloco:
  // o banco continua com as linhas do teste anterior, e a falha aparece longe daqui,
  // como "Unique constraint failed on Perfil.nome" no arquivo seguinte. Um delimitador
  // com nome não colide com a substituição de parâmetros do driver.
  await prisma.$executeRawUnsafe(`
    DO $limpeza$
    DECLARE
      tabela text;
      tem boolean;
      com_linha text[] := '{}';
      restantes text[];
      apagou boolean;
      passadas int := 0;
      seq text;
    BEGIN
      FOR tabela IN
        SELECT quote_ident(c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> '_prisma_migrations'
      LOOP
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM ' || tabela || ')' INTO tem;
        IF tem THEN com_linha := com_linha || tabela; END IF;
      END LOOP;
      restantes := com_linha;
      WHILE cardinality(restantes) > 0 AND passadas < 200 LOOP
        passadas := passadas + 1;
        apagou := false;
        FOREACH tabela IN ARRAY restantes LOOP
          BEGIN
            EXECUTE 'DELETE FROM ' || tabela;
            restantes := array_remove(restantes, tabela);
            apagou := true;
          -- Qualquer recusa de integridade (classe 23): a chave da filha (RESTRICT), ou a ação SET NULL de uma filha que
          -- bate num CHECK ou NOT NULL dela (medido: HistoricoVinculo). A filha também tem linha e sai numa passada; a mãe
          -- tenta de novo na seguinte.
          EXCEPTION WHEN integrity_constraint_violation THEN NULL;
          END;
        END LOOP;
        EXIT WHEN NOT apagou;
      END LOOP;
      IF cardinality(restantes) > 0 THEN
        EXECUTE 'TRUNCATE TABLE ' || array_to_string(restantes, ', ') || ' RESTART IDENTITY CASCADE';
      END IF;
      FOR seq IN
        SELECT DISTINCT s.oid::regclass::text FROM pg_class s
          JOIN pg_depend d ON d.objid = s.oid AND d.classid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
          JOIN pg_class t ON t.oid = d.refobjid JOIN pg_namespace tn ON tn.oid = t.relnamespace
         WHERE s.relkind = 'S' AND tn.nspname = 'public'
      LOOP
        EXECUTE 'ALTER SEQUENCE ' || seq || ' RESTART';
      END LOOP;
    END $limpeza$;
  `);
}

export async function limparBanco(prisma: PrismaClient): Promise<void> {
  await truncarTudo(prisma);

  // ⚠️ E OS USUÁRIOS RENASCEM AQUI — de propósito.
  //
  // A partir do bloco de permissões, TODO lançamento exige um autor CADASTRADO (o funil
  // confere a identidade). Isso alcança 49 arquivos de teste, e uma cópia do seed em cada
  // um seriam quarenta e nove lugares para esquecer de um.
  //
  // É o MESMO argumento do `semearRoteiroOrcamentario` dentro do `criarFichaDeTeste`: o
  // seed roda de dentro do helper que TODA fixture já chama. Ver `usuarios-teste.ts`.
  await semearUsuariosDeTeste(prisma);

  // ⚠️ E O LICENCIAMENTO TAMBÉM (V10 T1), pelo MESMO argumento e pelo MESMO caminho oficial.
  //
  // O gate de licenciamento é fail-closed: sem contrato, nenhum módulo contratável opera. A
  // suíte exercita as portas de leitura e o funil de escrita, e sem isto centenas de testes
  // falhariam por um motivo que não é o deles. O estado nasce por `instalarLicenciamento` — o
  // mesmo caminho da instalação real —, não por `create` à mão: fixture que monta o estado por
  // dentro prova o teste e não prova o produto.
  //
  // Quem precisa do estado "não instalado" o produz com `apagarLicenciamentoDeTeste`.
  await semearLicenciamentoDeTeste(prisma);
}
