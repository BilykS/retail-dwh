with base as (
    select
        to_char(sd.snapshot_date, 'YYYYMMDD')::int as date_key,
        md5(sd.warehouse_id::text) as warehouse_key,
        md5(a.article_id::text) as article_key,
        md5(coalesce(p.product_id, -1)::text) as product_key,
        sd.qty_on_hand as qty_on_hand,
        sd.qty_reserved as qty_reserved,
        sd.qty_in_transit as qty_in_transit,
        sd.qty_on_hand - sd.qty_reserved as qty_available
    from wms.stock_daily sd
    join wms.articles a on a.article_id = sd.article_id
    left join src.products p on p.sku = a.retail_sku

)

select
    date_key,        
    warehouse_key,   
    article_key,     
    product_key,     
    qty_on_hand,
    qty_reserved,
    qty_in_transit,
    qty_available   
from base
