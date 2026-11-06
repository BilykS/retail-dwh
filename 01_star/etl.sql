-- 1. чистимо перед завантаженням
truncate star.fact_sales, star.dim_transaction_type, star.dim_store,
         star.dim_product, star.dim_customer, star.dim_date
         restart identity cascade;

insert into star.dim_transaction_type (channel, order_type, payment_method)
select distinct o.channel, o.order_type, o.payment_method
from src.orders o
;

insert into star.dim_store (store_id, store_code, store_name, city_name, region, store_type, opened_at, closed_at)
select s.store_id,
s.store_code,
s.store_name,
c.city_name,
c.region,
s.store_type,
s.opened_at,
s.closed_at
from src.stores s
join src.cities c on c.city_id = s.city_id
;

insert into star.dim_product (product_id, sku, product_name, category_name, category_parent, brand_name, unit_cost)
select p.product_id,
p.sku,
p.product_name,
cat.category_name, 
par.category_name,
b.brand_name,
p.unit_cost
from src.products p
join src.brands b on b.brand_id = p.brand_id
join src.categories cat on cat.category_id = p.category_id
join src.categories par on par.category_id = cat.parent_category_id
;

insert into star.dim_customer (customer_key, customer_id, full_name, email, phone, birth_date, gender, city, loyalty_tier)
values (-1, -1, 'Невідомий покупець', null, null, null, 'Не вказано', 'Місто не вказане', 'Без картки');

insert into star.dim_customer (customer_id, full_name, email, phone, birth_date, gender, city, loyalty_tier)
select c.customer_id,
c.full_name,
c.email,
c.phone,
c.birth_date,
case c.gender
    when 'M' then 'Чоловіча'
    when 'F' then 'Жіноча'
    else 'Не вказано'
end,
coalesce(ci.city_name, 'Місто не вказане'),
coalesce(c.loyalty_tier, 'Без картки')
from  src.customers c
left join src.cities ci on ci.city_id = c.city_id
;

insert into star.dim_date (date_key, full_date, year, quarter, month, month_name, day, day_of_week, day_name, is_weekend)
select to_char(d, 'YYYYMMDD')::int,
       d::date,
       extract(year    from d)::int,
       extract(quarter from d)::int,
       extract(month   from d)::int,
       (array['Січень','Лютий','Березень','Квітень','Травень','Червень',
              'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'])[extract(month from d)::int],
       extract(day     from d)::int,
       extract(isodow  from d)::int,
       (array['Понеділок','Вівторок','Середа','Четвер','П''ятниця','Субота','Неділя'])[extract(isodow from d)::int],
       extract(isodow from d) in (6, 7)
from generate_series(date '2024-01-01', date '2026-12-31', interval '1 day') as d;

insert into star.fact_sales (order_item_id, date_key, product_key, store_key, customer_key, transaction_type_key, hour, order_number, quantity, gross_amount, discount_amount, net_amount, cost_amount)
with cost_history as (
    -- Собівартості немає в рядку замовлення, а src.products.unit_cost зберігає
    -- лише ПОТОЧНУ ціну. Брати її напряму не можна: тоді зміна закупівельної
    -- ціни заднім числом переписала б історичну маржу. Відновлюємо ціну,
    -- що діяла в день продажу, з журналу src.product_changes.
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
    where o.status <> 'cancelled'
)
select order_item_id, date_key, product_key, store_key, customer_key,
       transaction_type_key, hour, order_number, quantity,
       gross,
       discount,
       gross - discount,      -- net: тепер можна за іменами
       cost
from base;
