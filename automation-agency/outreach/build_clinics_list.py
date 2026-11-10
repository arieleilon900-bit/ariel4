"""בונה רשימת פנייה חדשה לקליניקות: לידים חדשים מדפי זהב + מי שעוד לא פנינו אליה ברשימה הקודמת.
פלט: גיליון מעקב (xlsx) + דף שליחה עם כפתור לכל מכון (html, ממנו מפיקים PDF).
הרצה: python3 build_clinics_list.py <רשימה-קודמת.xlsx> <לידים-גולמיים.txt> <תיקיית-פלט>"""
import sys, re, html, urllib.parse, openpyxl
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.worksheet.datavalidation import DataValidation

FEMALE = ("אביבית אדוה אולגה אולה אורטל אורית אורלי אורין איריס אירית אילנה אילנית אלאונורה אלבינה אלונה אלמוג "
          "אמה אנה אסנת אסתי אפרת אתי בת-אל בתיה גאולה גילי גלית דבורה דיאנה דנה הילה הלן ויקי ורד זהבה חגית חנה "
          "חני טטיאנה טל יאנה יוליה יעל יערית יפה ירדן ליאת ליהי לימור לין לנה מאיה מיטל מיכל מירב מירי מירית מעיין "
          "משי נאווה נורית נטלי נטשה נליה נעמי סבטלנה סיגלית סימה ספיר עדי עדינה ענבל ענת צפרא ציפי קים קרין קרן "
          "קריסטין רבקה רויטל רונה רונית רות רותם רחל ריקי רינת שגיא שושי שירן שיראל שלומית שני שרה שרונה שרית "
          "תמי תמר ליקה").split()
LATIN = {"shiran": "שירן", "revital": "רויטל", "svetlana": "סבטלנה", "albina": "אלבינה", "keren": "קרן",
         "michal": "מיכל", "kristin": "קריסטין", "lika": "ליקה", "irina": "אירינה", "tzipi": "ציפי", "adi": "עדי"}
MALE = {"רפאל", "ראיד", "גו'זף", "זמיר"}

def first_name(biz):
    words = re.findall(r"[\w'\"-]+", biz)
    for w in words:
        if w in MALE:
            return w, "ז"
    for w in words:
        if w in FEMALE:
            return w, "נ"
        if w.lower() in LATIN:
            return LATIN[w.lower()], "נ"
    if "לגברים" in biz:
        return "", "ז"
    return "", "נ"

def biz_type(biz):
    b = biz.lower()
    if "לייזר" in b or "ליזר" in b or "laser" in b or "lazer" in b:
        return "מכון לייזר"
    if any(w in b for w in ("הסרת שיער", "הסרת שער", "אפילציה", "שעווה", "הסרות שיער", "epil")):
        return "מכון להסרת שיער"
    if any(w in b for w in ("קוסמטי", "cosmetic", "אסתטי", "aesthetic", "esthetic", "estetic", "אסטטי")):
        return "מכון קוסמטיקה"
    if "clinic" in b or "קליניק" in b or "medical" in b or "מדיק" in b:
        return "קליניקה"
    return "מכון להסרת שיער"  # כל הרשימה נאספה מקטגוריית "הסרת שיער" בדפי זהב

def message(name, g, kind="מכון יופי", city=""):
    f = g == "נ"
    t = lambda fem, male: fem if f else male
    where = f" ב{city}" if city else ""
    hi = f"מה נשמע {name}? 😊" if name else "מה נשמע? 😊"
    return (
        "פרסומת | עונה ראשון\n"
        f"{hi}\n"
        f"הבנתי שיש לך {kind}{where}.\n"
        "לי קוראים אריאל אילון, ואני בונה מזכירה חכמה בוואטסאפ למכונים כמו שלך.\n\n"
        f"היא עונה לכל לקוחה שכותבת לך תוך שניות, גם {t('כשאת', 'כשאתה')} באמצע טיפול, בערב או בסוף השבוע. "
        "היא עונה על השאלות שחוזרות על עצמן (איך הטיפול עובד, כמה זמן הוא לוקח, איפה המכון), "
        f"אוספת את הפרטים ושולחת לך סיכום מסודר. {t('את רק חוזרת', 'אתה רק חוזר')} ללקוחה שכבר מוכנה לקבוע.\n\n"
        "למה זה חשוב? לקוחה שלא מקבלת תשובה מהר בדרך כלל כותבת גם למכון אחר. "
        "מי שעונה ראשון, מקבל את הלקוחה.\n\n"
        f"אם זה נשמע לך רלוונטי, {t('תכתבי', 'תכתוב')} לי \"מעניין\" ואשלח לך סרטון של 20 שניות שמראה בדיוק איך זה עובד.\n"
        f"(לא רלוונטי? {t('כתבי', 'כתוב')} \"הסר\" ולא אפנה שוב)"
    )

def intl(phone):
    d = re.sub(r"\D", "", str(phone))
    d = "972" + d[1:] if d.startswith("0") else d
    return d if re.fullmatch(r"9725\d{8}", d) else None

