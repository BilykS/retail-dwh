-- ============================================================
--  WMS — генерація даних
--  Той самий патерн, що в 02_seed.sql: випадкові числа народжуються
--  у внутрішньому підзапиті з `offset 0`, кількість дочірніх рядків
--  корелюється через hashint4.
-- ============================================================
set max_parallel_workers_per_gather = 0;
select setseed(0.73);

-- ---------- Склади ----------
insert into wms.warehouses (wh_code, wh_name, city, wh_type, opened_at) values
 ('WH-CENTRAL', 'Центральний склад Бровари', 'Бровари',    'central',  '2016-04-01'),
 ('WH-WEST',    'Західний склад Львів',      'Львів',      'regional', '2018-09-15'),
 ('WH-SOUTH',   'Південний склад Одеса',     'Одеса',      'regional', '2019-06-10'),
 ('WH-EAST',    'Східний склад Дніпро',      'Дніпро',     'regional', '2020-11-02'),
 ('WH-TRANSIT', 'Транзитний майданчик Київ', 'Київ',       'transit',  '2022-03-20');

-- ---------- Артикули ----------
-- 640 артикулів зіставлені з роздрібними товарами через retail_sku
insert into wms.articles (article_code, article_name, retail_sku, unit, is_active)
select 'ART-' || lpad(t.rn::text, 5, '0'),
       t.product_name,
       t.sku,
       (array['шт','шт','шт','шт','кг','л'])[1 + floor(t.a1 * 6)::int],
       t.a2 > 0.04
from (
    select p.sku, p.product_name,
           row_number() over (order by p.product_id) as rn,
           random() a1, random() a2
    from src.products p
    where p.product_id <= 640
    offset 0
) t;

-- 60 артикулів БЕЗ зв'язку з роздрібом: тара, витратні матеріали, нові позиції
insert into wms.articles (article_code, article_name, retail_sku, unit, is_active)
select 'ART-' || lpad((900 + t.i)::text, 5, '0'),
       (array['Палета дерев''яна','Стрейч-плівка','Скотч пакувальний','Ящик картонний',
              'Етикетка термо','Піддон пластиковий','Мішок поліпропіленовий','Плівка бульбашкова'])[1 + floor(t.a1 * 8)::int]
         || ' тип ' || t.i,
       null,
       (array['шт','кг','л'])[1 + floor(t.a2 * 3)::int],
       true
from (select g.i, random() a1, random() a2
      from generate_series(1, 60) g(i) offset 0) t;

-- 15 ДУБЛІВ довідника: два різні артикули вказують на один і той самий retail_sku.
-- Пастка: наївний join до товарів подвоїть рядки факту.
insert into wms.articles (article_code, article_name, retail_sku, unit, is_active)
select 'ART-' || lpad((800 + t.rn)::text, 5, '0'),
       t.product_name || ' (стара картка)',
       t.sku,
       'шт',
       false
from (
    select p.sku, p.product_name, row_number() over (order by p.product_id) as rn
    from src.products p
    where p.product_id <= 15
    offset 0
) t;

-- ---------- Пари артикул × склад ----------
-- Не кожен артикул лежить на кожному складі: вибірка через хеш, ~40% пар
create temporary table _pairs as
select a.article_id,
       w.warehouse_id,
       40 + ((hashint4(a.article_id * 131 + w.warehouse_id) & 2147483647) % 420) as base_qty
from wms.articles a
cross join wms.warehouses w
where ((hashint4(a.article_id * 7919 + w.warehouse_id * 17) & 2147483647) % 100) < 40;

-- ---------- Щоденні зрізи ----------
-- Період: 2025-07-01 .. 2025-12-31.
-- Три дні пропущено навмисно — аварія облікової системи.
insert into wms.stock_daily (snapshot_date, warehouse_id, article_id, qty_on_hand, qty_reserved, qty_in_transit)
select t.snapshot_date,
       t.warehouse_id,
       t.article_id,
       t.on_hand,
       least(t.on_hand, floor(t.on_hand * t.a2 * 0.3)::int)                       as qty_reserved,
       case when t.a3 < 0.12 then (20 + floor(t.a4 * 180))::int else 0 end        as qty_in_transit
from (
    select d.snapshot_date,
           d.day_no,
           p.warehouse_id,
           p.article_id,
           -- сезонний дрейф + випадковий шум; інколи нуль (немає на складі),
           -- зрідка від'ємне значення — помилка інвентаризації
           case
               when r.a1 < 0.002 then -(1 + floor(r.a5 * 12))::int
               else greatest(0, (p.base_qty * (1 + 0.28 * sin((d.day_no + p.article_id) / 23.0)))::int
                                + (r.a5 * 40 - 20)::int)
           end as on_hand,
           r.a2, r.a3, r.a4
    from (
        select d::date as snapshot_date,
               row_number() over (order by d) as day_no
        from generate_series(date '2025-07-01', date '2025-12-31', interval '1 day') d
        where d::date not in (date '2025-08-17', date '2025-10-05', date '2025-11-23')
    ) d
    cross join _pairs p
    cross join lateral (
        select random() a1, random() a2, random() a3, random() a4, random() a5
    ) r
    offset 0
) t;

drop table _pairs;

analyze;
