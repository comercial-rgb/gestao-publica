# V7 / M2.1 - Criterios de aceite da ponte contratual-financeira

> Guardado como veio (CRITERIOS-V7-M2-ACEITE.md), em 2026-09-15. Acompanha `V7-M2-execucao-contratual.md`.

## 1. Natureza desta prova

Estes sao cenarios propostos de engenharia para o incremento. Nao substituem o texto integral do TR, nao representam clausulas novas e nao provam homologacao por terceiros. Converta-os em testes da repo e relacione as evidencias ao catalogo existente, sem copiar estados para um segundo catalogo.

Resultado esperado deve ser definido antes de alterar o codigo. Nao gerar o valor esperado chamando o mesmo calculador que esta sendo testado. Teste com o papel runtime real e dados sinteticos isolados.

As classificacoes de resultado sao: passou, falhou, bloqueado por ambiente e nao executado. Rodadas anteriores falhadas permanecem registradas. app_sha, runner_sha, configuracao, migrations e navegador devem identificar cada execucao.

## 2. Um cenario aritmetico de referencia

Cenario puramente sintetico, de servicos mensuraveis, com condicoes contratuais ficticias explicitadas na fixture. Nao representa tabela tributaria, indice de engenharia nem preco publico real.

| Item | Unidade | Quantidade contratada | Preco unitario | Total contratado |
|---|---|---:|---:|---:|
| A | visita | 10 | R$ 100,00 | R$ 1.000,00 |
| B | hora | 20 | R$ 50,00 | R$ 1.000,00 |
| Total financeiro | - | - | - | R$ 2.000,00 |

A OS autoriza 6 visitas e 10 horas: R$ 1.100,00.
A medicao informa 6 visitas e 8 horas: R$ 1.000,00.
A conferencia aceita 5 visitas e 8 horas: R$ 900,00.
Uma visita, R$ 100,00, permanece em controversia; duas horas, R$ 100,00, ainda nao foram executadas na OS.

Na etapa definida pela fixture, a parcela de R$ 900,00 obtem os recebimentos/atestacao/documentacao exigidos. O documento de cobranca conferido e as alocacoes devem suportar esses R$ 900,00. O motor nao pode simplesmente registrar uma nota de R$ 1.000,00 como integralmente elegivel.

Expectativas:
- Medicao registra R$ 1.000,00, mas liquidacao inicial e de R$ 900,00.
- R$ 100,00 controversos nao se tornam retencao tributaria, pagamento ou glosa definitiva por acidente.
- R$ 100,00 ainda nao executados nao sao objeto de recebimento nem liquidacao.
- Restam R$ 900,00 nao autorizados na OS, no contrato, sem confundi-los com o saldo a executar da propria OS.
- Quantidades nao sao somadas entre visita e hora; totalizadores financeiros somam valores.
- Nova tentativa do mesmo comando nao cria outro recebimento nem outra liquidacao.
- Se a visita controversa for posteriormente aceita conforme procedimento, o complemento e R$ 100,00, nao novos R$ 1.000,00.
- Se for legitimamente rejeitada, o registro da divergencia permanece; liberacao de quantidade/saldo depende do ato correto e nao e um efeito generico de uma flag.
- Pagamento administrativo, se percorrido, usa o saldo liquidado e as retencoes efetivamente parametrizadas. Nao ha taxa fiscal fixa neste cenario.

Acrescente um contrato independente na mesma data e um segundo ator/setor. Para testar duas medicoes legitimas no mesmo dia dentro do mesmo contrato, use parcelas realmente distintas com saldo. Para testar uma repeticao indevida, use a mesma parcela, mesmo com outra chave de comando.

## 3. Matriz de cenarios

Os identificadores abaixo identificam cenarios deste pacote, nao novos requisitos do TR.

