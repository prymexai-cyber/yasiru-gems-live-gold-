# YASIRU GEMS Gold Rate 💎

ශ්‍රී ලංකාවේ අද රන් මිල (24K, 22K, 21K, 18K පවුම), රිදී ග්‍රෑම් එක, ප්ලැටිනම් පවුම, සහ මුදල් වර්ග 10 — දවස පුරා auto update වෙනවා.

- **රන්:** ලංකාවේ market මිල — විනාඩි 30න් 30ට auto check කරනවා (මූලාශ්‍ර කිහිපයක මැද අගය)
- **රිදී / ප්ලැටිනම් / මුදල්:** ලෝක වෙළඳපොළ — විනාඩි 5න් 5ට
- Light / Dark theme දෙකම

## Render Environment
| Variable | Default | තේරුම |
|---|---|---|
| `ADMIN_KEY` | — | `/admin` page එකේ password |
| `SHOP_REFRESH_MINUTES` | `30` | රන් මිල check කරන වාර |
| `REFRESH_MINUTES` | `5` | රිදී/ප්ලැටිනම්/මුදල් |
| `CURRENCIES` | `usd,eur,gbp,aud,cad,jpy,inr,aed,sar,kwd` | මුදල් වර්ග 10 |

## /admin
- අද මිල අතින් දාන්න (auto මිල වැරදි නම්) — අද දවසට විතරයි
- "දැන් check කරන්න" — මිල ගන්න හැම මූලාශ්‍රයක්ම හරියට වැඩද බලන්න

රන් මිල ගන්න මූලාශ්‍ර `shops.js` එකේ තියෙන්නේ (site එකේ පෙන්නන්නේ නැහැ).

## Local
```bash
npm run dev   # demo data
npm start     # real data
```
