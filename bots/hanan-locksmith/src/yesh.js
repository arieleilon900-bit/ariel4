// חיבור ל"יש חשבונית": שליפת מסמכים (קבלות) חדשים כדי לשלוח אותם ללקוח בוואטסאפ.
//
// ממתין לתיעוד ה-API מיש חשבונית. ברגע שיש תיעוד, ממלאים את fetchNewDocuments:
// היא צריכה להחזיר מסמכים שנוצרו אחרי `sinceIso`, כל אחד עם:
//   { id: מזהה המסמך, phone: הטלפון של הלקוח, pdfUrl: קישור ציבורי ל-PDF, customerName }
// עד אז היא מחזירה רשימה ריקה, ושאר המערכת עובדת כרגיל.

export async function fetchNewDocuments(env, sinceIso) {
  if (!env.YESH_API_KEY || !env.YESH_API_URL) return [];
  // TODO(יש חשבונית): לממש לפי התיעוד שחנן יקבל מהתמיכה שלהם.
  void sinceIso;
  return [];
}
