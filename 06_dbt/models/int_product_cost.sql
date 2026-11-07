-- Історія закупівельних цін: один рядок = період дії однієї ціни товару.
--
-- Навіщо. src.order_items не містить собівартості, а src.products.unit_cost
-- зберігає ЛИШЕ поточне значення. Якщо брати його напряму, зміна закупівельної
-- ціни заднім числом переписує історичну маржу — факт перестає фіксувати
-- стан на момент події. Журнал src.product_changes дозволяє відновити ціну,
-- що діяла в день продажу.
--
-- Чому окрема модель, а не версіонування unit_cost у dim_product.
-- Вимір Type 2 описує товар (назва, категорія). Ціна — вхідна величина міри,
-- а не опис. Якби вона версіонувалась у вимірі, кожен перегляд цін
-- постачальником породжував би новий рядок товару, і описова історія
-- потонула б у цінових версіях.

with bounds as (

    -- межі періодів: початок часів плюс дата кожної зміни ціни
    select product_id, date '1900-01-01' as valid_from
    from {{ source('src', 'products') }}

    union all

    select product_id, changed_at::date
    from {{ source('src', 'product_changes') }}
    where field_name = 'unit_cost'

),

windows as (

    select product_id,
           valid_from,
           coalesce(
               lead(valid_from) over (partition by product_id order by valid_from) - 1,
               date '9999-12-31'
           ) as valid_to
    from bounds

)

select w.product_id,
       w.valid_from,
       w.valid_to,

       -- Ціна періоду = old_value найближчої зміни ПІСЛЯ його початку.
       -- Якщо змін далі немає, період відкритий і в ньому діє поточна ціна.
       coalesce(
           (select pc.old_value::numeric(12,2)
            from {{ source('src', 'product_changes') }} pc
            where pc.product_id = w.product_id
              and pc.field_name = 'unit_cost'
              and pc.changed_at::date > w.valid_from
            order by pc.changed_at
            limit 1),
           p.unit_cost
       ) as unit_cost

from windows w
join {{ source('src', 'products') }} p on p.product_id = w.product_id
