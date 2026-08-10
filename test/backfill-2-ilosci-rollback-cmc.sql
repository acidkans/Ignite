-- ROLLBACK BACKFILL 2 (ilosci) — cofa 26 zmian z 2026-08-10 na wezle CMC- Serwerownia ZDC1-K9_2026.
-- Warunek `quantity = <wartosc wpisana przez backfill>` chroni edycje wykonane po backfillu:
-- wiersz zmieniony recznie zostanie pominiety zamiast nadpisany.

begin;

update material_requirements set quantity = 6    where id = '6d20fdc8-340d-41ea-a709-9b044a01b145' and quantity = 3;
update material_requirements set quantity = 12   where id = 'a4b1eaff-bc45-4050-a253-1cebba7af3ef' and quantity = 2;
update material_requirements set quantity = 400  where id = 'ce12bbeb-d060-4d4c-b678-4dacc2775bdc' and quantity = 200;
update material_requirements set quantity = 2    where id = 'bedf9dc4-4a9b-4f67-9142-0129c4ef18fc' and quantity = 1;
update material_requirements set quantity = 8400 where id = '7a877c2b-32cd-45c0-a641-29c7be5d6a78' and quantity = 3000;
update material_requirements set quantity = 12   where id = '9cece227-82ac-4d0a-9acb-ff83095d5ded' and quantity = 5;
update material_requirements set quantity = 3    where id = '31e2f75a-cedc-4dd1-9bbf-46975af08f28' and quantity = 1;
update material_requirements set quantity = 60   where id = '18c2a879-5d2d-4309-b318-7c18fb838bab' and quantity = 20;
update material_requirements set quantity = 240  where id = 'cfc7926e-0f6f-451d-a2bc-6e239f4ee264' and quantity = 80;
update material_requirements set quantity = 2    where id = '59c5f9ba-e443-4d01-bd0b-0e6b4235ed30' and quantity = 1;
update material_requirements set quantity = 13   where id = 'f42e5459-fbaf-443d-918a-99b206846561' and quantity = 7;
update material_requirements set quantity = 920  where id = 'e292236e-f5ae-4cbf-9867-8e89c19bf9bb' and quantity = 300;
update material_requirements set quantity = 400  where id = '4a4c8384-7b9d-4322-8a6c-724524392c1a' and quantity = 200;
update material_requirements set quantity = 6    where id = 'b6903012-6896-4b61-9d63-ba02f4e95cf4' and quantity = 3;
update material_requirements set quantity = 400  where id = '72a6d27b-c1d5-4447-b16e-b5afa3b8883f' and quantity = 200;
update material_requirements set quantity = 2    where id = '51f99a51-28ed-4b67-8206-40b618507cdf' and quantity = 1;
update material_requirements set quantity = 12   where id = 'ec3026b5-1736-4607-9d87-fdd926724453' and quantity = 6;
update material_requirements set quantity = 30   where id = '452526ae-6576-4ce0-843a-53cbf8fe8334' and quantity = 20;
update material_requirements set quantity = 3    where id = '3d8e23d5-5c7b-4d4a-8937-11371e80846e' and quantity = 1;
update material_requirements set quantity = 2    where id = '646e4469-7def-4792-b20d-2564f2f20c58' and quantity = 1;
update material_requirements set quantity = 28   where id = '410f370e-b1a7-4273-ab04-e19ed4a01bd3' and quantity = 8;
update material_requirements set quantity = 3    where id = '783b9b61-5ed9-404f-9cd5-d40b18a3acb7' and quantity = 1;
update material_requirements set quantity = 40   where id = 'e268fe7d-3ffd-436b-9698-df789eddd1dc' and quantity = 20;
update material_requirements set quantity = 2    where id = '8d33508c-f6fa-4832-a5d1-68ad5fe0b881' and quantity = 1;
update material_requirements set quantity = 6    where id = 'ed4708ff-2902-4035-a742-cb73cff11fe4' and quantity = 2;
update material_requirements set quantity = 2    where id = '9922bf76-a654-47ab-ac43-cb35b8575ab9' and quantity = 1;

commit;
