update public.projects
set link = 'https://quotex.com/sign-up?lid=1060640',
    updated_at = now()
where id = 'expert_a'
  and language = 'es';