| ID | Situacao | Resultado que precisa ser comprovado |
|---|---|---|
| AC01 | Fiscal designado e outro nao designado | O primeiro trabalha no contrato; o segundo nao recebe o dossie privado nem seus anexos |
| AC02 | Permissao global de outra area | Nao concede administracao da fiscalizacao |
| AC03 | Administrador explicito da fiscalizacao | Acessa seu escopo conforme politica, sem grant universal ao admin da plataforma |
| AC04 | Operador financeiro sem designacao de fiscal | Recebe a projecao financeira necessaria e permitida; nao todas as ocorrencias privadas |
| AC05 | Visitante anonimo | Ve somente projecao publica e documentos publicados; nao formulario administrativo desabilitado |
| AC06 | Permissao/designacao revogada entre tela e confirmacao | Servidor recusa a mutacao; nenhum efeito e nenhum vazamento de arquivo |
| AC07 | Contrato vencido hoje, fato executado regularmente antes | Regra distingue tratamento da obrigacao anterior de autorizacao de nova execucao |
| OS01 | Nova OS com duas linhas e origem contratual | Itens, versoes, preco, saldo, fornecedor e contexto recarregam corretamente |
| OS02 | Fornecedor/preco/item adulterado na requisicao | Recusa pelo motivo de dominio, mesmo que a UI esconda o campo |
| OS03 | Duas OS concorrentes excedem o mesmo saldo | Somente o conjunto permitido confirma; nao sobra saldo negativo |
| OS04 | Emitir OS | Nao atesta prestacao nem paga; efeitos de reserva/empenho so existem no caso de uso explicitamente definido |
| OS05 | Cancelar saldo de OS ja parcialmente executada/empenhada | Preserva historico e dependencias; nao libera o que continua comprometido |
| ME01 | Mesmo comando/mesmo conteudo | Um resultado e um efeito, inclusive sob concorrencia |
| ME02 | Mesma chave/conteudo diferente | Conflito, nao segunda execucao |
| ME03 | Mesma parcela com outra chave | Nao e medida ou liquidada duas vezes |
| ME04 | Duas parcelas distintas no mesmo dia | Funcionam quando o regime contratual permitir; nao mudar data para contornar indice |
| ME05 | Periodo indivisivel configurado | Sobreposicao recusada pelo fundamento certo, sem proibir outras ordens/contratos |
| ME06 | Alteracao contratual entre emissao e medicao | Aplica a versao/criterio de vigencia correto sem reescrever valores anteriores |
| RE01 | Recebimento provisorio parcial | Identifica exatamente parcela/itens e pendencias, sem encerrar todo contrato |
| RE02 | Definitivo praticado sem designacao competente | Recusa dentro da transacao |
| RE03 | Definitivo com condicao tecnica pendente no alvo | Bloqueia o alvo e aponta providencia, sem ocultar outra parcela regular |
| RE04 | Parcela incontroversa e parcela em disputa | Parte regular segue quando os demais requisitos forem satisfeitos; disputa permanece identificada |
| RE05 | Compras, servico continuado e obra | Politicas nao sao confundidas; o recebimento final da obra nao e exigido mecanicamente para cada medicao regular |
| RE06 | Ocorrencia resolvida | Nao recebe objeto, apaga glosa ou liquida por efeito colateral |
| RE07 | Suspensao/retomada de prazo | Motivo e marco sao registrados; calendario/fonte controlam o resultado |
| LI01 | Liquidacao da parcela regular da fixture | R$ 900,00, documentos e alocacoes coerentes, no M05 |
| LI02 | Nota de outra entidade/fornecedor ou nao conferida | Recusa com evidencia, sem gravacao parcial |
| LI03 | Duas liquidacoes concorrentes da mesma parcela | Nao ultrapassam o valor elegivel; uma origem consumida apenas uma vez |
| LI04 | Resposta perdida depois do commit | Retomada recupera efeito existente sem duplicar fato/auditoria autoritativa |
| LI05 | Documento com diversas parcelas/medicoes | Alocacoes somam ao valor usado; saldo remanescente e explicado |
| LI06 | Estoque ja movimentado em recebimento | Liquidacao nao gera segunda entrada; servico sem material nao gera estoque |
| LI07 | Folha e patronal existentes | Continuam liquidando por seu titulo proprio, sem exigir OS ou nota fiscal ficticia |
| ES01 | Estorno de parcela liquidada nao paga | Plano autorizado recompoe somente saldos/alocacoes correspondentes |
| ES02 | Parcela paga ou periodo encerrado | Nenhuma devolucao de dinheiro nem reabertura ficticia; procedimento/pendencia apropriados |
| DO01 | PDF multipagina, descricao longa e acentos | Conteudo completo, totais, paginacao e identidade corretos; nao somente MIME/tamanho |
| DO02 | Segunda via apos alterar cadastro ou contrato | Mantem snapshot original; relatorio atual tem sua propria data |
| DO03 | Exportacao/arquivo por terceiro e permissao revogada | Escopo vale em PDF/CSV/XLSX, URL direta e cache |
| UX01 | Tela stale, parcialidade e erro | Acoes coerentes com PROD-015; REGISTRO-MUDOU antes de efeito; retorno preservado |
| UX02 | Quatro larguras e teclado/zoom | Sem overflow da pagina, texto cortado sem acesso ou foco escondido; tabela larga tem rolagem interna consciente |
| RT01 | Instalar do zero e atualizar base isolada | Modelo, SQL manual, grants, perfis e dados preservados chegam ao estado esperado |
| RT02 | Runtime nao owner | Todos os comandos centrais funcionam sem privilegio de manutencao |

