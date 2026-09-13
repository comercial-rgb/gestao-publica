# Escopo demonstrável (candidato V5)

Ambiente identificado como **DEMONSTRAÇÃO**. Não é produção operacional de prefeitura,
não é POC integral do termo de referência, não é implantação municipal concluída.

O SHA do candidato de código está no `ESTADO-EXECUCAO.md`, seção 51. Sem alvo de
hospedagem autorizado, o artefato é local.

## O que se apresenta

- Login interno em `/login`, com usuários criados pelo fluxo administrativo autorizado.
- Planejamento plurianual (PPA/LDO) e dotações já entregues na V4.
- Contratação: processo, contrato, empenho informado com contrato/reserva.
- Compras: solicitação, pesquisa de preços, ordem de compra com itens, recebimento parcial.
- **Documento fiscal recebido:** digitação ou XML NF-e/NFC-e (modelos 55/65), duas linhas,
  conferência e cancelamento como fatos, anexos, PDF de conferência **sem validade fiscal**.
  Registrar a nota **não** dá entrada em estoque, **não** liquida e **não** paga.
  Importar XML é validação estrutural local — **não** é autorização da SEFAZ.
- Empenho a partir da ordem (`Empenho.ordemDeCompraId`); ordinária um empenho pelo total;
  global/estimativa pelo residual; anulação copia a FK; estorno da ordem com empenho vivo recusa.
- Liquidação apontando para documento **conferido**; saldo do documento impede liquidar de novo
  a mesma parcela.
- Dossiê do empenho, termos patrimoniais e PDFs operacionais já existentes.
- Consulta pública de protocolo em `/consulta` (número + verificador, sem sessão).
- Demonstrativos públicos em `/transparencia/demonstrativos` (RREO/RGF publicados).

## O que não se apresenta como operacional

- RH, folha, holerite, portal do servidor transacional (Fila B): **fora desta demonstração**.
- Portal do cidadão `/cidadao`, autoatendimento e NFS-e: **não há tela vazia no lugar**.
  O que existe é a consulta de protocolo e a transparência dos demonstrativos.
- Integração bancária, SEFAZ, TCE em transmissão real: ausentes ou em sink de teste.
- Conciliação de arrecadação antiga sem conta bancária (`ARRECADACAO-SEM-CONTA-BANCARIA`).
- Produção municipal, DNS, domínio de prefeitura.

## Dados

Somente sintéticos. Documentos gerados levam a marca de demonstração, sem validade fiscal.
Não usar e-mails das fixtures para enviar notificação real.

## Publicação

Pendência única: **alvo de publicação não definido**. Sem autorização específica do
operador, não há URL a inventar. Instruções locais: `docs/operacao/DEPLOY-DEMONSTRACAO.md`
e `docs/demo/ROTEIRO-APRESENTACAO.md`.
