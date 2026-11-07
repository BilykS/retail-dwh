select 
md5(s.store_id::text)   as store_key,
s.store_id,
s.store_code,
s.store_name,
c.city_name,
c.region,
s.store_type,
s.opened_at,
s.closed_at
from {{ source('src', 'stores') }} s
join {{ source('src', 'cities') }} c on c.city_id = s.city_id