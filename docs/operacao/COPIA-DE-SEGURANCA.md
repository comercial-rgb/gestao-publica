# Cópia de segurança e prova de restauração (V32)

Sem segredos aqui. O destino externo e a credencial dele são do responsável pela operação.

## O que existe

| Peça | O que faz |
|---|---|
| `scripts/operacao/copia-de-seguranca.sh` | `pg_dump -Fc` com nome provisório até terminar, `sha256` ao lado, retenção local (`RETENCAO_DIAS`, padrão 14) e, se `COPIA_EXTERNA_S3` estiver configurado, envio para fora da máquina com criptografia no servidor. Sem destino externo, sai com **código 2** e diz "INDISPONIVEL" — nunca finge sucesso. |
| `scripts/operacao/provar-restauracao.sh` | Restaura a cópia num banco **novo** chamado `gestao_publica_ensaio_*` (recusa qualquer outro nome e banco já existente), confere o sha256, as contagens de dez tabelas centrais contra a origem, se o razão fecha (débitos = créditos) e a última migration; grava o relatório ao lado da cópia. Sai 0 só quando tudo passa. |
| `scripts/implantacao/gestao-publica-copia.service` e `.timer` | Agendamento diário às 02:30 (systemd), com `Persistent=true`. Código 2 deixa o serviço "failed" de propósito. |

## Evidência executada (03/10/2026, banco clone `gestao_publica_v28`, container local)

- Cópia: 1.946.208 bytes, sha256 `d11f8623…a66153`; saída 2 (externa indisponível, como esperado).
- Restauração em banco de ensaio: 9 s; dez tabelas iguais à origem (7.864 contas, 82 lançamentos, 350 partidas…);
  razão fecha (0,00); última migration `20261101092500_v32_diarias_e_suprimento_de_fundos`. **Restauração provada.**
- O instrumento acusa (provado nas duas direções): nome de banco de uso → recusado; banco de ensaio já existente →
  recusado; cópia adulterada em 1 byte → sha256 difere; cópia com uma partida avulsa de 7,00 → "razão não fecha, 7.00".
- Saída bruta: `.registro-de-execucao/v32-copia.txt`, `v32-restauracao.txt`, `v32-restauracao-negacoes.txt`,
  `v32-restauracao-razao.txt` (na worktree da V32).

## Instalar no servidor (passo do operador)

```sh
sudo install -m 0755 scripts/operacao/copia-de-seguranca.sh /usr/local/sbin/gestao-publica-copia-de-seguranca.sh
sudo install -d -m 0750 -o postgres /var/backups/gestao-publica /etc/gestao-publica
echo 'BANCO=gestao_publica_esperanca' | sudo tee /etc/gestao-publica/copia.env
# quando houver destino externo:  echo 'COPIA_EXTERNA_S3=s3://<balde>/<prefixo>' | sudo tee -a /etc/gestao-publica/copia.env
sudo install -m 0644 scripts/implantacao/gestao-publica-copia.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now gestao-publica-copia.timer
sudo systemctl start gestao-publica-copia.service; systemctl status gestao-publica-copia.service
```

A prova de restauração semestral roda na mesma máquina (ou em outra com o PostgreSQL):
`provar-restauracao.sh /var/backups/gestao-publica/<arquivo>.dump gestao_publica_ensaio_<data> gestao_publica_esperanca`.

## Pendências nomeadas

- `COPIA-EXTERNA-SEM-DESTINO`: balde S3 (ou outro destino) e credencial só de escrita para a cópia — decisão do
  responsável pela operação. Até lá a cópia fica só no disco da máquina, e o serviço acusa todo dia.
- `RPO-DE-QUATRO-HORAS`: a cópia diária não atende um RPO de 4 h; exige arquivamento contínuo do WAL ou cópias a cada
  4 h (trocar o `OnCalendar`), decisão de custo.
