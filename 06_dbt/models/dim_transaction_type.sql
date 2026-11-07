select distinct md5(o.channel || '|' || o.payment_method || '|' || o.order_type) as transaction_type_key, o.channel, o.order_type, o.payment_method
from {{ source('src', 'orders') }} o