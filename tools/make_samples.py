"""Build the sample files shown on AnyPage's welcome screen (src/samples/)."""
import datetime as dt
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "samples"
OUT.mkdir(parents=True, exist_ok=True)

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]
REGIONS = ["Central", "Eastern", "Western", "Northern"]
SALES = {
    "Central": [412, 398, 455, 470, 488, 501, 476, 520, 538],
    "Eastern": [365, 372, 390, 401, 395, 420, 433, 441, 459],
    "Western": [298, 310, 305, 322, 340, 351, 347, 362, 371],
    "Northern": [188, 195, 201, 199, 214, 220, 231, 228, 240],
}


def make_pdf():
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.graphics.shapes import Drawing, String, Rect
    from reportlab.graphics.charts.barcharts import VerticalBarChart

    path = OUT / "Quarterly Report.pdf"
    doc = SimpleDocTemplate(str(path), pagesize=A4, title="Quarterly Sales Report Q3 2026",
                            author="AnyPage sample", leftMargin=20 * mm, rightMargin=20 * mm)
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], alignment=0, fontSize=22, spaceAfter=6)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=10.5, leading=15)
    story = [
        Paragraph("Quarterly Sales Report", h1),
        Paragraph("Q3 2026 &middot; Sample document for AnyPage", ss["Italic"]),
        Spacer(1, 10),
        Paragraph("Summary", ss["Heading2"]),
        Paragraph("Sales grew in every region during the third quarter. The Central region "
                  "passed 500 thousand for the first time in August, while the Northern region "
                  "kept its steady climb. This sample shows how AnyPage displays a typical "
                  "report: text you can select and copy, tables, a chart and several pages.", body),
        Spacer(1, 8),
    ]
    q3 = [sum(SALES[r][6:9]) for r in REGIONS]
    q2 = [sum(SALES[r][3:6]) for r in REGIONS]
    rows = [["Region", "Q2 (thousands)", "Q3 (thousands)", "Change"]]
    for r, a, b in zip(REGIONS, q2, q3):
        rows.append([r, f"{a:,}", f"{b:,}", f"{(b - a) / a:+.1%}"])
    rows.append(["Total", f"{sum(q2):,}", f"{sum(q3):,}", f"{(sum(q3) - sum(q2)) / sum(q2):+.1%}"])
    t = Table(rows, colWidths=[45 * mm, 38 * mm, 38 * mm, 30 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2856c4")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f1f4f9")]),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#1a1e26")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [t, Spacer(1, 16), Paragraph("Monthly sales by region", ss["Heading2"])]

    d = Drawing(170 * mm, 70 * mm)
    ch = VerticalBarChart()
    ch.x, ch.y, ch.width, ch.height = 12 * mm, 10 * mm, 150 * mm, 55 * mm
    ch.data = [SALES[r] for r in REGIONS]
    ch.categoryAxis.categoryNames = MONTHS
    ch.valueAxis.valueMin = 0
    ch.valueAxis.valueMax = 600
    ch.valueAxis.valueStep = 100
    palette = ["#2856c4", "#1f7a4a", "#b0621b", "#7a4bb5"]
    for i, c in enumerate(palette):
        ch.bars[i].fillColor = colors.HexColor(c)
        ch.bars[i].strokeColor = None
    d.add(ch)
    for i, (r, c) in enumerate(zip(REGIONS, palette)):
        d.add(Rect(14 * mm + i * 36 * mm, 1.6 * mm, 3 * mm, 3 * mm, fillColor=colors.HexColor(c), strokeColor=None))
        d.add(String(18.5 * mm + i * 36 * mm, 2 * mm, r, fontSize=8))
    story += [d, PageBreak(), Paragraph("Notes by region", ss["Heading2"])]
    notes = {
        "Central": "Strong retail demand and two new distribution partners.",
        "Eastern": "Recovered after a slow May; online orders rose each month.",
        "Western": "Flat in March, then steady growth through the quarter.",
        "Northern": "Smallest region but the most consistent month-on-month gains.",
    }
    for r in REGIONS:
        story += [Paragraph(r, ss["Heading3"]), Paragraph(notes[r] + " " + (
            "Each region's figures come from the monthly sales extract and are rounded to the "
            "nearest thousand. Returns are already deducted. ") * 3, body)]
    story += [PageBreak(), Paragraph("Method", ss["Heading2"]),
              Paragraph("Figures were taken from the sales data warehouse on 1 October 2026. "
                        "Learn more about AnyPage at "
                        '<link href="https://github.com" color="#2856c4"><u>github.com</u></link>.', body)]
    for i in range(14):
        story.append(Paragraph(f"{i + 1}. This page is here so you can try scrolling, the page counter "
                               "and zoom on a multi-page PDF.", body))
    doc.build(story)
    return path