Nao e necessario transformar cada linha em um arquivo de teste. Agrupe por fronteira transacional e familia de interface. Nao anunciar '41 testes' apenas por existirem 41 cenarios escritos.

## 4. Percurso de navegador por papeis

Preparacao: banco exclusivamente descartavel, chaves/configuracoes sinteticas, classificacoes de apoio identificadas e contas por papel. A preparacao pode carregar catalogos; nao pode criar escondido o ato que o percurso afirma executar pela UI.

1. Gestor autorizado abre contrato com duas linhas e designacoes corretas.
2. Emite a OS por selecao dos itens e registra a referencia gerada.
3. Fiscal entra com sua propria conta, encontra a tarefa/OS e registra execucao/medicao parcial.
4. Registra o recebimento provisorio e uma divergencia de item.
5. Responsavel do recebimento definitivo entra e aceita somente a parcela regular, conforme a politica da fixture.
6. Operador associa o documento de cobranca conferido da parcela, sem criar valor ficticio.
7. Agente financeiro prepara/liquida pelo M05 e consulta a origem, itens, saldos e razao.
8. Repete a intencao e prova ausencia de duplicidade; cenario distinto testa correcao/reversao autorizada.
9. Visitante acessa o contrato publicavel; outro fiscal e outro fornecedor nao acessam os documentos privados.
10. Reimprime os termos/PDFs; confere conteudo e tenta download nao autorizado.
11. A parte controversa e resolvida pelo caminho permitido e o complemento preserva os R$ 900,00 ja utilizados.
12. Consulta tambem a apropriacao/folha, antes nao reexecutada, no alcance de regressao da ponte financeira.

Nao usar um admin universal para todos os passos. Nenhuma mensagem real ou pagamento real sai deste percurso.

## 5. Desenho das telas para esta frente

### Contrato
Resumo com vigencia e identidade; cards numericos com definicao de cada valor; proximas tarefas; itens/versoes; ordens; medicoes; recebimentos; documentos; financeiro; historico. Ocorrencia privada nao aparece na projecao publica.

### Conferencia
Linhas com unidade, quantidade autorizada, acumulado anterior, executado atual, aceito, em analise e saldo. Motivo proximo da divergencia, anexos permitidos, total por natureza e acao acessivel. Nao usar apenas verde/vermelho nem uma coluna 'status' para esconder os valores.

### Liquidacao
Origem e titulo de suporte visiveis; itens/alocacoes, valor elegivel, empenho/fonte, retencoes pertinentes e impedimentos. Previa explica o efeito; confirmacao mostra o ato persistido e links autorizados. Os valores nao sao escolhidos por primeira opcao ou maior saldo.

### PDF e exportacao
Mesmo escopo/filtros, documento detalhado, paginacao, totais corretos e snapshot. O original nao muda depois. Uma assinatura ainda ausente nao vira uma imagem de assinatura nem selo de autenticidade inventado.

## 6. Relatorio final esperado

Resumo por unidade e por versao. Mostrar resultados desta sessao, nao herdar numeros do app 5937f41. Explicar falhas de preparacao e de produto separadamente; ambas permanecem no registro.

Manter a matriz funcional do TR unica: criterios de fiscalizacao, ordens e documentos relacionados no catalogo; referencia destes cenarios como evidencias, nao como novo denominador.

Na sequencia, o mesmo M2 evolui aditivo por item -> planilha de obra -> medicao na planilha -> agenda completa e formularios. Somente depois, M3 conforme plano mestre. Deficiencias independentes de antiabuso, banco e ouvidoria continuam visiveis no backlog sem desviar a sessao.
