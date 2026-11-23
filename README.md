# AgendaPro

SaaS de agendamento online para profissionais autônomos e pequenos negócios. O profissional organiza serviços, horários e reservas; o cliente escolhe um serviço e confirma o agendamento em uma página pública.

## Integrante

- Pedro Emanoel

## Funcionalidades demonstradas

- Cadastro e ativação de serviços com duração e preço.
- Configuração de disponibilidade semanal.
- Agenda com reservas, conclusão e cancelamento.
- Página pública de reserva sem login do cliente.
- Prevenção de conflito de horários na API e no banco de dados.
- Jev Insights: sugestões probabilísticas com revisão humana.
- Planos Free, Pro e Empresa como possibilidade de monetização.

## Tecnologias

- Front-end: React, TypeScript, Vite, CSS e Framer Motion.
- Back-end: Node.js, Express e API REST.
- Dados: PostgreSQL executado em Docker Compose.
- Qualidade: tipagem TypeScript e compilação de produção com Vite.

## Como executar

Pré-requisitos: Node.js 20+, pnpm e Docker Compose.

1. Copie `.env.example` para `.env`.
2. Troque `SUA_SENHA_LOCAL` nos dois valores do `.env` por uma senha local criada por você.
3. Execute `docker compose up -d`.
4. Execute `pnpm install`.
5. Execute `pnpm migrate` para criar as tabelas e os dados de demonstração.
6. Execute `pnpm dev`.

O front-end abre em `http://localhost:5173` e a API em `http://localhost:3001`. O PostgreSQL utiliza a porta `5433` para não conflitar com instalações locais comuns.

## Uso de inteligência artificial

ChatGPT e Codex auxiliaram no planejamento, na especificação, na implementação da interface e na verificação de compilação. Um exemplo concreto foi a criação e revisão do fluxo de reserva e do tratamento visual de estados da agenda; as decisões finais e a validação foram revisadas pelo integrante.

## Materiais da entrega

- Documento editável: `docs/AgendaPro_Entrega_Classroom.docx`.
- PDF para envio: `docs/rendered_classroom_final/AgendaPro_Entrega_Classroom.pdf`.
- Roteiro de geração do documento: `docs/create_classroom_report.py`.

## Segurança

O repositório não versiona o arquivo `.env`. Use apenas credenciais locais no desenvolvimento e nunca publique senhas, chaves de API ou tokens.
