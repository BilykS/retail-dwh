-- Перезавантаження факту після побудови SCD2-виміру.
--
-- Два незалежні пошуки за датою:
--   dim_product   -> версія товару, що діяла в день продажу (назва, категорія)
--   cost_history  -> закупівельна ціна, що діяла в день продажу
-- Межі в них різні й не зобов'язані збігатися: назву могли змінити у березні,
-- а ціну постачальник переглянув у липні.

insert into star.fact_sales (order_item_id, date_key, product_key, store_key, customer_key, transaction_type_key, hour, order_number, quantity, gross_amount, discount_amount, net_amount, cost_amount)
with cost_history as (
    -- Історія закупівельних цін. src.products.unit_cost зберігає лише поточне
    -- значення, тож ціну на момент продажу відновлюємо з журналу змін:
    -- це old_value найближчої зміни ПІСЛЯ початку періоду.
    select w.product_id,
           w.valid_from,
           w.valid_to,
           coalesce(
               (select pc.old_value::numeric(12,2)
                from src.product_changes pc
                where pc.product_id = w.product_id
                  and pc.field_name = 'unit_cost'
                  and pc.changed_at::date > w.valid_from
                order by pc.changed_at
                limit 1),
               pr.unit_cost
           ) as unit_cost
    from (
        select product_id,
               valid_from,
               coalesce(
                   lead(valid_from) over (partition by product_id order by valid_from) - 1,
                   date '9999-12-31'
               ) as valid_to
        from (
            select product_id, date '1900-01-01' as valid_from from src.products
            union all
            select product_id, changed_at::date
            from src.product_changes
            where field_name = 'unit_cost'
        ) b
    ) w
    join src.products pr on pr.product_id = w.product_id
),
base as (
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
    i.quantity * ch.unit_cost                      as cost

    from src.order_items i
    join src.orders o on o.order_id = i.order_id
    join star.dim_date d on d.full_date = o.ordered_at::date
    join star.dim_product p on p.product_id = i.product_id
    join star.dim_store s on s.store_id = o.store_id
    join star.dim_customer c on c.customer_id = coalesce(o.customer_id, -1)
    join star.dim_transaction_type t on t.channel = o.channel
                                    and t.payment_method = o.payment_method
                                    and t.order_type = o.order_type
    join cost_history ch on ch.product_id = i.product_id
                        and o.ordered_at::date between ch.valid_from and ch.valid_to
    where o.status <> 'cancelled' and o.ordered_at::date between p.valid_from and p.valid_to
)
select order_item_id, date_key, product_key, store_key, customer_key,
       transaction_type_key, hour, order_number, quantity,
       gross,
       discount,
       gross - discount,      -- net: тепер можна за іменами
       cost
from base;
