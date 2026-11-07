/**
 * Everything the "data journey" scene shows: the tables of both source systems,
 * the two stars they become, and the threads between their columns.
 *
 * Values are real rows for one receipt line, order_item_id 260. It was chosen
 * because the product exists in both systems: only 640 of 2,000 products have a
 * warehouse card. Source values come from src and wms, targets from dbt_star, the
 * only schema that holds both facts. scripts/check-journey-data.mjs compares them
 * all with the warehouse.
 */

export const COLOR = {
  product: '#6F8CFF',
  store: '#3FC9B5',
  customer: '#C08BFF',
  date: '#F2B65A',
  type: '#FF7FA8',
  fact: '#EDEFF7',
  source: '#AEB6D2',
  warehouse: '#7FD1FF',
  article: '#A5E36B',
  inventory: '#FFD9A8',
  cover: '#FFFFFF',
};

/** A column: name and value. A name ending in "*" is the table's own key. */
export type Column = [string, string];
export type Point = [number, number, number];

export interface SourceTable {
  position: Point;
  rows: string;
  columns: Column[];
  /** Not used by the model, so drawn faintly. */
  unused?: boolean;
}

export interface TargetTable extends SourceTable {
  /** The stage at which this table is built. */
  stage: number;
  color: string;
  fact?: boolean;
  /** Built from a calendar, so no source column feeds it. */
  generated?: boolean;
}

export const SOURCES: Record<string, SourceTable> = {
  brands: { position: [-2000, 395, -120], rows: '24', columns: [['brand_id', '16'], ['brand_name', 'Orbita'], ['country', 'Україна']] },
  categories: { position: [-2010, 240, 170], rows: '31', columns: [['category_id', '29'], ['category_name', 'Велосипеди'], ['parent_category_id', '8']] },
  product_changes: { position: [-1990, 30, -60], rows: '448', columns: [['change_id', '343'], ['product_id', '430'], ['changed_at', '2025-06-10'], ['field_name', 'unit_cost'], ['old_value', '7167.49'], ['new_value', '8026.07']] },
  price_history: { position: [-2040, -230, -300], rows: '3 991', unused: true, columns: [['price_id', '835'], ['product_id', '430'], ['valid_from', '2023-06-01'], ['list_price', '14636.41']] },
  products: { position: [-1630, 300, 210], rows: '2 000', columns: [['product_id', '430'], ['sku', 'SKU-000430'], ['product_name', 'Orbita W-677'], ['category_id', '29'], ['brand_id', '16'], ['unit_cost', '8026.07'], ['created_at', '2022-11-18'], ['is_active', 'true']] },
  order_items: { position: [-1620, -80, 60], rows: '236 891', columns: [['order_item_id', '260'], ['order_id', '101'], ['product_id', '430'], ['quantity', '1'], ['unit_price', '10629.67'], ['discount_pct', '21.97']] },
  orders: { position: [-1270, 240, -180], rows: '94 627', columns: [['order_id', '101'], ['order_number', 'ORD-0000101'], ['order_type', 'sale'], ['original_order_id', 'null'], ['store_id', '16'], ['employee_id', '178'], ['customer_id', '8394'], ['ordered_at', '2025-09-23 21:55'], ['payment_method', 'online'], ['channel', 'mobile'], ['status', 'completed']] },
  employees: { position: [-1300, -240, -420], rows: '300', unused: true, columns: [['employee_id', '178'], ['full_name', 'Олександр Бондаренко'], ['store_id', '16'], ['position', 'касир'], ['hired_at', '2019-03-16']] },
  customers: { position: [-910, 320, 120], rows: '20 400', columns: [['customer_id', '8394'], ['full_name', 'Дмитро Шевченко'], ['email', 'user8394@gmail.com'], ['phone', '+380592028132'], ['birth_date', '1966-02-08'], ['gender', 'M'], ['city_id', '1'], ['registered_at', '2022-02-10'], ['loyalty_tier', 'null']] },
  stores: { position: [-930, 10, -130], rows: '30', columns: [['store_id', '16'], ['store_code', 'ST-016'], ['store_name', 'ТЦ Вінниця №16'], ['city_id', '7'], ['store_type', 'standard'], ['opened_at', '2016-04-06'], ['closed_at', 'null']] },
  cities: { position: [-900, -240, 160], rows: '20', columns: [['city_id', '7'], ['city_name', 'Вінниця'], ['region', 'Вінницька']] },
  warehouses: { position: [3090, 300, -120], rows: '5', columns: [['warehouse_id', '4'], ['wh_code', 'WH-EAST'], ['wh_name', 'Східний склад Дніпро'], ['city', 'Дніпро'], ['wh_type', 'regional'], ['opened_at', '2020-11-02']] },
  articles: { position: [3130, 40, 150], rows: '715', columns: [['article_id', '430'], ['article_code', 'ART-00430'], ['article_name', 'Orbita W-677'], ['retail_sku', 'SKU-000430'], ['unit', 'л'], ['is_active', 'true']] },
  stock_daily: { position: [3080, -220, -40], rows: '254 124', columns: [['snapshot_date', '2025-09-23'], ['warehouse_id', '4'], ['article_id', '430'], ['qty_on_hand', '250'], ['qty_reserved', '68'], ['qty_in_transit', '0']] },
};

