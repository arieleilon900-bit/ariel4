"""בונה גיליון שליחת וואטסאפ אישית לקליניקות מתוך רשימת הלידים.
הרצה: python3 build_whatsapp_sheet.py <קובץ-לידים.xlsx> <קובץ-פלט.xlsx>"""
import sys, re, urllib.parse, openpyxl
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.worksheet.datavalidation import DataValidation

MSG = (
    "פרסומת: עונה ראשון\n"
    "היי, כאן אריאל 👋 ראיתי את {name} ב{city}.\n"
    "כשלקוחה כותבת לך בוואטסאפ ואת באמצע טיפול, מי עונה לה?\n"
    "אנחנו בונים בוט וואטסאפ חכם שעונה תוך שניות, 24/7, ושולח לך סיכום מסודר של כל פנייה.\n"
    "רוצה שאשלח פרטים ודוגמה קצרה?\n"
    "לא רלוונטי? כתבי \"הסר\" ולא נפנה שוב."
)

src, out = sys.argv[1], sys.argv[2]
ws_in = openpyxl.load_workbook(src)["קליניקות"]
leads = []
for r in ws_in.iter_rows(min_row=2, values_only=True):
    num, _, name, city, area, phone = r[:6]
    if not (num and name and phone):
        continue
    digits = re.sub(r"\D", "", str(phone))
    intl = "972" + digits[1:] if digits.startswith("0") else digits
    if not re.fullmatch(r"9725\d{8}", intl):
        print("דילגתי (לא נייד):", name, phone)
        continue
    leads.append((num, name.strip(), city, area, phone, intl))

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "שליחה"
ws.sheet_view.rightToLeft = True
heads = ["#", "שם המכון", "עיר", "אזור", "טלפון", "לחץ לשליחה", "סטטוס", "תאריך", "הערות", "ההודעה"]
ws.append(heads)
for c in ws[1]:
    c.font = Font(bold=True, color="FFFFFF")
    c.fill = PatternFill("solid", fgColor="1F6F5C")
    c.alignment = Alignment(horizontal="center")
yellow = PatternFill("solid", fgColor="FFF2CC")
statuses = ["לא נשלח", "נשלח", "ענתה - מעוניינת", "ענתה - לא עכשיו", "ביקשה הסר", "המספר לא בוואטסאפ"]
dv = DataValidation(type="list", formula1='"' + ",".join(statuses) + '"', allow_blank=True)
ws.add_data_validation(dv)
longest = 0
for i, (num, name, city, area, phone, intl) in enumerate(leads, start=2):
    msg = MSG.format(name=name, city=city)
    url = f"https://wa.me/{intl}?text=" + urllib.parse.quote(msg)
    longest = max(longest, len(url))
    ws.append([num, name, city, area, phone, "📲 שלח", "לא נשלח", None, None, msg])
    link = ws.cell(i, 6)
    link.hyperlink = url
    link.font = Font(color="0563C1", underline="single", bold=True)
    for col in (7, 8, 9):
        ws.cell(i, col).fill = yellow
    dv.add(ws.cell(i, 7))
    ws.cell(i, 10).alignment = Alignment(wrap_text=True, vertical="top")
for col, w in zip("ABCDEFGHIJ", [5, 26, 14, 9, 14, 11, 18, 11, 22, 60]):
    ws.column_dimensions[col].width = w
ws.freeze_panes = "C2"

g = wb.create_sheet("איך עובדים")
g.sheet_view.rightToLeft = True
g.column_dimensions["A"].width = 95
for line in [
    "איך שולחים (בערך 10 שניות לכל מכון)",
    "1. לוחצים על \"📲 שלח\" בשורה של המכון. הווטסאפ נפתח עם ההודעה כבר כתובה.",
    "2. בודקים שהיא נראית טוב ולוחצים שליחה בווטסאפ.",
    "3. חוזרים לקובץ ומשנים את הסטטוס ל\"נשלח\" ואת התאריך.",
    "",
    "כללים חשובים",
    "• כל מכון מקבל הודעה אחת בלבד. מי שלא ענתה: לא שולחים שוב.",
    "• מי שכתבה \"הסר\": לא פונים אליה יותר אף פעם. משנים סטטוס ל\"ביקשה הסר\".",
    "• עד 20-25 הודעות ביום, לא כולן ברצף. כך הווטסאפ לא חוסם את המספר.",
    "• שולחים בימים א'-ה' בין 9:00 ל-19:00. לא בשישי, בשבת ובחגים.",
    "• המילה \"פרסומת\" בראש ההודעה ואפשרות \"הסר\" הן דרישה של החוק. לא מוחקים אותן.",
    "• מי שענתה \"מעוניינת\": מעבירים לשיחה לפי התסריט (sales-script-clinics.pdf).",
]:
    g.append([line])
for r in (1, 6):
    g.cell(r, 1).font = Font(bold=True, size=13)
wb.move_sheet(g, offset=-1)
wb.active = 0
wb.save(out)
print(f"{len(leads)} מכונים, הקישור הארוך ביותר: {longest} תווים")
