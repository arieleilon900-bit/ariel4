// דף הניסיון: במקום גוגל שיטס, השורה מוצגת בטבלה בדף.
export async function appendRow(env, values) {
  env.onSheetRow?.(values);
  return true;
}
export async function getAccessToken() { return 'sim'; }
export async function ensureHeader() { return 'exists'; }