old_xlsx, raw_txt, outdir = sys.argv[1:4]
leads, seen = [], set()
ws_old = openpyxl.load_workbook(old_xlsx)["קליניקות"]
old_phones = set()
for r in ws_old.iter_rows(min_row=2, values_only=True):
    num, _, name, city, area, phone = r[:6]
    status = r[9]
    if not (num and name and phone):
        continue
    p = intl(phone)
    if p: old_phones.add(p)
    if status == "לא התקשרתי" and p and p not in seen:
        seen.add(p); leads.append(dict(src="רשימה קודמת (לא פנינו)", name=name.strip(), city=city, phone=phone, intl=p))
new_count = 0
for line in open(raw_txt, encoding="utf-8"):
    if line.startswith("#") or "|" not in line:
        continue
    name, city, phone = [x.strip() for x in line.split("|")]
    p = intl(phone)
    if not p or p in seen:
        continue
    seen.add(p); new_count += 1
    leads.append(dict(src="חדש (דפי זהב)", name=name, city=city, phone=phone, intl=p))
for i, l in enumerate(leads, 1):
    l["n"] = i
    l["first"], l["g"] = first_name(l["name"])
    l["kind"] = biz_type(l["name"])
    l["msg"] = message(l["first"], l["g"], l["kind"], l["city"])
    l["url"] = f"https://web.whatsapp.com/send?phone={l['intl']}&text=" + urllib.parse.quote(l["msg"])

# ---- גיליון לגוגל שיטס ----
wb = openpyxl.Workbook()
ws = wb.active; ws.title = "רשימה"; ws.sheet_view.rightToLeft = True
heads = ["#", "שם המכון", "עיר", "טלפון", "שם לפנייה", "סטטוס", "תאריך שליחה", "הערות", "קישור שליחה", "ההודעה", "מקור"]
ws.append(heads)
for c in ws[1]:
    c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="1F6F5C")
yellow = PatternFill("solid", fgColor="FFF2CC")
statuses = ["לא נשלח", "נשלח", "ענתה - מעוניינת", "ענתה - לא עכשיו", "ביקשה הסר", "לא בוואטסאפ", "דילגנו"]
dv = DataValidation(type="list", formula1='"' + ",".join(statuses) + '"', allow_blank=True)
ws.add_data_validation(dv)
for i, l in enumerate(leads, 2):
    ws.append([l["n"], l["name"], l["city"], l["phone"], l["first"], "לא נשלח", None, None, l["url"], l["msg"], l["src"]])
    for col in (5, 6, 7, 8):
        ws.cell(i, col).fill = yellow
    dv.add(ws.cell(i, 6))
for col, w in zip("ABCDEFGHIJK", [5, 34, 14, 14, 12, 18, 13, 24, 30, 60, 22]):
    ws.column_dimensions[col].width = w
ws.freeze_panes = "C2"
wb.save(f"{outdir}/רשימת קליניקות - לגוגל שיטס.xlsx")

# ---- דף שליחה ----
rows = "\n".join(
    f'<div class="card"><div class="top"><span class="n">#{l["n"]}</span>'
    f'<span class="nm">{html.escape(l["name"])}</span><span class="ct">{html.escape(str(l["city"]))}</span></div>'
    f'<a class="btn" href="{html.escape(l["url"].replace("https://web.whatsapp.com/send?phone=", "https://wa.me/").replace("&text=", "?text=", 1))}">שלח בוואטסאפ ל{html.escape(l["first"] or "מכון")}</a></div>'
    for l in leads)
sample = html.escape(leads[0]["msg"]).replace("\n", "<br>")
open(f"{outdir}/send-page.html", "w", encoding="utf-8").write(f"""<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>@page{{size:A4;margin:12mm}}body{{font-family:Arial,sans-serif;color:#1d2b27;font-size:12px}}
h1{{font-size:20px;margin:0 0 4px;color:#1F6F5C}}.sub{{margin:0 0 10px;color:#555}}
.sample{{border:1px solid #cfe3dc;background:#f3faf7;border-radius:8px;padding:10px;margin-bottom:12px;line-height:1.5}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:6px}}
.card{{border:1px solid #ddd;border-radius:8px;padding:6px 8px;break-inside:avoid}}
.top{{display:flex;gap:6px;align-items:baseline}}.n{{color:#888}}.nm{{font-weight:bold;flex:1}}.ct{{color:#666}}
.btn{{display:block;margin-top:5px;background:#25D366;color:#fff;text-align:center;padding:6px;border-radius:6px;text-decoration:none;font-weight:bold}}
</style></head><body><h1>דף שליחה: {len(leads)} קליניקות</h1>
<p class="sub">לוחצים על הכפתור הירוק, הווטסאפ נפתח עם הודעה אישית מוכנה, ולוחצים שליחה. עד 20-25 ביום. אחרי כל שליחה מעדכנים את הסטטוס בקובץ המעקב.</p>
<div class="sample"><b>ככה נראית ההודעה (דוגמה):</b><br>{sample}</div>
<div class="grid">{rows}</div></body></html>""")
named = sum(1 for l in leads if l["first"])
print(f"סה\"כ {len(leads)}: {new_count} חדשים, {len(leads)-new_count} מהרשימה הקודמת. עם שם פרטי: {named}")
