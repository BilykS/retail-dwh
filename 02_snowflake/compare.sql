explain (analyze, buffers)
select category_name, sum(net_amount)
from star.fact_sales f
join star.dim_product p on p.product_key = f.product_key 
group by p.category_name;

explain (analyze, buffers)
select c.category_name, sum(f.net_amount)
from snow.fact_sales f
join snow.dim_product  p on p.product_key  = f.product_key
join snow.dim_category c on c.category_key = p.category_key
group by c.category_name;

explain (analyze, buffers)
select region, sum(net_amount)
from star.fact_sales f
join star.dim_store p on p.store_key = f.store_key
group by p.region;

explain (analyze, buffers)
select region_name, sum(f.net_amount)
from snow.fact_sales f
join snow.dim_store  p on p.store_key  = f.store_key
join snow.dim_city   c on c.city_key   = p.city_key
join snow.dim_region r on r.region_key = c.region_key
group by r.region_name;

explain (analyze, buffers)
select p.product_name, sum(f.net_amount) as revenue
from star.fact_sales f
join star.dim_product p on p.product_key = f.product_key
group by p.product_name
order by revenue desc
limit 20;

explain (analyze, buffers)
select p.product_name, sum(f.net_amount) as revenue
from snow.fact_sales f
join snow.dim_product p on p.product_key = f.product_key
group by p.product_name
order by revenue desc
limit 20;
