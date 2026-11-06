/**
 * The warehouse stores its names in Ukrainian. The Ukrainian site shows them as
 * they are; the English site translates them here.
 */
import type { Locale } from '../i18n/index.ts';

const CATEGORY_GROUPS: Record<string, string> = {
  'Взуття': 'Footwear',
  'Електроніка': 'Electronics',
  'Напої': 'Beverages',
  'Одяг': 'Clothing',
  'Побутова техніка': 'Home appliances',
  'Побутова хімія': 'Household chemicals',
  'Продукти харчування': 'Food',
  'Спорт': 'Sports',
};

const PRODUCT_CATEGORIES: Record<string, string> = {
  'Бакалія': 'Groceries',
  'Велосипеди': 'Bicycles',
  'Вода': 'Water',
  'Джинси': 'Jeans',
  'Засоби для миття': 'Cleaning products',
  'Кава': 'Coffee',
  'Кондитерські вироби': 'Confectionery',
  'Кросівки': 'Sneakers',
  'Куртки': 'Jackets',
  'Молочні продукти': 'Dairy',
  'Мікрохвильові печі': 'Microwave ovens',
  'Навушники': 'Headphones',
  'Ноутбуки': 'Laptops',
  'Пральні машини': 'Washing machines',
  'Пральні порошки': 'Laundry detergent',
  'Смартфони': 'Smartphones',
  'Соки': 'Juices',
  'Спортивне харчування': 'Sports nutrition',
  'Телевізори': 'TVs',
  'Тренажери': 'Exercise machines',
  'Футболки': 'T-shirts',
  'Холодильники': 'Refrigerators',
  'Черевики': 'Boots',
};

const REGIONS: Record<string, string> = {
  'Івано-Франківська': 'Ivano-Frankivsk',
  'Волинська': 'Volyn',
  'Вінницька': 'Vinnytsia',
  'Дніпропетровська': 'Dnipropetrovsk',
  'Житомирська': 'Zhytomyr',
  'Закарпатська': 'Zakarpattia',
  'Запорізька': 'Zaporizhzhia',
  'Київська': 'Kyiv',
  'Кіровоградська': 'Kirovohrad',
  'Одеська': 'Odesa',
  'Полтавська': 'Poltava',
  'Рівненська': 'Rivne',
  'Сумська': 'Sumy',
  'Тернопільська': 'Ternopil',
  'Харківська': 'Kharkiv',
  'Хмельницька': 'Khmelnytskyi',
  'Черкаська': 'Cherkasy',
  'Чернігівська': 'Chernihiv',
};

const CITIES: Record<string, string> = {
  'Івано-Франківськ': 'Ivano-Frankivsk',
  'Вінниця': 'Vinnytsia',
  'Дніпро': 'Dnipro',
  'Житомир': 'Zhytomyr',
  'Запоріжжя': 'Zaporizhzhia',
  'Київ': 'Kyiv',
  'Кропивницький': 'Kropyvnytskyi',
  'Луцьк': 'Lutsk',
  'Одеса': 'Odesa',
  'Полтава': 'Poltava',
  'Рівне': 'Rivne',
  'Суми': 'Sumy',
  'Тернопіль': 'Ternopil',
  'Ужгород': 'Uzhhorod',
  'Харків': 'Kharkiv',
  'Хмельницький': 'Khmelnytskyi',
  'Черкаси': 'Cherkasy',
  'Чернігів': 'Chernihiv',
};

const WAREHOUSES: Record<string, string> = {
  'Західний склад Львів': 'Western warehouse, Lviv',
  'Південний склад Одеса': 'Southern warehouse, Odesa',
  'Східний склад Дніпро': 'Eastern warehouse, Dnipro',
  'Транзитний майданчик Київ': 'Transit yard, Kyiv',
  'Центральний склад Бровари': 'Central warehouse, Brovary',
};

const CHANNELS: Record<Locale, Record<string, string>> = {
  en: { offline: 'In store', web: 'Web', mobile: 'Mobile' },
  uk: { offline: 'Офлайн', web: 'Веб', mobile: 'Мобільний' },
};

export const STORE_TYPES: Record<Locale, Record<string, string>> = {
  en: { flagship: 'Flagship', standard: 'Standard', kiosk: 'Kiosk' },
  uk: { flagship: 'Флагман', standard: 'Стандартний', kiosk: 'Кіоск' },
};

export const MONTHS: Record<Locale, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  uk: ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'],
};

const translate = (map: Record<string, string>) => (lang: Locale, name: string) =>
  lang === 'uk' ? name : (map[name] ?? name);

export const categoryGroup = translate(CATEGORY_GROUPS);
export const productCategory = translate(PRODUCT_CATEGORIES);
export const region = translate(REGIONS);
export const warehouse = translate(WAREHOUSES);
export const channel = (lang: Locale, name: string) => CHANNELS[lang][name] ?? name;

/** "ТЦ Київ №10" stays as is in Ukrainian and becomes "Kyiv #10" in English. */
export function store(lang: Locale, name: string, city: string): string {
  if (lang === 'uk') return name;
  const number = /№(\d+)/.exec(name)?.[1];
  return `${CITIES[city] ?? city} #${number}`;
}
