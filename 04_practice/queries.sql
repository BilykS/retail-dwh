SELECT
 sum(net_amount) as amount
FROM fact_sales;

SELECT
 dd.year,
 sum(net_amount) as amount
FROM fact_sales fs
join dim_date dd on fs.date_key = dd.date_key
GROUP BY dd.year
ORDER BY amount DESC;

SELECT
 dd.month,
 sum(net_amount) as amount
FROM fact_sales fs
join dim_date dd on fs.date_key = dd.date_key
WHERE dd.year = 2025
GROUP BY dd.month
ORDER BY amount DESC;

SELECT
 p.product_id,
 max(p.product_name) filter (where p.is_current) as product_name,
 sum(fs.net_amount) as amount
FROM fact_sales fs
join dim_product p on fs.product_key = p.product_key 
GROUP BY p.product_id, p.product_name
ORDER BY amount DESC
limit 10;

SELECT
 p.category_name,
 sum(fs.net_amount) as amount
FROM fact_sales fs
join dim_product p on fs.product_key = p.product_key 
GROUP BY p.category_name
ORDER BY amount DESC;

SELECT
 s.store_name,
 count(distinct fs.order_number) as orders_count
FROM fact_sales fs
join dim_store s on fs.store_key= s.store_key
GROUP BY s.store_name
ORDER BY orders_count DESC;

SELECT
 s.store_name,
 round(sum(fs.net_amount) / count(distinct fs.order_number), 2) as avg_sum
FROM fact_sales fs
join dim_store s on fs.store_key= s.store_key
GROUP BY s.store_name
ORDER BY avg_sum DESC;

SELECT
 d.day_name,
 round(sum(fs.net_amount), 2) as amount
FROM fact_sales fs
join dim_date d on fs.date_key = d.date_key
GROUP BY d.day_of_week, d.day_name
ORDER BY d.day_of_week;

SELECT
 round( 
   count(distinct fs.order_number) filter (where fs.customer_key = -1) / 
   count(distinct fs.order_number)::numeric * 100
, 1) as orders,
 round( 
   sum(fs.net_amount) filter (where fs.customer_key = -1) / 
   sum(fs.net_amount) * 100
, 1) as amount

FROM fact_sales fs;