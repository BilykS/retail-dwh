with s as (
select p.category_name,
    sum(fk.net_amount) as revenue
from star.fact_sales fk
join star.dim_product p on fk.product_key = p.product_key
group by p.category_name
),

n as (
    select cs.category_name,
    sum(fks.net_amount) as revenue
    from snow.fact_sales fks
    join snow.dim_product ps on fks.product_key = ps.product_key
    join snow.dim_category cs on ps.category_key = cs.category_key
    group by cs.category_name
)

select coalesce(s.category_name, n.category_name) as category_name,
    s.revenue as star_scd2,
    n.revenue as snow_current,
    coalesce(s.revenue, 0) - coalesce(n.revenue, 0) as diff
from s
full join n on n.category_name = s.category_name
order by diff desc;