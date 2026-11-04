select 
    md5(warehouse_id::text) as warehouse_key,
    warehouse_id           as warehouse_id,
    wh_code                as warehouse_code,
    wh_name                as warehouse_name,
    city                as warehouse_city,
    wh_type                as warehouse_type,
    opened_at           as warehouse_opened_at
from wms.warehouses