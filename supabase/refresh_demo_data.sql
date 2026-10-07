-- ============================================================================
-- ChatBotDemo — ETAPA 3: actualización de datos demo (~70 leads / 30 días)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase DESPUÉS de migration_dashboard.sql.
-- Idempotente: PRIMERO borra solo filas con origen_demo = true y regenera.
-- NUNCA toca leads reales (origen_demo = false).
--
-- Genera volumen realista para que gráficos y tendencias se vean bien:
--  (a) primera respuesta del bot a los 5-20 s del primer mensaje;
--  (b) ~15 leads de noche (20-23:30) o domingo, para fuera-de-horario;
--  (c) variedad de modelos, incluyendo S10 y Taos (demanda SIN stock);
--  (d) sesgo a días recientes (más peso en últimos 7 días).
-- Los textos del bot NO incluyen precios (se leen del stock en vivo).
-- ============================================================================

-- 1. Borrar demo anterior (solo demo) ----------------------------------------
delete from public.messages
where lead_id in (select id from public.leads where origen_demo is true);
delete from public.leads where origen_demo is true;

-- 2. Regenerar ---------------------------------------------------------------
do $$
declare
  i int;
  v_tel text;
  v_nombre text;
  v_modelo text;
  v_temp text;
  v_humano boolean;
  v_estado text;
  v_first timestamptz;
  v_bot1 timestamptz;
  v_cli2 timestamptz;
  v_bot2 timestamptz;
  v_lead_id uuid;
  v_r float;
  v_r2 float;
  v_delay int;
  nombres text[] := array[
    'Martín Herrera','Lucía Fernández','Diego Ramírez','Sofía Gómez',
    'Carlos Paz','Valentina Ruiz','Jorge Medina','Camila Torres',
    'Pablo Sosa','Laura Núñez','Andrés Molina','Florencia Díaz',
    'Santiago Ríos','Valeria Castro','Emilio Vargas','Paula Jiménez',
    'Nicolás Pereyra','Agustina Sosa','Federico Ledesma','Mariana Duarte'
  ];
  modelos text[] := array[
    'Hilux','Corolla Cross','Ranger','Cronos','Polo','Tracker','208','2008',
    'Onix','Kwid','Duster','Frontier','Yaris','Versa','Amarok','S10','Taos'
  ];
  pri1 text[] := array[
    'Hola, ¿tienen {M}?',
    'Buenas, me interesa {M}, ¿sigue disponible?',
    'Hola! Quiero info de {M}',
    'Buen día, consulto por {M}',
    'Hola, ¿qué {M} tienen en stock?'
  ];
  bot1_ok text[] := array[
    'Hola {N}! Soy el asistente virtual de la concesionaria. Te cuento que tenemos {M} disponible. ¿La buscás para uso familiar o trabajo?',
    'Hola {N}! Tenemos {M} disponible en este momento. ¿Querés que te cuente las versiones que hay?'
  ];
  bot1_no text[] := array[
    'Hola {N}! En este momento no tenemos {M} disponible, pero tengo alternativas parecidas en stock. ¿Te cuento cuáles?',
    'Hola {N}! {M} no está disponible ahora, pero te puedo ofrecer opciones similares. ¿Qué uso le darías?'
  ];
  cli2 text[] := array[
    'Dale, pasame más info',
    '¿Toman permuta?',
    '¿Tienen financiación?',
    '¿Puedo ir a verla el sábado?',
    '¿En qué colores viene?'
  ];
  bot2 text[] := array[
    'Dale, un asesor te va a contactar para coordinar. ¿Me confirmás tu nombre?',
    'Te tomo el dato y un asesor te contacta con la info exacta.',
    'Perfecto, ya le aviso a un asesor para que te escriba.'
  ];
  v_msg text;
