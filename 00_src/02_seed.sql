-- ============================================================
--  SRC — генерація даних
--  Детерміновано (setseed), тому у всіх однакові цифри.
--
--  ВАЖЛИВО про патерн генерації:
--  random() у НЕкорельованому підзапиті FROM обчислюється ОДИН раз
--  на весь запит (планувальник згортає його в константу) — і всі рядки
--  отримують однакове значення. Тому випадкові числа народжуються
--  у внутрішньому підзапиті над generate_series із `offset 0`
--  (бар'єр оптимізації), а зовнішній SELECT уже читає їх як звичайні колонки.
-- ============================================================
set max_parallel_workers_per_gather = 0;
select setseed(0.42);

-- ---------- Бренди ----------
insert into src.brands (brand_name, country) values
 ('Nordis','Швеція'),('Voltek','Німеччина'),('Aurea','Італія'),('Kravitz','Польща'),
 ('Sunbay','Іспанія'),('Mirano','Італія'),('Terrafix','Німеччина'),('Lumica','Чехія'),
 ('Beskyd','Україна'),('Dnipro Tech','Україна'),('Hanko','Японія'),('Seolim','Корея'),
 ('Brightex','США'),('Cascada','Португалія'),('Vernum','Франція'),('Orbita','Україна'),
 ('Zenko','Японія'),('Falkon','Данія'),('Grandis','Австрія'),('Melvia','Нідерланди'),
 ('Rustico','Італія'),('Polaris Nord','Норвегія'),('Yavir','Україна'),('Kobalt','Німеччина');

-- ---------- Категорії (2 рівні -> майбутня сніжинка) ----------
insert into src.categories (category_name, parent_category_id) values
 ('Електроніка',null),('Побутова техніка',null),('Одяг',null),('Взуття',null),
 ('Продукти харчування',null),('Напої',null),('Побутова хімія',null),('Спорт',null);

insert into src.categories (category_name, parent_category_id)
select v.name, p.category_id
from (values
 ('Смартфони','Електроніка'),('Ноутбуки','Електроніка'),('Навушники','Електроніка'),('Телевізори','Електроніка'),
 ('Холодильники','Побутова техніка'),('Пральні машини','Побутова техніка'),('Мікрохвильові печі','Побутова техніка'),
 ('Футболки','Одяг'),('Куртки','Одяг'),('Джинси','Одяг'),
 ('Кросівки','Взуття'),('Черевики','Взуття'),
 ('Молочні продукти','Продукти харчування'),('Кондитерські вироби','Продукти харчування'),('Бакалія','Продукти харчування'),
 ('Вода','Напої'),('Соки','Напої'),('Кава','Напої'),
 ('Пральні порошки','Побутова хімія'),('Засоби для миття','Побутова хімія'),
 ('Тренажери','Спорт'),('Спортивне харчування','Спорт'),('Велосипеди','Спорт')
) as v(name, parent)
join src.categories p on p.category_name = v.parent and p.parent_category_id is null;

-- ---------- Міста ----------
insert into src.cities (city_name, region) values
 ('Київ','Київська'),('Львів','Львівська'),('Харків','Харківська'),('Одеса','Одеська'),
 ('Дніпро','Дніпропетровська'),('Запоріжжя','Запорізька'),('Вінниця','Вінницька'),
 ('Полтава','Полтавська'),('Чернігів','Чернігівська'),('Черкаси','Черкаська'),
 ('Житомир','Житомирська'),('Суми','Сумська'),('Рівне','Рівненська'),('Луцьк','Волинська'),
 ('Тернопіль','Тернопільська'),('Івано-Франківськ','Івано-Франківська'),('Ужгород','Закарпатська'),
 ('Хмельницький','Хмельницька'),('Миколаїв','Миколаївська'),('Кропивницький','Кіровоградська');

-- ---------- Магазини ----------
with c as (select array_agg(city_id order by city_id) ids,
                  array_agg(city_name order by city_id) names from src.cities)
insert into src.stores (store_code, store_name, city_id, store_type, opened_at, closed_at)
select 'ST-'||lpad(t.i::text,3,'0'),
       'ТЦ ' || c.names[1+floor(t.a1*array_length(c.ids,1))::int] || ' №' || t.i,
       c.ids[1+floor(t.a1*array_length(c.ids,1))::int],
       (array['flagship','standard','standard','standard','kiosk'])[1+floor(t.a2*5)::int],
       date '2015-01-01' + floor(t.a3*3000)::int,
       case when t.a4 < 0.07 then date '2025-03-01' + floor(t.a5*300)::int else null end
from (select g.i, random() a1, random() a2, random() a3, random() a4, random() a5
      from generate_series(1,30) g(i) offset 0) t
cross join c;

-- ---------- Працівники ----------
with s as (select array_agg(store_id order by store_id) ids from src.stores),
     n as (select array['Олександр','Андрій','Дмитро','Сергій','Максим','Володимир','Ігор','Тарас','Богдан','Роман','Віталій','Юрій']::text[] m,
                  array['Олена','Ірина','Наталія','Марія','Оксана','Тетяна','Юлія','Катерина','Софія','Анна','Вікторія','Лариса']::text[] f,
                  array['Шевченко','Коваленко','Бондаренко','Ткаченко','Мельник','Кравчук','Поліщук','Іваненко','Савченко','Гуменюк','Лисенко','Марченко','Даниленко','Пилипенко','Захарченко']::text[] sn)
insert into src.employees (full_name, store_id, position, hired_at)
select case when t.ag < 0.5 then n.m[1+floor(t.a1*array_length(n.m,1))::int]
                            else n.f[1+floor(t.a1*array_length(n.f,1))::int] end
       || ' ' || n.sn[1+floor(t.a2*array_length(n.sn,1))::int],
       s.ids[1+floor(t.a3*array_length(s.ids,1))::int],
       (array['касир','касир','старший касир','консультант','менеджер'])[1+floor(t.a4*5)::int],
       date '2018-01-01' + floor(t.a5*2500)::int
from (select g.i, random() ag, random() a1, random() a2, random() a3, random() a4, random() a5
      from generate_series(1,300) g(i) offset 0) t
cross join s cross join n;

-- ---------- Покупці ----------
with n as (select array['Олександр','Андрій','Дмитро','Сергій','Максим','Володимир','Ігор','Тарас','Богдан','Роман','Віталій','Юрій','Павло','Микола','Артем']::text[] m,
                  array['Олена','Ірина','Наталія','Марія','Оксана','Тетяна','Юлія','Катерина','Софія','Анна','Вікторія','Лариса','Галина','Дарина','Аліна']::text[] f,
                  array['Шевченко','Коваленко','Бондаренко','Ткаченко','Мельник','Кравчук','Поліщук','Іваненко','Савченко','Гуменюк','Лисенко','Марченко','Даниленко','Пилипенко','Захарченко','Романюк','Сидоренко','Осадчук','Бойко','Гриценко']::text[] sn),
     c as (select array_agg(city_id order by city_id) ids from src.cities)
insert into src.customers (full_name, email, phone, birth_date, gender, city_id, registered_at, loyalty_tier)
select case when t.ag < 0.47 then n.m[1+floor(t.a1*array_length(n.m,1))::int]
                             else n.f[1+floor(t.a1*array_length(n.f,1))::int] end
       || ' ' || n.sn[1+floor(t.a2*array_length(n.sn,1))::int],
       case when t.a3 < 0.07 then null
            else 'user'||t.i||'@'||(array['gmail.com','ukr.net','i.ua','outlook.com'])[1+floor(t.a4*4)::int] end,
       case when t.a5 < 0.12 then null
            else '+380'||(50+floor(t.a5*10)::int)||lpad(floor(t.a6*10000000)::text,7,'0') end,
       date '1955-01-01' + floor(t.a6*20000)::int,
       case when t.a7 < 0.06 then null when t.ag < 0.47 then 'M' else 'F' end,
       case when t.a7 > 0.94 then null else c.ids[1+floor(t.a8*array_length(c.ids,1))::int] end,
       timestamp '2022-01-01' + (floor(t.a9*1400))::int * interval '1 day',
       case when t.a10 < 0.35 then null
            when t.a10 < 0.70 then 'bronze'
            when t.a10 < 0.90 then 'silver' else 'gold' end
from (select g.i, random() ag, random() a1, random() a2, random() a3, random() a4,
             random() a5, random() a6, random() a7, random() a8, random() a9, random() a10
      from generate_series(1,20000) g(i) offset 0) t
cross join n cross join c;

-- Дублікати покупців: та сама людина зареєструвалась удруге (пастка для ETL)
insert into src.customers (full_name, email, phone, birth_date, gender, city_id, registered_at, loyalty_tier)
select c.full_name, c.email, c.phone, c.birth_date, c.gender, c.city_id,
       c.registered_at + (30+floor(random()*400))::int * interval '1 day', c.loyalty_tier
from src.customers c
order by random()
limit 400;

-- ---------- Товари ----------
with cats as (select array_agg(c.category_id order by c.category_id) ids,
                     array_agg(p.category_name order by c.category_id) parents
              from src.categories c join src.categories p on p.category_id = c.parent_category_id),
     brs  as (select array_agg(brand_id order by brand_id) ids,
                     array_agg(brand_name order by brand_id) names from src.brands)
insert into src.products (sku, product_name, category_id, brand_id, unit_cost, created_at, is_active)
select 'SKU-'||lpad(t.i::text,6,'0'),
       brs.names[1+floor(t.ab*array_length(brs.ids,1))::int] || ' '
         || chr(65+floor(t.a1*26)::int) || '-' || (100+floor(t.a2*900))::int,
       cats.ids[1+floor(t.ac*array_length(cats.ids,1))::int],
       brs.ids[1+floor(t.ab*array_length(brs.ids,1))::int],
       round((case cats.parents[1+floor(t.ac*array_length(cats.ids,1))::int]
                when 'Електроніка'      then 2000 + t.a3*30000
                when 'Побутова техніка' then 4000 + t.a3*25000
                when 'Спорт'            then  300 + t.a3*15000
                when 'Одяг'             then  200 + t.a3*2500
                when 'Взуття'           then  400 + t.a3*3500
                when 'Побутова хімія'   then   40 + t.a3*400
                when 'Напої'            then   15 + t.a3*300
                else                          20 + t.a3*250 end)::numeric, 2),
       timestamp '2022-01-01' + (floor(t.a4*1000))::int * interval '1 day',
       t.a5 > 0.06
from (select g.i, random() ac, random() ab, random() a1, random() a2,
             random() a3, random() a4, random() a5
      from generate_series(1,2000) g(i) offset 0) t
cross join cats cross join brs;

-- ---------- Історія прайсу ----------
-- Кількість цінових періодів корелюється з product_id через hash,
-- інакше generate_series отримав би константну межу.
insert into src.price_history (product_id, valid_from, list_price)
select t.product_id,
       date '2023-06-01' + ((t.k-1) * (150 + floor(t.a1*120)))::int,
       round((t.unit_cost * (1.30 + t.a2*0.55))::numeric, 2)
from (select p.product_id, p.unit_cost, k.k, random() a1, random() a2
      from src.products p
      cross join lateral generate_series(1, 1 + ((hashint4(p.product_id) & 2147483647) % 3)) k(k)
      offset 0) t;

-- ---------- Журнал змін товарів (джерело для SCD2) ----------
insert into src.product_changes (product_id, changed_at, field_name, old_value, new_value)
select p.product_id,
       timestamp '2024-03-01' + (floor(random()*600))::int * interval '1 day',
       'product_name',
       split_part(p.product_name,' ',1) || ' ' || split_part(p.product_name,' ',2) || ' (old)',
       p.product_name
from src.products p where random() < 0.10;

with cats as (select array_agg(category_id order by category_id) ids
              from src.categories where parent_category_id is not null)
insert into src.product_changes (product_id, changed_at, field_name, old_value, new_value)
select p.product_id,
       timestamp '2024-06-01' + (floor(random()*450))::int * interval '1 day',
       'category_id',
       cats.ids[1+floor(random()*array_length(cats.ids,1))::int]::text,
       p.category_id::text
from src.products p cross join cats where random() < 0.06;

insert into src.product_changes (product_id, changed_at, field_name, old_value, new_value)
select p.product_id,
       timestamp '2024-09-01' + (floor(random()*400))::int * interval '1 day',
       'unit_cost',
       round((p.unit_cost * (0.75 + random()*0.2))::numeric, 2)::text,
       p.unit_cost::text
from src.products p where random() < 0.08;

-- ---------- Замовлення (продажі) ----------
with e as (select array_agg(employee_id order by employee_id) ids,
                  array_agg(store_id    order by employee_id) sids from src.employees),
     cmax as (select max(customer_id) m from src.customers)
insert into src.orders (order_number, order_type, store_id, employee_id, customer_id, ordered_at, payment_method, channel, status)
select 'ORD-'||lpad(t.i::text,7,'0'), 'sale',
       e.sids[1+floor(t.ae*array_length(e.ids,1))::int],
       e.ids [1+floor(t.ae*array_length(e.ids,1))::int],
       case when t.a1 < 0.18 then null else 1+floor(t.a2*cmax.m)::int end,
       timestamp '2024-01-01'
         + (floor(t.a3*730))::int * interval '1 day'
         + (8+floor(t.a4*14))::int * interval '1 hour'
         + (floor(t.a5*60))::int  * interval '1 minute',
       (array['cash','card','card','card','online'])[1+floor(t.a6*5)::int],
       (array['offline','offline','offline','web','mobile'])[1+floor(t.a7*5)::int],
       case when t.a8 < 0.02 then 'cancelled' else 'completed' end
from (select g.i, random() ae, random() a1, random() a2, random() a3,
             random() a4, random() a5, random() a6, random() a7, random() a8
      from generate_series(1,80000) g(i) offset 0) t
cross join e cross join cmax;

-- Передсвятковий сплеск: додаткові замовлення у листопаді-грудні
with e as (select array_agg(employee_id order by employee_id) ids,
                  array_agg(store_id    order by employee_id) sids from src.employees),
     cmax as (select max(customer_id) m from src.customers)
insert into src.orders (order_number, order_type, store_id, employee_id, customer_id, ordered_at, payment_method, channel, status)
select 'ORD-'||lpad((900000+t.i)::text,7,'0'), 'sale',
       e.sids[1+floor(t.ae*array_length(e.ids,1))::int],
       e.ids [1+floor(t.ae*array_length(e.ids,1))::int],
       case when t.a1 < 0.15 then null else 1+floor(t.a2*cmax.m)::int end,
       (case when t.a3 < 0.5 then timestamp '2024-11-01' else timestamp '2025-11-01' end)
         + (floor(t.a4*60))::int * interval '1 day'
         + (9+floor(t.a5*13))::int * interval '1 hour',
       (array['cash','card','card','card','online'])[1+floor(t.a6*5)::int],
       (array['offline','offline','web','web','mobile'])[1+floor(t.a7*5)::int],
       'completed'
from (select g.i, random() ae, random() a1, random() a2, random() a3,
             random() a4, random() a5, random() a6, random() a7
      from generate_series(1,12000) g(i) offset 0) t
cross join e cross join cmax;

-- ---------- Позиції замовлень ----------
insert into src.order_items (order_id, product_id, quantity, unit_price, discount_pct)
select t.order_id, pr.product_id,
       1 + floor(t.a2*3)::int,
       round((pr.unit_cost * (1.25 + t.a3*0.60))::numeric, 2),
       case when t.a4 < 0.25 then round((5 + t.a4*80)::numeric, 2) else 0 end
from (select o.order_id,
             1 + floor(random()*2000)::int pid,
             random() a2, random() a3, random() a4
      from src.orders o
      cross join lateral generate_series(1, 1 + ((hashint4(o.order_id) & 2147483647) % 4)) li(k)
      where o.order_type = 'sale'
      offset 0) t
join src.products pr on pr.product_id = t.pid;

-- ---------- Повернення ----------
with cand as (
  select o.order_id, o.store_id, o.employee_id, o.customer_id, o.ordered_at,
         o.payment_method, o.channel, row_number() over (order by o.order_id) rn
  from src.orders o
  where o.order_type = 'sale' and o.status = 'completed' and random() < 0.03
)
insert into src.orders (order_number, order_type, original_order_id, store_id, employee_id, customer_id, ordered_at, payment_method, channel, status)
select 'RET-'||lpad(rn::text,7,'0'), 'return', order_id, store_id, employee_id, customer_id,
       ordered_at + (1+floor(random()*20))::int * interval '1 day',
       payment_method, channel, 'returned'
from cand;

insert into src.order_items (order_id, product_id, quantity, unit_price, discount_pct)
select r.order_id, i.product_id, -i.quantity, i.unit_price, i.discount_pct
from src.orders r
join src.order_items i on i.order_id = r.original_order_id
where r.order_type = 'return';

-- Оригінальні замовлення теж позначаються як повернені
update src.orders o set status = 'returned'
where exists (select 1 from src.orders r where r.original_order_id = o.order_id);

analyze;
