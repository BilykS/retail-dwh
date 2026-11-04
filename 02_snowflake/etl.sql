truncate snow.fact_sales,
    snow.dim_transaction_type,
    snow.dim_date,
    snow.dim_region,
    snow.dim_store,
    snow.dim_product,
    snow.dim_customer,
    snow.dim_category_group,
    snow.dim_brand,
    snow.dim_city,
    snow.dim_category
    restart identity cascade;

insert into snow.dim_region (region_key, region_name)
values (-1, 'Не вказано');   

insert into snow.dim_region (region_name)
select distinct region from src.cities;

insert into snow.dim_transaction_type overriding system value
select * from star.dim_transaction_type;

insert into snow.dim_date select * from star.dim_date;

insert into snow.dim_category_group (category_group_id, category_group_name)
select category_id, category_name
from src.categories
where parent_category_id is null;

insert into snow.dim_brand (brand_id, brand_name, country)
select brand_id, brand_name, country
from src.brands;

insert into snow.dim_city (city_key, city_id, city_name, region_key)
values (-1, -1, 'Не вказано', -1);

insert into snow.dim_city (city_id, city_name, region_key)
select c.city_id, c.city_name, r.region_key
from src.cities c
join snow.dim_region r on c.region = r.region_name;

insert into snow.dim_category (category_id, category_name, category_group_key)
select c.category_id, c.category_name, gc.category_group_key
from src.categories c
join snow.dim_category_group gc on gc.category_group_id = c.parent_category_id
where parent_category_id is not null;

insert into snow.dim_product (product_id, sku, product_name, category_key, brand_key, unit_cost)
select p.product_id,
p.sku,
p.product_name,
c.category_key,
b.brand_key,
p.unit_cost
from src.products p
join snow.dim_category c on c.category_id = p.category_id
join snow.dim_brand b on b.brand_id = p.brand_id;

insert into snow.dim_customer (customer_key, customer_id, full_name, email, phone, birth_date, gender, city_key, loyalty_tier, main_shopping_city_key)
values (-1, -1, 'Невідомий покупець', null, null, null, 'Не вказано', -1, 'Без картки', null);

insert into snow.dim_customer (customer_id, full_name, email, phone, birth_date, gender, city_key, loyalty_tier, main_shopping_city_key)
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
    ci.city_key,
    coalesce(c.loyalty_tier, 'Без картки'),
    null
from src.customers c
join snow.dim_city ci on ci.city_id = coalesce(c.city_id, -1);

insert into snow.dim_store (store_id, store_code, store_name, city_key, store_type, opened_at, closed_at)
select s.store_id,
s.store_code,
s.store_name,
c.city_key,
s.store_type,
s.opened_at,
s.closed_at
from src.stores s
join snow.dim_city c on c.city_id = s.city_id;

insert into snow.fact_sales (order_item_id, date_key, product_key, store_key, customer_key, transaction_type_key, hour, order_number, quantity, gross_amount, discount_amount, net_amount, cost_amount)
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
    join snow.dim_date d on d.full_date = o.ordered_at::date
    join snow.dim_product p on p.product_id = i.product_id
    join snow.dim_store s on s.store_id = o.store_id
    join snow.dim_customer c on c.customer_id = coalesce(o.customer_id, -1)
    join snow.dim_transaction_type t on t.channel = o.channel
                                    and t.payment_method = o.payment_method
                                    and t.order_type = o.order_type
    where o.status <> 'cancelled'
)
select order_item_id, date_key, product_key, store_key, customer_key,
       transaction_type_key, hour, order_number, quantity,
       gross,
       discount,
       gross - discount,      -- net: тепер можна за іменами
       cost
from base;