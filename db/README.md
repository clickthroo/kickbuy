# Database migrations

KickBuy touches two Postgres databases. Migrations are applied by hand
(Supabase SQL editor or the Supabase MCP `apply_migration`), in file order.

| Folder | Database | What it does |
|---|---|---|
| `kickio/` | Kickio (`rlveellvebfzgyobceru`) | Read-only interface: the `kickbuy` schema of views, and the `kickbuy_reader` role that can only read them. **Additive only. Never alters Kickio tables.** |
| `kickbuy/` | KickBuy (`ovbqruuzquxidgnbbnxo`) | The `kickbuy` schema: users/roles, settings, opportunities, price snapshots, scan runs, alerts, user actions, and the `kickbuy_app` role. |

## What KickBuy can see in Kickio

| View | Rows | Notes |
|---|---|---|
| `kickbuy.inventory` | Football-shirt listings that are `active`, `reserved` or `pending` (the review queue, including approved listings in photo prep) | Identity attributes come from the linked product when there is one, else from the listing. No seller or buyer details beyond `seller_id`. |
| `kickbuy.sales` | Valid sales from `sales_history` | Approved, not excluded or dismissed, price > 0, shirts only. Kickio marketplace sales are dropped when the listing's latest paid order was cancelled, refunded, disputed or charged back. Price is the item price: no postage, fees or tax. |
| `kickbuy.team_names` | Team names and aliases | For matching "Spurs" to "Tottenham Hotspur". |
| `kickbuy.exchange_rates` | Kickio's current FX rates | KickBuy keeps dated copies in `kickbuy.fx_rates`. |

## Role passwords

Both login roles are created without a password. Set one from a
SCRAM-SHA-256 verifier so the plaintext never appears in SQL history:

```sh
python3 - <<'PY'
import base64, hashlib, hmac, os, secrets
pw = secrets.token_urlsafe(32); salt = os.urandom(16); i = 4096
k = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, i)
ck = hmac.new(k, b"Client Key", hashlib.sha256).digest()
sk = hmac.new(k, b"Server Key", hashlib.sha256).digest()
b = lambda x: base64.b64encode(x).decode()
print("password:", pw)
print(f"verifier: SCRAM-SHA-256${i}:{b(salt)}${b(hashlib.sha256(ck).digest())}:{b(sk)}")
PY
```

```sql
alter role kickbuy_reader password '<verifier>';   -- in Kickio
alter role kickbuy_app password '<verifier>';      -- in KickBuy
```

Put the plaintext passwords only in Vercel (`KICKIO_DB_PASSWORD` /
`KICKBUY_DB_PASSWORD`, type *sensitive*).

## Giving KickBuy more Kickio data

Add or change a view in `kickbuy` in a new `kickio/000N_*.sql` migration,
exposing only the rows and columns needed. Don't grant the reader anything
outside the `kickbuy` schema. Update `test/kickio-stub.sql` to match so the
integration test keeps covering the views.
