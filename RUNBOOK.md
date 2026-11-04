# DWH — навчальна пісочниця (star / snowflake)

Локальний PostgreSQL у Docker для практики з вимірювальним моделюванням.

---

## Підключення

| Параметр | Значення |
|---|---|
| Хост | `localhost` |
| Порт | **5433** |
| База | `dwh` |
| Користувач | `dwh` |
| Пароль | `dwh` |
| Версія | PostgreSQL 16 (alpine) |
| Кодування / локаль | UTF8 / `C` |

**Connection string:**
```
postgresql://dwh:dwh@localhost:5433/dwh
```

**JDBC:**
```
jdbc:postgresql://localhost:5433/dwh
```

> Порт **5433**, а не стандартний 5432 — 5432 на цій машині зайнятий контейнером `erp-postgres`.
> Adminer теж зсунуто: **8081** замість 8080 (8080 під `erp-adminer`).

### Adminer (веб-інтерфейс)

http://localhost:8081

| Поле | Значення |
|---|---|
| System | PostgreSQL |
| Server | `postgres`  *(ім'я сервісу в docker-мережі, НЕ localhost)* |
| Username | `dwh` |
| Password | `dwh` |
| Database | `dwh` |

---

## Команди

### Запуск / зупинка

```bash
cd e:/_DEV/_DWH

docker compose up -d        # підняти (postgres + adminer)
docker compose ps           # статус контейнерів
docker compose stop         # зупинити, контейнери й дані лишаються
docker compose start        # підняти назад після stop
docker compose down         # зупинити й видалити контейнери, ДАНІ ЛИШАЮТЬСЯ (том)
docker compose down -v      # 💥 зупинити й СТЕРТИ БД начисто (видаляє том)
docker compose restart postgres
```

### Логи

```bash
docker compose logs -f postgres     # стежити за логами
docker compose logs --tail=50 postgres
```

### psql

```bash
# інтерактивна сесія всередині контейнера
docker exec -it dwh-postgres psql -U dwh -d dwh

# одноразовий запит
docker exec dwh-postgres psql -U dwh -d dwh -c "select version();"

# виконати .sql файл з хоста
docker exec -i dwh-postgres psql -U dwh -d dwh < 01_star/schema.sql

# те саме, але зупинитись на першій помилці (для DDL це те, що треба)
docker exec -i dwh-postgres psql -U dwh -d dwh -v ON_ERROR_STOP=1 < 01_star/schema.sql
```

### Корисне в psql

```
\l              список баз
\dn             список схем
\dt             таблиці поточної схеми
\dt *.*         таблиці всіх схем
\d fact_sales   структура таблиці
\di             індекси
\timing on      показувати час виконання запитів
\x auto         зручний вивід широких рядків
\q              вихід
```

### Бекап / відновлення

```bash
docker exec dwh-postgres pg_dump -U dwh -d dwh > backup.sql
docker exec -i dwh-postgres psql -U dwh -d dwh < backup.sql

# тільки схема, без даних — зручно порівнювати star vs snowflake
docker exec dwh-postgres pg_dump -U dwh -d dwh --schema-only > schema_only.sql
```

### Повний ресет бази

```bash
docker compose down -v && docker compose up -d
```

Після цього повторно виконаються скрипти з `./initdb/`.

---

## Структура проєкту

```
_DWH/
  docker-compose.yml   конфіг контейнерів
  initdb/              SQL, що виконується ЛИШЕ при першій ініціалізації тому
  README.md            цей файл
```

> ⚠️ Скрипти в `initdb/` спрацьовують **тільки** коли том `dwh_pgdata` створюється з нуля.
> Якщо база вже існує — покладений туди SQL проігнорується. Або виконуйте вручну через `psql`,
> або робіть `docker compose down -v` для повного ресету.

---

## Облікові дані

Логін/пароль `dwh` / `dwh` — навмисно тривіальні: це локальна навчальна пісочниця,
доступна лише з цієї машини. Не використовувати такий підхід ніде за межами localhost.

---

## Схема `src` — система-джерело

Створюється скриптами [00_src/01_schema.sql](00_src/01_schema.sql) і [00_src/02_seed.sql](00_src/02_seed.sql).
Генерація детермінована (`setseed(0.42)`), займає ~2 хв.

```bash
docker exec -i dwh-postgres psql -U dwh -d dwh -v ON_ERROR_STOP=1 -q < 00_src/01_schema.sql
docker exec -i dwh-postgres psql -U dwh -d dwh -v ON_ERROR_STOP=1 -q < 00_src/02_seed.sql
```

> `01_schema.sql` починається з `drop schema if exists src cascade` — перезапуск повністю
> перестворює джерело. Схеми `star` / `snow` при цьому не зачіпаються.

### Обсяг

| Таблиця | Рядків |
|---|---|
| `src.order_items` | 236 891 |
| `src.orders` | 94 627 |
| `src.customers` | 20 400 |
| `src.products` | 2 000 |
| `src.price_history` | 3 991 |
| `src.employees` | 300 |
| `src.product_changes` | 448 |
| `src.stores` | 30 |
| `src.categories` | 31 (8 батьківських + 23 дочірні) |
| `src.brands` | 24 |
| `src.cities` | 20 |

Період продажів: **2024-01-01 … 2025-12-31**, зі сплеском у листопаді-грудні.

### Навмисні «шорсткості» в даних

Це не помилки генератора — це матеріал для вправ:

- **17,6% замовлень без покупця** (`customer_id is null`) — продаж без картки лояльності
- **400 дублікатів покупців** — та сама людина зареєструвалась удруге
- **2 627 повернень** — окремі замовлення з `order_type='return'` і від'ємною кількістю;
  оригінальне замовлення при цьому теж отримує `status='returned'`
- **1 536 скасованих** замовлень
- **448 змін у довіднику товарів** (`src.product_changes`) — назва, категорія, собівартість.
  `src.products` містить лише ПОТОЧНИЙ стан: історію треба відновлювати з журналу → SCD Type 2
- NULL у `email`, `phone`, `gender`, `city_id`, `loyalty_tier` покупців
- Частина магазинів закрита (`closed_at is not null`), частина товарів неактивна

### Пастка генерації, на яку варто звернути увагу

У першій версії скрипта випадкові значення бралися з некорельованого `lateral`-підзапиту:

```sql
cross join lateral (select 1+floor(random()*2000)::int pi) r   -- ✗ так НЕ можна
```

Планувальник PostgreSQL обчислив `random()` **один раз на весь запит** — і всі 190 тис.
позицій отримали один і той самий товар. Правильний патерн: генерувати випадкові числа
у внутрішньому підзапиті над `generate_series` із бар'єром `offset 0`, а зовнішній `SELECT`
читає їх як звичайні колонки:

```sql
from (select g.i, random() a1, random() a2
      from generate_series(1,2000) g(i) offset 0) t   -- ✓
```

Там, де потрібна змінна кількість дочірніх рядків, межа `generate_series` корелюється
з батьківським рядком через хеш:

```sql
cross join lateral generate_series(1, 1 + ((hashint4(o.order_id) & 2147483647) % 4)) li(k)
```

---

## PowerShell vs Git Bash

Команди в цьому README написані для **bash**. У PowerShell перенаправлення `<` не працює:

```
The '<' operator is reserved for future use.
```

Два виходи:

**Перемкнути термінал на Git Bash** — у VS Code стрілка біля `+` у панелі терміналу. Тоді всі команди звідси працюють як є.

**Або замінити `<` на конвеєр:**

```powershell
# bash
docker exec -i dwh-postgres psql -U dwh -d dwh -v ON_ERROR_STOP=1 < 01_star/schema.sql

# PowerShell — те саме
Get-Content 01_star\schema.sql -Raw | docker exec -i dwh-postgres psql -U dwh -d dwh -v ON_ERROR_STOP=1
```
