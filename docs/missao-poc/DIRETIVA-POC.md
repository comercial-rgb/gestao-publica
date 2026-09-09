# DIRETIVA POC — fim de semana 18–19/07/2026 (autoridade: Winner)

> Complementa `PATCH.md` (que mantém autoridade em conflito). POC: segunda-feira. Nada aguarda e-mail/credencial do TCE. Tudo demonstrável com massa sintética e modos explícitos.

## 1. SAGRES TXT
Implementação normal sobre o layout oficial 2026 v1.1 versionado. Arquivos diário e mensal reais, golden files, validação, ZIP, manifesto, SHA-256. UG e dados **sintéticos, claramente identificados como POC, nunca transmitidos ao TCE**.

## 2. Captura 2.0
JSON real **somente** a partir de schemas oficiais versionados no repo; validação local; transporte **MOCK** com resultado terminal **`SIMULATED`**; apenas `simulationId` interno — **proibido fabricar protocolo, recibo ou aceite do TCE**. SANDBOX/LIVE implementados/configuráveis com status **`CREDENTIAL_NOT_CONFIGURED`** enquanto não houver credencial.

## 3. API TCE
Gateway separado + mock contratual **exclusivamente** sobre OpenAPI/schema oficial versionado. Demonstrar consulta por UG/período, retorno sintético e comparação "dados locais × dados TCE". UI exibe **MODO MOCK** permanentemente. Contrato oficial ausente no repo → transporte real **bloqueado nomeando o documento faltante**; nunca inventar endpoint/payload.

## 4. API Banco do Brasil
Cliente da M17-a. Fixtures compatíveis com o `SPEC_BB` versionado. **Nenhuma chamada financeira real.** Extrato/saldo/movimentações sintéticos; agência/conta **mascaradas**. Pagamento e transferência permanecem fora (M17-b).

## 5. Massa POC (seed determinístico e reutilizável)
UG sintética; dotação; empenho; liquidação; pagamento; retenção (se suportada); receita orçamentária; **duas contas bancárias sintéticas da mesma UG**; transferência entre contas; extrato BB correspondente; **um erro SAGRES proposital** (demonstra rejeição→correção). Nenhum dado corresponde intencionalmente a pessoa, empresa ou conta real.

## 6. Jornada de demonstração
Selecionar massa POC → gerar TXT diário/mensal → visualizar posições e validações → baixar pacote+manifesto → gerar/validar JSON Captura 2.0 → simular submissão (`SIMULATED`) → consultar fixture TCE → consultar fixture BB → contabilizar e conciliar pelo `razao.ts` → exibir log, correlation ID, modo, hash e rastreabilidade.

## 7. Comunicação honesta (UI e artefatos)
Diferenciar sempre: **"Formato oficial gerado e validado localmente"** · **"Integração preparada para credencial"** · **"Simulação executada"** · **"Transmissão externa não realizada"**. Nunca usar "TCE aceitou", "transmitido" ou "recibo oficial" em modo MOCK.

## Decisões do Winner incorporadas (18/07)
- **PCASP 8 divergentes:** RÓTULO → adotar oficial; ESTRUTURAL (natureza/função/conflito com roteiro MCASP-STN) → não alterar, reportar. Tabela obrigatória no Passo 0 da S2.
- **`ContaBancaria`:** migração aditiva autorizada (`banco/agencia/digitoAgencia?/conta/digitoConta`), dado cru + máscara BR na UI. `SaldoMensal` sem coluna materializada — gerador calcula por SUM na exportação.
