select sum(round(oi.quantity * oi.unit_price* (1 - oi.discount_pct / 100), 2)) as revenue_src
from src.orders o
join src.order_items oi on oi.order_id = o.order_id
where o.status <> 'cancelled';

select sum(net_amount) as revenue_snow
from snow.fact_sales;

select sum(quantity) as quantity_src
from src.orders o
join src.order_items oi on oi.order_id = o.order_id
where o.status <> 'cancelled';

select sum(quantity) as quantity_snow
from snow.fact_sales;

select count(distinct order_number) as orders_src
from src.orders o
join src.order_items oi on oi.order_id = o.order_id
where o.status <> 'cancelled';

select count(distinct order_number) as orders_snow
from snow.fact_sales;

with s as (
    select category_name, sum(net_amount) as revenue
    from star.fact_sales f
    join star.dim_product p on p.product_key = f.product_key 
    group by category_name
    ),
     n as (
        select category_name, sum(net_amount) as revenue
        from snow.fact_sales f
        join snow.dim_product p on p.product_key = f.product_key
        join snow.dim_category c on c.category_key = p.category_key 
        group by c.category_name
        )
select s.category_name, s.revenue as star, n.revenue as snow, s.revenue - n.revenue as diff
from s join n using (category_name)
order by diff desc;
