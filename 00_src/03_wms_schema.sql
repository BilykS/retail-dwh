-- ============================================================
--  WMS — друга система-джерело: управління складом
--
--  Окрема операційна система, яку мережа купила разом зі складами.
--  Вона НЕ знає про product_id роздрібної системи: у неї власні
--  артикули (article_code), а зв'язок із роздрібом — через retail_sku,
--  і то не завжди заповнений.
--
--  Це типова ситуація інтеграції: два джерела про ті самі товари,
--  різні ключі, неповне й неідеальне зіставлення.
-- ============================================================

drop schema if exists wms cascade;
create schema wms;

create table wms.warehouses (
    warehouse_id serial primary key,
    wh_code      text not null unique,
    wh_name      text not null,
    city         text not null,
    wh_type      text not null,          -- central | regional | transit
    opened_at    date not null
);

create table wms.articles (
    article_id   serial primary key,
    article_code text not null unique,   -- власний код складу, НЕ sku
    article_name text not null,
    retail_sku   text,                   -- зв'язок із src.products.sku; буває NULL
    unit         text not null,          -- шт | кг | л
    is_active    boolean not null default true
);

-- Щоденний зріз залишків: один рядок = один артикул на одному складі в один день
create table wms.stock_daily (
    snapshot_date  date not null,
    warehouse_id   int  not null references wms.warehouses(warehouse_id),
    article_id     int  not null references wms.articles(article_id),
    qty_on_hand    int  not null,        -- фізично на складі
    qty_reserved   int  not null,        -- зарезервовано під замовлення
    qty_in_transit int  not null,        -- у дорозі від постачальника
    primary key (snapshot_date, warehouse_id, article_id)
);

create index ix_stock_article on wms.stock_daily (article_id);
create index ix_stock_wh      on wms.stock_daily (warehouse_id);
