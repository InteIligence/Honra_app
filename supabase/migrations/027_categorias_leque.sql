-- ============================================================
-- HONRA — Migração 027: LEQUE DE CATEGORIAS (aditivo)
-- As ~10 etiquetas de arranque (migração 002) eram poucas. Aqui alarga-se
-- o leque para cobrir os três mundos do Honra: Eventos (beachhead),
-- B2C/ofícios & bem-estar, e B2B/criativo & profissional.
-- Idempotente: `on conflict do nothing` — não duplica o que já existe,
-- não mexe nas etiquetas antigas nem nas pontes perfil_categorias.
-- ============================================================

insert into public.categorias (nome, slug) values
  -- ── Eventos (o beachhead — profundidade) ──────────────────────────
  ('DJ',                            'dj'),
  ('Catering',                      'catering'),
  ('Decoração & Flores',            'decoracao-flores'),
  ('Música ao Vivo & Bandas',       'musica-ao-vivo'),
  ('Wedding Planner',               'wedding-planner'),
  ('Som & Luz',                     'som-luz'),
  ('Animação',                      'animacao'),
  ('Bar & Bartending',              'bar-bartending'),
  ('Cabelo & Maquilhagem de Noiva', 'cabelo-maquilhagem-noiva'),
  ('Convites & Papelaria',          'convites-papelaria'),
  ('Pastelaria & Bolos',            'pastelaria-bolos'),

  -- ── B2C / ofícios & bem-estar ─────────────────────────────────────
  ('Barbearia',                     'barbearia'),
  ('Cabeleireiro',                  'cabeleireiro'),
  ('Estética',                      'estetica'),
  ('Unhas',                         'unhas'),
  ('Depilação',                     'depilacao'),
  ('Tatuagem',                      'tatuagem'),
  ('Massagem',                      'massagem'),
  ('Personal Trainer',              'personal-trainer'),
  ('Nutrição',                      'nutricao'),
  ('Mecânica Auto',                 'mecanica-auto'),
  ('Canalização',                   'canalizacao'),
  ('Eletricidade',                  'eletricidade'),
  ('Climatização & AVAC',           'climatizacao-avac'),
  ('Serralharia',                   'serralharia'),
  ('Carpintaria',                   'carpintaria'),
  ('Pintura',                       'pintura'),
  ('Jardinagem',                    'jardinagem'),
  ('Mudanças',                      'mudancas'),
  ('Costura & Arranjos',            'costura-arranjos'),
  ('Explicações & Tutoria',         'explicacoes-tutoria'),
  ('Cuidados de Crianças',          'cuidados-criancas'),
  ('Cuidados a Idosos',             'cuidados-idosos'),
  ('Estética Animal & Petsitting',  'estetica-animal-petsitting'),

  -- ── B2B / criativo & profissional ─────────────────────────────────
  ('Design Gráfico',                'design-grafico'),
  ('UX/UI',                         'ux-ui'),
  ('Ilustração',                    'ilustracao'),
  ('Motion & 3D',                   'motion-3d'),
  ('Dados & IA',                    'dados-ia'),
  ('Copywriting',                   'copywriting'),
  ('Locução & Voz Off',             'locucao-voz'),
  ('Podcast & Áudio',               'podcast-audio'),
  ('Tradução',                      'traducao'),
  ('Jurídico',                      'juridico'),
  ('Recursos Humanos',              'recursos-humanos'),
  ('Arquitetura',                   'arquitetura'),
  ('Engenharia',                    'engenharia'),
  ('Topografia',                    'topografia')
on conflict do nothing;
