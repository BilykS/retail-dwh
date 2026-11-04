truncate star.fact_sales, star.dim_product restart identity;

insert into star.dim_product (product_id, sku, product_name, category_name,
                              category_parent, brand_name, unit_cost,
                              valid_from, valid_to, is_current)
with h as (
    select product_id, valid_from,
        coalesce(lead(valid_from) over (partition by product_id order by valid_from) - 1,
            date '9999-12-31') as valid_to
    from (
        select product_id, date '1900-01-01' as valid_from from src.products
        union all
        select product_id, changed_at::date from src.product_changes
        where field_name in ('product_name','category_id')
    ) x
),
v as (
    select h.product_id,
           h.valid_from,
           h.valid_to,
           coalesce(
               (select pc.old_value
                from src.product_changes pc
                where pc.product_id = h.product_id
                  and pc.field_name = 'product_name'
                  and pc.changed_at::date > h.valid_from
                order by pc.changed_at
                limit 1),
               p.product_name
           ) as product_name,
           coalesce(
               (select pc.old_value::int
                from src.product_changes pc
                where pc.product_id = h.product_id
                  and pc.field_name = 'category_id'
                  and pc.changed_at::date > h.valid_from
                order by pc.changed_at
                limit 1),
               p.category_id
           ) as category_id
    from h
    join src.products p on p.product_id = h.product_id
)
select v.product_id,
       p.sku,
       v.product_name,
       cat.category_name,
       par.category_name,
       b.brand_name,
       p.unit_cost,
       v.valid_from,
       v.valid_to,
       v.valid_to = date '9999-12-31'
from v
join src.products   p   on p.product_id    = v.product_id
join src.brands     b   on b.brand_id      = p.brand_id
join src.categories cat on cat.category_id = v.category_id
join src.categories par on par.category_id = cat.parent_category_id
;
