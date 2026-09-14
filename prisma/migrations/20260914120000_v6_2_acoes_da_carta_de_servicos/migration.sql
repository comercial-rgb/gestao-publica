-- V6.2 — P3: a carta de servicos e as solicitacoes do requerente. Quatro acoes de mutacao e a
-- leitura da area do requerente. SEPARADA das tabelas: ALTER TYPE ADD VALUE nao convive com o uso
-- do valor na mesma transacao.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CONFIGURAR_CARTA_DE_SERVICOS';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'SOLICITAR_SERVICO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'DECIDIR_SOLICITACAO_DE_SERVICO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REGISTRAR_REPRESENTACAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CONSULTAR_MEUS_SERVICOS';
