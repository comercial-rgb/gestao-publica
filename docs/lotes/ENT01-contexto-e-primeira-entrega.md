# ENT01 — contexto seguro e a primeira despesa que atravessa o sistema

> Executar somente com o gate de `00-INICIAR-BASE-SEGURA.md` aprovado.
> Especificação detalhada de telas, campos, rotas e cenários:
> `especificacoes/PRIMEIRA-ENTREGA.md`. Este prompt define o enquadramento, a
> ordem e o gate; a especificação define o conteúdo.

## 1. O objetivo do lote

Colocar de pé a fundação **exercitada por uma operação real**, não uma camada
abstrata esperando o primeiro consumidor.

O marco não é "o menu está criado". É conseguir, pela interface: escolher
município, entidade e exercício; cadastrar um credor; consultar a dotação;
emitir um empenho; liquidar com retenção; registrar o pagamento; conferir o
razão; recarregar cada tela e encontrar tudo persistido; e estornar sem devolver
ao caixa dinheiro que não saiu.

A cadeia:

```
pessoa/credor → dotação e fonte → empenho → liquidação → retenção
  → registro de pagamento → lançamentos e razão → conferência e estorno
```

## 2. Ordem de execução

### 2.1 Contexto e identidade primeiro

Sem contexto resolvido no servidor, todo o resto é inseguro por construção.

- Município, entidade gestora e exercício como dimensões distintas.
- Identidade do tenant resolvida a partir de membership confiável. URL,
  cabeçalho e campo de formulário **não** conferem permissão.
- Entidade autorizada e exercício verificados **por requisição**.
- Troca de entidade preserva o exercício quando permitido; quando não, informa o
  motivo e exige escolha explícita, sem substituir por outro ano em silêncio.
- Duas abas em entidades diferentes não trocam o destino de uma escrita.
- Nenhuma conta com senha padrão distribuída. Bootstrap por segredo de ambiente.

### 2.2 Caracterizar antes de ampliar

A cadeia da despesa já existe no M05, com guards de fonte e de disponibilidade,
e o ledger no M01. Antes de escrever tela:

1. Leia os `MODULO.md` de M01 e M05. Eles explicam decisões revertidas e por que
   o código não é o que se espera.
2. Rode a suíte desses módulos e registre o comportamento atual de: saldo de
   dotação por data, geração de lançamento por evento, regra de estorno por
   perna, período aberto.
3. Só então construa a interface sobre os casos de uso existentes.

Se um caso de uso não existir, crie-o na camada correta — domínio puro, port,
adapter — e não dentro do componente de tela.

### 2.3 Telas

Nove conjuntos, especificados em `especificacoes/PRIMEIRA-ENTREGA.md`:

| Conjunto | Resultado esperado |
|---|---|
| T01 entrada e contexto | Entidades e exercícios autorizados, sem mistura entre abas nem mudança silenciosa do destino da operação |
| T02 pessoas e credores | Cadastro compartilhado, papéis, relações e histórico |
| T03 dotações e fontes | Consulta dos saldos que efetivamente sustentam a despesa |
| T04 empenhos | Emissão, filtros, situação, saldos e ações de negócio |
| T05 detalhe do empenho | Origem, liquidações, retenções, pagamentos, estornos, lançamentos e histórico no mesmo contexto |
| T06 liquidação e retenções | Validação de saldo e documentos, com efeito contábil |
| T07 pagamento | Separação entre registro administrativo, envio ao banco e confirmação bancária |
| T08 razão e conferência | Partidas, valores por subsistema e relações de estorno |
| T09 situação das integrações | Estados e tentativas reais |

A aba de histórico chama-se histórico. Não use rótulo de conformidade em lugar
nenhum da interface.

### 2.4 O cenário financeiro do aceite

Dotação de teste 10.000,00. Empenho de 1.000,00. Liquidação de 1.000,00.
Retenção **explicitamente informada** de 100,00. Saída de caixa de 900,00.

Estes valores são de engenharia. Não representam alíquota legal, pagamento real
nem tabela tributária de município algum. Existem para exercitar exatamente a
diferença entre bruto, líquido e estorno por perna.

O ponto que o cenário protege: **um lançamento pode ter pernas de valores
diferentes.** No pagamento com retenção, o caixa leva o líquido e as demais
pernas levam o bruto. O gerador de estorno produz o valor de cada perna, e quem
persiste não pode recarimbar um valor único por cima. Dois estornos do M08 já
faziam isso; era invisível, porque as pernas batiam entre si, e devolveria ao
caixa o bruto de um pagamento que desembolsou só o líquido.

Registre os valores esperados por conta e por subsistema **antes** de rodar.

### 2.5 Integrações — estado honesto desde o começo

T09 é painel sobre registros reais: conector, ambiente, configuração, última
tentativa, estado local, estado externo, referência de retorno, erro e próxima
ação.

Ausência de tentativa não é sucesso. Conector inexistente fica em backlog
técnico, sem rota e sem botão de envio. Sem credencial, o envio real fica
indisponível com motivo declarado, nunca substituído por retorno local de
sucesso.

Preserve a hierarquia de evidência do repositório: golden byte a byte prova
formatação determinística, não aceitação do tribunal; estado simulado prova
simulação, não protocolo.

## 3. Testes

Os 25 cenários mínimos estão em `especificacoes/PRIMEIRA-ENTREGA.md`, seção 5.
Todos precisam ser implementados e executados neste lote. Os oito que mais
costumam ser burlados, e que exigem atenção:

- Papel de runtime sem `BYPASSRLS`, sem propriedade indiscriminada das tabelas e
  sem DDL. Testar isolamento com o **papel real da aplicação**: administrador do
  banco e proprietário de tabela contornam política de linha.
- Pool reutilizado não pode carregar contexto do usuário anterior. `SET` de
  sessão que sobreviva à requisição contamina o próximo.
- Duas requisições concorrentes não excedem saldo de dotação, liquidação ou
  pagamento.
- Falha no meio da unidade de trabalho reverte fato operacional, ledger,
  auditoria de sucesso e outbox juntos.
- Estorno parcial não é tratado como total por um booleano.
- Período fechado bloqueia escrita por API, worker e rota alternativa.
- Nenhum `GET` emite, cancela ou estorna.
- Nenhum rótulo de conformidade ou identificador de catálogo aparece em tela,
  mensagem ou documento. "Licitações", "Edital", "Pregão" e "Contrato" continuam
  disponíveis.

## 4. Gate

O lote encerra quando:

1. A cadeia inteira é executada pela interface, do cadastro do credor ao razão.
2. Cada tela, recarregada, encontra o dado persistido — não estado de componente.
3. Os valores por conta e subsistema conferem com o esperado registrado antes.
4. O estorno inverte as pernas corretas, preserva o fato original e não aumenta
   o caixa pelo bruto.
5. Os 25 testes do incremento passam, e a regressão de ENT00 continua verde.
6. `ESTADO-EXECUCAO.md` é atualizado com código, gate, comandos, resultados,
   migrações e SQL aplicados, pendências reais e o próximo lote.

## 5. Limites explícitos deste gate

Aprovar ENT01 comprova apenas o que foi testado. **Não** comprova remessa a
tribunal, aplicativo em loja, custódia em HSM, designer de relatórios, folha
completa, tributos, infraestrutura de produção nem integralidade do documento de
origem. As pendências permanecem explícitas no catálogo, com situação
`NAO_VERIFICADO` ou a que a evidência sustentar.
