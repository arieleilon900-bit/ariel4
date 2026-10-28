-- בוט המכירות של עונה ראשון: שורה לכל בעל מקצוע שכתב (מצב השיחה, מקור המודעה, מעקבים והתראות)
CREATE TABLE IF NOT EXISTS sales_leads (
  phone TEXT PRIMARY KEY,
  stage TEXT,
  referral TEXT,
  name TEXT, trade TEXT, city TEXT, business_name TEXT,
  weekly_unanswered TEXT, job_value TEXT,
  onboarding TEXT,
  status TEXT,
  demo_at TEXT, price_at TEXT,
  hot_sent_at TEXT, paid_at TEXT, done_sent_at TEXT, handoff_at TEXT,
  followup_ok_at TEXT,
  fu_demo_at TEXT, fu_price_at TEXT, fu_day3_at TEXT,
  opted_out INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT
);
