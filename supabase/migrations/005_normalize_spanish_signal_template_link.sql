update projects
set signal_templates = replace(
      replace(
        signal_templates::text,
        'https://quotex.com/sign-up/?lid=1060640',
        'https://quotex.com/sign-up?lid=1060640'
      ),
      'https://broker-qx.pro/sign-up/?lid=608668',
      'https://quotex.com/sign-up?lid=1060640'
    )::jsonb,
    updated_at = now()
where id = 'expert_a'
  and signal_templates is not null;
