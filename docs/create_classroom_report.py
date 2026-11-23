from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'AgendaPro_Entrega_Classroom.docx'
PURPLE = '5B2A86'; INK = '17131B'; MUTED = '5E5666'; PALE = 'F7F1FC'; WHITE = 'FFFFFF'; GRID = 'D9D9D9'

def shade(cell, color):
    element = OxmlElement('w:shd'); element.set(qn('w:fill'), color)
    cell._tc.get_or_add_tcPr().append(element)

def border(cell):
    tc_pr = cell._tc.get_or_add_tcPr(); borders = OxmlElement('w:tcBorders')
    for side in ('top', 'left', 'bottom', 'right'):
        edge = OxmlElement(f'w:{side}'); edge.set(qn('w:val'), 'single'); edge.set(qn('w:sz'), '6'); edge.set(qn('w:color'), GRID); borders.append(edge)
    tc_pr.append(borders)

def cell_text(cell, value, bold=False, color=INK):
    cell.text = ''
    p = cell.paragraphs[0]; p.paragraph_format.space_after = Pt(0)
    run = p.add_run(value); run.bold = bold; run.font.name = 'Aptos'; run.font.size = Pt(9.5); run.font.color.rgb = RGBColor.from_string(color)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER; border(cell)

def table(doc, headers, rows):
    t = doc.add_table(rows=1, cols=len(headers)); t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, header in enumerate(headers):
        shade(t.rows[0].cells[i], PURPLE); cell_text(t.rows[0].cells[i], header, True, WHITE)
    for row_number, row in enumerate(rows):
        cells = t.add_row().cells
        for i, value in enumerate(row):
            if row_number % 2: shade(cells[i], PALE)
            cell_text(cells[i], value)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)

def paragraph(doc, text, lead=None):
    p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(7); p.paragraph_format.line_spacing = 1.12
    if lead and text.startswith(lead):
        p.add_run(lead).bold = True; p.add_run(text[len(lead):])
    else: p.add_run(text)

def bullet(doc, text):
    p = doc.add_paragraph(style='List Bullet'); p.paragraph_format.space_after = Pt(3); p.add_run(text)

doc = Document()
section = doc.sections[0]
section.top_margin = Inches(.72); section.bottom_margin = Inches(.68); section.left_margin = Inches(.8); section.right_margin = Inches(.8)
styles = doc.styles
styles['Normal'].font.name = 'Aptos'; styles['Normal'].font.size = Pt(10.5); styles['Normal'].font.color.rgb = RGBColor.from_string(INK)
for name, size in [('Title', 26), ('Heading 1', 17), ('Heading 2', 12)]:
    style = styles[name]; style.font.name = 'Aptos Display'; style.font.size = Pt(size); style.font.bold = True; style.font.color.rgb = RGBColor.from_string(INK)
    style.paragraph_format.space_before = Pt(14 if name != 'Title' else 0); style.paragraph_format.space_after = Pt(7)

# Capa
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_before = Pt(70)
r = p.add_run('✦  AgendaPro  ✦'); r.bold = True; r.font.size = Pt(20); r.font.color.rgb = RGBColor.from_string(PURPLE)
p = doc.add_paragraph(style='Title'); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.add_run('Relatório de entrega do SaaS')
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; r = p.add_run('Trabalho prático — Desenvolvimento e apresentação de um SaaS'); r.font.size = Pt(12); r.font.color.rgb = RGBColor.from_string(MUTED)
doc.add_paragraph().paragraph_format.space_after = Pt(20)
table(doc, ['Informação', 'Detalhe'], [
    ['Integrante', 'Pedro Emanoel'],
    ['Projeto', 'AgendaPro — agendamento online para profissionais independentes'],
    ['Data', '23 de novembro de 2026'],
    ['Formato', 'MVP local para demonstração']
])
doc.add_page_break()

doc.add_heading('Problema e público alvo', 1)
paragraph(doc, 'Profissionais autônomos que atendem por horário marcado costumam depender de mensagens e anotações dispersas para organizar reservas. Isso gera retrabalho, demora para responder e risco de duas pessoas solicitarem o mesmo horário. O AgendaPro centraliza serviços, disponibilidade e agenda em uma experiência simples.')
paragraph(doc, 'O público-alvo são profissionais independentes e pequenos negócios de atendimento agendado, como cabeleireiros, barbeiros, esteticistas e consultores. O cliente final usa apenas a página pública de reserva e não acessa dados internos, planos ou contrato da empresa.')

doc.add_heading('Funcionalidades e fluxo demonstrado', 1)
table(doc, ['Etapa', 'Demonstração'], [
    ['1. Configuração', 'O profissional cadastra serviços com duração, preço e status ativo.'],
    ['2. Disponibilidade', 'O profissional ativa ou desativa faixas semanais de atendimento.'],
    ['3. Reserva pública', 'O cliente escolhe serviço, horário e informa nome e contato sem criar conta.'],
    ['4. Integridade', 'A API rejeita sobreposição de reservas ativas para o mesmo intervalo.'],
    ['5. Operação', 'O profissional vê a reserva na agenda e pode concluí-la ou cancelá-la.']
])
paragraph(doc, 'A jornada principal apresentada é: profissional configura agenda → compartilha a página pública → cliente reserva um horário → sistema registra a reserva → profissional acompanha o atendimento. Essa jornada demonstra a proposta essencial do SaaS de ponta a ponta.')

