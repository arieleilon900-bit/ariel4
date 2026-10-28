// בוט המכירות של עונה ראשון: עונה לבעלי מקצוע שכותבים למספר של עונה ראשון (ממודעה או מכל מקום).
// ההנחיה: sales-bot-prompt-v3.md של אליה (sales-prompt.js נוצר ממנה: node scripts/build-sales-prompt.mjs clients/oneh-rishon-sales).
// קישור התשלום, מחיר ההקמה והמקדמה ב-wrangler.toml (PAYMENT_LINK, SALES_SETUP_PRICE, SALES_DEPOSIT), לא בקוד.
import prompt from './sales-prompt.js';

export default {
  business: {
    name: 'עונה ראשון', shortName: 'עונה ראשון', ownerName: 'אליה ואריאל', trade: 'מזכירה בוואטסאפ לבעלי מקצוע',
    voiceHint: 'הודעה קולית לעונה ראשון, מזכירה בוואטסאפ לבעלי מקצוע: אינסטלטור, חשמלאי, מנעולן, מזגנים, נזילה, סתימה, הצפה, כתובת, מחיר.',
  },
  sales: {
    prompt,
    setupPrice: '3,500',
    deposit: '500',
    // אחרי 24 שעות מותר רק תבנית מאושרת, ורק למי שכתב שמותר לכתוב לו
    templates: [
      { name: 'sales_followup_v1', category: 'MARKETING', body: 'היי, כאן עונה ראשון. אמרת שאפשר לכתוב לך: עדיין רלוונטי לך לשמוע על המזכירה בוואטסאפ? להסרה השב הסר' },
    ],
  },
};