/** Foreign keys of the source systems: table, column, referenced table, column. */
export const SOURCE_KEYS: [string, string, string, string][] = [
  ['categories', 'parent_category_id', 'categories', 'category_id'],
  ['customers', 'city_id', 'cities', 'city_id'],
  ['employees', 'store_id', 'stores', 'store_id'],
  ['order_items', 'order_id', 'orders', 'order_id'],
  ['order_items', 'product_id', 'products', 'product_id'],
  ['orders', 'customer_id', 'customers', 'customer_id'],
  ['orders', 'employee_id', 'employees', 'employee_id'],
  ['orders', 'store_id', 'stores', 'store_id'],
  ['price_history', 'product_id', 'products', 'product_id'],
  ['product_changes', 'product_id', 'products', 'product_id'],
  ['products', 'brand_id', 'brands', 'brand_id'],
  ['products', 'category_id', 'categories', 'category_id'],
  ['stores', 'city_id', 'cities', 'city_id'],
  ['stock_daily', 'warehouse_id', 'warehouses', 'warehouse_id'],
  ['stock_daily', 'article_id', 'articles', 'article_id'],
];

/** Built directly in their places: two stars that share date and product. */
export const TARGETS: Record<string, TargetTable> = {
  dim_product: { position: [1500, 290, -80], stage: 2, color: COLOR.product, rows: '2 001', columns: [['product_key*', 'f74909ac...'], ['product_id', '430'], ['sku', 'SKU-000430'], ['product_name', 'Orbita W-677'], ['category_name', 'Велосипеди'], ['category_parent', 'Спорт'], ['brand_name', 'Orbita'], ['unit_cost', '8026.07']] },
  dim_store: { position: [450, 270, -60], stage: 3, color: COLOR.store, rows: '30', columns: [['store_key*', 'c74d97b0...'], ['store_id', '16'], ['store_code', 'ST-016'], ['store_name', 'ТЦ Вінниця №16'], ['city_name', 'Вінниця'], ['region', 'Вінницька'], ['store_type', 'standard'], ['opened_at', '2016-04-06'], ['closed_at', 'null']] },
  dim_customer: { position: [450, -290, 100], stage: 3, color: COLOR.customer, rows: '20 401', columns: [['customer_key*', '664c7298...'], ['customer_id', '8394'], ['full_name', 'Дмитро Шевченко'], ['email', 'user8394@gmail.com'], ['phone', '+380592028132'], ['birth_date', '1966-02-08'], ['gender', 'Чоловіча'], ['city', 'Київ'], ['loyalty_tier', 'Без картки']] },
  dim_date: { position: [1500, -300, -60], stage: 4, color: COLOR.date, rows: '1 096', generated: true, columns: [['date_key*', '20250923'], ['full_date', '2025-09-23'], ['year', '2025'], ['quarter', '3'], ['month', '9'], ['month_name', 'Вересень'], ['day', '23'], ['day_of_week', '2'], ['day_name', 'Вівторок'], ['is_weekend', 'false']] },
  dim_transaction_type: { position: [1000, 440, -220], stage: 4, color: COLOR.type, rows: '18', columns: [['transaction_type_key*', 'fc3239fd...'], ['channel', 'mobile'], ['order_type', 'sale'], ['payment_method', 'online']] },
  fact_sales: { position: [1000, -30, 170], stage: 5, color: COLOR.fact, rows: '233 015', fact: true, columns: [['order_item_id', '260'], ['date_key', '20250923'], ['product_key', 'f74909ac...'], ['store_key', 'c74d97b0...'], ['customer_key', '664c7298...'], ['transaction_type_key', 'fc3239fd...'], ['hour', '21'], ['order_number', 'ORD-0000101'], ['quantity', '1'], ['gross_amount', '10629.67'], ['discount_amount', '2335.34'], ['net_amount', '8294.33'], ['cost_amount', '8026.07']] },
  dim_warehouse: { position: [2550, 270, -60], stage: 7, color: COLOR.warehouse, rows: '5', columns: [['warehouse_key*', 'a87ff679...'], ['warehouse_id', '4'], ['warehouse_code', 'WH-EAST'], ['warehouse_name', 'Східний склад Дніпро'], ['warehouse_city', 'Дніпро'], ['warehouse_type', 'regional'], ['warehouse_opened_at', '2020-11-02']] },
  dim_article: { position: [2550, -290, 100], stage: 7, color: COLOR.article, rows: '715', columns: [['article_key*', 'f74909ac...'], ['article_id', '430'], ['article_code', 'ART-00430'], ['article_name', 'Orbita W-677'], ['article_retail_sku', 'SKU-000430'], ['article_unit', 'л'], ['article_is_active', 'true']] },
  fact_inventory: { position: [2000, -30, 170], stage: 8, color: COLOR.inventory, rows: '254 124', fact: true, columns: [['date_key', '20250923'], ['warehouse_key', 'a87ff679...'], ['article_key', 'f74909ac...'], ['product_key', 'f74909ac...'], ['qty_on_hand', '250'], ['qty_reserved', '68'], ['qty_in_transit', '0'], ['qty_available', '182']] },
  stock_cover: { position: [1500, 0, 280], stage: 9, color: COLOR.cover, rows: '585', columns: [['product_key', 'f74909ac...'], ['qty_stock', '878'], ['avg_per_day', '0.375'], ['days_cover', '2341.3']] },
};

