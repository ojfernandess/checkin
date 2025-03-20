# Sistema de Check-in

Sistema de automação para check-in com integração de mensagens WhatsApp para hotéis e pousadas.

## Funcionalidades

- Importação de dados de reservas via planilha Excel/CSV
- Filtragem de reservas por data de check-in
- Envio automatizado de mensagens de boas-vindas para hóspedes
- Histórico de mensagens enviadas com persistência local e na nuvem
- Sincronização entre múltiplos dispositivos via Firebase
- Interface responsiva e intuitiva

## Tecnologias Utilizadas

- React.js
- TypeScript
- Firebase (Autenticação e Realtime Database)
- Tailwind CSS
- XLSX/ExcelJS para manipulação de planilhas

## Requisitos

- Node.js 16+
- NPM ou Yarn

## Instalação

1. Clone o repositório
```bash
git clone https://github.com/ojfernandess/sistema-checkin.git
cd sistema-checkin
```

2. Instale as dependências
```bash
npm install
```

3. Inicie o servidor de desenvolvimento
```bash
npm run dev
```

## Como Usar

1. Faça upload de uma planilha Excel com os dados dos hóspedes
2. Filtre as reservas pela data desejada
3. Selecione os hóspedes e envie mensagens personalizadas
4. Acompanhe o histórico de mensagens enviadas

## Sincronização

O sistema possui uma funcionalidade de sincronização que permite:
- Trabalhar offline com persistência local
- Sincronizar automaticamente quando online
- Compartilhar dados entre múltiplos dispositivos

## Autor

Desenvolvido por OJ | [PlanBCoin](https://planbcoin.site) 