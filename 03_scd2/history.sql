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
)

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
order by h.product_id, h.valid_from;
