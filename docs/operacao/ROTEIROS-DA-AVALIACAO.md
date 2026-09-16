# Roteiros curtos para avaliar o que a V10 entregou

> Para quem vai abrir o sistema e conferir. Cada roteiro é curto de propósito: ele mostra o
> caminho e **o que observar**, inclusive o que o sistema recusa — porque metade destas entregas
> é sobre recusar direito.

## Antes de começar

O servidor local de avaliação sobe com `npm run start` (ou `npm run dev`) e o banco de
desenvolvimento em `localhost:5436`. O endereço e o PID do processo estão no fim do relatório da
sessão. **Não há URL hospedada**: a implantação está bloqueada por acesso à AWS
(`docs/operacao/AWS-PREFLIGHT-V9-N7.md`), e `http://localhost` não é hospedagem.

Perfis: as ações de cada tela estão em `docs/mapa-de-acesso.md`. O **operador do fornecedor** não
é criado por nenhuma tela — ele vem de `npm run engine:operador -- --aplicar`, com
`ENGINE_OPERADOR` e `ENGINE_OPERADOR_SENHA` no ambiente.

---

## 1. Habilitar um módulo (T1 · N6.1)

1. entre como o **operador do fornecedor** e abra **`/licenciamento`**;
2. sem contrato, a tela diz que nenhum módulo contratável opera — e explica por que isso não é
   liberar tudo;
3. registre o contrato (número, cliente, vigência, "demonstração");
4. habilite **Compras, licitações e contratos** — e observe a **recusa**: ele depende do núcleo
   contábil, que ainda não está no contrato. O sistema **não** liga a dependência sozinho;
5. habilite o **núcleo contábil**, depois Compras;
6. **suspenda** o núcleo — e observe a segunda recusa: Compras está vigente e depende dele;
7. suspenda Compras, depois o núcleo. Agora entre como um usuário municipal: a tela de contratos
   **lê** o que existe e **recusa** qualquer ato novo, com a mensagem dizendo que a providência é
   comercial, não de permissão.

**O que observar:** o histórico embaixo, com autor, data e motivo de cada mudança. E que
`/administracao/usuarios` continua funcionando o tempo todo — a plataforma não se suspende.

---

## 2. Preparar e constituir um crédito tributário (T2 · N5)

1. **`/receita/parametros-tributarios`** — publique a tabela do tributo (fórmula, fundamento,
   parâmetros). Sem ela, simular já recusava;
2. **`/receita/imoveis`** — confira um imóvel com responsável vigente;
3. **`/receita/lancamentos`** — abra um lote: tributo, exercício, fato gerador, natureza da
   receita, fonte, vencimentos e os imóveis. **Preparar não constitui nada**;
4. abra o lote. Veja, por imóvel: o valor, quem responde (congelado no fato gerador), os
   vencimentos e a **memória do cálculo** — cada variável com valor e origem, a fórmula e o
   fundamento;
5. **Constituir o crédito** de um imóvel. Se a origem da natureza não tiver roteiro contábil
   cadastrado, a tela recusa **dizendo qual conta falta e quem resolve** — e a preparação
   continua de pé;
6. com o roteiro cadastrado, constitua. Confira em **`/contabilidade`** que nasceu
   crédito a receber contra variação patrimonial aumentativa — e que **o caixa não foi tocado**;
7. **Cancelar** o lançamento: o crédito é baixado por variação patrimonial **diminutiva**, e a
   aumentativa do fato gerador **permanece**. É a renúncia ficando registrada.

**O que observar:** depois de constituir, mude a alíquota da tabela e volte ao lote — o valor
lançado **não muda**. É a memória congelada.

---

## 3. Pedir e decidir uma certidão (T2 · N5)

1. **`/receita/certidoes`** — publique a configuração (validade em dias e fundamento). Sem ela a
   emissão é recusada, e o pedido continua funcionando;
2. peça uma certidão pelo CPF/CNPJ de um contribuinte;
3. **leia a cobertura**: cinco bases, e três delas dizem **"fora do alcance deste sistema"**, com
   o motivo de cada uma;
4. tente emitir **negativa**. O sistema recusa: há base que ele não leu, e "não aparecer" não é
   "não existir";
5. escreva no campo de declaração o que você conferiu fora do sistema, e emita;
6. copie a chave de autenticidade e abra **`/consulta/certidao`** numa janela anônima. Confira o
   que ela devolve — e o que **não** devolve.

---

## 4. Consultar despesa além da primeira página (T3 · N2)

1. **`/transparencia/despesas`** — sem sessão;
2. escolha a fase **Paga**. Observe que a contagem, o número de páginas e os totais mudam
   **juntos** — o filtro vale para o conjunto, não para a página;
3. navegue até a última página: o recorte é o mesmo do começo ao fim;
4. **Baixar CSV**: o arquivo traz as mesmas linhas do recorte, e o rodapé traz os **totais do
   recorte inteiro** mesmo quando o arquivo é truncado;
5. num exercício com mais de dois mil empenhos, o rodapé **soma** — antes ele desistia.

---

## 5. Alterar a publicidade de uma localização (T3 · N2)

1. **`/patrimonio/localizacoes`** → abra uma localização;
2. o bloco **"Divulgação na consulta pública de bens"** diz o estado atual e o efeito de mudá-lo;
3. mude, com motivo. Tente mudar de novo para o mesmo estado: **recusado** — um sucesso que não
   grava nada faria você acreditar que mudou alguma coisa;
4. abra **`/transparencia/bens`** e confira o lugar aparecendo (ou deixando de aparecer) ao lado
   do bem. E o **valor contábil** com a data de referência, na lista e no CSV.

---

## 6. O aceite da publicação (T5 · N7)

Não há servidor publicado — o que dá para avaliar é o **instrumento**:

```sh
npx vitest run test/pos-dns.test.ts
```

Treze casos: nove recusas (DNS ausente, destino diferente, múltiplos endereços, 404, 500, rota
autenticada aberta sem sessão, login em HTTP claro, identidade ausente, identidade diferente) e o
caso positivo. E o ensaio em Linux das pré-condições de instalação:

```sh
docker run --rm -v "$PWD:/repo:ro" \
  -v "$PWD/scripts/ensaio-das-precondicoes.sh:/ensaio.sh:ro" postgres:18 bash /ensaio.sh
```

Ver `docs/operacao/ENSAIO-DA-INSTALACAO.md`.
