-- ============================================================
-- HONRA — Migração 052: CATEGORIAS EM HIERARQUIA (mãe → filhas)
-- ------------------------------------------------------------
-- Decisão Vítor 19/07: categorias ABRANGENTES com SUBCATEGORIAS. Ex.: escrever
-- "Cinema" → aparecem Realizador, Dir. de Fotografia, Produção, Dir. de Arte…
-- Sem partir os 58 slugs existentes (têm perfis ligados): promovem-se alguns a
-- MÃE, os restantes recebem `parent_id`, e acrescentam-se as filhas em falta
-- (Cinema, Vendas, Profissões Reguladas). `ordem` fixa a apresentação.
-- ADITIVA. Idempotente (on conflict / if not exists).
-- ============================================================

alter table public.categorias add column if not exists parent_id uuid references public.categorias(id);
alter table public.categorias add column if not exists ordem int not null default 0;
create unique index if not exists categorias_slug_uk on public.categorias (slug);

-- 1) MÃES (top-level). Reaproveita slugs existentes onde já há um bom nome de mãe.
insert into public.categorias (nome, slug, ordem) values
  ('Eventos & Casamentos',   'eventos',            1),
  ('Cinema & Audiovisual',   'cinema-audiovisual', 2),
  ('Estética & Bem-estar',   'estetica',           3),
  ('Design & Criativo',      'design',             4),
  ('Tecnologia & Software',  'tecnologia',         5),
  ('Marketing & Conteúdo',   'marketing',          6),
  ('Construção & Ofícios',   'construcao-oficios', 7),
  ('Casa & Cuidados',        'casa-cuidados',      8),
  ('Consultoria & Negócios', 'consultoria',        9),
  ('Educação & Formação',    'educacao',          10),
  ('Vendas',                 'vendas',            11),
  ('Profissões Reguladas',   'reguladas',         12)
on conflict (slug) do update set nome = excluded.nome, ordem = excluded.ordem, parent_id = null;

-- 2) Ligar as filhas EXISTENTES à respetiva mãe (por slug).
do $$
declare
  m record;
  s text;
  mapa jsonb := jsonb_build_object(
    'eventos', jsonb_build_array('fotografia-video','dj','musica-ao-vivo','catering','pastelaria-bolos','bar-bartending','decoracao-flores','wedding-planner','cabelo-maquilhagem-noiva','animacao','som-luz','convites-papelaria'),
    'cinema-audiovisual', jsonb_build_array('motion-3d','locucao-voz','podcast-audio'),
    'estetica', jsonb_build_array('cabeleireiro','barbearia','unhas','depilacao','massagem','personal-trainer'),
    'design', jsonb_build_array('design-grafico','ilustracao','ux-ui'),
    'tecnologia', jsonb_build_array('web-software','dados-ia'),
    'marketing', jsonb_build_array('marketing-redes','copywriting','traducao'),
    'construcao-oficios', jsonb_build_array('obras-construcao','eletricidade','canalizacao','pintura','carpintaria','serralharia','climatizacao-avac','jardinagem','mudancas','reparacoes-assistencia','mecanica-auto'),
    'casa-cuidados', jsonb_build_array('limpezas','cuidados-idosos','cuidados-criancas','estetica-animal-petsitting','costura-arranjos'),
    'consultoria', jsonb_build_array('recursos-humanos'),
    'educacao', jsonb_build_array('explicacoes-tutoria'),
    'reguladas', jsonb_build_array('arquitetura','engenharia','topografia','contabilidade-financas','juridico','nutricao')
  );
begin
  for m in select key, value from jsonb_each(mapa) loop
    for s in select jsonb_array_elements_text(m.value) loop
      update public.categorias
        set parent_id = (select id from public.categorias where slug = m.key)
        where slug = s;
    end loop;
  end loop;
end $$;

-- 3) Filhas NOVAS (Cinema, Vendas, Reguladas). Herdam o parent_id da mãe.
insert into public.categorias (nome, slug, parent_id, ordem)
select v.nome, v.slug, (select id from public.categorias where slug = v.mae), v.ordem
from (values
  -- Cinema & Audiovisual
  ('Realizador',              'realizador',          'cinema-audiovisual', 1),
  ('Diretor de Fotografia',   'diretor-fotografia',  'cinema-audiovisual', 2),
  ('Produção',                'producao-audiovisual','cinema-audiovisual', 3),
  ('Diretor de Arte',         'diretor-arte',        'cinema-audiovisual', 4),
  ('Montagem & Edição',       'montagem-video',      'cinema-audiovisual', 5),
  ('Guarda-roupa & Caracterização', 'guarda-roupa',  'cinema-audiovisual', 6),
  -- Vendas
  ('Alimentar',              'vendas-alimentar',    'vendas', 1),
  ('Têxtil & Moda',          'vendas-textil',       'vendas', 2),
  ('Retalho',                'vendas-retalho',      'vendas', 3),
  ('Automóvel',              'vendas-automovel',    'vendas', 4),
  ('Imobiliário',            'vendas-imobiliario',  'vendas', 5),
  ('Tecnologia & Eletrónica','vendas-tecnologia',   'vendas', 6),
  -- Profissões Reguladas (cédula/ordem)
  ('Advogado',               'advogado',            'reguladas', 1),
  ('Solicitador',            'solicitador',         'reguladas', 2),
  ('Médico',                 'medico',              'reguladas', 3),
  ('Enfermeiro',             'enfermeiro',          'reguladas', 4),
  ('Dentista',               'dentista',            'reguladas', 5),
  ('Psicólogo',              'psicologo',           'reguladas', 6)
) as v(nome, slug, mae, ordem)
on conflict (slug) do update set parent_id = excluded.parent_id, ordem = excluded.ordem, nome = excluded.nome;
