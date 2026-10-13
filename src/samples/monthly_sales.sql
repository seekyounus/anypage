-- Monthly sales by region, with running total and month-on-month change
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
