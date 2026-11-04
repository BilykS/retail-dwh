dim_transaction_type нічого
dim_date нічого
dim_product має сутність category_name, category_parent та brand_name які можна винести в окремо
dim_store можна винести  та city_name, region
dim_customer city буде окремо 

dim_customer матиме два значення city_key, main_shopping_city_key


А: одна таблиця               Б: дві таблиці
dim_category                  dim_category
  category_key                  category_key
  category_name                 category_name
  parent_category_key --+       category_group_key --> dim_category_group
                        |                                category_group_key
   (вказує на себе) <---+                                category_group_name


Таблиця А

select par.category_name, sum(f.net_amount)
from snow.fact_sales f
join snow.dim_product  p   on p.product_key    = f.product_key
join snow.dim_category cat on cat.category_key = p.category_key
join snow.dim_category par on par.category_key = cat.parent_category_key
group by par.category_name;

Таблиця Б

select g.category_group_name, sum(f.net_amount)
from snow.fact_sales f
join snow.dim_product        p on p.product_key         = f.product_key
join snow.dim_category       c on c.category_key        = p.category_key
join snow.dim_category_group g on g.category_group_key  = c.category_group_key
group by g.category_group_name;


                       dim_date
                          |
   dim_brand ──┐          |
               ├─ dim_product ── fact_sales ── dim_transaction_type
dim_category ──┘          |         |
     |                    |    dim_customer ──┐ (city_key)
dim_category_group   dim_store ──┐            ├── dim_city ── dim_region
                                 └────────────┘


## Крок 6 — порівняння star vs snow

Умови: PostgreSQL 16, 233 015 рядків у факті, кеш прогрітий (3 прогони, взято останній),
`explain (analyze, buffers)`.

| Запит | join'ів star | join'ів snow | час star | час snow | різниця | buffers star | buffers snow |
|---|---|---|---|---|---|---|---|
| 3. Виручка за категорією | 1 | 2 | 51 ms | 64 ms | **+25%** | 3 319 | 3 292 |
| 5. Виручка за областю | 1 | 3 | 44 ms | 81 ms | **+85%** | 3 232 | 3 222 |
| 2. Топ-20 товарів | 1 | 1 | 57 ms | 56 ms | **0%** | 3 306 | 3 273 |

З усіх buffers 3 185 у кожному запиті — це `fact_sales` (Parallel Seq Scan). Виміри — решта, 1–4%.

### Висновки

1. **Ціна сніжинки — join'и, і тільки вони.** Топ-20 не потребує ланцюжка (назва товару в `dim_product`
   в обох схемах) — і різниці немає. Категорії — один зайвий join, +25%. Область — два зайві, +85%.
   Кожен рівень ланцюжка — ще один прохід через 77 тис. рядків на воркер.

2. **Економія місця реальна, але непомітна.** `dim_product` у сніжинці читається з 60 сторінок замість 90,
   `dim_store` — з 1 замість 2. Разом виграш 30–40 сторінок із 3 300. Це менше 1,5%. Факт домінує.

3. **Сніжинка оптимізує те, що майже нічого не коштує, і платить тим, що коштує.** Виміри — крихти I/O;
   join'и — реальний CPU. Тому промислові сховища переважно обирають зірку, а нормалізують виміри
   лише коли вимір справді великий (мільйони рядків) або коли ієрархію треба редагувати в одному місці
   (бренд перейменувався — 1 рядок у сніжинці проти сотень у зірці).

4. **Що НЕ змінилось:** факт, зерно, міри, ETL факту, контрольні суми. Сніжинка — це рішення про виміри.