begin
  for i in 1..70 loop
    v_tel := '549351555' || lpad((200 + i)::text, 4, '0');
    v_r := random();

    -- Temperatura: 25% caliente, 35% tibio, 40% frio
    if v_r < 0.25 then v_temp := 'caliente';
    elsif v_r < 0.60 then v_temp := 'tibio';
    else v_temp := 'frio';
    end if;

    v_modelo := modelos[1 + floor(random() * array_length(modelos, 1))];
    if random() < 0.70 then
      v_nombre := nombres[1 + floor(random() * array_length(nombres, 1))];
    else
      v_nombre := null;
    end if;

    v_r2 := random();
    v_humano := (v_temp = 'caliente' and v_r2 < 0.80)
      or (v_temp = 'tibio' and v_r2 < 0.15)
      or (v_temp = 'frio' and v_r2 < 0.05);
    if v_humano then v_estado := 'derivado';
    elsif random() < 0.70 then v_estado := 'en_conversacion';
    else v_estado := 'nuevo';
    end if;

    -- Fecha: sesgo a reciente (random^1.5 * 30 días)
    v_first := now() - (floor(30 * power(random(), 1.5)) || ' days')::interval;
    -- Hora: 75% horario comercial, 25% noche (20-23:30)
    if random() < 0.25 then
      v_first := date_trunc('day', v_first)
        + (20 + floor(random() * 3) || ' hours')::interval
        + (floor(random() * 30) || ' minutes')::interval;
    else
      v_first := date_trunc('day', v_first)
        + (9 + floor(random() * 9) || ' hours')::interval
        + (floor(random() * 60) || ' minutes')::interval;
    end if;
    -- Cada 8vo lead, moverlo a un domingo de las últimas 4 semanas
    if i % 8 = 0 then
      v_first := date_trunc('week', now())
        - interval '1 day'
        - (((i / 8) % 4) || ' weeks')::interval
        + (10 + floor(random() * 2) || ' hours')::interval;
    end if;

    -- (a) primera respuesta a los 5-20 s
    v_delay := 5 + floor(random() * 16);
    v_bot1 := v_first + (v_delay || ' seconds')::interval;

    insert into public.leads
      (telefono, nombre, auto_interes, presupuesto, permuta, financiacion,
       urgencia, temperatura, requiere_humano, resumen, estado, origen_demo,
       first_message_at, last_customer_message_at, last_bot_reply_at,
       atendido_at, created_at)
    values (
      v_tel,
      v_nombre,
      v_modelo,
      case when random() < 0.50 then 'Hasta USD ' || (20 + floor(random() * 30))::text || '.000' end,
      case when random() < 0.25 then 'Entregaría su usado en permuta' end,
      case when random() < 0.33 then true when random() < 0.5 then false end,
      case when v_temp = 'caliente' then 'Compra este mes' end,
      v_temp,
      v_humano,
      case
        when v_temp = 'caliente' then 'Quiere ' || v_modelo || ' con intención de compra este mes.'
        when v_temp = 'tibio' then 'Interesado en ' || v_modelo || ', compra a mediano plazo.'
        else 'Consulta general por ' || v_modelo || '.'
      end,
      v_estado,
      true,
      v_first,
      v_first,
      v_bot1,
      case when v_humano and random() < 0.50 then v_bot1 + interval '2 hours' end,
      v_first
    )
    returning id into v_lead_id;

    v_msg := replace(pri1[1 + floor(random() * array_length(pri1, 1))], '{M}', v_modelo);
    insert into public.messages (lead_id, rol, texto, wa_message_id, created_at)
    values (v_lead_id, 'cliente', v_msg, 'demo-refresh-' || i || '-c1', v_first);

    if v_modelo in ('S10', 'Taos') then
      v_msg := bot1_no[1 + floor(random() * array_length(bot1_no, 1))];
    else
      v_msg := bot1_ok[1 + floor(random() * array_length(bot1_ok, 1))];
    end if;
    v_msg := replace(replace(v_msg, '{M}', v_modelo), '{N}', coalesce(split_part(v_nombre, ' ', 1), 'gracias por escribirnos'));
    insert into public.messages (lead_id, rol, texto, wa_message_id, created_at)
    values (v_lead_id, 'bot', v_msg, 'demo-refresh-' || i || '-b1', v_bot1);

    -- 60% segundo mensaje del cliente, 40% segunda respuesta del bot
    if random() < 0.60 then
      v_cli2 := v_bot1 + (floor(30 + random() * 60) || ' minutes')::interval;
      v_msg := cli2[1 + floor(random() * array_length(cli2, 1))];
      insert into public.messages (lead_id, rol, texto, wa_message_id, created_at)
      values (v_lead_id, 'cliente', v_msg, 'demo-refresh-' || i || '-c2', v_cli2);
      update public.leads set last_customer_message_at = v_cli2 where id = v_lead_id;

      if random() < 0.65 then
        v_bot2 := v_cli2 + (floor(10 + random() * 50) || ' seconds')::interval;
        v_msg := bot2[1 + floor(random() * array_length(bot2, 1))];
        insert into public.messages (lead_id, rol, texto, wa_message_id, created_at)
        values (v_lead_id, 'bot', v_msg, 'demo-refresh-' || i || '-b2', v_bot2);
        update public.leads set last_bot_reply_at = v_bot2 where id = v_lead_id;
      end if;
    end if;
  end loop;
end;
$$;