def make_docx():
    from docx import Document
    from docx.shared import Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    path = OUT / "Meeting Notes.docx"
    d = Document()
    d.core_properties.title = "Project kickoff meeting notes"
    d.add_heading("Project kickoff: AnyPage", 0)
    p = d.add_paragraph()
    p.add_run("Date: ").bold = True
    p.add_run("13 October 2026    ")
    p.add_run("Attendees: ").bold = True
    p.add_run("Product, Engineering, Design")

    d.add_heading("Goals", level=1)
    for g in ["One free app that opens PDF, Word, Excel, text and images",
              "Windows and Android from a single codebase",
              "No ads, no account, works offline"]:
        d.add_paragraph(g, style="List Bullet")

    d.add_heading("Decisions", level=1)
    para = d.add_paragraph("We agreed to start with a ")
    r = para.add_run("reader first")
    r.bold = True
    para.add_run(" and add editing later, one format at a time. The name ")
    r = para.add_run("AnyPage")
    r.italic = True
    r.font.color.rgb = RGBColor(0x28, 0x56, 0xC4)
    para.add_run(" was chosen because it was free and easy to search for.")

    d.add_heading("Action items", level=1)
    table = d.add_table(rows=1, cols=3)
    table.style = "Light Grid Accent 1"
    hdr = table.rows[0].cells
    hdr[0].text, hdr[1].text, hdr[2].text = "Task", "Owner", "Due"
    for task, owner, due in [
        ("Build the core viewer", "Engineering", "20 Oct"),
        ("Test on Windows and the S25 Ultra", "Product", "27 Oct"),
        ("Set up GitHub builds", "Engineering", "3 Nov"),
        ("Pick an open-source licence", "Product", "3 Nov"),
    ]:
        c = table.add_row().cells
        c[0].text, c[1].text, c[2].text = task, owner, due

    d.add_heading("Next meeting", level=1)
    q = d.add_paragraph("Monday, 20 October 2026 at 10:00. Bring sample files that other apps struggle with.")
    q.alignment = WD_ALIGN_PARAGRAPH.LEFT
    for run in q.runs:
        run.font.size = Pt(11)
    d.save(path)
    return path


