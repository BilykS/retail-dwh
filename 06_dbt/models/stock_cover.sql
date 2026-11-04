with period as (
    select min(i.date_key)                          as from_key,
           max(i.date_key)                          as to_key,
           max(d.full_date) - min(d.full_date) + 1  as days
    from {{ ref('fact_inventory') }} i
        join {{ ref('dim_date') }} d on d.date_key = i.date_key
),
 stock as (
    -- залишок кожного товару на ОСТАННЮ дату
    -- із dbt_star.fact_inventory
    -- group by product_key
    select i.product_key,
    sum(i.qty_available) as qty_stock
    from {{ ref('fact_inventory') }} i
    cross join period p
    where i.date_key = p.to_key
    group by i.product_key
),
sales as (
    -- середні продажі за день по кожному товару
    -- із dbt_star.fact_sales, за той самий період, що й залишки
    -- group by product_key
    select s.product_key,
           sum(s.quantity)::numeric / p.days as avg_per_day
    from {{ ref('fact_sales') }} s
    cross join period p
    where s.date_key between p.from_key and p.to_key
    group by s.product_key, p.days
)
select 
stock.product_key,
stock.qty_stock,
sales.avg_per_day,
stock.qty_stock / nullif(sales.avg_per_day, 0) as days_cover  
from stock
left join sales on sales.product_key = stock.product_key