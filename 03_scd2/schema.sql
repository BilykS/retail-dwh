alter table star.dim_product add column valid_from date;
alter table star.dim_product add column valid_to   date;
alter table star.dim_product add column is_current boolean;
alter table star.dim_product drop constraint dim_product_product_id_key;
alter table star.dim_product drop constraint dim_product_sku_key;
alter table star.dim_product add  constraint dim_product_nk unique (product_id, valid_from);  