/** A thread: source column, target column, and the value it carries when that differs from the source. */
export type Flow = [string, string, string?];

export const FLOWS: Flow[] = [
  ['products.product_id', 'dim_product.product_id'], ['products.sku', 'dim_product.sku'], ['products.product_name', 'dim_product.product_name'],
  ['categories.category_name', 'dim_product.category_name'], ['categories.category_name', 'dim_product.category_parent', 'Спорт'], ['brands.brand_name', 'dim_product.brand_name'], ['products.unit_cost', 'dim_product.unit_cost'],

  ['stores.store_id', 'dim_store.store_id'], ['stores.store_code', 'dim_store.store_code'], ['stores.store_name', 'dim_store.store_name'], ['cities.city_name', 'dim_store.city_name'], ['cities.region', 'dim_store.region'], ['stores.store_type', 'dim_store.store_type'], ['stores.opened_at', 'dim_store.opened_at'], ['stores.closed_at', 'dim_store.closed_at'],
  ['customers.customer_id', 'dim_customer.customer_id'], ['customers.full_name', 'dim_customer.full_name'], ['customers.email', 'dim_customer.email'], ['customers.phone', 'dim_customer.phone'], ['customers.birth_date', 'dim_customer.birth_date'], ['customers.gender', 'dim_customer.gender'], ['cities.city_name', 'dim_customer.city', 'Київ'], ['customers.loyalty_tier', 'dim_customer.loyalty_tier', 'Без картки'],

  ['orders.channel', 'dim_transaction_type.channel'], ['orders.order_type', 'dim_transaction_type.order_type'], ['orders.payment_method', 'dim_transaction_type.payment_method'],

  ['order_items.order_item_id', 'fact_sales.order_item_id'], ['dim_date.date_key', 'fact_sales.date_key'], ['orders.ordered_at', 'fact_sales.date_key', '20250923'], ['dim_product.product_key', 'fact_sales.product_key'], ['dim_store.store_key', 'fact_sales.store_key'], ['dim_customer.customer_key', 'fact_sales.customer_key'], ['dim_transaction_type.transaction_type_key', 'fact_sales.transaction_type_key'],
  ['orders.ordered_at', 'fact_sales.hour', '21'], ['orders.order_number', 'fact_sales.order_number'], ['order_items.quantity', 'fact_sales.quantity'],
  ['order_items.unit_price', 'fact_sales.gross_amount'], ['order_items.discount_pct', 'fact_sales.discount_amount', '2335.34'], ['order_items.unit_price', 'fact_sales.net_amount', '8294.33'], ['product_changes.new_value', 'fact_sales.cost_amount'],

  ['warehouses.warehouse_id', 'dim_warehouse.warehouse_id'], ['warehouses.wh_code', 'dim_warehouse.warehouse_code'], ['warehouses.wh_name', 'dim_warehouse.warehouse_name'], ['warehouses.city', 'dim_warehouse.warehouse_city'], ['warehouses.wh_type', 'dim_warehouse.warehouse_type'], ['warehouses.opened_at', 'dim_warehouse.warehouse_opened_at'],
  ['articles.article_id', 'dim_article.article_id'], ['articles.article_code', 'dim_article.article_code'], ['articles.article_name', 'dim_article.article_name'], ['articles.retail_sku', 'dim_article.article_retail_sku'], ['articles.unit', 'dim_article.article_unit'], ['articles.is_active', 'dim_article.article_is_active'],

  ['dim_date.date_key', 'fact_inventory.date_key'], ['stock_daily.snapshot_date', 'fact_inventory.date_key', '20250923'], ['dim_warehouse.warehouse_key', 'fact_inventory.warehouse_key'], ['dim_article.article_key', 'fact_inventory.article_key'], ['dim_product.product_key', 'fact_inventory.product_key'],
  ['stock_daily.qty_on_hand', 'fact_inventory.qty_on_hand'], ['stock_daily.qty_reserved', 'fact_inventory.qty_reserved'], ['stock_daily.qty_in_transit', 'fact_inventory.qty_in_transit'], ['stock_daily.qty_on_hand', 'fact_inventory.qty_available', '182'],

  ['fact_inventory.qty_available', 'stock_cover.qty_stock', '878'], ['fact_sales.quantity', 'stock_cover.avg_per_day', '0.375'], ['fact_inventory.product_key', 'stock_cover.product_key'], ['fact_sales.quantity', 'stock_cover.days_cover', '2341.3'],
];

