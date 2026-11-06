-- Періоди дії цін одного товару не повинні перекриватись.
--
-- Це головний ризик моделі: fact_sales з'єднується з нею через
-- `between valid_from and valid_to`, тож два періоди, що накладаються,
-- тихо задублювали б рядки факту разом із виручкою.
-- Тест повертає рядки лише тоді, коли перекриття є.

select a.product_id,
       a.valid_from as period_a_from,
       a.valid_to   as period_a_to,
       b.valid_from as period_b_from,
       b.valid_to   as period_b_to

from {{ ref('int_product_cost') }} a
join {{ ref('int_product_cost') }} b
  on  b.product_id = a.product_id
  and b.valid_from <> a.valid_from
  and b.valid_from <= a.valid_to
  and b.valid_to   >= a.valid_from
