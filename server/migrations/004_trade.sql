-- Existing shops already mix plumbing and well parts, so they default to Both.
-- Parts keep their prices. Unknown names stay "both" and remain available.
ALTER TABLE shops ADD COLUMN trade text;
UPDATE shops SET trade = 'both' WHERE trade IS NULL;

ALTER TABLE parts ADD COLUMN trade text NOT NULL DEFAULT 'both';

UPDATE parts SET trade = 'plumbing' WHERE name IN (
  'Poly pipe 1 in per ft',
  'PEX pipe 3/4 in per ft',
  'Copper pipe 3/4 in per ft',
  'Boiler drain',
  'Shark bite 3/4 in',
  'Ball valve shutoff 3/4 in',
  'Angle stop shutoff',
  'Supply line faucet',
  'Supply line toilet',
  'Kitchen faucet',
  'Bathroom faucet',
  'Toilet fill valve',
  'Toilet flapper',
  'Wax ring',
  'Water heater element',
  'Water heater thermostat',
  'Anode rod',
  'T and P valve',
  'Thermocouple',
  'Gas water heater 40 gal',
  'Expansion tank',
  'P trap 1 1/2 in'
);

UPDATE parts SET trade = 'well' WHERE name IN (
  'Pressure tank 20 gal',
  'Pressure tank 44 gal',
  'Pressure tank 86 gal',
  'Pressure switch 30/50',
  'Pressure switch 40/60',
  'Submersible pump 1/2 HP',
  'Submersible pump 3/4 HP',
  'Submersible pump 1 HP',
  'Pump control box',
  'Pitless adapter 1 in',
  'Well cap 6 in',
  'Well seal 6 in',
  'Torque arrestor',
  'Submersible wire 12/2 per ft',
  'Drop pipe 1 in per ft',
  'Safety rope per ft',
  'Splice kit',
  'Brass tank tee',
  'Sediment filter housing',
  'Sediment filter cartridge',
  'Carbon filter cartridge',
  'Pump pull and set',
  'Troubleshooting'
);

UPDATE parts SET trade = 'both' WHERE name IN (
  'Pressure gauge',
  'Check valve 1 in',
  'Relief valve 100 psi',
  'Fittings misc',
  'Service call'
);

INSERT INTO parts (shop_id, name, price, trade)
SELECT id, 'Well seal 6 in', 42, 'well' FROM shops
WHERE NOT EXISTS (SELECT 1 FROM parts p WHERE p.shop_id = id AND p.name = 'Well seal 6 in');
INSERT INTO parts (shop_id, name, price, trade)
SELECT id, 'Drop pipe 1 in per ft', 1.35, 'well' FROM shops
WHERE NOT EXISTS (SELECT 1 FROM parts p WHERE p.shop_id = id AND p.name = 'Drop pipe 1 in per ft');
INSERT INTO parts (shop_id, name, price, trade)
SELECT id, 'Safety rope per ft', 0.45, 'well' FROM shops
WHERE NOT EXISTS (SELECT 1 FROM parts p WHERE p.shop_id = id AND p.name = 'Safety rope per ft');
INSERT INTO parts (shop_id, name, price, trade)
SELECT id, 'Sediment filter cartridge', 14, 'well' FROM shops
WHERE NOT EXISTS (SELECT 1 FROM parts p WHERE p.shop_id = id AND p.name = 'Sediment filter cartridge');
INSERT INTO parts (shop_id, name, price, trade)
SELECT id, 'Carbon filter cartridge', 32, 'well' FROM shops
WHERE NOT EXISTS (SELECT 1 FROM parts p WHERE p.shop_id = id AND p.name = 'Carbon filter cartridge');
INSERT INTO parts (shop_id, name, price, trade)
SELECT id, 'Pump pull and set', 450, 'well' FROM shops
WHERE NOT EXISTS (SELECT 1 FROM parts p WHERE p.shop_id = id AND p.name = 'Pump pull and set');
INSERT INTO parts (shop_id, name, price, trade)
SELECT id, 'Troubleshooting', 125, 'well' FROM shops
WHERE NOT EXISTS (SELECT 1 FROM parts p WHERE p.shop_id = id AND p.name = 'Troubleshooting');
INSERT INTO parts (shop_id, name, price, trade)
SELECT id, 'Service call', 95, 'both' FROM shops
WHERE NOT EXISTS (SELECT 1 FROM parts p WHERE p.shop_id = id AND p.name = 'Service call');