/** The bright lines of the finished stars: fact, column, dimension, colour. */
export const STAR_LINKS: [string, string, string, string][] = [
  ['fact_sales', 'product_key', 'dim_product', COLOR.product],
  ['fact_sales', 'customer_key', 'dim_customer', COLOR.customer],
  ['fact_sales', 'date_key', 'dim_date', COLOR.date],
  ['fact_sales', 'store_key', 'dim_store', COLOR.store],
  ['fact_sales', 'transaction_type_key', 'dim_transaction_type', COLOR.type],
  ['fact_inventory', 'product_key', 'dim_product', COLOR.product],
  ['fact_inventory', 'date_key', 'dim_date', COLOR.date],
  ['fact_inventory', 'warehouse_key', 'dim_warehouse', COLOR.warehouse],
  ['fact_inventory', 'article_key', 'dim_article', COLOR.article],
  ['fact_sales', 'product_key', 'stock_cover', COLOR.cover],
  ['fact_inventory', 'product_key', 'stock_cover', COLOR.cover],
];

/** Camera position and the point it looks at, per stage. */
export const CAMERA: { cam: Point; look: Point }[] = [
  { cam: [-1460, 30, 1680], look: [-1460, -10, 0] },
  { cam: [-1400, -110, 830], look: [-1440, -110, 80] },
  { cam: [1620, 300, 760], look: [1500, 290, -80] },
  { cam: [470, -10, 1360], look: [450, -10, 20] },
  { cam: [1250, 60, 1700], look: [1250, 70, -100] },
  { cam: [1000, -30, 930], look: [1000, -30, 170] },
  { cam: [3070, 20, 1250], look: [3090, 20, 0] },
  { cam: [2570, -10, 1360], look: [2550, -10, 20] },
  { cam: [2000, -30, 900], look: [2000, -30, 170] },
  { cam: [1500, 20, 960], look: [1500, 0, 280] },
  { cam: [1560, 90, 2150], look: [1500, 20, 0] },
  { cam: [560, 260, 4750], look: [560, 20, 0] },
];

