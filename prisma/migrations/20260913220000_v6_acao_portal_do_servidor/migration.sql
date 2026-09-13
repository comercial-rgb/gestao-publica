-- V6 P2.4 — O PORTAL DO SERVIDOR: a leitura do PRÓPRIO vínculo e dos PRÓPRIOS contracheques.
-- Ela NÃO abre a folha do ente: a porta recorta pela pessoa da sessão (o vínculo explícito
-- usuário → pessoa do M16), e sem esse vínculo a tela diz que ele está pendente em vez de mostrar
-- a de outra pessoa. É ação de leitura porque o menu e a política se administram por ela.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CONSULTAR_PORTAL_DO_SERVIDOR';
