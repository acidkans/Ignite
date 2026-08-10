-- ROLLBACK BACKFILL 1 — cofa 18 cen wpisanych 2026-08-10 na wezle CMC- Serwerownia ZDC1-K9_2026.
-- Wszystkie te wiersze mialy przed backfillem budgetedPriceNetto = NULL, wiec cofniecie = powrot do NULL.
-- UWAGA: jesli po backfillu ktos edytowal ktoras z tych cen recznie, rollback skasuje takze te edycje.
-- Warunek `= <cena z backfillu>` chroni przed tym — wiersz zmieniony recznie zostanie pominiety.

begin;

update material_requirements set "budgetedPriceNetto" = null where id = '3fa1b1dd-4b82-4e6b-9fb2-19713b5788a6' and "budgetedPriceNetto" = 9.2;
update material_requirements set "budgetedPriceNetto" = null where id = 'e1353168-2e3c-4283-b57f-75bf198c5f40' and "budgetedPriceNetto" = 700;
update material_requirements set "budgetedPriceNetto" = null where id = '8ca189a9-9707-4492-92ab-810f3b546b03' and "budgetedPriceNetto" = 1.8;
update material_requirements set "budgetedPriceNetto" = null where id = '1126bdfd-8af1-422c-9648-c183def90e84' and "budgetedPriceNetto" = 5000;
update material_requirements set "budgetedPriceNetto" = null where id = '15f96f3c-6a68-4a17-a2a1-ac2616c7046a' and "budgetedPriceNetto" = 5;
update material_requirements set "budgetedPriceNetto" = null where id = '16cfaf61-555c-4031-b939-09cdb5350e41' and "budgetedPriceNetto" = 200;
update material_requirements set "budgetedPriceNetto" = null where id = 'b035c2fc-1afe-4227-9b67-65e4cef97136' and "budgetedPriceNetto" = 10;
update material_requirements set "budgetedPriceNetto" = null where id = '1547774e-078d-4220-a341-60bddf5af855' and "budgetedPriceNetto" = 7500;
update material_requirements set "budgetedPriceNetto" = null where id = 'b6903012-6896-4b61-9d63-ba02f4e95cf4' and "budgetedPriceNetto" = 9;
update material_requirements set "budgetedPriceNetto" = null where id = 'ec3026b5-1736-4607-9d87-fdd926724453' and "budgetedPriceNetto" = 100;
update material_requirements set "budgetedPriceNetto" = null where id = '59c5f9ba-e443-4d01-bd0b-0e6b4235ed30' and "budgetedPriceNetto" = 400;
update material_requirements set "budgetedPriceNetto" = null where id = 'f42e5459-fbaf-443d-918a-99b206846561' and "budgetedPriceNetto" = 65;
update material_requirements set "budgetedPriceNetto" = null where id = '410f370e-b1a7-4273-ab04-e19ed4a01bd3' and "budgetedPriceNetto" = 50;
update material_requirements set "budgetedPriceNetto" = null where id = 'bedf9dc4-4a9b-4f67-9142-0129c4ef18fc' and "budgetedPriceNetto" = 1000;
update material_requirements set "budgetedPriceNetto" = null where id = 'ce12bbeb-d060-4d4c-b678-4dacc2775bdc' and "budgetedPriceNetto" = 1;
update material_requirements set "budgetedPriceNetto" = null where id = '18c2a879-5d2d-4309-b318-7c18fb838bab' and "budgetedPriceNetto" = 10;
update material_requirements set "budgetedPriceNetto" = null where id = 'a4b1eaff-bc45-4050-a253-1cebba7af3ef' and "budgetedPriceNetto" = 1000;
update material_requirements set "budgetedPriceNetto" = null where id = '72a6d27b-c1d5-4447-b16e-b5afa3b8883f' and "budgetedPriceNetto" = 5;

commit;
