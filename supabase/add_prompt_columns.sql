alter table tember_sparks
  add column if not exists prompt_category text,
  add column if not exists prompt_label text,
  add column if not exists prompt_bridge text,
  add column if not exists prompt_text text;

create index if not exists tember_sparks_prompt_category_idx
  on tember_sparks(prompt_category);

notify pgrst, 'reload schema';