doc.add_heading('Arquitetura e tecnologias', 1)
paragraph(doc, 'A interface é uma aplicação React com TypeScript e Vite. A comunicação ocorre por API REST em Node.js com Express. Os dados são armazenados em PostgreSQL, iniciado localmente por Docker Compose. O front-end consulta serviços, agenda, disponibilidade e Jev Insights; a API valida os dados e persiste as alterações no banco.')
table(doc, ['Camada', 'Tecnologia', 'Responsabilidade'], [
    ['Interface', 'React, TypeScript, Vite, CSS e Framer Motion', 'Painel, formulários, páginas de reserva e animações.'],
    ['API', 'Node.js e Express', 'Endpoints REST e validação de operações.'],
    ['Dados', 'PostgreSQL', 'Serviços, disponibilidade, reservas e insights.'],
    ['Ambiente', 'Docker Compose', 'Banco local reproduzível para a demonstração.']
])
paragraph(doc, 'Diagrama simplificado: Cliente/Profissional → React + TypeScript → Express REST API → PostgreSQL. A regra de conflito é validada na API ao calcular o fim do serviço e consultar reservas ativas que se sobrepõem ao intervalo solicitado.')

doc.add_heading('Técnicas aplicadas', 1)
for item in [
    'SPA com componentes React e estados controlados para a navegação do painel.',
    'Tipagem TypeScript para contratos de dados entre telas e API.',
    'API REST com validação de dados obrigatórios e códigos de erro, incluindo conflito HTTP 409.',
    'Banco relacional com constraints de duração, preço, status e integridade do intervalo da reserva.',
    'Docker Compose para reproduzir o PostgreSQL localmente.',
    'Interface responsiva, foco em clientes de reserva e animações que respeitam preferência de movimento reduzido.'
]: bullet(doc, item)

doc.add_heading('Modelo de oferta e cobrança', 1)
paragraph(doc, 'O SaaS pode ser oferecido em três planos: Free para iniciar a organização da agenda, Pro por R$ 19,90 por mês com agendamentos ilimitados e recursos avançados, e Empresa para equipes e unidades com contratação comercial. A cobrança recorrente real é uma evolução posterior; o MVP demonstra a proposta e a separação entre o fluxo do cliente e a área administrativa.')

doc.add_heading('Uso de inteligência artificial', 1)
paragraph(doc, 'Ferramentas utilizadas: ChatGPT e Codex. Elas foram usadas como apoio no planejamento do produto, na redação da especificação, na implementação e revisão da interface, e nas verificações de compilação. O uso foi assistivo: o integrante revisou as decisões e validou o resultado localmente.')
paragraph(doc, 'Exemplo concreto: a IA ajudou a estruturar o fluxo de reserva, incluindo a separação entre área pública do cliente e área interna da empresa. A implementação foi revisada para que a página pública não exibisse links de planos ou contrato e para que o botão de contrato ficasse restrito ao painel administrativo.')
paragraph(doc, 'O produto também inclui Jev Insights, uma área experimental que apresenta sugestões probabilísticas para revisão humana. Esses insights não criam, alteram ou cancelam reservas automaticamente.')

doc.add_heading('Execução e cuidados de segurança', 1)
paragraph(doc, 'Para executar: criar um arquivo .env a partir de .env.example, definir uma senha local própria, iniciar o PostgreSQL com docker compose up -d, instalar dependências com pnpm install, executar pnpm migrate e iniciar com pnpm dev. O repositório ignora .env para impedir o envio de credenciais.')
paragraph(doc, 'A aplicação foi compilada com sucesso pelo comando pnpm build. A demonstração pode ser feita localmente, conforme permitido na atividade.')

doc.add_heading('Roteiro de apresentação', 1)
for item in [
    'Apresentar o problema de organizar agendamentos manualmente e o público-alvo.',
    'Demonstrar a configuração de um serviço e a disponibilidade do profissional.',
    'Abrir a página pública, realizar uma reserva e mostrar o registro na agenda.',
    'Explicar a arquitetura React, Express e PostgreSQL e o tratamento de conflitos.',
    'Apresentar os planos de cobrança, o uso de IA no desenvolvimento e os próximos passos.'
]: bullet(doc, item)

for sec in doc.sections:
    footer = sec.footer.paragraphs[0]; footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run('AgendaPro | Relatório de entrega do SaaS'); run.font.size = Pt(8); run.font.color.rgb = RGBColor.from_string(MUTED)

doc.core_properties.title = 'AgendaPro Relatório de entrega do SaaS'
doc.core_properties.author = 'Pedro Emanoel'
OUT.parent.mkdir(parents=True, exist_ok=True)
doc.save(OUT)
print(OUT)
