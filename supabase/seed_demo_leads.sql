-- ============================================================================
-- ChatBotDemo — ETAPA 1: seed de leads demo (12 leads ficticios)
-- ============================================================================
-- Cómo ejecutarlo: después de seed_vehicles.sql, pegá todo este archivo en
-- el editor SQL de Supabase y ejecutalo UNA sola vez.
--
-- Son datos 100% FICTICIOS (teléfonos 351 555-xxxx inexistentes) con
-- origen_demo = true, para que el panel no se vea vacío en la reunión.
-- Temperaturas variadas (4 calientes, 4 tibios, 4 fríos) y fechas repartidas
-- en los últimos 7 días. Es idempotente (ON CONFLICT DO NOTHING).
--
-- Para resetear la demo (volver a este estado), ver ETAPA 4:
--   delete from public.messages where lead_id in
--     (select id from public.leads where origen_demo = false);
--   delete from public.leads where origen_demo = false;
--   delete from public.processed_events;
-- y si querés re-sembrar estos demo, borrá primero:
--   delete from public.messages where lead_id in
--     (select id from public.leads where origen_demo = true);
--   delete from public.leads where origen_demo = true;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 12 leads ficticios
-- ----------------------------------------------------------------------------
insert into public.leads
  (id, telefono, nombre, auto_interes, presupuesto, permuta, financiacion, urgencia, temperatura, requiere_humano, resumen, estado, origen_demo, first_message_at, last_customer_message_at, last_bot_reply_at, created_at)
values
  ('a1111111-1111-1111-1111-111111111111', '5493515550101', 'Martín Herrera', 'Toyota Hilux DX 2.4', 'Hasta USD 45.000', null, false, 'Quiere comprar este mes', 'caliente', true, 'Busca Hilux para el campo, tiene presupuesto y quiere ir a verla esta semana.', 'derivado', true, now() - interval '3 hours', now() - interval '2 hours', now() - interval '2 hours' + interval '1 minute', now() - interval '3 hours'),
  ('a2222222-2222-2222-2222-222222222222', '5493515550102', 'Lucía Fernández', 'Toyota Corolla Cross XEI HEV', 'USD 40.000–50.000, puede financiar saldo', null, true, 'Compra en menos de 30 días', 'caliente', true, 'Quiere la Corolla Cross híbrida para la familia y pidió prueba de manejo.', 'derivado', true, now() - interval '6 hours', now() - interval '5 hours', now() - interval '5 hours' + interval '1 minute', now() - interval '6 hours'),
  ('a3333333-3333-3333-3333-333333333333', '5493515550103', 'Diego Ramírez', 'Ford Ranger', 'Alrededor de USD 40.000', 'Entregaría un Gol 2019', null, 'Compra en unos 60 días', 'tibio', false, 'Interesado en Ranger para trabajo, tiene un Gol para permutar, compra a mediano plazo.', 'en_conversacion', true, now() - interval '1 day', now() - interval '20 hours', now() - interval '20 hours' + interval '1 minute', now() - interval '1 day'),
  ('a4444444-4444-4444-4444-444444444444', '5493515550104', 'Sofía Gómez', 'Fiat Cronos Drive 1.3 CVT', 'Hasta $30.000.000, necesita financiación', null, true, 'Quiere reservar esta semana', 'caliente', true, 'Quiere el Cronos 0km con financiación y pidió que la llame un asesor para reservar.', 'derivado', true, now() - interval '1 day', now() - interval '22 hours', now() - interval '22 hours' + interval '1 minute', now() - interval '1 day'),
  ('a5555555-5555-5555-5555-555555555555', '5493515550105', null, null, null, null, null, null, 'frio', false, 'Saludó y preguntó precios en general, sin modelo definido.', 'nuevo', true, now() - interval '2 days', now() - interval '2 days' + interval '10 minutes', now() - interval '2 days' + interval '11 minutes', now() - interval '2 days'),
  ('a6666666-6666-6666-6666-666666666666', '5493515550106', 'Valentina Ruiz', 'Peugeot 2008 Allure', 'Hasta USD 32.000', 'Entregaría un 208 2021', null, 'Compra en 45 días aprox.', 'tibio', false, 'Le gusta la 2008 0km y tiene un 208 para entregar en parte de pago.', 'en_conversacion', true, now() - interval '3 days', now() - interval '3 days' + interval '1 hour', now() - interval '3 days' + interval '61 minutes', now() - interval '3 days'),
  ('a7777777-7777-7777-7777-777777777777', '5493515550107', null, 'Volkswagen Amarok', null, null, null, null, 'frio', false, 'Preguntó solo el precio de la Amarok, sin más datos.', 'nuevo', true, now() - interval '3 days', now() - interval '3 days' + interval '5 minutes', now() - interval '3 days' + interval '6 minutes', now() - interval '3 days'),
  ('a8888888-8888-8888-8888-888888888888', '5493515550108', 'Camila Torres', 'Chevrolet Tracker Premier', 'USD 28.000–30.000', null, false, 'Quiere ir el sábado a verla', 'caliente', true, 'Va a ir el sábado con el marido a ver la Tracker, pidió dirección y horario.', 'derivado', true, now() - interval '4 days', now() - interval '4 days' + interval '40 minutes', now() - interval '4 days' + interval '41 minutes', now() - interval '4 days'),
  ('a9999999-9999-9999-9999-999999999999', '5493515550109', 'Pablo Sosa', 'Nissan Frontier XE', 'Necesita financiar gran parte', null, true, 'Compra en 60-90 días', 'tibio', false, 'Busca Frontier para trabajar, necesita financiación, todavía está comparando.', 'en_conversacion', true, now() - interval '5 days', now() - interval '5 days' + interval '2 hours', now() - interval '5 days' + interval '121 minutes', now() - interval '5 days'),
  ('a1010101-0101-0101-0101-010101010101', '5493515550110', null, null, null, null, null, null, 'frio', false, 'Duda entre Kwid y Onix por precio, recién empieza a averiguar.', 'nuevo', true, now() - interval '6 days', now() - interval '6 days' + interval '15 minutes', now() - interval '6 days' + interval '16 minutes', now() - interval '6 days'),
  ('a1111112-1111-1111-1111-111111111112', '5493515550111', 'Andrés Molina', 'Renault Duster Intens', 'USD 25.000 más permuta', 'Logan 2020', null, 'Compra en unos 45 días', 'tibio', false, 'Le interesa la Duster 0km y entregaría su Logan en permuta.', 'en_conversacion', true, now() - interval '6 days', now() - interval '6 days' + interval '50 minutes', now() - interval '6 days' + interval '51 minutes', now() - interval '6 days'),
  ('a1212121-2121-2121-2121-212121212121', '5493515550112', null, null, null, null, null, null, 'frio', false, 'Preguntó dirección y horario de atención, sin interés en modelo puntual.', 'nuevo', true, now() - interval '7 days', now() - interval '7 days' + interval '8 minutes', now() - interval '7 days' + interval '9 minutes', now() - interval '7 days')
