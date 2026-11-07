select 
    md5(article_id::text) as article_key,
    article_id           as article_id,
    article_code         as article_code,
    article_name         as article_name,
    retail_sku           as article_retail_sku,
    unit                as article_unit,
    is_active           as article_is_active
from {{ source('wms', 'articles') }}