/** "Whole scheme" is the last stage's view, available from any stage. */
export const WHOLE_VIEW = CAMERA[CAMERA.length - 1];

export interface StageCopy {
  label: string;
  eyebrow: string;
  title: string;
  text: string;
}

export const STAGES: Record<'en' | 'uk', StageCopy[]> = {
  en: [
    { label: 'Source', eyebrow: 'src schema', title: 'Retail: 11 tables', text: 'Good for bookkeeping, awkward for a report. Beside each column is the stored value for one product on a receipt. All data here is generated by a script, the customer included. Scroll and watch where the values fly.' },
    { label: 'Grain', eyebrow: 'First decision', title: 'One row is one receipt line', text: 'There are 236,891 rows in order_items. Cancelled orders go (3,876), and 233,015 reach the fact. Returns stay, with a minus sign.' },
    { label: 'Product', eyebrow: 'Shared dimension', title: 'Three tables become one product', text: 'Brand and category move into the product row. This is the current state: the history of names and categories is kept separately, in the star schema.' },
    { label: 'Store and customer', eyebrow: 'Dimensions', title: 'The city moves into the dimensions', text: 'There is one cities table, but the values differ: a customer from Kyiv bought in a store in Vinnytsia. A customer with no card still has a row, and anonymous sales go to row -1.' },
    { label: 'Date and type', eyebrow: 'Dimensions', title: 'The date and the receipt attributes', text: 'The calendar is generated, not taken from a source, because reports need month, quarter and weekday. Channel, type and payment method collapse into one dimension of 18 combinations.' },
    { label: 'Sales', eyebrow: 'First fact', title: 'One row: keys and measures', text: 'Net 8,294.33 after a 21.97% discount. Cost of 8,026.07 is taken as of the sale date: the purchase price rose on 10 June 2025, and the sale happened in September.' },
    { label: 'Warehouse', eyebrow: 'wms schema', title: 'A second source: 3 tables', text: 'The warehouse lives apart and has its own article codes. 60 articles have no retail product, and 15 products have two warehouse cards.' },
    { label: 'Warehouse and article', eyebrow: 'Dimensions', title: 'Two more dimensions', text: 'An article links to a product through retail_sku. The link only runs from article to product, otherwise rows multiply.' },
    { label: 'Stock', eyebrow: 'Second fact', title: 'Stock on a given day', text: 'A different grain: article, warehouse, day. Dnipro holds 250 units, 68 of them reserved, so 182 are available. Stock cannot be added across dates, because the same goods are counted again every day.' },
    { label: 'Cover', eyebrow: 'Both facts', title: 'How many days the stock will last', text: 'The facts are never joined directly: each is first aggregated to product level. 878 available units across warehouses against 0.375 sold per day. The generator does not tie stock to sales, so the figure is high.' },
    { label: 'Two stars', eyebrow: 'Result', title: 'Two facts on shared dimensions', text: 'Date and product belong to both stars, so sales and stock can sit side by side. The values of that product are now one join away from the fact.' },
    { label: 'The whole way', eyebrow: 'What it gave', title: 'From two systems to one model', text: '14 tables became two facts and seven dimensions. The threads show where each column came from. Revenue by region takes a shorter query, and in all 18 regions the result differs by under one hryvnia, from rounding.' },
  ],
  uk: [
    { label: 'Джерело', eyebrow: 'Схема src', title: 'Роздріб: 11 таблиць', text: 'Для обліку це добре, для звіту незручно. Поруч із кожною колонкою значення зі сховища для одного товару в чеку. Усі дані згенеровані скриптом, покупець теж. Гортайте і стежте, куди вони полетять.' },
    { label: 'Зерно', eyebrow: 'Перше рішення', title: 'Один рядок це одна позиція чека', text: 'Рядків у order_items 236 891, скасовані замовлення прибираємо (3 876), у факт піде 233 015. Повернення лишаються з мінусом.' },
    { label: 'Товар', eyebrow: 'Спільний вимір', title: 'Три таблиці стають одним товаром', text: 'Бренд і категорія переїжджають у рядок товару. Тут поточний стан: історія назв і категорій зберігається окремо, у схемі star.' },
    { label: 'Магазин і покупець', eyebrow: 'Виміри', title: 'Місто переїжджає у виміри', text: 'Таблиця cities одна, а значення різні: покупець із Києва купив у магазині у Вінниці. Покупець без картки теж має рядок, а анонімні продажі приймає запис -1.' },
    { label: 'Дата й тип', eyebrow: 'Виміри', title: 'Дата й атрибути чека', text: 'Календар генерується, а не береться з джерела, бо звітам потрібні місяць, квартал і день тижня. Канал, тип і спосіб оплати складаються в один вимір на 18 комбінацій.' },
    { label: 'Продажі', eyebrow: 'Перший факт', title: 'Один рядок: ключі й міри', text: 'Чистими 8 294,33 після знижки 21,97%. Собівартість 8 026,07 береться на дату продажу: закупівельну ціну підняли 10 червня 2025, а продаж стався у вересні.' },
    { label: 'Склад', eyebrow: 'Схема wms', title: 'Друге джерело: 3 таблиці', text: 'Склад живе окремо і має власні коди артикулів. 60 артикулів не мають роздрібного товару, а 15 товарів мають по дві складські картки.' },
    { label: 'Склад і артикул', eyebrow: 'Виміри', title: 'Ще два виміри', text: 'Артикул зв’язаний із товаром через retail_sku. Зв’язок іде лише від артикула до товару, інакше рядки множаться.' },
    { label: 'Залишки', eyebrow: 'Другий факт', title: 'Залишок на день', text: 'Зерно інше: артикул, склад, день. У Дніпрі 250 одиниць, із них 68 у резерві, доступно 182. Залишки не можна складати за датами: той самий товар перераховується щодня.' },
    { label: 'Запас', eyebrow: 'Обидва факти', title: 'На скільки днів вистачить товару', text: 'Факти не з’єднуються напряму: кожен спочатку агрегується до рівня товару. 878 доступних одиниць на всіх складах проти 0,375 проданих на день. У генераторі запаси не прив’язані до продажів, тому число велике.' },
    { label: 'Дві зірки', eyebrow: 'Результат', title: 'Два факти на спільних вимірах', text: 'Дата й товар належать обом зіркам, тому продажі й залишки можна поставити поруч. Значення того самого товару тепер лежать за один join від факту.' },
    { label: 'Весь шлях', eyebrow: 'Що це дало', title: 'З двох систем в одну модель', text: '14 таблиць стали двома фактами й сімома вимірами. Ниточки показують, звідки прийшла кожна колонка. Запит виручки за областю став коротшим, а результат в усіх 18 областях відрізняється менш ніж на гривню, через округлення.' },
  ],
};

