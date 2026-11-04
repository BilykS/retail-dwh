dim_product, нові колонки:
  valid_from  date not null      1900-01-01 для першої версії
  valid_to    date not null      9999-12-31 для поточної
  is_current  bool not null

Type 2 (створюють версію):  product_name, category_name/category_parent
Type 1 (перезаписуються):   unit_cost — історія вже у факті як cost_amount

Обмеження: unique (product_id) замінити на unique (product_id, valid_from)
Версій очікується: 2000 товарів + 315 змін (195 назв + 120 категорій) = 2315

версія 1: 1900-01-01 .. 2025-08-08     <- changed_at мінус 1 день
версія 2: 2025-08-09 .. 9999-12-31     <- changed_at

Якщо межі десь перетнуться, факт роздується; якщо між ними буде дірка — частина продажів випаде. Тому в кроці 4 контроль один: 233 015, не більше й не менше.