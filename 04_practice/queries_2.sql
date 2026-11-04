SELECT d.month, d.month_name,
p.category_name,
sum(f.net_amount) as revenue
FROM fact_sales f
join dim_product p on p.product_key = f.product_key
join dim_date d on f.date_key = d.date_key
where d.year = 2025
GROUP BY d.month, d.month_name, p.category_name
ORDER BY d.month, revenue DESC

with by_mounth as (
SELECT
d.month,
d.month_name,
sum(f.net_amount) filter (where d.year = 2024) as rev_2024,
sum(f.net_amount) filter (where d.year = 2025) as rev_2025

FROM fact_sales f
join dim_date d on f.date_key = d.date_key
where d.year in (2024, 2025)
GROUP by d.month, d.month_name
)

select month_name,
rev_2024,
rev_2025,
round((rev_2025 - rev_2024) / nullif(rev_2024, 0) * 100, 1) as growth_pct
from by_mounth
order by month


with products_group as (
select 
p.product_name,
f.product_key,
p.category_name,
sum(f.net_amount) as revenue
from fact_sales f
join dim_product p on f.product_key = p.product_key
group by p.product_name, f.product_key, p.category_name
),

products_temp as (
select
product_name,
category_name,
revenue,
row_number() over (partition by category_name ORDER BY revenue DESC) as numbers
from products_group
)

select
product_name,
category_name,
revenue,
numbers
from products_temp WHERE numbers <= 3


with month_sum as (
select 
d.month,
d.month_name,
sum(f.net_amount) as revenue
from fact_sales f
join dim_date d on d.date_key = f.date_key
where d.year = 2025
group by d.month, d.month_name
)

select 
month,
month_name,
revenue,
sum(revenue) over (order by month) as revenue_cumulative
from month_sum 


with product_revenue as (
select 
f.product_key,
sum(f.net_amount) as revenue
from fact_sales f
group by f.product_key
),

product_revenue_part as (
select 
product_key,
revenue,
revenue / sum(revenue) over () * 100.0 as revenue_part
from product_revenue
),

accum_part as (
select
product_key,
revenue,
revenue_part,
sum(revenue_part) over (order by revenue_part desc) as accum
from product_revenue_part
)


select 
product_name,
revenue,
accum, 
case
when accum <= 80 then 'A'
when accum <= 95 then 'B'
else 'C'
end as cat
from accum_part a
join dim_product p on a.product_key = p.product_key