def make_xlsx():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    path = OUT / "Sales 2026.xlsx"
    wb = Workbook()
    ws = wb.active
    ws.title = "Monthly"
    ws.merge_cells("A1:F1")
    ws["A1"] = "Monthly sales by region, 2026 (SAR thousands)"
    ws["A1"].font = Font(bold=True, size=13)
    head = ["Month", *REGIONS, "Total"]
    fill = PatternFill("solid", fgColor="2856C4")
    for i, h in enumerate(head, 1):
        c = ws.cell(row=3, column=i, value=h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = fill
        c.alignment = Alignment(horizontal="center")
    for m in range(9):
        r = 4 + m
        ws.cell(row=r, column=1, value=dt.date(2026, m + 1, 1)).number_format = "mmm yyyy"
        total = 0
        for j, reg in enumerate(REGIONS):
            v = SALES[reg][m] * 1000 + (m * 37 + j * 11) % 1000
            total += v
            ws.cell(row=r, column=2 + j, value=v).number_format = "#,##0"
        c = ws.cell(row=r, column=6, value=total)
        c.number_format = "#,##0"
        c.font = Font(bold=True)
    r = 13
    ws.cell(row=r, column=1, value="Total").font = Font(bold=True)
    for col in range(2, 7):
        s = sum(ws.cell(row=x, column=col).value for x in range(4, 13))
        c = ws.cell(row=r, column=col, value=s)
        c.number_format = "#,##0"
        c.font = Font(bold=True)
        c.fill = PatternFill("solid", fgColor="E8EEFB")
    ws.cell(row=15, column=1, value="Updated")
    ws.cell(row=15, column=2, value=dt.datetime(2026, 10, 1, 9, 30)).number_format = "d mmm yyyy h:mm"
    ws.column_dimensions["A"].width = 14
    for col in range(2, 7):
        ws.column_dimensions[get_column_letter(col)].width = 13

    ws2 = wb.create_sheet("Growth")
    ws2.append(["Region", "Q2", "Q3", "Growth", "On target"])
    for cell in ws2[1]:
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="DFF0E6")
    for reg in REGIONS:
        q2 = sum(SALES[reg][3:6]) * 1000
        q3 = sum(SALES[reg][6:9]) * 1000
        ws2.append([reg, q2, q3, (q3 - q2) / q2, (q3 - q2) / q2 > 0.05])
    for row in ws2.iter_rows(min_row=2):
        row[1].number_format = row[2].number_format = '"SAR "#,##0'
        row[3].number_format = "0.0%"
    for col, w in zip("ABCDE", [14, 16, 16, 10, 11]):
        ws2.column_dimensions[col].width = w

    ws3 = wb.create_sheet("Notes")
    ws3["A1"] = "This workbook is a sample for AnyPage."
    ws3["A2"] = "It has merged cells, number and date formats, colours, and three sheets."
    ws3.column_dimensions["A"].width = 70
    wb.save(path)
    return path


SQL = """-- Monthly sales by region, with running total and month-on-month change
-- Sample file for AnyPage

WITH monthly AS (
    SELECT
        r.RegionName,
        DATEFROMPARTS(YEAR(s.OrderDate), MONTH(s.OrderDate), 1) AS MonthStart,
        SUM(s.Quantity * s.UnitPrice) AS SalesAmount
    FROM dbo.FactSales AS s
    INNER JOIN dbo.DimRegion AS r
        ON r.RegionKey = s.RegionKey
    WHERE s.OrderDate >= '2026-01-01'
      AND s.OrderDate <  '2026-10-01'
      AND s.IsReturned = 0
    GROUP BY
        r.RegionName,
        DATEFROMPARTS(YEAR(s.OrderDate), MONTH(s.OrderDate), 1)
)
SELECT
    RegionName,
    FORMAT(MonthStart, 'MMM yyyy') AS [Month],
    SalesAmount,
    SUM(SalesAmount) OVER (
        PARTITION BY RegionName
        ORDER BY MonthStart
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS RunningTotal,
    CAST(
        (SalesAmount - LAG(SalesAmount) OVER (PARTITION BY RegionName ORDER BY MonthStart))
        / NULLIF(LAG(SalesAmount) OVER (PARTITION BY RegionName ORDER BY MonthStart), 0)
        AS DECIMAL(9, 4)
    ) AS MonthOnMonth
FROM monthly
ORDER BY RegionName, MonthStart;
"""


def make_sql():
    path = OUT / "monthly_sales.sql"
    path.write_text(SQL, encoding="utf-8")
    return path


if __name__ == "__main__":
    for f in (make_pdf, make_docx, make_xlsx, make_sql):
        p = f()
        print(f"{p.name}: {p.stat().st_size:,} bytes")
