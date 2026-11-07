select
       md5((-1)::text) as product_key,
       -1            as product_id,
       'Не товар роздрібу'  as sku,
       'Не товар роздрібу'  as product_name,
       'Не товар роздрібу'  as category_name,
       'Не товар роздрібу'  as category_parent,
       'Не товар роздрібу'  as brand_name,
       0             as unit_cost

union all

select 
       md5(p.product_id::text) as product_key,
       p.product_id        as product_id,
       p.sku               as sku,
       p.product_name      as product_name,
       cat.category_name   as category_name,
       par.category_name   as category_parent,
       b.brand_name        as brand_name,
       p.unit_cost         as unit_cost
from {{ source('src', 'products') }} p
join {{ source('src', 'brands') }} b on b.brand_id = p.brand_id
join {{ source('src', 'categories') }} cat on cat.category_id = p.category_id
join {{ source('src', 'categories') }} par on par.category_id = cat.parent_category_id
