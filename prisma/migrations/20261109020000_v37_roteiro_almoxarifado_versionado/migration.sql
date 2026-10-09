-- V37 (fecha ROTEIRO-ALMOXARIFADO-SEM-VERSAO) — o roteiro do almoxarifado passa a ter versões, como o patrimonial e o
-- do resultado da alienação: trocar as contas é uma versão nova, com autor, momento e motivo, e a anterior fica no
-- histórico. Aditiva: só um valor novo no enum da família. A linha de `RoteiroAlmoxarifado` já gravada continua valendo
-- enquanto o movimento não tiver versão publicada.
ALTER TYPE "FamiliaDeRoteiro" ADD VALUE IF NOT EXISTS 'ALMOXARIFADO';