on conflict (telefono) do nothing;

-- ----------------------------------------------------------------------------
-- Conversaciones cortas (2 a 4 mensajes por lead)
-- ----------------------------------------------------------------------------
insert into public.messages (lead_id, rol, texto, wa_message_id, created_at)
values
  -- 1. Martín Herrera (caliente, Hilux)
  ('a1111111-1111-1111-1111-111111111111', 'cliente', 'Hola! Me interesa la Hilux para el campo', 'demo-wamid-0101-c1', now() - interval '3 hours'),
  ('a1111111-1111-1111-1111-111111111111', 'bot', 'Hola Martín! Soy el asistente virtual de la concesionaria. La Hilux DX 2.4 la tenemos disponible 0km en USD 41.200. ¿La querés para trabajo o uso mixto?', 'demo-wamid-0101-b1', now() - interval '3 hours' + interval '1 minute'),
  ('a1111111-1111-1111-1111-111111111111', 'cliente', 'Para trabajo en el campo. Tengo hasta 45 mil dólares. Puedo ir esta semana a verla?', 'demo-wamid-0101-c2', now() - interval '2 hours'),
  ('a1111111-1111-1111-1111-111111111111', 'bot', 'Dale, con ese presupuesto te alcanza bien. Te paso con un asesor para coordinar la visita esta semana, ¿te parece?', 'demo-wamid-0101-b2', now() - interval '2 hours' + interval '1 minute'),
  -- 2. Lucía Fernández (caliente, Corolla Cross)
  ('a2222222-2222-2222-2222-222222222222', 'cliente', 'Hola, quiero info de la Corolla Cross híbrida', 'demo-wamid-0102-c1', now() - interval '6 hours'),
  ('a2222222-2222-2222-2222-222222222222', 'bot', 'Hola Lucía! La Corolla Cross XEI híbrida 0km está disponible en USD 45.900. Es ideal para familia por el bajo consumo. ¿La usarían todos los días?', 'demo-wamid-0102-b1', now() - interval '6 hours' + interval '1 minute'),
  ('a2222222-2222-2222-2222-222222222222', 'cliente', 'Sí, para llevar a los chicos al cole. El saldo lo financio. Se puede probar?', 'demo-wamid-0102-c2', now() - interval '5 hours'),
  ('a2222222-2222-2222-2222-222222222222', 'bot', 'Se puede probar, dale. Un asesor te va a contactar para coordinar la prueba de manejo y contarte las opciones de financiación.', 'demo-wamid-0102-b2', now() - interval '5 hours' + interval '1 minute'),
  -- 3. Diego Ramírez (tibio, Ranger)
  ('a3333333-3333-3333-3333-333333333333', 'cliente', 'Buenas, tenés Ranger? Tengo un Gol 2019 para entregar', 'demo-wamid-0103-c1', now() - interval '1 day'),
  ('a3333333-3333-3333-3333-333333333333', 'bot', 'Hola Diego! Sí, tenemos la Ranger XL 2.0 0km en USD 39.800 y tomamos permutas. ¿En qué la usarías y cuándo pensás comprar?', 'demo-wamid-0103-b1', now() - interval '1 day' + interval '1 minute'),
  ('a3333333-3333-3333-3333-333333333333', 'cliente', 'Para laburar, pero recién en 2 meses. Después me comunico', 'demo-wamid-0103-c2', now() - interval '20 hours'),
  -- 4. Sofía Gómez (caliente, Cronos)
  ('a4444444-4444-4444-4444-444444444444', 'cliente', 'Hola! Precio del Cronos automático?', 'demo-wamid-0104-c1', now() - interval '1 day'),
  ('a4444444-4444-4444-4444-444444444444', 'bot', 'Hola Sofía! El Cronos Drive 1.3 CVT 0km está en $28.500.000. ¿Lo necesitás con financiación?', 'demo-wamid-0104-b1', now() - interval '1 day' + interval '1 minute'),
  ('a4444444-4444-4444-4444-444444444444', 'cliente', 'Sí, financio. Lo quiero reservar esta semana, me llama un asesor?', 'demo-wamid-0104-c2', now() - interval '22 hours'),
  ('a4444444-4444-4444-4444-444444444444', 'bot', 'Dale, ya le aviso a un asesor para que te llame y coordinen la reserva. Gracias por escribirnos!', 'demo-wamid-0104-b2', now() - interval '22 hours' + interval '1 minute'),
  -- 5. Frío: consulta general
  ('a5555555-5555-5555-5555-555555555555', 'cliente', 'Hola, qué autos tienen?', 'demo-wamid-0105-c1', now() - interval '2 days'),
  ('a5555555-5555-5555-5555-555555555555', 'bot', 'Hola! Soy el asistente virtual de la concesionaria. Tenemos 0km y usados: Hilux, Cronos, Polo, Tracker y más. ¿Qué tipo de auto buscás?', 'demo-wamid-0105-b1', now() - interval '2 days' + interval '1 minute'),
  ('a5555555-5555-5555-5555-555555555555', 'cliente', 'Todavía no sé, pasaba a chusmear precios', 'demo-wamid-0105-c2', now() - interval '2 days' + interval '10 minutes'),
  -- 6. Valentina Ruiz (tibio, 2008 + permuta)
  ('a6666666-6666-6666-6666-666666666666', 'cliente', 'Hola! Me gusta la 2008, tengo un 208 2021 para entregar', 'demo-wamid-0106-c1', now() - interval '3 days'),
  ('a6666666-6666-6666-6666-666666666666', 'bot', 'Hola Valentina! La 2008 Allure 0km está en USD 29.900 y sí tomamos tu 208 en parte de pago. ¿Cuándo pensás cambiarlo?', 'demo-wamid-0106-b1', now() - interval '3 days' + interval '1 minute'),
  ('a6666666-6666-6666-6666-666666666666', 'cliente', 'En un mes y medio más o menos', 'demo-wamid-0106-c2', now() - interval '3 days' + interval '1 hour'),
  -- 7. Frío: solo precio Amarok
  ('a7777777-7777-7777-7777-777777777777', 'cliente', 'Cuánto sale la Amarok?', 'demo-wamid-0107-c1', now() - interval '3 days'),
  ('a7777777-7777-7777-7777-777777777777', 'bot', 'Hola! La Amarok Trendline V6 2024 con 18.500 km está en USD 52.500. ¿Te interesa 4x4 para trabajo o recreación?', 'demo-wamid-0107-b1', now() - interval '3 days' + interval '1 minute'),
  ('a7777777-7777-7777-7777-777777777777', 'cliente', 'Ok gracias, era solo para saber', 'demo-wamid-0107-c2', now() - interval '3 days' + interval '5 minutes'),
  -- 8. Camila Torres (caliente, Tracker sábado)
  ('a8888888-8888-8888-8888-888888888888', 'cliente', 'Hola, tienen la Tracker Premier?', 'demo-wamid-0108-c1', now() - interval '4 days'),
  ('a8888888-8888-8888-8888-888888888888', 'bot', 'Hola Camila! Sí, la Tracker Premier 2024 con 15.000 km está disponible en USD 28.500. ¿La buscás para familia?', 'demo-wamid-0108-b1', now() - interval '4 days' + interval '1 minute'),
  ('a8888888-8888-8888-8888-888888888888', 'cliente', 'Sí! El sábado vamos con mi marido a verla. Me pasás dirección y horario?', 'demo-wamid-0108-c2', now() - interval '4 days' + interval '40 minutes'),
  ('a8888888-8888-8888-8888-888888888888', 'bot', 'Dale, te espera un asesor el sábado. Te paso la dirección y el horario por acá y queda avisado el equipo.', 'demo-wamid-0108-b2', now() - interval '4 days' + interval '41 minutes'),
  -- 9. Pablo Sosa (tibio, Frontier financiación)
  ('a9999999-9999-9999-9999-999999999999', 'cliente', 'Hola, la Frontier qué vale? Necesito financiar', 'demo-wamid-0109-c1', now() - interval '5 days'),
  ('a9999999-9999-9999-9999-999999999999', 'bot', 'Hola Pablo! La Frontier XE 2023 está en USD 33.900 y tenemos opciones de financiación. ¿La necesitás para trabajar?', 'demo-wamid-0109-b1', now() - interval '5 days' + interval '1 minute'),
  ('a9999999-9999-9999-9999-999999999999', 'cliente', 'Sí para laburar, pero compro en 2 o 3 meses. Estoy comparando', 'demo-wamid-0109-c2', now() - interval '5 days' + interval '2 hours'),
  -- 10. Frío: Kwid vs Onix
  ('a1010101-0101-0101-0101-010101010101', 'cliente', 'Hola! Kwid o Onix, cuál más barato?', 'demo-wamid-0110-c1', now() - interval '6 days'),
  ('a1010101-0101-0101-0101-010101010101', 'bot', 'Hola! El Kwid 2024 está en $16.500.000 y el Onix LT 2023 en $18.900.000. Ambos son económicos. ¿Qué uso le darías?', 'demo-wamid-0110-b1', now() - interval '6 days' + interval '1 minute'),
  ('a1010101-0101-0101-0101-010101010101', 'cliente', 'Solo para moverme en la ciudad, después veo', 'demo-wamid-0110-c2', now() - interval '6 days' + interval '15 minutes'),
  -- 11. Andrés Molina (tibio, Duster + Logan permuta)
  ('a1111112-1111-1111-1111-111111111112', 'cliente', 'Buenas! La Duster nueva qué precio tiene? Tengo un Logan 2020', 'demo-wamid-0111-c1', now() - interval '6 days'),
  ('a1111112-1111-1111-1111-111111111112', 'bot', 'Hola Andrés! La Duster Intens 0km está en USD 24.900 y tomamos tu Logan en permuta. ¿Para cuándo la pensás?', 'demo-wamid-0111-b1', now() - interval '6 days' + interval '1 minute'),
  ('a1111112-1111-1111-1111-111111111112', 'cliente', 'En un mes y medio calculo', 'demo-wamid-0111-c2', now() - interval '6 days' + interval '50 minutes'),
  -- 12. Frío: dirección y horario
  ('a1212121-2121-2121-2121-212121212121', 'cliente', 'Hola, dónde están y hasta qué hora abren?', 'demo-wamid-0112-c1', now() - interval '7 days'),
  ('a1212121-2121-2121-2121-212121212121', 'bot', 'Hola! Te paso la dirección y nuestros horarios de atención. ¿Hay algún auto que te interese conocer?', 'demo-wamid-0112-b1', now() - interval '7 days' + interval '1 minute'),
  ('a1212121-2121-2121-2121-212121212121', 'cliente', 'Por ahora no, gracias!', 'demo-wamid-0112-c2', now() - interval '7 days' + interval '8 minutes')
on conflict (wa_message_id) do nothing;