export interface TableAbout {
  kind: string;
  title: string;
  text: string;
  /** Replaces the list of source tables where the threads do not tell the story. */
  from?: string;
}

/** What each table is for, shown when it is opened. scripts/check-journey-data.mjs checks the figures. */
export const ABOUT: Record<'en' | 'uk', Record<string, TableAbout>> = {
  en: {
    dim_date: { kind: 'Dimension, shared', title: 'When it happened', from: 'a calendar, generate_series', text: 'Months, quarters, weekends. It shows the season: November and December brought 27.8% of 2025 revenue. Both stars share it, so sales and stock sit on one time scale.' },
    dim_product: { kind: 'Dimension, shared', title: 'Which product', text: 'Categories, brands, cost. It shows which products carry revenue: 552 of 2,000 bring 80%. Both stars share it, and it is where sales meet stock.' },
    dim_store: { kind: 'Dimension', title: 'Where it sold', text: 'Store, format, city, region. It compares locations: in 2025 revenue per store ranges from 22.7 M to 158.3 M.' },
    dim_customer: { kind: 'Dimension', title: 'Who bought', text: 'City, age, loyalty card. Anonymous purchases sit in row -1. The cut exists, but in this generated data the loyalty tier barely affects sales.' },
    dim_transaction_type: { kind: 'Dimension', title: 'How it sold', text: 'Channel, operation type, payment method: 18 combinations in one dimension instead of three. This is where returns separate from sales.' },
    dim_warehouse: { kind: 'Dimension', title: 'Where it is kept', text: 'Warehouse, city, type. It compares stock across 5 warehouses. It belongs only to the stock star: sales do not record a warehouse.' },
    dim_article: { kind: 'Dimension', title: 'The warehouse card', text: 'An article from the warehouse system. It links stock to retail through retail_sku. Stock with no retail product is not lost: that is 19,005 rows of the fact.' },
    fact_sales: { kind: 'Fact', title: 'How much it earned', text: 'Grain: one receipt line. Revenue, discount, cost and quantity add up across any dimension, so margin is calculated here.' },
    fact_inventory: { kind: 'Fact', title: 'How much is in stock', text: 'Grain: one article in one warehouse on one day. Stock adds up across warehouses but not across dates, because the same goods are counted again every day.' },
    stock_cover: { kind: 'Both facts', title: 'How many days it will last', text: 'Stock divided by average daily sales. Each fact is first aggregated to product level. The generator does not tie stock to sales, so the figure is high.' },
  },
  uk: {
    dim_date: { kind: 'Вимір, спільний', title: 'Коли це сталося', from: 'календар, generate_series', text: 'Місяці, квартали, вихідні. Через неї видно сезонність: листопад і грудень дали 27,8% виручки 2025 року. Спільна для обох зірок, тому продажі й залишки стоять на одній шкалі часу.' },
    dim_product: { kind: 'Вимір, спільний', title: 'Який це товар', text: 'Категорії, бренди, собівартість. Показує, які товари тримають виручку: 552 із 2 000 дають 80%. Спільна для обох зірок, через неї продажі зустрічаються із залишками.' },
    dim_store: { kind: 'Вимір', title: 'Де продали', text: 'Магазин, формат, місто, область. Порівнює точки між собою: у 2025 році виручка на магазин коливається від 22,7 до 158,3 млн.' },
    dim_customer: { kind: 'Вимір', title: 'Хто купив', text: 'Місто, вік, картка лояльності. Анонімні покупки лежать у рядку -1. Розріз є, але в цих згенерованих даних рівень лояльності майже не впливає на продажі.' },
    dim_transaction_type: { kind: 'Вимір', title: 'Як продали', text: 'Канал, тип операції, спосіб оплати: 18 комбінацій в одному вимірі замість трьох окремих. Саме тут повернення відділяються від продажів.' },
    dim_warehouse: { kind: 'Вимір', title: 'Де лежить', text: 'Склад, місто, тип. Порівнює запаси між 5 складами. Належить лише зірці залишків: у продажах склад не записаний.' },
    dim_article: { kind: 'Вимір', title: 'Складська картка', text: 'Артикул зі складської системи. Зв’язує склад із роздробом через retail_sku. Залишки без роздрібного товару не губляться: це 19 005 рядків факту.' },
    fact_sales: { kind: 'Факт', title: 'Скільки заробили', text: 'Зерно: одна позиція чека. Виручку, знижку, собівартість і кількість можна додавати за будь-яким виміром, тому звідси рахується маржа.' },
    fact_inventory: { kind: 'Факт', title: 'Скільки лежить', text: 'Зерно: артикул на складі за день. Залишок можна додавати між складами, але не між датами, бо той самий товар перераховується щодня.' },
    stock_cover: { kind: 'Обидва факти', title: 'На скільки днів вистачить', text: 'Залишок ділиться на середні продажі за день. Факти спершу агрегуються до рівня товару. Генератор не пов’язує запаси з продажами, тому днів виходить багато.' },
  },
};

/** The receipt shown at the grain stage. */
export const RECEIPT = {
  store: 'ТЦ ВІННИЦЯ №16',
  lines: [['Grandis S-667', '2 800,96'], ['Orbita W-677', '8 294,33'], ['Brightex C-327', '38 989,80']] as [string, string][],
  traced: 1,
  footer: { en: '3 LINES = 3 ROWS IN THE FACT', uk: '3 ПОЗИЦІЇ = 3 РЯДКИ У ФАКТІ' },
};
