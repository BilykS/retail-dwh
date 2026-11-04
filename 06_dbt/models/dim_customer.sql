select 
       md5((-1)::text)      as customer_key,
       -1                   as customer_id,
       'Невідомий покупець' as full_name,
       null::text           as email,
       null::text           as phone,
       null::date           as birth_date,
       'Не вказано'         as gender,
       'Не вказано'         as city,
       'Без картки'         as loyalty_tier

union all

select 
       md5(c.customer_id::text) as customer_key,
       c.customer_id,
       c.full_name,
       c.email,
       c.phone,
       c.birth_date,
       case c.gender
           when 'M' then 'Чоловіча'
           when 'F' then 'Жіноча'
           else 'Не вказано'
       end,
       coalesce(ci.city_name, 'Не вказано'),
       coalesce(c.loyalty_tier, 'Без картки')
from src.customers c
left join src.cities ci on ci.city_id = c.city_id
