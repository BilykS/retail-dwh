Зерно факту = одна позиція чеку

Скасовані — не беремо. Продажу не було: товар не пішов, гроші не прийшли. Це не подія продажу, це відсутність події.
Повернення — беремо, у той самий факт, з від'ємною кількістю та сумою. Тоді «чиста виручка» = звичайний sum(), без жодних відніманнь і окремих таблиць. Це стандартний прийом.
Оригінали повернених продажів — беремо. Продаж таки відбувся, гроші були в касі того дня. Те, що через тиждень товар повернули, — окрема подія, і вона вже врахована окремим рядком. Обережно з фільтром status = 'completed': він мовчки викине 6 573 реальні продажі.

Разом: 233 015 рядків у fact_sales.




fact_sales
    зерно: одна позиція чеку
    посилання на виміри
    date_key              -> dim_date
    product_key           -> dim_product
    store_key             -> dim_store
    customer_key          -> dim_customer   (-1 = невідомий)
    transaction_type_key  -> dim_transaction_type
    hour                  0-23
    order_number          degenerate

  міри
    quantity          адитивна
    gross_amount      адитивна    quantity * unit_price
    discount_amount   адитивна    gross * discount_pct/100
    net_amount        адитивна    gross - discount        <- виручка
    cost_amount       адитивна    quantity * unit_cost на момент продажу

dim_date
    зерно: один календарний день
    діапазон: усі дати підряд 2024-01-01 .. 2026-12-31 (із запасом), без пропусків
    джерело: генерується, у src таблиці дат немає

    date_key      int    20250314        ключ, YYYYMMDD
    full_date     date   2025-03-14      сама дата, для between і порівнянь
    year          int    2025
    quarter       int    1
    month         int    3               сортує
    month_name    text   Березень        показує
    day           int    14              день місяця
    day_of_week   int    2               сортує (1 = понеділок)
    day_name      text   Вівторок        показує
    is_weekend    bool   false
    
    hour окрема колонка hour просто у факті, числом 0–23


dim_transaction_type
    channel
    payment_method
    order_type

dim_product
    product_id <-src.products.product_id
    sku <-src.products.sku
    product_name <-src.products.product_name
    category_name <-src.categories.category_id
    category_parent <- src.categories.parent_category_id
    brand <-src.brands(brand_id)
    unit_cost <-src.products 

dim_store
    store_id  <- src.stores
    store_code <- src.stores
    store_name <- src.stores
    city_name    <- src.stores src.cities.city_name
    region    <- src.stores src.cities.region
    store_type <- src.stores
    opened_at <- src.stores
    closed_at <- src.stores

dim_customer
    customer_id src.customers // -1 якщо пусто
    full_name src.customers
    email src.customers
    phone src.customers
    birth_date src.customers
    gender  src.customers (Чоловік / Жінка)
    city <- src.cities.city_name
    loyalty_tier src.customers
    main_shopping_city  <- місто, де він купує найчастіше (обчислено)


unit_price - ціна до знижки
revenue = quantity * unit_price * (1 - discount_pct / 100)

gross_amount    = quantity * unit_price                    сума до знижки
discount_amount = quantity * unit_price * discount_pct/100  знижка в грошах
net_amount      = gross_amount - discount_amount            виручка

cost_amount = quantity * unit_cost           (unit_cost на момент продажу)
margin      = net_amount - cost_amount

select sum(net_amount) / count(distinct order_number) as середній_чек
from star.fact_sales;