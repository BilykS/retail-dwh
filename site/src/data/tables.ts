/**
 * The warehouse model as the star diagram and the dimension matrix draw it.
 * Column lists come from information_schema on dbt_star; `keys` are the columns
 * shown as keys. Positions are in the diagram's 960 by 470 viewBox.
 */
import type { Locale } from '~/i18n';

export interface ModelTable {
  name: string;
  rows: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fact?: boolean;
  /** Which fact tables use this dimension. Absent on facts and derived models. */
  usedBy?: { sales?: boolean; inventory?: boolean };
  keys: string[];
  columns: string[];
  kind: Record<Locale, string>;
  note: Record<Locale, string>;
}

export const TABLES: ModelTable[] = [
  {
    name: 'fact_sales', rows: 233015, x: 260, y: 162, w: 170, h: 82, fact: true,
    keys: ['date_key', 'product_key', 'store_key', 'customer_key', 'transaction_type_key'],
    columns: ['order_item_id', 'order_number', 'hour', 'quantity', 'gross_amount', 'discount_amount', 'net_amount', 'cost_amount'],
    kind: { en: 'Transaction fact', uk: 'Транзакційний факт' },
    note: {
      en: 'Grain: one receipt line. The receipt number sits directly in the fact, because the average check cannot be calculated without it.',
      uk: 'Зерно: одна позиція чека. Номер чека лежить прямо у факті, без нього не порахувати середній чек.',
    },
  },
  {
    name: 'fact_inventory', rows: 254124, x: 540, y: 162, w: 170, h: 82, fact: true,
    keys: ['date_key', 'warehouse_key', 'article_key', 'product_key'],
    columns: ['qty_on_hand', 'qty_reserved', 'qty_in_transit', 'qty_available'],
    kind: { en: 'Periodic snapshot', uk: 'Періодичний зріз' },
    note: {
      en: 'Grain: article, warehouse, day. Nothing is filtered out, so inactive articles that still hold stock are here too.',
      uk: 'Зерно: артикул, склад, день. Нічого не фільтрується, неактивні артикули із залишками теж тут.',
    },
  },
  {
    name: 'dim_date', rows: 1096, x: 400, y: 30, w: 170, h: 58, usedBy: { sales: true, inventory: true },
    keys: ['date_key'],
    columns: ['full_date', 'year', 'quarter', 'month', 'month_name', 'day', 'day_of_week', 'day_name', 'is_weekend'],
    kind: { en: 'Shared dimension', uk: 'Спільний вимір' },
    note: {
      en: 'A generated, continuous series for 2024 to 2026 with no gaps. The key has the form YYYYMMDD.',
      uk: 'Згенерований суцільний ряд 2024-2026 без пропусків. Ключ у форматі YYYYMMDD.',
    },
  },
  {
    name: 'dim_product', rows: 2001, x: 400, y: 290, w: 170, h: 58, usedBy: { sales: true, inventory: true },
    keys: ['product_key'],
    columns: ['product_id', 'sku', 'product_name', 'category_name', 'category_parent', 'brand_name', 'unit_cost'],
    kind: { en: 'Shared dimension', uk: 'Спільний вимір' },
    note: {
      en: 'Serves both facts. A separate -1 row, "Not a retail product", takes warehouse materials that are not in the assortment.',
      uk: 'Обслуговує обидва факти. Окремий запис -1 «Не товар роздрібу» приймає складські матеріали, яких немає в асортименті.',
    },
  },
  {
    name: 'dim_store', rows: 30, x: 20, y: 50, w: 170, h: 58, usedBy: { sales: true },
    keys: ['store_key'],
    columns: ['store_id', 'store_code', 'store_name', 'city_name', 'region', 'store_type', 'opened_at', 'closed_at'],
    kind: { en: 'Dimension', uk: 'Вимір' },
    note: {
      en: 'City and region are copied into the dimension so a report needs no extra joins.',
      uk: 'Місто й область перенесені прямо у вимір, щоб звіту не потрібні були додаткові join’и.',
    },
  },
  {
    name: 'dim_customer', rows: 20401, x: 20, y: 182, w: 170, h: 58, usedBy: { sales: true },
    keys: ['customer_key'],
    columns: ['customer_id', 'full_name', 'email', 'phone', 'birth_date', 'gender', 'city', 'loyalty_tier'],
    kind: { en: 'Dimension', uk: 'Вимір' },
    note: {
      en: 'A separate -1 row takes anonymous sales (17.6% of receipts), so an inner join loses nothing.',
      uk: 'Окремий запис -1 приймає анонімні продажі (17,6% чеків), тому inner join нічого не губить.',
    },
  },
  {
    name: 'dim_transaction_type', rows: 18, x: 20, y: 314, w: 170, h: 58, usedBy: { sales: true },
    keys: ['transaction_type_key'],
    columns: ['channel', 'order_type', 'payment_method'],
    kind: { en: 'Junk dimension', uk: 'Junk-вимір' },
    note: {
      en: 'Channel, payment method and transaction type are collected into one dimension instead of three.',
      uk: 'Канал, спосіб оплати і тип транзакції зібрані в один вимір замість трьох окремих.',
    },
  },
  {
    name: 'dim_warehouse', rows: 5, x: 790, y: 90, w: 150, h: 58, usedBy: { inventory: true },
    keys: ['warehouse_key'],
    columns: ['warehouse_id', 'warehouse_code', 'warehouse_name', 'warehouse_city', 'warehouse_type', 'warehouse_opened_at'],
    kind: { en: 'Dimension', uk: 'Вимір' },
    note: {
      en: 'Warehouses from the wms source system.',
      uk: 'Склади із системи wms.',
    },
  },
  {
    name: 'dim_article', rows: 715, x: 790, y: 262, w: 150, h: 58, usedBy: { inventory: true },
    keys: ['article_key'],
    columns: ['article_id', 'article_code', 'article_name', 'article_retail_sku', 'article_unit', 'article_is_active'],
    kind: { en: 'Dimension', uk: 'Вимір' },
    note: {
      en: 'The warehouse catalogue with its own codes. It links to products through retail_sku: 60 articles have no product, and 15 products have two cards.',
      uk: 'Складський довідник зі своїми кодами. З товаром зв’язаний через retail_sku: 60 артикулів без товару, 15 товарів мають по дві картки.',
    },
  },
  {
    name: 'stock_cover', rows: 585, x: 400, y: 394, w: 170, h: 58,
    keys: ['product_key'],
    columns: ['qty_stock', 'avg_per_day', 'days_cover'],
    kind: { en: 'Derived model', uk: 'Похідна модель' },
    note: {
      en: 'Stock on the last date against the sales rate for the same period. The facts are never joined directly: each is aggregated to product level first.',
      uk: 'Залишок на останню дату проти темпу продажів за той самий період. Факти не з’єднуються напряму, кожен спочатку агрегується до рівня товару.',
    },
  },
];

/** Lines of the diagram, with the tables each one connects. */
export const EDGES: { a: string; b: string; d: string; drill?: boolean }[] = [
  { a: 'fact_sales', b: 'dim_store', d: 'M260 203L190 79' },
  { a: 'fact_sales', b: 'dim_customer', d: 'M260 203L190 211' },
  { a: 'fact_sales', b: 'dim_transaction_type', d: 'M260 203L190 343' },
  { a: 'fact_sales', b: 'dim_date', d: 'M380 162L440 88' },
  { a: 'fact_inventory', b: 'dim_date', d: 'M590 162L530 88' },
  { a: 'fact_sales', b: 'dim_product', d: 'M380 244L440 290' },
  { a: 'fact_inventory', b: 'dim_product', d: 'M590 244L530 290' },
  { a: 'fact_inventory', b: 'dim_warehouse', d: 'M710 203L790 119' },
  { a: 'fact_inventory', b: 'dim_article', d: 'M710 203L790 291' },
  { a: 'fact_sales', b: 'stock_cover', d: 'M300 244V423H400', drill: true },
  { a: 'fact_inventory', b: 'stock_cover', d: 'M670 244V423H570', drill: true },
];
