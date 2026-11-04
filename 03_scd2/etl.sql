insert into star.fact_sales (order_item_id, date_key, product_key, store_key, customer_key, transaction_type_key, hour, order_number, quantity, gross_amount, discount_amount, net_amount, cost_amount)
with base as (
    select i.order_item_id,
    d.date_key,
    p.product_key,
    s.store_key,
    c.customer_key,
    t.transaction_type_key,
    extract(hour from o.ordered_at)::int as hour,
    o.order_number,
    i.quantity,
    i.quantity * i.unit_price as gross,
    i.quantity * i.unit_price * i.discount_pct / 100 as discount,
    i.quantity * p.unit_cost                       as cost

    from src.order_items i
    join src.orders o on o.order_id = i.order_id
    join star.dim_date d on d.full_date = o.ordered_at::date
    join star.dim_product p on p.product_id = i.product_id
    join star.dim_store s on s.store_id = o.store_id
    join star.dim_customer c on c.customer_id = coalesce(o.customer_id, -1)
    join star.dim_transaction_type t on t.channel = o.channel
                                    and t.payment_method = o.payment_method
                                    and t.order_type = o.order_type
    where o.status <> 'cancelled' and o.ordered_at::date between p.valid_from and p.valid_to
)
select order_item_id, date_key, product_key, store_key, customer_key,
       transaction_type_key, hour, order_number, quantity,
       gross,
       discount,
       gross - discount,      -- net: тепер можна за іменами
       cost
from base;