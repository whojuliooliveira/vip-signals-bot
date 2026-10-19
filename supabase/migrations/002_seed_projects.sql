insert into public.projects (id, name, language, link, broker_label, enabled)
values
  ('expert_a', '💎 José Álvarez | Señales VIP 💎', 'es', 'https://quotex.com/sign-up?lid=1060640', 'Haz clic aquí', false),
  ('expert_b', '💎 Tom Reed | VIP Signals 💎', 'en', 'https://u3.shortink.io/smart/HLsHbhHwDmx6gu', 'Click here', true)
on conflict (id) do update set
  name = excluded.name,
  language = excluded.language,
  link = excluded.link,
  broker_label = excluded.broker_label,
  updated_at = now();
