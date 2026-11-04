select sum(round(oi.quantity * oi.unit_price* (1 - oi.discount_pct / 100), 2)) as revenue_src
from src.orders o
join src.order_items oi on oi.order_id = o.order_id
where o.status <> 'cancelled';

select sum(net_amount) as revenue_star
from star.fact_sales;

select sum(quantity) as quantity_src
from src.orders o
join src.order_items oi on oi.order_id = o.order_id
where o.status <> 'cancelled';

select sum(quantity) as quantity_star
from star.fact_sales;

select count(distinct order_number) as orders_src
from src.orders o
join src.order_items oi on oi.order_id = o.order_id
where o.status <> 'cancelled';

select count(distinct order_number) as orders_star
from star.fact_sales;