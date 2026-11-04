-- fact_sales: одна позиція чека
-- Ключі вимірів обчислюються ТІЄЮ САМОЮ формулою, що й у вимірах,
-- тому join'и до них не потрібні взагалі.

with base as (

    select i.order_item_id,

           to_char(o.ordered_at, 'YYYYMMDD')::int        as date_key,
           md5(i.product_id::text)                        as product_key,
           md5(o.store_id::text)                          as store_key,
           md5(coalesce(o.customer_id, -1)::text)         as customer_key,
           md5(o.channel || '|' || o.payment_method || '|' || o.order_type)
                                                          as transaction_type_key,

           extract(hour from o.ordered_at)::int           as hour,
           o.order_number,

           i.quantity,
           (i.quantity * i.unit_price)::numeric(12,2)                          as gross_amount,
           (i.quantity * i.unit_price * i.discount_pct / 100)::numeric(12,2)   as discount_amount,
           (i.quantity * p.unit_cost)::numeric(12,2)                           as cost_amount,
           (i.quantity * i.unit_price - i.quantity * i.unit_price * i.discount_pct / 100)::numeric(12,2)  as net_amount


    from src.order_items i
    join src.orders   o on o.order_id   = i.order_id
    join src.products p on p.product_id = i.product_id
    where o.status <> 'cancelled'

)

select order_item_id,
       date_key,
       product_key,
       store_key,
       customer_key,
       transaction_type_key,
       hour,
       order_number,
       quantity,
       gross_amount,
       discount_amount,
       net_amount,
       cost_amount
from base
