-- ============================================================
--  SRC — система-джерело (OLTP, ~3НФ)
--  Це НЕ сховище. Це те, як дані живуть в операційній системі:
--  нормалізовано, без історії, оптимізовано під запис і точковий пошук.
--  Ваше завдання далі — побудувати з цього зіркову схему.
-- ============================================================

drop schema if exists src cascade;
create schema src;

-- ---------- Довідники ----------

create table src.brands (
    brand_id    serial primary key,
    brand_name  text not null unique,
    country     text not null
);

create table src.categories (
    category_id        serial primary key,
    category_name      text not null,
    parent_category_id int references src.categories(category_id)
);

create table src.cities (
    city_id    serial primary key,
    city_name  text not null unique,
    region     text not null
);

create table src.products (
    product_id    serial primary key,
    sku           text not null unique,
    product_name  text not null,
    category_id   int  not null references src.categories(category_id),
    brand_id      int  not null references src.brands(brand_id),
    unit_cost     numeric(12,2) not null,      -- собівартість, ПОТОЧНА
    created_at    timestamp not null,
    is_active     boolean not null default true
);

-- Журнал змін довідника товарів (CDC-подібний).
-- products зберігає ПОТОЧНИЙ стан; історія — тільки тут.
-- Саме з цього ви будете відновлювати SCD Type 2.
create table src.product_changes (
    change_id   serial primary key,
    product_id  int  not null references src.products(product_id),
    changed_at  timestamp not null,
    field_name  text not null,                 -- product_name | category_id | unit_cost
    old_value   text,
    new_value   text
);

-- Історія прайс-листа (рекомендована ціна продажу)
create table src.price_history (
    price_id    serial primary key,
    product_id  int not null references src.products(product_id),
    valid_from  date not null,
    list_price  numeric(12,2) not null
);

create table src.stores (
    store_id   serial primary key,
    store_code text not null unique,
    store_name text not null,
    city_id    int  not null references src.cities(city_id),
    store_type text not null,                  -- flagship | standard | kiosk
    opened_at  date not null,
    closed_at  date                            -- NULL = працює
);

create table src.employees (
    employee_id serial primary key,
    full_name   text not null,
    store_id    int  not null references src.stores(store_id),
    position    text not null,
    hired_at    date not null
);

create table src.customers (
    customer_id   serial primary key,
    full_name     text not null,
    email         text,                        -- може дублюватись: та сама людина двічі
    phone         text,
    birth_date    date,
    gender        char(1),                     -- M | F | NULL
    city_id       int references src.cities(city_id),
    registered_at timestamp not null,
    loyalty_tier  text                         -- bronze | silver | gold | NULL
);

-- ---------- Транзакції ----------

create table src.orders (
    order_id          serial primary key,
    order_number      text not null unique,
    order_type        text not null,           -- sale | return
    original_order_id int references src.orders(order_id),  -- заповнено для return
    store_id          int not null references src.stores(store_id),
    employee_id       int not null references src.employees(employee_id),
    customer_id       int references src.customers(customer_id),  -- NULL = продаж без картки
    ordered_at        timestamp not null,
    payment_method    text not null,           -- cash | card | online
    channel           text not null,           -- offline | web | mobile
    status            text not null            -- completed | returned | cancelled
);

create table src.order_items (
    order_item_id serial primary key,
    order_id      int not null references src.orders(order_id),
    product_id    int not null references src.products(product_id),
    quantity      int not null,                -- від'ємна для повернень
    unit_price    numeric(12,2) not null,      -- фактична ціна продажу
    discount_pct  numeric(5,2)  not null default 0
);

-- Індекси як у нормальній OLTP-системі: під FK і точковий пошук
create index ix_products_category   on src.products(category_id);
create index ix_products_brand      on src.products(brand_id);
create index ix_prodchg_product     on src.product_changes(product_id, changed_at);
create index ix_price_product       on src.price_history(product_id, valid_from);
create index ix_stores_city         on src.stores(city_id);
create index ix_employees_store     on src.employees(store_id);
create index ix_customers_city      on src.customers(city_id);
create index ix_customers_email     on src.customers(email);
create index ix_orders_customer     on src.orders(customer_id);
create index ix_orders_store        on src.orders(store_id);
create index ix_orders_date         on src.orders(ordered_at);
create index ix_items_order         on src.order_items(order_id);
create index ix_items_product       on src.order_items(product_id);
