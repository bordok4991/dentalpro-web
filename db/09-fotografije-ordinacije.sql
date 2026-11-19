-- Neobavezne fotografije uz usluge i kontakt. Vidljivost određuju postojeća pravila ordinacije.
alter table public.clinics
  add column if not exists services_photo_url text check (length(services_photo_url) <= 300000),
  add column if not exists entrance_photo_url text check (length(entrance_photo_url) <= 300000);
