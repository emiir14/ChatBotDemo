-- ============================================================================
-- ChatBotDemo — ETAPA 1: seed de stock (20 vehículos)
-- ============================================================================
-- Cómo ejecutarlo: después de schema.sql, pegá todo este archivo en el
-- editor SQL de Supabase y ejecutalo UNA sola vez.
--
-- ATENCIÓN — valores de ejemplo: los precios son aproximados del mercado
-- argentino (Córdoba) a octubre 2026 y sirven SOLO para la demo. Hay que
-- actualizarlos con el stock y los precios reales de cada cliente antes de
-- usar el bot en producción. Los 0km se expresan en USD y los usados de
-- menor valor en ARS, como es habitual en el mercado local.
-- ============================================================================

insert into public.vehicles
  (marca, modelo, version, anio, km, precio, moneda, combustible, transmision, color, estado, es_0km, descripcion)
values
  ('Toyota', 'Hilux', 'DX 2.4 TD 4x2 MT', 2025, 0, 41200, 'USD', 'Diesel', 'Manual', 'Blanco', 'disponible', true, 'Pick-up cabina doble, ideal para trabajo y campo. Garantía oficial Toyota.'),
  ('Toyota', 'Corolla Cross', 'XEI 2.0 HEV e-CVT', 2025, 0, 45900, 'USD', 'Híbrido', 'Automática', 'Gris plata', 'disponible', true, 'SUV híbrida con bajo consumo, la más buscada para familia. Entrega inmediata.'),
  ('Ford', 'Ranger', 'XL 2.0 TD 4x2 MT', 2025, 0, 39800, 'USD', 'Diesel', 'Manual', 'Azul', 'disponible', true, 'Pick-up mediana con gran capacidad de carga. Ideal para trabajo.'),
  ('Volkswagen', 'Amarok', 'Trendline V6 3.0 TDI 4Motion AT', 2024, 18500, 52500, 'USD', 'Diesel', 'Automática', 'Negro', 'disponible', false, 'Único dueño, services oficiales, V6 4x4 tope de gama. Impecable.'),
  ('Volkswagen', 'Polo', 'Track 1.6 MSI MT', 2025, 0, 28500000, 'ARS', 'Nafta', 'Manual', 'Blanco', 'disponible', true, 'Hatch compacto 0km, el más accesible de la marca. Patentamiento bonificado.'),
  ('Fiat', 'Cronos', 'Drive 1.3 CVT', 2025, 0, 27800000, 'ARS', 'Nafta', 'Automática', 'Gris', 'disponible', true, 'El sedán más vendido del país. Caja automática CVT, bajo consumo.'),
  ('Fiat', 'Pulse', 'Impetus 1.0T CVT', 2024, 12000, 31900000, 'ARS', 'Nafta', 'Automática', 'Rojo', 'disponible', false, 'SUV compacta turbo, casi nueva con garantía de fábrica vigente.'),
  ('Peugeot', '208', 'Active 1.6 MT', 2023, 35000, 21900000, 'ARS', 'Nafta', 'Manual', 'Blanco', 'disponible', false, 'Muy buen estado, cubiertas nuevas, todos los services al día.'),
  ('Peugeot', '2008', 'Allure 1.0T CVT', 2025, 0, 29900, 'USD', 'Nafta', 'Automática', 'Azul oscuro', 'disponible', true, 'SUV 0km con motor turbo, pantalla 10 pulgadas y cámara trasera.'),
  ('Chevrolet', 'Tracker', 'Premier 1.2T AT', 2024, 15000, 28500, 'USD', 'Nafta', 'Automática', 'Gris', 'disponible', false, 'Tope de gama, techo solar, tapizado de cuero. Balance de garantía oficial.'),
  ('Chevrolet', 'Onix', 'LT 1.0 MT', 2023, 42000, 18900000, 'ARS', 'Nafta', 'Manual', 'Rojo', 'disponible', false, 'Económico y confiable, ideal primer auto. VTV al día.'),
  ('Renault', 'Kwid', 'Iconic 1.0 MT', 2024, 22000, 16500000, 'ARS', 'Nafta', 'Manual', 'Naranja', 'disponible', false, 'El más económico de mantener. Perfecto para ciudad y trabajar con apps.'),
  ('Renault', 'Duster', 'Intens 1.6 CVT', 2025, 0, 24900, 'USD', 'Nafta', 'Automática', 'Verde', 'disponible', true, 'SUV amplia y robusta 0km, baúl enorme para familia.'),
  ('Citroën', 'C3', 'Feel 1.6 VTi AT', 2024, 18000, 21500000, 'ARS', 'Nafta', 'Automática', 'Blanco', 'disponible', false, 'Automático, cómodo y con buen despeje. Único dueño.'),
  ('Nissan', 'Frontier', 'XE 2.5 TD 4x2 MT', 2023, 55000, 33900, 'USD', 'Diesel', 'Manual', 'Gris oscuro', 'disponible', false, 'Pick-up fabricada en Córdoba, services oficiales, lista para trabajar.'),
  ('Toyota', 'Yaris', 'XS 1.5 CVT', 2025, 0, 23800, 'USD', 'Nafta', 'Automática', 'Blanco', 'disponible', true, 'Hatch 0km con caja CVT, confiabilidad Toyota y bajo consumo.'),
  ('Volkswagen', 'Taos', 'Comfortline 1.4 TSI AT', 2024, 9000, 36500, 'USD', 'Nafta', 'Automática', 'Negro', 'reservado', false, 'SUV mediana casi nueva. Actualmente con seña: consultá lista de espera.'),
  ('Fiat', 'Toro', 'Freedom 2.0 TD 4x4 AT', 2022, 68000, 29800, 'USD', 'Diesel', 'Automática', 'Bordó', 'disponible', false, 'Pick-up compacta 4x4 automática, muy cuidada, lista para transferir.'),
  ('Chevrolet', 'S10', 'Z71 2.8 TD 4x4 AT', 2024, 25000, 46900, 'USD', 'Diesel', 'Automática', 'Blanco', 'vendido', false, 'Unidad ya vendida: se deja de muestra para comparar con Hilux y Ranger.'),
  ('Nissan', 'Versa', 'Advance 1.6 CVT', 2025, 0, 22900, 'USD', 'Nafta', 'Automática', 'Gris plata', 'disponible', true, 'Sedán 0km amplio y económico, ideal para remis o familia.');
