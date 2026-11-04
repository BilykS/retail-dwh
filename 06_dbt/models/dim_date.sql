select to_char(d, 'YYYYMMDD')::int        as date_key,
       d::date                           as full_date,
       extract(year    from d)::int      as year,
       extract(quarter from d)::int      as quarter,
       extract(month   from d)::int      as month,
       (array['Січень','Лютий','Березень','Квітень','Травень','Червень',
              'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'])[extract(month from d)::int]
                                         as month_name,
       extract(day     from d)::int      as day,
       extract(isodow  from d)::int      as day_of_week,
       (array['Понеділок','Вівторок','Середа','Четвер','П''ятниця','Субота','Неділя'])[extract(isodow from d)::int]
                                         as day_name,
       extract(isodow from d) in (6, 7)  as is_weekend
from generate_series(date '2024-01-01', date '2026-12-31', interval '1 day') as d
